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
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
import {
  buildContext, callModel, logGeneration, parseModelJson,
  JSON_RETRY_REMINDER, knowledgeVersion, AiError,
} from './_shared/ai-common.js'
import { SECTIONS } from './_shared/cx-plan-assembly.js'

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

/**
 * PER-SECTION GENERATION BUDGET — thinking INCLUDED.
 *
 * `max_tokens` is the TOTAL generation budget, and on this model reasoning
 * dominates it. Measured on the failing Roles call: 4,929 thinking tokens
 * against 453 of actual answer. A budget sized for the prose is sized for about
 * eight per cent of what the call needs.
 *
 * That was the real defect behind the first calibration failure, and my first
 * fix got it wrong: I read "1200 output tokens, cut off mid-JSON" and reasoned
 * about prose length and the claims array, so I raised Roles to 3000 — which the
 * model spent entirely on thinking, emitting 2,998 reasoning tokens and NOT ONE
 * TEXT BLOCK. The raw response logged empty, which is what finally gave it away.
 *
 * These ceilings are generous on purpose: we are billed for what is used, not
 * for what is reserved, so the cost of headroom is zero and the cost of a
 * too-small ceiling is a failed section and a wasted call.
 */
function budgetFor(sectionKey: string): number {
  const BUDGETS: Record<string, number> = {
    background: 8000,
    roles: 10000,        // the only section that scales with the team matrix
    process: 8000,
    operational: 8000,
    ils: 8000,
    tab: 8000,
    schedule: 9000,
  }
  return BUDGETS[sectionKey] ?? 8000
}

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

    // ── Call 1: draft ──────────────────────────────────────────────────────
    const system = buildContext({
      feature: 'cx-plan',
      slices: ['identity', 'style', 'terminology', 'domain-rules', 'exemplar'],
      exemplar: plan.tier === 'tender' ? 'cx-plan-tender' : 'cx-plan-standard',
    })
    const userMsg = JSON.stringify({
      section_key, section_title: def.title, section_intent: INTENT[section_key],
      facts,
      steering_note: note || undefined,
      constraints: [
        'Use ONLY the facts provided. If a fact is absent, omit the claim — never estimate, never generalise, never emit a placeholder.',
        'Do not restate any table or list; those are rendered deterministically.',
        'Obey the modal discipline: shall = another party\'s obligation, will = Isotherm\'s intent, is/are = fact.',
        'Return JSON only: { "prose": string, "claims": [ { "text": string, "supported_by": string } ] }',
      ],
    })

    type Draft = { prose: string; claims: { text: string; supported_by: string }[] }
    const isDraft = (v: any): v is Draft =>
      !!v && typeof v.prose === 'string' && v.prose.trim().length > 0 &&
      (v.claims === undefined || Array.isArray(v.claims))

    // ONE automatic retry, matched to the failure — the two kinds have opposite
    // fixes:
    //
    //   a BUDGET failure retries AT DOUBLE THE CEILING. Retrying at the same
    //   ceiling buys the identical cut-off at the identical cost. Doubling makes
    //   the ceiling self-correcting rather than dependent on my estimate being
    //   right, which on the first calibration run it was not.
    //
    //   a PARSE failure retries at the SAME ceiling with a terse reminder. Most
    //   are fence-wrapping or stray commentary and clear on the second attempt;
    //   more room would not have helped.
    let budget = budgetFor(section_key)
    let draft = await callModel({ system, user: userMsg, maxTokens: budget })
    await logGeneration(service, {
      feature: 'cx-plan:draft', projectId: plan.project_id,
      result: draft, createdBy: user.userId,
    })
    let outcome = parseModelJson<Draft>(draft, isDraft)

    if (!outcome.ok) {
      const ranOutOfRoom =
        outcome.failure === 'truncated' || outcome.failure === 'thinking-overrun'
      console.warn(`[cx-plan-draft] ${section_key}: ${outcome.failure} — retrying once ` +
        `(${ranOutOfRoom ? `budget ${budget} -> ${budget * 2}` : 'same budget, JSON reminder'}).` +
        `\nRaw:\n` + String(outcome.raw ?? '').slice(0, 2000))
      if (ranOutOfRoom) budget *= 2
      draft = await callModel({
        system, user: ranOutOfRoom ? userMsg : userMsg + JSON_RETRY_REMINDER, maxTokens: budget,
      })
      await logGeneration(service, {
        feature: 'cx-plan:draft:retry', projectId: plan.project_id,
        result: draft, createdBy: user.userId,
      })
      outcome = parseModelJson<Draft>(draft, isDraft)
    }

    if (!outcome.ok) {
      // ALWAYS log the raw response. This is the diagnosis; without it the only
      // signal is a generic message and a guess. Server-side only — the raw text
      // never goes to a browser.
      console.error(`[cx-plan-draft] ${section_key}: ${outcome.failure} after retry. ` +
        `stop_reason=${draft.stopReason} output_tokens=${draft.outputTokens} ` +
        `thinking=${draft.thinkingTokens} blocks=${draft.blockTypes.join('+') || 'none'} ` +
        `budget=${budget}\nRAW:\n` + String(outcome.raw ?? '').slice(0, 4000))

      // A TRUNCATION IS ITS OWN ERROR, not a parse failure. They have different
      // fixes — one needs a bigger budget, the other a better prompt — and the
      // message must say which so a human is not left guessing.
      const messages: Record<string, string> = {
        'thinking-overrun':
          `The ${def.title} draft used its whole budget reasoning and never began ` +
          `writing. Nothing was saved. Retry — if it recurs, this section has too ` +
          `many facts to weigh at once.`,
        truncated:
          `The ${def.title} draft ran past its length budget and was cut off ` +
          `(${draft.outputTokens} tokens). Nothing was saved. Try again, or shorten ` +
          `the facts this section draws on.`,
        unparseable:
          `The ${def.title} draft came back in a form we could not read, twice. ` +
          `Nothing was saved.`,
        'wrong-shape':
          `The ${def.title} draft was missing its prose, twice. Nothing was saved.`,
      }
      return res.status(502).json({
        error: messages[outcome.failure!] ?? 'The draft could not be read. Nothing was saved.',
        reason: outcome.failure,
        retryable: true,
      })
    }
    const parsed = outcome.value!

    // ── Call 2: adversarial verification, separate context ─────────────────
    const verify = await callModel({
      system:
        'You are verifying a commissioning document for factual support. You did not ' +
        'write this text. Assume it contains errors. Flag every claim that the supplied ' +
        'facts do not support, contradict, or leave vague. Return JSON only: ' +
        '{ "flags": [ { "span": string, "claim": string, "severity": "unsupported"|"contradicted"|"vague", "why": string } ] }',
      user: JSON.stringify({ prose: parsed.prose, facts }),
      // Comparing every sentence against every fact is the MOST reasoning-heavy
      // call in the system, not the least — the old 1500 was sized for the flag
      // list alone, which is the same mistake as the draft budgets one call later.
      maxTokens: 8000,
    })
    await logGeneration(service, {
      feature: 'cx-plan:verify', projectId: plan.project_id,
      result: verify, createdBy: user.userId,
    })
    // A VERIFICATION THAT FAILED IS NOT A VERIFICATION THAT PASSED. This line was
    // `parseJson(...)?.flags ?? []`, so a truncated or unreadable check produced an
    // empty flag list — indistinguishable, on screen and in the database, from a
    // clean bill of health. The one guarantee the two-call design exists to give
    // would have vanished in silence: the fourth instance of the class, found while
    // fixing the third. Fail closed instead — discard the prose and say the check
    // did not run.
    const vOut = parseModelJson<{ flags: any[] }>(
      verify, (v: any): v is { flags: any[] } => !!v && Array.isArray(v.flags))
    if (!vOut.ok) {
      console.error(`[cx-plan-draft] ${section_key}: VERIFICATION ${vOut.failure}. ` +
        `stop_reason=${verify.stopReason} output_tokens=${verify.outputTokens} ` +
        `thinking=${verify.thinkingTokens}\nRAW:\n` + String(vOut.raw ?? '').slice(0, 4000))
      return res.status(502).json({
        error: `The ${def.title} draft was written but could not be fact-checked, ` +
          `so nothing was saved. Try again — unchecked text is not worth keeping.`,
        reason: `verify-${vOut.failure}`,
        retryable: true,
      })
    }
    const flags = vOut.value!.flags

    // ── Persist the section's working state ────────────────────────────────
    const ordinal = SECTIONS.findIndex(s => s.key === section_key)
    await service.from('cx_plan_sections').upsert({
      plan_id, section_key, ordinal, kind: 'narrative',
      drafted_text: parsed.prose, flags, regenerate_note: note ?? null,
      // A redraft un-accepts the section: an approval applies to text a human
      // read, and this is not that text any more.
      accepted: false,
    }, { onConflict: 'plan_id,section_key' })

    return res.status(200).json({
      prose: parsed.prose, claims: parsed.claims ?? [], flags,
      knowledge_version: knowledgeVersion(),
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message })
    console.error('cx-plan-draft error:', err)
    return res.status(500).json({ error: err.message })
  }
}
