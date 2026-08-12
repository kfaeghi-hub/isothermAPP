// gen-multisheet-fixture — build the workbook 5a's gate asks for. [KEEL]
//
// The gate names its contents: a MULTI-SHEET workbook including VAV-lvl1 (which
// the rules leg types 0/29 and takes ~105s with a content retry) and ONE CHUNKED
// SHEET (FanCoils, 199x52, which cannot fit in a single answer).
//
// IT IS BUILT FROM CLIENT FILES AND THEREFORE GITIGNORED. The generator is
// committed so the fixture is reproducible; the workbook is not, and the gate that
// uses it skips loudly by name when it is absent — the calibration FIXTURES.md
// rule, applied again.
//
//   node gen-multisheet-fixture.mjs
import JSZip from 'jszip'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SRC = 'samples/seneca-import/equ-schedules'
const OUT = 'samples/multisheet-fixture.xlsx'

// Three sheets, each chosen for what it exercises.
const SHEETS = [
  { name: 'PUMPS',  file: 'Pumps.xlsx',      why: 'an ordinary sheet — the control' },
  { name: 'VAV',    file: 'VAV-lvl1.xlsx',   why: 'rules type 0/29; slow, with a content retry' },
  { name: 'COILS',  file: 'FanCoils.xlsx',   why: '199x52 — must be read in bands' },
]

const missing = SHEETS.filter(s => !existsSync(`${SRC}/${s.file}`)).map(s => s.file)
if (missing.length) {
  console.log('SKIPPED — client schedules absent (gitignored):', missing.join(', '))
  console.log('This is a skip, not a pass. Restore from ShareSync to build the fixture.')
  process.exit(0)
}

const readXlsxFile = (await import('read-excel-file/node')).default

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const colName = i => {
  let n = i + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}
const sheetXml = (grid) => {
  const rows = grid.map((row, r) => {
    const cells = (row ?? []).map((v, c) => {
      if (v === null || v === undefined || v === '') return ''
      const ref = `${colName(c)}${r + 1}`
      return typeof v === 'number'
        ? `<c r="${ref}"><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows}</sheetData></worksheet>`
}

const zip = new JSZip()
const grids = []
for (const s of SHEETS) {
  const sheets = await readXlsxFile(readFileSync(`${SRC}/${s.file}`), { trim: true })
  grids.push(sheets[0].data)
}

zip.file('[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  SHEETS.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
  `</Types>`)
zip.folder('_rels').file('.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`)
zip.folder('xl').file('workbook.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
  SHEETS.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
  `</sheets></workbook>`)
zip.folder('xl').folder('_rels').file('workbook.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  SHEETS.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
  `<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rIdSS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
  `</Relationships>`)
zip.folder('xl').file('styles.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="0"/><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`)
zip.folder('xl').file('sharedStrings.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>`)
grids.forEach((g, i) => zip.folder('xl').folder('worksheets').file(`sheet${i + 1}.xml`, sheetXml(g)))

const buf = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync(OUT, buf)
console.log(`wrote ${OUT} (${(buf.length / 1024).toFixed(0)} KB)`)
for (const [i, s] of SHEETS.entries()) {
  console.log(`  ${s.name.padEnd(7)} ${String(grids[i].length).padStart(4)} rows × ${Math.max(...grids[i].map(r => r.length))} cols — ${s.why}`)
}
