// IDENTITY-BLOCK AUDIT — does every type's def set say WHICH MACHINE it is?
//
// Ruled 2026-08-06 out of the fire_pump gap: that type carried 13 fields across
// 37 def rows, every one of them duty or controller, and no identity block at
// all. It could state what a fire pump is rated to do and not which machine it
// was. A def set that describes duty but not identity fails the register's first
// purpose.
//
// The hypothesis to test, stated before the run so the result can contradict it:
// the electrical and fire-protection types may share the shape, because those
// tables were drafted NETA-first, and NETA test forms assume identity is already
// established elsewhere on the report.
//
// WHAT COUNTS AS AN IDENTITY BLOCK. Three tiers, because "has a Manufacturer
// row" is too weak a bar to mean anything:
//
//   MAKE      — who built it            (manufacturer / make / vendor)
//   MODEL     — what it is              (model / catalogue / size / type no.)
//   SERIAL    — which physical unit     (serial / asset / equipment no.)
//
// A type with MAKE+MODEL can identify a product line. Only SERIAL identifies the
// unit standing in front of you, which is what a commissioning record needs when
// two identical pumps sit side by side.
//
// AND WHERE THE FIELD SITS MATTERS. `installed` is the as-built column. An
// identity field that exists only at `spec` records what was asked for, not what
// arrived — so the audit reports base-plus-shop-identity presence separately
// from bare presence. That distinction is the whole point of the three-column
// layout.
//
// READ-ONLY. Counts only, as ruled. Additive proposals follow if this finds
// siblings — nothing here writes, and nothing here drafts a fix.
//
// Run: node --env-file=.env identity-block-audit.mjs [--full]

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const FULL = process.argv.includes('--full')
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

const types = await all('equipment_types', 'key, name, kind, active')
const defs  = await all('equipment_type_field_defs', 'equipment_type, section, field_name, unit')
console.log(`read ${types.length} types · ${defs.length} def rows\n`)

const MAKE   = /\b(manufacturer|make|vendor|supplier|brand)\b/i
const MODEL  = /\b(model|catalog(ue)?|part\s*(no|number)|size|type\s*(no|number)|frame)\b/i
const SERIAL = /\b(serial|asset\s*(no|number|tag)|equipment\s*(no|number)|unit\s*(no|number))\b/i

// A performance field is what makes a MISSING identity block a defect rather
// than an empty table: a type with neither is simply undrafted.
const PERF = /\b(k?w|kva|kw|amp|amps|fla|mca|mocp|volt|voltage|phase|hz|rpm|cfm|l\/s|flow|head|pressure|capacity|tons?|btu|efficiency|cop|eer|seer|setpoint|rating|rated|torque|speed|output|input|load)\b/i

const AS_BUILT = new Set(['installed', 'shop_drawing'])

// ── THE INHERITANCE, WITHOUT WHICH THIS AUDIT IS WORTHLESS ───────────────────
//
// `__base` is a pseudo-type — a universal def set every equipment type inherits.
// `EquipmentPage.defsForType()` merges it in and lets a type's own field of the
// same NAME shadow it. So a type's own rows are NOT its field list; the merge is.
//
// The first version of this file read type rows only and reported 35 types with
// a missing identity block. Every one of those was wrong: __base carries
// Manufacturer (shop_drawing + installed), Model Number (shop_drawing +
// installed) and Serial Number (installed) — which IS the identity block, for
// every type in the register.
//
// It is the phantom-data disease pointing the third way. That section says a
// duplicate hides; its mirror says apparent duplication can be lost structure.
// This is the third face: AN AUDIT THAT DOES NOT MODEL INHERITANCE REPORTS A GAP
// THAT IS NOT THERE — and a gap report is a work order. Nothing about the wrong
// answer looked wrong: the query was correct, the counts were real, the regexes
// matched what they claimed. It was measuring the wrong set.
const BASE = defs.filter(d => d.equipment_type === '__base')
if (!BASE.length) {
  console.error('REFUSE: no __base def set found. Every conclusion here depends on it;')
  console.error('an audit that silently treats the base set as empty reports a register-wide')
  console.error('gap that does not exist. That is exactly how this file was wrong the first time.')
  process.exit(1)
}
console.log(`__base carries ${new Set(BASE.map(d => d.field_name)).size} inherited field(s): ` +
  [...new Set(BASE.map(d => d.field_name))].join(', ') + '\n')

