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
  buildContext, callModel, logGeneration, parseJson, parseModelJson,
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
 * PER-SECTION TOKEN BUDGET.
 *
 * The first calibration run failed on Roles and Responsibilities at exactly 1200
 * output tokens — the flat ceiling — with no verification call after it, because
 * the JSON was cut off mid-object. Roles writes one line per participating
 * company, so its length scales with the team matrix while every other section
 * is a fixed few sentences.
 *
 * And the CLAIMS ARRAY ROUGHLY DOUBLES THE OUTPUT: every sentence of prose comes
 * back a second time as a claim with its supporting fact key. A budget sized for
 * the prose alone is therefore about half of what the contract actually needs.
 * These numbers are prose-estimate x2 plus headroom.
 */
function budgetFor(sectionKey: string): number {
  const BUDGETS: Record<string, number> = {
    background: 1500,    // 2-4 sentences
    roles: 3000,         // one line PER COMPANY — the only section that scales
    process: 2000,       // 3-5 sentences
    operational: 1800,   // 2-4 sentences
    ils: 1800,
    tab: 1800,
    schedule: 2200,      // 3-5 sentences across phases
  }
  return BUDGETS[sectionKey] ?? 2000
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

    // ONE automatic retry with a terse reminder. Most unparseable responses are
    // fence-wrapping or stray commentary and clear on the second attempt; a
    // truncation does not, so it is NOT retried — the same budget would produce
    // the same cut-off, at the same cost.
    let draft = await callModel({ system, user: userMsg, maxTokens: budgetFor(section_key) })
    await logGeneration(service, {
      feature: 'cx-plan:draft', projectId: plan.project_id,
      result: draft, createdBy: user.userId,
    })
    let outcome = parseModelJson<Draft>(draft, isDraft)

    if (!outcome.ok && outcome.failure !== 'truncated') {
      console.warn(`[cx-plan-draft] ${section_key}: ${outcome.failure} — retrying once. Raw:\n` +
        String(outcome.raw ?? '').slice(0, 2000))
      draft = await callModel({
        system, user: userMsg + JSON_RETRY_REMINDER, maxTokens: budgetFor(section_key),
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
        `budget=${budgetFor(section_key)}\nRAW:\n` + String(outcome.raw ?? '').slice(0, 4000))

      // A TRUNCATION IS ITS OWN ERROR, not a parse failure. They have different
      // fixes — one needs a bigger budget, the other a better prompt — and the
      // message must say which so a human is not left guessing.
      const messages: Record<string, string> = {
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
      // Flags carry a span, a claim and a reason each, so this scales with the
      // number of problems found — not with the prose length.
      maxTokens: 1500,
    })
    await logGeneration(service, {
      feature: 'cx-plan:verify', projectId: plan.project_id,
      result: verify, createdBy: user.userId,
    })
    const flags = parseJson<{ flags: any[] }>(verify.text)?.flags ?? []

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
