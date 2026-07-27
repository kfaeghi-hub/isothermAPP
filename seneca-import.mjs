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

// ── Stage 4: Cx Index status cells ──────────────────────────────────────────
if (stage === 'index') {
  const rows = JSON.parse(readFileSync(`${EXTRACT}/index_cells.json`, 'utf8'))
  console.log(`\nstage 4 — index cells: ${rows.length} (tag, column) pairs from the extract`)

  const batch = await getBatch({
    entity: 'cx_cell_values',
    sourceFile: '3_Cx_Docs/9. Cx Index/Master_Isotherm 257889_SenecaHealthAndWellness_Cx_Master Schedule.xlsx',
    revision: 'Equip.List cell fills, live master schedule (2026-05-28)',
    expected: rows.length,
    note:
      'D2: status in the source is a FILL COLOUR, not a cell value — a value scan returns zero '
      + 'populated cells and would have reported "no status data". Green (FF00B050) = done. '
      + 'ROW 433 EXCLUSION HOLDS: the 62 amber cells are all on that single row, a '
      + '"SYSTEM-BASED REQUIRED REPORTS" divider with no tag — formatting, not status, so no '
      + 'in_progress cell is imported. Reconciliation from the raw colour count: 384 green above '
      + 'the divider, less 4 on rows carrying no tag, less 8 arising from the duplicate source '
      + 'tags collapsed in stage 3 = 372 distinct (tag, column) pairs. Sparse by design: the '
      + 'source populates only 2 of the 88 columns.',
  })
  console.log(`batch ${batch.id}`)

  const { data: equip } = await sb.from('equipment').select('id, tag').eq('project_id', proj.id)
  const byTag = new Map((equip ?? []).map(e => [e.tag.toUpperCase(), e.id]))

  const { data: groups } = await sb.from('project_cx_stage_groups')
    .select('id, name, project_cx_columns(id, label)').eq('project_id', proj.id)
  const byLabel = new Map()
  for (const g of groups ?? []) for (const c of g.project_cx_columns ?? []) byLabel.set(c.label, c.id)

  const payload = []
  const unresolved = { tag: [], column: [] }
  for (const r of rows) {
    const eid = byTag.get(r.tag.toUpperCase())
    const cid = byLabel.get(r.column)
    if (!eid) { unresolved.tag.push(r.tag); continue }
    if (!cid) { unresolved.column.push(r.column); continue }
    payload.push({ project_id: proj.id, equipment_id: eid, column_id: cid,
                   status: r.status, import_batch_id: batch.id })
  }
  check(unresolved.tag.length === 0, `every tag resolved to equipment (${unresolved.tag.length} unresolved)`)
  check(unresolved.column.length === 0,
    `every source column resolved to a project column (${unresolved.column.length} unresolved`
    + `${unresolved.column.length ? ': ' + [...new Set(unresolved.column)].join(', ') : ''})`)

  let written = 0
  for (let i = 0; i < payload.length; i += 200) {
    // UNIQUE (equipment_id, column_id) makes upsert the idempotent write.
    const { data, error } = await sb.from('cx_cell_values')
      .upsert(payload.slice(i, i + 200), { onConflict: 'equipment_id,column_id' }).select('id')
    if (error) { console.error(`upsert failed at ${i}: ${error.message}`); process.exit(1) }
    written += data.length
    process.stdout.write(`\r  written ${written}/${payload.length}`)
  }
  console.log('')

  const { count: cells } = await sb.from('cx_cell_values')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id)
  const { count: tagged } = await sb.from('cx_cell_values')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('import_batch_id', batch.id)
  await sb.from('import_batches').update({ rows_created: tagged }).eq('id', batch.id)

  const { count: notDone } = await sb.from('cx_cell_values')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).neq('status', 'done')

  console.log('')
  check(cells === rows.length, `cells on the project: ${cells} (expected ${rows.length})`)
  check(tagged === rows.length, `carrying this batch id: ${tagged} of ${rows.length}`)
  check((notDone ?? 0) === 0, `cells with a status other than 'done': ${notDone ?? 0} (row-433 amber must not appear)`)

  const { data: spread } = await sb.from('cx_cell_values')
    .select('column_id, project_cx_columns(label)').eq('project_id', proj.id)
  const byCol = {}
  for (const s of spread ?? []) {
    const l = s.project_cx_columns?.label ?? '?'
    byCol[l] = (byCol[l] ?? 0) + 1
  }
  console.log(`  distribution: ${Object.entries(byCol).map(([k, v]) => `${k} = ${v}`).join(' · ')}`)
  check(Object.keys(byCol).length === 2, `populated columns: ${Object.keys(byCol).length} of 88 (sparse by design)`)
}

