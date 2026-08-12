// avondale-repoint — correct Adam's seven Avondale units, as a DELIBERATE
// RECORDED ACT rather than a drift.
//
// WHAT WENT WRONG. His three schedules imported cleanly and produced:
//   · BP-1, BP-2 typed `boiler`, because their SERVICE column read
//     "BOILER B-1 PRIMARY LOOP" and `service` was being taken as the description
//   · P-1, P-2 typed nothing at all
//   · 77 spec values written into nameplate_extra.spec under the SCHEDULE'S own
//     headings, of which ZERO could render, because the nameplate table draws its
//     rows from the firm's declared field names
//
// The parser is fixed (see the served-vs-is law). This repairs what the old
// parser already wrote, which a parser fix cannot reach.
//
// TWO RULES THIS OBEYS.
//   1. DRY RUN IS THE DEFAULT. It prints the whole before/after and writes
//      nothing unless --apply is passed. A script that corrects a live client
//      register on invocation is one typo away from being the incident.
//   2. NO NUMBER MOVES INTO A LABEL THAT MEANS SOMETHING ELSE. Values are written
//      only where the units agree or a known conversion bridges them, and the
//      arithmetic is printed. Everything else is REPORTED and left alone.
//
// The whole run is batch-tagged so the register shows a correction with an
// author, not values that changed for no recorded reason.
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('avondale-repoint')

const APPLY = process.argv.includes('--apply')
const PROJECT = 'Avondale SAS - Heating Rplc'

// The intended type for each unit, written by hand from the schedules.
const RETYPE = { 'BP-1': 'pump', 'BP-2': 'pump', 'P-1': 'pump', 'P-2': 'pump' }

await build({
  entryPoints: ['src/lib/scheduleFieldMatch.ts'], outfile: 'out/sfm.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
})
const { matchScheduleSpec } = await import('./out/sfm.mjs')

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: proj, error: pErr } = await svc.from('projects').select('id, name').eq('name', PROJECT).single()
if (pErr) { console.error(`project "${PROJECT}" not found: ${pErr.message}`); process.exit(1) }

const { data: units, error: eErr } = await svc.from('equipment')
  .select('id, tag, equipment_type, nameplate_extra').eq('project_id', proj.id).order('tag')
if (eErr) { console.error(eErr.message); process.exit(1) }

console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'} · ${proj.name} · ${units.length} units\n`)

// ── 1 · retype, so the def-seeding trigger gives the pumps their templates ────
// The BEFORE state is captured before anything moves — once the update lands,
// what BP-1 used to be is unrecoverable from the row itself.
const BEFORE = Object.fromEntries(units.map(u => [u.tag, u.equipment_type]))

for (const [tag, type] of Object.entries(RETYPE)) {
  const u = units.find(x => x.tag === tag)
  if (!u) { console.log(`  ${tag}: NOT FOUND — skipped`); continue }
  if (u.equipment_type === type) { console.log(`  ${tag}: already ${type}`); continue }
  console.log(`  ${tag}: ${u.equipment_type ?? '(untyped)'} → ${type}`)
  if (APPLY) {
    const { data: done, error } = await svc.from('equipment')
      .update({ equipment_type: type }).eq('id', u.id).select('id')
    if (error) { console.error(`    FAILED: ${error.message}`); process.exit(1) }
    // Assert the arrival. A silently-refused update returns zero rows, no error.
    if ((done ?? []).length !== 1) { console.error(`    REFUSED — 0 rows updated`); process.exit(1) }
    u.equipment_type = type
  }
}

if (APPLY) {
  // The trigger seeds project_equipment_field_defs from the type's template.
  // Give it a moment, then verify rather than assume.
  await new Promise(r => setTimeout(r, 1500))
}

// ── 2 · match the stored spec keys against each unit's now-correct defs ───────
// WHICH DEFS THE PREVIEW READS IS NOT A DETAIL.
//
// The first run of this script matched all four pumps against BOILER fields and
// reported almost nothing landing — because in a dry run the retype has not
// happened, so the project holds no pump defs to match against. The preview was
// truthful about the database and useless as a preview: it described a state that
// will not exist by the time anything is written.
//
// So a dry run reads the TYPE TEMPLATE for the type each unit is about to become,
// which is exactly what the seeding trigger will copy in. An apply reads the
// project defs the trigger actually seeded — and verifies they arrived rather
// than assuming the trigger fired.
const intendedType = u => RETYPE[u.tag] ?? u.equipment_type ?? ''

let declaredFor
if (APPLY) {
  const { data: defs } = await svc.from('project_equipment_field_defs')
    .select('equipment_type, section, field_name, unit').eq('project_id', proj.id)
  for (const t of new Set(Object.values(RETYPE))) {
    const seeded = (defs ?? []).filter(d => d.equipment_type === t && d.section === 'spec')
    if (!seeded.length) {
      console.error(`\nSTOPPING — the def-seeding trigger left no spec fields for "${t}".`)
      console.error('Writing spec values now would put them where nothing can render them,')
      console.error('which is the exact defect this repoint exists to end.')
      process.exit(1)
    }
    console.log(`  def seeding: ${t} → ${seeded.length} spec fields present`)
  }
  declaredFor = type => (defs ?? [])
    .filter(d => d.section === 'spec' && (d.equipment_type === type || d.equipment_type === '__base'))
    .map(d => ({ field_name: d.field_name, unit: d.unit }))
} else {
  // FILTERED TO THE TYPES IN PLAY, NOT THE WHOLE TABLE.
  //
  // A plain select here returned 1000 of 1526 rows — PostgREST's default cap,
  // applied without an error — and `air_separator` fell outside the page. AS-1
  // then previewed as "0 declared spec fields", which reads as "this type has no
  // template" and is instead "you did not receive the rows". Caught because the
  // number moved between two runs; nothing in the response said anything.
  const wanted = [...new Set([...units.map(intendedType), '__base'])].filter(Boolean)
  const { data: tmpl, error: tErr } = await svc.from('equipment_type_field_defs')
    .select('equipment_type, section, field_name, unit').in('equipment_type', wanted)
  if (tErr) { console.error(tErr.message); process.exit(1) }
  for (const t of wanted) {
    if (t !== '__base' && !(tmpl ?? []).some(d => d.equipment_type === t && d.section === 'spec')) {
      console.error(`STOPPING — no spec template found for type "${t}". Preview would be a lie.`)
      process.exit(1)
    }
  }
  declaredFor = type => (tmpl ?? [])
    .filter(d => d.section === 'spec' && (d.equipment_type === type || d.equipment_type === '__base'))
    .map(d => ({ field_name: d.field_name, unit: d.unit }))
}

