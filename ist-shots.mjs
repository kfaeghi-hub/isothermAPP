// IST field-mode render-and-look. The venue is a fire command room, so the
// widths that matter are phones first; 390 is the reference iPhone width and
// 360 is the common Android floor. Desktop is included only to confirm the
// card layout does not fall apart when someone opens it at a desk.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { credentials } from './pw-config.mjs'
const OUT = 'out/ist'; mkdirSync(OUT, { recursive: true })
const base = process.env.DASH_BASE ?? 'http://localhost:4173'
const WIDTHS = [{ w: 360, h: 1600, n: 'android-360' }, { w: 390, h: 1600, n: 'iphone-390' }, { w: 1280, h: 1400, n: 'desktop-1280' }]
const b = await chromium.launch()
for (const { w, h, n } of WIDTHS) {
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })
  const { email, password } = credentials()
  await p.goto(`${base}/login`)
  await p.locator('input[type="email"]').fill(email)
  await p.locator('input[type="password"]').fill(password)
  await p.getByRole('button', { name: 'Sign In' }).click()
  await p.waitForTimeout(3500)
  await p.goto(`${base}/projects`); await p.waitForTimeout(2500)
  await p.getByText('ZZ-TEST — Do Not Use', { exact: false }).filter({ visible: true }).first().click()
  await p.waitForTimeout(2500)
  await p.getByRole('button', { name: 'IST', exact: true }).click()
  await p.waitForTimeout(3000)
  await p.screenshot({ path: `${OUT}/${n}--tab.png`, fullPage: true })
  const open = p.locator('[data-testid="ist-open-field"]').first()
  if (await open.count()) {
    await open.click(); await p.waitForTimeout(3000)
    await p.screenshot({ path: `${OUT}/${n}--field.png`, fullPage: true })
    const card = p.locator('[data-testid="ist-field-card"]').first()
    if (await card.count()) {
      const box = await card.boundingBox()
      if (box) await p.screenshot({ path: `${OUT}/${n}--card.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 420) } })
    }
  }
  // horizontal overflow is the phone failure mode; assert it rather than eyeball it
  const scrollW = await p.evaluate(() => document.documentElement.scrollWidth)
  console.log(`${n}: scrollWidth ${scrollW} vs viewport ${w} ${scrollW > w + 1 ? '← OVERFLOW' : 'ok'}`)
  await p.close()
}
await b.close()
