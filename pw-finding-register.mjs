// Full-register finding verification (ZZ-TEST only):
//   create a finding with EVERY register field via the real UI → assert the
//   detail render → assert the site-report lines (Location / description /
//   corrective action) → delete the finding → regenerate → byte-clean against
//   the baseline captured at test start. Self-cleaning.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-finding-register.mjs
import { chromium } from 'playwright'
import { inflateRawSync } from 'node:zlib'
import { waitUntil, login, openTestProject, BASE_URL, apiToken, credentials, signedFileUrl } from './pw-config.mjs'

const REPORT = '94b1ee0e-325e-4286-b079-45cecd3400f7'  // ZZ-1 fixture report
const TITLE  = 'ZZ-REGISTER-TEST finding'
const DESC   = 'Register verification: full ASHRAE 202 field set, automated.'
const AREA   = 'Level 9 — Test Wing'
const CORR   = 'Replace the test widget and retest.'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

function docxXml(buf) {
  let i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const m = buf.readUInt16LE(i + 8), cs = buf.readUInt32LE(i + 18)
    const nl = buf.readUInt16LE(i + 26), el = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nl).toString('latin1')
    const s = i + 30 + nl + el
    if (name === 'word/document.xml' && cs > 0) {
      const d = buf.subarray(s, s + cs)
      return (m === 8 ? inflateRawSync(d) : d).toString('utf8')
    }
    i = s + (cs || 1)
  }
  return ''
}
const visibleText = (buf) => docxXml(buf).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

async function generateReportText() {
  const res = await fetch(`${BASE_URL}/api/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await apiToken(credentials())}` },
    body: JSON.stringify({ report_id: REPORT }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`report generation failed (${res.status}): ${body.error ?? ''}`)
  // storage_url is a bucket-relative path (storage privacy pass) — sign to fetch.
  const url = await signedFileUrl(credentials(), { table: 'site_reports', id: REPORT, kind: 'docx' })
  return visibleText(Buffer.from(await (await fetch(url)).arrayBuffer()))
}

const today = new Date()
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

// Baseline BEFORE the test finding exists — the self-clean target.
const baseline = await generateReportText()
console.log('baseline report captured')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1500, height: 950 })

