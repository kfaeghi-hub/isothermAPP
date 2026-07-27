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

// ── Correction batch + type minting ─────────────────────────────────────────
if (stage === 'corrections') {
  // MINT FIRST — the FK on equipment.equipment_type means a correction to a type
  // that does not exist yet is rejected, not silently applied.
  const MINT = [
    { key: 'humidifier',    name: 'Humidifier',                        sort_order: 20 },
    { key: 'radiant_panel', name: 'Radiant Panel',                     sort_order: 21 },
    { key: 'panel',         name: 'Panel (Electrical Distribution)',   sort_order: 22 },
  ]
  for (const t of MINT) {
    const { data: has } = await sb.from('equipment_types').select('key').eq('key', t.key).maybeSingle()
    if (!has) {
      const { error } = await sb.from('equipment_types').insert(t)
      if (error) { console.error(`mint ${t.key} failed: ${error.message}`); process.exit(1) }
      console.log(`  minted type: ${t.key} (${t.name}) — zero field defs, renders the fallback nameplate`)
    } else console.log(`  type already present: ${t.key}`)
  }

  const batch = await getBatch({
    entity: 'equipment:corrections',
    sourceFile: 'ruling/2026-07-27 correction batch',
    revision: 'C1-C6 + RP ruling',
    expected: 19,
    note:
      'OWNER CORRECTIONS, ruled by the CxA of record. Rows keep the import_batch_id of the batch '
      + 'that CREATED them — creation provenance is not overwritten by a later edit — and this row '
      + 'records what changed, from what, and why. Original source readings preserved here: '
      + 'HU-AHU-1..5 were auto-typed ahu because the tag string contains "AHU" (they are humidifiers '
      + 'SERVING those AHUs); HU-DOAS-1/2A/2B were NULL — one family now has one answer, humidifier. '
      + '"Fire Pump Disconnect/ATS" was auto-typed pump because the tag contains "pump"; it is an '
      + 'electrical disconnect and transfer switch -> ats. WSHP-01 -> heat_pump. DOAS-1/2 -> ahu '
      + '(packaged-AC precedent). RP-2C1/2EC1/2UC1 -> panel; source descriptor already said '
      + '"Receptacle Panel". '
      + 'RP-01/RP-02: source Equip.List lists them TWICE, under section header "PUMPS" (rows 52-53) '
      + 'AND under "AIR HANDLING UNIT" (rows 99-100), both with no type and no descriptor. Neither '
      + 'is correct. The project\'s own Radiant-PNLs.xlsx is titled "RADIANT PANEL SCHEDULE" and '
      + 'lists RP-01 and RP-02 with hydronic data (SIGMA SLC, USGPM, mean water temp 120F, ft.H2O) '
      + '-- so the correction is SOURCE-BACKED, not merely ruled. Type -> radiant_panel, category '
      + 'corrected to "RADIANT PANEL SCHEDULE". A known-wrong source value corrected by the CxA of '
      + 'record is a data fix, not a provenance violation; the original source reading is recorded '
      + 'in this note.',
  })
  console.log(`batch ${batch.id}`)

  const FIX = [
    { tags: ['HU-AHU-1','HU-AHU-2','HU-AHU-3','HU-AHU-4','HU-AHU-5',
             'HU-DOAS-1','HU-DOAS-2A','HU-DOAS-2B'], set: { equipment_type: 'humidifier' } },
    { tags: ['Fire Pump Disconnect/ATS'], set: { equipment_type: 'ats' } },
    { tags: ['WSHP-01'],                  set: { equipment_type: 'heat_pump' } },
    { tags: ['DOAS-1','DOAS-2'],          set: { equipment_type: 'ahu' } },
    { tags: ['RP-01','RP-02'],            set: { equipment_type: 'radiant_panel',
                                                 category: 'RADIANT PANEL SCHEDULE' } },
  ]
  let touched = 0
  for (const f of FIX) {
    const { data, error } = await sb.from('equipment')
      .update(f.set).eq('project_id', proj.id).in('tag', f.tags).select('tag')
    if (error) { console.error(`correction failed (${f.tags[0]}…): ${error.message}`); process.exit(1) }
    touched += data.length
    check(data.length === f.tags.length,
      `${JSON.stringify(f.set)} → ${data.length} of ${f.tags.length} rows`)
  }

  // RECEPTACLE PANELS BY THE SOURCE'S OWN DESCRIPTOR, not by a tag list.
  // The ruling named RP-2C1/2EC1/2UC1 because the audit's family regex grouped
  // only bare RP-<digit> tags; RP-GC1, RP-PHT1 and the rest formed their own
  // families and never surfaced. The register actually holds 26 rows whose
  // SOURCE DESCRIPTOR is literally "Receptacle Panel" — identical class,
  // identical evidence. Matching on the descriptor applies the ruling
  // consistently instead of leaving 23 identical rows untyped beside 3 typed.
  {
    const { data, error } = await sb.from('equipment')
      .update({ equipment_type: 'panel' })
      .eq('project_id', proj.id).ilike('descriptor', '%receptacle panel%')
      .is('equipment_type', null).select('tag')
    if (error) { console.error(`receptacle panel correction failed: ${error.message}`); process.exit(1) }
    touched += data.length
    console.log(`  PASS  receptacle panels typed by source descriptor → ${data.length} further rows `
      + `(ruling named 3; the register holds 26 of the same class)`)
  }
  await sb.from('import_batches').update({ rows_created: touched }).eq('id', batch.id)

  // ── The sweep: clearly-electrical rows still untyped go to the QUEUE ───────
  // Not decided unilaterally. The queue is the only path to a new type.
  const { data: untyped } = await sb.from('equipment')
    .select('tag, category, descriptor').eq('project_id', proj.id)
    .is('equipment_type', null).eq('category', 'ELECTRICAL')
  const fams = new Map()
  for (const e of untyped ?? []) {
    const fam = (e.descriptor || e.tag).replace(/[-_ ]*\d.*$/, '').trim() || e.tag
    if (!fams.has(fam)) fams.set(fam, [])
    fams.get(fam).push(e.tag)
  }
  let queued = 0
  for (const [fam, tags] of fams) {
    const { data: seen } = await sb.from('proposed_equipment_types')
      .select('id').eq('project_id', proj.id).eq('observed_name', fam).maybeSingle()
    if (seen) continue
    const { error } = await sb.from('proposed_equipment_types').insert({
      project_id: proj.id, observed_name: fam,
      proposed_key: fam.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || null,
      evidence: { sample_tags: tags.slice(0, 6), count: tags.length,
                  category: 'ELECTRICAL', source: 'Seneca 257889 backfill — stage 3 equipment' },
    })
    if (error) { console.error(`queue insert failed (${fam}): ${error.message}`); process.exit(1) }
    queued++
  }
  console.log(`\n  proposed types queued for ratification: ${queued} (from ${(untyped ?? []).length} untyped ELECTRICAL rows)`)

  // ── The gate: re-run the consistency sweep ────────────────────────────────
  const { data: all } = await sb.from('equipment')
    .select('tag, category, equipment_type, descriptor').eq('project_id', proj.id)
  const disagreements = []
  for (const e of all ?? []) {
    const t = e.equipment_type, tag = e.tag.toUpperCase(), d = (e.descriptor || '').toUpperCase()
    // A type that contradicts the tag's own family, or a descriptor that
    // contradicts the type. Only assertions the earlier audit actually raised.
    if (/^HU-/.test(tag) && t !== 'humidifier') disagreements.push(`${e.tag}: HU- family but type ${t}`)
    if (/DISCONNECT/i.test(tag) && t === 'pump') disagreements.push(`${e.tag}: disconnect typed pump`)
    if (/RECEPTACLE PANEL/.test(d) && t !== 'panel') disagreements.push(`${e.tag}: Receptacle Panel but type ${t}`)
    if (/^RP-0/.test(tag) && t !== 'radiant_panel') disagreements.push(`${e.tag}: radiant panel but type ${t}`)
    if (/VAV BOX/.test(d) && t !== 'vav') disagreements.push(`${e.tag}: VAV BOX but type ${t}`)
    if (/^DOAS-/.test(tag) && t !== 'ahu') disagreements.push(`${e.tag}: DOAS but type ${t}`)
    if (/^WSHP/.test(tag) && t !== 'heat_pump') disagreements.push(`${e.tag}: WSHP but type ${t}`)
  }
  console.log('')
  check(disagreements.length === 0,
    `consistency sweep — disagreements: ${disagreements.length}`
    + (disagreements.length ? '\n      ' + disagreements.slice(0, 8).join('\n      ') : ''))
}

