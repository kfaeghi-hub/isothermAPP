// pw-contact-modal — Adam's item: a contact born on the Team tab is a complete
// citizen from birth.
//
//   node --env-file=.env pw-contact-modal.mjs
//
// THE DEFECT THIS GUARDS. The Team tab used to mint contacts through its own
// name-and-title field: no phones, no emails, no primary flags. Such a contact
// is invisible to distribution lists and to every mailto link, and nobody finds
// out until they go looking for a number that never existed. The old path would
// have passed any test asserting "a contact was created" — it created one.
//
// So this asserts the thing that was actually missing: CHANNELS, with a primary.
//
// ZZ-TEST only, self-cleaning in `finally`.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'

const fails = []
let passed = 0
const check = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg)
}

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())
const { data: zz } = await adm.from('projects').select('id, name').eq('name', TEST_PROJECT).single()

const NAME = 'ZZ-MODAL Probe Person'
let browser
try {
  // ── ONE MODAL, NOT TWO ────────────────────────────────────────────────────
  // The whole argument for extracting it was a single save path. Prove there is
  // exactly one component, and that neither page kept a private copy.
  const { readFileSync } = await import('node:fs')
  const dir  = readFileSync('src/pages/DirectoryPage.tsx', 'utf8')
  const team = readFileSync('src/pages/TeamPage.tsx', 'utf8')
  check(dir.includes('<ContactModal') && team.includes('<ContactModal'),
    'both pages render the SHARED ContactModal')
  check(!dir.includes('replace_contact_channels') && !team.includes('replace_contact_channels'),
    'neither page calls replace_contact_channels directly — one save path, in one place')
  check(!team.includes('addNewContactInline'),
    'the name-and-title quick-add is GONE, not merely bypassed')

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await loginAs(page, adminCredentials())
  await page.goto(`${BASE_URL}/projects/${zz.id}?tab=team`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Open an assign flow and reach the person step.
  const addSeat = page.getByRole('button', { name: /\+ Add|Assign/ }).first()
  await addSeat.click()
  await page.waitForTimeout(900)

  // Pick the first company offered, to reach step 2.
  const firstCompany = page.locator('button, label').filter({ hasText: /Ecosystem|Isotherm|Humber/ }).first()
  if (await firstCompany.count()) { await firstCompany.click(); await page.waitForTimeout(900) }

  const newContactBtn = page.getByRole('button', { name: /New contact at/ })
  check(await newContactBtn.count() > 0, 'the Team tab offers "New contact at <company>"')
  await newContactBtn.first().click()
  await page.waitForTimeout(900)

  const body = await page.locator('body').innerText()
  check(/Add Contact/.test(body), 'it opens the full contact modal, not an inline field')
  check(/Add phone/i.test(body) && /Add email/i.test(body),
    'THE PHONE AND EMAIL MACHINERY IS PRESENT — the thing the old quick-add lacked')
  check(/Set by the team seat/.test(body),
    'the company is locked to the seat, and the modal says why')

  const companySelect = page.locator('select').filter({ hasText: /Select a company/ }).first()
  check(await companySelect.isDisabled(),
    'the company picker is actually disabled, not just captioned')

  // ── fill it in as a field user would ──────────────────────────────────────
  await page.getByPlaceholder('Full name').fill(NAME)
  await page.getByPlaceholder(/Mechanical Engineer/).fill('ZZ Probe Title')
  await page.getByRole('button', { name: '+ Add phone' }).click()
  await page.getByPlaceholder('Number').fill('(416) 555-0100')
  await page.getByRole('button', { name: '+ Add email' }).click()
  await page.getByPlaceholder('Email').fill('zz-modal@example.com')
  await page.getByRole('button', { name: 'Add Contact', exact: true }).click()
  await page.waitForTimeout(2500)

  // ── THE ASSERTION THAT MATTERS ────────────────────────────────────────────
  const { data: made } = await adm.from('contacts')
    .select('id, name, trade, company_id, email, phone, contact_phones(*), contact_emails(*)')
    .eq('name', NAME).maybeSingle()

  check(!!made, 'the contact was created')
  check((made?.contact_phones ?? []).length === 1,
    `it has a PHONE ROW (${made?.contact_phones?.length ?? 0}) — the old path created none`)
  check((made?.contact_emails ?? []).length === 1,
    `it has an EMAIL ROW (${made?.contact_emails?.length ?? 0}) — the old path created none`)
  check((made?.contact_phones ?? []).filter(p => p.is_primary).length === 1,
    'exactly one primary phone')
  check((made?.contact_emails ?? []).filter(e => e.is_primary).length === 1,
    'exactly one primary email — this is what distribution lists read')
  check(made?.email === 'zz-modal@example.com' && made?.phone === '(416) 555-0100',
    'the legacy mirror columns were written in the same transaction')
  check(!!made?.company_id, 'the company came from the locked seat, not from a blank')
  check(made?.trade === 'ZZ Probe Title', 'the title carried through')

  await page.screenshot({ path: 'out/team-contact-modal.png' })

} catch (e) {
  check(false, `run: ${e.message}`)
  try { await (await browser.newPage()).screenshot({ path: 'out/team-contact-modal-fail.png' }) } catch { /* best effort */ }
} finally {
  const { data: leftovers } = await adm.from('contacts').select('id').like('name', 'ZZ-MODAL%')
  for (const c of leftovers ?? []) await adm.from('contacts').delete().eq('id', c.id)
  const { count } = await adm.from('contacts')
    .select('id', { count: 'exact', head: true }).like('name', 'ZZ-MODAL%')
  check((count ?? 0) === 0, `self-clean: 0 probe contacts left (${count})`)
  if (browser) await browser.close()
}

console.log(`\n${'='.repeat(64)}`)
if (fails.length) { console.log(`FAIL — ${fails.length}:`); fails.forEach(f => console.log(`  - ${f}`)); process.exit(1) }
console.log(`PASS — a contact born on the Team tab is complete from birth. ${passed} checks.`)
