// Greyscale print preview — the minutes topic bands are the judgment call, and
// greyscale is how contractors actually print these. Renders page 1 of each
// minutes PDF at print resolution, in colour and in greyscale, so the four
// images compare directly.
//
// Greyscale uses the ITU-R BT.601 luma weights a mono laser driver applies
// (0.299R + 0.587G + 0.114B), not a naive channel average — the entire question
// is whether purple and navy land at DIFFERENT luminance, and an average would
// answer a question nobody asked.
//
// pdf.js is served to the page over a tiny local static route so its ESM build
// and its worker both load with real URLs (addScriptTag with inline module text
// cannot resolve the worker).
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { chromium } from 'playwright'

const FILES = {
  '/pdf.mjs': ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'text/javascript'],
  '/pdf.worker.mjs': ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'text/javascript'],
}
const server = createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (FILES[url]) {
    const [p, type] = FILES[url]
    res.writeHead(200, { 'Content-Type': type }); res.end(readFileSync(p))
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<canvas id="c"></canvas>')
  }
}).listen(0)
const port = server.address().port

const SCALE = 2.0   // ~144 dpi against 72 dpi PDF user space
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1900 } })
await page.goto(`http://127.0.0.1:${port}/`)

try {
  for (const variant of ['navy', 'converged']) {
    const b64 = readFileSync(`out/${variant}-minutes.pdf`).toString('base64')

    const shots = await page.evaluate(async ({ b64, SCALE, port }) => {
      const lib = await import(`http://127.0.0.1:${port}/pdf.mjs`)
      lib.GlobalWorkerOptions.workerSrc = `http://127.0.0.1:${port}/pdf.worker.mjs`
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const doc = await lib.getDocument({ data: bin }).promise
      const p = await doc.getPage(1)
      const vp = p.getViewport({ scale: SCALE })
      const c = document.getElementById('c')
      c.width = vp.width; c.height = vp.height
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await p.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise
      const colour = c.toDataURL('image/png')

      const img = ctx.getImageData(0, 0, c.width, c.height)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        d[i] = d[i + 1] = d[i + 2] = y
      }
      ctx.putImageData(img, 0, 0)
      return { colour, grey: c.toDataURL('image/png'), pages: doc.numPages }
    }, { b64, SCALE, port })

    for (const tag of ['colour', 'grey']) {
      const buf = Buffer.from(shots[tag].split(',')[1], 'base64')
      writeFileSync(`out/${variant}-minutes-p1-${tag}.png`, buf)
      console.log(`  · out/${variant}-minutes-p1-${tag}.png (${(buf.length / 1024).toFixed(0)} kB)`)
    }
  }
} finally {
  await browser.close(); server.close()
}

// The number the greyscale decision actually turns on.
const luma = h => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b
}
const n = luma('#1F3A5F'), p = luma('#443C8F'), v = luma('#E8432D')
console.log('\nBT.601 luma on 0–255 (lower = darker in mono):')
console.log(`  navy      #1F3A5F → ${n.toFixed(1)}`)
console.log(`  purple    #443C8F → ${p.toFixed(1)}   delta vs navy ${(p - n).toFixed(1)}`)
console.log(`  vermilion #E8432D → ${v.toFixed(1)}   ← why it must stay an accent`)
console.log(`  white band text is #FFF (255) — contrast on the band, mono:`)
for (const [name, val] of [['navy', n], ['purple', p], ['vermilion', v]]) {
  const ratio = ((255 + 12.75) / (val + 12.75)).toFixed(2)
  console.log(`    white on ${name.padEnd(9)} ≈ ${ratio}:1 (rough luma proxy, not WCAG)`)
}