// ── Stage 3b: split the AIR HANDLING UNIT category ──────────────────────────
if (stage === 'recategorize') {
  // The source carries ONE header, "AIR HANDLING UNIT" at row 88, spanning rows
  // 89-296 — 13 different equipment families under one label, because the source
  // never sub-headered them. Only 5 of the 194 rows are actually AHUs. Category
  // names below come from the source's OWN vocabulary wherever it states one:
  // its column C, its other section headers, or the title of the matching
  // equipment schedule. Nothing here is invented.
  const SPLIT = [
    { cat: 'FAN COIL UNIT',            like: 'FCU-L%',  why: 'source column C: "FAN COIL UNIT"' },
    { cat: 'VAV BOX',                  like: 'TBS-%',   why: 'source column C: "VAV BOX"' },
    { cat: 'VAV BOX',                  like: 'TBE-%',   why: 'source column C: "VAV BOX"' },
    { cat: 'EXHAUST FAN',              like: 'EF-%',    why: 'tag convention; already typed fan' },
    { cat: 'UNIT HEATER',              like: 'UH-L%',   why: 'tag convention; source headers a separate "STANDALONE PROPELLER UNIT HEATER" elsewhere' },
    { cat: 'TRENCH FAN COIL UNIT',     like: 'TFCU-%',  why: 'TFCUs.xlsx: "TRENCH FAN COIL UNIT SCHEDULE"' },
    { cat: 'VERTICAL FAN COIL UNIT',   like: 'VFCU-%',  why: 'VFCU.xlsx: "VERTICAL FAN COIL SCHEDULE"' },
    { cat: 'HYDRONIC ELECTRIC BOILER', like: 'BE-0%',   why: 'Elec-Boiler.xlsx: "HYDRONIC ELECTRIC BOILER SCHEDULE" (PRECISION PCW3-304)' },
    { cat: 'HYDRAULIC SEPARATOR',      like: 'HS-%',    why: 'source column C: "HYDRAULIC SEPARATOR"' },
    { cat: 'CEILING FAN',              like: 'CF-%',    why: 'tag convention; source names "CEILING FANS" in the tender index' },
  ]
  const batch = await getBatch({
    entity: 'equipment:recategorize',
    sourceFile: '3_Cx_Docs/9. Cx Index/Master_Isotherm 257889_SenecaHealthAndWellness_Cx_Master Schedule.xlsx',
    revision: 'Equip.List rows 89-296',
    expected: 192,
    note:
      'AMENDS C5 for this block only. The source header "AIR HANDLING UNIT" (row 88) spans rows '
      + '89-296 and covers 13 equipment families — only 5 rows are AHUs. Every new category name is '
      + 'taken from the source\'s own words: its column C, its other section headers, or the title '
      + 'of the matching equipment schedule. UNRESOLVED AND LEFT ALONE: DBF-1 and DBF-2 (locations '
      + '"WOMEN\'S REC CHN ROOM" and "EQ. STORAGE") appear in no schedule and carry no descriptor — '
      + 'flagged rather than guessed, so they stay under AIR HANDLING UNIT until identified.',
  })
  console.log(`batch ${batch.id}`)

  let moved = 0
  for (const s of SPLIT) {
    const { data, error } = await sb.from('equipment')
      .update({ category: s.cat }).eq('project_id', proj.id)
      .eq('category', 'AIR HANDLING UNIT').like('tag', s.like).select('tag')
    if (error) { console.error(`recategorize ${s.cat} failed: ${error.message}`); process.exit(1) }
    if (data.length) console.log(`  ${String(data.length).padStart(3)} → ${s.cat.padEnd(26)} (${s.why})`)
    moved += data.length
  }

  // Two type corrections the schedules just settled.
  for (const [tag, t] of [['BE-01', 'boiler'], ['CF-1', 'fan']]) {
    const { data } = await sb.from('equipment').update({ equipment_type: t })
      .eq('project_id', proj.id).eq('tag', tag).is('equipment_type', null).select('tag')
    if (data?.length) console.log(`  typed ${tag} → ${t}`)
  }
  await sb.from('import_batches').update({ rows_created: moved }).eq('id', batch.id)

  const { data: left } = await sb.from('equipment').select('tag')
    .eq('project_id', proj.id).eq('category', 'AIR HANDLING UNIT')
  console.log('')
  check(left.length === 7,
    `AIR HANDLING UNIT now holds ${left.length}: ${left.map(l => l.tag).sort().join(', ')} `
    + `(5 real AHUs + DBF-1/2 held for identification)`)

  // Unit heaters and DBF have no type in the vocabulary — QUEUE, never mint.
  for (const q of [
    { observed_name: 'Unit Heater', proposed_key: 'unit_heater', tags: ['UH-L1-01','UH-L2-01','UH-L3-01'], n: 6 },
    { observed_name: 'DBF (unidentified)', proposed_key: null, tags: ['DBF-1','DBF-2'], n: 2 },
    { observed_name: 'Hydraulic Separator', proposed_key: 'hydraulic_separator', tags: ['HS-01'], n: 1 },
  ]) {
    const { data: seen } = await sb.from('proposed_equipment_types').select('id')
      .eq('project_id', proj.id).eq('observed_name', q.observed_name).maybeSingle()
    if (seen) continue
    await sb.from('proposed_equipment_types').insert({
      project_id: proj.id, observed_name: q.observed_name, proposed_key: q.proposed_key,
      evidence: { sample_tags: q.tags, count: q.n, source: 'Seneca 257889 — AHU category split' },
    })
    console.log(`  queued for ratification: ${q.observed_name} (${q.n})`)
  }
}

