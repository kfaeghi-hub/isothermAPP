// Deliverables tab proof (approved plan step 6):
//   compose-from-classification run TWICE (idempotency), status walk with
//   date_closed-pattern stamping, ad-hoc add (one-of CHECK), Envelope
//   activate→compose 6-row delta→deactivate, overdue row in the Attention
//   Queue + My Items as dev.test. Self-cleaning; ZZ-TEST family only.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-deliverables.mjs

import { chromium } from 'playwright'
import { loginAs, adminCredentials, credentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'

const LEED_PROJECT = 'ZZ-TEST-LEED — Do Not Use'
const ADHOC_NAME = 'ZZ Overdue Ad-hoc Deliverable'
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const today = new Date().toISOString().slice(0, 10)

// ── DB access (Management API) for assertions, activation toggles, cleanup ──
const TOKEN = process.env.SUPABASE_MGMT_TOKEN
if (!TOKEN) { console.error('SUPABASE_MGMT_TOKEN missing'); process.exit(1) }
async function sql(query) {
  const res = await fetch('https://api.supabase.com/v1/projects/isztyeczqndploybdtcn/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Management API ${res.status}: ${JSON.stringify(body)}`)
  return body
}
const ids = await sql(`select id, name from projects where name in ('${TEST_PROJECT}', '${LEED_PROJECT}')`)
const zzId = ids.find(p => p.name === TEST_PROJECT)?.id
const leedId = ids.find(p => p.name === LEED_PROJECT)?.id
if (!zzId || !leedId) { console.error('ZZ-TEST family projects not found'); process.exit(1) }

// Pre-clean (self-healing): a prior failed run may have left rows/state behind.
await sql(`delete from project_deliverables where project_id='${zzId}'`)
await sql(`delete from project_deliverables where project_id='${leedId}' and template_id in
  (select id from deliverable_templates where name like 'Envelope %' or name in ('Design Review','Design Review Backcheck'))`)
await sql(`delete from project_classifications where project_id='${leedId}' and option_id in
  (select id from classification_options where label='LEED Envelope Cx (BECx)')`)
await sql(`update classification_options set active=false where label='LEED Envelope Cx (BECx)'`)
await sql(`update deliverable_templates set active=false where name like 'Envelope %'`)

const browser = await chromium.launch()
let context = await browser.newContext()
let page = await context.newPage()

// loginAs assumes a signed-out session — each login gets a FRESH context.
async function newSession(creds) {
  await context.close()
  context = await browser.newContext()
  page = await context.newPage()
  await page.setViewportSize({ width: 1500, height: 1000 })
  page.on('dialog', d => d.accept())
  await loginAs(page, creds)
}
await page.setViewportSize({ width: 1500, height: 1000 })
page.on('dialog', d => d.accept())

async function openProjectTab(name, tab) {
  await page.goto(BASE_URL + '/')
  await page.waitForTimeout(1500)
  await page.getByText(name, { exact: false }).first().click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: tab, exact: true }).click()
  await page.waitForTimeout(1200)
}

async function composePreviewNames() {
  await page.getByRole('button', { name: 'Compose from classification' }).first().click()
  await page.waitForTimeout(1200)
  const modal = page.locator('.fixed').last()
  if (await modal.getByText('Nothing to add').count() > 0) return { names: [], modal }
  const names = await modal.locator('li').allTextContents()
  return { names: names.map(n => n.replace(/^•\s*/, '').trim()), modal }
}

// ── Login (admin: drives edit-project + compose) + deploy wait ──────────────
await loginAs(page, adminCredentials())
check(await page.locator('input[type="password"]').count() === 0, 'logged in as dev.admin')

let live = false
for (let i = 0; i < 10 && !live; i++) {
  await openProjectTab(TEST_PROJECT, 'Deliverables')
  live = await page.getByRole('button', { name: 'Compose from classification' }).count() > 0
  if (!live) { console.log(`  deploy not live yet (attempt ${i + 1}) — waiting 30s`); await page.waitForTimeout(30000) }
}
check(live, 'Deliverables tab is live (deploy up)')
if (!live) { await browser.close(); process.exit(1) }

