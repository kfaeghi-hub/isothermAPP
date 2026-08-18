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

// ── Scope-aware rollups (Phase 1 formulas, ruled Q4/Q6 2026-08-17) ───────────
//
// A column has a SCOPE — the kind of claim its cells record:
//
//   'unit'  work per machine.    % = done units / applicable units.
//   'type'  work per submittal — per equipment type in the project.
//           % = types complete / types in scope. A type is COMPLETE when every
//           applicable unit is done (ruled Q6: partial families count in the
//           denominator only — strictness that reads as honesty, labelled
//           "K of N types"). A type with zero applicable units is out of scope.
//
// UNTYPED units under a type-scoped column are SURFACED, never counted: a
// submittal claim cannot cover a unit whose type nobody has stated, and
// silently folding 98 untyped units into "N types" would make the label lie.
// They ride the stat as untypedApplicable/untypedDone and the UI shows them.
//
// Section and project rollups are CLAIMS-WEIGHTED: Σ numerators / Σ
// denominators across columns, each column contributing in its own scope's
// units. An unweighted mean would let a 2-unit column swing a 117-unit
// column's group.

export type ColumnScope = 'unit' | 'type'

export interface ColumnStat {
  scope: ColumnScope
  /** Unit-grain tally (always computed; the display grain for scope='unit'). */
  unitDone: number
  unitTotal: number
  /** Type-grain tally (meaningful for scope='type'). */
  typesComplete: number
  typesInScope: number
  untypedApplicable: number
  untypedDone: number
  /** What this column contributes to claims-weighted rollups, in its scope. */
  num: number
  den: number
}

export function columnStat(
  rows: Array<{ typeKey: string | null | undefined; count: CellCount }>,
  scope: ColumnScope
): ColumnStat {
  let unitDone = 0,
    unitTotal = 0,
    untypedApplicable = 0,
    untypedDone = 0
  const byType = new Map<string, { applicable: number; done: number }>()
  for (const r of rows) {
    if (r.count === 'na') continue
    unitTotal++
    if (r.count === 'done') unitDone++
    if (r.typeKey) {
      const t = byType.get(r.typeKey) ?? { applicable: 0, done: 0 }
      t.applicable++
      if (r.count === 'done') t.done++
      byType.set(r.typeKey, t)
    } else {
      untypedApplicable++
      if (r.count === 'done') untypedDone++
    }
  }
  let typesInScope = 0,
    typesComplete = 0
  for (const t of byType.values()) {
    if (t.applicable === 0) continue
    typesInScope++
    if (t.done === t.applicable) typesComplete++
  }
  const [num, den] =
    scope === 'type' ? [typesComplete, typesInScope] : [unitDone, unitTotal]
  return {
    scope,
    unitDone,
    unitTotal,
    typesComplete,
    typesInScope,
    untypedApplicable,
    untypedDone,
    num,
    den,
  }
}

/** THE ONE DISPLAY FORM for a per-column stat, everywhere stats surface —
 *  screen footer, PDF stats row, workbook stats row (Phase 2b ruling): unit
 *  columns read "n/N" (done units / applicable units), type columns read
 *  "K/N" (types complete / types in scope). One definition; three surfaces
 *  render its string and cannot drift apart. */
export function statLabel(s: ColumnStat): string {
  if (s.scope === 'type') {
    return s.typesInScope === 0 && s.untypedApplicable === 0
      ? '—'
      : `${s.typesComplete}/${s.typesInScope}`
  }
  return s.unitTotal === 0 ? '—' : `${s.unitDone}/${s.unitTotal}`
}

/** Claims-weighted rollup over column stats (section or project-wide). */
export function rollup(stats: Array<{ num: number; den: number }>): {
  num: number
  den: number
  pct: number | null
} {
  let num = 0,
    den = 0
  for (const s of stats) {
    num += s.num
    den += s.den
  }
  return { num, den, pct: den === 0 ? null : Math.round((num / den) * 100) }
}
