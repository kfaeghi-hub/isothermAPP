import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 800 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// Open project
await page.locator('text=Seneca Health').click()
await page.waitForTimeout(1500)

// Issues Log tab
await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
await page.waitForTimeout(1200)

// Open New Finding
await page.getByRole('button', { name: '+ New Finding' }).first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'ss-final-category.png' })

// Also verify Edit Project shows trade pills with correct selection
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Edit Project' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'ss-final-edit-trades.png' })

await browser.close()
