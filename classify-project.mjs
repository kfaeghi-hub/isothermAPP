// classify-project — run the classifier as a JOB, one bounded question per call.
//
//   node --env-file=.env classify-project.mjs <com_number>
//
// WHY A JOB AND NOT AN ENDPOINT: a full pass is 13 calls. Even at ~15s each that
// exceeds the 60s function ceiling, so classification is a job — the worker seam
// MASTER-BRIEF §8 anticipated for AI work.
//
// WHY ONE STAGE GROUP PER CALL, measured the expensive way:
//   whole matrix, ceiling 16000 -> 15,999 thinking, ZERO text, x6, ~$1.58 burned
//   whole matrix, ceiling  5000 ->  5,000 thinking, ZERO text
// A question with no natural stopping point expands to fill any allowance. The
// budget was never the problem; the question was.
//
// NOTHING IS APPLIED. Output lands in cx_applicability_proposals for a human.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const com = process.argv[2]
if (!com) { console.error('usage: node --env-file=.env classify-project.mjs <com_number>'); process.exit(1) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const { data: proj } = await svc.from('projects')
  .select('id, name, com_number').eq('com_number', com).maybeSingle()
if (!proj) { console.error(`REFUSING: no project with com_number ${com}`); process.exit(1) }
console.log(`target: ${proj.name} (${proj.com_number})`)

const [{ data: equip }, { data: groups }] = await Promise.all([
  svc.from('equipment').select('id, tag, category, equipment_type, descriptor')
     .eq('project_id', proj.id).order('category').order('tag'),
  svc.from('project_cx_stage_groups')
     .select('name, sort_order, project_cx_columns(label, sort_order)')
     .eq('project_id', proj.id).order('sort_order'),
])
if (!equip?.length || !groups?.length) { console.error('nothing to classify'); process.exit(1) }

const stageGroups = groups.map(g => ({
  name: g.name,
  columns: (g.project_cx_columns ?? []).sort((a, b) => a.sort_order - b.sort_order).map(c => c.label),
}))

// The type list: one entry per (type, category) with a count and one sample
// descriptor. The model needs to know a class exists and what it is called, not
// to read 113 fan coils.
const seen = new Map()
for (const e of equip) {
  const k = `${e.equipment_type ?? '~'}::${e.category ?? '~'}`
  const hit = seen.get(k)
  if (hit) { hit.n++; continue }
  seen.set(k, { equipment_type: e.equipment_type, category: e.category, n: 1, sample: e.descriptor })
}
const types = [...seen.values()]
// Units PER TYPE, summed across categories. Reading the count off the first
// matching (type, category) group understates any type that spans several — fan
// read 1 when the register holds 12 — and that number is what a reviewer weighs
// when deciding whether a rule is consequential.
const unitsByType = new Map()
for (const e of equip) {
  unitsByType.set(e.equipment_type, (unitsByType.get(e.equipment_type) ?? 0) + 1)
}
console.log(`${equip.length} units → ${types.length} type groups · ${stageGroups.length} stage groups`)

const rd = f => { try { return readFileSync(`firm-knowledge/${f}`, 'utf8') } catch { return '' } }
const contractBody = rd('agents/classifier.md').replace(/^---[\s\S]*?---/, '').trim()
const system = [rd('terminology.md'), rd('domain-rules.md'), contractBody]
  .filter(Boolean).join('\n\n---\n\n')

const MAX_TOKENS = 4000          // prose class, narrowed — a bounded question
const runId = randomUUID()

/** One call. Logs EVERY outcome, success or not: a run that produced nothing
 *  still cost money, and the six invisible batches that preceded this rewrite are
 *  exactly the gap that rule exists to close. */
async function ask(label, prompt, ceiling = MAX_TOKENS, isRetry = false) {
  const t0 = Date.now()
  let j, err = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: ceiling, system,
        messages: [{ role: 'user', content: prompt }] }),
    })
    j = await res.json()
    if (!res.ok) err = j?.error?.message ?? `HTTP ${res.status}`
  } catch (e) { err = e.message }

  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  const u = j?.usage ?? {}
  const text = (j?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('')
  const think = u.output_tokens_details?.thinking_tokens ?? 0

  let parsed = null, outcome
  if (err) outcome = 'api-error'
  else if (!text) outcome = think > 0 ? 'thinking-overrun' : 'empty'
  else {
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim())
      outcome = 'ok'
    } catch { outcome = 'unparseable' }
  }

  await svc.from('ai_generations').insert({
    feature: 'cx-index:classify', agent_key: 'classifier', run_id: runId,
    project_id: proj.id, model: j?.model ?? 'claude-sonnet-5',
    input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0,
    thinking_tokens: think,
    cost_cents: (u.input_tokens ?? 0) / 1e6 * 300 + (u.output_tokens ?? 0) / 1e6 * 1500,
    budget_class: 'prose', max_tokens: ceiling, outcome,
  })

  const cost = ((u.input_tokens ?? 0) / 1e6 * 300 + (u.output_tokens ?? 0) / 1e6 * 1500)
  console.log(`  ${label.padEnd(42)} ${outcome.padEnd(17)} ${secs}s  ${cost.toFixed(2)}c` +
    (isRetry ? `  (retry @${ceiling})` : '') + (err ? `  — ${err.slice(0, 60)}` : ''))

  // ONE RETRY AT DOUBLE THE CEILING for a budget failure — the same rule runAgent
  // applies. The reshape fixed the shape of the question; the tail of harder
  // groups still wants a little more room, and retrying at the SAME ceiling would
  // buy the identical failure at the identical price.
  if (!isRetry && (outcome === 'thinking-overrun' || outcome === 'unparseable')) {
    return ask(label, prompt, ceiling * 2, true)
  }
  return parsed
}

