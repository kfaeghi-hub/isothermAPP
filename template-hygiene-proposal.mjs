// TEMPLATE HYGIENE — the proposal. Reads the census, classifies each cluster,
// and recommends. WRITES NOTHING to the database.
//
// Classification is mechanical where it can be and flagged where it cannot:
//   · exact content match (Jaccard = 1.0)      -> TRUE DUPLICATE
//   · near match (>= 0.9)                       -> TRUE DUPLICATE, minor drift
//   · 0.25-0.9 with a shared master             -> same source, drifted
//   · < 0.25                                    -> genuinely distinct item sets
//   · equipment_type disagrees with the source  -> MIS-KEYED, not a duplicate
//
// The mis-keyed case is the one worth separating out. Two templates in the same
// cluster can be entirely unalike not because they are legitimate variants but
// because one of them does not belong in the cluster at all.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })
async function all(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from(table).select(cols).range(from, from + 999)
    if (error) { console.error(`REFUSE: ${table}: ${error.message}`); process.exit(1) }
    out.push(...data); if (data.length < 1000) break
  }
  return out
}

const tmpl = await all('checklist_templates', 'id, type, equipment_type, name, revision_label')
const secs = await all('checklist_template_sections', 'id, template_id')
const items = await all('checklist_template_items', 'section_id, label')
const insts = await all('checklist_instances', 'source_template_id')

const owner = new Map(secs.map(s => [s.id, s.template_id]))
const setOf = new Map()
for (const i of items) {
  const t = owner.get(i.section_id); if (!t) continue
  if (!setOf.has(t)) setOf.set(t, new Set())
  setOf.get(t).add(String(i.label).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
}
const nInst = new Map()
for (const r of insts) nInst.set(r.source_template_id, (nInst.get(r.source_template_id) ?? 0) + 1)

const jac = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n) }
const src = t => (t.revision_label ?? '').match(/source:\s*(.+)$/)?.[1]?.trim() ?? null
const masterOf = t => src(t)?.split('/').pop() ?? null

// A source folder or filename that names a DIFFERENT equipment than the key.
const MISKEY = [
  { re: /supply fan|exhaust fan|\bfan\b/i, should: 'fan' },
  { re: /sprinkler/i, should: 'fire_pump', only: 'pump' },
]
function miskeyed(t) {
  const s = src(t); if (!s) return null
  for (const m of MISKEY) {
    if (m.only && t.equipment_type !== m.only) continue
    if (m.re.test(s) && t.equipment_type !== m.should) return m.should
  }
  return null
}

const clusters = new Map()
for (const t of tmpl) {
  if (!t.equipment_type) continue
  const k = `${t.type}/${t.equipment_type}`
  ;(clusters.get(k) ?? clusters.set(k, []).get(k)).push(t)
}

const out = []
for (const [key, group] of clusters) {
  if (group.length < 2) continue
  // exact-content groups
  const buckets = []
  for (const t of group) {
    const s = setOf.get(t.id) ?? new Set()
    const b = buckets.find(x => jac(x.set, s) >= 0.9)
    if (b) b.members.push(t); else buckets.push({ set: s, members: [t] })
  }
  const mis = group.map(t => ({ t, should: miskeyed(t) })).filter(x => x.should)
  const live = group.filter(t => (nInst.get(t.id) ?? 0) > 0)
  const sharedMaster = new Set(group.map(masterOf).filter(Boolean)).size === 1

  let cls, rec
  if (mis.length) { cls = 'MIS-KEYED present'; rec = `re-key ${mis.length}: ` + mis.map(x => `"${x.t.name}" -> ${x.should}`).join('; ') }
  else if (buckets.length === 1) { cls = 'TRUE DUPLICATES'; rec = `merge ${group.length} -> 1, union the provenance` }
  else if (buckets.length < group.length) { cls = 'DUPLICATES + variants'; rec = `${buckets.length} distinct content sets among ${group.length} templates — merge within each set` }
  else if (sharedMaster) { cls = 'drifted from one master'; rec = 'same source, content diverged — reconcile' }
  else { cls = 'genuinely distinct'; rec = live.length ? 'keep; rename for clarity (frozen records)' : 'keep; rename for clarity' }

  out.push({ key, n: group.length, contentSets: buckets.length, cls, rec,
    live: live.length, liveNames: live.map(l => l.name),
    buckets: buckets.map(b => ({ items: b.set.size, names: [...new Set(b.members.map(m => m.name))],
      count: b.members.length, masters: [...new Set(b.members.map(masterOf))] })) })
}

out.sort((a, b) => b.n - a.n)
writeFileSync('out/template-hygiene-proposal.json', JSON.stringify(out, null, 2))

console.log('CLUSTER'.padEnd(26) + 'n  sets live  CLASSIFICATION')
for (const c of out) {
  console.log(c.key.padEnd(26) + String(c.n).padStart(2) + String(c.contentSets).padStart(6) +
    String(c.live).padStart(5) + '  ' + c.cls)
}
const dup = out.filter(c => c.cls === 'TRUE DUPLICATES')
console.log(`\nTRUE DUPLICATES: ${dup.length} clusters, ${dup.reduce((n, c) => n + c.n, 0)} templates collapsing to ${dup.length}`)
console.log(`MIS-KEYED: ${out.filter(c => c.cls.includes('MIS-KEYED')).length} clusters`)
console.log(`WITH LIVE INSTANCES: ${out.filter(c => c.live > 0).length} clusters — frozen-record treatment`)
console.log(`\nproposal → out/template-hygiene-proposal.json   NOTHING WRITTEN.`)