const rows = []
for (const t of types) {
  const own = defs.filter(d => d.equipment_type === t.key)
  if (!own.length) { rows.push({ key: t.key, name: t.name, kind: t.kind, state: 'NO DEFS', fields: 0, perf: 0, missing: [], inherited_only: true }); continue }
  // the merge, as the UI performs it
  const ownNames = new Set(own.map(d => d.field_name))
  const mine = [...BASE.filter(b => !ownNames.has(b.field_name)), ...own]
  const names = [...new Set(mine.map(d => d.field_name))]
  const asBuilt = new Set(mine.filter(d => AS_BUILT.has(d.section)).map(d => d.field_name))

  const hit = (re) => names.filter(n => re.test(n))
  const make = hit(MAKE), model = hit(MODEL), serial = hit(SERIAL)
  const anyAsBuilt = arr => arr.some(n => asBuilt.has(n))

  const tiers = (make.length ? 1 : 0) + (model.length ? 1 : 0) + (serial.length ? 1 : 0)
  const perf = names.filter(n => PERF.test(n) || mine.some(d => d.field_name === n && d.unit))

  let state
  if (tiers === 3) state = 'COMPLETE'
  else if (tiers === 0) state = perf.length ? 'NO IDENTITY' : 'THIN'
  else state = 'PARTIAL'
  // A type whose identity fields exist only at `spec` records what was ordered,
  // never what arrived. Called out separately — it reads as present and is not.
  const specOnly = state !== 'NO IDENTITY' && state !== 'THIN' &&
    !anyAsBuilt([...make, ...model, ...serial])

  rows.push({ key: t.key, name: t.name, kind: t.kind, state, specOnly,
    fields: names.length, ownFields: ownNames.size, defRows: mine.length, perf: perf.length,
    shadows_base: [...ownNames].filter(n => BASE.some(b => b.field_name === n)),
    make: make[0] ?? null, model: model[0] ?? null, serial: serial[0] ?? null,
    missing: [!make.length && 'MAKE', !model.length && 'MODEL', !serial.length && 'SERIAL'].filter(Boolean) })
}

const count = s => rows.filter(r => r.state === s).length
const withPerf = rows.filter(r => r.perf > 0)
const gap = rows.filter(r => (r.state === 'NO IDENTITY' || r.state === 'PARTIAL') && r.perf > 0)

console.log('IDENTITY BLOCK — counts across the register\n')
console.log(`  types in register            ${rows.length}`)
console.log(`  types with def rows          ${rows.filter(r => r.state !== 'NO DEFS').length}`)
console.log(`  types carrying performance   ${withPerf.length}`)
console.log('')
console.log(`  COMPLETE   make + model + serial      ${count('COMPLETE')}`)
console.log(`  PARTIAL    one or two of the three    ${count('PARTIAL')}`)
console.log(`  NO IDENTITY  performance, no identity ${count('NO IDENTITY')}`)
console.log(`  THIN       neither — undrafted        ${count('THIN')}`)
console.log(`  NO DEFS                               ${count('NO DEFS')}`)
console.log('')
console.log(`  >> THE FIRE_PUMP SHAPE: ${gap.length} type(s) carry performance fields and an incomplete identity block.`)
const specOnly = rows.filter(r => r.specOnly).length
console.log(`  >> spec-only identity (records what was ORDERED, not what arrived): ${specOnly}`)

// The hypothesis, tested rather than assumed.
const byMissing = {}
for (const r of gap) for (const m of r.missing) byMissing[m] = (byMissing[m] ?? 0) + 1
console.log(`\n  which tier is missing, across those ${gap.length}:`)
for (const [k, v] of Object.entries(byMissing).sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(7)} ${v}`)

if (FULL) {
  console.log('\n  the affected types:')
  for (const r of gap.sort((a, b) => a.missing.length - b.missing.length || a.key.localeCompare(b.key)))
    console.log(`     ${r.key.padEnd(22)} ${String(r.fields).padStart(2)}f  missing: ${r.missing.join(', ')}`)
} else {
  console.log('\n  (--full lists them; counts only, as ruled)')
}

writeFileSync('out/identity-block-audit.json', JSON.stringify(rows, null, 2))
console.log(`\nreport → out/identity-block-audit.json   NOTHING WRITTEN to the register.`)
