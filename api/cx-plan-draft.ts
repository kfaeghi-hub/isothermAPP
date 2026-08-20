// api/cx-plan-draft — the two-call AI endpoint for one narrative section.
//
//   POST { plan_id, section_key, note? }  → { prose, claims, flags }
//
// STAFF ONLY. requireProjectAccess already carries the explicit staff-role
// restriction added in the portal build, so a client or portal role cannot reach
// this at all — asserted by error code in pw-cx-plan, never by row count.
//
// TWO CALLS, deliberately:
//   1. DRAFT      — writes prose AND enumerates its own factual claims, each
//                   citing the fact key that supports it.
//   2. VERIFY     — a SEPARATE call with no memory of drafting, framed
//                   adversarially. A model asked to check its own output in the
//                   same context agrees with itself.
//
// THE DETERMINISTIC LAYER IS NEVER IN EITHER PROMPT. The team table, systems,
// deliverables and header are assembled after the prose returns
// (cx-plan-assembly). The model cannot invent a name because it is never given
// the opportunity.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
import { runAgent, logAgentRun, knowledgeVersion, AiError } from './_shared/ai-common.js'
import type { WriterOutput, VerifierOutput } from './_shared/agent-schemas.js'
import { SECTIONS } from './_shared/cx-plan-assembly.js'
import { liftOrRefuse, toPlainText } from './_shared/rich-text.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** What each narrative section is FOR. Kept here rather than in the corpus: the
 *  corpus holds firm knowledge, this holds the task. */
const INTENT: Record<string, string> = {
  background:  'Two to four sentences describing what is being built, where, and why now. Do not list systems — they are appended deterministically.',
  roles:       'One short line per participating company describing its responsibility. Use the company names supplied and no others.',
  process:     'Three to five sentences on how the commissioning process runs on this project: kickoff, protocol approval, execution, and the post-testing review meeting.',
  operational: 'Two to four sentences on what operational testing covers for this project.',
  ils:         'Two to four sentences on integrated life safety systems testing for this project.',
  tab:         'Two to four sentences on the testing, adjusting and balancing scope and Isotherm\'s verification role.',
  schedule:    'Three to five sentences on commissioning sequencing across the project phases supplied.',
}

