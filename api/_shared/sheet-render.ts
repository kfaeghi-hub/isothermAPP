// sheet-render — turn a spreadsheet into something a model can read WITHOUT
// having already decided what it means.
//
// THE POINT OF PHASE 2. The old path ran header detection and column mapping
// first and sent the model nothing at all; every downstream step inherited a
// decision made before anything read the sheet. On Avondale that decision was
// "SERVICE is the description", and two pumps entered a live register as boilers.
//
// So this renders the SHEET, not a conclusion about the sheet:
//
//   · every cell at its real address, so a claim can point at a cell
//   · banners and blank rows intact, because a schedule's meaning is often two
//     rows above the row you are reading
//   · MERGE EXTENTS DECLARED, because they are the one datum the deterministic
//     reader provably cannot recover — the spreadsheet library returns a merged
//     cell as value-plus-nulls and never reports its width. A group header
//     spanning G2:I2 covers G, H and I and NOT J, and the fixture that found this
//     had `MOTOR` silently adopting a `MBH` column two places away.
//
// Pure. No model, no network, no database — which is what lets the benchmark feed
// it real sheets and diff the rendering itself.

import type { MergeRange } from '../../src/lib/sheetMerges.js'

export type Cell = string | number | boolean | Date | null

/** `0` → `A`, `26` → `AA`. Excel's base-26 with no zero. */
export function colLetter(i: number): string {
  let n = i + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

const cellText = (c: Cell): string => {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).replace(/\s+/g, ' ').trim()
}

export interface RenderedSheet {
  text: string
  rows: number
  cols: number
  /** Non-empty cells. The cheap sanity number a caller can log next to the cost. */
  filled: number
}

/**
 * Render one sheet for the extractor.
 *
 * Cells are pipe-delimited with their column letters in a header line, so the
 * model can cite `J4` rather than "the tenth column". Empty cells are rendered as
 * a single dot rather than dropped: a gap is information — it is what tells a
 * reader that `MBH` has no value on three of four rows.
 *
 * Truncation is DECLARED, never silent. A sheet past the limits says so in the
 * text the model reads, so an answer covering half a sheet cannot look like an
 * answer covering all of it.
 */
export function renderSheet(
  grid: Cell[][], sheetName: string, merges: MergeRange[] = [],
  limits: { maxRows?: number; maxCols?: number; maxCellChars?: number } = {},
): RenderedSheet {
  const maxRows = limits.maxRows ?? 400
  const maxCols = limits.maxCols ?? 60
  const maxCell = limits.maxCellChars ?? 200

  const height = grid.length
  const width = Math.max(0, ...grid.map(r => r?.length ?? 0))
  const rows = Math.min(height, maxRows)
  const cols = Math.min(width, maxCols)

  let filled = 0
  const lines: string[] = []

  lines.push(`SHEET "${sheetName}" — ${height} rows × ${width} columns`)

  if (merges.length) {
    // Declared BEFORE the grid, because a reader needs to know a span exists
    // before meeting the blanks it explains.
    lines.push('')
    lines.push('MERGED CELLS (a value at the first address covers the whole range;')
    lines.push('a column outside a range is NOT covered by that range\'s header):')
    for (const m of merges.slice(0, 200)) {
      lines.push(`  ${colLetter(m.c0)}${m.r0 + 1}:${colLetter(m.c1)}${m.r1 + 1}` +
        `  = ${JSON.stringify(cellText(grid[m.r0]?.[m.c0] ?? null))}`)
    }
    if (merges.length > 200) lines.push(`  … ${merges.length - 200} more merges not listed`)
  }

  lines.push('')
  lines.push(`     | ${Array.from({ length: cols }, (_, c) => colLetter(c)).join(' | ')}`)

  for (let r = 0; r < rows; r++) {
    const cells: string[] = []
    for (let c = 0; c < cols; c++) {
      let v = cellText(grid[r]?.[c] ?? null)
      if (v) filled++
      if (v.length > maxCell) v = `${v.slice(0, maxCell)}…`
      cells.push(v || '·')
    }
    lines.push(`${String(r + 1).padStart(4)} | ${cells.join(' | ')}`)
  }

  if (height > rows) lines.push(`… TRUNCATED: ${height - rows} further rows were not included in this view.`)
  if (width > cols)  lines.push(`… TRUNCATED: ${width - cols} further columns were not included in this view.`)

  return { text: lines.join('\n'), rows, cols, filled }
}
