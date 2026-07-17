// Project dates verification: set dates on ZZ-TEST via the Edit modal, assert the
// header range, the list line, and start-date sorting.
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-dates.mjs

import { chromium } from 'playwright'
import { login, openTestProject, TEST_PROJECT } from './pw-config.mjs'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.setViewportSize({ width: 1500, height: 1000 })

await login(page)
await openTestProject(page)

// Edit → set dates
await page.getByRole('button', { name: 'Edit Project' }).click()
await page.waitForTimeout(800)
const modal = page.locator('.fixed')
const dateInputs = modal.locator('input[type="date"]')
check(await dateInputs.count() === 2, 'edit modal has start + finish date pickers')
await dateInputs.first().fill('2026-07-01')
await dateInputs.nth(1).fill('2027-12-15')

// ZZ-TEST is classification-incomplete (Facility/Phases unset from the backfill) and
// the edit save correctly enforces required dimensions — complete them here.
const facility = modal.locator('select').nth(2)   // [0]=Client [1]=Lifecycle [2]=Facility
if (!(await facility.locator('option:checked').textContent())?.trim() ||
    (await facility.inputValue()) === '') {
  await facility.selectOption({ label: 'School' })
}
const constructionPill = modal.getByRole('button', { name: 'Construction', exact: true })
if ((await constructionPill.getAttribute('class'))?.includes('bg-white')) {
  await constructionPill.click()
}

await modal.getByRole('button', { name: 'Save Changes' }).click()
await page.waitForTimeout(2500)
check(await page.locator('.fixed').getByRole('button', { name: 'Save Changes' }).count() === 0,
  'edit modal closed (saved)')

// Header shows the range
check(await page.getByText('Jul 2026 → Dec 2027').count() >= 1, 'header shows "Jul 2026 → Dec 2027"')
await page.screenshot({ path: 'ss-dates-1-header.png' })

// Back to list: muted line + sort
await page.getByRole('button', { name: '← Projects' }).click()
await page.waitForTimeout(1500)
const row = page.locator('tr', { hasText: TEST_PROJECT })
check(await row.getByText('Jul 2026 → Dec 2027').count() === 1, 'list row shows date range line')

await page.locator('select', { hasText: 'Sort: Recent' }).selectOption('start_date')
await page.waitForTimeout(400)
// ZZ-TEST is the only dated project → must be the FIRST data row; undated sink below.
const firstRowText = await page.locator('tbody tr').first().textContent()
check((firstRowText ?? '').includes(TEST_PROJECT), 'sort by start date puts the dated project first')
await page.screenshot({ path: 'ss-dates-2-list.png' })

console.log('\n' + (fails.length === 0 ? 'PASS — project dates verified on ZZ-TEST.' : `FAIL — ${fails.join('; ')}`))
await browser.close()
process.exit(fails.length === 0 ? 0 : 1)
