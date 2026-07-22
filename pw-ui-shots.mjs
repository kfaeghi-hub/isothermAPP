// UI audit capture: screenshots + rendered HTML of the key surfaces (read-only;
// dashboard is global, project pages use the ZZ-TEST family only).
import { chromium } from 'playwright'
import { loginAs, adminCredentials, BASE_URL, TEST_PROJECT } from '../pw-config.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('out/ui-audit', { recursive: true })
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.setViewportSize({ width: 1500, height: 950 })

// Login page first (pre-auth)
await page.goto(BASE_URL)
await page.waitForTimeout(2000)
await page.screenshot({ path: 'out/ui-audit/01-login.png' })
writeFileSync('out/ui-audit/01-login.html', await page.content())

await loginAs(page, adminCredentials())
await page.waitForTimeout(2500)
await page.screenshot({ path: 'out/ui-audit/02-dashboard.png', fullPage: false })
writeFileSync('out/ui-audit/02-dashboard.html', await page.content())
await page.screenshot({ path: 'out/ui-audit/02b-dashboard-full.png', fullPage: true })

// ZZ-TEST project surfaces
await page.getByText(TEST_PROJECT, { exact: false }).first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'out/ui-audit/03-project-overview.png' })
writeFileSync('out/ui-audit/03-project-overview.html', await page.content())

for (const [tab, file] of [['Issues Log', '04-issues'], ['Checklists', '05-checklists'], ['Deliverables', '06-deliverables'], ['Team', '07-team'], ['Meetings', '08-meetings']]) {
  await page.getByRole('button', { name: tab, exact: true }).click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `out/ui-audit/${file}.png` })
  writeFileSync(`out/ui-audit/${file}.html`, await page.content())
}

// Directory + admin screens (global, read-only)
for (const [path, file] of [['/directory', '09-directory'], ['/classifications', '10-admin-classifications']]) {
  await page.goto(BASE_URL + path)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `out/ui-audit/${file}.png` })
}

// Mobile viewport spot-check (field engineers)
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(BASE_URL + '/')
await page.waitForTimeout(2000)
await page.screenshot({ path: 'out/ui-audit/11-mobile-dashboard.png' })

await browser.close()
console.log('captured')
