// Render a generated PDF to PNGs so the layout can actually be eyeballed.
// pdf.js is ESM and file:// module imports are CORS-blocked, so we serve the
// library and the PDF through Playwright route interception (same-origin).
// This rasterises the ACTUAL PDF bytes — not a re-render of the source HTML.
//
// Usage: node pw-pdf-shot.mjs out/completed.pdf 3
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file  = process.argv[2]
const pages = Number(process.argv[3] ?? 2)
const stem  = file.replace(/[\\/]/g, '-').replace(/\.pdf$/, '')

const pdfBytes = readFileSync(file)
const pdfMjs   = readFileSync(resolve('node_modules/pdfjs-dist/build/pdf.mjs'))
const workerMjs = readFileSync(resolve('node_modules/pdfjs-dist/build/pdf.worker.mjs'))

const html = `<!doctype html><html><body style="margin:0;background:#888;">
<div id="out"></div>
<script type="module">
  import * as pdfjsLib from '/lib/pdf.mjs';
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.mjs';
  try {
    const res = await fetch('/doc.pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    window.__pages = doc.numPages;
    const out = document.getElementById('out');
    for (let p = 1; p <= Math.min(doc.numPages, ${pages}); p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      canvas.id = 'page' + p;
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto 12px';
      out.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
    window.__done = true;
  } catch (e) { window.__error = String(e); }
</script></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 1100 })

await page.route('**/*', route => {
  const url = new URL(route.request().url())
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html })
  if (url.pathname === '/lib/pdf.mjs') return route.fulfill({ contentType: 'text/javascript', body: pdfMjs })
  if (url.pathname === '/lib/pdf.worker.mjs') return route.fulfill({ contentType: 'text/javascript', body: workerMjs })
  if (url.pathname === '/doc.pdf') return route.fulfill({ contentType: 'application/pdf', body: pdfBytes })
  return route.fulfill({ status: 404, body: 'nope' })
})

await page.goto('http://pdfshot.local/')
await page.waitForFunction('window.__done === true || window.__error', { timeout: 60000 })
const err = await page.evaluate(() => window.__error)
if (err) { console.error('pdf.js error:', err); await browser.close(); process.exit(1) }

const total = await page.evaluate(() => window.__pages)
console.log(`${file}: ${total} page(s)`)
for (let p = 1; p <= Math.min(total, pages); p++) {
  const el = page.locator(`#page${p}`)
  if (await el.count() === 0) break
  await el.screenshot({ path: `${stem}-p${p}.png` })
  console.log(`  wrote ${stem}-p${p}.png`)
}
await browser.close()
