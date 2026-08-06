// RENDER-AND-LOOK — page 1 of every PDF doc-palette-sweep produced, plus the
// greyscale companion.
//
// The sweep greps DOCX XML, which is the only artifact where colour is greppable
// text. The PDF is where a human decides whether the document is any good, and
// nothing automated substitutes for looking at it. This produces the images.
//
// The greyscale pass is not decoration: contractors print these on mono lasers,
// and BT.601 luma (0.299R + 0.587G + 0.114B) is what that driver applies. A
// monochrome document should look almost identical in both columns — if a pair
// differs, some colour is still doing structural work. Same weights as
// gen-greyscale-preview, for the same reason: an average would answer a question
// nobody asked.
//
// Run: node doc-palette-shots.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { chromium } from 'playwright'

const DIR = 'out/palette'
const SCALE = 2.0   // ~144 dpi against 72 dpi PDF user space

const FILES = {
  '/pdf.mjs': ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'text/javascript'],
  '/pdf.worker.mjs': ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'text/javascript'],
}
const server = createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (FILES[url]) { const [p, t] = FILES[url]; res.writeHead(200, { 'Content-Type': t }); res.end(readFileSync(p)) }
  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<canvas id="c"></canvas>') }
}).listen(0)
const port = server.address().port

const pdfs = readdirSync(DIR).filter(f => f.endsWith('.pdf')).sort()
if (!pdfs.length) { console.error('REFUSE: no PDFs in out/palette — run doc-palette-sweep first'); process.exit(1) }

mkdirSync(`${DIR}/shots`, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1900 } })
await page.goto(`http://127.0.0.1:${port}/`)

try {
  for (const f of pdfs) {
    const b64 = readFileSync(`${DIR}/${f}`).toString('base64')
    const shots = await page.evaluate(async ({ b64, scale }) => {
      const pdfjs = await import('/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const doc = await pdfjs.getDocument({ data: bytes }).promise
      const p = await doc.getPage(1)
      const vp = p.getViewport({ scale })
      const c = document.getElementById('c')
      c.width = vp.width; c.height = vp.height
      const ctx = c.getContext('2d', { willReadFrequently: true })
      await p.render({ canvasContext: ctx, viewport: vp, background: '#FFFFFF' }).promise
      const colour = c.toDataURL('image/png')
      // BT.601 luma — what a mono laser driver applies, not a channel average.
      const img = ctx.getImageData(0, 0, c.width, c.height)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        d[i] = d[i + 1] = d[i + 2] = y
      }
      ctx.putImageData(img, 0, 0)
      return { colour, grey: c.toDataURL('image/png'), pages: doc.numPages }
    }, { b64, scale: SCALE })

    const base = f.replace(/\.pdf$/, '')
    for (const [suffix, dataUrl] of [['', shots.colour], ['-grey', shots.grey]])
      writeFileSync(`${DIR}/shots/${base}${suffix}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log(`  · ${base}.png + ${base}-grey.png  (${shots.pages}pp)`)
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${pdfs.length} families rendered to ${DIR}/shots/ — colour and BT.601 greyscale.`)
console.log('A monochrome document should look the same in both. A pair that differs')
console.log('means some colour is still carrying structure.')
