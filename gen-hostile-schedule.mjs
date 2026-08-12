// gen-hostile-schedule — build the deliberately hostile benchmark fixture.
//
// WHY IT IS GENERATED AND COMMITTED. Every other schedule in the benchmark corpus
// is a real client document and therefore gitignored, which means a fresh clone
// can measure nothing. This one file is synthetic, carries no client content, and
// is committed — so the corpus always has at least one member and the benchmark
// can never report a pass on an empty run.
//
// WHAT MAKES IT HOSTILE. Every failure mode the Avondale incident and the
// calibration campaign actually produced, stacked into one sheet:
//
//   1. A MERGED BANNER sharing its row with a second-tier group header — the
//      exact shape that made `findTitle` discard "PUMPS" and let SERVICE type two
//      pumps as boilers.
//   2. A TWO-TIER HEADER: group headers over sub-headers, so the real column
//      names are on row 3 and row 2 is spans.
//   3. ALIEN COLUMN NAMES throughout. Not one of `EQPT NO.`, `DUTY`, `SERVES`,
//      `Q`, `TDH`, `PIPE SZ`, `PWR`, `SPD` appears in the deterministic synonym
//      lists. A rules-only reader can locate the tag by SHAPE and little else.
//   4. A GENUINE AMBIGUITY with no answer on the page: a bare `MBH` column on a
//      unit that has both an input and an output rating, and the sheet never says
//      which. The right behaviour is to extract it and ASK, never to guess.
//   5. A duty string that names the equipment it is attached to — `BOILER B-1
//      PRIMARY` — so anything reading duty as identity types a pump as a boiler.
//   6. A trailing NOTES row that is prose, not a unit.
//
// It is a curriculum, not a trap: every one of these is a thing the firm's real
// drawings do.
//
//   node gen-hostile-schedule.mjs
import JSZip from 'jszip'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = 'fixtures/extraction-bench'
mkdirSync(OUT, { recursive: true })

/** The sheet, as a grid. `null` is an empty cell; merges are declared below. */
const GRID = [
  // 1 — merged banner A1:F1, PLUS a second-tier group header at H1. Two non-empty
  //     cells on the banner row: the shape that broke the title fallback.
  ['PUMP SCHEDULE — MECHANICAL (M-501)', null, null, null, null, null, null, 'ELECTRICAL DATA', null, null],
  // 2 — tier-one group headers, spanning
  [null, null, null, 'PERFORMANCE', null, null, 'MOTOR', null, null, null],
  // 3 — the real header row, in a dialect no synonym list knows
  ['EQPT NO.', 'DUTY', 'SERVES', 'Q [USGPM]', 'TDH [FT WG]', 'PIPE SZ [IN]', 'PWR [BHP]', 'SPD [RPM]', 'V/PH/HZ', 'MBH'],
  // 4+ — units. HP-1's duty names the boiler it serves.
  ['HP-1', 'BOILER B-1 PRIMARY', 'HEATING LOOP',        79,  15, 4,   0.8, 1760, '115/1/60', 800],
  ['HP-2', 'BOILER B-2 PRIMARY', 'HEATING LOOP',        79,  15, 4,   0.8, 1760, '115/1/60', 800],
  ['SP-1', 'BUILDING SECONDARY', 'SCHOOL FACILITY',    130,  25, 6,   1.5, 1760, '208/3/60', null],
  ['SP-2', 'BUILDING SECONDARY', 'SCHOOL FACILITY',    130,  25, 6,   1.5, 1760, '208/3/60', null],
  // a prose tail that is not a unit
  ['NOTES: PROVIDE SUCTION DIFFUSER AND TRIPLE-DUTY VALVE ON EACH PUMP', null, null, null, null, null, null, null, null, null],
]

const MERGES = ['A1:F1', 'D2:F2', 'G2:I2']

// ── minimal OOXML ───────────────────────────────────────────────────────────
// Inline strings only: no sharedStrings part to keep in sync, and read-excel-file
// reads them the same way. Numbers stay numeric so the reader hands back numbers,
// which is what the parser's grid contract expects.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const colName = i => {
  let n = i + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

const rowsXml = GRID.map((row, r) => {
  const cells = row.map((v, c) => {
    if (v === null || v === undefined || v === '') return ''
    const ref = `${colName(c)}${r + 1}`
    return typeof v === 'number'
      ? `<c r="${ref}"><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
  }).join('')
  return `<row r="${r + 1}">${cells}</row>`
}).join('')

const sheetXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<sheetData>${rowsXml}</sheetData>` +
  `<mergeCells count="${MERGES.length}">${MERGES.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` +
  `</worksheet>`

const zip = new JSZip()
zip.file('[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
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
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  `<sheets><sheet name="PUMPS" sheetId="1" r:id="rId1"/></sheets></workbook>`)
zip.folder('xl').folder('_rels').file('workbook.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
  `</Relationships>`)
// The reader resolves styles and sharedStrings through the workbook rels; real
// Excel always writes both, and omitting them makes the parse throw rather than
// degrade. Empty-but-valid is enough — every string here is inline.
zip.folder('xl').file('styles.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="0"/>` +
  `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
  `<borders count="1"><border/></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
  `</styleSheet>`)
zip.folder('xl').file('sharedStrings.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>`)
zip.folder('xl').folder('worksheets').file('sheet1.xml', sheetXml)

const buf = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync(`${OUT}/hostile-schedule.xlsx`, buf)
console.log(`wrote ${OUT}/hostile-schedule.xlsx (${buf.length} bytes)`)
console.log(`  ${GRID.length} rows · ${MERGES.length} merges · 4 units + 1 prose tail`)
