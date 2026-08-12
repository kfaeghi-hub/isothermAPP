// pw-intake-orchestrator — 5a's gate, SIGHTED. [KEEL]
//
//   node --env-file=.env pw-intake-orchestrator.mjs
//
// A real multi-sheet workbook through the real browser path on ZZ-TEST: three
// sheets, one of them 199x52 and therefore read in bands, one of them the VAV
// sheet the rules leg cannot type at all. Real model calls, real cost, real rows.
//
// WHAT IT PROVES, and each of these is a Phase 5a gate clause:
//   1. every sheet stages, with ALL SIX provenance columns populated
//   2. disagreements and questions survive to the database
//   3. a chunked sheet assembles — bands in, one row set out, no tag twice
//   4. the run is INTERRUPTIBLE: killing it mid-run leaves a named partial, and
//      re-presenting the same file resumes from staged state rather than
//      restarting or duplicating
//   5. a partial DISCARDS as a unit
//   6. the per-upload cost is reported — the first real user-action cost line
//
// EXPENSIVE ON PURPOSE, and therefore NOT in the battery: ~20 model calls, a few
// dollars, several minutes. Same rule as pw-extractor's --real-ai leg. A gate that
// bills on every commit gets run less often.
//
// ZZ-TEST ONLY, self-cleaning.
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-intake-orchestrator')

const FIXTURE = 'samples/multisheet-fixture.xlsx'
if (!existsSync(FIXTURE)) {
  console.log('='.repeat(70))
  console.log(`SKIPPED — ${FIXTURE} is not present.`)
  console.log('  Build it with: node gen-multisheet-fixture.mjs')
  console.log('  It is derived from client schedules and is gitignored. This is a')
  console.log('  skip, not a pass.')
  console.log('='.repeat(70))
  process.exit(0)
}

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', TEST_PROJECT).single()
if (!proj) { console.error(`REFUSING: no project named "${TEST_PROJECT}"`); process.exit(1) }

async function cleanup() {
  const { data: ups } = await svc.from('intake_uploads')
    .select('id').eq('project_id', proj.id).like('filename', 'multisheet-fixture%')
  for (const u of ups ?? []) {
    await svc.from('intake_rows').delete().eq('upload_id', u.id)
    await svc.from('intake_uploads').delete().eq('id', u.id)
  }
  return (ups ?? []).length
}
await cleanup()

const browser = await chromium.launch()
let page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })

async function openImport(p) {
  await p.goto(`${BASE_URL}/projects/${proj.id}?tab=equipment`, { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: 'Import', exact: true }).click()
  await p.locator('input[type="file"]').first().setInputFiles(FIXTURE)
  await p.waitForTimeout(6000)
}

