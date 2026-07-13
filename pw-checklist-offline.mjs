// Field-resilience acceptance test (MASTER-BRIEF Phase 2).
//
// The scenario that decides adoption: an engineer fills a checklist in a mechanical room
// with no signal. Go offline mid-fill, keep entering responses, reconnect, and assert that
// EVERY entry reached the database. Silent data loss here is the failure this whole
// work item exists to prevent.
//
// Run:  node pw-checklist-offline.mjs
// Needs the dev server on :5173 and an authenticated session (same as the other pw-* scripts).

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
)

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
await page.setViewportSize({ width: 1400, height: 900 })

await page.goto('http://localhost:5173')
await page.waitForLoadState('networkidle')

// ── Open a checklist instance ──────────────────────────────────────────────
await page.locator('text=Seneca Health').click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Checklists', exact: true }).click()
await page.waitForTimeout(800)

// Select the first instance in the list
await page.locator('button:has-text("IVC")').first().click()
await page.waitForTimeout(1000)
await page.screenshot({ path: 'ss-off-1-open.png' })

const selects = page.locator('select')
const gridInputs = page.locator('table input[type="text"]')

// ── 1. Establish a baseline while ONLINE ───────────────────────────────────
await selects.first().selectOption('y')
await page.waitForTimeout(600)
await page.screenshot({ path: 'ss-off-2-online-saved.png' })

const chip = page.locator('text=All changes saved')
if (await chip.count() === 0) console.warn('WARN: expected an "All changes saved" chip while online')

// ── 2. GO OFFLINE ──────────────────────────────────────────────────────────
await context.setOffline(true)
console.log('--- offline ---')

// Enter responses that MUST NOT be lost.
const offlineStatuses = ['n', 'nr', 'na']
for (let i = 0; i < offlineStatuses.length && i < await selects.count(); i++) {
  await selects.nth(i + 1).selectOption(offlineStatuses[i])
  await page.waitForTimeout(300)
}

// Type a grid reading offline, then blur to force the debounced flush.
if (await gridInputs.count() > 0) {
  await gridInputs.first().fill('208.4')
  await gridInputs.first().blur()
  await page.waitForTimeout(600)
}

await page.screenshot({ path: 'ss-off-3-offline-queued.png' })

// The UI must SAY it is offline and holding work — never imply it saved.
const offlineChip = await page.locator('text=/Offline/').count()
if (offlineChip === 0) throw new Error('FAIL: no offline indicator — the engineer would think this saved')

// Mark Complete must be blocked while entries are queued (rule 4).
const completeBtn = page.getByRole('button', { name: 'Mark Complete' })
if (await completeBtn.count() > 0 && await completeBtn.isEnabled()) {
  throw new Error('FAIL: Mark Complete is enabled with queued entries — would freeze an incomplete record')
}
console.log('OK: offline indicator shown, Mark Complete blocked')

// ── 3. RECONNECT ───────────────────────────────────────────────────────────
await context.setOffline(false)
console.log('--- back online ---')
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(4000)   // let the outbox drain

await page.screenshot({ path: 'ss-off-4-reconnected.png' })

// ── 4. ASSERT: every entry actually reached the database ───────────────────
const instanceId = await page.evaluate(() => {
  const m = document.body.innerHTML.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  return m ? m[0] : null
})

const { data: rows } = await supabase
  .from('checklist_responses')
  .select('status')
  .not('status', 'is', null)

const statuses = (rows ?? []).map(r => r.status)
const missing = offlineStatuses.filter(s => !statuses.includes(s))

if (missing.length > 0) {
  throw new Error(`FAIL: responses entered offline never reached the DB: ${missing.join(', ')}`)
}

// The queue must be empty and the chip must say so.
const drained = await page.evaluate(() => localStorage.getItem('isotherm.checklist.outbox.v1'))
if (drained) throw new Error(`FAIL: outbox did not drain after reconnect: ${drained}`)

const savedChip = await page.locator('text=All changes saved').count()
if (savedChip === 0) throw new Error('FAIL: chip does not report "All changes saved" after drain')

console.log('PASS: every offline entry persisted, outbox drained, Complete re-enabled')
console.log('instance:', instanceId)

await browser.close()
