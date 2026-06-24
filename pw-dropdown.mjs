import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 800 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

await page.locator('text=Seneca Health').click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: '+ New Finding' }).first().click()
await page.waitForTimeout(600)

// Count the options in the category select
const optionCount = await page.locator('select').first().locator('option').count()
const optionTexts = await page.locator('select').first().locator('option').allTextContents()
console.log(`Category options (${optionCount}):`, optionTexts)

// Select "Mechanical" to prove the options are there
await page.locator('select').first().selectOption('Mechanical')
await page.screenshot({ path: 'ss-dropdown-open.png' })

await browser.close()