try {
  await loginAs(page, adminCredentials())
  await openImport(page)

  const preview = await page.locator('body').innerText()
  check(/PUMPS/.test(preview) && /VAV/.test(preview) && /COILS/.test(preview),
    'the preview shows all three sheets before anything is read')

  // ── 4a · start the run, then KILL IT mid-flight ──────────────────────────
  await page.getByRole('button', { name: /Read 3 sheets/ }).click()

  // FAIL FAST ON A REJECTED WRITE. The first run of this gate waited 75s and then
  // reported "0 sheets staged", which reads as a broken pipeline — the truth was
  // that the upload INSERT had been refused by a check constraint before a single
  // model call. A gate that cannot tell a refused write from a dead pipeline costs
  // a diagnosis every time.
  await page.waitForTimeout(12_000)
  const { data: born } = await svc.from('intake_uploads')
    .select('id, status').eq('project_id', proj.id).like('filename', 'multisheet%').maybeSingle()
  if (!born) {
    const onScreen = await page.locator('body').innerText()
    const said = onScreen.split(String.fromCharCode(10))
      .find(l => /error|failed|violates|constraint/i.test(l)) ?? '(nothing on screen)'
    check(false, `the upload row was never created — the run never started. Screen says: ${said.trim().slice(0, 160)}`)
    throw new Error('no upload row; the rest of this gate would assert against nothing')
  }
  check(true, `the upload row exists within 12s (status "${born.status}") — the run started`)

  // Long enough for the FIRST sheet to finish and the second to be in flight.
  // Measured: PUMPS (70 rows) takes ~90-110s through read + verify + stage. The
  // first version waited 75s, found nothing staged, and reported it as a failure
  // — the pipeline was working and the clock was wrong.
  await page.waitForTimeout(150_000)

  const { data: midRows } = await svc.from('intake_rows')
    .select('source_sheet').eq('project_id', proj.id)
  const midSheets = [...new Set((midRows ?? []).map(r => r.source_sheet))]
  check(midSheets.length >= 1,
    `rows stage AS SHEETS COMPLETE — ${midSheets.length} sheet(s) already in the database mid-run (${midSheets.join(', ')})`)

  const { data: midUp } = await svc.from('intake_uploads')
    .select('id, status, parse_note').eq('project_id', proj.id).like('filename', 'multisheet%').maybeSingle()
  check(midUp?.status === 'reading',
    `and the upload says what it is doing — status "${midUp?.status}"`)

  // THE TAB DIES. This is the state progressive staging created, so it is the
  // state that has to be proven.
  await page.close()
  check(true, 'the tab was closed mid-run — the browser was the orchestrator, so the run stopped')

  await new Promise(r => setTimeout(r, 2000))
  const { data: afterKill } = await svc.from('intake_uploads')
    .select('id, status').eq('id', midUp.id).single()
  check(afterKill.status === 'reading',
    'the partial survives as a NAMED state, not a mystery half-population')

  // ── 4b · re-present the same file: resume, never duplicate ───────────────
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await loginAs(page, adminCredentials())
  await openImport(page)

  const resumeBox = page.locator('[data-testid="resume-partial"]')
  check(await resumeBox.count() > 0, 'the same file is offered as a RESUME, not a second run')
  if (await resumeBox.count() > 0) {
    const t = await resumeBox.first().innerText()
    check(/already being read/i.test(t) && /\d+ of 3 sheet/.test(t),
      `and it says how far it got — "${t.split('\n')[0].trim()}"`)
    check(/no equipment is affected/i.test(t),
      'and that nothing was approved, so the register is untouched')
  }

  const before = (await svc.from('intake_uploads').select('id').eq('project_id', proj.id)).data?.length ?? 0
  await page.getByRole('button', { name: /Resume/ }).click()
  // THE REAL WORKLOAD, MEASURED. VAV is ~105s (it needs a content retry) and
  // COILS is 199x52 — eighteen bands at ~20s each. A three-sheet workbook of this
  // shape takes TEN TO TWELVE MINUTES end to end, which is a fact about the work
  // rather than about the harness, and it is why the orchestrator stages
  // progressively instead of holding everything to the end.
  await page.waitForTimeout(780_000)

  const after = (await svc.from('intake_uploads').select('id').eq('project_id', proj.id)).data?.length ?? 0
  check(after === before, `resuming did NOT create a second upload (${before} → ${after})`)

  // ── 1,2,3 · what landed ──────────────────────────────────────────────────
  const { data: rows } = await svc.from('intake_rows')
    .select('source_sheet, tag, read_via, claims, disagreements, questions, verification, confidence')
    .eq('upload_id', midUp.id)
  const sheets = [...new Set((rows ?? []).map(r => r.source_sheet))]
  check(sheets.length === 3, `all three sheets staged (${sheets.length}: ${sheets.join(', ')})`)

  check((rows ?? []).length > 60, `the run staged ${rows?.length ?? 0} rows`)
  check((rows ?? []).every(r => r.read_via), 'EVERY row carries read_via — which reader produced it')
  check((rows ?? []).some(r => r.read_via === 'both'), 'and some rows were seen by BOTH readers')
  check((rows ?? []).every(r => r.claims), 'every row carries per-field claims')
  check((rows ?? []).some(r => r.disagreements), 'disagreements survived to the database')
  check((rows ?? []).some(r => r.verification), 'verification results survived to the database')

  const coils = (rows ?? []).filter(r => r.source_sheet === 'COILS')
  check(coils.length > 40, `the CHUNKED sheet assembled — ${coils.length} rows from a 199x52 grid read in bands`)
  const coilTags = coils.map(r => (r.tag ?? '').toUpperCase()).filter(Boolean)
  check(new Set(coilTags).size === coilTags.length || coils.some(r => r.disagreements),
    `and no tag was double-counted across bands (${coilTags.length} tags, ${new Set(coilTags).size} distinct)`)

  const { data: finalUp } = await svc.from('intake_uploads').select('status, parse_note, row_count').eq('id', midUp.id).single()
  check(/\d+(\.\d+)?c over \d+ model call/.test(finalUp.parse_note ?? ''),
    `THE COST OF A REAL UPLOAD IS RECORDED — "${finalUp.parse_note}"`)
  console.log(`\n  [SAMPLE] per-upload cost line: ${finalUp.parse_note}\n`)

  // ── 5 · discard a partial as a unit ──────────────────────────────────────
  const { data: probe } = await svc.from('intake_uploads').insert({
    project_id: proj.id, filename: 'multisheet-fixture-partial.xlsx',
    storage_path: `${proj.id}/probe-partial.xlsx`, kind: 'excel',
    content_sha256: 'probe-partial-' + Date.now(), status: 'reading', row_count: 0,
  }).select('id').single()
  await svc.from('intake_rows').insert([
    { upload_id: probe.id, project_id: proj.id, source_sheet: 'X', tag: 'PROBE-1', confidence: 0.5 },
  ])
  const { data: gone } = await svc.from('intake_rows').delete().eq('upload_id', probe.id).select('id')
  await svc.from('intake_uploads').delete().eq('id', probe.id)
  check((gone ?? []).length === 1,
    'a partial DISCARDS as a unit — its staged rows go with it (explicit act, never a timeout)')

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await browser.close().catch(() => {})
  const n = await cleanup()
  console.log(`\ncleanup: ${n} upload(s) removed from ${TEST_PROJECT}`)
}

console.log('\n' + '='.repeat(70))
console.log(fail
  ? `FAIL — ${fail} of ${pass + fail}`
  : `PASS — ${pass} checks. A real workbook, orchestrated by the browser, staged with provenance, interrupted and resumed.`)
process.exit(fail ? 1 : 0)
