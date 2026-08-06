// TEMPLATE HYGIENE CENSUS — diagnose before touching.
//
// Lists every checklist template in a multi-template type cluster, with its
// provenance, item count, live-instance count, and a CONTENT-SIMILARITY read
// against its siblings. It writes nothing and proposes nothing on its own; the
// classification is a human ruling made against this table.
//
// SIMILARITY IS MEASURED ON NORMALISED ITEM LABELS, not on names or counts. Two
// templates with the same item count can be entirely different checklists, and
// two with different counts can be the same checklist plus three rows. Jaccard
// over the label sets answers the question actually being asked.
//
// Run: node --env-file=.env template-census.mjs [--all]

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const { data: tmpl, error } = await svc.from('checklist_templates')
  .select('id, type, equipment_type, name, revision_label, active')
if (error) { console.error('REFUSE:', error.message); process.exit(1) }

// PAGINATE. PostgREST caps a select at 1000 rows by default and returns the
// truncation silently — the first run of this census reported "0 items" on every
// template, which was absurd enough to notice. A subtler cap would not have been.
async function all(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select(cols).range(from, from + 999)
    if (error) { console.error(`REFUSE: ${table}: ${error.message}`); process.exit(1) }
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const secs = await all('checklist_template_sections', 'id, template_id, title')
const items = await all('checklist_template_items', 'section_id, label')
const insts = await all('checklist_instances', 'source_template_id')
console.log(`read ${secs.length} sections · ${items.length} items · ${insts.length} instances\n`)

const secOwner = new Map((secs ?? []).map(s => [s.id, s.template_id]))
const byTmpl = new Map()
for (const i of items ?? []) {
  const t = secOwner.get(i.section_id); if (!t) continue
  if (!byTmpl.has(t)) byTmpl.set(t, new Set())
  byTmpl.get(t).add(String(i.label).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
}
const instCount = new Map()
for (const r of insts ?? []) instCount.set(r.source_template_id, (instCount.get(r.source_template_id) ?? 0) + 1)

const jaccard = (a, b) => {
  if (!a?.size || !b?.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
const band = j => j >= 0.9 ? 'IDENTICAL' : j >= 0.6 ? 'high-overlap' : j >= 0.25 ? 'partial' : 'distinct'

// PROVENANCE FROM THE REVISION LABEL, which every seeding path wrote:
//   'Phase 1 mine …· source: <folder>/<file>'  -> mined from a named master
//   'Phase 2 drafted …· <batch>'               -> drafted, template created
//   anything else                              -> an earlier campaign
const provenance = r => {
  const rev = r.revision_label ?? ''
  const m1 = rev.match(/source:\s*(.+)$/)
  if (m1) return { path: 'Phase 1 mine', from: m1[1].trim() }
  const m2 = rev.match(/Phase 2 drafted[^·]*·\s*(.+)$/)
  if (m2) return { path: 'Phase 2 --create', from: m2[1].trim() }
  return { path: 'earlier campaign', from: rev || '(no revision label)' }
}

const showAll = process.argv.includes('--all')
const clusters = new Map()
for (const t of tmpl) {
  if (!t.equipment_type) continue
  const k = `${t.type}/${t.equipment_type}`
  if (!clusters.has(k)) clusters.set(k, [])
  clusters.get(k).push(t)
}

const multi = [...clusters.entries()].filter(([, v]) => showAll || v.length > 1)
  .sort((a, b) => b[1].length - a[1].length)

const report = []
console.log(`${multi.length} multi-template cluster(s)\n`)

for (const [key, group] of multi) {
  group.sort((a, b) => a.name.localeCompare(b.name))
  const sets = group.map(g => byTmpl.get(g.id) ?? new Set())
  // pairwise similarity — the minimum tells you whether the CLUSTER is uniform
  let minJ = 1, maxJ = 0
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    const v = jaccard(sets[i], sets[j]); minJ = Math.min(minJ, v); maxJ = Math.max(maxJ, v)
  }
  const live = group.filter(g => (instCount.get(g.id) ?? 0) > 0)
  console.log(`\n══ ${key}   ${group.length} templates   similarity ${(minJ * 100).toFixed(0)}–${(maxJ * 100).toFixed(0)}%  [${band(minJ)}${minJ !== maxJ ? '…' + band(maxJ) : ''}]`)
  if (live.length) console.log(`   ⚠ ${live.length} template(s) carry LIVE INSTANCES — frozen-record treatment applies`)
  group.forEach((g, i) => {
    const p = provenance(g)
    const n = instCount.get(g.id) ?? 0
    console.log(`   ${String(sets[i].size).padStart(3)} items  ${n ? `[${n} inst]` : '        '}  ${g.name}`)
    console.log(`             ${p.path} — ${p.from}`)
  })
  // what actually differs, when it is worth showing
  if (group.length === 2 && minJ >= 0.25 && minJ < 0.9) {
    const only = (a, b) => [...a].filter(x => !b.has(x))
    console.log(`   only in "${group[0].name}": ${only(sets[0], sets[1]).length} rows`)
    console.log(`   only in "${group[1].name}": ${only(sets[1], sets[0]).length} rows`)
  }
  report.push({ key, count: group.length, minJ, maxJ, band: band(minJ),
    live: live.map(l => l.name),
    templates: group.map((g, i) => ({ id: g.id, name: g.name, items: sets[i].size,
      instances: instCount.get(g.id) ?? 0, ...provenance(g) })) })
}

writeFileSync('out/template-census.json', JSON.stringify(report, null, 2))
console.log(`\nreport → out/template-census.json`)
console.log(`Nothing written to the database. Classification is a ruling, not a computation.`)
