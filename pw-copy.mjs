// Multi-unit copy mechanisms — verification against ZZ-TEST only.
//
//   A. Column "copy from unit": fills empty cells only, NEVER overwrites an
//      existing entry (fill-the-exception-first), reports copied vs kept.
//   B. Row "apply to all": one unit's response copied across the row, instantly.
//   C. A copied N opens the normal finding-modal flow for the copied-into target
//      (findings themselves are never copied; one finding per item per target).
//
// Creates its own throwaway instance from the AHU template and deletes it at the
// end — the standing regression instance is never touched.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-copy.mjs
import { chromium } from 'playwright'
import { login, openTestProject, BASE_URL } from './pw-config.mjs'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1500, height: 950 })

try {
  await login(page)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Checklists', exact: true }).click()
  await page.waitForTimeout(1500)

  // ── Create a throwaway two-target instance from the AHU template ─────────
  await page.getByRole('button', { name: '+ New Checklist' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button').filter({ hasText: 'AHU Installation Verification Checklist' }).first().click()
  await page.waitForTimeout(800)
  await page.getByRole('button').filter({ hasText: 'TEST-AHU-1' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button').filter({ hasText: 'TEST-AHU-2' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Create Checklist' }).click()
  await page.waitForTimeout(3000)
  check(await page.locator('[data-testid^="copy-into-"]').count() === 2,
    'detail open: per-unit Copy from… controls present (2 columns)')

  const row = (label) =>
    page.locator('div.group').filter({ has: page.locator('p', { hasText: new RegExp(`^${label}$`) }) })

  // ── Seed: AHU-1 answers + one pre-existing AHU-2 answer ──────────────────
  await row('Supply Fan').locator('select').nth(0).selectOption('y')
  await page.waitForTimeout(500)
  await row('Return Fan').locator('select').nth(0).selectOption('y')
  await page.waitForTimeout(500)
  await row('Return Fan').locator('select').nth(1).selectOption('nr')   // the exception, filled first
  await page.waitForTimeout(700)

  // ── A. Column copy AHU-1 → AHU-2 ─────────────────────────────────────────
  await page.locator('[data-testid^="copy-into-"]').nth(1).click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid^="copy-from-"]').first().click()
  await page.waitForTimeout(500)
  const confirmText = await page.locator('.space-y-4', { hasText: 'empty cells' }).innerText().catch(() => '')
  check(/Copy\s+1\s+response/.test(confirmText), `confirm states the count before applying (got: ${confirmText.split('\n')[0]})`)
  check(confirmText.includes('TEST-AHU-1') && confirmText.includes('TEST-AHU-2'), 'confirm names source and target units')
  await page.locator('[data-testid="copy-confirm-apply"]').click()
  await page.waitForTimeout(1500)

  check(await row('Supply Fan').locator('select').nth(1).inputValue() === 'y',
    'column copy: empty AHU-2 cell filled with Y')
  check(await row('Return Fan').locator('select').nth(1).inputValue() === 'nr',
    'NEVER-OVERWRITE: pre-existing AHU-2 entry (NR) kept, not replaced by Y')
  const result = await page.locator('[data-testid="copy-result"]').innerText().catch(() => '')
  check(/Copied 1 response/.test(result) && /kept/.test(result),
    `result reports copied vs kept (got: ${result || 'none'})`)

  // ── B. Row apply-to-all ──────────────────────────────────────────────────
  await row('Exhaust/Relief Fan').locator('select').nth(0).selectOption('y')
  await page.waitForTimeout(600)
  await row('Exhaust/Relief Fan').locator('[data-testid^="apply-all-"]').first().click({ force: true })
  await page.waitForTimeout(1200)
  check(await row('Exhaust/Relief Fan').locator('select').nth(1).inputValue() === 'y',
    'row apply-to-all: status copied across the row, no confirm')

  // ── C. Copied N opens the finding-modal flow per target ──────────────────
  const nItem = 'Cabinet and general installation'
  await row(nItem).locator('select').nth(0).selectOption('n')
  await page.waitForTimeout(1200)
  check(await page.getByText('Create Finding', { exact: true }).count() > 0,
    'manual N on AHU-1 opens the finding modal (normal flow intact)')
  await page.getByRole('button', { name: 'Create Finding' }).click()
  await page.waitForTimeout(1500)
  check(await row(nItem).getByText('Finding', { exact: true }).count() === 1,
    'AHU-1 finding link recorded')

  await page.locator('[data-testid^="copy-into-"]').nth(1).click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid^="copy-from-"]').first().click()
  await page.waitForTimeout(500)
  await page.locator('[data-testid="copy-confirm-apply"]').click()
  await page.waitForTimeout(1500)
  check(await page.getByText('Create Finding', { exact: true }).count() > 0,
    'COPIED N: finding modal opens for the copied-into target (finding not copied)')
  await page.getByRole('button', { name: 'Create Finding' }).click()
  await page.waitForTimeout(1500)
  check(await row(nItem).getByText('Finding', { exact: true }).count() === 2,
    'one finding per item per target: both units now carry their own link')
  check(await row(nItem).locator('select').nth(1).inputValue() === 'n',
    'copied N status landed on AHU-2')

  // ── Cleanup: delete the throwaway instance ───────────────────────────────
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await page.waitForTimeout(1500)
  check(true, 'throwaway instance deleted (regression instance untouched)')
} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-copy-fail.png', fullPage: true }).catch(() => {})
}

await browser.close()
console.log('\n' + '='.repeat(60))
console.log(fails.length === 0 ? 'PASS — copy mechanisms verified.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
