// Directory enhancement verification (approved plan step 4).
// Creates a ZZ-TEST company (locations, trades, roles, company fields) and a contact
// (typed phones w/ extension, multiple emails, office assignment) through the real UI,
// reloads to prove persistence, and checks list rendering + trade filter.
// DB-side checks (dual-write mirrors, junctions) run separately via SQL; the
// ZZ-TEST entities are cleaned up afterwards so the real directory stays clean.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-directory.mjs

import { chromium } from 'playwright'
import { login } from './pw-config.mjs'

const CO = 'ZZ-TEST Directory Co — Do Not Use'
const CT = 'ZZ Directory Tester'
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
await page.setViewportSize({ width: 1500, height: 1000 })

await login(page)
await page.getByRole('button', { name: 'Directory' }).click()
await page.waitForTimeout(1500)

// ── 1. Company with everything ───────────────────────────────────────────────
await page.getByRole('button', { name: '+ Add Company' }).click()
await page.waitForTimeout(600)
const modal = page.locator('.fixed')

await modal.locator('input').first().fill(CO)
await modal.getByPlaceholder('e.g. AMI').fill('ZZDC')
await modal.locator('input[type="tel"]').first().fill('416-555-0100')
await modal.locator('input[type="url"]').fill('https://zz-test.example')
await modal.locator('input[type="email"]').first().fill('info@zz-test.example')

// Role + trade pills (existing vocabulary)
await modal.getByRole('button', { name: 'CxA', exact: true }).click()
await modal.getByRole('button', { name: 'Mechanical', exact: true }).click()

// Two locations: HQ (auto-primary) + Site Office
await modal.getByRole('button', { name: '+ Add location' }).click()
await modal.getByRole('button', { name: '+ Add location' }).click()
const labelInputs = modal.getByPlaceholder('Label ("HQ")')
check(await labelInputs.first().inputValue() === 'HQ', 'first location auto-labeled HQ + primary')
await labelInputs.nth(1).fill('Site Office')
await modal.getByPlaceholder('Address').first().fill('100 Test St, Toronto ON')
await modal.getByPlaceholder('Address').nth(1).fill('200 Jobsite Rd, Toronto ON')

await page.screenshot({ path: 'ss-dir-1-company.png' })
await modal.getByRole('button', { name: 'Add Company' }).click()
await page.waitForTimeout(2000)
check(await page.locator('.fixed').getByRole('button', { name: 'Add Company' }).count() === 0, 'company modal closed (saved)')

// ── 2. Contact with phones/emails/location ───────────────────────────────────
await page.getByText(CO).first().click()   // select company in left panel
await page.waitForTimeout(500)
await page.getByRole('button', { name: '+ Add Contact' }).click()
await page.waitForTimeout(600)
const cm = page.locator('.fixed')

await cm.getByPlaceholder('Full name').fill(CT)
await cm.getByPlaceholder('e.g. Mechanical Engineer, Project Manager').fill('Site Supervisor')
// Company should be preselected; pick the HQ location
await cm.locator('select').nth(1).selectOption({ label: 'HQ' })

// Phones: Cell (primary) + Work with extension
await cm.getByRole('button', { name: '+ Add phone' }).click()
await cm.getByPlaceholder('Number').first().fill('647-555-0101')
await cm.getByRole('button', { name: '+ Add phone' }).click()
await cm.getByPlaceholder('Number').nth(1).fill('416-555-0102')
await cm.getByPlaceholder('Ext.').nth(1).fill('204')
await cm.locator('select').nth(3).selectOption({ label: 'Work' })   // second phone row's type

// Emails: primary + alt
await cm.getByRole('button', { name: '+ Add email' }).click()
await cm.getByPlaceholder('Email').first().fill('zz.tester@zz-test.example')
await cm.getByRole('button', { name: '+ Add email' }).click()
await cm.getByPlaceholder('Email').nth(1).fill('zz.alt@zz-test.example')
await cm.getByPlaceholder('Label (optional)').nth(1).fill('personal')

await page.screenshot({ path: 'ss-dir-2-contact.png' })
await cm.getByRole('button', { name: 'Add Contact' }).click()
await page.waitForTimeout(2000)
check(await page.locator('.fixed').getByRole('button', { name: 'Add Contact' }).count() === 0, 'contact modal closed (saved)')

// ── 3. List rendering: primaries + counts ────────────────────────────────────
const row = page.locator('tr', { hasText: CT })
check(await row.count() === 1, 'contact appears in list')
check(await row.getByText('zz.tester@zz-test.example').count() === 1, 'list shows PRIMARY email')
check(await row.getByText('647-555-0101').count() === 1, 'list shows PRIMARY phone')
check(await row.getByText('Cell').count() === 1, 'phone type label (Cell) shown')
check(await row.getByText('Site Supervisor').count() === 1, 'Title column populated')
await page.screenshot({ path: 'ss-dir-3-list.png' })

// ── 4. Reload — persistence, not local state ─────────────────────────────────
await page.reload()
await page.waitForTimeout(3000)
await page.getByRole('button', { name: 'Directory' }).click()
await page.waitForTimeout(1500)
await page.locator('tr', { hasText: CT }).getByRole('button', { name: 'Edit' }).click({ force: true })
  .catch(async () => {
    await page.locator('tr', { hasText: CT }).hover()
    await page.locator('tr', { hasText: CT }).getByText('Edit').click()
  })
await page.waitForTimeout(800)
const em2 = page.locator('.fixed')
check(await em2.getByPlaceholder('Number').count() === 2, 'persisted: two phone rows')
check(await em2.getByPlaceholder('Email').count() === 2, 'persisted: two email rows')
check((await em2.getByPlaceholder('Ext.').nth(1).inputValue()) === '204', 'persisted: extension 204')
const locVal = await em2.locator('select').nth(1).locator('option:checked').textContent()
check((locVal ?? '').includes('HQ'), 'persisted: contact assigned to HQ')
await page.screenshot({ path: 'ss-dir-4-edit.png' })
await em2.getByRole('button', { name: 'Cancel' }).click()
await page.waitForTimeout(400)

// ── 5. Company trade filter ──────────────────────────────────────────────────
const tradeFilter = page.locator('aside select').first()
await tradeFilter.selectOption({ label: 'Mechanical' })
await page.waitForTimeout(400)
check(await page.locator('aside').getByText(CO).count() === 1, 'trade filter (Mechanical) keeps company')
await tradeFilter.selectOption({ label: 'Building Envelope' })
await page.waitForTimeout(400)
check(await page.locator('aside').getByText(CO).count() === 0, 'trade filter (Building Envelope) hides company')

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? 'UI PASS — verify dual-write mirrors via SQL, then clean up.'
  : `FAIL — ${fails.length}: ${fails.join('; ')}`)
console.log('='.repeat(60))

await browser.close()
process.exit(fails.length === 0 ? 0 : 1)
