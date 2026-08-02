import { chromium } from 'playwright'
import { loginAs, adminCredentials, BASE_URL } from './pw-config.mjs'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } })
await loginAs(p, adminCredentials())
await p.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
const el = await p.locator('text=FOLLOW-UP RADAR').first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
await el.screenshot({ path: 'out/radar-fixed.png' })
// count tspans per tick: >1 means recharts wrapped the label into stacked lines
const wrapped = await p.evaluate(() => {
  const ticks = [...document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick text')]
  return ticks.map(t => ({ lines: t.querySelectorAll('tspan').length, txt: t.textContent.slice(0, 30) }))
})
console.log(JSON.stringify(wrapped.slice(0, 6)))
await b.close()
