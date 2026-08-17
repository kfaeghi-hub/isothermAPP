// THE ONE COUNTING RULE for Cx Index cells.
//
// Before this file existed the page computed "how done is it" in three places
// with two different rules: rowProgress() and stageState() consulted the
// cx_cell_applicability overlay; the collapsed-group summary consulted only the
// deprecated legacy 'na' STATUS — so an overlay-N/A cell stayed in its
// denominator as not-done, and a done-but-overlay-N/A'd cell stayed in its
// numerator, and the collapsed cell disagreed with the row % beside it.
// Since ruling D1 deprecated writing 'na', every NEW not-applicable is
// overlay-only, so that disagreement grew with every ratified rule.
// (CX-INDEX-EXPORT-PROPOSAL.md §1.2; ruled fixed first, Q7, 2026-08-17.)
//
// A predicate copied three times is not one policy. This is the policy:
//
//   overlay-N/A   → 'na'          not work; leaves BOTH sides of every ratio,
//   legacy 'na'   → 'na'          even when the status underneath is 'done' —
//                                 the struck-through ✓ renders, the arithmetic
//                                 ignores it (the screen shows the fact, the
//                                 number does not double-claim it)
//   'done'        → 'done'
//   anything else → 'outstanding' blank and in_progress both count against
//
// Every consumer — the row %, the stage-state filter, the per-unit panel, the
// collapsed-group summary, and (Phase 1 of the ruled build) the per-column /
// per-section / project-wide percentages — classifies through here.

export type CxCellStatus = 'done' | 'in_progress' | 'na'
export type CellCount = 'na' | 'done' | 'outstanding'

export function classifyCell(
  overlayNa: boolean,
  status: CxCellStatus | undefined | null
): CellCount {
  if (overlayNa) return 'na'
  if (status === 'na') return 'na' // deprecated status, still honoured on read
  return status === 'done' ? 'done' : 'outstanding'
}

/** Tally a set of classified cells into the shape every surface consumes. */
export function tallyCells(counts: Iterable<CellCount>): {
  done: number
  outstanding: number
  na: number
  total: number
} {
  let done = 0,
    outstanding = 0,
    na = 0
  for (const c of counts) {
    if (c === 'na') na++
    else if (c === 'done') done++
    else outstanding++
  }
  return { done, outstanding, na, total: done + outstanding }
}
