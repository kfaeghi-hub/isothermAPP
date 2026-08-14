// ct-repoint-pilot — T2(b) PILOT, Central Tech only. Owner-ruled 2026-08-14:
// "repoint, piloted then fleet." [RIVET]
//
//   node --env-file=.env ct-repoint-pilot.mjs            (DRY RUN — writes nothing)
//   node --env-file=.env ct-repoint-pilot.mjs --apply    (the sighted pilot run)
//
// THE SEAM THIS CLOSES (measured in triage): 551 of 562 imported units are
// pre-1.11 — their schedule readings sit in nameplate_extra.spec under the
// SCHEDULE'S own headings, where the nameplate renders almost none of them and
// the from_schedule strip (which reads only from_schedule) shows nothing.
//
// AN INVOCATION WRAPPER, not new machinery: the matcher is the shared
// api/_shared scheduleFieldMatch (bundled via its src/lib shim, exactly as
// avondale-repoint.mjs does). Any change needed INSIDE the matcher is a
// stop-and-show — KEEL's lineage. What this wrapper adds over the Avondale
// script is the ruled additive semantics:
//
//   RULED CONSTRAINT 2 — A HUMAN-EDITED VALUE IS NEVER OVERWRITTEN. A spec key
//   that IS a declared field name is treated as human/render-space content:
//   kept verbatim, excluded from the raw-heading match input, and any matcher
//   result that would land on a field ALREADY HOLDING A VALUE is SKIPPED AND
//   REPORTED BY NAME. The repoint is additive: populate from_schedule, fill
//   matched declared fields only where empty.
//
// No retype leg: Central Tech's units are already typed (the T6 ruling typed
// the four FFH units; the register carries sovereign def copies). An untyped
// unit is reported and its readings still move to from_schedule — visible in
// the strip under __base, lost nowhere.
//
// Batch-tagged per ruled constraint 1: the explicit act the no-silent-
// re-extraction law demands — owner-ruled, tallies and arithmetic in the note.
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('ct-repoint-pilot')

const APPLY = process.argv.includes('--apply')
const PROJECT = 'Central Tech'

await build({
  entryPoints: ['src/lib/scheduleFieldMatch.ts'], outfile: 'out/sfm.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
})
const { matchScheduleSpec } = await import('./out/sfm.mjs')

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: proj, error: pErr } = await svc.from('projects').select('id, name').eq('name', PROJECT).single()
if (pErr || !proj) { console.error(`project "${PROJECT}" not found${pErr ? `: ${pErr.message}` : ''}`); process.exit(1) }

// Paginated read with counts printed — a truncated read is indistinguishable
// from a small register unless you print what you read.
const units = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await svc.from('equipment')
    .select('id, tag, equipment_type, import_batch_id, nameplate_extra')
    .eq('project_id', proj.id).order('tag').range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  units.push(...(data ?? []))
  if ((data ?? []).length < 1000) break
}

const { data: defs } = await svc.from('project_equipment_field_defs')
  .select('equipment_type, section, field_name, unit').eq('project_id', proj.id)
const declaredFor = type => (defs ?? [])
  .filter(d => d.section === 'spec' && (d.equipment_type === type || d.equipment_type === '__base'))
  .map(d => ({ field_name: d.field_name, unit: d.unit }))

console.log(`\n${APPLY ? 'APPLYING (PILOT)' : 'DRY RUN — nothing will be written'} · ${proj.name} · ${units.length} units read (paginated)\n`)

let inScope = 0, wrote = 0, converted = 0, mismatched = 0, unmatched = 0, totalKeys = 0
let keptHuman = 0, skippedOccupied = 0, untypedMoved = 0
const skippedByName = []
const perUnit = []

