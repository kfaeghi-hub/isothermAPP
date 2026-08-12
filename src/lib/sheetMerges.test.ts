// sheetMerges — the datum the spreadsheet reader throws away.
//
// The hostile fixture found this: `MOTOR` spans G2:I2, `MBH` is column J, and the
// old forward-fill labelled it `MOTOR MBH` — a quantity that does not exist.
// No rule over the grid can recover the span, because the width was discarded
// before any rule ran. These tests are about the INPUT being right.
import { describe, it, expect } from 'vitest'
import { parseRef, parseRange, fillWithinMerges } from './sheetMerges'

const txt = (c: unknown) => (c === null || c === undefined ? '' : String(c).trim())

describe('cell references', () => {
  it.each([['A1', 0, 0], ['F1', 0, 5], ['J3', 2, 9], ['AA1', 0, 26]])(
    '%s → r%d c%d', (ref, r, c) => expect(parseRef(ref)).toEqual({ r, c }))

  it('parses a range', () => {
    expect(parseRange('G2:I2')).toEqual({ r0: 1, c0: 6, r1: 1, c1: 8 })
  })

  it('refuses nonsense rather than guessing', () => {
    expect(parseRef('nope')).toBeNull()
    expect(parseRange('G2')).toBeNull()
  })
})

describe('a group header stops where its merge stops', () => {
  //        F         G        H   I        J
  const row = [null, 'MOTOR', null, null, 'MBH']
  const merges = [{ r0: 0, c0: 1, r1: 0, c1: 3 }]   // MOTOR spans G:I

  it('fills inside the span', () => {
    const out = fillWithinMerges(row as never, 0, merges, txt)
    expect(out[2]).toBe('MOTOR')
    expect(out[3]).toBe('MOTOR')
  })

  it('does NOT reach past it — this is the MOTOR MBH defect', () => {
    const out = fillWithinMerges(row as never, 0, merges, txt)
    expect(out[4]).toBe('MBH')
    expect(out[4]).not.toBe('MOTOR MBH')
  })

  it('leaves a cell outside every span empty rather than inheriting', () => {
    const out = fillWithinMerges([null, 'A', null] as never, 0, [], txt)
    // With NO merge information it falls back to the old carry-across behaviour,
    // because an imperfect fold beats no fold on a workbook whose spans could not
    // be read.
    expect(out[2]).toBe('A')
  })
})
