// Verifies the records-integrity fix: a signature block must render in the SAME order
// every time — on every page load, and in every regeneration of an issued document.
//
// Before the fix, an instance's signoffs shared an identical created_at (bulk insert) and
// were ordered by it with no tiebreaker, so Postgres could return them in any order.
//
// Run against production (document generation needs the serverless endpoint):
//   PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-signoff-order.mjs

import { chromium } from 'playwright'
import { inflateRawSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject, TEST_PROJECT, BASE_URL, apiToken, credentials } from './pw-config.mjs'

// This suite creates a fresh instance per run and never deleted it — 8 strays
// had accumulated on ZZ-TEST. Cleanup: delete instances THIS run created
// (created_at > suite start), as admin (completed-instance delete is A1).
const SUITE_START = new Date().toISOString()
async function cleanupOwnInstances() {
  const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const { data } = await adm.from('checklist_instances').delete()
    .eq('project_id', 'e0c427d8-2029-4382-b054-6a84248ad8fe')
    .gt('created_at', SUITE_START).select('id')
  console.log(`cleanup: removed ${data?.length ?? 0} instance(s) created by this run`)
}

const RELOADS = 5
const fails = []
const check = (ok, msg) => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${msg}`)
  if (!ok) fails.push(msg)
}

/** Pull word/document.xml out of a .docx (a zip) with no dependencies. */
function docxText(buf) {
  let i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const method = buf.readUInt16LE(i + 8)
    const compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('latin1')
    const dataStart = i + 30 + nameLen + extraLen
    if (name === 'word/document.xml' && compSize > 0) {
      const data = buf.subarray(dataStart, dataStart + compSize)
      const xml = method === 8 ? inflateRawSync(data) : data
      return xml.toString('utf8')
    }
    i = dataStart + (compSize || 1)
  }
  return ''
}

/** Order in which the signoff role labels appear in the document. */
function signoffOrderFromDocx(xml) {
  const roles = ['Commissioning Authority', 'Contractor']
  return roles
    .map(r => ({ r, at: xml.indexOf(r) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(x => x.r)
}

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
await page.setViewportSize({ width: 1500, height: 950 })

console.log(`base: ${BASE_URL}`)

// fetchDetail queries checklist_instances?id=eq.<uuid> — sniff the id off the wire so we
// can call the generator endpoint directly (popup-scraping is unreliable in headless).
let instanceId = null
page.on('request', r => {
  const m = r.url().match(/checklist_instances\?.*id=eq\.([0-9a-f-]{36})/)
  if (m) instanceId = m[1]
})

await login(page)
await openTestProject(page)
console.log(`  (running against "${TEST_PROJECT}")\n`)

await page.getByRole('button', { name: 'Checklists', exact: true }).click()
await page.waitForTimeout(1200)

// Fresh instance
await page.getByRole('button', { name: '+ New Checklist' }).click()
await page.waitForTimeout(900)
await page.locator('.fixed button').filter({ hasText: /IVC|PFC|FPT/ }).first().click()
await page.waitForTimeout(800)
await page.locator('.fixed button').filter({ hasText: /EQ|SYS/ }).first().click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Create Checklist' }).click()
await page.waitForTimeout(3500)

const readSignoffOrder = async () =>
  page.locator('input[placeholder="Signer name"]').evaluateAll(els =>
    els.map(el => el.parentElement?.querySelector('div')?.textContent?.trim() ?? '?'),
  )

// ── 1. Fill view: reload N times, order must never move ─────────────────────
console.log(`--- fill view: ${RELOADS} reloads ---`)
const seen = []
for (let n = 1; n <= RELOADS; n++) {
  const order = await readSignoffOrder()
  seen.push(order.join(' | '))
  console.log(`  load ${n}: ${order.join(' | ')}`)

  if (n < RELOADS) {
    await page.reload()
    await page.waitForTimeout(3500)
    await openTestProject(page)
    await page.getByRole('button', { name: 'Checklists', exact: true }).click()
    await page.waitForTimeout(1200)
    await page.locator('button:has-text("Not Started"), button:has-text("In Progress")').first().click()
    await page.waitForTimeout(2500)
  }
}
const distinct = [...new Set(seen)]
check(distinct.length === 1, `fill view: signoff order identical across ${RELOADS} loads (${distinct.length} distinct)`)

// ── 2. Complete it, then regenerate the document twice ──────────────────────
console.log('\n--- issued document: generate twice ---')
await page.locator('select').first().selectOption('y')
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Mark Complete' }).click()
await page.waitForTimeout(600)
await page.locator('.fixed').getByRole('button', { name: 'Mark Complete' }).click()
await page.waitForTimeout(5000)

if (!instanceId) {
  check(false, 'document: could not determine instance id')
} else {
  console.log(`  instance: ${instanceId}`)
  const orders = []

  for (const attempt of [1, 2]) {
    const res = await fetch(`${BASE_URL}/api/generate-checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await apiToken(credentials())}` },
      body: JSON.stringify({ instance_id: instanceId, mode: 'completed' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.storage_url) {
      console.log(`  generation ${attempt}: FAILED (${res.status}) ${body.error ?? ''}`)
      continue
    }
    const buf = Buffer.from(await (await fetch(body.storage_url)).arrayBuffer())
    const order = signoffOrderFromDocx(docxText(buf)).join(' | ')
    orders.push(order)
    console.log(`  generation ${attempt} signature block: ${order || '(none found)'}`)
  }

  if (orders.length < 2) {
    check(false, 'document: could not generate the document twice')
  } else {
    check(orders[0].length > 0 && orders[0] === orders[1],
      'issued document: signature block identical across two regenerations')

    // Compare role SEQUENCE, not literal labels: the UI renders the full snapshot
    // ("Commissioning Authority (CxA)") while the docx probe matches the stem.
    const norm = s => s.split(' | ').map(r => r.replace(/\s*\(.*\)\s*$/, '').trim()).join(' | ')
    check(norm(orders[0]) === norm(distinct[0]),
      `issued document: signature block matches the fill view order (${norm(orders[0])})`)
  }
}

await cleanupOwnInstances()

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? 'PASS — signature block is deterministic on screen and in issued documents.'
  : `FAIL — ${fails.length}: ${fails.join('; ')}`)
console.log('='.repeat(60))

await browser.close()
process.exit(fails.length === 0 ? 0 : 1)
