// apply-type-ratifications — turn ruled type names into typed equipment.
//
//   node --env-file=.env apply-type-ratifications.mjs [--dry-run]
//
// Ruled 2026-08-02: mint wall_fin, convector, expansion_tank, and MAP the name
// variants onto them. This applies that ruling to the register.
//
// ONE TYPE SERVES SEVERAL NAMES. Clairlea writes "Convector" and Muir writes
// "Convector Heater" for the same product family; the expansion tanks appear
// under three names across the two projects. Minting a type per spelling would
// make the vocabulary a record of how people type rather than of what things
// are — proposed_equipment_types.resolved_type exists precisely so a name can
// be MAPPED to an existing type instead of minting a new one.
//
// BATCH-TAGGED. Every unit this touches carries an import_batches row saying
// which ruling moved it and when, because a type decides which nameplate a unit
// gets and which applicability rules reach it. A change that consequential
// should never be anonymous.
import { createClient } from '@supabase/supabase-js'

const dry = process.argv.includes('--dry-run')
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

/** The ruling, as data: observed name -> the type it resolves to. */
const RULING = [
  { type: 'wall_fin',       names: ['Wall Fin'] },
  { type: 'convector',      names: ['Convector', 'Convector Heater'] },
  { type: 'expansion_tank', names: ['Expansion Tank',
                                    'Hot Water Heating Expansion Tank',
                                    'Glycol Heating Expansion Tank'] },
]

// Refuse if a type in the ruling was never minted — applying a type that does
// not exist would fail on the FK per row and leave the register half-moved.
for (const r of RULING) {
  const { data } = await svc.from('equipment_types').select('key').eq('key', r.type).maybeSingle()
  if (!data) { console.error(`REFUSING: type "${r.type}" is not minted.`); process.exit(1) }
}

console.log(`${dry ? '[DRY RUN] ' : ''}applying ${RULING.length} ruled types\n`)

let totalUnits = 0
const plan = []

for (const r of RULING) {
  for (const name of r.names) {
    // Match on the DESCRIPTOR the unit actually carries, case-insensitively.
    // Untyped only: a unit someone has already typed by hand is a human's
    // decision and this sweep does not get to overrule it.
    const { data: units } = await svc.from('equipment')
      .select('id, tag, project_id, descriptor')
      .is('equipment_type', null).ilike('descriptor', name)
    if (!units?.length) { console.log(`  ${name.padEnd(36)} 0`); continue }
    console.log(`  ${name.padEnd(36)} ${String(units.length).padStart(3)} -> ${r.type}`)
    plan.push({ type: r.type, name, units })
    totalUnits += units.length
  }
}

console.log(`\n${totalUnits} units across ${new Set(plan.flatMap(p => p.units.map(u => u.project_id))).size} projects`)
if (dry) { console.log('\n--dry-run: nothing applied.'); process.exit(0) }
if (!totalUnits) { console.log('Nothing to apply.'); process.exit(0) }

// ── one batch per project, so provenance stays project-scoped ───────────────
const byProject = new Map()
for (const p of plan) for (const u of p.units) {
  if (!byProject.has(u.project_id)) byProject.set(u.project_id, [])
  byProject.get(u.project_id).push({ ...u, type: p.type, name: p.name })
}

let applied = 0
for (const [projectId, units] of byProject) {
  const { data: proj } = await svc.from('projects')
    .select('name, com_number').eq('id', projectId).maybeSingle()
  const { data: batch, error: bErr } = await svc.from('import_batches').insert({
    project_id: projectId, entity_type: 'equipment',
    source_file: 'type ratification 2026-08-02',
    rows_expected: units.length, rows_created: 0,
    note: 'Ruled type assignments: ' +
          [...new Set(units.map(u => `${u.name} -> ${u.type}`))].join(' · '),
  }).select('id').single()
  if (bErr) { console.error(`batch for ${proj?.name}: ${bErr.message}`); continue }

  let n = 0
  for (const u of units) {
    const { error } = await svc.from('equipment')
      .update({ equipment_type: u.type, import_batch_id: batch.id,
                updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) { console.error(`  ${u.tag}: ${error.message}`); continue }
    n++
  }
  await svc.from('import_batches').update({ rows_created: n }).eq('id', batch.id)
  applied += n
  console.log(`  ${proj?.name ?? projectId}: ${n} typed (batch ${batch.id.slice(0, 8)})`)
}

// ── close the queue entries the ruling settled ─────────────────────────────
// 'minted' where the name became the type, 'mapped' where it was folded into an
// existing one. The distinction is the whole point of having ruled on them.
for (const r of RULING) {
  for (const [i, name] of r.names.entries()) {
    await svc.from('proposed_equipment_types').update({
      status: i === 0 ? 'minted' : 'mapped',
      resolved_type: r.type,
      ratified_at: new Date().toISOString(),
    }).eq('status', 'proposed').ilike('observed_name', name)
  }
}

// Any open type-assignment proposal for a unit we just typed is now settled.
const { data: nowTyped } = await svc.from('equipment')
  .select('id').not('equipment_type', 'is', null)
await svc.from('equipment_type_proposals')
  .update({ status: 'accepted', resolved_at: new Date().toISOString() })
  .eq('status', 'proposed').in('equipment_id', (nowTyped ?? []).map(e => e.id))

console.log(`\n${applied} units typed, batch-tagged. Queue entries closed as minted/mapped.`)
