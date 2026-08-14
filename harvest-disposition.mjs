// harvest-disposition — the sighted review of the replay corpus, ONE TIME.
// [KEEL] Harvest Phase 1, ruled 2026-08-14.
//
// Reproduces the Avondale hand-fixes as dispositions THROUGH THE LIVE REVIEW
// SURFACE — the same edit form, the same save path, the same capture trigger a
// real review exercises. Sighted: screenshots land in out/harvest-*.png before
// and after each upload's review.
//
// THE FIXES, as the incident recorded them:
//   · every row: the SERVICE value the old parser landed in `descriptor` moves
//     to `area_served` (the ×N of the ruled ×4 — the replay surfaces the same
//     defect on all three sheets, 7 rows; the count is reported, not forced)
//   · BP-1/BP-2: boiler → pump (typed from what they SERVE — the law's origin)
//   · P-1/P-2: untyped → pump (the title the old parser missed)
//
// NOT a battery member: the corpus is permanent and this script is a one-shot
// act — it refuses to run if any row is already settled.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL, waitUntil } from './pw-config.mjs'

const PROJECT = 'ZZ-HARVEST — Corpus (Do Not Use)'
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: proj } = await svc.from('projects').select('id').eq('name', PROJECT).single()
if (!proj) { console.error('REFUSING: no corpus project'); process.exit(1) }
const { count: settled } = await svc.from('intake_rows').select('*', { count: 'exact', head: true })
  .eq('project_id', proj.id).neq('disposition', 'pending')
const { count: pendingCount } = await svc.from('intake_rows').select('*', { count: 'exact', head: true })
  .eq('project_id', proj.id).eq('disposition', 'pending')
if ((pendingCount ?? 0) === 0) {
  console.error(`REFUSING: nothing pending — the corpus is fully reviewed (${settled} settled).`)
  process.exit(1)
}
if ((settled ?? 0) > 0) {
  // A prior run was interrupted (the first one died on a stale suggestion
  // locator after 3 rows). The loop below reads PENDING rows only, so resuming
  // cannot double-disposition — the review completes, it does not repeat.
  console.log(`resuming: ${settled} already settled, ${pendingCount} to go`)
}

// tag -> { area (from the old parser's descriptor), type (when retyped), typeName }
const FIXES = {
  'AS-1': { area: 'HEATING SYSTEM' },
  'B-1':  { area: 'HYDRONIC HEATING' },
  'B-2':  { area: 'HYDRONIC HEATING' },
  'BP-1': { area: 'BOILER B-1 PRIMARY LOOP', typeName: 'Pump' },
  'BP-2': { area: 'BOILER B-2 PRIMARY LOOP', typeName: 'Pump' },
  'P-1':  { area: 'SCHOOL FACILITY SECONDARY LOOP', typeName: 'Pump' },
  'P-2':  { area: 'SCHOOL FACILITY SECONDARY LOOP', typeName: 'Pump' },
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
let edited = 0
try {
  await loginAs(page, adminCredentials())
  await page.goto(`${BASE_URL}/projects/${proj.id}?tab=equipment`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Import', exact: true }).click()

  for (const filename of ['replay-AS.xlsx', 'replay-Boilers.xlsx', 'replay-PMPs.xlsx']) {
    await waitUntil(async () => await page.getByText(filename).count() >= 1,
      { timeout: 15000, what: `${filename} in the staged list` })
    await page.getByText(filename).first().click()
    await waitUntil(async () => await page.getByText('Intake review').count() === 1,
      { timeout: 15000, what: 'the review surface' })
    await page.screenshot({ path: `out/harvest-${filename}-before.png`, fullPage: true })

    const { data: rows } = await svc.from('intake_rows')
      .select('tag').eq('project_id', proj.id).eq('disposition', 'pending')
      .in('tag', Object.keys(FIXES)).order('source_row')
    for (const { tag } of rows ?? []) {
      const fix = FIXES[tag]
      const rowEl = page.locator('span.font-mono', { hasText: tag }).first()
        .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
      if (await rowEl.count() === 0) continue // not on this upload's surface
      await rowEl.getByRole('button', { name: 'Edit', exact: true }).click()

      // the edit form: move the served-value, clear the descriptor it squatted in
      const desc = page.locator('input[placeholder="descriptor"]')
      await waitUntil(async () => await desc.count() === 1, { timeout: 15000, what: `${tag} edit form` })
      await desc.fill('')
      await page.locator('input[placeholder="area_served"]').fill(fix.area)
      if (fix.typeName) {
        const picker = page.getByLabel('Row type')
        // fill() sets the value without keystrokes, and the Combobox opens on
        // typing — so type it for real (the fail screenshot showed "Pump" in
        // the field and no option list anywhere).
        await picker.click()
        await picker.clear()
        await picker.pressSequentially(fix.typeName, { delay: 40 })
        // suggestions are role=option rows (Combobox), possibly with a caption
        const suggestion = page.getByRole('option', { name: new RegExp(`^${fix.typeName}`) }).first()
        await waitUntil(async () => await suggestion.count() >= 1,
          { timeout: 15000, what: `the ${fix.typeName} suggestion` })
        await suggestion.click()
      }
      await page.getByRole('button', { name: 'Save + accept' }).click()
      await waitUntil(async () => {
        const { data } = await svc.from('intake_rows')
          .select('disposition').eq('project_id', proj.id).eq('tag', tag).single()
        return data?.disposition === 'edited'
      }, { timeout: 15000, what: `${tag} landing as edited` })
      edited++
      console.log(`  ${tag}: area_served="${fix.area}"${fix.typeName ? ` · type → ${fix.typeName}` : ''}`)
    }
    await page.screenshot({ path: `out/harvest-${filename}-after.png`, fullPage: true })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
  }
} catch (err) {
  console.error(`FAILED mid-review: ${err.message}`)
  await page.screenshot({ path: 'out/harvest-disposition-fail.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
console.log(`\ndispositioned ${edited}/7 — resting state is dispositioned-not-approved; nothing was written to any register.`)
