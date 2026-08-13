// PFC type-correction verification (ZZ-TEST only):
//   - template picker shows the AHU template as PFC
//   - a NEW instance created through the real UI flow inherits the denormalized pfc type
//   - the type filter and badges show PFC
// Replaces the stale-snapshot regression instance with a fresh pfc one.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-pfc-verify.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const AHU_TMPL = 'da98cd4a-6132-4017-8763-0aba21303b56'
const TMPL_NAME = 'AHU Prefunctional Checklist'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// Replace the stale instance (its snapshot predates the type/name correction).
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
const { data: old } = await sb.from('checklist_instances')
  .delete().eq('project_id', ZZ).eq('source_template_id', AHU_TMPL).select('id')
console.log(`removed ${old?.length ?? 0} stale AHU instance(s)`)

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1500, height: 950 })

try {
  await login(page)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Checklists', exact: true }).click()
  await page.waitForTimeout(1500)

  const modal = page.locator('div.fixed.inset-0')
  await page.getByRole('button', { name: '+ New Checklist' }).click()
  await page.waitForTimeout(800)

  const tmplRow = modal.getByRole('button').filter({ hasText: TMPL_NAME }).first()
  check(await tmplRow.getByText('PFC', { exact: true }).count() === 1,
    'template picker: AHU template carries the PFC badge')
  await tmplRow.click()
  await page.waitForTimeout(600)
  check(await modal.getByText(/^New PFC —/).count() === 1, 'create modal titled "New PFC — …"')

  await modal.getByRole('button').filter({ hasText: 'TEST-AHU-1' }).first().click()
  await page.waitForTimeout(400)
  await modal.getByRole('button').filter({ hasText: 'TEST-AHU-2' }).first().click()
  await page.waitForTimeout(400)
  await modal.getByRole('button', { name: 'Create Checklist' }).click()
  await page.waitForTimeout(3000)

  // Detail header: badge + corrected name in the snapshot
  check(await page.getByText('PFC', { exact: true }).count() > 0, 'instance detail shows PFC badge')
  check(await page.getByText(TMPL_NAME).count() > 0, 'instance carries the "Prefunctional Checklist" name')
  await page.locator('button', { hasText: '×' }).first().click()
  await page.waitForTimeout(1000)

  // Type filter: PFC shows it, IVC hides it
  await page.getByRole('button', { name: 'PFC', exact: true }).click()
  await page.waitForTimeout(600)
  check(await page.getByText(TMPL_NAME).count() > 0, 'PFC filter lists the new instance')
  await page.getByRole('button', { name: 'IVC', exact: true }).click()
  await page.waitForTimeout(600)
  check(await page.getByText(TMPL_NAME).count() === 0, 'IVC filter does NOT list it')
} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-pfc-fail.png', fullPage: true }).catch(() => {})
}
await browser.close()

// DB truth: the new instance's denormalized type + name snapshot
const { data: fresh } = await sb.from('checklist_instances')
  .select('id, type, source_template_type_snapshot, source_template_name_snapshot, status')
  .eq('project_id', ZZ).eq('source_template_id', AHU_TMPL)
const inst = fresh?.[0]
check(inst?.type === 'pfc' && inst?.source_template_type_snapshot === 'pfc',
  `new instance denormalized type = pfc (got type=${inst?.type}, snapshot=${inst?.source_template_type_snapshot})`)
check(inst?.source_template_name_snapshot === TMPL_NAME,
  `new instance name snapshot = "${TMPL_NAME}" (got "${inst?.source_template_name_snapshot}")`)
console.log(`regression instance: ${inst?.id}`)

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0 ? 'PASS — pfc type + name flow to new instances end-to-end.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
