// seneca-import — the Seneca 257889 backfill importer.
//
// WRITES VIA THE NORMAL API (supabase-js as dev.admin), not raw SQL. That is the
// ruled discipline and it matters: a direct-SQL write runs as service role and
// bypasses RLS entirely, so it can create rows the application itself would
// refuse. Going through the same client the app uses means the import is subject
// to the same policies as a human doing it by hand.
//
// THE GUARD IS INVERTED FROM THE TEST HARNESS. pw-config forbids touching
// anything except ZZ-TEST. This script does the opposite — it deliberately
// writes to a REAL client project — so it refuses to run against any project
// other than the one it names, by com_number, resolved at run time.
//
// Every row it creates carries import_batch_id. Re-running adds nothing: each
// stage checks for its own rows first. Removal is by batch id, never by pattern.
//
//   node --env-file=.env seneca-import.mjs <stage>
//
// Stages: equipment
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { adminCredentials } from './pw-config.mjs'

const COM_NUMBER = '257889'
const PROJECT_NAME_EXPECTED = 'Seneca Health and Wellness Center'
const EXTRACT = './samples/seneca-import/_extract'

const stage = process.argv[2]
if (!stage) { console.error('usage: node --env-file=.env seneca-import.mjs <stage>'); process.exit(1) }

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { email, password } = adminCredentials()
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password })
if (authErr || !auth?.session) { console.error(`sign-in failed: ${authErr?.message}`); process.exit(1) }
console.log(`signed in as ${email} (API path — RLS enforced)`)

// ── The guard ───────────────────────────────────────────────────────────────
const { data: proj, error: pErr } = await sb.from('projects')
  .select('id, name, com_number').eq('com_number', COM_NUMBER).maybeSingle()
if (pErr || !proj) { console.error(`project ${COM_NUMBER} not found: ${pErr?.message}`); process.exit(1) }
if (proj.name !== PROJECT_NAME_EXPECTED) {
  console.error(`REFUSING: com_number ${COM_NUMBER} resolved to "${proj.name}", expected `
    + `"${PROJECT_NAME_EXPECTED}". A backfill that writes to the wrong project is the one `
    + `mistake this script exists to make impossible.`)
  process.exit(1)
}
console.log(`target: ${proj.name} (${proj.id})`)

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++ }

/** Find this stage's batch, or create it. One batch per entity type — ratified
 *  after stage 2: a batch spanning entities cannot be rolled back cleanly. */
async function getBatch({ entity, sourceFile, revision, expected, note }) {
  const { data: found } = await sb.from('import_batches').select('*')
    .eq('project_id', proj.id).eq('entity_type', entity).eq('source_file', sourceFile).maybeSingle()
  if (found) return found
  const { data, error } = await sb.from('import_batches').insert({
    project_id: proj.id, entity_type: entity, source_file: sourceFile,
    source_revision: revision, rows_expected: expected, note,
  }).select('*').single()
  if (error) { console.error(`batch insert failed: ${error.message}`); process.exit(1) }
  return data
}

// ── Stage 3: equipment ──────────────────────────────────────────────────────
if (stage === 'equipment') {
  const rows = JSON.parse(readFileSync(`${EXTRACT}/equipment.json`, 'utf8'))
  console.log(`\nstage 3 — equipment: ${rows.length} distinct tags from the extract`)

  const batch = await getBatch({
    entity: 'equipment',
    sourceFile: '3_Cx_Docs/9. Cx Index/Master_Isotherm 257889_SenecaHealthAndWellness_Cx_Master Schedule.xlsx',
    revision: 'Equip.List, live master schedule (2026-05-28)',
    expected: rows.length,
    note:
      'D1: live master schedule alone. D3: tags/types/locations only — nameplate deferred, so '
      + 'manufacturer/model/serial/electrical fields are deliberately NULL rather than guessed. '
      + 'SCOPE IS STRUCTURAL, NOT TEXTUAL: rows 6-432 only, i.e. everything ABOVE the sheet\'s own '
      + '"SYSTEM-BASED REQUIRED REPORTS" divider at row 433. Below that divider the columns change '
      + 'meaning (C holds a system name, D holds a report name) and none of the 43 rows carries an '
      + 'equipment type — those are documentation-register candidates for stage 7, not equipment. '
      + '8 duplicate tags in the source collapsed to first occurrence: RP-01, RP-02, UH-L1-01, '
      + 'UH-L1-02, UH-L2-01, UH-L3-01, UH-L3-02, UH-L3-03.',
  })
  console.log(`batch ${batch.id}`)

  // Idempotency by tag: the app enforces no unique constraint on (project, tag),
  // so re-running without this check would silently double the register.
  const { data: existing } = await sb.from('equipment')
    .select('tag').eq('project_id', proj.id)
  const have = new Set((existing ?? []).map(e => e.tag.toUpperCase()))
  const todo = rows.filter(r => !have.has(r.tag.toUpperCase()))
  console.log(`already present: ${have.size} · to insert: ${todo.length}`)

  let created = 0
  for (let i = 0; i < todo.length; i += 100) {
    const slice = todo.slice(i, i + 100).map(r => ({
      project_id: proj.id,
      kind: 'equipment',                 // NOT NULL, no default — found in stage 1
      tag: r.tag,
      category: r.category || null,
      descriptor: r.descriptor || null,
      location: r.location || null,
      area_served: r.area_served || null,
      equipment_type: r.equipment_type,  // null where not confidently mappable
      sort_order: r.sort_order,
      import_batch_id: batch.id,
    }))
    const { data, error } = await sb.from('equipment').insert(slice).select('id')
    if (error) { console.error(`insert failed at offset ${i}: ${error.message}`); process.exit(1) }
    created += data.length
    process.stdout.write(`\r  inserted ${created}/${todo.length}`)
  }
  console.log('')

  // ── Reconciliation ────────────────────────────────────────────────────────
  const { count: total } = await sb.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id)
  const { count: tagged } = await sb.from('equipment')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', proj.id).eq('import_batch_id', batch.id)
  await sb.from('import_batches').update({ rows_created: tagged }).eq('id', batch.id)

  console.log('')
  check(total === rows.length, `equipment on the project: ${total} (expected ${rows.length})`)
  check(tagged === rows.length, `carrying this batch id: ${tagged} of ${rows.length}`)

  const { data: notag } = await sb.from('equipment')
    .select('id').eq('project_id', proj.id).is('import_batch_id', null)
  check((notag ?? []).length === 0, `equipment without a batch tag: ${(notag ?? []).length}`)

  const { count: elsewhere } = await sb.from('equipment')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batch.id).neq('project_id', proj.id)
  check((elsewhere ?? 0) === 0, `rows from this batch in another project: ${elsewhere ?? 0}`)

  const { data: allTags } = await sb.from('equipment').select('tag').eq('project_id', proj.id)
  const seen = new Set(), dup = []
  for (const t of (allTags ?? [])) {
    const k = t.tag.toUpperCase()
    if (seen.has(k)) dup.push(t.tag); else seen.add(k)
  }
  check(dup.length === 0, `duplicate tags on the project: ${dup.length}${dup.length ? ' — ' + dup.slice(0, 5).join(', ') : ''}`)
}

console.log('\n' + '='.repeat(60))
console.log(failures === 0 ? 'PASS — counts reconciled, batch coverage complete.'
                           : `FAIL — ${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
