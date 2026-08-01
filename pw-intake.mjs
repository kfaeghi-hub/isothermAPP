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

const made = { uploads: [], equipment: [] }
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

  // ── re-uploading the same bytes is refused, not doubled ───────────────────
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.locator('input[type="file"]').first().setInputFiles('fixtures/intake-sample.xlsx')
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Stage \d+ rows/ }).click()
  await page.waitForTimeout(2000)

  const body2 = await page.locator('body').innerText()
  check(/already uploaded/.test(body2), 'the same file re-uploaded is REFUSED with the prior upload named')
  const { count: rowsAfter } = await adm.from('intake_rows')
    .select('id', { count: 'exact', head: true }).eq('project_id', zz.id)
  check(rowsAfter === 5, `re-upload staged nothing more (${rowsAfter} rows, still 5)`)

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
  for (const id of made.equipment) await adm.from('equipment').delete().eq('id', id)

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
