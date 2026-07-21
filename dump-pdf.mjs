// PDF layout dumper (IEL path): pdf.js text items grouped into rows by
// y-position (per page), cells by x-gap. Exports pdfRows() for the audit
// harness; CLI emits R<n> P/T lines compatible with the dump grammar.
// The .doc masters are authoritative but Word COM is blocked (add-in hang);
// the PDF render twins carry identical content.
// Usage: node dump-pdf.mjs <file.pdf>
import { readFileSync } from 'node:fs'

export async function pdfRows(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableWorker: true }).promise
  const rows = []
  let rn = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const items = tc.items
      .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }))
      .filter(i => i.str.trim())
    const lines = []
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find(l => Math.abs(l.y - it.y) < 2.5)
      if (line) line.items.push(it)
      else lines.push({ y: it.y, items: [it] })
    }
    for (const line of lines) {
      const sorted = line.items.sort((a, b) => a.x - b.x)
      const cells = []
      let cur = null
      for (const it of sorted) {
        if (cur && it.x - cur.end > 12) { cells.push(cur.text); cur = null }
        if (!cur) cur = { text: it.str, end: it.x + it.w }
        else { cur.text += (it.x - cur.end > 1 ? ' ' : '') + it.str; cur.end = it.x + it.w }
      }
      if (cur) cells.push(cur.text)
      rn++
      rows.push({ r: rn, page: p, kind: cells.length > 1 ? 'T' : 'P', cells: cells.map(c => c.trim()) })
    }
  }
  return rows
}

// Page furniture every IEL sheet repeats; the audit harness filters these
// (numbering preserved), the generator ignores them.
export const PDF_FURNITURE = [
  /^Isotherm Engineering Ltd\.$/i,
  /Page \d+ of \d+$/i,
  /^Version \d/i,
  /^st$/, // superscript artifact of "1st"
  /^Comments:$/i, // per-bank comments row (instance notes field) — Word-mode analog
]
export const isPdfFurniture = cells =>
  PDF_FURNITURE.some(re => re.test(cells[0] ?? '')) ||
  (cells.length === 2 && /Page \d+ of \d+/.test(cells[1] ?? ''))

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('dump-pdf.mjs') && process.argv[2]) {
  const rows = await pdfRows(process.argv[2])
  let lastPage = 0
  for (const row of rows) {
    if (row.page !== lastPage) { console.log(`# page ${row.page}`); lastPage = row.page }
    console.log(`R${row.r} ${row.kind}: ${row.cells.map(c => JSON.stringify(c)).join(' | ')}`)
  }
}
