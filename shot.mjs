import { chromium } from 'playwright'
import { loginAs, adminCredentials, BASE_URL } from './pw-config.mjs'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1100, height: 900 } })
await loginAs(p, adminCredentials())
await p.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)
const r = await p.evaluate(() => {
  const t = document.querySelector('[data-testid=attention-queue]')
  const pr = t.parentElement
  const card = pr.closest('div[class*=rounded]') ?? pr.parentElement
  return {
    table: Math.round(t.getBoundingClientRect().width),
    wrapper: Math.round(pr.getBoundingClientRect().width),
    overflowX: getComputedStyle(pr).overflowX,
    scrollable: pr.scrollWidth > pr.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})
console.log(JSON.stringify(r))
await p.screenshot({ path: 'out/dash-1100-fixed.png' })
await b.close()
