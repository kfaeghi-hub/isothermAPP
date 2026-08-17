// pw-cx-export — the Cx Index leaves the app as paper and as a workbook, and
// both carry the screen's own numbers.
// [ATLAS] 2026-08-17, Phase 2 of the Cx Index client-facing build.
//
// THE CLAIMS, in the guard family's order:
//   · PREMISE — ZZ-TEST paints and shows a project % in its top bar; the
//     export buttons exist. (A % assertion against a PDF is vacuous unless the
//     screen showed one first.)
//   · PDF — document:'index' returns a signed URL; the rendered PDF carries
//     the D5 stamp on EVERY page (the boundary-gate's own bar), the title, a
//     real group name, the legend, and THE SCREEN'S project % — the same
//     register state must print the same number, or one of the two is lying.
//   · XLSX — the browser download is a real OOXML package: frozen pane at the
//     identity columns, native textRotation, a real tag as an inline string,
//     the stamp in the sheet, merges present. (Real-Excel and LibreOffice
//     opens are the gate's human half, outside this leg.)
//   · REFUSAL — an unknown document kind still 400s by name; the allow-list
//     does not drift to a default.
//
// Read-only throughout: this leg writes nothing to ZZ-TEST and restores
// nothing, because it changed nothing.
import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { loginAs, adminCredentials, openTestProject, waitUntil, apiToken, TEST_PROJECT, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-cx-export')

const SB_URL = process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY
let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const token = await apiToken(adminCredentials())
const projRes = await fetch(
  `${SB_URL}/rest/v1/projects?name=eq.${encodeURIComponent(TEST_PROJECT)}&select=id`,
  { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } })
const [proj] = await projRes.json()
if (!proj) { console.error('ZZ-TEST not found — refusing.'); process.exit(1) }

mkdirSync('out/cx-export', { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 900 })
  await loginAs(page, adminCredentials())
  await openTestProject(page)
  await page.getByRole('button', { name: 'Cx Index', exact: true }).click()
  await waitUntil(async () => await page.locator('[data-unit-row]').count() >= 20 ? true : null,
    { timeout: 20000, what: 'the matrix to paint' })

  // ── PREMISE: the screen states a project % ────────────────────────────────
  // Locate the counts line by its own words — the page has many font-mono
  // spans and .first() resolved to an unrelated one on the first run.
  const topBar = await page.locator('span', { hasText: /columns · \d+ entries/ }).first().innerText()
  const m = topBar.match(/(\d+)% complete/)
  check(!!m, `the top bar states the project % (found "${topBar.trim()}")`)
  const screenPct = m ? m[1] : null

  // ── PDF ───────────────────────────────────────────────────────────────────
  const gen = await fetch(`${BASE_URL}/api/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ document: 'index', project_id: proj.id }),
  })
  const genJson = await gen.json()
  check(gen.ok && !!genJson.pdf_url, `document:'index' returns a signed URL (${gen.status})`)

  const pdfBytes = new Uint8Array(await (await fetch(genJson.pdf_url)).arrayBuffer())
  writeFileSync('out/cx-export/zz-cx-index.pdf', pdfBytes)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    pages.push(tc.items.map(i => i.str).join(' '))
  }
  const stamped = pages.filter(t => /reflects register at generation/.test(t)).length
  check(stamped === doc.numPages, `the D5 stamp is legible on every page (${stamped}/${doc.numPages})`)
  check(/COMMISSIONING INDEX/.test(pages[0]), 'the cover carries the title')
  check(/types complete of types in scope/.test(pages.join(' ')), 'the legend rides the document')
  check(screenPct !== null && pages[0].includes(`${screenPct}%`),
    `the cover prints the SCREEN'S project % (${screenPct}%)`)
  const groupsRes = await fetch(
    `${SB_URL}/rest/v1/project_cx_stage_groups?project_id=eq.${proj.id}&select=name&order=sort_order&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } })
  const [g0] = await groupsRes.json()
  check(!!g0 && pages.join(' ').includes(g0.name), `the first group ("${g0?.name}") prints as a chapter`)

  // ── XLSX (through the real button and a real browser download) ────────────
  const dl = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'Export Excel' }).click()
  const download = await dl
  const xlsxPath = 'out/cx-export/zz-cx-index.xlsx'
  await download.saveAs(xlsxPath)
  const { default: JSZip } = await import('jszip')
  const { readFileSync } = await import('node:fs')
  const zip = await JSZip.loadAsync(readFileSync(xlsxPath))
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string')
  const styles = await zip.file('xl/styles.xml').async('string')
  check(/state="frozen"/.test(sheet) && /xSplit="3" ySplit="2"/.test(sheet),
    'the pane freezes the identity columns and both header rows')
  check(/textRotation="90"/.test(styles), 'the headers rotate natively')
  check(/TEST-HP-1/.test(sheet), 'a real tag lands as a real cell value')
  check(/reflects register at generation/.test(sheet), 'the stamp is in the sheet')
  check(/<mergeCells count="/.test(sheet), 'the group bands merge')

  // ── REFUSAL: the allow-list refuses by name, never defaults ───────────────
  const bad = await fetch(`${BASE_URL}/api/generate-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ document: 'nope', project_id: proj.id }),
  })
  const badJson = await bad.json().catch(() => ({}))
  check(bad.status === 400 && /unknown document/.test(badJson.error ?? ''),
    `an unknown document kind is refused by name (${bad.status})`)
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await browser.close()
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. The paper and the workbook carry the screen's numbers.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
