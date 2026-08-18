// CX-INDEX XLSX — a real workbook, built in the browser, never crossing the
// wire (Phase 2 of CX-INDEX-EXPORT-PROPOSAL.md; reworked to submittal grade in
// Phase 2b from the owner's cell-level audit).
//
// What "real" means here, each item ruled:
//   · REAL CELLS — statuses as text values, filterable and pivotable, with an
//     AutoFilter armed on the header row (Phase 2b).
//   · COMPUTED VALUES, NOT FORMULAS: a client's Excel must not recompute
//     different numbers than the issued PDF beside it. Percentages and the
//     per-column stats are literal values from the same cx-counting module the
//     screen and the PDF read (statLabel: unit n/N, type K/N).
//   · A SUMMARY SHEET as the first tab (the PDF cover's sibling — §3.2's
//     promise, dropped silently in the first cut and reconciled in 2b):
//     project block, group percentages, legend, stamp.
//   · FULL PRINT SETUP (the reconciled finding: the first cut wrote an
//     oddFooter and the gate report claimed a print footer; Excel never showed
//     one because the sheet carried no pageSetup at all): landscape,
//     fit-to-width, Print_Titles repeating both header rows, a bounded
//     Print_Area, and the D5 stamp as a real print footer — read back through
//     COM, not trusted from the XML.
//   · AMENDMENT 2 COLOUR: the 12 band fills and teal/amber status fills via
//     styles.xml patternFills — redundant encoding; the text values carry the
//     status on their own.
//   · FROZEN PANES echoing the sticky work; NATIVE ROTATED HEADERS
//     (textRotation 90).
//
// Inline strings throughout (the dev-fixture precedent). Structural gate: the
// battery unzips and greps; the human gate opens it in real Excel (COM) — and
// LibreOffice wherever one exists.

import JSZip from 'jszip'
import { classifyCell, columnStat, rollup, statLabel } from './cxCounting'
import type { CellCount, ColumnStat } from './cxCounting'

export interface XlsxColumn { id: string; label: string; scope: 'unit' | 'type' }
export interface XlsxGroup { name: string; columns: XlsxColumn[] }
export interface XlsxUnit {
  id: string
  tag: string | null
  descriptor: string | null
  category: string | null
  equipment_type: string | null
}
export interface CxIndexXlsxInput {
  projectName: string
  comNumber?: string | null
  clientName?: string | null
  address?: string | null
  groups: XlsxGroup[]
  equipment: XlsxUnit[]
  cells: Map<string, string>
  na: Set<string>
  generatedStamp: string
}

const X = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

