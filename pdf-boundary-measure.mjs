// MEASURE the page-boundary geometry instead of arguing about it.
//
// Three plausible causes were tested and all three failed to fix the defect
// (bigger margin, separate borders, repeating tfoot spacer). At that point more
// hypotheses are worth less than numbers, so this rasterises each page and scans
// pixel rows for horizontal rules — a rule being a scanline where most of the
// table's width is dark.
//
// It reports, per page: the y of every horizontal rule, the y of the lowest ink
// of any kind, the content-box bottom implied by the print margin, and the gap
// between them. If the last row's border is being clipped, the lowest rule sits
// ABOVE the lowest text. If the border is simply not painted at a fragment
// break, the lowest rule sits above the lowest text by exactly one row height.
//
// Run: node pdf-boundary-measure.mjs <file.pdf> [--pages 1,2,3] [--marginbottom 0.55]

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.log('usage: pdf-boundary-measure.mjs <file.pdf> [--pages 1,2] [--marginbottom 0.55]'); process.exit(1) }
const argN = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const argS = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const MARGIN_IN = argN('--marginbottom', 0.55)
// px the footer's rule is sunk into the reserved band. Content may enter the
// allowance ABOVE that rule — that is what the allowance is for. A violation is
// ink reaching the footer's own rule, not ink crossing the content edge.
const INK_OFFSET = argN('--inkoffset', 0)
const WANT = argS('--pages', '').split(',').filter(Boolean).map(Number)

const bytes = [...readFileSync(file)]
const ASSETS = {
  '/index.html': { ct: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0">' },
  '/pdf.mjs': { ct: 'text/javascript', body: readFileSync('node_modules/pdfjs-dist/build/pdf.mjs') },
  '/pdf.worker.mjs': { ct: 'text/javascript', body: readFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs') },
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
await page.route('**/*', r => {
  const a = ASSETS[new URL(r.request().url()).pathname]
  a ? r.fulfill({ status: 200, contentType: a.ct, body: a.body }) : r.fulfill({ status: 404, body: '' })
})
await page.goto('http://pdf.local/index.html')
const count = await page.evaluate(async ({ bytes }) => {
  const pdfjs = await import('/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
  window.__doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  return window.__doc.numPages
}, { bytes })

const pages = WANT.length ? WANT : Array.from({ length: count }, (_, i) => i + 1)
console.log(`${file} — ${count} page(s); print margin-bottom ${MARGIN_IN}in = ${(MARGIN_IN * 96).toFixed(1)}px @96dpi\n`)

for (const n of pages) {
  const m = await page.evaluate(async ({ n }) => {
    const S = 2
    document.body.innerHTML = ''
    const p = await window.__doc.getPage(n)
    const vp = p.getViewport({ scale: S })
    const c = document.createElement('canvas')
    c.width = vp.width; c.height = vp.height
    document.body.appendChild(c)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    await p.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const W = c.width, H = c.height
    const rules = [], inkRows = []
    for (let y = 0; y < H; y++) {
      let dark = 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        if (d[i] < 200 && d[i + 1] < 200 && d[i + 2] < 200) dark++
      }
      if (dark > 0) inkRows.push(y)
      if (dark > W * 0.55) rules.push(y)          // a full-width horizontal rule
    }
    // collapse adjacent scanlines into single rules
    const merged = []
    for (const y of rules) {
      if (merged.length && y - merged[merged.length - 1].end <= 2) merged[merged.length - 1].end = y
      else merged.push({ start: y, end: y })
    }
    return {
      h: H / S,
      rules: merged.map(r => +((r.start + r.end) / 2 / S).toFixed(1)),
      lowestInk: inkRows.length ? +(inkRows[inkRows.length - 1] / S).toFixed(1) : null,
    }
  }, { n })

  const contentBottom = m.h - MARGIN_IN * 96
  // the footer band lives below contentBottom; ignore rules/ink inside it
  const inContent = m.rules.filter(r => r < contentBottom - 1)
  const lastRule = inContent.length ? inContent[inContent.length - 1] : null
  const inkTop = contentBottom + INK_OFFSET
  const footerRules = m.rules.filter(r => r >= inkTop - 1)
  const inAllowance = m.rules.filter(r => r >= contentBottom - 1 && r < inkTop - 1)
  console.log(`page ${n}  height ${m.h}px   content box ends at ${contentBottom.toFixed(1)}px   footer rule at ${inkTop.toFixed(1)}px`)
  console.log(`   last rule INSIDE content : ${lastRule ?? '—'}`)
  console.log(`   gap from last rule to content bottom : ${lastRule ? (contentBottom - lastRule).toFixed(1) : '—'}px`)
  console.log(`   rules in the ALLOWANCE (ok) : ${inAllowance.length ? inAllowance.join(', ') : 'none'}`)
  console.log(`   rules in the FOOTER band : ${footerRules.length ? footerRules.join(', ') : 'none'}`)
  console.log(`   lowest ink anywhere : ${m.lowestInk}  (${m.lowestInk > contentBottom ? 'BELOW content bottom → in the footer zone' : 'inside content box'})`)
}
await browser.close()
