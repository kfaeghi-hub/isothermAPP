// avondale-schedule-gate — Adam's three real Avondale schedules, parsed by the
// SHIPPED parser, asserted against the answers a commissioning engineer would
// give reading the same sheets.
//
// WHY A REAL-FILE GATE EXISTS AT ALL. The unit tests prove the laws over grids I
// typed myself, and a grid I typed cannot surprise me. These three files did:
// clean headers, no conversion damage, and still every pump came out wrong —
// two as boilers, two as nothing — because SERVICE was being read as the
// description and because a group header on the banner row hid the title.
// Nothing synthetic had that shape until after the incident named it.
//
// THE FILES ARE CLIENT CONTENT AND ARE NOT COMMITTED. They live in gitignored
// samples/, exactly as the drawing fixtures do. So this gate SKIPS LOUDLY BY
// NAME when they are absent rather than passing on a corpus that was not there —
// the calibration FIXTURES.md rule, applied to schedules. A gate that quietly
// reports success on zero files is the failure mode this whole campaign is about.
//
// Read-only: no network beyond the vocabulary read, no writes, no project touched.
import { existsSync, readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('avondale-schedule-gate')

const DIR = 'samples/excel&pdf-schedule-samples'

/** What each file must yield. Written by hand from the sheets, not recorded from a run. */
const EXPECTED = [
  {
    file: 'AS.xlsx', title: 'AIR SEPARATORS',
    // No DESCRIPTION and no TYPE column — the title is the only identity evidence.
    mapped: { tag: 'TAG', location: 'LOCATION', area_served: 'SERVICE' },
    units: { 'AS-1': 'air_separator' },
    specAtLeast: 7,
  },
  {
    file: 'Boilers.xlsx', title: 'HEATING BOILERS',
    mapped: { tag: 'TAG', descriptor: 'TYPE', location: 'LOCATION', area_served: 'SERVICE' },
    units: { 'B-1': 'boiler', 'B-2': 'boiler' },
    specAtLeast: 8,
  },
  {
    // THE FILE THE CAMPAIGN IS NAMED FOR. Every one of these four was wrong
    // before: BP-1/BP-2 typed `boiler` from SERVICE "BOILER B-1 PRIMARY LOOP",
    // P-1/P-2 typed nothing at all.
    file: 'PMPs.xlsx', title: 'PUMPS',
    mapped: { tag: 'TAG', descriptor: 'TYPE', location: 'LOCATION', area_served: 'SERVICE' },
    units: { 'BP-1': 'pump', 'BP-2': 'pump', 'P-1': 'pump', 'P-2': 'pump' },
    specAtLeast: 12,
  },
]

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const missing = EXPECTED.filter(e => !existsSync(`${DIR}/${e.file}`)).map(e => e.file)
if (missing.length) {
  console.log('\n' + '='.repeat(70))
  console.log('SKIPPED — the Avondale schedule fixtures are not present.')
  console.log(`  missing: ${missing.join(', ')}`)
  console.log(`  expected in: ${DIR}/  (gitignored — client content, never committed)`)
  console.log('  This gate proves the served-vs-is law and the banner-title fix')
  console.log('  against the REAL files that produced the defect. It is skipping,')
  console.log('  not passing. Restore the files from ShareSync to run it.')
  console.log('='.repeat(70))
  process.exit(0)
}

await build({
  entryPoints: ['src/lib/intakeExcel.ts'], outfile: 'out/intakeExcel.gate.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
})
const { parseSheet, readSheetMerges } = await import('./out/intakeExcel.gate.mjs')

// The REAL firm vocabulary, loaded the way the app loads it. A gate run against a
// hand-written vocabulary would prove the parser agrees with my typing, not that
// Adam's schedules resolve against the types the firm actually has.
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [tRes, aRes] = await Promise.all([
  svc.from('equipment_types').select('key, name').eq('active', true).order('sort_order'),
  svc.from('equipment_type_aliases').select('type_key, alias'),
])
if (tRes.error || aRes.error) {
  console.error('vocabulary read failed:', (tRes.error ?? aRes.error).message); process.exit(1)
}
const byKey = new Map()
for (const a of aRes.data ?? []) byKey.set(a.type_key, [...(byKey.get(a.type_key) ?? []), a.alias])
const vocab = tRes.data.map(t => ({ key: t.key, name: t.name, aliases: byKey.get(t.key) ?? [] }))
console.log(`vocabulary: ${vocab.length} active types, ${aRes.data.length} aliases\n`)

const readXlsxFile = (await import('read-excel-file/node')).default

for (const exp of EXPECTED) {
  console.log(`── ${exp.file}`)
  const bytes = readFileSync(`${DIR}/${exp.file}`)
  const sheets = await readXlsxFile(bytes, { trim: true })
  const merges = await readSheetMerges(bytes)
  const p = parseSheet(sheets[0].data, sheets[0].sheet, vocab, { merges: merges[sheets[0].sheet] ?? [] })

  check(p.title === exp.title, `title reads "${exp.title}" (got ${JSON.stringify(p.title)})`)

  for (const [field, header] of Object.entries(exp.mapped)) {
    check(p.mapping[field] === header, `${field} maps to "${header}" (got ${JSON.stringify(p.mapping[field])})`)
  }
  // SERVICE must never be the descriptor. Asserted directly, because this is the
  // defect — not implied by the positive mapping checks above.
  check(p.mapping.descriptor !== 'SERVICE', 'SERVICE is NOT the descriptor — a duty never describes the unit')

  const byTag = new Map(p.rows.map(r => [r.tag, r]))
  check(byTag.size === Object.keys(exp.units).length,
    `${Object.keys(exp.units).length} unit(s) read (got ${byTag.size}: ${[...byTag.keys()].join(', ')})`)

  for (const [tag, type] of Object.entries(exp.units)) {
    const row = byTag.get(tag)
    check(row?.proposed_type === type,
      `${tag} types as ${type} (got ${row ? row.proposed_type : 'ROW MISSING'})`)
    check((Object.keys(row?.nameplate ?? {}).length) >= exp.specAtLeast,
      `${tag} carries >= ${exp.specAtLeast} spec values (got ${Object.keys(row?.nameplate ?? {}).length})`)
  }
  console.log()
}

// The headline claim, stated once as a whole: not one unit is typed as something
// it is attached to.
console.log('='.repeat(70))
console.log(fail
  ? `FAIL — ${fail} of ${pass + fail}`
  : `PASS — ${pass} checks. Adam's three schedules type correctly: 4 pumps, 2 boilers, 1 air separator.`)
process.exit(fail ? 1 : 0)
