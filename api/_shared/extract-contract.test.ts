// extract-contract — the boundary, PROVEN BY INJECTION.
//
// Phase 1's gate is "a malformed read fails at the boundary with a named reason,
// proven by injection." Every case below is damage handed to the checker on
// purpose. A boundary that has never refused anything is not a boundary — it is a
// function that has only ever been called with good input.
//
// The payloads are shaped like real model output, because the failures worth
// catching are the ones that LOOK right: a tag that is a sentence, a confidence
// of 4, a spec value that came back as a structure. A shortfall announces itself;
// a well-formed lie does not.
import { describe, it, expect } from 'vitest'
import { checkExtraction, describeProblems, declaredUnit, KNOWN_UNITS } from './extract-contract'

const TYPES = ['pump (Pump)', 'boiler (Boiler)', 'air_separator (Air Separator)']
const check = (v: unknown) => checkExtraction(v, { knownTypes: TYPES })

const goodRow = {
  tag: 'P-1', descriptor: 'END SUCTION PUMP', proposed_type: 'pump',
  location: 'BOILER ROOM', confidence: 0.9,
  nameplate: { 'FLOW [GPM]': '130', 'HEAD [ft]': '25' },
}

describe('a good read passes and keeps everything', () => {
  const out = check({ rows: [goodRow], page_note: 'one pump schedule' })

  it('is ok', () => expect(out.ok).toBe(true))
  it('raises no problems at all', () => expect(out.problems).toEqual([]))
  it('keeps the spec values', () => {
    expect(out.rows[0].nameplate).toEqual({ 'FLOW [GPM]': '130', 'HEAD [ft]': '25' })
  })
  it('keeps the resolved type', () => expect(out.rows[0].proposed_type).toBe('pump'))
})

describe('FATAL — the read does not hold together, and nothing is written', () => {
  it('refuses a payload that is not an object', () => {
    const out = check('rows: none')
    expect(out.ok).toBe(false)
    expect(out.problems[0].why).toMatch(/not an object/)
  })

  it('refuses a payload with no rows array — "nothing was read" is not a shape', () => {
    const out = check({ page_note: 'I could not read this page' })
    expect(out.ok).toBe(false)
    expect(out.problems[0].where).toBe('$.rows')
  })

  it('refuses a row that is not an object', () => {
    const out = check({ rows: ['P-1'] })
    expect(out.ok).toBe(false)
    expect(out.problems.some(p => p.severity === 'fatal' && /not an object/.test(p.why))).toBe(true)
  })

  // THE CLASSIC PLAUSIBLE WRONG ROW. It inserts, it renders, and it sits in the
  // register looking like equipment.
  it('refuses a tag that is prose', () => {
    const out = check({ rows: [{ ...goodRow, tag: 'NOTES: PROVIDE A SUCTION DIFFUSER AND TRIPLE-DUTY VALVE ON EACH PUMP AS SHOWN' }] })
    expect(out.ok).toBe(false)
    expect(describeProblems(out.problems)).toMatch(/prose, not a tag/)
  })

  it('refuses a tag carrying a line break — it is more than one thing', () => {
    const out = check({ rows: [{ ...goodRow, tag: 'P-1\nP-2' }] })
    expect(out.ok).toBe(false)
  })

  it('refuses a row with neither tag nor description — nothing to review', () => {
    const out = check({ rows: [{ confidence: 0.9, nameplate: { GPM: '130' } }] })
    expect(out.ok).toBe(false)
    expect(describeProblems(out.problems)).toMatch(/nothing here to review/)
  })

  it.each([4, -1, Number.NaN, '0.9', null])('refuses confidence %s', c => {
    const out = check({ rows: [{ ...goodRow, confidence: c }] })
    expect(out.ok).toBe(false)
    expect(out.problems.some(p => p.where.endsWith('.confidence'))).toBe(true)
  })

  // A READ THAT LOST EVERY ROW IS NOT A PARTIAL SUCCESS. Reporting "0 rows" here
  // would repeat the intake defect this codebase already fixed once: a failure
  // wearing an empty result's face.
  it('refuses when every row was lost, rather than reporting zero rows', () => {
    const out = check({ rows: [{ tag: 'x'.repeat(90), confidence: 0.9 }, 'nonsense'] })
    expect(out.ok).toBe(false)
    expect(out.rows).toHaveLength(0)
  })

  it('an empty page is NOT a failure — a page can honestly hold no equipment', () => {
    const out = check({ rows: [], page_note: 'this is a plan, not a schedule' })
    expect(out.ok).toBe(true)
    expect(out.rows).toEqual([])
  })
})

