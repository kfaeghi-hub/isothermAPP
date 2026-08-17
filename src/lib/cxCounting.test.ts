// The counting discipline, pinned. Every case here is a row in the rule the
// three on-page counting sites now share — if one of these moves, a percentage
// somewhere changed meaning, and that is a ruling, not a refactor.
import { describe, expect, it } from 'vitest'
import { classifyCell, columnStat, rollup, tallyCells } from './cxCounting'
import type { CellCount } from './cxCounting'

describe('classifyCell — one rule for every counting site', () => {
  it('blank, applicable → outstanding (unset work counts against)', () => {
    expect(classifyCell(false, undefined)).toBe('outstanding')
    expect(classifyCell(false, null)).toBe('outstanding')
  })

  it('done, applicable → done', () => {
    expect(classifyCell(false, 'done')).toBe('done')
  })

  it('in_progress, applicable → outstanding (partial is not done)', () => {
    expect(classifyCell(false, 'in_progress')).toBe('outstanding')
  })

  it("legacy 'na' status → na (deprecated in place, honoured on read)", () => {
    expect(classifyCell(false, 'na')).toBe('na')
  })

  it('overlay-N/A → na regardless of status underneath', () => {
    expect(classifyCell(true, undefined)).toBe('na')
    expect(classifyCell(true, 'in_progress')).toBe('na')
    expect(classifyCell(true, 'na')).toBe('na')
  })

  it("overlay-N/A over 'done' → na — THE DEFECT CASE: the struck-through ✓ " +
     'renders but counts on neither side', () => {
    expect(classifyCell(true, 'done')).toBe('na')
  })
})

describe('tallyCells — the shape every surface consumes', () => {
  it('excludes na from total; blank and in_progress are outstanding', () => {
    const t = tallyCells([
      classifyCell(false, 'done'),        // done
      classifyCell(false, 'in_progress'), // outstanding
      classifyCell(false, undefined),     // outstanding
      classifyCell(true, 'done'),         // na — the defect case
      classifyCell(false, 'na'),          // na — legacy
    ])
    expect(t).toEqual({ done: 1, outstanding: 2, na: 2, total: 3 })
  })

  it('an all-N/A set totals zero — the caller decides how to render that', () => {
    const t = tallyCells([classifyCell(true, 'done'), classifyCell(false, 'na')])
    expect(t.total).toBe(0)
    expect(t.na).toBe(2)
  })

  it('the collapsed-group % under the shared rule matches the row-% rule: ' +
     'done/(done+outstanding), overlay excluded from both sides', () => {
    // One done cell overlay-N/A'd among two blanks and one real done:
    // old collapsed rule counted it → 2/4 = 50%; shared rule → 1/3 = 33%.
    const t = tallyCells([
      classifyCell(true, 'done'),
      classifyCell(false, 'done'),
      classifyCell(false, undefined),
      classifyCell(false, undefined),
    ])
    expect(Math.round((t.done / t.total) * 100)).toBe(33)
  })
})

// ── Scope-aware rollups (Phase 1 formulas, Q4/Q6) ────────────────────────────

/** Build columnStat rows: n units of a type in a given state. */
const units = (typeKey: string | null, n: number, count: CellCount) =>
  Array.from({ length: n }, () => ({ typeKey, count }))

describe('columnStat — type scope counts submittal claims, not machines', () => {
  // THE SENECA SHOP DWGS FIXTURE — the live register's exact shape, measured
  // 2026-08-17 (proposal §2, backfill batch record). 367 units; the marks
  // followed tag families, so no type is complete though three are near.
  const senecaShopDwgs = [
    ...units('fcu', 3, 'done'), ...units('fcu', 114, 'outstanding'),
    ...units('vav', 55, 'outstanding'),
    ...units('pump', 28, 'done'), ...units('pump', 2, 'outstanding'),
    ...units('panel', 26, 'outstanding'),
    ...units('fan', 5, 'done'), ...units('fan', 7, 'outstanding'),
    ...units('humidifier', 8, 'outstanding'),
    ...units('ahu', 6, 'done'), ...units('ahu', 1, 'outstanding'),
    ...units('ats', 4, 'done'), ...units('ats', 1, 'outstanding'),
    ...units('radiant_panel', 2, 'outstanding'), ...units('erv', 2, 'outstanding'),
    ...units('boiler', 2, 'outstanding'), ...units('generator', 1, 'outstanding'),
    ...units('heat_pump', 1, 'outstanding'), ...units('sump_pump', 1, 'outstanding'),
    ...units(null, 43, 'done'), ...units(null, 55, 'outstanding'),
  ]

  it('Seneca Shop Dwgs: unit rule says 24%, type rule says the honest 0 of 14', () => {
    const s = columnStat(senecaShopDwgs, 'type')
    expect(s.unitDone).toBe(89)
    expect(s.unitTotal).toBe(367)
    expect(Math.round((s.unitDone / s.unitTotal) * 100)).toBe(24)
    expect(s.typesInScope).toBe(14)
    expect(s.typesComplete).toBe(0)   // pump 28/30 and ahu 6/7 are near, not complete
    expect(s.num).toBe(0)
    expect(s.den).toBe(14)
  })

  it('untyped units are SURFACED beside a type-scoped stat, never counted in it', () => {
    const s = columnStat(senecaShopDwgs, 'type')
    expect(s.untypedApplicable).toBe(98)
    expect(s.untypedDone).toBe(43)
  })

  it('a type completes only when EVERY applicable unit is done (Q6)', () => {
    const nearly = columnStat(
      [...units('pump', 29, 'done'), ...units('pump', 1, 'outstanding')], 'type')
    expect(nearly.typesComplete).toBe(0)
    const complete = columnStat(units('pump', 30, 'done'), 'type')
    expect(complete.typesComplete).toBe(1)
    expect(complete.typesInScope).toBe(1)
  })

  it("N/A'ing a type's last outstanding unit completes the claim — the " +
     'applicability mechanism is how a near-complete type resolves', () => {
    const s = columnStat(
      [...units('pump', 28, 'done'), ...units('pump', 2, 'na')], 'type')
    expect(s.typesComplete).toBe(1)
  })

  it('a type whose every unit is N/A leaves the scope entirely', () => {
    const s = columnStat(
      [...units('pump', 2, 'na'), ...units('ahu', 1, 'done')], 'type')
    expect(s.typesInScope).toBe(1)
    expect(s.typesComplete).toBe(1)
  })

  it("a unit-scoped column's claims are its units, unchanged from today", () => {
    const s = columnStat(
      [...units('fcu', 3, 'done'), ...units('fcu', 1, 'na'),
       ...units(null, 2, 'outstanding')], 'unit')
    expect(s.num).toBe(3)
    expect(s.den).toBe(5)   // 6 rows − 1 na; untyped count fully here
  })
})

describe('rollup — claims-weighted, never an unweighted mean', () => {
  it('sums numerators over denominators across mixed scopes', () => {
    const unitCol = columnStat(units('fcu', 100, 'done'), 'unit')      // 100/100
    const typeCol = columnStat(
      [...units('fcu', 1, 'done'), ...units('vav', 1, 'outstanding')], 'type') // 1/2
    const r = rollup([unitCol, typeCol])
    expect(r.num).toBe(101)
    expect(r.den).toBe(102)
    expect(r.pct).toBe(99)  // an unweighted mean would say 75
  })

  it('an empty scope rolls up to null, not 100 and not 0 — the caller renders the dash', () => {
    expect(rollup([]).pct).toBeNull()
    expect(rollup([{ num: 0, den: 0 }]).pct).toBeNull()
  })
})
