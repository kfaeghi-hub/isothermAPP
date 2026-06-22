import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 900 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// Open any project
await page.locator('text=Seneca Health').first().click()
await page.waitForTimeout(1000)

// Click Equipment tab
await page.getByRole('button', { name: 'Equipment', exact: true }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'ss-equip-1-empty.png' })
console.log('✓ Equipment tab opened')

// Add first equipment item using tag autocomplete
await page.getByRole('button', { name: '+ Add' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'ss-equip-2-modal.png' })

// Type a tag to trigger autocomplete
const tagInput = page.locator('input[placeholder*="AHU, HP, GEN"]')
await tagInput.fill('AHU')
await page.waitForTimeout(300)
await page.screenshot({ path: 'ss-equip-3-autocomplete.png' })

// Check glossary suggestion appeared
const suggestions = page.locator('button').filter({ hasText: 'Air Handling Unit' })
if (await suggestions.first().isVisible()) {
  console.log('✓ Glossary autocomplete suggestions visible')
  await suggestions.first().click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'ss-equip-4-suggestion-applied.png' })
  console.log('✓ Glossary suggestion applied')
} else {
  console.log('✗ Autocomplete suggestions did NOT appear')
}

// Verify descriptor and category got populated from glossary
const descriptorVal = await page.locator('input[placeholder="Air Handling Unit"]').inputValue()
console.log(`  Descriptor field: "${descriptorVal}"`)

// Click Add Equipment to save
await page.getByRole('button', { name: 'Add Equipment' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'ss-equip-5-added.png' })
console.log('✓ Equipment added')

// Verify the item appears in the list
const tagInList = page.locator('span.font-mono').filter({ hasText: 'AHU' }).first()
if (await tagInList.isVisible()) {
  console.log('✓ AHU visible in equipment list')
} else {
  console.log('✗ AHU NOT visible in list')
}

// Click the item to open detail panel
await tagInList.click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'ss-equip-6-detail.png' })
console.log('✓ Equipment detail panel opened')

// Check that field sections are visible (AHU has spec/shop_drawing/installed sections)
const specSection = page.locator('button').filter({ hasText: /Spec \(Design\)/i })
if (await specSection.isVisible()) {
  console.log('✓ Spec (Design) section visible')
} else {
  console.log('✗ Spec section NOT visible')
}

// Click Edit to fill a field
await page.getByRole('button', { name: 'Edit', exact: true }).click()
await page.waitForTimeout(300)

// Fill Supply CFM in spec section
const cfmInput = page.locator('input[placeholder="—"]').first()
await cfmInput.fill('5000')
await page.screenshot({ path: 'ss-equip-7-editing.png' })

// Save
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: 'ss-equip-8-saved.png' })
console.log('✓ Edit saved')

// Test structure editor
const structureLink = page.locator('text=Edit field structure for ahu on this project')
if (await structureLink.isVisible()) {
  await structureLink.click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'ss-equip-9-structure.png' })
  console.log('✓ Structure editor opened')
} else {
  console.log('✗ Structure editor link NOT visible')
}

await browser.close()
console.log('\nDone — check ss-equip-*.png files')
