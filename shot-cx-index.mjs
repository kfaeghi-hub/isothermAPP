// shot-cx-index — render-and-look for the A1 find/filter/panel work.
//
// A1 is pure UI, so a passing assertion suite proves nothing about whether it is
// usable. This drives the real Seneca index (367 units x 88 columns) and shoots
// the states that matter. Read-only: it clicks and types, it never writes.
import { chromium } from '@playwright/test'
import { BASE_URL, adminCredentials } from './pw-config.mjs'

const { email, password } = adminCredentials()
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 950 })

await page.goto(`${BASE_URL}/login`)
await page.locator('input[type="email"]').fill(email)
await page.locator('input[type="password"]').fill(password)
await page.getByRole('button', { name: 'Sign In' }).click()
await page.waitForTimeout(3500)

// Seneca — the real register, not a fixture. A1's whole claim is that it makes a
// 367-row matrix workable, and that is not testable on three rows. Navigate by id
// and tab param rather than clicking through: this is a render check, not a
// navigation test, and a brittle click path would fail for the wrong reason.
const SENECA = 'a0a6791f-f24b-4397-89cd-61094aa78714'
await page.goto(`${BASE_URL}/projects/${SENECA}?tab=cx_index`)
await page.waitForTimeout(4000)

await page.screenshot({ path: 'out/a1-1-index.png' })
console.log('1/4 index')

// find-by-tag: highlight + jump
const find = page.getByPlaceholder('Find a tag…')
if (await find.count()) {
  await find.fill('AHU-3')
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'out/a1-2-search.png' })
  console.log('2/4 search — match count + highlight')
  await find.press('Enter')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'out/a1-3-jumped.png' })
  console.log('3/4 jumped to match')
  await find.fill('')
}

// the per-unit panel
const firstTag = page.locator('[data-unit-row] button').first()
if (await firstTag.count()) {
  await firstTag.click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'out/a1-4-panel.png' })
  console.log('4/4 per-unit panel')
}

await browser.close()
console.log('\nshots in out/ — look at them')
