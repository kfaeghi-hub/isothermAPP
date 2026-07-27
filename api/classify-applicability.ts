// api/classify-applicability — run the classifier over a project's register.
//
//   POST { project_id, run_id?, offset? }
//     → { run_id, next_offset, rules, exceptions, cost_cents, done }
//
// Reads the register and the project's stage structure and PROPOSES which
// (type × stage-group) combinations do not apply. Nothing is applied: every
// proposal lands in cx_applicability_proposals for a human to rule on (laws 2
// and 7).
//
// The classifier is given DESCRIPTORS AND CATEGORIES, not just tags — law 8. On
// this very register `RP` was a radiant panel on the mechanical drawings and a
// receptacle panel on the electrical, and a tag-only prompt would have to guess
// between them.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
import { runAgent, logAgentRun, AiError } from './_shared/ai-common.js'
import type { ClassifierOutput } from './_shared/agent-schemas.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** One call per this many units. Batching keeps each call inside its budget while
 *  still giving the model enough of the register to see a TYPE rather than a row.
 *  A per-unit call would be both ruinous and worse: the whole point is that the
 *  burden scales with types.
 *
/**
 * BATCHING IS OVER STAGE GROUPS, NOT UNITS — and that was measured, not guessed.
 *
 * The first two attempts split the register by unit and still timed out. Timing
 * real calls showed why: 5 type-groups took 39.5s and 15 took 42.9s. Latency is
 * driven by how many STAGE GROUPS the model must reason about, not by how many
 * units — the units are a list to consult, the groups are the judgements.
 *
 * The platform ceiling is 60s (measured: the function dies at 60.3s) and no
 * maxDuration raises it on this plan.
 *
 * BUT THE DECIDING FACTOR WAS THE TOKEN CEILING, NOT THE BATCH. At a 16,000
 * budget the model spent all of it thinking — 15,173 reasoning tokens even for a
 * SINGLE stage group — and took 130s. classifier.md now declares max_tokens 5000,
 * at which the model answers directly in ~13s. Two groups per call is then
 * comfortable rather than marginal.
 */
