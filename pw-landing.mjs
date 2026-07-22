// Landing page + routing gate (LANDING-PAGE-PROPOSAL.md §8, approved 2026-07-22).
//
//   1  unauthenticated /            → landing renders (H1 + CTA, NO password input)
//   2  hero CTA                     → /login shows the login form
//   3  sign in from /login, then /  → Dashboard (no landing interstitial)
//   4  client role at /             → /projects redirect (SKIPPED unless client creds in .env)
//   5  reduced-motion               → landing content fully visible
//   6  /reset-password              → still renders
//   7  unauthenticated deep link    → login form IN PLACE, URL preserved
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-landing.mjs

import { chromium } from 'playwright'
import { BASE_URL, credentials } from './pw-config.mjs'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const browser = await chromium.launch()

// ── 1 · unauthenticated / renders the landing page ─────────────────────────────
{
  const page = await browser.newPage()
  await page.goto(BASE_URL)
  await page.waitForTimeout(2500)
  const h1 = await page.getByRole('heading', { level: 1 }).textContent().catch(() => '')
  check(/Commissioning management/i.test(h1 ?? ''), `landing H1 renders ("${(h1 ?? '').slice(0, 40)}…")`)
  check(await page.locator('input[type="password"]').count() === 0, 'no password input on the landing page')
  check(await page.getByRole('link', { name: 'Sign in' }).count() >= 1, 'Sign in CTA present')

  // ── 2 · CTA → /login shows the form ──────────────────────────────────────────
  await page.getByRole('link', { name: 'Sign in' }).first().click()
  await page.waitForTimeout(1500)
  check(new URL(page.url()).pathname === '/login', `CTA lands on /login (got ${new URL(page.url()).pathname})`)
  check(await page.locator('input[type="password"]').count() === 1, '/login shows the login form')

  // ── 3 · sign in, then / goes straight to the Dashboard ───────────────────────
  const { email, password } = credentials()
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(3500)
  await page.goto(BASE_URL)
  await page.waitForTimeout(2500)
  const dash = await page.getByText('Attention Queue', { exact: false }).count()
  const landingGone = await page.getByRole('heading', { name: /Commissioning management/i }).count()
  check(dash > 0, 'authenticated / renders the Dashboard')
  check(landingGone === 0, 'no landing interstitial for authenticated users')
  await page.close()
}

// ── 4 · client-role redirect (needs client creds; skip honestly if absent) ─────
if (process.env.client_email && process.env.client_password) {
  const page = await browser.newPage()
  await page.goto(`${BASE_URL}/login`)
  await page.locator('input[type="email"]').fill(process.env.client_email)
  await page.locator('input[type="password"]').fill(process.env.client_password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(3500)
  await page.goto(BASE_URL)
  await page.waitForTimeout(2000)
  check(new URL(page.url()).pathname === '/projects', 'client role at / redirects to /projects')
  await page.close()
} else {
  console.log('  SKIP  client-role redirect (no client_email/client_password in .env; logic unchanged in App.tsx)')
}

// ── 5 · reduced motion: content renders visible ────────────────────────────────
{
  const page = await browser.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(BASE_URL)
  await page.waitForTimeout(2000)
  const h1Visible = await page.getByRole('heading', { level: 1 }).isVisible().catch(() => false)
  const capsVisible = await page.getByText('Field checklists').isVisible().catch(() => false)
  check(h1Visible, 'reduced-motion: hero H1 visible')
  check(capsVisible, 'reduced-motion: capability cards visible without scroll animation')
  await page.close()
}

// ── 6 · /reset-password preserved ──────────────────────────────────────────────
{
  const page = await browser.newPage()
  await page.goto(`${BASE_URL}/reset-password`)
  await page.waitForTimeout(1500)
  const body = await page.textContent('body')
  check(/reset|password/i.test(body ?? ''), '/reset-password renders')
  await page.close()
}

// ── 7 · unauthenticated deep link: login in place, URL preserved ───────────────
{
  const page = await browser.newPage()
  await page.goto(`${BASE_URL}/projects`)
  await page.waitForTimeout(2000)
  check(await page.locator('input[type="password"]').count() === 1, 'deep link shows the login form in place')
  check(new URL(page.url()).pathname === '/projects', `deep-link URL preserved (got ${new URL(page.url()).pathname})`)
  await page.close()
}

await browser.close()

console.log('\n' + '='.repeat(60))
if (fails.length) { console.log(`FAIL — ${fails.length} check(s):`); fails.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('PASS — landing page + routing verified.')
