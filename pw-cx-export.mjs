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
  // pdf.js splits text runs at ligatures — page 1's footer arrives as
  // "…— re" + "fl" + "ects register…", and a space-join turns "reflects" into
  // "re fl ects" (first run failed exactly here, on all 193 pages at once —
  // the PDF was right and the join was wrong). The stamp test collapses
  // whitespace away; the readability join stays for the other assertions.
  const flat = (t) => t.replace(/\s+/g, '')
  const stamped = pages.filter(t => /reflectsregisteratgeneration/.test(flat(t))).length
  check(stamped === doc.numPages, `the D5 stamp is legible on every page (${stamped}/${doc.numPages})`)
  check(/COMMISSIONING INDEX/.test(pages[0]), 'the cover carries the title')
  check(/Prepared by/.test(pages[0]), 'the cover is a submittal cover (Prepared by block)')
  check(/types complete of types in scope/.test(pages.join(' ')), 'the legend rides the document')
  check(screenPct !== null && pages[0].includes(`${screenPct}%`),
    `the cover prints the SCREEN'S project % (${screenPct}%)`)
  const groupsRes = await fetch(
    `${SB_URL}/rest/v1/project_cx_stage_groups?project_id=eq.${proj.id}&select=name&order=sort_order&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } })
  const [g0] = await groupsRes.json()
  check(!!g0 && pages.join(' ').includes(g0.name), `the first group ("${g0?.name}") prints in a strip band`)

  // ── THE STATS INVARIANT (Phase 2b): every strip page carries the per-column
  // stats row — tfoot repeats like thead. Tolerance of 2: the cover, and a
  // possible closing-only final page.
  const statsPages = pages.filter(t => /PER COLUMN/.test(t)).length
  check(statsPages >= doc.numPages - 2,
    `the per-column stats row rides every strip page (${statsPages}/${doc.numPages})`)
  check(/End of Commissioning Index/.test(pages[pages.length - 1]),
    'the document ends deliberately (closing block on the final page)')

  // ── AMENDMENT 2, physically: colour landed in the deployed render AND the
  // drawn mark survives inside the fill — white-on-teal is what makes the
  // grayscale (BT.601: 255 vs ~86) still read complete. Rasterize a strip
  // page and demand a teal pixel with a near-white pixel in its neighbourhood.
  {
    const { createServer } = await import('node:http')
    const { readFileSync } = await import('node:fs')
    const SRV = {
      '/pdf.mjs': 'node_modules/pdfjs-dist/build/pdf.min.mjs',
      '/pdf.worker.mjs': 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    }
    const server = createServer((rq, rs) => {
      if (SRV[rq.url]) { rs.writeHead(200, { 'Content-Type': 'text/javascript' }); rs.end(readFileSync(SRV[rq.url])) }
      else { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end('<canvas id="c"></canvas>') }
    }).listen(0)
    const rasterPage = await browser.newPage()
    try {
      await rasterPage.goto(`http://127.0.0.1:${server.address().port}/`)
      // Scan strip pages until a done cell is in the raster window — the test
      // register's few entries sit at unpredictable coordinates.
      let found = { teal: false, markOnFill: false, page: 0 }
      const b64 = Buffer.from(pdfBytes).toString('base64')
      for (let pn = 2; pn <= Math.min(doc.numPages, 12) && !found.markOnFill; pn++) {
        const r = await rasterPage.evaluate(async ({ b64, port, pn }) => {
          const lib = await import(`http://127.0.0.1:${port}/pdf.mjs`)
          lib.GlobalWorkerOptions.workerSrc = `http://127.0.0.1:${port}/pdf.worker.mjs`
          const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
          const d = await lib.getDocument({ data: bin }).promise
          const p = await d.getPage(pn)
          const vp = p.getViewport({ scale: 1.5 })
          const c = document.getElementById('c')
          c.width = vp.width; c.height = vp.height
          const ctx = c.getContext('2d')
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
          await p.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise
          const img = ctx.getImageData(0, 0, c.width, c.height).data
          const W = c.width
          const isTeal = (i) => Math.abs(img[i] - 15) < 30 && Math.abs(img[i + 1] - 118) < 30 && Math.abs(img[i + 2] - 110) < 30
          const isWhite = (i) => img[i] > 235 && img[i + 1] > 235 && img[i + 2] > 235
          let teal = false, markOnFill = false
          for (let y = 0; y < c.height && !markOnFill; y += 2) {
            for (let x = 0; x < W && !markOnFill; x += 2) {
              const i = (y * W + x) * 4
              if (!isTeal(i)) continue
              teal = true
              for (let dy = -6; dy <= 6 && !markOnFill; dy += 2)
                for (let dx = -6; dx <= 6; dx += 2) {
                  const j = ((y + dy) * W + (x + dx)) * 4
                  if (j >= 0 && j < img.length && isWhite(j)) { markOnFill = true; break }
                }
            }
          }
          return { teal, markOnFill }
        }, { b64, port: server.address().port, pn })
        if (r.teal) found = { ...r, page: pn }
      }
      check(found.teal, `Amendment 2 colour landed in the deployed render (teal done-fill, page ${found.page || '—'})`)
      check(found.markOnFill,
        'the drawn mark rides the fill — white-in-teal, so BT.601 grayscale (255 vs ~86) still reads')
    } finally {
      await rasterPage.close()
      server.close()
    }
  }

  // ── XLSX (through the real button and a real browser download) ────────────
  const dl = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'Export Excel' }).click()
  const download = await dl
  const xlsxPath = 'out/cx-export/zz-cx-index.xlsx'
  await download.saveAs(xlsxPath)
  const { default: JSZip } = await import('jszip')
  const { readFileSync } = await import('node:fs')
  const zip = await JSZip.loadAsync(readFileSync(xlsxPath))
  const workbook = await zip.file('xl/workbook.xml').async('string')
  const summary = await zip.file('xl/worksheets/sheet1.xml').async('string')
  const sheet = await zip.file('xl/worksheets/sheet2.xml').async('string')
  const styles = await zip.file('xl/styles.xml').async('string')
  check(/state="frozen"/.test(sheet) && /xSplit="3" ySplit="2"/.test(sheet),
    'the pane freezes the identity columns and both header rows')
  check(/textRotation="90"/.test(styles), 'the headers rotate natively')
  check(/TEST-HP-1/.test(sheet), 'a real tag lands as a real cell value')
  check(/reflects register at generation/.test(sheet), 'the stamp is in the sheet')
  check(/<mergeCells count="/.test(sheet), 'the group bands merge')
  // Phase 2b — the submittal-grade assertions, including the reconciled print setup:
  check(workbook.indexOf('name="Summary"') >= 0 &&
        workbook.indexOf('name="Summary"') < workbook.indexOf('name="Cx Index"'),
    'the Summary sheet is the first tab (§3.2, reconciled)')
  check(/Prepared by Isotherm Engineering Ltd\./.test(summary), 'the Summary carries the cover block')
  check(/<pageSetup paperSize="1" orientation="landscape" fitToWidth="1"/.test(sheet) &&
        /<sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr>/.test(sheet),
    'a REAL print setup exists (landscape, fit-to-width) — the reconciled finding')
  check(/_xlnm\.Print_Titles/.test(workbook) && /'Cx Index'!\$1:\$2/.test(workbook),
    'Print_Titles repeats both header rows')
  check(/_xlnm\.Print_Area/.test(workbook), 'the print area is bounded')
  check(/<autoFilter ref="A2:/.test(sheet), 'an AutoFilter is armed on the header row')
  check(/FF0F766E/.test(styles) && /FFFBBF24/.test(styles) && /FFE2E8F0/.test(styles),
    'Amendment 2 fills ride styles.xml (teal, amber, band palette)')

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
