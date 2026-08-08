// cal-finder.mjs — Phase 1 diagnosis: run the REAL finder against real sets.
//
//   node cal-finder.mjs            (needs `npm run dev` up)
//
// IT RUNS THE PRODUCTION MODULE, NOT A COPY. `src/lib/schedulePages.ts` is
// imported through the Vite dev server inside a real Chromium page — same
// pdfjs, same worker, same transform the app ships. A reimplementation here
// would diagnose the reimplementation.
//
// READ-ONLY ON SHARESYNC. It touches nothing but the gitignored copies under
// samples/calibration/, which the dev server happens to serve because they sit
// inside the project root.
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('cal-finder')

const BASE = process.env.CAL_BASE ?? 'http://localhost:5174'
const SETS = [
  { name: 'Workman IFT',      file: 'workman-IFT.pdf' },
  { name: 'Workman M-301',    file: 'workman-M301-TED.pdf' },
  { name: 'Clairlea Tender',  file: 'clairlea-tender.pdf' },
  { name: 'West Humber DWG',  file: 'westhumber-DWG-ReIFT.pdf' },
]

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', e => console.log('  PAGEERROR:', String(e).slice(0, 200)))
await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const out = []
for (const set of SETS) {
  process.stdout.write(`\n### ${set.name}\n`)
  const t0 = Date.now()
  const r = await page.evaluate(async (fileName) => {
    const mod = await import('/src/lib/schedulePages.ts')
    const res = await fetch('/samples/calibration/' + fileName)
    const buf = await res.arrayBuffer()
    const file = new File([buf], fileName, { type: 'application/pdf' })
    const scan = await mod.scanPdfPages(file)

    // Raw evidence per page, beyond the verdict — this is the taxonomy's
    // substance: what the text layer ACTUALLY contains on a page that failed.
    // A SECOND pdfjs instance, for evidence only. Vite pre-bundles the module's
    // own copy, so this one needs its worker pointed at explicitly. The
    // production module's instance is untouched.
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
    const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
    const detail = []
    for (const p of scan.pages) {
      const pg = await doc.getPage(p.page)
      const vp = pg.getViewport({ scale: 1 })
      const content = await pg.getTextContent()
      const items = content.items
      // rotation of the text itself: transform[1]/[2] non-zero => rotated glyphs
      let rotated = 0, tiny = 0
      let minH = 999, maxH = 0
      for (const it of items) {
        const t = it.transform
        if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) rotated++
        const h = Math.hypot(t[2], t[3])
        if (h && h < 5) tiny++
        if (h) { minH = Math.min(minH, h); maxH = Math.max(maxH, h) }
      }
      const ops = await pg.getOperatorList()
      detail.push({
        page: p.page, verdict: p.verdict, reason: p.reason, sheet: p.sheet,
        titled: p.titled, keywords: p.keywords, columnRuns: p.columnRuns,
        textItems: p.textItems,
        rotatedItems: rotated, tinyItems: tiny,
        minFont: items.length ? +minH.toFixed(1) : 0,
        maxFont: items.length ? +maxH.toFixed(1) : 0,
        pageRotation: pg.rotate,
        w: Math.round(vp.width), h: Math.round(vp.height),
        opCount: ops.fnArray.length,
        sampleText: items.slice(0, 40).map(i => i.str).join(' ').replace(/\s+/g, ' ').slice(0, 220),
      })
    }
    return { total: scan.total, truncated: scan.truncated, detail }
  }, set.file)

  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  const by = {}
  for (const d of r.detail) by[d.verdict] = (by[d.verdict] ?? 0) + 1
  console.log(`  ${r.total} pages read in ${secs}s — ` +
    Object.entries(by).map(([k, v]) => `${k}:${v}`).join(' · '))

  const proposed = r.detail.filter(d => d.verdict === 'schedule')
  const undecided = r.detail.filter(d => d.verdict === 'ambiguous' || d.verdict === 'scanned')
  console.log(`  proposed (verdict=schedule): ${proposed.length}` +
    (proposed.length ? ` -> pages ${proposed.map(d => d.page).join(', ')}` : ''))
  console.log(`  undecided (would go to the sorter): ${undecided.length}` +
    (undecided.length ? ` -> pages ${undecided.map(d => d.page).join(', ')}` : ''))

  // The pages a human would call schedules: any page whose TEXT mentions a
  // schedule title, regardless of what the filter decided. This is the "your
  // eyes on the PDF" column, approximated honestly and then checked by hand.
  const mentions = r.detail.filter(d => /SCHEDULE/i.test(d.sampleText) || d.titled)
  console.log(`  pages whose text mentions a schedule: ${mentions.length}` +
    (mentions.length ? ` -> ${mentions.map(d => d.page).join(', ')}` : ''))

  out.push({ set: set.name, file: set.file, ...r })
}

await mkdir('samples/calibration/_meta', { recursive: true })
await writeFile('samples/calibration/_meta/finder-after.json', JSON.stringify(out, null, 2))
console.log('\nwrote samples/calibration/_meta/finder-after.json')
await browser.close()
