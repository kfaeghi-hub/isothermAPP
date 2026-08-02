import { chromium } from 'playwright'
import { loginAs, credentials, BASE_URL } from './pw-config.mjs'
const b = await chromium.launch()
for (const w of [1000, 1024, 1100, 1200]) {
  const p = await b.newPage({ viewport: { width: w, height: 1200 } })
  await loginAs(p, credentials())
  await p.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  const r = await p.evaluate(() => {
    const bad = []
    document.querySelectorAll('p,span,td,div').forEach(el => {
      if (el.children.length) return
      const t = (el.textContent ?? '').trim()
      if (!t) return
      const cs = getComputedStyle(el)
      // a clipped element that is NOT deliberately ellipsised is the defect
      if (el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
        bad.push({ t: t.slice(0, 44), sw: el.scrollWidth, cw: el.clientWidth, ov: cs.overflow })
      }
    })
    const tables = []
    document.querySelectorAll('table').forEach(el => {
      const pr = el.parentElement.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.width > pr.width + 1) tables.push({ w: Math.round(r.width), pw: Math.round(pr.width),
        ovx: getComputedStyle(el.parentElement).overflowX })
    })
    return { bad: bad.slice(0, 6), tables }
  })
  console.log(`\n${w}px  clipped:${r.bad.length}  tables-overflowing:${r.tables.length}`)
  r.bad.forEach(x => console.log(`   "${x.t}" ${x.sw}>${x.cw} overflow:${x.ov}`))
  r.tables.forEach(t => console.log(`   TABLE ${t.w} in ${t.pw} (overflow-x:${t.ovx})`))
  if (w === 1100) await p.screenshot({ path: 'out/dash-emp-1100.png', fullPage: true })
  await p.close()
}
await b.close()