const GROUPS_PER_CALL = 2

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const { project_id } = req.body ?? {}
    if (!project_id) return res.status(400).json({ error: 'project_id required' })
    await requireProjectAccess(service, user.userId, project_id)

    const [{ data: equip }, { data: groups }] = await Promise.all([
      service.from('equipment')
        .select('id, tag, category, equipment_type, descriptor')
        .eq('project_id', project_id).order('category').order('tag'),
      service.from('project_cx_stage_groups')
        .select('name, sort_order, project_cx_columns(label, sort_order)')
        .eq('project_id', project_id).order('sort_order'),
    ])

    if (!equip?.length)  return res.status(400).json({ error: 'This project has no equipment to classify.' })
    if (!groups?.length) return res.status(400).json({ error: 'This project has no Cx Index structure yet.' })

    const stage_groups = groups.map((g: any) => ({
      name: g.name,
      columns: (g.project_cx_columns ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order).map((c: any) => c.label),
    }))

    // One representative per (type, category) pair, plus the count. The model does
    // not need 113 fan coils to conclude something about fan coils — it needs to
    // know there ARE 113, and what they are called.
    const seen = new Map<string, { tag: string; category: string | null;
                                   equipment_type: string | null; descriptor: string | null; n: number }>()
    for (const e of equip) {
      const k = `${e.equipment_type ?? '~'}::${e.category ?? '~'}`
      const hit = seen.get(k)
      if (hit) { hit.n++; continue }
      seen.set(k, { tag: e.tag, category: e.category, equipment_type: e.equipment_type,
                    descriptor: e.descriptor, n: 1 })
    }
    const units = [...seen.values()].map(u => ({
      tag: u.tag, category: u.category, equipment_type: u.equipment_type,
      descriptor: u.descriptor ? `${u.descriptor} (${u.n} unit${u.n === 1 ? '' : 's'})`
                               : `${u.n} unit${u.n === 1 ? '' : 's'}`,
    }))

    // The caller drives the loop; we do exactly one batch.
    const runId: string = req.body?.run_id ?? randomUUID()
    const offset: number = Math.max(0, Number(req.body?.offset ?? 0))
    const groupSlice = stage_groups.slice(offset, offset + GROUPS_PER_CALL)
    if (groupSlice.length === 0) {
      return res.status(200).json({ run_id: runId, next_offset: null, done: true,
                                    rules: 0, exceptions: 0, cost_cents: 0 })
    }

    const run = await runAgent<ClassifierOutput>('classifier',
      // The WHOLE register every call — the model needs to see all the types to
      // write a rule about one — but only a few stage groups to judge.
      { units, stage_groups: groupSlice },
      { task: [
          'Propose which commissioning stage groups DO NOT APPLY to which equipment',
          'types on this project, so the index reports honest denominators.',
          '',
          'RULES FIRST: one rule per (equipment_type, stage_group) settles every unit',
          'of that type. Only raise an EXCEPTION where a specific unit differs from',
          'its type. A per-unit answer for every unit is the wrong shape.',
          '',
          'Use the DESCRIPTOR and CATEGORY to decide what a thing is. A tag prefix is',
          'not evidence of type — on this register RP is a radiant panel on the',
          'mechanical drawings and a receptacle panel on the electrical.',
          '',
          'Set life_safety: true on anything touching integrated systems testing,',
          'fire or smoke control, emergency power transfer, or stair pressurization.',
          '',
          'Where the register does not say enough to decide, give a LOW confidence',
          'and say why. Do not guess.',
          '',
          'Return JSON only: { "rules": [ { "equipment_type", "stage_group", "column",',
          '"applicable", "rationale", "confidence", "units_affected", "life_safety" } ],',
          '"exceptions": [ { "tag", "stage_group", "column", "applicable", "rationale",',
          '"confidence", "life_safety" } ] }',
        ].join('\n'),
      })

    await logAgentRun(service, {
      agentKey: 'classifier', feature: 'cx-index:classify', projectId: project_id,
      run, createdBy: user.userId, runId,
    })
    if (!run.ok) {
      return res.status(502).json({
        error: 'The classifier could not be read. Nothing was proposed for this batch.',
        reason: run.failure, retryable: true, run_id: runId, offset,
      })
    }
    const allRules = run.value!.rules ?? []
    const allExceptions = run.value!.exceptions ?? []
    const cents = run.usage
      ? run.usage.inputTokens / 1e6 * 300 + run.usage.outputTokens / 1e6 * 1500 : 0

    // Clear prior UNRULED proposals on the FIRST batch only — clearing on every
    // batch would delete the proposals the previous batches just wrote. A ratified
    // or rejected proposal is a decision and is never overwritten by a re-run.
    if (offset === 0) {
      await service.from('cx_applicability_proposals')
        .delete().eq('project_id', project_id).eq('status', 'proposed')
    }

    const byTag = new Map(equip.map((e: any) => [e.tag.toUpperCase(), e.id]))
    const rows = [
      ...allRules.map(r => ({
        project_id, run_id: runId, kind: 'rule',
        category: r.life_safety ? 'fire-integration' : 'applicability-rule',
        equipment_type: r.equipment_type, tag: null, equipment_id: null,
        stage_group_name: r.stage_group, column_label: r.column ?? null,
        applicable: !!r.applicable, rationale: r.rationale,
        confidence: r.confidence, units_affected: r.units_affected ?? null,
        life_safety: !!r.life_safety,
      })),
      ...allExceptions.map(e => ({
        project_id, run_id: runId, kind: 'exception',
        category: e.life_safety ? 'fire-integration' : 'applicability-exception',
        equipment_type: null, tag: e.tag, equipment_id: byTag.get(String(e.tag).toUpperCase()) ?? null,
        stage_group_name: e.stage_group, column_label: e.column ?? null,
        applicable: !!e.applicable, rationale: e.rationale,
        confidence: e.confidence, units_affected: null,
        life_safety: !!e.life_safety,
      })),
    ]

    if (rows.length) {
      const { error } = await service.from('cx_applicability_proposals').insert(rows)
      if (error) return res.status(500).json({ error: error.message })
    }

    const nextOffset = offset + GROUPS_PER_CALL
    return res.status(200).json({
      run_id: runId,
      next_offset: nextOffset < stage_groups.length ? nextOffset : null,
      done: nextOffset >= stage_groups.length,
      units_considered: equip.length,
      type_groups: units.length,
      progress: `${Math.min(nextOffset, stage_groups.length)}/${stage_groups.length} stage groups`,
      rules: allRules.length,
      exceptions: allExceptions.length,
      life_safety: rows.filter(r => r.life_safety).length,
      cost_cents: Math.round(cents * 100) / 100,
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    if (err instanceof AiError)   return res.status(err.status).json({ error: err.message })
    console.error('classify-applicability error:', err)
    return res.status(500).json({ error: err.message })
  }
}
