// Render-and-look harness for the portal (Part B). Not a battery suite — a
// screenshot rig, run by hand during design rounds. Uses the STAFF PREVIEW
// path (portal_can_view admits is_project_member), so it touches portal_members
// not at all. The empty-state shots use a throwaway ZZ-prefixed project that is
// deleted at the end.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.SHOT_BASE ?? 'http://localhost:5173'
const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const OUT = process.env.SHOT_DIR ?? '.shots'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })

// Empty-project fixture (creator trigger grants membership → preview works).
const emptyName = `ZZ-PORTAL-SHOT ${Date.now().toString(36)}`
const { data: empty, error: e1 } = await sb.from('projects').insert({ name: emptyName }).select('id').single()
if (e1) { console.error('fixture failed:', e1.message); process.exit(1) }

const browser = await chromium.launch()
try {
  const shot = async (name, path, { width = 1440, height = 900, full = true, reduced = false, wait = 1800 } = {}) => {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="email"]', process.env.admin_email)
    await page.fill('input[type="password"]', process.env.admin_password)
    await page.click('button[type="submit"]')
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 })
    await page.goto(`${BASE}${path}`)
    await page.waitForTimeout(wait)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
    console.log('  ·', name)
    await ctx.close()
  }

  await shot('01-desktop-full', `/portal/${ZZ}`)
  await shot('02-hero', `/portal/${ZZ}`, { full: false, height: 820 })
  await shot('03-reduced-motion', `/portal/${ZZ}`, { full: false, height: 820, reduced: true, wait: 900 })
  await shot('04-mobile-393', `/portal/${ZZ}`, { width: 393, height: 852 })
  await shot('05-tablet-834', `/portal/${ZZ}`, { width: 834, height: 1112 })
  await shot('06-empty-states', `/portal/${empty.id}`)
  await shot('07-mobile-empty', `/portal/${empty.id}`, { width: 393, height: 852 })
  await shot('08-accept', '/portal/accept?token=shot-preview-only', { full: false, height: 900 })
  await shot('09-mobile-accept', '/portal/accept?token=shot-preview-only', { width: 393, height: 852, full: false })
} finally {
  await browser.close()
  await sb.from('projects').delete().eq('id', empty.id)
  const { data: left } = await sb.from('projects').select('id').like('name', 'ZZ-PORTAL-SHOT%')
  console.log(`fixture cleaned — ZZ-PORTAL-SHOT projects remaining: ${(left ?? []).length}`)
}
