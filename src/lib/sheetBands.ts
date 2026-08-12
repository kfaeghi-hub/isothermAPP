// sheetBands — split a sheet too large for one answer into bands that share its
// header. [KEEL] Phase 5a.
//
// WHY IT LIVES IN src/lib AND NOT BESIDE THE ENDPOINT. Banding is a CALLER's
// concern: the browser orchestrator bands a sheet and sends each band as its own
// one-grid request, and the benchmark bands the same sheet and calls the same read
// function directly. If those two used different banding code they would be two
// pipelines that resemble each other — the exact thing the one-reading-path law
// forbids — so the split lives in one pure module both import.
//
// The endpoint never bands anything. It receives one grid and reads it, which is
// what keeps a single invocation inside its 300s ceiling.
//
// THE PRECEDENT is the PDF path's table-region splitting, and it carried two
// lessons that apply unchanged: chunking MULTIPLIES CALLS, so the multiplier is
// reported rather than averaged away; and ASSEMBLY is what broke last time, not
// extraction — 87 rows once sat in uploads nobody opened while the gate read 88/88.

export type Cell = string | number | boolean | Date | null

export interface BandPlan { headerRows: number; bandSize: number; bands: number }

/** The last row holding anything. A sheet's declared height is not its content. */
export function lastPopulatedRow(grid: Cell[][]): number {
  for (let r = grid.length - 1; r >= 0; r--) {
    if ((grid[r] ?? []).some(c => c !== null && c !== undefined && String(c).trim() !== '')) return r
  }
  return -1
}

/** Rough output-token cost of one row. Deliberately crude: the decision is only
 *  "does this fit", and a precise estimate of an unpredictable number is a false
 *  comfort. */
export function estimateRowCost(grid: Cell[][]): number {
  const width = Math.max(0, ...grid.map(r => r?.length ?? 0))
  return Math.max(1, Math.round(width * 12))
}

export function planBands(grid: Cell[][], dataStart: number, ceiling = 7000): BandPlan {
  const end = lastPopulatedRow(grid)
  const dataRows = Math.max(0, Math.min(grid.length, end + 1) - dataStart)
  const perRow = estimateRowCost(grid)
  const bandSize = Math.max(8, Math.floor(ceiling / perRow))
  return { headerRows: dataStart, bandSize, bands: Math.max(1, Math.ceil(dataRows / bandSize)) }
}

/**
 * The bands themselves, header included in each.
 *
 * A band read without its header is a wall of numbers whose columns mean nothing,
 * so every band carries the sheet's header rows. Trailing blank rows are not data
 * and are not paid for.
 */
export function sliceBands(grid: Cell[][], plan: BandPlan): { rows: Cell[][]; from: number; to: number }[] {
  const header = grid.slice(0, plan.headerRows)
  const body = grid.slice(plan.headerRows, lastPopulatedRow(grid) + 1)
  const out: { rows: Cell[][]; from: number; to: number }[] = []
  for (let b = 0; b < plan.bands; b++) {
    const slice = body.slice(b * plan.bandSize, (b + 1) * plan.bandSize)
    if (!slice.length) continue
    out.push({
      rows: [...header, ...slice],
      from: plan.headerRows + b * plan.bandSize + 1,
      to: plan.headerRows + b * plan.bandSize + slice.length,
    })
  }
  return out
}

/**
 * ASSEMBLY, WITH THE TRIPWIRE. A tag appearing in two bands means the split
 * overlapped and a unit is about to be counted twice — loud, never silent.
 */
export function assembleBands<T extends { tag?: string | null }>(
  bands: { rows: T[] }[],
): { rows: T[]; overlaps: string[] } {
  const seen = new Map<string, number>()
  const overlaps: string[] = []
  const rows: T[] = []
  bands.forEach((b, i) => {
    for (const r of b.rows) {
      const key = (r.tag ?? '').trim().toUpperCase()
      if (key) {
        const at = seen.get(key)
        if (at !== undefined && at !== i) overlaps.push(`${r.tag} in bands ${at + 1} and ${i + 1}`)
        seen.set(key, i)
      }
      rows.push(r)
    }
  })
  return { rows, overlaps }
}