for (const u of units) {
  const np = u.nameplate_extra ?? {}
  if (np.from_schedule) continue                       // already post-1.11 shape
  const spec = np.spec ?? {}
  const keys = Object.keys(spec)
  if (!keys.length) continue
  inScope++

  const declared = declaredFor(u.equipment_type ?? '')
  const declaredNames = new Set(declared.map(d => d.field_name))

  // Split: declared-name keys are human/render-space values — kept, never
  // matched, never overwritten. Everything else is a raw schedule heading.
  const human = {}, raw = {}
  for (const k of keys) (declaredNames.has(k) ? human : raw)[k] = spec[k]
  keptHuman += Object.keys(human).length
  totalKeys += Object.keys(raw).length

  const matches = Object.keys(raw).length ? matchScheduleSpec(raw, declared) : []
  const next = { ...human }
  const lines = []
  for (const m of matches) {
    const landable = m.kind === 'exact' || m.kind === 'converted'
    if (landable && next[m.field] !== undefined && next[m.field] !== null && `${next[m.field]}` !== '') {
      skippedOccupied++
      skippedByName.push(`${u.tag}: ${m.header} → ${m.field} (holds "${next[m.field]}")`)
      lines.push(`   ∅ ${m.header.padEnd(34)} → ${m.field}  SKIPPED — field already holds "${next[m.field]}"`)
      continue
    }
    if (m.kind === 'exact')          { next[m.field] = m.value; wrote++;     lines.push(`   ✓ ${m.header.padEnd(34)} → ${m.field}  = ${m.value}   (${m.note})`) }
    else if (m.kind === 'converted') { next[m.field] = m.value; converted++; lines.push(`   ≈ ${m.header.padEnd(34)} → ${m.field}  = ${m.value}   (${m.note})`) }
    else if (m.kind === 'unit-mismatch') { mismatched++; lines.push(`   ! ${m.header.padEnd(34)} → ${m.field}  NOT WRITTEN  (${m.note})`) }
    else { unmatched++; lines.push(`   · ${m.header.padEnd(34)} (kept, unmapped — strip)`) }
  }
  if (!u.equipment_type) untypedMoved++

  perUnit.push({ u, next, raw, header: `── ${u.tag}  [${u.equipment_type ?? 'untyped'}]  ${Object.keys(raw).length} raw, ${Object.keys(human).length} human-kept, ${declared.length} declared`, lines })
}

for (const p of perUnit) { console.log('\n' + p.header); for (const l of p.lines) console.log(l) }

if (APPLY) {
  let applied = 0
  for (const p of perUnit) {
    const npNew = {
      ...(p.u.nameplate_extra ?? {}),
      spec: p.next,
      from_schedule: p.raw,      // the engineer's own words, verbatim, whole
    }
    const { data: done, error } = await svc.from('equipment')
      .update({ nameplate_extra: npNew }).eq('id', p.u.id).select('id')
    if (error) { console.error(`   ${p.u.tag} FAILED: ${error.message}`); process.exit(1) }
    if ((done ?? []).length !== 1) { console.error(`   ${p.u.tag} REFUSED — 0 rows updated`); process.exit(1) }
    applied++
  }
  const { error: bErr } = await svc.from('import_batches').insert({
    project_id: proj.id,
    entity_type: 'equipment',
    source_file: 'Central Tech schedule imports (pre-1.11), repointed in place',
    source_revision: 'T2(b) pilot — owner-ruled 2026-08-14',
    rows_expected: inScope,
    rows_created: applied,
    note:
      'REPOINT, not an import — the explicit act the no-silent-re-extraction law requires. '
      + `Pre-1.11 intake stored schedule readings under the schedules' own column headings in `
      + `nameplate_extra.spec, where the nameplate rendered almost none of them. ${inScope} units repointed: `
      + `${wrote} values written as-is (units agree), ${converted} after a recorded conversion `
      + `(GPM→L/s ×1/15.85, MBH→kW ×0.293, ft→kPa ×2.989, °F→°C affine, per scheduleFieldMatch), `
      + `${mismatched} refused on an unbridgeable unit, ${unmatched} unmatched by name — every raw heading `
      + `preserved verbatim in from_schedule and visible in the unit's strip; ${keptHuman} pre-existing `
      + `declared-field values kept untouched; ${skippedOccupied} matcher results skipped because the field `
      + 'already held a value (additive rule — a human edit is never overwritten). Nothing was discarded.',
  })
  if (bErr) { console.error(`batch record FAILED: ${bErr.message}`); process.exit(1) }
  console.log(`\nAPPLIED to ${applied}/${inScope} units · batch recorded in import_batches`)
}

console.log('\n' + '='.repeat(78))
console.log(`${inScope} pre-1.11 units in scope (of ${units.length} on the project) · ${totalKeys} raw readings`)
console.log(`  ${wrote} written as-is (units agree)`)
console.log(`  ${converted} written after a recorded conversion`)
console.log(`  ${mismatched} matched but unit-unbridgeable — NOT written, surfaced in the strip`)
console.log(`  ${unmatched} unmatched by name — kept, surfaced in the strip`)
console.log(`  ${keptHuman} pre-existing declared-field values kept (never matched, never overwritten)`)
console.log(`  ${skippedOccupied} matcher results skipped — field already held a value:`)
for (const s of skippedByName) console.log(`      ${s}`)
if (untypedMoved) console.log(`  ${untypedMoved} untyped unit(s): readings moved to the strip only — typing them later renders more`)
console.log(APPLY ? '\nPILOT APPLIED. The fleet does not run until the owner rules on this report.' : '\nDRY RUN — pass --apply for the sighted pilot run.')
