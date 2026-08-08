// PDF → PNG page images, so a paging defect can be LOOKED AT rather than argued.
//
// There is no pdftoppm / mutool / ghostscript on this machine, and pdfjs in Node
// needs a native canvas. So the PDF is rasterised inside Chromium itself: pdfjs
// renders each page to a <canvas>, and Playwright screenshots it. No new
// dependency, and the renderer is the same engine that produced the file.
//
// --bottom N crops each page to its last N CSS px, which is the only part of the
// page this bug lives in: the seam where the last table row meets the footer.
// A full-page thumbnail is too small to see a missing 1px border; the crop is
// not a nicety, it is the difference between seeing the defect and not.
//
// Run: node pdf-page-shots.mjs <file.pdf> <outdir> [--bottom 260] [--scale 2]

import { chromium } from 'playwright'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const [file, outdir] = process.argv.slice(2)
if (!file || !outdir) { console.log('usage: pdf-page-shots.mjs <file.pdf> <outdir> [--bottom N] [--scale N]'); process.exit(1) }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const BOTTOM = arg('--bottom', 0)
const TOP    = arg('--top', 0)
const SCALE  = arg('--scale', 2)

mkdirSync(outdir, { recursive: true })
const bytes = [...readFileSync(file)]

// Chromium refuses file:// module imports from a file:// page ("Not allowed to
// load local resource"), so pdfjs and its worker are served from memory over a
// fake http origin via request interception. No server process, no network.
const ASSETS = {
  '/index.html': { ct: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0">' },
  '/pdf.mjs': { ct: 'text/javascript', body: readFileSync('node_modules/pdfjs-dist/build/pdf.mjs') },
  '/pdf.worker.mjs': { ct: 'text/javascript', body: readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs') },
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } })
page.on('console', m => { if (m.type() === 'error') console.error('  page error:', m.text()) })
await page.route('**/*', route => {
  const path = new URL(route.request().url()).pathname
  const a = ASSETS[path]
  if (!a) return route.fulfill({ status: 404, body: 'no' })
  route.fulfill({ status: 200, contentType: a.ct, body: a.body })
})
await page.goto('http://pdf.local/index.html')

const count = await page.evaluate(async ({ bytes }) => {
  const pdfjs = await import('/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  window.__doc = doc
  return doc.numPages
}, { bytes })

console.log(`${count} page(s)`)
for (let n = 1; n <= count; n++) {
  const box = await page.evaluate(async ({ n, SCALE }) => {
    document.body.innerHTML = ''
    document.body.style.margin = '0'
    const p = await window.__doc.getPage(n)
    const vp = p.getViewport({ scale: SCALE })
    const c = document.createElement('canvas')
    c.width = vp.width; c.height = vp.height
    c.style.width = `${vp.width / SCALE}px`; c.style.height = `${vp.height / SCALE}px`
    c.style.display = 'block'
    document.body.appendChild(c)
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#ffffff' }).promise
    return { w: vp.width / SCALE, h: vp.height / SCALE }
  }, { n, SCALE })

  await page.setViewportSize({ width: Math.ceil(box.w), height: Math.ceil(box.h) })
  const clip = TOP
    ? { x: 0, y: 0, width: box.w, height: Math.min(TOP, box.h) }
    : BOTTOM
      ? { x: 0, y: Math.max(0, box.h - BOTTOM), width: box.w, height: Math.min(BOTTOM, box.h) }
      : undefined
  const out = `${outdir}/p${String(n).padStart(2, '0')}${TOP ? '-top' : BOTTOM ? '-bottom' : ''}.png`
  writeFileSync(out, await page.screenshot({ clip }))
  console.log(`  ${out}`)
}
await browser.close()
