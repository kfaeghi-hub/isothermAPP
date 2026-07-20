// Full-register finding verification (ZZ-TEST only):
//   create a finding with EVERY register field via the real UI → assert the
//   detail render → assert the site-report lines (Location / description /
//   corrective action) → delete the finding → regenerate → byte-clean against
//   the baseline captured at test start. Self-cleaning.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-finding-register.mjs
import { chromium } from 'playwright'
import { inflateRawSync } from 'node:zlib'
import { login, openTestProject, BASE_URL } from './pw-config.mjs'

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_id: REPORT }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`report generation failed (${res.status}): ${body.error ?? ''}`)
  return visibleText(Buffer.from(await (await fetch(body.storage_url)).arrayBuffer()))
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
  await modal.locator('textarea[placeholder^="Describe the deficiency"]').fill(DESC)
  await modal.locator('input[placeholder^="e.g. Level 3"]').fill(AREA)
  await modal.locator('textarea[placeholder^="Required measure"]').fill(CORR)

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
  await page.waitForTimeout(2500)

  // ── Detail render ────────────────────────────────────────────────────────
  check(await page.getByText(DESC).count() > 0, 'detail: Issue Description block renders')
  check(await page.getByText(CORR).count() > 0, 'detail: Corrective Action block renders')
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
