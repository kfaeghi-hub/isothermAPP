// Team / communication matrix verification on ZZ-TEST.
// Covers: matrix-as-todo rendering, suggested companies, person assignment with
// directory-resolved email, company-only seats, hide-unassigned, inline role add,
// and the Overview summary block. Cleanup happens via SQL afterwards.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-team.mjs

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject } from './pw-config.mjs'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// Pre-flight: this suite assigns the CxA and Architect seats and adds a ZZT
// role; the header's "cleanup via SQL afterwards" was manual and never ran, so
// every re-run found the seats taken and died at the first Assign wait. Make
// it re-entrant by clearing its own fixture residue up front.
{
  const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
  const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const { data: roles } = await adm.from('company_role_types').select('id,name')
    .in('name', ['CxA', 'Architect', 'ZZ-Test Role'])
  for (const r of roles ?? []) {
    await adm.from('project_team_assignments').delete().eq('project_id', ZZ).eq('role_type_id', r.id)
    if (r.name === 'ZZ-Test Role') await adm.from('company_role_types').delete().eq('id', r.id)
  }
  console.log('pre-flight: ZZ team fixture reset (CxA/Architect seats freed, ZZT role removed)')
}

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.setViewportSize({ width: 1500, height: 1000 })

await login(page)
await openTestProject(page)

await page.getByRole('button', { name: 'Team', exact: true }).click()
await page.waitForTimeout(1800)

// ── 1. The whole matrix reads as a to-do ─────────────────────────────────────
const unassigned = page.getByText('Assign company →')
const unassignedBefore = await unassigned.count()
check(unassignedBefore >= 10, `matrix visible from day one (${unassignedBefore} unassigned role cards)`)
check(await page.getByText('feeds the Cx Plan communication matrix').count() === 1, 'subheader present')
await page.screenshot({ path: 'ss-team-1-matrix.png' })

// ── 2. Assign CxA: suggested company + a person ─────────────────────────────
await page.locator('button', { hasText: 'Commissioning' }).first()
  .or(page.locator('button', { hasText: /^CxA/ }).first())
// Click the CxA unassigned card (role name text 'CxA')
await page.locator('button:has-text("Assign company →")', { hasText: 'CxA' }).first().click()
await page.waitForTimeout(700)
const modal = page.locator('.fixed')

const suggestedHdr = modal.getByText(/Suggested — hold the/)
check(await suggestedHdr.count() === 1, 'suggested section shown for companies holding the role')
await page.screenshot({ path: 'ss-team-2-suggest.png' })

// Pick the first suggested company (rows after the Suggested header)
await modal.locator('button').filter({ hasText: /.+/ }).nth(0)
// The first CompanyRow after the header:
const firstSuggested = modal.locator('p:has-text("Suggested") + button, p:has-text("Suggested") ~ button').first()
await firstSuggested.click()
await page.waitForTimeout(700)

// Step 2: pick the first contact if present, else company-only
const contactBoxes = modal.locator('label input[type="checkbox"]')
const pickable = await modal.locator('label', { hasText: /@|\w/ }).locator('input[type="checkbox"]').count()
let usedContact = false
if (await contactBoxes.count() > 1) {   // >1 because "Company only" is also a checkbox
  await contactBoxes.first().check()
  usedContact = true
} else {
  await modal.getByText('Company only — no contact').click()
}
await modal.getByRole('button', { name: 'Assign', exact: true }).click()
await page.waitForTimeout(2000)
check(await page.locator('.fixed').count() === 0, 'assign modal closed (saved)')

if (usedContact) {
  check(await page.locator('a[href^="mailto:"]').count() >= 1, 'person row shows directory-resolved email')
}
await page.screenshot({ path: 'ss-team-3-assigned.png' })

// ── 3. Company-only seat on another role ─────────────────────────────────────
await page.locator('button:has-text("Assign company →")', { hasText: 'Architect' }).first().click()
await page.waitForTimeout(700)
const m2 = page.locator('.fixed')
// No suggested for Architect (nobody holds it) — pick any company from the list
await m2.locator('button').filter({ hasText: /\(|Inc|Ltd|Corp|TDSB|Mechanical|Engineering|Controls|Honeywell/ }).first().click()
  .catch(async () => { await m2.locator('input[placeholder="Search companies…"] ~ * button').first().click() })
await page.waitForTimeout(700)
await m2.getByText('Company only — no contact').click()
await m2.getByRole('button', { name: 'Assign', exact: true }).click()
await page.waitForTimeout(2000)
check(await page.getByText('Company only — no contact assigned').count() === 1, 'company-only seat renders')

// ── 4. Hide unassigned ────────────────────────────────────────────────────────
await page.getByText('Hide unassigned').click()
await page.waitForTimeout(400)
check(await page.getByText('Assign company →').count() === 0, 'hide-unassigned removes dashed cards')
await page.getByText('Hide unassigned').click()

// ── 5. Inline role add (firm vocabulary; cleaned up after) ──────────────────
await page.getByRole('button', { name: '+ Add role' }).click()
await page.getByPlaceholder('Role name (e.g. Sprinkler Contractor)…').fill('ZZ-Test Role')
await page.getByPlaceholder('Abbr.').fill('ZZT')
await page.locator('button:has-text("✓")').first().click()
await page.waitForTimeout(1200)
check(await page.locator('button', { hasText: 'ZZ-Test Role' }).count() >= 1, 'inline-added role appears as a card immediately')

// ── 6. Overview summary block ─────────────────────────────────────────────────
await page.getByRole('button', { name: 'Overview', exact: true }).click()
await page.waitForTimeout(1500)
check(await page.getByText('Project Team').count() >= 1, 'overview: Team summary block present')
check(await page.getByText('View Team →').count() === 1, 'overview: View Team link')
check(await page.locator('span:has-text("CxA")').count() >= 1, 'overview: CxA chip in summary')
await page.screenshot({ path: 'ss-team-4-overview.png' })

console.log('\n' + (fails.length === 0 ? 'PASS — team matrix verified on ZZ-TEST.' : `FAIL — ${fails.length}: ${fails.join('; ')}`))
await browser.close()
process.exit(fails.length === 0 ? 0 : 1)