let wrote = 0, converted = 0, mismatched = 0, unmatched = 0, totalKeys = 0
const leftovers = {}

for (const u of units) {
  const spec = u.nameplate_extra?.spec ?? {}
  const keys = Object.keys(spec)
  if (!keys.length) continue
  const declared = declaredFor(intendedType(u))
  const matches = matchScheduleSpec(spec, declared)
  totalKeys += keys.length

  console.log(`\n── ${u.tag}  [${intendedType(u)}]  ${keys.length} stored, ${declared.length} declared spec fields`)

  const next = {}
  const strip = []
  for (const m of matches) {
    if (m.kind === 'exact')      { next[m.field] = m.value; wrote++;    console.log(`   ✓ ${m.header.padEnd(34)} → ${m.field}  = ${m.value}   (${m.note})`) }
    else if (m.kind === 'converted') { next[m.field] = m.value; converted++; console.log(`   ≈ ${m.header.padEnd(34)} → ${m.field}  = ${m.value}   (${m.note})`) }
    else if (m.kind === 'unit-mismatch') { mismatched++; strip.push(m); console.log(`   ! ${m.header.padEnd(34)} → ${m.field}  NOT WRITTEN  (${m.note})`) }
    else { unmatched++; strip.push(m); console.log(`   · ${m.header.padEnd(34)} (kept, unmapped)`) }
  }
  leftovers[u.tag] = strip.length

  if (APPLY) {
    // The ORIGINAL schedule reading is never destroyed. `spec` gains the matched
    // values under their declared names; `from_schedule` keeps every heading
    // exactly as the engineer wrote it, so the strip can show what did not map and
    // a later harvest can still read the source dialect.
    const np = {
      ...(u.nameplate_extra ?? { spec: {}, shop_drawing: {}, installed: {} }),
      spec: { ...next },
      from_schedule: spec,
    }
    const { data: done, error } = await svc.from('equipment')
      .update({ nameplate_extra: np }).eq('id', u.id).select('id')
    if (error) { console.error(`   FAILED: ${error.message}`); process.exit(1) }
    if ((done ?? []).length !== 1) { console.error(`   REFUSED — 0 rows updated`); process.exit(1) }
  }
}

// ── 3 · the batch record — a correction with an author, not a drift ──────────
//
// A live client register just changed. Without a row saying WHO changed it, WHY,
// and what it looked like before, the next person reading BP-1 sees a pump that
// has always been a pump, and the boiler it used to be leaves no trace. The
// per-unit before/after is written into the note, not summarised away.
if (APPLY) {
  const lines = Object.entries(RETYPE).map(([tag, to]) => `${tag}: ${BEFORE[tag] ?? '(untyped)'} -> ${to}`)
  const { error: bErr } = await svc.from('import_batches').insert({
    project_id: proj.id,
    entity_type: 'equipment',
    source_file: 'AS.xlsx, Boilers.xlsx, PMPs.xlsx (Avondale schedules, re-read 2026-08-11)',
    source_revision: 'served-vs-is parser correction + schedule->field spec match',
    rows_expected: units.length,
    rows_created: units.length,
    note:
      'CORRECTION, not an import. The original intake typed BP-1/BP-2 as `boiler` because their '
      + 'SERVICE column read "BOILER B-1 PRIMARY LOOP" and `service` was being read as the description; '
      + 'P-1/P-2 typed as nothing. 77 spec values were written under the schedules own column headings '
      + 'and none could render, because the nameplate table draws its rows from the firms declared field names. '
      + `Retyped: ${lines.join('; ')}. `
      + `Spec matched against the declared fields: ${wrote} written as-is, ${converted} after a recorded unit `
      + `conversion (MBH->kW, GPM->L/s, ft->kPa, HP->kW), ${mismatched} refused on an unbridgeable unit, `
      + `${unmatched} unmatched. All ${mismatched + unmatched} are preserved verbatim under `
      + 'nameplate_extra.from_schedule and shown on the unit; nothing was discarded.',
  })
  if (bErr) { console.error(`batch record FAILED: ${bErr.message}`); process.exit(1) }
  console.log('\nbatch recorded in import_batches')
}

console.log('\n' + '='.repeat(78))
console.log(`${totalKeys} stored spec values across ${units.length} units`)
console.log(`  ${wrote} written as-is (units agree)`)
console.log(`  ${converted} written after a recorded conversion`)
console.log(`  ${mismatched} field matched but units cannot be bridged — NOT written, surfaced`)
console.log(`  ${unmatched} no declared field claims them — kept, surfaced`)
console.log(`  → ${wrote + converted} of ${totalKeys} now render; ${mismatched + unmatched} visible in the unmapped strip; 0 lost`)
console.log(APPLY ? '\nAPPLIED.' : '\nDRY RUN — pass --apply to write.')