describe('FLAG — usable, and something deserves a human eye', () => {
  // THE PRIOR RULING IS PRESERVED. api/intake.ts degrades an invented type to
  // "unknown" so one bad row cannot throw away nineteen good ones. What changes
  // is that the degradation is now VISIBLE instead of silent.
  it('does not fail a type outside the vocabulary — it flags and degrades it', () => {
    const out = check({ rows: [{ ...goodRow, proposed_type: 'centrifugal_pump' }] })
    expect(out.ok).toBe(true)
    expect(out.rows[0].proposed_type).toBeNull()
    expect(out.problems[0].severity).toBe('flag')
    expect(out.problems[0].why).toMatch(/not a key in the firm vocabulary/)
  })

  it('flags an unrecognised unit but keeps the value as written', () => {
    const out = check({ rows: [{ ...goodRow, nameplate: { 'PRESSURE [furlongs]': '4.5' } }] })
    expect(out.ok).toBe(true)
    expect(out.rows[0].nameplate['PRESSURE [furlongs]']).toBe('4.5')
    expect(out.problems.some(p => /furlongs/.test(p.what))).toBe(true)
  })

  // A boundary that refused real units would refuse Avondale.
  it('accepts the units real schedules actually write', () => {
    const headings = ['MAX INPUT [MBH]', 'FLOW [GPM]', 'HEAD [ft]', 'PIPE SIZE (")', 'MOTOR INPUT [V/Ph/Hz]']
    const out = check({ rows: [{ ...goodRow, nameplate: Object.fromEntries(headings.map(h => [h, '1'])) }] })
    expect(out.ok).toBe(true)
    expect(out.problems).toEqual([])
  })

  it('drops a spec value that came back as a structure, and says so', () => {
    const out = check({ rows: [{ ...goodRow, nameplate: { GPM: { value: 130, unit: 'gpm' } } }] })
    expect(out.ok).toBe(true)
    expect(out.rows[0].nameplate).toEqual({})
    expect(out.problems[0].why).toMatch(/structure rather than a value/)
  })

  it('drops a spec value that is prose', () => {
    const out = check({ rows: [{ ...goodRow, nameplate: { NOTE: 'x'.repeat(600) } }] })
    expect(out.ok).toBe(true)
    expect(out.problems[0].why).toMatch(/prose, not a reading/)
  })

  it('flags unexpected keys instead of letting them through silently', () => {
    const out = check({ rows: [{ ...goodRow, invented_field: 'hello' }], extra_top: 1 })
    expect(out.ok).toBe(true)
    expect(out.problems.map(p => p.where).sort()).toEqual(['$.extra_top', 'rows[0].invented_field'])
  })
})

describe('the unit parser', () => {
  it.each([
    ['FLOW [GPM]', 'gpm'],
    ['PIPE SIZE (")', '"'],
    ['MAX OUTPUT [MBH]', 'mbh'],
    ['MANUFACTURER', null],
  ])('%s → %s', (h, u) => expect(declaredUnit(h)).toBe(u))

  it('knows the units the firm def sets are written in', () => {
    for (const u of ['kw', 'mbh', 'l/s', 'gpm', 'kpa', 'ft', 'nps', 'rpm', 'v/ph/hz']) {
      expect(KNOWN_UNITS.has(u)).toBe(true)
    }
  })
})

describe('the refusal names what was wrong', () => {
  it('a human is told the field and the reason, not "invalid output"', () => {
    const out = check({ rows: [{ ...goodRow, confidence: 7 }] })
    const said = describeProblems(out.problems)
    expect(said).toMatch(/rows\[0\]\.confidence/)
    expect(said).toMatch(/between 0 and 1/)
  })
})