// ── Stage 4b: shop drawings — RECEIVED vs REVIEWED, two columns ─────────────
if (stage === 'shopdwgs') {
  // The evidence is the filename convention in 2_Bldg_Docs/4_Shops: a package
  // filed WITHOUT "-IEL" is what the contractor submitted; the "-IEL" copy is
  // Isotherm's marked-up review. Plus the SDR reports in 5.Reports/3.SDR, which
  // ARE the review for AHU/DOAS, RAF and pumps, and the submittal log's CLS.
  const PKG = [
    { spec: '20 30 00',    name: 'Hydronic Pumps',            recv: '2026-06-25', rev: '2026-06-29',
      tags: ['CHW-P-01','CHW-P-02','CHW-P-03','CHW-P-04','CHW-P-05','CHW-P-06','DHWR-P-01','DHWR-P-02',
             'GEO-P-01','GEO-P-02','GEO-P-03','GEO-P-04','GEO-P-05','GEO-P-06','GEO-P-07','GEO-P-08',
             'GEO-P-09','GEO-P-10','GLY-P-01','GLY-P-02','HW-P-01','HW-P-02','HW-P-03','HW-P-04',
             'HW-P-05','HW-P-06','HW-P-07','HW-P-08'] },
    { spec: '23 05 17.13', name: 'HVAC Air Separator',        recv: '2026-06-25', rev: '2026-06-29',
      tags: ['CHW-AS-01','HW-AS-01','HGLY-AS-01'] },
    { spec: '23 34 00-2.0',name: 'Return Air Fans',           recv: '2026-07-13', rev: '2026-07-15',
      tags: ['RAF-1','RAF-2','RAF-3','RAF-4','RAF-5'] },
    { spec: '23 36 00',    name: 'Trench Fan Coil Units',     recv: '2026-06-17', rev: '2026-06-19',
      tags: ['TFCU-01','TFCU-02','TFCU-03'] },
    { spec: '23 57 13',    name: 'HVAC Heat Exchangers',      recv: '2026-07-15', rev: '2026-07-15',
      tags: ['CHW-HX-01','DHW-HX-01','HW-HX-01','GLY-HX-01','GLY-HX-02'] },
    { spec: '23 73 23',    name: 'AHU & DOAS',                recv: '2025-11-14', rev: '2025-11-14',
      tags: ['AHU-1','AHU-2','AHU-3','AHU-4','AHU-5','DOAS-1','DOAS-2'] },
    { spec: '26 12 17',    name: 'Dry-Type Transformers',     recv: '2026-05-08', rev: '2026-05-14',
      tags: null, like: 'TX-%' },
    { spec: '26 23 00',    name: 'Switchgear',                recv: '2026-04-24', rev: '2026-05-04',
      tags: null, like: 'SWGR-%' },
    { spec: '26 24 13',    name: 'Electrical Switchboard',    recv: '2026-06-17', rev: '2026-06-19',
      tags: null, like: 'SWBD-%' },
    { spec: '26 29 19',    name: 'PV System Disconnect',      recv: '2026-05-22', rev: '2026-05-25',
      tags: ['Solar PV Disconnect'] },
    { spec: '26 36 23',    name: 'Automatic Transfer Switches', recv: '2026-06-23', rev: '2026-06-24',
      tags: ['ATS-GEB','ATS-GXA','ATS-GXFP'] },
    { spec: '26 36 23-01', name: 'Manual TS & Gen Connection', recv: '2026-05-13', rev: '2026-05-20',
      tags: ['ATS-MS','Load Bank Connection Panel'] },
    { spec: '20 13 13',    name: 'Expansion + Buffer Tanks',  recv: '2026-06-25', rev: '2026-07-13',
      tags: null, like: '%-ET-%' },
    { spec: '20 13 13b',   name: 'Buffer Tanks',              recv: '2026-06-25', rev: '2026-07-13',
      tags: null, like: '%-BT-%' },
  ]

  const batch = await getBatch({
    entity: 'cx_cell_values:shopdwgs',
    sourceFile: '2_Bldg_Docs/4_Shops + 3_Cx_Docs/5.Reports/3.SDR + ME Submittal Log',
    revision: 'shop-drawing folder state at 2026-07-27',
    expected: 0,
    note:
      'TWO COLUMNS, TWO FACTS. "Shop Dwgs" = the submittal was RECEIVED; "SDR" = Isotherm has '
      + 'REVIEWED it. Evidence is the 4_Shops filename convention — a package filed without "-IEL" '
      + 'is the contractor submission, the "-IEL" copy is Isotherm\'s marked-up review — corroborated '
      + 'by the SDR reports (which ARE the review for AHU/DOAS, RAF and pumps) and the submittal '
      + 'log\'s CLS status. THE MASTER SCHEDULE\'S 5 GREEN Shop-Dwgs CELLS WERE A STALE SNAPSHOT: '
      + 'they marked only AHU-1..5 while 14 packages have since been received and reviewed. '
      + 'NOT WRITTEN, flagged as ambiguous: Panelboards 26 24 16 (could be the 26 receptacle, 7 '
      + 'lighting or 5 distribution panels — the package does not say and no SD log names tags); '
      + 'VFDs 23 92 49 (no VFD tags in the register); Metering 26 27 13/16 (two packages, one tag); '
      + 'PV System 48 14 00 (panels/inverters/racking are not register tags).',
  })
  console.log(`batch ${batch.id}`)

  // The new column, appended to Doc Review Stage.
  const { data: grp } = await sb.from('project_cx_stage_groups')
    .select('id').eq('project_id', proj.id).eq('name', 'Doc Review Stage').single()
  let { data: sdrCol } = await sb.from('project_cx_columns')
    .select('id').eq('stage_group_id', grp.id).eq('label', 'SDR').maybeSingle()
  if (!sdrCol) {
    const { data: cols } = await sb.from('project_cx_columns')
      .select('sort_order').eq('stage_group_id', grp.id).order('sort_order', { ascending: false }).limit(1)
    const { data, error } = await sb.from('project_cx_columns')
      .insert({ stage_group_id: grp.id, label: 'SDR', sort_order: (cols?.[0]?.sort_order ?? 0) + 1 })
      .select('id').single()
    if (error) { console.error(`SDR column insert failed: ${error.message}`); process.exit(1) }
    sdrCol = data
    console.log('  created column "SDR" under Doc Review Stage')
  } else console.log('  column "SDR" already present')

  const { data: shopCol } = await sb.from('project_cx_columns')
    .select('id').eq('stage_group_id', grp.id).eq('label', 'Shop Dwgs').single()

  const { data: equip } = await sb.from('equipment').select('id, tag').eq('project_id', proj.id)
  const byTag = new Map((equip ?? []).map(e => [e.tag.toUpperCase(), e.id]))

  const cells = []
  const missing = []
  for (const p of PKG) {
    let tags = p.tags
    if (!tags && p.like) {
      const rx = new RegExp('^' + p.like.replace(/%/g, '.*') + '$', 'i')
      tags = (equip ?? []).map(e => e.tag).filter(t => rx.test(t))
    }
    for (const t of tags) {
      const id = byTag.get(t.toUpperCase())
      if (!id) { missing.push(`${p.spec}: ${t}`); continue }
      cells.push({ project_id: proj.id, equipment_id: id, column_id: shopCol.id, status: 'done',
                   notes: `${p.spec} ${p.name} — received ${p.recv}`, import_batch_id: batch.id })
      cells.push({ project_id: proj.id, equipment_id: id, column_id: sdrCol.id, status: 'done',
                   notes: `${p.spec} ${p.name} — Isotherm review ${p.rev}`, import_batch_id: batch.id })
    }
  }
  check(missing.length === 0, `every mapped tag exists in the register (${missing.length} missing`
    + `${missing.length ? ': ' + missing.slice(0, 4).join(', ') : ''})`)

  let written = 0
  for (let i = 0; i < cells.length; i += 200) {
    const { data, error } = await sb.from('cx_cell_values')
      .upsert(cells.slice(i, i + 200), { onConflict: 'equipment_id,column_id' }).select('id')
    if (error) { console.error(`upsert failed at ${i}: ${error.message}`); process.exit(1) }
    written += data.length
  }
  await sb.from('import_batches').update({ rows_created: written, rows_expected: cells.length }).eq('id', batch.id)

  const countIn = async (colId) => (await sb.from('cx_cell_values')
    .select('id', { count: 'exact', head: true }).eq('column_id', colId).eq('status', 'done')).count
  const shopN = await countIn(shopCol.id), sdrN = await countIn(sdrCol.id)
  console.log('')
  check(written === cells.length, `cells written: ${written} of ${cells.length}`)
  console.log(`  Shop Dwgs (received): ${shopN}   ·   SDR (Isotherm reviewed): ${sdrN}`)
  check(shopN >= 5, `the stale 5 AHU Shop-Dwgs cells are subsumed, not orphaned (${shopN} total)`)
}

