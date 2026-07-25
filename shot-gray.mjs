// Render-and-look rig for the gray-400 re-tint (UI-debt item 0). Not a battery
// suite. Run with SHOT_TAG=before, change the token, run with SHOT_TAG=after,
// then compare the pairs by eye. The surfaces are the seven heaviest consumers
// by measured usage count, plus the two the brief called out by kind
// (empty-state copy, form hints).
import { chromium } from 'playwright'

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173'
const TAG = process.env.SHOT_TAG ?? 'before'
const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'

// name → [path, waitForText]
const SURFACES = [
  ['issues',    `/projects/${ZZ}?tab=issues`,      'Issues'],
  ['templates', '/templates',                      'Templates'],
  ['dashboard', '/',                               null],
  ['overview',  `/projects/${ZZ}?tab=overview`,    null],
  ['checklists',`/projects/${ZZ}?tab=checklists`,  null],
  ['projects',  '/projects',                       null],
  ['directory', '/directory',                      null],
]

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`)
await page.fill('input[type="email"]', process.env.admin_email)
await page.fill('input[type="password"]', process.env.admin_password)
await page.click('button[type="submit"]')
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })

for (const [name, path, wait] of SURFACES) {
  await page.goto(`${BASE}${path}`)
  if (wait) await page.getByText(wait).first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `.shots/gray-${TAG}-${name}.png` })
  console.log('  ·', `${TAG}-${name}`)
}
await b.close()