// ── A: compose on ZZ-TEST, twice (idempotency) ──────────────────────────────
{
  const { names, modal } = await composePreviewNames()
  check(names.length === 4, `compose preview offers 4 NC-set rows (got ${names.length}: ${names.join(', ')})`)
  check(names.includes('Cx Plan') && names.includes('Final Cx Report'), 'preview includes Cx Plan + Final Cx Report')
  await modal.getByRole('button', { name: /^Add \d+$/ }).click()
  await page.waitForTimeout(1500)
  const n1 = await sql(`select count(*) as n from project_deliverables where project_id='${zzId}'`)
  check(Number(n1[0].n) === 4, `4 rows composed into ZZ-TEST (db=${n1[0].n})`)

  // Run TWICE — the second run must offer nothing (idempotency proof).
  const second = await composePreviewNames()
  check(second.names.length === 0, 'second compose run offers ZERO rows (idempotent)')
  // Two "Close" accessible names since the Modal × gained its aria-label — take the footer button.
  await second.modal.getByRole('button', { name: 'Close' }).last().click()
  await page.waitForTimeout(400)
  const n2 = await sql(`select count(*) as n from project_deliverables where project_id='${zzId}'`)
  check(Number(n2[0].n) === 4, `row count unchanged after second run (db=${n2[0].n})`)
  await page.screenshot({ path: 'ss-deliv-1-composed.png' })
}

// ── A2: status walk with date stamping (Cx Plan row) ────────────────────────
{
  const row = page.locator('tr', { hasText: 'Cx Plan' }).first()
  const setStatus = async (label) => {
    await row.locator('select').selectOption({ label })
    await page.waitForTimeout(1200)
  }
  await setStatus('In Progress')
  await setStatus('Submitted')
  let d = await sql(`select date_submitted, date_accepted from project_deliverables pd
    join deliverable_templates dt on dt.id = pd.template_id
    where pd.project_id='${zzId}' and dt.name='Cx Plan'`)
  check(d[0].date_submitted === today && d[0].date_accepted === null,
    `submitted stamps date_submitted=today (${d[0].date_submitted})`)
  await setStatus('Accepted')
  d = await sql(`select date_submitted, date_accepted from project_deliverables pd
    join deliverable_templates dt on dt.id = pd.template_id
    where pd.project_id='${zzId}' and dt.name='Cx Plan'`)
  check(d[0].date_accepted === today, `accepted stamps date_accepted=today (${d[0].date_accepted})`)
  await setStatus('In Progress') // regression clears both (date_closed pattern)
  d = await sql(`select date_submitted, date_accepted from project_deliverables pd
    join deliverable_templates dt on dt.id = pd.template_id
    where pd.project_id='${zzId}' and dt.name='Cx Plan'`)
  check(d[0].date_submitted === null && d[0].date_accepted === null,
    'regression clears date_submitted and date_accepted')
}

// ── A3: ad-hoc add + overdue/assignment setup ───────────────────────────────
{
  await page.getByRole('button', { name: '+ Add deliverable' }).click()
  await page.waitForTimeout(600)
  const modal = page.locator('.fixed').last()
  await modal.getByPlaceholder('e.g. Roof Warranty Letter').fill(ADHOC_NAME)
  await modal.getByRole('button', { name: 'Add', exact: true }).click()
  await page.waitForTimeout(1200)
  check(await page.getByText(ADHOC_NAME).count() > 0, 'ad-hoc deliverable added')
  check(await page.getByText('AD-HOC').count() > 0, 'AD-HOC marker rendered')
  const chk = await sql(`select template_id, name from project_deliverables where project_id='${zzId}' and name='${ADHOC_NAME}'`)
  check(chk.length === 1 && chk[0].template_id === null, 'ad-hoc row satisfies the one-of CHECK (template_id null, name set)')

  // Overdue + assigned to Dev Test (queue/mine case; set directly for date precision)
  await sql(`update project_deliverables set due_date='2026-07-01', assigned_to='Dev Test'
    where project_id='${zzId}' and name='${ADHOC_NAME}'`)
}

// ── B: dev.test sees it in the Attention Queue + My Items ───────────────────
{
  await newSession(credentials())
  await page.waitForTimeout(2000)
  check(await page.getByText('DELIVERABLE').count() > 0, 'Attention Queue shows a DELIVERABLE row')
  check(await page.getByText(`${ADHOC_NAME} overdue`).count() > 0, 'overdue deliverable named in the queue')
  check(await page.locator('a', { hasText: ADHOC_NAME }).count() > 0, 'My Items lists the Dev-Test-assigned deliverable')
  await page.screenshot({ path: 'ss-deliv-2-dashboard.png' })
}

