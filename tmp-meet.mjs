// Wave 2 verification: Meetings WITH DATA at 375 (audit gap — the tab was only
// seen empty). Creates a draft meeting on ZZ-TEST, reviews list + detail, then
// deletes it (own unissued draft — allowed by the own-drafts rule).
import { chromium } from 'playwright'
import { credentials } from './pw-config.mjs'
const BASE = 'http://localhost:4173'
const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}/login`)
const { email, password } = credentials()
await page.locator('input[type="email"]').fill(email)
await page.locator('input[type="password"]').fill(password)
await page.getByRole('button', { name: 'Sign In' }).click()
await page.waitForTimeout(3500)
await page.goto(`${BASE}/projects/${ZZ}?tab=meetings`); await page.waitForTimeout(2500)
await page.getByRole('button', { name: /new meeting/i }).first().click()
await page.waitForTimeout(900)
await page.screenshot({ path: 'out/w2/375-meeting-modal.png' })
// create with defaults (type preselected, number auto)
await page.getByRole('button', { name: /^Create/ }).first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'out/w2/375-meeting-detail.png' })
// back to list (RC2 back arrow or list view)
await page.goto(`${BASE}/projects/${ZZ}?tab=meetings`); await page.waitForTimeout(2000)
await page.screenshot({ path: 'out/w2/375-meeting-list.png' })
// delete the draft (own draft)
const del = page.getByRole('button', { name: /delete/i }).first()
const row = page.getByText(/Site|Recurring|Kickoff/i).first()
if (await row.count()) { await row.click(); await page.waitForTimeout(1500) }
const delBtn = page.getByRole('button', { name: /^Delete/ }).first()
if (await delBtn.count()) {
  await delBtn.click(); await page.waitForTimeout(800)
  const confirm = page.getByRole('button', { name: /delete/i }).last()
  if (await confirm.count()) await confirm.click()
  await page.waitForTimeout(1500)
}
await page.goto(`${BASE}/projects/${ZZ}?tab=meetings`); await page.waitForTimeout(2000)
const残 = await page.getByText(/#1/).count()
console.log('cleanup check — meeting rows remaining with #1:', 残)
await page.screenshot({ path: 'out/w2/375-meeting-cleaned.png' })
await browser.close(); console.log('done')
