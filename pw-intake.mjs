// pw-intake — B1's gate: upload + the deterministic Excel path.
//
//   node --env-file=.env pw-intake.mjs
//
// ZZ-TEST only, self-cleaning in `finally`, scoped by id.
//
// THE NAMED GATE IS "NO MODEL INVOLVED", AND THAT IS ASSERTED RATHER THAN
// ASSUMED: ai_generations is counted before and after, and the run fails if a
// single call was logged. Every agent in this system writes that row, so a
// parser that quietly reached for one cannot hide. Saying "the parser doesn't
// call the model" in a comment proves nothing; counting does.
//
// The rest drives the REAL UI with the REAL file — setInputFiles on the real
// input, the app's own parse, the app's own inserts — because the seam between
// the reader and the parser is where the last two defect classes lived.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'

const fails = []
let passed = 0
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg) }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())

const { data: zz } = await adm.from('projects').select('id, name').eq('name', TEST_PROJECT).single()
if (!zz) { console.error(`REFUSING: no project named "${TEST_PROJECT}"`); process.exit(1) }
console.log(`target: ${zz.name}\n`)

const made = { uploads: [], equipment: [], batches: [], rules: [], types: [] }
let browser

try {
  // ── seed one existing unit so ENRICH detection has something to find ──────
  // `kind` is NOT NULL on equipment and constrained to equipment|system. Worth
  // recording here because B3's approval writes hit the same constraint, and a
  // NOT NULL discovered at write time is a failed import, not a warning.
  const seeded = await adm.from('equipment').insert({
    project_id: zz.id, kind: 'equipment', tag: 'P-01', descriptor: 'ZZ-INTAKE seeded pump',
  }).select('id').single()
  // Surface the reason rather than dying on `null.id` three lines later.
  if (seeded.error) throw new Error(`seed equipment: ${seeded.error.message}`)
  const seed = seeded.data
  made.equipment.push(seed.id)

  const { count: aiBefore } = await adm.from('ai_generations')
    .select('id', { count: 'exact', head: true })
  // ZZ-TEST carries standing fixtures, so law 2 is asserted as a DELTA. An
  // absolute count here would encode today's fixture list and break the next time
  // anyone adds one — a test that fails for the wrong reason gets muted, and a
  // muted test is worse than none.
  const { count: equipBefore } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  const { count: typesBefore } = await adm.from('equipment_types')
    .select('key', { count: 'exact', head: true })

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await loginAs(page, adminCredentials())
  await page.goto(`${BASE_URL}/projects/${zz.id}?tab=equipment`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.locator('input[type="file"]').first().setInputFiles('fixtures/intake-sample.xlsx')
  await page.waitForTimeout(2500)

  const preview = await page.locator('body').innerText()

  // ── THE MAPPING IS SHOWN BEFORE ANYTHING IS WRITTEN ───────────────────────
  check(/5 rows/.test(preview), 'preview reports 5 rows (3 pumps + 2 VAV; cover sheet contributes none)')
  check(/tag ← TAG/.test(preview), 'preview shows which column it read as the tag')
  check(/kept as nameplate: GPM, HEAD \(FT\)/.test(preview),
    'preview names the engineering columns it kept rather than silently dropping them')
  check(/1 match existing equipment/.test(preview),
    'preview flags the row matching seeded P-01 as an enrich, before staging')

  const { count: stagedEarly } = await adm.from('intake_rows')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(stagedEarly === 0, 'NOTHING IS WRITTEN BY THE PREVIEW — 0 rows staged so far')

  // ── stage ─────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /Stage \d+ rows/ }).click()
  await page.waitForTimeout(3000)

  const { data: uploads } = await adm.from('intake_uploads')
    .select('*').eq('project_id', zz.id).order('uploaded_at', { ascending: false })
  made.uploads = (uploads ?? []).map(u => u.id)
  check(uploads?.length === 1, `one upload row created (${uploads?.length ?? 0})`)
  const up = uploads?.[0]
  check(up?.status === 'parsed', `upload status is 'parsed' (${up?.status})`)
  check(!!up?.content_sha256, 'file hash stored — B3 idempotency has something to compare')
  check(up?.row_count === 5, `row_count recorded as 5 (${up?.row_count})`)

  const { data: rows } = await adm.from('intake_rows')
    .select('*').eq('upload_id', up.id).order('source_sheet').order('source_row')
  check(rows?.length === 5, `5 intake rows (${rows?.length ?? 0})`)

  const pumps = (rows ?? []).filter(r => r.source_sheet === 'Pumps')
  check(pumps.length === 3 && pumps.every(r => r.proposed_type === 'pump'),
    'all three pumps typed from their description')
  check(pumps.every(r => r.proposed_category === 'HYDRONIC PUMP'),
    'category taken from the schedule title, not invented')
  check(!(rows ?? []).some(r => /NOTES/i.test(r.tag ?? '')),
    'the notes line did NOT become equipment')

  const p01 = pumps.find(r => r.tag === 'P-01')
  check(p01?.match_equipment_id === seed.id,
    'P-01 is an ENRICH proposal against the seeded unit, not a second copy')
  check(pumps.filter(r => r.tag !== 'P-01').every(r => r.match_equipment_id === null),
    'rows with no existing tag are plain creates')

  check(JSON.stringify(pumps.find(r => r.tag === 'P-02')?.nameplate) === JSON.stringify({ GPM: '120', 'HEAD (FT)': '45' }),
    'unmapped engineering columns preserved as nameplate')

  const vav = (rows ?? []).filter(r => r.source_sheet === 'VAV')
  check(vav.length === 2 && vav.every(r => r.proposed_type === 'vav'),
    'the merged two-deep header sheet parsed correctly')

  check((rows ?? []).every(r => r.disposition === 'pending'),
    'every row is PENDING — nothing is approved by being uploaded')

  const { count: equipNow } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(equipNow === equipBefore,
    `LAW 2 — staging created no equipment (${equipBefore} before, ${equipNow} after)`)

  // ── THE GATE ──────────────────────────────────────────────────────────────
  const { count: aiAfter } = await adm.from('ai_generations')
    .select('id', { count: 'exact', head: true })
  check(aiAfter === aiBefore,
    `NO MODEL INVOLVED — ai_generations unchanged (${aiBefore} → ${aiAfter})`)

  // ── THE REVIEW SCREEN ─────────────────────────────────────────────────────
  // Staging opens the review, so the screen under test is the one a user lands
  // on rather than one reached by a route only the test knows.
  await page.waitForTimeout(1500)
  const review = await page.locator('body').innerText()

  check(/Intake review/.test(review), 'staging opens the review screen')
  check(/CHANGES EXISTING EQUIPMENT/.test(review),
    'the enrich block is present and named for what it does, not for its data shape')
  check(/Clean — 4/.test(review), 'four clean rows (5 staged, 1 is the enrich)')

  // THE DIFF SHOWS ONLY WHAT WOULD CHANGE. The seeded P-01 has no location, and
  // the schedule proposes one — so exactly that line should appear.
  check(/location:.*Mech Room 1/s.test(review), 'the enrich diff names the field it would fill')
  check(/ZZ-INTAKE seeded pump/.test(review),
    'the diff shows the EXISTING value being replaced, not just the new one')

  const { count: fbBefore } = await adm.from('agent_feedback')
    .select('id', { count: 'exact', head: true })

  // ── bulk-accept settles the body and NOTHING ELSE ─────────────────────────
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: /Accept all 4 clean/ }).click()
  await page.waitForTimeout(2500)

  const { data: afterBulk } = await adm.from('intake_rows')
    .select('tag, disposition, match_equipment_id').eq('upload_id', up.id)
  const acceptedTags = (afterBulk ?? []).filter(r => r.disposition === 'accepted').map(r => r.tag).sort()
  check(acceptedTags.length === 4, `bulk accepted exactly 4 (${acceptedTags.length})`)
  check(!acceptedTags.includes('P-01'),
    'THE ENRICH ROW WAS NOT BULK-ACCEPTED — the one row that could alter an existing unit')
  const stillPending = (afterBulk ?? []).filter(r => r.disposition === 'pending')
  check(stillPending.length === 1 && stillPending[0].tag === 'P-01',
    'P-01 is still pending an individual decision')

  // ── the ledger is for AGENTS, and this upload had none ────────────────────
  const { count: fbAfter } = await adm.from('agent_feedback')
    .select('id', { count: 'exact', head: true })
  check(fbAfter === fbBefore,
    `NO LEDGER ROWS FROM A DETERMINISTIC PARSE — agent_feedback unchanged (${fbBefore} → ${fbAfter}). ` +
    `Crediting the extractor for an Excel read would corrupt the acceptance rate the promotion rule reads.`)

  const { count: equipStill } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(equipStill === equipBefore,
    `LAW 2 — accepting is a DECISION, not a write: equipment still ${equipStill}`)

  // ── NEVER OVERWRITE, BY DEFAULT AND NOT BY HOPE ───────────────────────────
  // The seeded P-01 carries a human-written descriptor. The schedule proposes
  // the generic "PUMP" over it, and offers a location and a type for fields that
  // are empty. Additive lines are ticked; the replacement is not, so a reviewer
  // who clicks straight through never silently downgrades an entered value.
  const enrichView = await page.locator('body').innerText()
  check(/replaces an entered value/.test(enrichView),
    'the replacement is LABELLED as replacing something, not shown as a neutral change')

  const boxes = page.locator('input[type="checkbox"]')
  const states = await boxes.evaluateAll(els => els.map(e => e.checked))
  check(states.length === 3, `three diff lines offered (${states.length})`)
  check(states.filter(Boolean).length === 2,
    `two ticked by default, one left for the reviewer (${states.filter(Boolean).length} ticked)`)

  await page.getByRole('button', { name: 'Apply selected' }).click()
  await page.waitForTimeout(2500)

  const { data: enrichRow } = await adm.from('intake_rows')
    .select('disposition, edited').eq('upload_id', up.id).eq('tag', 'P-01').maybeSingle()
  check(enrichRow?.disposition === 'edited',
    `taking a SUBSET records 'edited', not 'accepted' (${enrichRow?.disposition}) — ` +
    `the extractor's acceptance rate must not count a partial take as a clean hit`)
  check(enrichRow?.edited && !('descriptor' in enrichRow.edited),
    'the human-written descriptor was NOT carried into the approved change set')
  check(enrichRow?.edited?.location === 'Mech Room 1' && enrichRow?.edited?.proposed_type === 'pump',
    'the two additive fields WERE carried')

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.waitForTimeout(1000)

  // ── re-uploading the same bytes is refused, not doubled ───────────────────
  // No Import click here: closing the review returns to the panel, which is
  // still open. Clicking Import again would TOGGLE it shut — the button is a
  // toggle, and treating it as "open" is how this step failed the first time.
  await page.locator('input[type="file"]').first().setInputFiles('fixtures/intake-sample.xlsx')
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Stage \d+ rows/ }).click()
  await page.waitForTimeout(2000)

  const body2 = await page.locator('body').innerText()
  check(/already uploaded/.test(body2), 'the same file re-uploaded is REFUSED with the prior upload named')
  const { count: rowsAfter } = await adm.from('intake_rows')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(rowsAfter === 5, `re-upload staged nothing more (${rowsAfter} rows, still 5)`)

  // ══ B3 — APPROVAL: the only step that writes to the register ═════════════
  //
  // A firm rule is seeded first, so "ratified rules apply to what just arrived"
  // is tested against a real rule rather than asserted about an empty table. A
  // rule table with no rows would let this pass while doing nothing.
  const { data: grp } = await adm.from('project_cx_stage_groups')
    .select('name, project_cx_columns(id)').eq('project_id', zz.id).limit(1).single()
  const groupCols = (grp.project_cx_columns ?? []).length

  const { data: rule } = await adm.from('cx_applicability_rules').insert({
    equipment_type: 'pump', stage_group_name: grp.name, column_label: null,
    applicable: false, rationale: 'ZZ-INTAKE fixture rule', active: true,
    ratified_at: new Date().toISOString(),
  }).select('id').single()
  made.rules.push(rule.id)

  const naBefore = (await adm.from('cx_cell_applicability')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)).count

  const { data: sess } = await adm.auth.getSession()
  const apiToken = sess.session.access_token
  const approve = async (uploadId) => page.evaluate(async ({ base, uploadId, token }) => {
    const r = await fetch(`${base}/api/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ upload_id: uploadId, action: 'approve' }),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, { base: BASE_URL, uploadId, token: apiToken })

  const app1 = await approve(up.id)
  console.log(`\n  approve: ${app1.status} — ${JSON.stringify(app1.body)}\n`)
  check(app1.status === 200, `approval succeeded (${app1.status})`)

  // 4 clean rows accepted + 1 enrich taken as a subset = 4 creates, 1 enrich.
  check(app1.body?.created === 4, `4 units created (${app1.body?.created})`)
  check(app1.body?.enriched === 1, `1 unit enriched (${app1.body?.enriched})`)
  made.batches.push(app1.body?.batch_id)

  const { data: newEquip } = await adm.from('equipment')
    .select('id, kind, tag, descriptor, equipment_type, location, category, nameplate_extra, import_batch_id')
    .eq('import_batch_id', app1.body.batch_id)
  made.equipment.push(...(newEquip ?? []).map(e => e.id))

  check((newEquip ?? []).length === 4, `4 equipment rows carry the batch (${newEquip?.length})`)
  check((newEquip ?? []).every(e => e.kind === 'equipment'),
    'kind is set on every created unit — the NOT NULL constraint is satisfied deliberately, not by luck')
  check((newEquip ?? []).every(e => !!e.import_batch_id),
    'every created unit carries its provenance batch')

  const p02 = (newEquip ?? []).find(e => e.tag === 'P-02')
  check(p02?.equipment_type === 'pump' && p02?.category === 'HYDRONIC PUMP',
    'type and category carried through from the parse')
  check(JSON.stringify(p02?.nameplate_extra?.spec) === JSON.stringify({ GPM: '120', 'HEAD (FT)': '45' }),
    'schedule columns landed in nameplate_extra.SPEC — design intent, not an installed reading')
  check(!p02?.nameplate_extra?.installed || Object.keys(p02.nameplate_extra.installed).length === 0,
    'nothing was filed as INSTALLED — the register does not claim a verification nobody performed')

  // ── the enrich took ONLY what was ticked ─────────────────────────────────
  const { data: seedNow } = await adm.from('equipment')
    .select('descriptor, location, equipment_type').eq('id', seed.id).single()
  check(seedNow.descriptor === 'ZZ-INTAKE seeded pump',
    'THE HUMAN-WRITTEN DESCRIPTOR SURVIVED — the unticked replacement was not applied')
  check(seedNow.location === 'Mech Room 1' && seedNow.equipment_type === 'pump',
    'the two ticked additive fields WERE applied')

  // ── ratified rules applied to what just arrived ──────────────────────────
  const naAfter = (await adm.from('cx_cell_applicability')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)).count
  check(naAfter > naBefore,
    `ratified rules applied on arrival (${naBefore} → ${naAfter} not-applicable cells)`)

  const pumpIds = (newEquip ?? []).filter(e => e.equipment_type === 'pump').map(e => e.id)
  const { count: pumpNa } = await adm.from('cx_cell_applicability')
    .select('id', { count: 'exact', head: true }).in('equipment_id', pumpIds)
  check(pumpNa === pumpIds.length * groupCols,
    `every new pump got the rule across all ${groupCols} columns of "${grp.name}" ` +
    `(${pumpNa} cells for ${pumpIds.length} units)`)

  // ── unknown types queued, never minted ───────────────────────────────────
  const { data: q } = await adm.from('proposed_equipment_types')
    .select('id, observed_name, status').eq('project_id', zz.id).eq('status', 'proposed')
  made.types.push(...(q ?? []).map(x => x.id))
  const { count: typeCount } = await adm.from('equipment_types')
    .select('key', { count: 'exact', head: true })
  check(typeCount === typesBefore,
    `NO TYPE WAS MINTED by an import (${typesBefore} → ${typeCount})`)

  // ── IDEMPOTENT ───────────────────────────────────────────────────────────
  const app2 = await approve(up.id)
  check(app2.status === 200 && app2.body?.created === 0 && app2.body?.enriched === 0,
    `RE-APPROVING WRITES NOTHING — created ${app2.body?.created}, enriched ${app2.body?.enriched}`)
  check(/[Aa]lready approved/.test(app2.body?.note ?? ''),
    'and it SAYS it was already done rather than reporting a silent success')

  const { count: equipFinal } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(equipFinal === equipBefore + 4,
    `the register grew by exactly 4, once (${equipBefore} → ${equipFinal})`)

  const { data: upFinal } = await adm.from('intake_uploads')
    .select('status, import_batch_id').eq('id', up.id).single()
  check(upFinal.status === 'approved', `the upload closed as approved (${upFinal.status})`)

  // ── a repeated tag inside one workbook is flagged, never dropped ──────────
  await page.locator('input[type="file"]').first().setInputFiles('fixtures/intake-dupes.xlsx')
  await page.waitForTimeout(2500)
  const body3 = await page.locator('body').innerText()
  check(/1 repeated tag/.test(body3), 'preview counts the repeated tag')
  await page.getByRole('button', { name: /Stage \d+ rows/ }).click()
  await page.waitForTimeout(3000)

  const { data: ups2 } = await adm.from('intake_uploads')
    .select('id').eq('project_id', zz.id).order('uploaded_at', { ascending: false })
  made.uploads = (ups2 ?? []).map(u => u.id)
  const { data: dupRows } = await adm.from('intake_rows')
    .select('tag, duplicate_of').eq('upload_id', ups2[0].id).order('source_row')
  check(dupRows?.length === 3, `all three rows kept, including the repeat (${dupRows?.length ?? 0})`)
  const flagged = (dupRows ?? []).filter(r => r.duplicate_of)
  check(flagged.length === 1 && flagged[0].tag === 'ZZEF-10',
    'the SECOND ZZEF-10 is flagged as a duplicate and the first is not')

} catch (e) {
  check(false, `run: ${e.message}`)
  try { await (await browser.newPage()).screenshot({ path: 'out/pw-intake-fail.png' }) } catch { /* best effort */ }
} finally {
  // Cleanup in `finally`, always — a failed assertion must not leave fixture
  // rows behind for the next run to trip over. intake_rows cascade from the
  // upload; equipment and storage objects are removed explicitly.
  for (const id of made.uploads) {
    const { data: u } = await adm.from('intake_uploads').select('storage_path').eq('id', id).maybeSingle()
    if (u?.storage_path) await adm.storage.from('intake-files').remove([u.storage_path])
    await adm.from('intake_uploads').delete().eq('id', id)
  }
  // Order matters: cells and staged rows reference equipment, and import_batches
  // is ON DELETE RESTRICT from the units it explains, so the batch goes last.
  for (const id of made.equipment) {
    await adm.from('cx_cell_applicability').delete().eq('equipment_id', id)
    await adm.from('equipment').delete().eq('id', id)
  }
  for (const id of made.types)   await adm.from('proposed_equipment_types').delete().eq('id', id)
  for (const id of made.rules)   await adm.from('cx_applicability_rules').delete().eq('id', id)
  for (const id of made.batches) if (id) await adm.from('import_batches').delete().eq('id', id)

  const { count: leftRules } = await adm.from('cx_applicability_rules')
    .select('id', { count: 'exact', head: true }).eq('rationale', 'ZZ-INTAKE fixture rule')
  check(leftRules === 0, `self-clean: fixture rule removed (${leftRules} left)`)

  const { count: leftRows } = await adm.from('intake_rows')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  const { count: leftUps } = await adm.from('intake_uploads')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(leftRows === 0 && leftUps === 0, `self-clean: 0 rows, 0 uploads left (${leftRows}/${leftUps})`)
  if (browser) await browser.close()
}

console.log(`\n${'='.repeat(64)}`)
if (fails.length) { console.log(`FAIL — ${fails.length}:`); fails.forEach(f => console.log(`  - ${f}`)); process.exit(1) }
console.log(`PASS — intake: preview before write, enrich matched, duplicates flagged, no model. ${passed} checks.`)