// ── Stage 5: design-review findings ─────────────────────────────────────────
if (stage === 'findings') {
  const rows = JSON.parse(readFileSync(`${EXTRACT}/findings.json`, 'utf8'))
  console.log(`\nstage 5 — findings: ${rows.length} design-review items`)

  const batch = await getBatch({
    entity: 'findings',
    sourceFile: '3_Cx_Docs/5.Reports/1.DocR/Isotherm_DesignReview_SenecaHWC257889_DocRevN#3.2.docx',
    revision: 'DocRevN#3.2 (2025-09-24)',
    expected: rows.length,
    note:
      'D4: origin design_review, DR- prefix. THE PREFIX IS LOAD-BEARING — auto_set_finding_number '
      + 'takes MAX over numbers matching ^\\d+$ only, so DR- numbers are invisible to it and the '
      + 'project\'s own construction findings still start at 1 with no collision. Status from the '
      + 'document\'s own closure marker ("Item closed"): 9 closed, 117 open. date_raised is the '
      + 'document\'s revision date (2025-09-24) for every item — individual items carry no raise '
      + 'date, and inventing per-item dates would be worse than one honest uniform one. '
      + 'date_closed is set only where the closing response carried a date (5 of 9); the other 4 '
      + 'are NULL rather than invented — trg_finding_close_date is BEFORE UPDATE only, so an '
      + 'insert does not stamp CURRENT_DATE. SOURCE DEFECT PRESERVED: item 2.63 appears twice with '
      + 'two genuinely different comments (IST questions; M9.01 outdoor-air schedules). Collapsing '
      + 'would drop a real review comment, so the second is imported as DR-2.63b — the source '
      + 'number stays legible and the suffix marks the disambiguation.',
  })
  console.log(`batch ${batch.id}`)

  const { data: existing } = await sb.from('findings').select('number').eq('project_id', proj.id)
  const have = new Set((existing ?? []).map(f => f.number))
  const todo = rows.filter(r => !have.has(r.number))
  console.log(`already present: ${have.size} · to insert: ${todo.length}`)

  let created = 0
  for (let i = 0; i < todo.length; i += 50) {
    const slice = todo.slice(i, i + 50).map(r => ({
      project_id: proj.id,
      number: r.number,                       // supplied → the trigger leaves it alone
      title: r.title,
      category: r.category,
      description: r.description,
      corrective_action: r.corrective_action,
      status: r.status,
      origin: 'design_review',
      date_raised: r.date_raised,
      date_closed: r.date_closed,
      identified_by: 'Isotherm Engineering Ltd.',
      import_batch_id: batch.id,
    }))
    const { data, error } = await sb.from('findings').insert(slice).select('id')
    if (error) { console.error(`insert failed at ${i}: ${error.message}`); process.exit(1) }
    created += data.length
    process.stdout.write(`\r  inserted ${created}/${todo.length}`)
  }
  console.log('')

  const { count: total } = await sb.from('findings')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id)
  const { count: tagged } = await sb.from('findings')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('import_batch_id', batch.id)
  await sb.from('import_batches').update({ rows_created: tagged }).eq('id', batch.id)

  const { count: open } = await sb.from('findings')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('status', 'open')
  const { count: closed } = await sb.from('findings')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).eq('status', 'closed')
  const { count: wrongOrigin } = await sb.from('findings')
    .select('id', { count: 'exact', head: true }).eq('project_id', proj.id).neq('origin', 'design_review')

  console.log('')
  check(total === rows.length, `findings on the project: ${total} (expected ${rows.length})`)
  check(tagged === rows.length, `carrying this batch id: ${tagged} of ${rows.length}`)
  check(open === 117 && closed === 9, `status split: ${closed} closed / ${open} open (measured 9 / 117)`)
  check((wrongOrigin ?? 0) === 0, `findings not marked design_review: ${wrongOrigin ?? 0}`)

  // THE POINT OF THE PREFIX: the app's own sequence must still be free.
  const { data: nextProbe } = await sb.from('findings')
    .select('number').eq('project_id', proj.id).not('number', 'is', null)
  const numeric = (nextProbe ?? []).map(f => f.number).filter(n => /^\d+$/.test(n))
  check(numeric.length === 0,
    `no purely-numeric finding numbers consumed by the import: ${numeric.length} `
    + `(the next app-created finding will be #1)`)

  // Closed findings must not have been stamped with today's date.
  const { data: stamped } = await sb.from('findings')
    .select('number, date_closed').eq('project_id', proj.id).eq('status', 'closed')
  const today = new Date().toISOString().slice(0, 10)
  const invented = (stamped ?? []).filter(f => f.date_closed === today)
  check(invented.length === 0, `closed findings stamped with today's date: ${invented.length} (must be 0)`)
  const nulls = (stamped ?? []).filter(f => !f.date_closed).length
  console.log(`  closed with a source date: ${(stamped ?? []).length - nulls} · left NULL (undated in source): ${nulls}`)
}

console.log('\n' + '='.repeat(60))
console.log(failures === 0 ? 'PASS — counts reconciled, batch coverage complete.'
                           : `FAIL — ${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
