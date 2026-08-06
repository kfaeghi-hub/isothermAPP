// TEMPLATE HYGIENE — the applier. Executes a RATIFIED ruling artifact and nothing else.
//
// Ratification binds to an ARTIFACT, not a process: this script does not decide
// what merges. It reads proposals/template-hygiene-ruled.json and refuses to do
// anything the artifact does not name. It cannot draft; template-hygiene-proposal.mjs
// cannot write.
//
// THE MERGE IS ONLY SAFE IF NOTHING IS LOST. A duplicate looks like data, and so
// does a row quietly dropped during a merge. Four refusals stand between this
// script and a silent loss:
//
//   1. LIVE INSTANCES — any template being ABSORBED (i.e. deleted) that carries a
//      live instance stops the run. A survivor may carry instances; an absorbed
//      one may never.
//   2. UNACCOUNTED ROWS — every item on every absorbed template must either match
//      a survivor row after reconciliation, or be named in `adopt`, or be named in
//      `covered_by`. Anything else stops the run and is printed.
//   3. FROZEN RECORDS — for any rename flagged frozen_record, the instance
//      snapshot columns are read before and re-read after, and any change stops
//      the run. Rule 4 permits the template correction; the snapshot is the record.
//   4. NAMING LAW — every surviving name this pass touches must start with its
//      type's REGISTER display name. A name derived from the source document is
//      what caused this mess; the harness will not write another one.
//
// RECONCILIATION, and why it is explicit. The similarity metric that produced the
// proposal treated "Impeller & Motor Rotation Correct" and "Impeller and Motor
// Rotation Correct" as different rows. They are the same check. Normalising '&'
// to 'and', dropping a trailing period, and dropping the boilerplate tail
// 'as per drawings and specifications' is not cosmetic here — it is the difference
// between "six rows differ" and "nineteen rows differ", and the first answer is
// the true one. The reconciliation is written down rather than inferred so that a
// row it cannot reconcile becomes a refusal instead of a deletion.
//
// Run: node --env-file=.env apply-template-hygiene.mjs            (dry run)
//      node --env-file=.env apply-template-hygiene.mjs --write

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const PLAN = JSON.parse(readFileSync('proposals/template-hygiene-ruled.json', 'utf8'))
if (!PLAN._ratified_by) { console.error('REFUSE: artifact is not ratified.'); process.exit(1) }

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

const tmpl  = await all('checklist_templates', 'id, type, equipment_type, name, revision_label, org_id')
const secs  = await all('checklist_template_sections', 'id, template_id, title, sort_order, org_id')
const items = await all('checklist_template_items', 'id, section_id, label, hint, status_type, creates_finding, expected_response, suggested_category, sort_order, org_id')
const insts = await all('checklist_instances', 'id, source_template_id, source_template_name_snapshot, source_template_type_snapshot, source_template_revision_label_snapshot, nameplate_snapshot, prestart_banner_snapshot')
const types = await all('equipment_types', 'key, name')
console.log(`read ${tmpl.length} templates · ${secs.length} sections · ${items.length} items · ${insts.length} instances\n`)

const regName = new Map(types.map(t => [t.key, t.name]))
const byId    = new Map(tmpl.map(t => [t.id, t]))
const secsOf  = t => secs.filter(s => s.template_id === t).sort((a, b) => a.sort_order - b.sort_order)
const itemsOf = s => items.filter(i => i.section_id === s).sort((a, b) => a.sort_order - b.sort_order)
const instOf  = t => insts.filter(i => i.source_template_id === t)

function resolve(prefix) {
  const hit = tmpl.filter(t => t.id.startsWith(prefix))
  if (hit.length !== 1) { console.error(`REFUSE: "${prefix}" resolves to ${hit.length} templates.`); process.exit(1) }
  return hit[0]
}