try {
  await login(page)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Issues Log', exact: true }).click()
  await page.waitForTimeout(1500)

  // ── Create with the full register ────────────────────────────────────────
  await page.getByRole('button', { name: '+ New Finding' }).first().click()
  await page.waitForTimeout(800)
  const modal = page.locator('div.fixed.inset-0')

  await modal.locator('input[placeholder^="Brief subject"]').fill(TITLE)
  // RICH-TEXT Phase 2: the description is a ProseMirror editor now (first of
  // two in the modal); fill() drives contenteditable directly.
  await modal.locator('.ProseMirror').nth(0).fill(DESC)
  await modal.locator('input[placeholder^="e.g. Level 3"]').fill(AREA)
  await modal.locator('.ProseMirror').nth(1).fill(CORR)

  // ── AMENDMENT 1 retrofit (2026-08-20): both editors carry the ⤢ shell,
  //    visible AT REST, and expand/collapse loses nothing either direction.
  for (const [tid, name] of [['expand-desc-create', 'description'], ['expand-corr-create', 'corrective']]) {
    const r = await page.locator(`[data-testid="${tid}"]`).evaluate(el => {
      const cs = getComputedStyle(el), bb = el.getBoundingClientRect()
      return { o: cs.opacity, w: bb.width, h: bb.height }
    })
    check(r.o === '1' && r.w > 0 && r.h > 0,
      `AMENDMENT 1: ${name} ⤢ visible at rest (opacity ${r.o}, box ${Math.round(r.w)}x${Math.round(r.h)})`)
  }
  await page.locator('[data-testid="expand-desc-create"]').click()
  await waitUntil(async () => await page.locator('[data-testid="expanded-editor"]').count() === 1,
    { timeout: 15000, what: 'the full-size description editor opening' })
  const bigEd = page.locator('[data-testid="expanded-editor"] .ProseMirror')
  check((await bigEd.innerText()).includes(DESC),
    'expand: the inline draft is IN the full editor (no loss inward)')
  await bigEd.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' EXPANDWORDS')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await waitUntil(async () => await page.locator('[data-testid="expanded-editor"]').count() === 0,
    { timeout: 15000, what: 'the full editor closing' })
  const inlineTxt = await modal.locator('.ProseMirror').nth(0).innerText()
  check(inlineTxt.includes(DESC) && inlineTxt.includes('EXPANDWORDS'),
    'collapse: the modal words are IN the inline view (no loss outward)')

  // Auto-defaults present and editable
  check(await modal.locator('input[type="date"]').inputValue() === todayISO,
    'Date Identified defaults to today')
  const identifiedBy = await modal.locator('input[type="text"]').nth(2).inputValue()
  check(identifiedBy.trim().length > 0, `Identified By defaults to current user ("${identifiedBy}")`)

  // Equipment picker: grouped, searchable, stores the link
  await modal.locator('[data-testid="equipment-picker"]').click()
  await page.waitForTimeout(300)
  await modal.locator('input[placeholder^="Search tag"]').fill('TEST-AHU-1')
  await page.waitForTimeout(300)
  await modal.getByRole('button', { name: /TEST-AHU-1/ }).first().click()
  await page.waitForTimeout(300)

  await modal.getByRole('button', { name: 'Create Finding' }).click()

  // ── Detail render ────────────────────────────────────────────────────────
  await waitUntil(async () => await page.getByText(DESC).count() > 0,
    { timeout: 15000, what: 'detail: Issue Description block renders' })
  check(await page.getByText(DESC).count() > 0, 'detail: Issue Description block renders')
  check(await page.getByText(CORR).count() > 0, 'detail: Corrective Action block renders')
  // THE DETAIL RENDERING IS NOT THE LIST REFRESHING. This check needs AREA in
  // BOTH — the detail block and the list row's suffix — and the row comes from a
  // refetch that lands after the detail. It failed exactly here in N5 when the
  // old 2500ms stopped covering the gap. Its own anchor, per the law.
  await waitUntil(async () => await page.getByText(AREA).count() >= 2,
    { timeout: 15000, what: 'Building/Area in the detail AND the refreshed list row' })
  check(await page.getByText(AREA).count() >= 2, 'detail + list suffix: Building/Area renders in both')
  check(await page.getByText(identifiedBy, { exact: true }).count() > 0, 'detail: Identified By renders')
  check(await page.getByText('TEST-AHU-1').count() > 0, 'detail: Equipment link renders as tag')

  // ── Report lines (only-when-present) ─────────────────────────────────────
  const withFinding = await generateReportText()
  check(withFinding.includes(`Location: ${AREA}`), 'report: Location line renders')
  check(withFinding.includes(DESC), 'report: description body renders')
  check(withFinding.includes(`Corrective action: ${CORR}`), 'report: corrective-action line renders')

  // ── Self-clean via ADMIN API: finding hard-delete is owner-only under access
  // control (C3) — the UI button is correctly hidden from the employee account.
  const { createClient } = await import('@supabase/supabase-js')
  const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const { data: deleted } = await adm.from('findings').delete().eq('title', TITLE).select('id')
  check((deleted ?? []).length === 1, 'finding removed by admin (employee delete is correctly forbidden)')
  await page.waitForTimeout(500)

  const restored = await generateReportText()
  check(restored === baseline, 'self-clean: report regenerates byte-clean to the pre-test baseline')
} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-finding-register-fail.png', fullPage: true }).catch(() => {})
}

await browser.close()
console.log('\n' + '='.repeat(60))
console.log(fails.length === 0 ? 'PASS — full-register finding verified end-to-end.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
