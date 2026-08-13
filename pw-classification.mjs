// Proof for the classification framework (approved plan step 6):
// create a LEED Enhanced project through the real UI and verify that
// required-dimension validation fires, badges render, and deliverables compose.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-classification.mjs
//
// Creates "ZZ-TEST-LEED â€” Do Not Use" (clearly-marked test entity, ZZ-TEST family).

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials } from './pw-config.mjs'
// Project creation is owner-only under access control (C1) - this suite drives
// the New Project modal, so it logs in as dev.admin.

// Unique per run so re-runs never collide with earlier proof projects; still in
// the ZZ-TEST family per the test-isolation rule. Delete after inspection.
const PROJECT_NAME = `ZZ-TEST-LEED ${Date.now().toString(36)} â€” Do Not Use`
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
await page.setViewportSize({ width: 1500, height: 1000 })

await loginAs(page, adminCredentials())
check(await page.locator('input[type="password"]').count() === 0, 'logged in')

// Sign-in lands on the Dashboard home (since the router/landing work); the
// New Project button lives on /projects. Navigate there first.
await page.getByRole('link', { name: 'Projects' }).click()
await page.waitForTimeout(1200)

// â”€â”€ Open New Project â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
await page.getByRole('button', { name: '+ New Project' }).click()
await page.waitForTimeout(800)
const modal = page.locator('.fixed')

// â”€â”€ 1. Required-dimension validation fires from the runtime flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
await modal.locator('input').first().fill(PROJECT_NAME)
await modal.getByRole('button', { name: 'Create Project' }).click()
await page.waitForTimeout(600)
check(await modal.getByText('is required.').count() >= 3,
  'validation: all three required dimensions flagged (Lifecycle, Facility, Phases)')
check(await page.getByText(PROJECT_NAME).count() <= 1,
  'validation: project NOT created while required dimensions missing')
await page.screenshot({ path: 'ss-class-1-validation.png' })

// â”€â”€ 2. Fill the classifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Selects inside the modal: [0]=Client, then the single-mode dimensions in order.
const selects = modal.locator('select')
await selects.nth(1).selectOption({ label: 'New Construction' })   // Project Lifecycle
await selects.nth(2).selectOption({ label: 'School' })             // Facility Type
await page.waitForTimeout(200)

// Multi dims are pills
await modal.getByRole('button', { name: 'Construction', exact: true }).click()
await modal.getByRole('button', { name: 'Occupancy and Operations', exact: true }).click()
await modal.getByRole('button', { name: 'LEED Enhanced', exact: true }).click()

// Systems to be Commissioned (renamed selector, prominent below dimensions)
check(await modal.getByText('Systems to be Commissioned').count() > 0,
  'rename: "Systems to be Commissioned" label in New Project modal')
check(await modal.getByText('finding categories will be limited to INFO').count() > 0,
  'warning shown while no systems selected')
await modal.getByRole('button', { name: 'Mechanical', exact: true }).click()
await modal.getByRole('button', { name: 'Controls/BAS', exact: true }).click()
await page.waitForTimeout(200)
check(await modal.getByText('finding categories will be limited to INFO').count() === 0,
  'warning clears once systems are selected')

await page.screenshot({ path: 'ss-class-2-filled.png' })

// â”€â”€ 3. Create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
await modal.getByRole('button', { name: 'Create Project' }).click()
await page.waitForTimeout(3500)
check(await page.locator('.fixed').getByRole('button', { name: 'Create Project' }).count() === 0,
  'modal closed after create')

// â”€â”€ 4. List row: badges + no incomplete flag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const row = page.locator('tr', { hasText: PROJECT_NAME })
check(await row.count() === 1, 'project appears in list')
check(await row.getByText('New Construction').count() > 0, 'badge: New Construction')
check(await row.getByText('LEED Enhanced').count() > 0,    'badge: LEED Enhanced')
check(await row.getByText(/Incomplete/i).count() === 0,    'no "Incomplete" badge (all required dims set)')
await page.screenshot({ path: 'ss-class-3-list.png' })

// â”€â”€ 5. Filters actually filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const filterSelects = page.locator('select')
// First page-level select is the Lifecycle filter ("All â€” Project Lifecycle")
await filterSelects.first().selectOption({ label: 'New Construction' })
await page.waitForTimeout(400)
check(await page.locator('tr', { hasText: PROJECT_NAME }).count() === 1,
  'lifecycle filter keeps the NC project visible')

await browser.close()

// Cleanup: this suite creates one uniquely-named ZZ-TEST-LEED project per run
// and used to leak it forever ("delete after inspection" was manual). Delete it
// (cascades classifications + composed deliverables) as admin so re-runs stay
// clean. Also sweep any prior timestamped leaks, but NEVER the canonical
// "ZZ-TEST-LEED — Do Not Use" fixture (no timestamp) used by pw-deliverables.
const CANONICAL_LEED = 'ZZ-TEST-LEED — Do Not Use'  // pw-deliverables fixture — never delete
{
  const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const { data } = await adm.from('projects').select('id,name').ilike('name', 'ZZ-TEST-LEED%')
  const leaked = (data ?? []).filter(p => p.name !== CANONICAL_LEED)
  for (const p of leaked) await adm.from('projects').delete().eq('id', p.id)
  console.log(`cleanup: removed ${leaked.length} run-created LEED project(s); canonical fixture kept`)
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? 'UI PASS â€” verify composition counts via SQL next.'
  : `FAIL â€” ${fails.length}: ${fails.join('; ')}`)
console.log('='.repeat(60))

process.exit(fails.length === 0 ? 0 : 1)
