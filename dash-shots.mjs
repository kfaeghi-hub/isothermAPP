// DASHBOARD RENDER-AND-LOOK — the card headers, at the widths where they break.
//
// The overlap only appears where the note WRAPS. At 1920px most notes fit on one
// line and every card looks fine; the defect lives in the between-breakpoints
// zone (~1000-1400px) and on phones. A screenshot at one comfortable width is a
// check that cannot fail, which is why this takes a list.
//
// Runs against the LOCAL dev build by default so the working tree is what is
// judged; pass --prod to look at what is deployed.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { credentials, BASE_URL } from './pw-config.mjs'

const OUT = 'out/dash'
mkdirSync(OUT, { recursive: true })
const base = process.argv.includes('--prod') ? BASE_URL : (process.env.DASH_BASE ?? 'http://localhost:5173')
const WIDTHS = [
  { w: 390,  h: 1400, name: 'mobile-390' },
  { w: 1280, h: 1600, name: 'laptop-1280' },
  { w: 1440, h: 1600, name: 'between-1440' },
  { w: 1920, h: 1600, name: 'desktop-1920' },
]
const b = await chromium.launch()
for (const { w, h, name } of WIDTHS) {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  // login inline rather than via pw-config's login(), which is hard-wired to the
  // deployed BASE_URL — the point here is to judge the WORKING TREE.
  const { email, password } = credentials()
  await p.goto(`${base}/login`)
  await p.locator('input[type="email"]').fill(email)
  await p.locator('input[type="password"]').fill(password)
  await p.getByRole('button', { name: 'Sign In' }).click()
  await p.waitForTimeout(3500)
  await p.goto(`${base}/`)
  await p.waitForTimeout(4500)
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  // crop each numbered card header so the seam is legible at 1:1
  for (const id of ['responsible-table', 'my-items', 'my-deliverables', 'outstanding-deliverables', 'followup-radar']) {
    const card = p.locator(`[data-testid="${id}"]`)
    if (await card.count() === 0) continue
    // Crop the HEADER BAND, not the card. An element screenshot of a card with
    // 70 rows is 2000px tall and the header is a sliver at the top — a picture
    // that technically contains the evidence and shows none of it.
    try {
      const box = await card.first().boundingBox()
      if (!box) continue
      await p.screenshot({
        path: `${OUT}/${name}--${id}.png`,
        clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 118) },
      })
    } catch {}
  }
  console.log(`${name}: ${OUT}/${name}.png`)
  await p.close()
}
await b.close()