const RETURN = 'Return JSON only, no prose outside it:\n' +
  '{ "inapplicable": [ { "equipment_type": "...", "rationale": "one short sentence", ' +
  '"confidence": 0.0-1.0 } ], "exceptions": [ { "tag": "...", "rationale": "...", ' +
  '"confidence": 0.0-1.0 } ] }'

const typeList = JSON.stringify(types)

// ── one bounded call per stage group, in parallel ──────────────────────────
const groupCalls = stageGroups.map(g => ({
  g,
  prompt:
    `Commissioning stage group: "${g.name}"\n` +
    `Its columns: ${g.columns.join(', ')}\n\n` +
    `Equipment types on this project (with unit counts and a sample descriptor):\n` +
    `${typeList}\n\n` +
    `QUESTION: which of these equipment types does this stage group NOT apply to?\n` +
    `Judge by the descriptor and category, never by a tag prefix. List only types ` +
    `where the whole group is inapplicable. Add an "exceptions" entry only if a ` +
    `specific unit differs from its type. If unsure, give a low confidence and say ` +
    `why — do not guess.\n\n${RETURN}`,
}))

console.log('\nper-stage-group calls:')
const groupResults = await Promise.all(
  groupCalls.map(async ({ g, prompt }) => ({ g, out: await ask(g.name, prompt) })))

// ── fire integration: its own focused call ────────────────────────────────
console.log('\nfire-integration call:')
const istGroup = stageGroups.find(g => /IST|Integrated/i.test(g.name))
const fire = await ask('fire / life-safety integration',
  `This project's integrated systems testing group is "${istGroup?.name ?? 'IST'}".\n\n` +
  `Equipment types on this project:\n${typeList}\n\n` +
  `QUESTION: which of these types ARE connected to life safety and therefore DO ` +
  `take part in integrated systems testing — fire and smoke control, emergency ` +
  `power transfer, stair pressurization, fire pumps, smoke-control fans?\n\n` +
  `Answer with the types that are NOT connected (so IST does not apply to them), ` +
  `and state for each why you are confident it carries no life-safety interlock. ` +
  `This is a life-safety scope judgement: where the register does not make it ` +
  `clear, give a LOW confidence and say so.\n\n${RETURN}`)

// ── assemble deterministically ────────────────────────────────────────────
const byTag = new Map(equip.map(e => [e.tag.toUpperCase(), e.id]))
const rows = []

for (const { g, out } of groupResults) {
  if (!out) continue
  for (const r of out.inapplicable ?? []) {
    if (!r.equipment_type) continue
    rows.push({
      project_id: proj.id, run_id: runId, kind: 'rule', category: 'applicability-rule',
      equipment_type: r.equipment_type, stage_group_name: g.name, column_label: null,
      applicable: false, rationale: r.rationale, confidence: r.confidence,
      units_affected: unitsByType.get(r.equipment_type) ?? null,
      life_safety: false,
    })
  }
  for (const e of out.exceptions ?? []) {
    if (!e.tag) continue
    rows.push({
      project_id: proj.id, run_id: runId, kind: 'exception', category: 'applicability-exception',
      tag: e.tag, equipment_id: byTag.get(String(e.tag).toUpperCase()) ?? null,
      stage_group_name: g.name, column_label: null, applicable: false,
      rationale: e.rationale, confidence: e.confidence, life_safety: false,
    })
  }
}

if (fire && istGroup) {
  for (const r of fire.inapplicable ?? []) {
    if (!r.equipment_type) continue
    rows.push({
      project_id: proj.id, run_id: runId, kind: 'rule', category: 'fire-integration',
      equipment_type: r.equipment_type, stage_group_name: istGroup.name, column_label: null,
      applicable: false, rationale: r.rationale, confidence: r.confidence,
      units_affected: unitsByType.get(r.equipment_type) ?? null,
      life_safety: true,
    })
  }
}

// Deduplicate: the fire call and the IST group call can both speak about IST.
// The life-safety verdict wins, because it is the one a human must read.
const keyed = new Map()
for (const r of rows) {
  const k = `${r.kind}:${r.equipment_type ?? r.tag}:${r.stage_group_name}`
  const prev = keyed.get(k)
  if (!prev || (r.life_safety && !prev.life_safety)) keyed.set(k, r)
}
const final = [...keyed.values()]

await svc.from('cx_applicability_proposals')
  .delete().eq('project_id', proj.id).eq('status', 'proposed')
if (final.length) {
  const { error } = await svc.from('cx_applicability_proposals').insert(final)
  if (error) { console.error('insert failed:', error.message); process.exit(1) }
}

const { data: spend } = await svc.from('ai_generations')
  .select('cost_cents, outcome').eq('run_id', runId)
const cents = (spend ?? []).reduce((s, r) => s + Number(r.cost_cents ?? 0), 0)
const failed = (spend ?? []).filter(r => r.outcome !== 'ok').length

console.log(`\n${'='.repeat(64)}`)
console.log(`${final.filter(r => r.kind === 'rule' && !r.life_safety).length} rules · ` +
  `${final.filter(r => r.kind === 'exception').length} exceptions · ` +
  `${final.filter(r => r.life_safety).length} life-safety · ` +
  `${(spend ?? []).length} calls (${failed} failed) · ${cents.toFixed(2)}c`)
console.log('Loaded into cx_applicability_proposals. NOTHING APPLIED.')