// ── C: Envelope activation → 6-row compose delta on ZZ-TEST-LEED ────────────
await newSession(adminCredentials())
{
  // Activate the dormant Envelope option + templates BEFORE the page loads its
  // classification config (sign-off 4: activation within the test).
  await sql(`update classification_options set active=true where label='LEED Envelope Cx (BECx)'`)
  await sql(`update deliverable_templates set active=true where name like 'Envelope %'`)

  // First: the seed-delta re-sync (Design Review + Backcheck now map to Enhanced).
  // The envelope option is active but NOT selected — it must not compose yet.
  await openProjectTab('ZZ-TEST-LEED', 'Deliverables')
  const pre = await composePreviewNames()
  check(pre.names.length === 2 && pre.names.includes('Design Review') && pre.names.includes('Design Review Backcheck'),
    `LEED re-sync offers exactly the 2 Enhanced seed-delta rows (got: ${pre.names.join(', ')})`)
  await pre.modal.getByRole('button', { name: /^Add \d+$/ }).click()
  await page.waitForTimeout(1500)

  // Select the option on the project (Edit Project modal pill)
  await page.getByRole('button', { name: 'Edit Project' }).click()
  await page.waitForTimeout(1000)
  const modal = page.locator('.fixed').last()
  await modal.getByRole('button', { name: 'LEED Envelope Cx (BECx)', exact: true }).click()
  await modal.getByRole('button', { name: 'Save Changes' }).click()
  await page.waitForTimeout(2000)

  // Compose: exactly the 6 envelope rows
  await page.getByRole('button', { name: 'Deliverables', exact: true }).click()
  await page.waitForTimeout(1000)
  const env = await composePreviewNames()
  check(env.names.length === 6 && env.names.every(n => n.startsWith('Envelope ')),
    `Envelope compose delta is exactly the 6 envelope rows (got ${env.names.length}: ${env.names.join(', ')})`)
  await env.modal.getByRole('button', { name: /^Add \d+$/ }).click()
  await page.waitForTimeout(1500)
  const n = await sql(`select count(*) as n from project_deliverables where project_id='${leedId}'`)
  check(Number(n[0].n) === 14 + 2 + 6, `LEED register at 22 after both composes (db=${n[0].n})`)
  await page.screenshot({ path: 'ss-deliv-3-envelope.png' })

  // Cleanup C: unselect the option, remove added rows, re-dormant the seeds
  await page.getByRole('button', { name: 'Edit Project' }).click()
  await page.waitForTimeout(1000)
  const modal2 = page.locator('.fixed').last()
  await modal2.getByRole('button', { name: 'LEED Envelope Cx (BECx)', exact: true }).click()
  await modal2.getByRole('button', { name: 'Save Changes' }).click()
  await page.waitForTimeout(2000)
  await sql(`delete from project_deliverables where project_id='${leedId}' and template_id in
    (select id from deliverable_templates where name like 'Envelope %' or name in ('Design Review','Design Review Backcheck'))`)
  await sql(`update classification_options set active=false where label='LEED Envelope Cx (BECx)'`)
  await sql(`update deliverable_templates set active=false where name like 'Envelope %'`)
}

// ── D: cleanup A (ZZ-TEST back to zero rows) ────────────────────────────────
await sql(`delete from project_deliverables where project_id='${zzId}'`)
const fin = await sql(`
  select (select count(*) from project_deliverables where project_id='${zzId}') as zz,
         (select count(*) from project_deliverables where project_id='${leedId}') as leed,
         (select count(*) from classification_options where label='LEED Envelope Cx (BECx)' and active) as env_active,
         (select count(*) from deliverable_templates where name like 'Envelope %' and active) as env_tmpl_active,
         (select count(*) from project_classifications pc join classification_options co on co.id=pc.option_id
            where pc.project_id='${leedId}' and co.label='LEED Envelope Cx (BECx)') as env_selected`)
check(Number(fin[0].zz) === 0, 'cleanup: ZZ-TEST deliverables back to 0')
check(Number(fin[0].leed) === 14, `cleanup: ZZ-TEST-LEED back to its original 14 (db=${fin[0].leed})`)
check(Number(fin[0].env_active) === 0 && Number(fin[0].env_tmpl_active) === 0 && Number(fin[0].env_selected) === 0,
  'cleanup: Envelope option + templates dormant again, selection removed')

await browser.close()
console.log(fails.length === 0 ? '\nALL CHECKS PASSED' : `\n${fails.length} FAILURE(S):\n${fails.join('\n')}`)
process.exit(fails.length === 0 ? 0 : 1)
