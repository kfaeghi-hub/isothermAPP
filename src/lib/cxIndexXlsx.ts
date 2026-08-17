// CX-INDEX XLSX — a real workbook, built in the browser, never crossing the
// wire (Phase 2 of CX-INDEX-EXPORT-PROPOSAL.md, ruled Q3: hand-rolled OOXML on
// JSZip, client-side — "no new dependency beyond a zip writer", and the zip
// writer already ships).
//
// What "real" means here, each item ruled:
//   · REAL CELLS — statuses as text values, filterable and pivotable. Not a
//     screenshot, not a CSV.
//   · COMPUTED VALUES, NOT FORMULAS (Q2's sibling in §3.2): a client's Excel
//     must not recompute different numbers than the issued PDF beside it. The
//     percentages are written as literal values from the same cx-counting
//     module the screen and the PDF use.
//   · FROZEN PANES echoing the sticky work: the two header rows and the three
//     identity columns stay pinned, exactly as T7 pins them on screen.
//   · NATIVE ROTATED HEADERS (textRotation 90) — the matrix's print identity.
//   · THE D5 STAMP as the sheet footer plus a visible stamp row — a workbook
//     travels farther than its register state, so the sheet itself says when
//     it was true.
//
// Inline strings throughout (the dev-fixture precedent): no sharedStrings
// table, one less place to desync. Structural gate: the battery unzips the
// artifact and greps the XML; the human gate opens it in real Excel AND
// LibreOffice (ruled Q3).

import JSZip from 'jszip'
import { classifyCell, columnStat, rollup } from './cxCounting'
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
  groups: XlsxGroup[]
  equipment: XlsxUnit[]
  cells: Map<string, string>
  na: Set<string>
  generatedStamp: string
}

const X = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Column index (0-based) → A1 letter. */
function colRef(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

const IDENTITY_COLS = 3 // #, Tag, Descriptor — frozen, like the sticky-left pins

// Style indices (cellXfs order below)
const S = {
  default: 0, bold: 1, rotated: 2, category: 3, stats: 4, stamp: 5, band: 6, status: 7,
} as const

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="9"/><name val="Calibri"/></font>
    <font><b/><sz val="9"/><name val="Calibri"/></font>
    <font><b/><sz val="8"/><name val="Calibri"/></font>
    <font><i/><sz val="8"/><color rgb="FF666666"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="bottom" textRotation="90"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
  </cellXfs>
</styleSheet>`

function cell(ref: string, style: number, text: string | null): string {
  if (text === null || text === '')
    return `<c r="${ref}" s="${style}"/>`
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${X(text)}</t></is></c>`
}

function statusText(count: CellCount, status: string | undefined): string {
  if (count === 'na') return status === 'done' ? 'Done (n/a)' : 'N/A'
  if (status === 'done') return 'Done'
  if (status === 'in_progress') return 'In progress'
  return ''
}

export function buildCxIndexXlsx(input: CxIndexXlsxInput): {
  sheetXml: string
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
  const projectPct = rollup([...colStats.values()]).pct

  const rows: string[] = []
  const merges: string[] = []
  let r = 0
  const push = (cellsXml: string[], ht?: number) => {
    r++
    rows.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cellsXml.join('')}</row>`)
  }

  // Row 1 — group bands (merged across each group's columns), like the 24px band.
  {
    const c: string[] = [
      cell(`A1`, S.bold, input.projectName),
      cell(`B1`, S.default, null),
      cell(`C1`, S.default, null),
    ]
    let x = IDENTITY_COLS
    for (const g of groups) {
      c.push(cell(`${colRef(x)}1`, S.band, g.name))
      for (let i = 1; i < g.columns.length; i++) c.push(cell(`${colRef(x + i)}1`, S.band, null))
      if (g.columns.length > 1)
        merges.push(`${colRef(x)}1:${colRef(x + g.columns.length - 1)}1`)
      x += g.columns.length
    }
    push(c)
  }

  // Row 2 — rotated column labels + identity headers.
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

  // Body — category header rows + unit rows, numbering restarting per category.
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
        c.push(cell(`${colRef(IDENTITY_COLS + x)}${r + 1}`, S.status,
          statusText(count(e.id, col.id), cells.get(`${e.id}:${col.id}`))))
      })
      push(c)
    })
  }

  // Stats row — the tfoot's twin: computed values, never formulas.
  {
    const c: string[] = [
      cell(`A${r + 1}`, S.stats, null),
      cell(`B${r + 1}`, S.stats, '% by column'),
      cell(`C${r + 1}`, S.stats, projectPct === null ? '' : `project ${projectPct}%`),
    ]
    allCols.forEach((col, x) => {
      const s = colStats.get(col.id)!
      const text = col.scope === 'type'
        ? (s.typesInScope === 0 && s.untypedApplicable === 0 ? '—' : `${s.typesComplete}/${s.typesInScope}`)
        : (s.unitTotal === 0 ? '—' : `${Math.round((s.unitDone / s.unitTotal) * 100)}%`)
      c.push(cell(`${colRef(IDENTITY_COLS + x)}${r + 1}`, S.stats, text))
    })
    push(c)
  }

  // Stamp row (D5 — visible in the grid, not only the print footer).
  push([cell(`A${r + 1}`, S.stamp, input.generatedStamp)])

  const lastCol = colRef(IDENTITY_COLS + allCols.length - 1)
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
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
  ${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
  <headerFooter><oddFooter>&amp;L${X(input.generatedStamp)}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>
</worksheet>`

  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Cx Index" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    'xl/styles.xml': STYLES_XML,
    'xl/worksheets/sheet1.xml': sheetXml,
  }
  return { sheetXml, files }
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
