// apply-seneca-categories.mjs — the Seneca register category cleanup,
// owner-ruled 2026-08-17 (surfaced by the Cx Index export: these names print
// on client paper). [RIVET]
//
//   node --env-file=.env apply-seneca-categories.mjs            (DRY RUN)
//   node --env-file=.env apply-seneca-categories.mjs --apply
//
// EXECUTED (uncontested — verified to key nothing):
//   AIR HANDLING UNITS                            → AIR HANDLING UNIT   (merge, plural retires)
//   ELECTRONIC HUMIDIFIER SCHEDULE                → HUMIDIFIER
//   RADIANT PANEL SCHEDULE                        → RADIANT PANEL
//   DEHUMIDIFICATION UNIT SCHEDULE (WATER COOLED) → DEHUMIDIFICATION UNIT
//     (DHU-01's descriptor is NULL, so the water-cooled qualifier lived ONLY
//      in the category string; per "report, don't invent" it moves into the
//      batch note, not the descriptor. The owner decides its permanent home.)
//
// HELD — STOP-AND-SHOW STANDS (verified 2026-08-17): two PENDING
// category-scoped exception proposals name these strings and expand against
// equipment.category at ratify time; renaming under them destroys their
// meaning. They wait for the owner's (a)/(b)/(c):
//   BUFFER TANK SCHEDULE     (2 units — proposal: Electrical Static n/a)
//   EXPANSION TANK SCHEDULE  (8 units — proposal: Electrical Static n/a)
//
// Categories are TEXT on equipment rows — a "retired" category is one no row
// carries; nothing else to delete. cx_applicability_rules verified to key on
// equipment_type × stage_group_name only. Resolve-and-refuse: the project
// resolves by name and every category's unit count is asserted against the
// ruled census BEFORE any write; a moved register refuses.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials } from './pw-config.mjs'

const APPLY = process.argv.includes('--apply')
const PROJECT = 'Seneca Health and Wellness Center'

const RENAMES = [
  { from: 'AIR HANDLING UNITS',                            to: 'AIR HANDLING UNIT',     expect: 1 },
  { from: 'ELECTRONIC HUMIDIFIER SCHEDULE',                to: 'HUMIDIFIER',            expect: 8 },
  { from: 'RADIANT PANEL SCHEDULE',                        to: 'RADIANT PANEL',         expect: 2 },
  { from: 'DEHUMIDIFICATION UNIT SCHEDULE (WATER COOLED)', to: 'DEHUMIDIFICATION UNIT', expect: 1 },
]
const HELD = [
  { from: 'BUFFER TANK SCHEDULE',    expect: 2, why: 'pending category-scoped exception proposal names it' },
  { from: 'EXPANSION TANK SCHEDULE', expect: 8, why: 'pending category-scoped exception proposal names it' },
]

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: aErr } = await adm.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }

try {
  const { data: proj } = await adm.from('projects').select('id, name').eq('name', PROJECT).single()
  if (!proj) { console.error(`REFUSING: project "${PROJECT}" not found.`); process.exit(1) }

  // ── resolve-and-refuse: the census must match the ruling's numbers ────────
  let refused = false
  for (const r of [...RENAMES, ...HELD]) {
    const { count } = await adm.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', r.from)
    r.actual = count ?? 0
    if (r.actual !== r.expect) {
      console.error(`REFUSING: "${r.from}" holds ${r.actual} unit(s), ruling expected ${r.expect} — the register moved.`)
      refused = true
    }
  }
  // The keying check, re-run at act time (not remembered from the audit):
  const allNames = [...RENAMES, ...HELD].map(r => r.from)
  const { data: keyed } = await adm.from('cx_applicability_proposals')
    .select('equipment_category, status').eq('project_id', proj.id)
    .in('equipment_category', allNames).eq('status', 'proposed')
  const keyedNames = new Set((keyed ?? []).map(k => k.equipment_category))
  for (const r of RENAMES) {
    if (keyedNames.has(r.from)) {
      console.error(`REFUSING: "${r.from}" is named by a pending proposal — it belongs on the HELD list.`)
      refused = true
    }
  }
  if (refused) process.exit(1)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'} · ${proj.name}\n`)
  for (const r of RENAMES) console.log(`  ${r.from}  →  ${r.to}   (${r.actual} unit(s))`)
  for (const h of HELD)    console.log(`  HELD: ${h.from}   (${h.actual} unit(s)) — ${h.why}`)

  if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0) }

  let moved = 0
  for (const r of RENAMES) {
    const { data: done, error } = await adm.from('equipment')
      .update({ category: r.to }).eq('project_id', proj.id).eq('category', r.from).select('id')
    if (error) { console.error(`  ${r.from} FAILED: ${error.message}`); process.exit(1) }
    if ((done ?? []).length !== r.expect) {
      console.error(`  ARRIVAL MISMATCH on "${r.from}": expected ${r.expect}, updated ${done?.length ?? 0}.`)
      process.exit(1)
    }
    moved += done.length
  }

  const { error: bErr } = await adm.from('import_batches').insert({
    project_id: proj.id,
    entity_type: 'equipment',
    source_file: 'register category cleanup (no source document)',
    source_revision: 'owner-ruled 2026-08-17 — Cx Index export audit',
    rows_expected: moved, rows_created: moved,
    note: 'CATEGORY CLEANUP, owner-ruled: AIR HANDLING UNITS (plural, AHU-5) merged into AIR HANDLING UNIT; ' +
      'ELECTRONIC HUMIDIFIER SCHEDULE → HUMIDIFIER (8); RADIANT PANEL SCHEDULE → RADIANT PANEL (2); ' +
      'DEHUMIDIFICATION UNIT SCHEDULE (WATER COOLED) → DEHUMIDIFICATION UNIT (1). PROVENANCE PRESERVED HERE: ' +
      'DHU-01 was WATER COOLED per its old category; its descriptor is null, so this note is now the only ' +
      'record of the qualifier pending the owner’s call on its permanent home. ' +
      'BUFFER TANK SCHEDULE and EXPANSION TANK SCHEDULE deliberately NOT renamed: pending category-scoped ' +
      'applicability exceptions name them (stop-and-show delivered 2026-08-17).',
  })
  if (bErr) { console.error(`batch record FAILED: ${bErr.message}`); process.exit(1) }

  // ── read-back: old names empty, new names hold the counts ─────────────────
  let bad = 0
  for (const r of RENAMES) {
    const { count: oldLeft } = await adm.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', r.from)
    const { count: nowHave } = await adm.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', r.to)
    const ok = oldLeft === 0 && (r.from === 'AIR HANDLING UNITS' ? nowHave === 5 : nowHave >= r.expect)
    console.log(`  ${ok ? 'OK ' : 'BAD'} ${r.to}: old-name rows ${oldLeft}, new-name rows ${nowHave}`)
    if (!ok) bad++
  }
  console.log(`\nAPPLIED: ${moved} unit(s) recategorized · batch noted · ${bad === 0 ? 'read-back clean' : `${bad} READ-BACK FAILURES`}`)
  if (bad) process.exit(1)
} finally {
  await adm.auth.signOut().catch(() => {})
}
