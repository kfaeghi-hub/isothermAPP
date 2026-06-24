import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 800 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// Click the project row
await page.locator('text=Seneca Health').click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'ss-issues-1-project.png' })

// Click Issues Log tab (exact match to avoid hitting nav item)
await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: 'ss-issues-2-tab.png' })

// Click the toolbar + New Finding button (first occurrence)
await page.getByRole('button', { name: '+ New Finding' }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'ss-issues-3-modal.png' })

// Fill in the create form
await page.locator('input[list="category-list"]').fill('BAS')
await page.locator('select').first().selectOption({ index: 1 })  // first contact
await page.locator('textarea').fill('BAS controller AHU-1 is not responding to setpoint changes. Controller appears to be in manual mode. Requires investigation by BAS vendor.')
await page.screenshot({ path: 'ss-issues-4-filled.png' })

// Submit
await page.getByRole('button', { name: 'Create Finding' }).click()
await page.waitForTimeout(2000)
await page.screenshot({ path: 'ss-issues-5-created.png' })

await browser.close()
