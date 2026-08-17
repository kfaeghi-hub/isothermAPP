// The counting discipline, pinned. Every case here is a row in the rule the
// three on-page counting sites now share — if one of these moves, a percentage
// somewhere changed meaning, and that is a ruling, not a refactor.
import { describe, expect, it } from 'vitest'
import { classifyCell, tallyCells } from './cxCounting'

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
