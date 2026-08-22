// apply-coil-rekey.mjs — E2(b) + E2(c), owner-ruled 2026-08-22. [RIVET]
//
//   node --env-file=.env apply-coil-rekey.mjs            (DRY RUN)
//   node --env-file=.env apply-coil-rekey.mjs --apply
//
// E2(b) — the five SJWS coils move from `hydronic_heating_system` to the newly
// minted `hydronic_coil`, WITH THEIR SOVEREIGN DEF COPY.
//
// ORDER IS LOAD-BEARING AND IT IS THE WHOLE TRICK. `equipment_seed_defs` fires
// on an equipment_type change and seeds the FIRM set unless the project
// already holds defs for the new key. Re-key the UNITS first and the project
// gets the firm's 11x3 hydronic_coil rows beside its own 29 hand-built ones —
// two vocabularies for one type, and the filled values (keyed by FIELD NAME:
// "EAT", "Fluid PD", "Capacity") rendering under neither cleanly. So the DEFS
// migrate FIRST; the trigger then finds defs present and correctly declines.
// The project copy stays sovereign, its field names unchanged, and therefore
// every value already entered keeps rendering — which is the read-back this
// act has to prove, not assume.
//
// E2(c) — the crossed unit labels on that copy, corrected against the IVC
// master: Air Flow is CFM (it read GPM in all three sections) and Fluid Flow
// is GPM (spec read CFM). VALUES ARE NOT TOUCHED — they were always right
// (RHC-1: 9000 air / 6.9 fluid, exactly the master's numbers); it was the
// labels that lied, which is the units law's own failure mode: a number under
// a label that means something else.
//
// Resolve-and-refuse on every count before any write; read-back after.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials } from './pw-config.mjs'

const APPLY = process.argv.includes('--apply')
const PROJECT = 'SJWS Central AHU Distribution Renewal_Building C'
const FROM = 'hydronic_heating_system'
const TO = 'hydronic_coil'
const TAGS = ['PHC-1', 'RHC-1', 'RHC-2', 'RHC-3', 'RHC-4']

// section-agnostic: field name -> the unit the master says it carries
const LABEL_FIX = { 'Air Flow': 'CFM', 'Fluid Flow': 'GPM' }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: aErr } = await adm.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }

try {
  const { data: proj } = await adm.from('projects').select('id, name').eq('name', PROJECT).single()
  if (!proj) { console.error(`REFUSING: project "${PROJECT}" not found.`); process.exit(1) }

  // ── resolve-and-refuse ────────────────────────────────────────────────────
  let refused = false
  const { data: units } = await adm.from('equipment')
    .select('id, tag, equipment_type, nameplate_extra').eq('project_id', proj.id).eq('equipment_type', FROM)
  if ((units?.length ?? 0) !== 5) { console.error(`REFUSING: expected 5 ${FROM} units, found ${units?.length ?? 0}.`); refused = true }
  const tagsFound = (units ?? []).map(u => u.tag).sort().join(',')
  if (tagsFound !== [...TAGS].sort().join(',')) { console.error(`REFUSING: unit tags moved — found ${tagsFound}`); refused = true }

  const { data: defs } = await adm.from('project_equipment_field_defs')
    .select('id, section, field_name, unit').eq('project_id', proj.id).eq('equipment_type', FROM)
  if ((defs?.length ?? 0) !== 29) { console.error(`REFUSING: expected 29 project defs, found ${defs?.length ?? 0}.`); refused = true }

  const { count: alreadyCoil } = await adm.from('project_equipment_field_defs')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('equipment_type', TO)
  if ((alreadyCoil ?? 0) !== 0) { console.error(`REFUSING: the project already holds ${alreadyCoil} ${TO} defs — the sovereign copy would mix with them.`); refused = true }

  const { data: typeRow } = await adm.from('equipment_types').select('key, active').eq('key', TO).maybeSingle()
  if (!typeRow?.active) { console.error(`REFUSING: ${TO} is not an active type — mint it first (E2a).`); refused = true }
  if (refused) process.exit(1)

  // Every filled spec/shop/installed value, BEFORE — the read-back compares to this.
  const before = {}
  for (const u of units) {
    before[u.tag] = {}
    for (const sec of ['spec', 'shop_drawing', 'installed']) {
      for (const [k, v] of Object.entries(u.nameplate_extra?.[sec] ?? {})) before[u.tag][`${sec}/${k}`] = v
    }
  }
  const valueCount = Object.values(before).reduce((n, o) => n + Object.keys(o).length, 0)

  const crossed = (defs ?? []).filter(d => LABEL_FIX[d.field_name] && d.unit !== LABEL_FIX[d.field_name])

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'} · ${proj.name}\n`)
  console.log(`E2(b)  ${units.length} units ${FROM} → ${TO}: ${units.map(u => u.tag).join(', ')}`)
  console.log(`       ${defs.length} project def rows migrate with them (names unchanged — the values key on them)`)
  console.log(`       ${valueCount} filled nameplate values across the five units must read back identical`)
  console.log(`\nE2(c)  ${crossed.length} crossed unit label(s):`)
  for (const d of crossed) console.log(`       ${d.section.padEnd(13)} ${d.field_name.padEnd(11)} ${String(d.unit).padEnd(5)} → ${LABEL_FIX[d.field_name]}`)

  if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0) }

  // ── 1. DEFS FIRST (so the seed trigger declines when the units move) ──────
  const { data: movedDefs, error: dErr } = await adm.from('project_equipment_field_defs')
    .update({ equipment_type: TO }).eq('project_id', proj.id).eq('equipment_type', FROM).select('id')
  if (dErr || (movedDefs?.length ?? 0) !== defs.length) {
    console.error(`def migration FAILED: ${dErr?.message ?? `${movedDefs?.length ?? 0}/${defs.length}`}`); process.exit(1)
  }

  // ── 2. then the units ─────────────────────────────────────────────────────
  const { data: movedUnits, error: uErr } = await adm.from('equipment')
    .update({ equipment_type: TO }).eq('project_id', proj.id).eq('equipment_type', FROM).select('id')
  if (uErr || (movedUnits?.length ?? 0) !== units.length) {
    console.error(`unit re-key FAILED: ${uErr?.message ?? `${movedUnits?.length ?? 0}/${units.length}`}`); process.exit(1)
  }

  // ── 3. the crossed labels ─────────────────────────────────────────────────
  for (const d of crossed) {
    const { data: fixed, error: lErr } = await adm.from('project_equipment_field_defs')
      .update({ unit: LABEL_FIX[d.field_name] }).eq('id', d.id).select('id')
    if (lErr || (fixed?.length ?? 0) !== 1) { console.error(`label fix FAILED on ${d.section}/${d.field_name}: ${lErr?.message ?? '0 rows'}`); process.exit(1) }
  }

  // ── batch records: two acts, two notes ────────────────────────────────────
  await adm.from('import_batches').insert([
    { project_id: proj.id, entity_type: 'equipment',
      source_file: 'type re-key (no source document)', source_revision: 'owner-ruled 2026-08-22 — RIVET E2(b)',
      rows_expected: units.length, rows_created: units.length,
      note: `RE-KEY: ${units.length} coils (${TAGS.join(', ')}) moved ${FROM} → ${TO}, the type minted for them ` +
            `from the IVC master's coil block with a Duty discriminator. THE PROJECT'S OWN 29 FIELD DEFS MIGRATED ` +
            `WITH THEM, deliberately and FIRST, so the seeding trigger declined to add the firm set and the ` +
            `hand-built field names — the keys every entered value hangs on — were preserved. ${valueCount} filled ` +
            `values read back identical after the move. hydronic_heating_system keeps its row: it is a SYSTEM-kind ` +
            `type and an empty system-kind type is the normal state before a system entry is registered.` },
    { project_id: proj.id, entity_type: 'equipment',
      source_file: 'field-label correction (no source document)', source_revision: 'owner-ruled 2026-08-22 — RIVET E2(c)',
      rows_expected: crossed.length, rows_created: crossed.length,
      note: `CROSSED LABELS CORRECTED against the IVC master: Air Flow is CFM (read GPM in all three sections) and ` +
            `Fluid Flow is GPM (spec read CFM). VALUES UNTOUCHED — they were always the master's own numbers ` +
            `(RHC-1: 9000 air, 6.9 fluid); only the labels lied. This is the units law's own failure mode: a ` +
            `number under a label that means something else renders, prints, and is discovered when somebody ` +
            `computes with it.` },
  ])

  // ── read-back: values identical, defs re-homed, labels right ─────────────
  let bad = 0
  const { data: after } = await adm.from('equipment')
    .select('tag, equipment_type, nameplate_extra').eq('project_id', proj.id).eq('equipment_type', TO)
  for (const u of after ?? []) {
    const now = {}
    for (const sec of ['spec', 'shop_drawing', 'installed']) {
      for (const [k, v] of Object.entries(u.nameplate_extra?.[sec] ?? {})) now[`${sec}/${k}`] = v
    }
    const b = before[u.tag] ?? {}
    const same = Object.keys(b).length === Object.keys(now).length &&
                 Object.entries(b).every(([k, v]) => now[k] === v)
    console.log(`  ${same ? 'OK ' : 'BAD'} ${u.tag}: ${Object.keys(now).length} values identical`)
    if (!same) bad++
  }
  const { count: staleDefs } = await adm.from('project_equipment_field_defs')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('equipment_type', FROM)
  const { count: coilDefs } = await adm.from('project_equipment_field_defs')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('equipment_type', TO)
  console.log(`  ${staleDefs === 0 && coilDefs === 29 ? 'OK ' : 'BAD'} defs: ${FROM} ${staleDefs} (must be 0) · ${TO} ${coilDefs} (must be 29 — the firm set did NOT seed over it)`)
  if (staleDefs !== 0 || coilDefs !== 29) bad++

  const { data: relabeled } = await adm.from('project_equipment_field_defs')
    .select('section, field_name, unit').eq('project_id', proj.id).eq('equipment_type', TO)
    .in('field_name', Object.keys(LABEL_FIX))
  const wrong = (relabeled ?? []).filter(d => d.unit !== LABEL_FIX[d.field_name])
  console.log(`  ${wrong.length === 0 ? 'OK ' : 'BAD'} labels: ${relabeled?.length} flow fields, ${wrong.length} still crossed`)
  if (wrong.length) bad++

  console.log(`\n${bad === 0 ? 'APPLIED — read-back clean' : `APPLIED WITH ${bad} READ-BACK FAILURE(S)`}`)
  if (bad) process.exit(1)
} finally {
  await adm.auth.signOut().catch(() => {})
}
