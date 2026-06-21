import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 900 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// Open Seneca Health project
await page.locator('text=Seneca Health').first().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'ss-cx-1-overview.png' })

// Click Cx Index tab
await page.getByRole('button', { name: 'Cx Index', exact: true }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'ss-cx-2-empty-or-init.png' })

// If we see the initialize button, click it
const initBtn = page.getByRole('button', { name: /Initialize Cx Index/i })
if (await initBtn.isVisible()) {
  console.log('Cx Index not yet initialized — clicking Initialize button')
  await initBtn.click()
  // Wait for all 12 groups to be inserted (serial loop over 12 groups)
  await page.waitForTimeout(8000)
  await page.screenshot({ path: 'ss-cx-3-after-init.png' })
} else {
  console.log('Cx Index already initialized')
}

// Should now see the matrix with stage group headers
await page.screenshot({ path: 'ss-cx-4-matrix.png' })
console.log('Matrix page title:', await page.title())

// Verify stage group headers are visible
const firstGroupHeader = page.locator('th').filter({ hasText: /Doc Review/i }).first()
if (await firstGroupHeader.isVisible()) {
  console.log('✓ "Doc Review Stage" header visible')
} else {
  console.log('✗ Doc Review header NOT visible')
}

// Add a test equipment item
await page.getByRole('button', { name: '+ Add Equipment' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'ss-cx-5-add-equip-modal.png' })

await page.getByPlaceholder(/e\.g\. PUMPS/i).fill('PUMPS')
await page.getByPlaceholder(/GEO-P-01/i).fill('GEO-P-01')
await page.getByPlaceholder(/GEOTHERMAL/i).fill('Geothermal Pump')

await page.getByRole('button', { name: 'Add Equipment', exact: true }).last().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'ss-cx-6-with-equipment.png' })
console.log('✓ Equipment added')

// Click a cell to test status cycling
const firstCell = page.locator('td[title*="GEO-P-01"]').first()
if (await firstCell.isVisible()) {
  await firstCell.click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'ss-cx-7-cell-done.png' })
  console.log('✓ Cell click (blank → done)')

  await firstCell.click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'ss-cx-8-cell-inprogress.png' })
  console.log('✓ Cell click (done → in_progress)')
} else {
  console.log('Could not locate cell for GEO-P-01')
}

// Test Edit Structure panel
await page.getByRole('button', { name: 'Edit Structure' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'ss-cx-9-edit-structure.png' })
console.log('✓ Edit Structure panel opened')

// Verify group names visible in panel
const docReviewInPanel = page.locator('text=Doc Review Stage').last()
if (await docReviewInPanel.isVisible()) {
  console.log('✓ Doc Review Stage visible in structure panel')
} else {
  console.log('✗ Doc Review Stage NOT visible in structure panel')
}

await browser.close()
console.log('\nDone — check ss-cx-*.png files')