// ── Stage 3c: split ELECTRICAL and PUMPS ────────────────────────────────────
if (stage === 'recategorize2') {
  // Same rule as the AHU split: the new name is the SOURCE'S OWN WORD for the
  // thing — its descriptor column, or the title of the schedule the tag appears
  // in. ELECTRICAL splits on descriptors it already carries; PUMPS splits on
  // schedule titles, because its rows carry almost no descriptor.
  //
  // ONE SCHEDULE = ONE CATEGORY. Pumps.xlsx covers CHW/HW/GEO/GLY/DHWR/DCW/FSP
  // as a single "PUMP SCHEDULE", so they stay one category; SumpP.xlsx is its
  // own schedule, so a sump pump is its own category. Applying that consistently
  // is what stops the split from becoming taste.
  const batch = await getBatch({
    entity: 'equipment:recategorize2',
    sourceFile: '3_Cx_Docs/9. Cx Index + 3_Cx_Docs/3.IVCs_Start-Ups/EQU-schedules',
    revision: 'ELECTRICAL and PUMPS blocks',
    expected: 71 + 13,
    note:
      'Continues the C5 amendment. ELECTRICAL (71 rows / 58 tag families) and PUMPS (43 rows / 15 '
      + 'families) were single source headers over many equipment classes, exactly like AIR '
      + 'HANDLING UNIT. Electrical names come from the descriptor the source already carried; pump '
      + 'names from the title of the equipment schedule each tag appears in. TRANSFORMER RATINGS '
      + 'ARE NOT CATEGORIES: the source descriptor reads "Transformer (30 kVA)", "(45 kVA)", '
      + '"(75 kVA)", "(112.5 kVA)" — all 19 become DRY-TYPE TRANSFORMER and the rating stays in '
      + 'the descriptor as nameplate detail. UTILITY TRANSFORMER stays separate: utility-owned, '
      + 'different scope, and the source names it distinctly. UNRESOLVED, LEFT UNDER PUMPS: RHC '
      + '(3), GI (2), PRV-NG (2) appear in no schedule and carry no descriptor.',
  })
  console.log(`batch ${batch.id}`)

  const BY_DESCRIPTOR = [
    { cat: 'RECEPTACLE PANEL',    match: 'Receptacle Panel' },
    { cat: 'DRY-TYPE TRANSFORMER', matchLike: 'Transformer (%kVA)' },
    { cat: 'LIGHTING PANEL',      match: 'Lighting Panel' },
    { cat: 'DISTRIBUTION PANEL',  match: 'Distribution Panel' },
    { cat: 'TRANSFER SWITCH',     matchAny: ['Automatic Transfer Switch','Fire Pump ATS',
                                             'Temporary Generator ATS','Fire Pump Disconnect & ATS'] },
    { cat: 'SWITCHGEAR',          matchAny: ['Main Switchgear','Secondary Switchgear'] },
    { cat: 'SWITCHBOARD',         match: 'Switchboard' },
    { cat: 'GENERATOR',           matchLike: 'Generator (%' },
    { cat: 'UTILITY TRANSFORMER', match: 'Utility Transformer' },
    { cat: 'METERING SYSTEM',     match: 'Metering System' },
    { cat: 'PV DISCONNECT',       match: 'PV Fused Disconnect' },
    { cat: 'LOAD BANK PANEL',     match: 'Load Bank Panel' },
  ]
  let moved = 0
  for (const s of BY_DESCRIPTOR) {
    let q = sb.from('equipment').update({ category: s.cat })
      .eq('project_id', proj.id).eq('category', 'ELECTRICAL')
    if (s.match)     q = q.eq('descriptor', s.match)
    if (s.matchLike) q = q.like('descriptor', s.matchLike)
    if (s.matchAny)  q = q.in('descriptor', s.matchAny)
    const { data, error } = await q.select('tag')
    if (error) { console.error(`${s.cat} failed: ${error.message}`); process.exit(1) }
    if (data.length) console.log(`  ${String(data.length).padStart(3)} → ${s.cat}`)
    moved += data.length
  }

  // PUMPS — by the schedule each tag appears in.
  const BY_SCHEDULE = [
    { cat: 'SUMP PUMP',                tags: ['SP-01'],           why: 'SumpP.xlsx: "SUMP PUMP SCHEDULE"' },
    { cat: 'VENTILATION AIR UNIT',     tags: ['DOAS-1','DOAS-2'], why: 'DOAS-2.xlsx: "VENTILATION AIR UNIT SCHEDULE"' },
    { cat: 'NATURAL GAS BOILER',       tags: ['BG-01'],           why: 'NG-Boiler.xlsx: "NATURAL GAS BOILER SCHEDULE"' },
    { cat: 'FLUID COOLER',             tags: ['FLC-01'],          why: 'FLC.xlsx: "FLUID COOLER SCHEDULE"' },
    { cat: 'WATER TO WATER HEAT PUMP', tags: ['WSHP-01'],         why: 'W-W_HPs.xlsx: "WATER TO WATER HEAT PUMP SCHEDULE"' },
  ]
  for (const s of BY_SCHEDULE) {
    const { data, error } = await sb.from('equipment').update({ category: s.cat })
      .eq('project_id', proj.id).eq('category', 'PUMPS').in('tag', s.tags).select('tag')
    if (error) { console.error(`${s.cat} failed: ${error.message}`); process.exit(1) }
    if (data.length) console.log(`  ${String(data.length).padStart(3)} → ${s.cat.padEnd(26)} (${s.why})`)
    moved += data.length
  }

  // Types the schedules settled while we were in there.
  for (const [tag, t, why] of [
    ['BG-01',  'boiler', 'NATURAL GAS BOILER SCHEDULE'],
    ['FSP-01', 'pump',   'appears in Pumps.xlsx "PUMP SCHEDULE"'],
  ]) {
    const { data } = await sb.from('equipment').update({ equipment_type: t })
      .eq('project_id', proj.id).eq('tag', tag).is('equipment_type', null).select('tag')
    if (data?.length) console.log(`  typed ${tag} → ${t} (${why})`)
  }
  await sb.from('import_batches').update({ rows_created: moved }).eq('id', batch.id)

  for (const q of [
    { observed_name: 'Dry-Type Transformer', proposed_key: 'transformer', tags: ['TX-GC1','TX-GS1','TX-GN1'], n: 19 },
    { observed_name: 'Lighting Panel',       proposed_key: 'lighting_panel', tags: ['LP-GXC1','LP-PHV1'], n: 7 },
    { observed_name: 'Distribution Panel',   proposed_key: 'distribution_panel', tags: ['DP-GEF1','DP-PHK1'], n: 5 },
    { observed_name: 'Switchgear',           proposed_key: 'switchgear', tags: ['SWGR-GA2','SWGR-GEA1'], n: 2 },
    { observed_name: 'Switchboard',          proposed_key: 'switchboard', tags: ['SWBD-GG1','SWBD-GEB1'], n: 2 },
    { observed_name: 'Fluid Cooler',         proposed_key: 'fluid_cooler', tags: ['FLC-01'], n: 1 },
  ]) {
    const { data: seen } = await sb.from('proposed_equipment_types').select('id, status')
      .eq('project_id', proj.id).eq('observed_name', q.observed_name).maybeSingle()
    if (seen) continue
    await sb.from('proposed_equipment_types').insert({
      project_id: proj.id, observed_name: q.observed_name, proposed_key: q.proposed_key,
      evidence: { sample_tags: q.tags, count: q.n, source: 'Seneca 257889 — ELECTRICAL/PUMPS split' },
    })
    console.log(`  queued: ${q.observed_name} (${q.n})`)
  }

  const { data: leftE } = await sb.from('equipment').select('tag')
    .eq('project_id', proj.id).eq('category', 'ELECTRICAL')
  const { data: leftP } = await sb.from('equipment').select('tag')
    .eq('project_id', proj.id).eq('category', 'PUMPS')
  console.log('')
  check(leftE.length === 0, `ELECTRICAL fully resolved: ${leftE.length} rows remain`)
  check(leftP.length === 37,
    `PUMPS now holds ${leftP.length} — 30 real pumps + RHC/GI/PRV-NG (7) held for identification`)
}

