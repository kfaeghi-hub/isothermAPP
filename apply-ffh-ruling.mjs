// apply-ffh-ruling.mjs — T6, owner-ruled 2026-08-14: FAN FORCED HEATER maps to
// unit_heater. [RIVET]
//
//   node --env-file=.env apply-ffh-ruling.mjs            (DIFF ONLY — writes nothing)
//   node --env-file=.env apply-ffh-ruling.mjs --apply
//
// THE RULING (quoted from the owner's instruction): "map FAN FORCED HEATER →
// unit_heater, per the Clairlea precedent and variants-are-data — a force-flow
// heater's verification scope is a unit heater's. Execute through the
// ratification queue's own approve path; add the FFH alias through the ratified
// alias path with its note naming this triage as the reason."
//
// What this performs, exactly the queue UI's own semantics:
//   1. the proposal row → status 'mapped', resolved_type 'unit_heater',
//      ratified_at stamped (mapProposal's write, verbatim);
//   2. the waiting units (equipment_type IS NULL, observed name matches) →
//      typed unit_heater with observed_type_name cleared — the same shape the
//      TypePicker writes when a human types a unit. Def seeding is the
//      equipment_seed_defs trigger's job; on Central Tech the sovereign copy
//      already exists and must NOT re-seed (asserted after the write);
//   3. the alias 'FFH' → unit_heater, inserted authed (created_by carried) with
//      the ruling note — the 3r history trigger records the add.
//
// Resolve-and-refuse: every target is resolved by content and the counts are
// asserted BEFORE any write. A moved target refuses; nothing is pattern-deleted.
// Writes run as dev.admin (authed, RLS-honest), never the service role.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials } from './pw-config.mjs'

const APPLY = process.argv.includes('--apply')
const OBSERVED = 'FAN FORCED HEATER'
const TARGET = 'unit_heater'
const ALIAS = 'FFH'
const NOTE = 'Owner-ruled 2026-08-14 (RIVET triage T6): FFH maps to Unit Heater — ' +
  'Clairlea precedent, variants-are-data; a force-flow heater’s verification ' +
  'scope is a unit heater’s. No collision: not in blocked_type_aliases.'

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: aErr } = await adm.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }

try {
  // ── resolve every target, refuse anything moved ───────────────────────────
  const { data: props } = await adm.from('proposed_equipment_types')
    .select('id, observed_name, status').eq('status', 'proposed').ilike('observed_name', OBSERVED)
  if ((props?.length ?? 0) !== 1) {
    console.error(`REFUSING: expected exactly 1 open "${OBSERVED}" proposal, found ${props?.length ?? 0}.`)
    process.exit(1)
  }

  const { data: target } = await adm.from('equipment_types')
    .select('key, name, active').eq('key', TARGET).single()
  if (!target?.active) {
    console.error(`REFUSING: target type "${TARGET}" missing or inactive.`)
    process.exit(1)
  }

  const { data: waiting } = await adm.from('equipment')
    .select('id, tag, project_id, projects(name)')
    .is('equipment_type', null).ilike('observed_type_name', OBSERVED)
  if ((waiting?.length ?? 0) === 0) {
    console.error('REFUSING: zero waiting units — the queue count this ruling was made on has moved.')
    process.exit(1)
  }

  const { data: blocked } = await adm.from('blocked_type_aliases').select('alias, reason')
    .ilike('alias', ALIAS)
  if (blocked?.length) {
    console.error(`REFUSING: "${ALIAS}" is on the never-alias list — ${blocked[0].reason}`)
    process.exit(1)
  }
  const { data: aliasClash } = await adm.from('equipment_type_aliases')
    .select('type_key').ilike('alias', ALIAS)
  if (aliasClash?.length) {
    console.error(`REFUSING: alias "${ALIAS}" already exists on ${aliasClash[0].type_key}.`)
    process.exit(1)
  }

  console.log(`proposal ${props[0].id} · "${OBSERVED}" → ${TARGET} (${target.name})`)
  console.log(`${waiting.length} waiting unit(s):`)
  for (const u of waiting) console.log(`  ${u.tag}  —  ${u.projects?.name}`)
  console.log(`alias to add: "${ALIAS}" → ${TARGET} (authed, noted)`)

  if (!APPLY) { console.log('\nDIFF ONLY — nothing written. Re-run with --apply.'); process.exit(0) }

  // ── 1. the queue's own approve write ──────────────────────────────────────
  const { error: mapErr } = await adm.from('proposed_equipment_types')
    .update({ status: 'mapped', resolved_type: TARGET, ratified_at: new Date().toISOString() })
    .eq('id', props[0].id)
  if (mapErr) { console.error(`proposal update failed: ${mapErr.message}`); process.exit(1) }

  // ── 2. the waiting units, arrival asserted ────────────────────────────────
  const { data: typed, error: typeErr } = await adm.from('equipment')
    .update({ equipment_type: TARGET, observed_type_name: null })
    .is('equipment_type', null).ilike('observed_type_name', OBSERVED)
    .select('id, tag')
  if (typeErr) { console.error(`unit typing failed: ${typeErr.message}`); process.exit(1) }
  if ((typed?.length ?? 0) !== waiting.length) {
    console.error(`ARRIVAL MISMATCH: ${waiting.length} waiting, ${typed?.length ?? 0} typed. Investigate before re-running.`)
    process.exit(1)
  }

  // ── 3. the alias, authed + noted (3r history trigger records it) ──────────
  const { error: aliasErr } = await adm.from('equipment_type_aliases')
    .insert({ type_key: TARGET, alias: ALIAS, note: NOTE, created_by: auth.user.id })
  if (aliasErr) { console.error(`alias insert failed: ${aliasErr.message}`); process.exit(1) }

  // ── read back: the state the ruling described now holds ───────────────────
  const [{ count: stillWaiting }, { data: aliasRow }, { count: ctDefs }] = await Promise.all([
    adm.from('equipment').select('id', { count: 'exact', head: true })
      .is('equipment_type', null).ilike('observed_type_name', OBSERVED),
    adm.from('equipment_type_aliases').select('alias, note, created_by').eq('type_key', TARGET).eq('alias', ALIAS),
    adm.from('project_equipment_field_defs').select('id', { count: 'exact', head: true })
      .eq('project_id', waiting[0].project_id).eq('equipment_type', TARGET),
  ])
  console.log(`\napplied: ${typed.length} unit(s) typed ${TARGET} · proposal mapped · alias "${ALIAS}" recorded (author ${aliasRow?.[0]?.created_by ? 'carried' : 'MISSING'})`)
  console.log(`still waiting under "${OBSERVED}": ${stillWaiting} (must be 0)`)
  console.log(`Central Tech ${TARGET} project defs: ${ctDefs} (sovereign copy — must be unchanged at 45, NOT re-seeded)`)
  if (stillWaiting !== 0 || ctDefs !== 45) process.exit(1)
} finally {
  await adm.auth.signOut().catch(() => {})
}
