import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 800 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// ── 1. Sidebar (should only show Projects + Directory now)
await page.screenshot({ path: 'ss-t1-sidebar.png' })

// ── 2. New Project modal with trade pills
await page.getByRole('button', { name: '+ New Project' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'ss-t2-create-trades.png' })

// Close modal
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ── 3. Open the existing project
await page.locator('text=Seneca Health').click()
await page.waitForTimeout(1500)

// ── 4. Edit Project modal with trade pills
await page.getByRole('button', { name: 'Edit Project' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'ss-t3-edit-trades.png' })

// Select a few trades
await page.getByRole('button', { name: 'Mechanical' }).click()
await page.getByRole('button', { name: 'Controls/BAS' }).click()
await page.getByRole('button', { name: 'TAB', exact: true }).click()
await page.screenshot({ path: 'ss-t4-trades-selected.png' })

// Save
await page.getByRole('button', { name: 'Save Changes' }).click()
await page.waitForTimeout(1500)

// ── 5. Issues Log tab — category select
await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
await page.waitForTimeout(800)

// Open New Finding
await page.getByRole('button', { name: '+ New Finding' }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: 'ss-t5-issues-category.png' })

await browser.close()
