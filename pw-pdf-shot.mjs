// Render a generated PDF to PNGs so the layout can actually be eyeballed.
// Chromium refuses to render file:// PDFs (it downloads them), so we inline the real PDF
// bytes and let pdf.js rasterise them in-page. This is a render of the ACTUAL output,
// not a re-render of the source HTML.
//
// Usage: node pw-pdf-shot.mjs out/completed.pdf 3
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file  = process.argv[2]
const pages = Number(process.argv[3] ?? 2)
const stem  = file.replace(/[\\/]/g, '-').replace(/\.pdf$/, '')

const pdfB64 = readFileSync(file).toString('base64')
const pdfjs  = 'file:///' + resolve('node_modules/pdfjs-dist/build/pdf.mjs').replace(/\\/g, '/')
const worker = 'file:///' + resolve('node_modules/pdfjs-dist/build/pdf.worker.mjs').replace(/\\/g, '/')

const html = `<!doctype html><html><body style="margin:0;background:#888;">
<div id="out"></div>
<script type="module">
  import * as pdfjsLib from '${pdfjs}';
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${worker}';
  const raw = atob("${pdfB64}");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
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
</script></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 1000 })
await page.setContent(html)
await page.waitForFunction('window.__done === true', { timeout: 60000 })

const total = await page.evaluate(() => window.__pages)
console.log(`${file}: ${total} page(s)`)

for (let p = 1; p <= Math.min(total, pages); p++) {
  const el = page.locator(`#page${p}`)
  if (await el.count() === 0) break
  await el.screenshot({ path: `${stem}-p${p}.png` })
  console.log(`  wrote ${stem}-p${p}.png`)
}

await browser.close()