function colRef(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

const IDENTITY_COLS = 3

// ── Amendment 2 palette (ARGB), mirroring the export family ──────────────────
const BAND_FILLS: Array<{ bg: string; text: string }> = [
  { bg: 'FFE2E8F0', text: 'FF1E293B' }, { bg: 'FFBAE6FD', text: 'FF0C4A6E' },
  { bg: 'FFA5F3FC', text: 'FF164E63' }, { bg: 'FFFDE68A', text: 'FF78350F' },
  { bg: 'FFFCD34D', text: 'FF451A03' }, { bg: 'FFDDD6FE', text: 'FF4C1D95' },
  { bg: 'FFFEF08A', text: 'FF713F12' }, { bg: 'FFFED7AA', text: 'FF7C2D12' },
  { bg: 'FFFDBA74', text: 'FF431407' }, { bg: 'FFFECDD3', text: 'FF881337' },
  { bg: 'FFA7F3D0', text: 'FF064E3B' }, { bg: 'FF86EFAC', text: 'FF052E16' },
]
const DONE_ARGB = 'FF0F766E'   // teal-700
const PROG_ARGB = 'FFFBBF24'   // amber-400
const NA_ARGB   = 'FFF3F4F6'   // gray-100

// Style indices — fixed part of cellXfs, then 12 band styles appended.
const S = {
  default: 0, bold: 1, rotated: 2, category: 3, stats: 4, stamp: 5,
  statusDone: 6, statusProg: 7, statusNa: 8, statusPlain: 9,
  summaryKey: 10, summaryVal: 11, title: 12,
  bandBase: 13, // 13..24 = the 12 band styles
} as const

function stylesXml(): string {
  const fills = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="${DONE_ARGB}"/><bgColor indexed="64"/></patternFill></fill>`,   // 4
    `<fill><patternFill patternType="solid"><fgColor rgb="${PROG_ARGB}"/><bgColor indexed="64"/></patternFill></fill>`,   // 5
    `<fill><patternFill patternType="solid"><fgColor rgb="${NA_ARGB}"/><bgColor indexed="64"/></patternFill></fill>`,     // 6
    ...BAND_FILLS.map(b =>
      `<fill><patternFill patternType="solid"><fgColor rgb="${b.bg}"/><bgColor indexed="64"/></patternFill></fill>`),     // 7..18
  ]
  const fonts = [
    `<font><sz val="9"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="9"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="8"/><name val="Calibri"/></font>`,
    `<font><i/><sz val="8"/><color rgb="FF666666"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`,   // 4 white bold (done fills)
    `<font><b/><sz val="14"/><name val="Calibri"/></font>`,                          // 5 title
    ...BAND_FILLS.map(b => `<font><b/><sz val="8"/><color rgb="${b.text}"/><name val="Calibri"/></font>`), // 6..17
  ]
  const border = `<border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border>`
  const xfs = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    `<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="bottom" textRotation="90"/></xf>`,
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    `<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>`,
    `<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>`,
    `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    ...BAND_FILLS.map((_, i) =>
      `<xf numFmtId="0" fontId="${6 + i}" fillId="${7 + i}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>`),
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="${fonts.length}">${fonts.join('')}</fonts>
  <fills count="${fills.length}">${fills.join('')}</fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
</styleSheet>`
}

function cell(ref: string, style: number, text: string | null): string {
  if (text === null || text === '')
    return `<c r="${ref}" s="${style}"/>`
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${X(text)}</t></is></c>`
}

function statusOf(count: CellCount, status: string | undefined): { text: string; style: number } {
  if (count === 'na') {
    return status === 'done'
      ? { text: 'Done (n/a)', style: S.statusNa }
      : { text: 'N/A', style: S.statusNa }
  }
  if (status === 'done') return { text: 'Done', style: S.statusDone }
  if (status === 'in_progress') return { text: 'In progress', style: S.statusProg }
  return { text: '', style: S.statusPlain }
}

export function buildCxIndexXlsx(input: CxIndexXlsxInput): {
  sheetXml: string
  summaryXml: string
  workbookXml: string
  files: Record<string, string>
} {
  const { groups, equipment, cells, na } = input
  const count = (equipId: string, colId: string): CellCount =>
    classifyCell(na.has(`${equipId}:${colId}`), (cells.get(`${equipId}:${colId}`) ?? undefined) as any)

  const allCols = groups.flatMap(g => g.columns)
  const colStats = new Map<string, ColumnStat>()
  groups.forEach(g => g.columns.forEach(col => {
    colStats.set(col.id, columnStat(
      equipment.map(e => ({ typeKey: e.equipment_type, count: count(e.id, col.id) })), col.scope))
  }))
  const groupPcts = groups.map(g => ({
    name: g.name, pct: rollup(g.columns.map(c => colStats.get(c.id)!)).pct }))
  const projectPct = rollup([...colStats.values()]).pct

  const rows: string[] = []
  const merges: string[] = []
  let r = 0
  const push = (cellsXml: string[], ht?: number) => {
    r++
    rows.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cellsXml.join('')}</row>`)
  }

  // Row 1 — group bands in the Amendment 2 palette.
  {
    const c: string[] = [
      cell(`A1`, S.bold, input.projectName),
      cell(`B1`, S.default, null),
      cell(`C1`, S.default, null),
    ]
    let x = IDENTITY_COLS
    groups.forEach((g, gi) => {
      const bandStyle = S.bandBase + (gi % 12)
      c.push(cell(`${colRef(x)}1`, bandStyle, g.name))
      for (let i = 1; i < g.columns.length; i++) c.push(cell(`${colRef(x + i)}1`, bandStyle, null))
      if (g.columns.length > 1)
        merges.push(`${colRef(x)}1:${colRef(x + g.columns.length - 1)}1`)
      x += g.columns.length
    })
    push(c)
  }

  // Row 2 — rotated labels + identity headers (the AutoFilter row).
  {
    const c: string[] = [
      cell(`A2`, S.category, '#'),
      cell(`B2`, S.category, 'Tag'),
      cell(`C2`, S.category, 'Descriptor'),
    ]
    allCols.forEach((col, i) => {
      c.push(cell(`${colRef(IDENTITY_COLS + i)}2`, S.rotated,
        col.scope === 'type' ? `${col.label} — by type` : col.label))
    })
    push(c, 90)
  }

  // Body.
  const byCategory: Array<{ cat: string | null; units: XlsxUnit[] }> = []
  for (const e of equipment) {
    const last = byCategory[byCategory.length - 1]
    if (last && (last.cat ?? '') === (e.category ?? '')) last.units.push(e)
    else byCategory.push({ cat: e.category, units: [e] })
  }
  for (const cat of byCategory) {
    if (cat.cat) {
      const c = [cell(`A${r + 1}`, S.category, cat.cat)]
      for (let i = 1; i < IDENTITY_COLS + allCols.length; i++)
        c.push(cell(`${colRef(i)}${r + 1}`, S.category, null))
      merges.push(`A${r + 1}:${colRef(IDENTITY_COLS + allCols.length - 1)}${r + 1}`)
      push(c)
    }
    cat.units.forEach((e, i) => {
      const c: string[] = [
        cell(`A${r + 1}`, S.default, String(i + 1)),
        cell(`B${r + 1}`, S.bold, e.tag ?? ''),
        cell(`C${r + 1}`, S.default, e.descriptor ?? ''),
      ]
      allCols.forEach((col, x) => {
        const st = statusOf(count(e.id, col.id), cells.get(`${e.id}:${col.id}`))
        c.push(cell(`${colRef(IDENTITY_COLS + x)}${r + 1}`, st.style, st.text))
      })
      push(c)
    })
  }
  const lastDataRow = r

  // Stats row — the one shared form (statLabel), computed values never formulas.
  {
    const c: string[] = [
      cell(`A${r + 1}`, S.stats, null),
      cell(`B${r + 1}`, S.stats, 'Per column'),
      cell(`C${r + 1}`, S.stats, projectPct === null ? '' : `project ${projectPct}%`),
    ]
    allCols.forEach((col, x) => {
      c.push(cell(`${colRef(IDENTITY_COLS + x)}${r + 1}`, S.stats, statLabel(colStats.get(col.id)!)))
    })
    push(c)
  }
  push([cell(`A${r + 1}`, S.stamp, input.generatedStamp)])

  const lastCol = colRef(IDENTITY_COLS + allCols.length - 1)
  const footer = `&amp;L${X(input.generatedStamp)}&amp;RPage &amp;P of &amp;N`
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastCol}${r}"/>
  <sheetViews><sheetView workbookViewId="0">
    <pane xSplit="${IDENTITY_COLS}" ySplit="2" topLeftCell="${colRef(IDENTITY_COLS)}3" activePane="bottomRight" state="frozen"/>
  </sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="13"/>
  <cols>
    <col min="1" max="1" width="4" customWidth="1"/>
    <col min="2" max="2" width="13" customWidth="1"/>
    <col min="3" max="3" width="26" customWidth="1"/>
    <col min="4" max="${IDENTITY_COLS + allCols.length}" width="5.2" customWidth="1"/>
  </cols>
  <sheetData>${rows.join('')}</sheetData>
  <autoFilter ref="A2:${lastCol}${lastDataRow}"/>
  ${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>
  <pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <headerFooter><oddFooter>${footer}</oddFooter></headerFooter>
</worksheet>`

  // ── Summary sheet (first tab) — the PDF cover's sibling ────────────────────
  const sRows: string[] = []
  let sr = 0
  const spush = (cellsXml: string[], ht?: number) => {
    sr++
    sRows.push(`<row r="${sr}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cellsXml.join('')}</row>`)
  }
  spush([cell(`A1`, S.title, 'Commissioning Index')], 20)
  spush([cell(`A2`, S.stamp, 'Prepared by Isotherm Engineering Ltd.')])
  spush([])
  const info: Array<[string, string | null | undefined]> = [
    ['Client', input.clientName],
    ['Project', `${input.projectName}${input.comNumber ? ` · ${input.comNumber}` : ''}`],
    ['Address', input.address],
    ['Generated', input.generatedStamp],
  ]
  for (const [k, v] of info) {
    if (!v) continue
    spush([cell(`A${sr + 1}`, S.summaryKey, k), cell(`B${sr + 1}`, S.summaryVal, v)])
  }
  spush([])
  spush([cell(`A${sr + 1}`, S.bold, 'Completion'),
         cell(`B${sr + 1}`, S.bold, projectPct === null ? '—' : `${projectPct}% (claims-weighted)`)])
  groupPcts.forEach((g, gi) => {
    spush([cell(`A${sr + 1}`, S.bandBase + (gi % 12), g.name),
           cell(`B${sr + 1}`, S.summaryVal, g.pct === null ? '—' : `${g.pct}%`)])
  })
  spush([])
  spush([cell(`A${sr + 1}`, S.stamp,
    'Statuses: Done · In progress · N/A · Done (n/a) = completed, later ruled not applicable · blank = outstanding')])
  spush([cell(`A${sr + 1}`, S.stamp,
    'Per-column stats: unit columns n/N (done/applicable units); by-type columns K/N (types complete/types in scope; complete = every applicable unit done)')])
  spush([cell(`A${sr + 1}`, S.stamp, input.generatedStamp)])
  const summaryXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${sr}"/>
  <sheetViews><sheetView workbookViewId="0" tabSelected="1"/></sheetViews>
  <sheetFormatPr defaultRowHeight="13"/>
  <cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="60" customWidth="1"/></cols>
  <sheetData>${sRows.join('')}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  <pageSetup paperSize="1" orientation="portrait"/>
  <headerFooter><oddFooter>${footer}</oddFooter></headerFooter>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Cx Index" sheetId="2" r:id="rId2"/>
  </sheets>
  <definedNames>
    <definedName name="_xlnm.Print_Titles" localSheetId="1">'Cx Index'!$1:$2</definedName>
    <definedName name="_xlnm.Print_Area" localSheetId="1">'Cx Index'!$A$1:$${lastCol}$${r}</definedName>
  </definedNames>
</workbook>`

  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': workbookXml,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': stylesXml(),
    'xl/worksheets/sheet1.xml': summaryXml,
    'xl/worksheets/sheet2.xml': sheetXml,
  }
  return { sheetXml, summaryXml, workbookXml, files }
}

export async function cxIndexXlsxBlob(input: CxIndexXlsxInput): Promise<Blob> {
  const { files } = buildCxIndexXlsx(input)
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
