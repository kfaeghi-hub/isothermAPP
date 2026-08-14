// apply-fleet-riders.mjs — riders 2 and 3 of the fleet ruling, owner-ruled
// 2026-08-14. [RIVET]
//
//   node --env-file=.env apply-fleet-riders.mjs            (DRY RUN — writes nothing)
//   node --env-file=.env apply-fleet-riders.mjs --apply
//
// RIDER 2 — Central Tech's water trio, an EXPLICIT ACT on a sovereign copy.
// The campaign's forward-only rule left Central Tech's pre-T4 unit_heater copy
// without Flow / EWT / LWT; the owner authorizes adding them, matching the
// firm defs exactly. Central Tech is metric, so the project rows carry the
// metric unit strings (a project copy resolves its label at seeding — it has
// no unit_imperial column by design). Additive: appended at the firm sort
// orders, existing rows untouched, the T5 unique index backing the refusal.
//
// RIDER 3 — the full-phrase alias 'FAN FORCED HEATER' → unit_heater, taken.
// Exact-match-only per the standing law (a multi-word alias matches the whole
// string and never as words); authed so created_by is carried; the 3r history
// trigger records the add; blocked-list and collision checks asserted in the
// act.
//
// Both acts resolve-and-refuse before any write and are recorded in
// import_batches as human-ruled writes with the tallies in the note.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials } from './pw-config.mjs'

const APPLY = process.argv.includes('--apply')
const PROJECT = 'Central Tech'
const TYPE = 'unit_heater'
const TRIO = ['Flow', 'Entering Water Temp', 'Leaving Water Temp']
const PHRASE = 'FAN FORCED HEATER'
const NOTE3 = 'Owner-ruled 2026-08-14 (RIVET fleet riders, rider 3): full-phrase alias for the ' +
  'schedule dialect the FFH proposal arrived under. Exact-match-only per the standing law.'

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: aErr } = await adm.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }

try {
  // ── RIDER 2: resolve, refuse, then add the trio ───────────────────────────
  const { data: proj } = await adm.from('projects').select('id, name, unit_system').eq('name', PROJECT).single()
  if (!proj) { console.error(`REFUSING: project "${PROJECT}" not found.`); process.exit(1) }
  if (proj.unit_system !== 'metric') {
    console.error(`REFUSING: ${PROJECT} is ${proj.unit_system}, and this act hardcodes the metric labels.`)
    process.exit(1)
  }

  const { data: firmTrio } = await adm.from('equipment_type_field_defs')
    .select('section, field_name, unit, sort_order')
    .eq('equipment_type', TYPE).in('field_name', TRIO)
  if ((firmTrio?.length ?? 0) !== 9) {
    console.error(`REFUSING: firm trio incomplete — expected 9 rows, found ${firmTrio?.length ?? 0}.`)
    process.exit(1)
  }

  const { data: existing } = await adm.from('project_equipment_field_defs')
    .select('section, field_name').eq('project_id', proj.id).eq('equipment_type', TYPE)
  const have = new Set((existing ?? []).map(r => `${r.section}|${r.field_name}`))
  const clashes = firmTrio.filter(f => have.has(`${f.section}|${f.field_name}`))
  if (clashes.length) {
    console.error(`REFUSING: ${clashes.length} of the trio already exist on ${PROJECT}'s copy — ` +
      clashes.map(c => `${c.field_name} (${c.section})`).join(', ') + '. The act has already happened, or the copy moved.')
    process.exit(1)
  }

  console.log(`RIDER 2 · ${PROJECT} (${proj.unit_system}) · ${TYPE} copy holds ${existing?.length ?? 0} rows`)
  for (const f of firmTrio) console.log(`  + ${f.field_name.padEnd(22)} ${f.section.padEnd(13)} ${f.unit ?? '—'}  sort ${f.sort_order}`)

  // ── RIDER 3: resolve, refuse, then add the alias ──────────────────────────
  const [{ data: blocked }, { data: clash }] = await Promise.all([
    adm.from('blocked_type_aliases').select('alias, reason').ilike('alias', PHRASE),
    adm.from('equipment_type_aliases').select('type_key').ilike('alias', PHRASE),
  ])
  if (blocked?.length) { console.error(`REFUSING: "${PHRASE}" is on the never-alias list — ${blocked[0].reason}`); process.exit(1) }
  if (clash?.length) { console.error(`REFUSING: alias "${PHRASE}" already exists on ${clash[0].type_key}.`); process.exit(1) }
  console.log(`\nRIDER 3 · alias "${PHRASE}" → ${TYPE} (exact match, authed, noted) — no collision`)

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0) }

  // ── writes, arrival asserted ──────────────────────────────────────────────
  const { data: added, error: insErr } = await adm.from('project_equipment_field_defs')
    .insert(firmTrio.map(f => ({
      project_id: proj.id, equipment_type: TYPE,
      section: f.section, field_name: f.field_name, unit: f.unit, sort_order: f.sort_order,
    }))).select('id')
  if (insErr) { console.error(`trio insert failed: ${insErr.message}`); process.exit(1) }
  if ((added?.length ?? 0) !== 9) { console.error(`ARRIVAL MISMATCH: expected 9, wrote ${added?.length ?? 0}.`); process.exit(1) }

  const { error: aliasErr } = await adm.from('equipment_type_aliases')
    .insert({ type_key: TYPE, alias: PHRASE, note: NOTE3, created_by: auth.user.id })
  if (aliasErr) { console.error(`alias insert failed: ${aliasErr.message}`); process.exit(1) }

  const { error: bErr } = await adm.from('import_batches').insert({
    project_id: proj.id,
    entity_type: 'equipment',
    source_file: 'field-structure act (no source document)',
    source_revision: 'fleet riders 2+3 — owner-ruled 2026-08-14',
    rows_expected: 9, rows_created: 9,
    note: 'EXPLICIT ACT on a sovereign copy, owner-authorized: Central Tech unit_heater gains the T4 ' +
      'water trio (Flow L/s, Entering/Leaving Water Temp °C — spec/shop/installed, sort 19-21), matching ' +
      'the firm defs exactly; the campaign forward-only rule was deliberately overridden for this project ' +
      'so the FFH schedule readings have a landing site once the matcher unit-case fix arrives. ' +
      'Same ruling took the full-phrase alias FAN FORCED HEATER → unit_heater (exact-match tier, authed).',
  })
  if (bErr) { console.error(`batch record FAILED: ${bErr.message}`); process.exit(1) }

  const { count: after } = await adm.from('project_equipment_field_defs')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('equipment_type', TYPE)
  console.log(`\nAPPLIED: trio 9/9 (copy now ${after} rows) · alias recorded · batch noted`)
} finally {
  await adm.auth.signOut().catch(() => {})
}