// THE PER-SECTION BUDGET IS GONE, and that is the point of the refactor.
//
// This endpoint used to own a BUDGETS map — the artefact of a calibration failure
// where a ceiling sized for prose was spent entirely on reasoning. That number was
// never really a property of "the Roles section"; it was a property of the KIND of
// work the writer does. It now lives in firm-knowledge/agents/writer.md as
// `budget_class: prose`, and the runtime applies it.
//
// The retry logic went the same way: budget failure doubles the ceiling, parse
// failure re-asks with the JSON reminder — one implementation in runAgent rather
// than one per endpoint.

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const { plan_id, section_key, note } = req.body ?? {}
    if (!plan_id || !section_key) {
      return res.status(400).json({ error: 'plan_id and section_key required' })
    }
    const def = SECTIONS.find(s => s.key === section_key)
    if (!def || def.kind !== 'narrative') {
      return res.status(400).json({ error: 'not a narrative section' })
    }

    const { data: plan } = await service.from('cx_plans')
      .select('id, project_id, tier, status').eq('id', plan_id).maybeSingle()
    if (!plan) return res.status(404).json({ error: 'plan not found' })

    // Staff + project membership. requireProjectAccess refuses non-staff roles
    // outright, which is what keeps client/portal accounts off this endpoint.
    await requireProjectAccess(service, user.userId, plan.project_id)

    // An ISSUED plan is frozen (rule 4). Drafting into one is refused here, not
    // just hidden in the UI.
    if (plan.status === 'issued') {
      return res.status(409).json({ error: 'This plan is issued and cannot be redrafted.' })
    }

    // ── Facts. Everything the model is allowed to know. ────────────────────
    const [{ data: project }, { data: answers }, { data: team }, { data: equip }, { data: phases }] =
      await Promise.all([
        service.from('projects')
          .select('name, com_number, address, background_description, cx_role_designation, companies(name)')
          .eq('id', plan.project_id).maybeSingle(),
        service.from('cx_plan_answers')
          .select('question_key, answer').eq('project_id', plan.project_id)
          .eq('document_type', 'cx_plan'),
        service.from('project_team_assignments')
          .select('companies(name), company_role_types(name, abbreviation)')
          .eq('project_id', plan.project_id),
        service.from('equipment').select('category').eq('project_id', plan.project_id),
        service.from('project_phases').select('name').eq('project_id', plan.project_id).order('sort_order'),
      ])

    const facts: Record<string, unknown> = {
      project_name: project?.name,
      location: project?.address ?? undefined,
      client: (project as any)?.companies?.name ?? undefined,
      cx_role: project?.cx_role_designation === 'CxP'
        ? 'Commissioning Provider (CxP)' : 'Commissioning Authority (CxA)',
      background_description: project?.background_description ?? undefined,
      phases: (phases ?? []).map((p: any) => p.name),
      systems: [...new Set((equip ?? []).map((e: any) => e.category).filter(Boolean))],
      companies: [...new Set((team ?? []).map((t: any) => t.companies?.name).filter(Boolean))],
      ...Object.fromEntries((answers ?? []).map((a: any) => [a.question_key, a.answer])),
    }
    // Drop empties so an absent fact is genuinely ABSENT rather than a null the
    // model might narrate around.
    for (const k of Object.keys(facts)) {
      const v = facts[k]
      if (v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0)) delete facts[k]
    }

    const runId = randomUUID()

    // ── The writer agent ───────────────────────────────────────────────────
    // The endpoint no longer assembles context, picks a budget, or owns retry
    // logic. It states the TASK and the facts; the contract states everything
    // else. What the model never sees is enforced by what this input contains.
    const writerInput = {
      section_key, section_title: def.title, section_intent: INTENT[section_key],
      facts,
      steering_note: note || undefined,
    }
    const draft = await runAgent<WriterOutput>('writer', writerInput, {
      task: `Draft the "${def.title}" section. Return JSON only: ` +
            `{ "prose": string, "claims": [ { "text": string, "supported_by": string } ] }`,
      exemplar: plan.tier === 'tender' ? 'cx-plan-tender' : 'cx-plan-standard',
      feature: 'cx-plan',        // D5: the feature contract sits above the agents
    })
    await logAgentRun(service, {
      agentKey: 'writer', feature: 'cx-plan:draft', projectId: plan.project_id,
      run: draft, createdBy: user.userId, runId,
    })

    if (!draft.ok) {
      console.error(`[cx-plan-draft] ${section_key}: writer failed — ${draft.failure}`)
      const messages: Record<string, string> = {
        'contract-input':
          `The ${def.title} section could not be prepared for drafting. Nothing was saved.`,
        'contract-output':
          `The ${def.title} draft came back missing its prose. Nothing was saved.`,
        'thinking-overrun':
          `The ${def.title} draft used its whole budget reasoning and never began ` +
          `writing. Nothing was saved. Retry — if it recurs, this section has too ` +
          `many facts to weigh at once.`,
        truncated:
          `The ${def.title} draft ran past its length budget and was cut off. ` +
          `Nothing was saved. Try again, or shorten the facts this section draws on.`,
        unparseable:
          `The ${def.title} draft came back in a form we could not read, twice. ` +
          `Nothing was saved.`,
      }
      return res.status(502).json({
        error: messages[draft.failure!] ?? 'The draft could not be read. Nothing was saved.',
        reason: draft.failure, retryable: true,
      })
    }
    const parsed = draft.value!

    // ── The lift (RICH-TEXT Phase 1, ruled Q1) ────────────────────────────
    // The writer emits markdown-lite prose; the boundary lifts it into the
    // platform schema. liftOrRefuse is the ruled BOUNDARY REFUSAL: two
    // independent projections (toPlainText over the lifted tree vs a
    // positional token-strip) must agree, or nothing is stored.
    let liftedRich: ReturnType<typeof liftOrRefuse>
    try {
      liftedRich = liftOrRefuse(parsed.prose, 'cxplan')
    } catch (e: any) {
      console.error(`[cx-plan-draft] ${section_key}: lift refused — ${e.message}`)
      return res.status(502).json({
        error: `The ${def.title} draft used formatting the platform cannot carry, ` +
               `and lifting it would have lost content. Nothing was saved. Retry.`,
        reason: 'lift-refused', retryable: true,
      })
    }
    // The verifier reads THE PROJECTION — the same plain text every raw
    // consumer reads, and the text its string-quoted spans must quote.
    const projection = toPlainText(liftedRich, 'cxplan')

    // ── The verifier agent ────────────────────────────────────────────────
    // Isolation is now a DATA FACT, not a discipline at the call site:
    // verifier.md declares `slices: []`, so the runtime sends it an empty system
    // prompt. It cannot see the style card, the exemplars, or this endpoint's
    // framing — it sees the prose and the facts, which is the only question it is
    // being asked.
    const verify = await runAgent<VerifierOutput>('verifier',
      { prose: projection, facts },
      { task:
          'You are verifying a commissioning document for factual support. You did ' +
          'not write this text. Assume it contains errors. Flag every claim the ' +
          'supplied facts do not support, contradict, or leave vague. Return JSON ' +
          'only: { "flags": [ { "span": string, "claim": string, ' +
          '"severity": "unsupported"|"contradicted"|"vague", "why": string } ] }' },
    )
    await logAgentRun(service, {
      agentKey: 'verifier', feature: 'cx-plan:verify', projectId: plan.project_id,
      run: verify, createdBy: user.userId, runId,
    })

    // A VERIFICATION THAT FAILED IS NOT A VERIFICATION THAT PASSED. The contract
    // requires `flags` to be present even when empty, so "checked, found nothing"
    // and "the check did not run" cannot collapse into the same value. Fail closed:
    // discard the prose and say the check did not run.
    if (!verify.ok) {
      console.error(`[cx-plan-draft] ${section_key}: VERIFICATION ${verify.failure}`)
      return res.status(502).json({
        error: `The ${def.title} draft was written but could not be fact-checked, ` +
          `so nothing was saved. Try again — unchecked text is not worth keeping.`,
        reason: `verify-${verify.failure}`, retryable: true,
      })
    }
    const flags = verify.value!.flags

    // ── Persist the section's working state ────────────────────────────────
    const ordinal = SECTIONS.findIndex(s => s.key === section_key)
    await service.from('cx_plan_sections').upsert({
      plan_id, section_key, ordinal, kind: 'narrative',
      // drafted_text is THE PROJECTION from this phase on — maintained by the
      // trio, never stale, exactly what the verifier read and quoted spans of.
      drafted_text: projection, drafted_rich: liftedRich,
      flags, regenerate_note: note ?? null,
      // A redraft un-accepts the section: an approval applies to text a human
      // read, and this is not that text any more.
      accepted: false, final_rich: null,
    }, { onConflict: 'plan_id,section_key' })

    return res.status(200).json({
      prose: projection, rich: liftedRich, claims: parsed.claims ?? [], flags,
      knowledge_version: knowledgeVersion(),
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message })
    console.error('cx-plan-draft error:', err)
    return res.status(500).json({ error: err.message })
  }
}
