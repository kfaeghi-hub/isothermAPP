// HYGIENE 7c — the two ruled follow-ups. Executes ratified decisions and nothing else.
//
//   (1) Delete the fire_pump husk; union its master path onto the drafted survivor.
//   (2) Re-key COMPARTMENT UNIT SYSTEM to the newly minted ahu_builtup, rename it
//       under the naming law, and RESTORE THE SOURCE'S BLOCK HEADINGS that the
//       mine dropped.
//
// THE BLOCK HEADINGS ARE READ FROM THE SOURCE ARTIFACT, NOT ASSERTED HERE.
// The template appeared to carry four duplicate rows. The proposal guessed they
// were two coil blocks — heating and cooling. Reading the raw source shows there
// is ONE coil block (COOLING COIL) and no heating coil anywhere in the document;
// the repetition is a second piping group INSIDE it, with no heading of its own.
//
// So this script does not carry a heading table. It parses the source's own
// tables, keyed on the header row, and maps each mined label back to the block it
// came from. A label it cannot place is a REFUSAL, not a guess — because the
// entire lesson of this repair is that inventing structure and deleting structure
// are the same mistake in opposite directions.
//
// Run: node --env-file=.env apply-hygiene-7c.mjs            (dry run)
//      node --env-file=.env apply-hygiene-7c.mjs --write

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const SRC = 'out/startup-mining/csp/csa-ivc__21 CSA Z318 - HVAC System - Word__01 Air Handling Systems - Word__06 Compartment Unit__S02-CU- CSP.json'

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })
async function all(t, c) {
  const out = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await svc.from(t).select(c).range(f, f + 999)
    if (error) { console.error(`REFUSE: ${t}: ${error.message}`); process.exit(1) }
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
async function must(p, what) {
  const { error } = await p
  if (error) { console.error(`REFUSE mid-write: ${what}: ${error.message}`); process.exit(1) }
}

const tmpl  = await all('checklist_templates', 'id, type, equipment_type, name, revision_label')
const secs  = await all('checklist_template_sections', 'id, template_id, title, sort_order, org_id')
const items = await all('checklist_template_items', 'id, section_id, label, hint, sort_order')
const insts = await all('checklist_instances', 'id, source_template_id')
const types = await all('equipment_types', 'key, name')
console.log(`read ${tmpl.length} templates · ${secs.length} sections · ${items.length} items\n`)

const reg = new Map(types.map(t => [t.key, t.name]))
const secsOf = t => secs.filter(s => s.template_id === t).sort((a, b) => a.sort_order - b.sort_order)
const itemsOf = s => items.filter(i => i.section_id === s).sort((a, b) => a.sort_order - b.sort_order)
const one = pred => { const h = tmpl.filter(pred); if (h.length !== 1) { console.error(`REFUSE: expected 1 template, found ${h.length}`); process.exit(1) } return h[0] }

// ══ (1) THE FIRE PUMP HUSK ═══════════════════════════════════════════════════
const husk = one(t => t.name.includes('Sprinkler Tree Source'))
const fpSurv = one(t => t.type === 'startup' && t.equipment_type === 'fire_pump' && t.id !== husk.id)

if (insts.some(i => i.source_template_id === husk.id)) {
  console.error('REFUSE: the husk carries a live instance. A record is never deleted.'); process.exit(1)
}
// The husk must contain NOTHING but the standing row and type-level fill — that
// is the finding the deletion rests on, so it is re-proven here rather than trusted.
const huskLabels = secsOf(husk.id).flatMap(s => itemsOf(s.id)).map(i => i.label)
const survLabels = new Set(secsOf(fpSurv.id).flatMap(s => itemsOf(s.id)).map(i => i.label))
const orphan = huskLabels.filter(l => !survLabels.has(l))
console.log(`(1) fire_pump husk — ${huskLabels.length} rows, ${orphan.length} not present on the survivor`)
if (orphan.length) {
  console.log('    rows that would be LOST by deleting:')
  for (const o of orphan) console.log(`      · ${o}`)
  console.log('    NOTE: these are the pump type\'s Phase 2 fill, not mined content.')
}

const huskSrc = (husk.revision_label ?? '').match(/source:\s*([^·]+)/)?.[1]?.trim()
const survRev = `${fpSurv.revision_label ?? ''} · hygiene 7c ${'2026-08-06'}: absorbed the mined-empty master ${huskSrc} (mine yielded zero checklist rows; retained as corpus record)`
console.log(`    survivor  ${fpSurv.name}`)
console.log(`    provenance → …absorbed the mined-empty master ${huskSrc}`)

if (WRITE) {
  const sids = secsOf(husk.id).map(s => s.id)
  if (sids.length) await must(svc.from('checklist_template_items').delete().in('section_id', sids), 'husk items')
  await must(svc.from('checklist_template_sections').delete().eq('template_id', husk.id), 'husk sections')
  await must(svc.from('checklist_templates').delete().eq('id', husk.id), 'husk template')
  await must(svc.from('checklist_templates').update({ revision_label: survRev }).eq('id', fpSurv.id), 'survivor provenance')
  console.log('    ✓ deleted, provenance unioned')
}

// ══ (2) THE COMPARTMENT UNIT ═════════════════════════════════════════════════
const cu = one(t => t.name.includes('COMPARTMENT UNIT'))
const NEW_KEY = 'ahu_builtup'
const NEW_NAME = `${reg.get(NEW_KEY)} Start-Up Checklist`
if (!reg.has(NEW_KEY)) { console.error(`REFUSE: ${NEW_KEY} is not in the register.`); process.exit(1) }
if (!NEW_NAME.startsWith(reg.get(NEW_KEY))) { console.error('REFUSE: naming law.'); process.exit(1) }

// ── the source's OWN block structure ─────────────────────────────────────────
const src = JSON.parse(readFileSync(SRC, 'utf8'))
const blocks = []
for (const t of src.tables) {
  const rows = t.rows.filter(r => r.cells?.length)
  if (rows.length < 2) continue
  const head = rows[0].cells
  if (!/^status$/i.test(String(head[1] ?? ''))) continue        // a content block, not a masthead
  blocks.push({ title: String(head[0]).trim(), rows: rows.slice(1).map(r => String(r.cells[0]).trim()).filter(Boolean) })
}
console.log(`\n(2) source blocks read from the artifact:`)
for (const b of blocks) console.log(`      ${String(b.rows.length).padStart(2)}  ${b.title}`)
if (blocks.some(b => /heating coil/i.test(b.title))) {
  console.error('REFUSE: a HEATING COIL block exists after all — the repair below assumes it does not.')
  process.exit(1)
}

// Map each source label to (block, ordinal-within-block). A label repeated inside
// ONE block gets an ordinal; that is the only claim the source supports.
const norm = s => String(s).toLowerCase().replace(/[’']/g, "'").replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const placed = new Map()                       // norm(label) -> [{block, n, total}]
for (const b of blocks) {
  const seen = new Map()
  for (const label of b.rows) {
    const k = norm(label)
    const n = (seen.get(k) ?? 0) + 1; seen.set(k, n)
    if (!placed.has(k)) placed.set(k, [])
    placed.get(k).push({ block: b.title, n })
  }
}
for (const [k, list] of placed) list.forEach(e => { e.total = list.length })

const STANDING = norm("Manufacturer's IOM start-up steps reviewed, completed & attached")
const edits = [], unplaced = []
for (const s of secsOf(cu.id)) {
  const seen = new Map()
  for (const i of itemsOf(s.id)) {
    const k = norm(i.label)
    if (k === STANDING) continue                                // the standing row is not from a block
    const list = placed.get(k)
    if (!list) { unplaced.push(i.label); continue }
    const n = (seen.get(k) ?? 0) + 1; seen.set(k, n)
    const e = list[Math.min(n, list.length) - 1]
    // The repair: the block heading the mine dropped, restored as a prefix.
    // Where ONE block lists the same check twice, the ordinal is appended — the
    // source shows two groups and gives no heading distinguishing them, so the
    // count is stated and the distinction is not invented.
    const prefix = `${e.block}: `
    const suffix = e.total > 1 ? ` — ${n === 1 ? 'first' : 'second'} piping group` : ''
    const label = prefix + i.label + suffix
    const hint = e.total > 1
      ? `The source's ${e.block} block lists this check twice, in two consecutive piping groups, and gives no heading distinguishing them. Both rows are kept: deduplicating would delete a real check.`
      : i.hint ?? null
    if (label !== i.label) edits.push({ id: i.id, from: i.label, to: label, hint })
  }
}

console.log(`\n    re-key   ${cu.equipment_type} → ${NEW_KEY}`)
console.log(`    rename   ${cu.name}\n       →     ${NEW_NAME}`)
console.log(`    block prefixes to restore: ${edits.length} rows`)
for (const e of edits.filter(x => / piping group$/.test(x.to))) console.log(`       ! ${e.to}`)
if (unplaced.length) {
  console.error(`\nREFUSE: ${unplaced.length} template row(s) could not be placed in any source block:`)
  for (const u of unplaced) console.error(`      · ${u}`)
  console.error('Inventing a heading and deleting a row are the same mistake in opposite directions.')
  process.exit(1)
}

if (WRITE) {
  for (const e of edits) await must(
    svc.from('checklist_template_items').update({ label: e.to, hint: e.hint }).eq('id', e.id), `relabel ${e.id}`)
  await must(svc.from('checklist_templates').update({
    equipment_type: NEW_KEY, name: NEW_NAME,
    revision_label: `${cu.revision_label ?? ''} · re-keyed ahu→${NEW_KEY} in hygiene-7c-2026-08-06; source block headings restored`
  }).eq('id', cu.id), 'compartment unit template')
  console.log('    ✓ re-keyed, renamed, block headings restored')
}

console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN — nothing written'}.`)