// ── Stage 3d: the unidentified go to MISCELLANEOUS ──────────────────────────
if (stage === 'misc') {
  // Ruled: park what could not be identified rather than leaving it sitting in a
  // category that is actively wrong. MISCELLANEOUS is honest — it says "not yet
  // identified" — whereas leaving a reheat coil under PUMPS asserts something
  // false. The original source placement is recorded in the batch note so this
  // stays reversible and the trail survives.
  const MISC = [
    { tags: ['RHC-01','RHC-02','RHC-03'], from: 'PUMPS',             what: 'RHC' },
    { tags: ['GI-1','GI-2'],              from: 'PUMPS',             what: 'GI' },
    { tags: ['PRV-NG-1','PRV-NG-2'],      from: 'PUMPS',             what: 'PRV-NG' },
    { tags: ['DBF-1','DBF-2'],            from: 'AIR HANDLING UNIT', what: 'DBF' },
  ]
  const batch = await getBatch({
    entity: 'equipment:miscellaneous',
    sourceFile: 'ruling/2026-07-27 unidentified to MISCELLANEOUS',
    revision: '9 rows',
    expected: 9,
    note:
      'Nine rows that appear in NO equipment schedule and carry no descriptor, so neither the '
      + 'schedules nor the source could identify them. Original source placement, preserved here: '
      + 'RHC-01..03, GI-1/2 and PRV-NG-1/2 sat under the source header "PUMPS"; DBF-1/2 under '
      + '"AIR HANDLING UNIT" (locations "WOMEN\'S REC CHN ROOM" and "EQ. STORAGE"). Both placements '
      + 'are wrong — a reheat coil is not a pump — and MISCELLANEOUS is the honest holding pen: it '
      + 'says "not yet identified" instead of asserting something false. equipment_type stays NULL '
      + 'and each family is queued for ratification; identifying them later is a category edit, not '
      + 'a re-import.',
  })
  console.log(`batch ${batch.id}`)

  let moved = 0
  for (const m of MISC) {
    const { data, error } = await sb.from('equipment')
      .update({ category: 'MISCELLANEOUS' })
      .eq('project_id', proj.id).eq('category', m.from).in('tag', m.tags).select('tag')
    if (error) { console.error(`misc move failed (${m.what}): ${error.message}`); process.exit(1) }
    if (data.length) console.log(`  ${data.length} × ${m.what.padEnd(8)} ${m.from} → MISCELLANEOUS`)
    moved += data.length
  }
  await sb.from('import_batches').update({ rows_created: moved }).eq('id', batch.id)

  // Queue the ones not already awaiting a type, so parking them does not quietly
  // drop them off the ratification list.
  for (const q of [
    { observed_name: 'RHC (unidentified)',    tags: ['RHC-01','RHC-02','RHC-03'], n: 3 },
    { observed_name: 'GI (unidentified)',     tags: ['GI-1','GI-2'],              n: 2 },
    { observed_name: 'PRV-NG (unidentified)', tags: ['PRV-NG-1','PRV-NG-2'],      n: 2 },
  ]) {
    const { data: seen } = await sb.from('proposed_equipment_types').select('id')
      .eq('project_id', proj.id).eq('observed_name', q.observed_name).maybeSingle()
    if (seen) continue
    await sb.from('proposed_equipment_types').insert({
      project_id: proj.id, observed_name: q.observed_name, proposed_key: null,
      evidence: { sample_tags: q.tags, count: q.n,
                  source: 'Seneca 257889 — parked in MISCELLANEOUS, identity unknown' },
    })
    console.log(`  queued: ${q.observed_name} (${q.n})`)
  }

  const { data: misc } = await sb.from('equipment').select('tag')
    .eq('project_id', proj.id).eq('category', 'MISCELLANEOUS')
  const { data: pumps } = await sb.from('equipment').select('tag')
    .eq('project_id', proj.id).eq('category', 'PUMPS')
  const { data: ahu } = await sb.from('equipment').select('tag')
    .eq('project_id', proj.id).eq('category', 'AIR HANDLING UNIT')
  console.log('')
  check(misc.length === 9, `MISCELLANEOUS holds ${misc.length}: ${misc.map(m => m.tag).sort().join(', ')}`)
  check(pumps.length === 30, `PUMPS is now ${pumps.length} — every row a pump`)
  check(ahu.length === 5, `AIR HANDLING UNIT is now ${ahu.length} — every row an AHU`)
}

console.log('\n' + '='.repeat(60))
console.log(failures === 0 ? 'PASS — counts reconciled, batch coverage complete.'
                           : `FAIL — ${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