// RECONCILIATION — see the header. Two labels that reconcile to the same string
// are the same check written twice, not two checks.
const BOILERPLATE = /\b(as )?per drawings( and| &)? specifications\b/g
function norm(label) {
  return String(label).toLowerCase()
    .replace(/[’']/g, "'").replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(BOILERPLATE, ' ')
    .replace(/\s+/g, ' ').trim()
}

const REFUSALS = []
const refuse = m => REFUSALS.push(m)
const report = { batch: PLAN._batch, merges: [], rekeys: [], renames: [], deleted: [], adopted: [] }

// ── PASS 1 — verify everything, write nothing ────────────────────────────────
const work = []

for (const m of PLAN.merges ?? []) {
  const survivor = resolve(m.survivor)
  const absorb   = (m.absorb ?? []).map(resolve)
  const sLabels  = new Set(secsOf(survivor.id).flatMap(s => itemsOf(s.id)).map(i => norm(i.label)))
  // `from` is a LIST of aliases, not one string. The same check is written three
  // ways across the corpus ("Pressure Gauges Installed as per Drawings and
  // Specifications" / "Pressure Gauges Installed" / "Pressure Gauges"), and the
  // fix for that is an enumerated list in the ruled artifact — NOT a fuzzier
  // matcher. A prefix or edit-distance match would also silently swallow rows
  // that genuinely differ, which is the failure this guard exists to prevent.
  const aliases  = f => (Array.isArray(f) ? f : [f]).map(norm)
  const adopt    = (m.adopt ?? []).map(a => ({ ...a, keys: aliases(a.from) }))
  const covered  = new Set((m.covered_by ?? []).flatMap(c => aliases(c.from)))
  const adoptKey = new Set(adopt.flatMap(a => a.keys))

  for (const a of absorb) {
    const live = instOf(a.id)
    if (live.length) refuse(`${m.cluster}: absorbed template "${a.name}" carries ${live.length} live instance(s). An absorbed template is DELETED; a record may not be.`)
    if (a.equipment_type !== survivor.equipment_type)
      refuse(`${m.cluster}: "${a.name}" is keyed ${a.equipment_type} but the survivor is ${survivor.equipment_type}. Re-key before merging, never during.`)
    for (const s of secsOf(a.id)) for (const i of itemsOf(s.id)) {
      const k = norm(i.label)
      if (sLabels.has(k) || adoptKey.has(k) || covered.has(k)) continue
      refuse(`${m.cluster}: UNACCOUNTED ROW on "${a.name}" — "${i.label}"`)
    }
  }
  // an adopt row must actually be missing from the survivor, or it is padding
  for (const a of adopt) {
    if (sLabels.has(norm(a.label))) refuse(`${m.cluster}: adopt "${a.label}" is already on the survivor.`)
    if (!secsOf(survivor.id).some(s => s.title === a.section)) refuse(`${m.cluster}: adopt targets section "${a.section}" which the survivor does not have.`)
  }

  const finalKey  = m.rekey ?? survivor.equipment_type
  const finalName = m.rename ?? survivor.name
  const display   = regName.get(finalKey)
  if (!display) refuse(`${m.cluster}: equipment_type "${finalKey}" is not in the register.`)
  else if (!finalName.startsWith(display)) refuse(`${m.cluster}: NAMING LAW — "${finalName}" does not open with the register display name "${display}".`)

  work.push({ m, survivor, absorb, adopt, finalKey, finalName })
}

for (const r of PLAN.rekeys ?? []) {
  const t = resolve(r.template)
  if (t.equipment_type !== r.from) refuse(`re-key: "${t.name}" is keyed ${t.equipment_type}, artifact says ${r.from}.`)
  const display = regName.get(r.to)
  if (!display) refuse(`re-key: target type "${r.to}" is not in the register.`)
  else if (!r.rename.startsWith(display)) refuse(`re-key: NAMING LAW — "${r.rename}" does not open with "${display}".`)
}

for (const r of PLAN.renames ?? []) {
  const t = resolve(r.template)
  const display = regName.get(t.equipment_type)
  if (!display) refuse(`rename: "${t.name}" has type "${t.equipment_type}", not in the register.`)
  else if (!r.to.startsWith(display)) refuse(`rename: NAMING LAW — "${r.to}" does not open with "${display}".`)
  const live = instOf(t.id)
  if (live.length && !r.frozen_record) refuse(`rename: "${t.name}" carries ${live.length} live instance(s) but is not flagged frozen_record.`)
  if (r.frozen_record && !live.length) refuse(`rename: "${t.name}" is flagged frozen_record but carries NO instances — the flag asserts something untrue.`)
}

if (REFUSALS.length) {
  console.error(`REFUSE — ${REFUSALS.length} problem(s); nothing was written:\n`)
  for (const r of REFUSALS) console.error('  · ' + r)
  process.exit(1)
}
console.log('verification passed — every absorbed row is accounted for, no absorbed template is a record,')
console.log('every surviving name opens with its register display name.\n')

// ── the frozen-record snapshot, taken BEFORE anything moves ──────────────────
const SNAP_COLS = ['source_template_name_snapshot', 'source_template_type_snapshot',
  'source_template_revision_label_snapshot', 'nameplate_snapshot', 'prestart_banner_snapshot']
const frozen = []
for (const r of (PLAN.renames ?? []).filter(x => x.frozen_record)) {
  const t = resolve(r.template)
  for (const i of instOf(t.id)) frozen.push({ id: i.id, before: JSON.stringify(SNAP_COLS.map(c => i[c])) })
}
if (frozen.length) console.log(`frozen-record baseline captured for ${frozen.length} instance(s)\n`)

// ── PASS 2 — the write ───────────────────────────────────────────────────────
const provOf = t => (t.revision_label ?? '').match(/source:\s*(.+)$/)?.[1]?.trim() ?? null
const DATE = PLAN._ratified_on

async function must(p, what) {
  const { error } = await p
  if (error) { console.error(`REFUSE mid-write: ${what}: ${error.message}`); process.exit(1) }
}

for (const w of work) {
  const { m, survivor, absorb, adopt, finalKey, finalName } = w
  // UNION OF PROVENANCE — six folders finding the same checklist is itself a fact
  // worth keeping. `source:` stays LAST so the census parser still reads a primary.
  const merged = [...new Set([survivor, ...absorb].map(provOf).filter(Boolean))]
  const primary = provOf(survivor) ?? merged[0]
  const others = merged.filter(x => x !== primary)
  const rev = `Phase 1 mine · hygiene merge ${DATE} (${absorb.length + 1}→1)`
    + (others.length ? ` · merged from: ${others.join('; ')}` : '')
    + ` · source: ${primary}`

  console.log(`${m.cluster}`)
  console.log(`   survivor  ${survivor.name}`)
  console.log(`   →         ${finalName}${finalKey !== survivor.equipment_type ? `   [re-key ${survivor.equipment_type} → ${finalKey}]` : ''}`)
  console.log(`   absorbs   ${absorb.length}   provenance union: ${merged.length} master path(s)`)
  for (const a of adopt) console.log(`   adopt     + ${a.label}`)
  for (const c of m.covered_by ?? []) console.log(`   covered   ~ "${c.from}"  ←  "${c.by}"`)

  report.merges.push({ cluster: m.cluster, survivor: survivor.id, name: finalName, key: finalKey,
    absorbed: absorb.map(a => ({ id: a.id, name: a.name, source: provOf(a) })),
    provenance_union: merged, adopted: adopt.map(a => a.label),
    covered_by: m.covered_by ?? [] })

  if (!WRITE) continue

  for (const a of adopt) {
    const sec = secsOf(survivor.id).find(s => s.title === a.section)
    const max = Math.max(-1, ...itemsOf(sec.id).map(i => i.sort_order))
    await must(svc.from('checklist_template_items').insert({
      section_id: sec.id, label: a.label, status_type: 'yn_nr_na_hold',
      sort_order: max + 1, org_id: sec.org_id,
      hint: `Adopted in the ${PLAN._batch} merge from a water-system variant of this checklist.`
    }), `adopt "${a.label}"`)
    report.adopted.push({ cluster: m.cluster, label: a.label })
  }

  await must(svc.from('checklist_templates').update({
    name: finalName, equipment_type: finalKey, revision_label: rev
  }).eq('id', survivor.id), `update survivor ${survivor.id}`)

  for (const a of absorb) {
    const sids = secsOf(a.id).map(s => s.id)
    if (sids.length) await must(svc.from('checklist_template_items').delete().in('section_id', sids), `items of ${a.id}`)
    await must(svc.from('checklist_template_sections').delete().eq('template_id', a.id), `sections of ${a.id}`)
    await must(svc.from('checklist_templates').delete().eq('id', a.id), `template ${a.id}`)
    report.deleted.push({ id: a.id, name: a.name, into: survivor.id })
  }
  console.log(`   ✓ merged`)
}

console.log('')
for (const r of PLAN.rekeys ?? []) {
  const t = resolve(r.template)
  console.log(`re-key   ${t.name}   [${r.from} → ${r.to}]\n   →      ${r.rename}`)
  report.rekeys.push({ id: t.id, was: t.name, name: r.rename, from: r.from, to: r.to })
  if (!WRITE) continue
  const rev = `${t.revision_label ?? ''} · re-keyed ${r.from}→${r.to} in ${PLAN._batch}`
  await must(svc.from('checklist_templates').update({ equipment_type: r.to, name: r.rename, revision_label: rev })
    .eq('id', t.id), `re-key ${t.id}`)
  console.log('   ✓ re-keyed')
}

console.log('')
for (const r of PLAN.renames ?? []) {
  const t = resolve(r.template)
  console.log(`rename   ${t.name}\n   →      ${r.to}${r.frozen_record ? '   [FROZEN RECORD — snapshot must not move]' : ''}`)
  report.renames.push({ id: t.id, was: t.name, name: r.to, frozen_record: !!r.frozen_record })
  if (!WRITE) continue
  await must(svc.from('checklist_templates').update({ name: r.to }).eq('id', t.id), `rename ${t.id}`)
  console.log('   ✓ renamed')
}

// ── the frozen-record proof, re-read from the database ───────────────────────
if (WRITE && frozen.length) {
  const after = await all('checklist_instances', 'id, ' + SNAP_COLS.join(', '))
  let moved = 0
  for (const f of frozen) {
    const a = after.find(x => x.id === f.id)
    if (!a) { console.error(`REFUSE: instance ${f.id} disappeared.`); process.exit(1) }
    if (JSON.stringify(SNAP_COLS.map(c => a[c])) !== f.before) {
      console.error(`REFUSE: instance ${f.id} — a snapshot column CHANGED. Rule 4 violated.`)
      moved++
    }
  }
  if (moved) process.exit(1)
  console.log(`\nfrozen-record proof: ${frozen.length} instance snapshot(s) re-read and byte-identical.`)
  report.frozen_record_verified = frozen.length
}

writeFileSync('out/template-hygiene-applied.json', JSON.stringify(report, null, 2))
console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN — nothing written'}. report → out/template-hygiene-applied.json`)
if (!WRITE) console.log('re-run with --write to apply.')
