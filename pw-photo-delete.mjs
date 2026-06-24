import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 800 })
await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// Open project → Issues Log → first finding (#1 BAS)
await page.locator('text=Seneca Health').click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
await page.waitForTimeout(800)
await page.locator('text=#1').first().click()
await page.waitForTimeout(800)

// First upload a photo so we have something to delete
// (skip if there's already a photo — just verify the hover UI)
await page.screenshot({ path: 'ss-pd-1-detail.png' })

// Hover over the first photo thumbnail to reveal the × button
const firstPhoto = page.locator('.group').first()
if (await firstPhoto.count() > 0) {
  await firstPhoto.hover()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'ss-pd-2-hover.png' })

  // Click the × delete button
  const deleteBtn = firstPhoto.locator('button[title="Remove photo"]')
  if (await deleteBtn.count() > 0) {
    await deleteBtn.click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'ss-pd-3-confirm.png' })

    // Click Cancel to verify confirm works without deleting
    await page.getByRole('button', { name: 'Cancel' }).last().click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: 'ss-pd-4-cancelled.png' })
  } else {
    console.log('No photos yet — upload one first to test deletion')
  }
}

await browser.close()
