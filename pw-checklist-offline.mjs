// Field-resilience acceptance test (MASTER-BRIEF Phase 2).
//
// The scenario that decides adoption: an engineer fills a checklist in a mechanical room
// with no signal. Go offline mid-fill, keep working, reconnect, and prove EVERY entry
// reached the database. Silent data loss here is the failure this work item exists to prevent.
//
// The final assertion deliberately RELOADS the page: a reload wipes all local state, so if
// the values are still there afterwards they can only have come from the server.
//
// Run:  node --env-file=.env pw-checklist-offline.mjs
// Needs: dev server on :5173, and `email` / `password` in .env (gitignored, never hardcoded).

import { chromium } from 'playwright'
import { login, openTestProject, TEST_PROJECT } from './pw-config.mjs'

const fails = []
const check = (ok, msg) => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${msg}`)
  if (!ok) fails.push(msg)
}

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
await page.setViewportSize({ width: 1500, height: 950 })

// ── Login ──────────────────────────────────────────────────────────────────
await login(page)
await page.screenshot({ path: 'ss-off-0-loggedin.png' })
check(await page.locator('input[type="password"]').count() === 0, 'logged in with test account')

// ── Open the TEST project (throws rather than touch a real one) -> Checklists ──
await openTestProject(page)
console.log(`  (running against "${TEST_PROJECT}")`)
const cxTab = page.getByRole('button', { name: 'Checklists', exact: true })
if (await cxTab.count() === 0) {
  await page.screenshot({ path: 'ss-off-ERR-noproject.png' })
  console.error('Could not reach the Checklists tab — see ss-off-ERR-noproject.png')
  await browser.close(); process.exit(1)
}
await cxTab.click()
await page.waitForTimeout(1200)

// ── FLOW: instance creation (also gives us a clean instance to fill) ───────
await page.getByRole('button', { name: '+ New Checklist' }).click()
await page.waitForTimeout(900)
await page.locator('.fixed button').filter({ hasText: /IVC|PFC|FPT/ }).first().click()  // pick template
await page.waitForTimeout(800)
await page.locator('.fixed button').filter({ hasText: /EQ|SYS/ }).first().click()       // pick equipment
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Create Checklist' }).click()
await page.waitForTimeout(3000)
await page.screenshot({ path: 'ss-off-1-created.png' })
check(await page.locator('text=Sign-offs').count() > 0, 'instance created + fill view rendered')

const selects = page.locator('select')
const gridInputs = page.locator('table input[type="text"]')
const signerInput = page.locator('input[placeholder="Signer name"]')

// ── 1. Baseline while ONLINE ───────────────────────────────────────────────
await selects.first().selectOption('y')
await page.waitForTimeout(1200)
check(await page.locator('text=All changes saved').count() > 0, 'online: chip reads "All changes saved"')

// ── 2. GO OFFLINE ──────────────────────────────────────────────────────────
console.log('\n--- OFFLINE ---')
await context.setOffline(true)

// A failing status response (triggers the finding modal)
await selects.nth(1).selectOption('n')
await page.waitForTimeout(1200)

// Finding modal: create it OFFLINE (Option A - queued with a client UUID)
const findingModal = page.locator('text=Create Finding')
if (await findingModal.count() > 0) {
  await page.getByRole('button', { name: /Create Finding|Retry/ }).last().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'ss-off-2-finding-offline.png' })
}

// More responses offline
if (await selects.count() > 2) { await selects.nth(2).selectOption('nr'); await page.waitForTimeout(400) }

// Grid reading offline (blur forces the debounced flush)
if (await gridInputs.count() > 0) {
  await gridInputs.first().fill('208.4')
  await gridInputs.first().blur()
  await page.waitForTimeout(1200)
}

// Signoff offline.
// NB: instance signoffs are ordered by a created_at that is IDENTICAL across rows
// (they're bulk-inserted), so their on-screen order is not stable between loads.
// Capture the role label of the row we type into and assert against THAT row later,
// rather than trusting position. (The ordering itself is a separate bug — reported.)
let signoffLabel = null
if (await signerInput.count() > 0) {
  signoffLabel = await signerInput.first().evaluate(
    el => el.parentElement?.querySelector('div')?.textContent?.trim() ?? null,
  )
  await signerInput.first().fill('Offline Tester')
  await signerInput.first().blur()
  await page.waitForTimeout(1200)
  console.log(`  (signoff row targeted: "${signoffLabel}")`)
}

await page.screenshot({ path: 'ss-off-3-offline-queued.png' })

check(await page.locator('text=/Offline/').count() > 0,
  'offline: chip warns "Offline - N queued" (never implies saved)')

const completeBtn = page.getByRole('button', { name: 'Mark Complete' })
const completeDisabled = await completeBtn.count() > 0 ? await completeBtn.isDisabled() : false
check(completeDisabled, 'offline: Mark Complete is BLOCKED while entries are queued (rule 4)')

const queuedRaw = await page.evaluate(() => localStorage.getItem('isotherm.checklist.outbox.v1'))
check(!!queuedRaw && JSON.parse(queuedRaw).length > 0, 'offline: entries are durably queued in the outbox')
console.log(`  queued ops: ${queuedRaw ? JSON.parse(queuedRaw).length : 0}`)

// ── 3. RECONNECT ───────────────────────────────────────────────────────────
console.log('\n--- BACK ONLINE ---')
await context.setOffline(false)
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(6000)   // let the outbox drain

const drained = await page.evaluate(() => localStorage.getItem('isotherm.checklist.outbox.v1'))
check(!drained, 'reconnect: outbox drained to empty')
await page.screenshot({ path: 'ss-off-4-drained.png' })

// ── 4. THE REAL TEST: reload, and see if the data came back from the SERVER ─
console.log('\n--- RELOAD (local state wiped; anything still here came from the DB) ---')
await page.reload()
await page.waitForTimeout(4000)
// No router: a reload lands back on the Projects list, so re-navigate from scratch.
await openTestProject(page)
await page.getByRole('button', { name: 'Checklists', exact: true }).click()
await page.waitForTimeout(1500)
// The instance we just made is newest-first at the top of the list.
await page.locator('button:has-text("Not Started"), button:has-text("In Progress")').first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'ss-off-5-after-reload.png' })

const s2 = page.locator('select')
const g2 = page.locator('table input[type="text"]')
const sn2 = page.locator('input[placeholder="Signer name"]')

check(await s2.first().inputValue() === 'y',  'persisted: online response (y)')
check(await s2.nth(1).inputValue() === 'n',   'persisted: OFFLINE response (n)')
if (await s2.count() > 2) check(await s2.nth(2).inputValue() === 'nr', 'persisted: OFFLINE response (nr)')
if (await g2.count() > 0)  check((await g2.first().inputValue()) === '208.4', 'persisted: OFFLINE grid reading (208.4)')
if (await sn2.count() > 0 && signoffLabel) {
  // Match by role label, not position — see the ordering note above.
  const persistedSignoff = await sn2.evaluateAll(
    (els, label) => {
      const row = els.find(el => el.parentElement?.querySelector('div')?.textContent?.trim() === label)
      return row ? row.value : null
    },
    signoffLabel,
  )
  check(persistedSignoff === 'Offline Tester', `persisted: OFFLINE signoff name (row "${signoffLabel}")`)
}
check(await page.locator('text=Finding').count() > 0, 'persisted: OFFLINE finding created + linked')
check(await page.locator('text=All changes saved').count() > 0, 'after drain: chip reads "All changes saved"')

const completeBtn2 = page.getByRole('button', { name: 'Mark Complete' })
if (await completeBtn2.count() > 0) {
  check(await completeBtn2.isEnabled(), 'after drain: Mark Complete is re-enabled')
}

// ── Result ─────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60))
if (fails.length === 0) {
  console.log('PASS - every offline entry reached the database. No silent data loss.')
} else {
  console.log(`FAIL - ${fails.length} assertion(s) failed:`)
  for (const f of fails) console.log(`  - ${f}`)
}
console.log('='.repeat(60))

await browser.close()
process.exit(fails.length === 0 ? 0 : 1)
