// pw-intake-review — the 5b review surface, asserted against every provenance
// shape at once. [KEEL] 2026-08-13.
//
// Seeds the synthetic fixture (seed-5b-review-fixture.mjs — no model calls),
// opens the review through the real browser path, and asserts THE GATES:
//
//   1. sheet-level questions render ONCE, not once per row
//   2. a row-attributed question renders on its row
//   3. a TYPE-CONFLICTED row exposes NO UNNAMED ACCEPT (ruled 2026-08-13) —
//      its accept paths are the two offers, each naming a reading
//   4. choosing a reading records the EDITED disposition with that type
//   5. the conservative clean gate: disagreement/question carriers are not
//      bulk-acceptable, and the bulk button says what IS
//   6. the bulk label counts unverified rows — "(1 unverified)"
//   7. provenance chips render (leg + verification flag)
//   8. a settled row keeps its provenance and names the reading it was taken as
//
// ZZ-TEST ONLY. Self-cleaning: the fixture is seeded at start and removed in
// finally, so assertZzTestQuiet stays quiet for the next suite.
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, openTestProject, waitUntil } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-intake-review')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const seed = (...args) => spawnSync(process.execPath, ['seed-5b-review-fixture.mjs', ...args],
  { env: process.env, encoding: 'utf8' })

const seeded = seed()
if (seeded.status !== 0) {
  console.error(`REFUSING: fixture seed failed — ${seeded.stderr || seeded.stdout}`)
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } })
try {
  await loginAs(page, adminCredentials())
  await openTestProject(page)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await waitUntil(async () => await page.getByText('zz-5b-review-fixture.xlsx').count() >= 1,
    { timeout: 15000, what: 'the fixture in the staged-uploads list' })
  await page.getByText('zz-5b-review-fixture.xlsx').first().click()
  await waitUntil(async () => await page.getByText('THE READERS ASKED').count() === 1,
    { timeout: 15000, what: 'the review surface' })

  // 1 · the sheet question renders ONCE — the orchestrator stages it onto all 8
  //     rows, so a raw render would show it 8 times.
  check(await page.getByText('all heaters interlocked with CO sensors').count() === 1,
    'sheet-level question renders ONCE, not once per row')

  // 2 · the attributed question renders on its row
  check(await page.getByText('which duty is it?').count() === 1,
    'row-attributed question renders on its row (ZZ5B-B-1)')

  // 3 · THE RULED ASSERTION: the conflicted row exposes no unnamed accept.
  // Row scoping: anchor on the TAG'S OWN ELEMENT and take the NEAREST border-b
  // ancestor — the Line container. A bare div.border-b+hasText matches page-level
  // ancestors too, and .first() in document order returns the outermost, which
  // made both row assertions read the whole review (found the hard way: the
  // first run of this suite failed BOTH ways at once — an Accept "present" on
  // the conflicted row and "absent" on the unconflicted one, because both
  // locators were the same giant div).
  const rowOf = (tag) => page.locator('span.font-mono', { hasText: tag }).first()
    .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
  const hpRow = rowOf('ZZ5B-HP-2')
  check(await hpRow.getByRole('button', { name: 'Accept', exact: true }).count() === 0,
    'conflicted row exposes NO unnamed Accept button')
  check(await hpRow.getByText('choose a reading to accept').count() === 1,
    'and says why in its place')
  const offers = hpRow.getByRole('button', { name: /^Accept as / })
  check(await offers.count() === 2, 'both readings offered as named accepts')

  // an UNCONFLICTED needs-a-look row still has its generic Accept — the
  // suppression is the conflict's, not the block's
  const efRow = rowOf('ZZ5B-EF-7')
  check(await efRow.getByRole('button', { name: 'Accept', exact: true }).count() === 1,
    'unconflicted row keeps its generic Accept (suppression is per-conflict, not per-block)')

  // 5+6 · the bulk button: says 2 clean, names the unverified one
  const bulk = page.getByRole('button', { name: /Accept all/ })
  const bulkText = (await bulk.innerText()).trim()
  check(/Accept all 2 clean \(1 unverified\)/.test(bulkText),
    `bulk label counts clean AND unverified — got "${bulkText}"`)

  // 7 · provenance chips
  check(await page.getByText('model only', { exact: true }).count() >= 1, 'leg chip: model only (ZZ5B-VAV-12)')
  check(await page.getByText('rules only', { exact: true }).count() >= 1, 'leg chip: rules only (ZZ5B-CUH-4)')
  check(await page.getByText(/⚑ 1 flag/).count() === 1, 'verification flag chip (ZZ5B-B-1)')
  check(await page.getByText('unverified', { exact: true }).count() >= 1, 'unverified chip (ZZ5B-UH-9)')

  // 4 · choose a reading: the offer records EDITED with the chosen type
  await hpRow.getByRole('button', { name: /^Accept as Heat Pump/ }).click()
  await waitUntil(async () => {
    const { data } = await svc.from('intake_rows')
      .select('disposition, edited').eq('tag', 'ZZ5B-HP-2').single()
    return data?.disposition === 'edited' && data?.edited?.proposed_type === 'heat_pump'
  }, { timeout: 15000, what: 'the offer landing as an edited disposition naming heat_pump' })
  const { data: hp } = await svc.from('intake_rows')
    .select('disposition, edited').eq('tag', 'ZZ5B-HP-2').single()
  check(hp?.disposition === 'edited' && hp?.edited?.proposed_type === 'heat_pump',
    'choosing a reading records disposition=edited with THAT type — a named act')

  // 8 · the settled row keeps its provenance and names its reading
  await waitUntil(async () => await page.getByText(/Settled — 1/).count() === 1,
    { timeout: 15000, what: 'the settled block appearing' })
  const settledSection = page.locator('h4', { hasText: 'Settled —' }).locator('..')
  // Scoped to the settled section: the fixture's SECOND conflict row (CU-2,
  // added for the Phase 6 gate) has an offer button whose label contains the
  // same "as Heat Pump" substring, so a page-wide count reads 2.
  check(await settledSection.getByText('as Heat Pump').count() === 1,
    'settled row names the reading it was accepted as')
  check(await settledSection.getByText('both readers').count() >= 1,
    'settled row keeps its leg chip')

} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-intake-review-fail.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close().catch(() => {})
  const cleaned = seed('--clean')
  console.log(`\n${(cleaned.stdout || '').trim()}`)
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. The review surface renders provenance and refuses the unnamed accept.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
