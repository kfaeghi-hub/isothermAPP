// The converter's gate. Expectations written by hand from the physical
// definitions, never from running the code and recording what came out.
import { describe, it, expect } from 'vitest'
import { alternatesFor, convertValue, ALTERNATES } from './unitConvert'

const to = (unit: string, target: string) =>
  ALTERNATES[unit].find(c => c.to === target)!

describe('the five quantities that actually swap', () => {
  it('225 GPM is 14.2 L/s', () => {
    expect(convertValue('225', to('GPM', 'L/s'))).toBe('14.2')
  })
  it('and back again', () => {
    expect(convertValue('14.2', to('L/s', 'GPM'))).toBe('225')
  })
  it('1 inch is 25.4 mm', () => {
    expect(convertValue('1', to('in', 'mm'))).toBe('25.4')
  })
  it('100 kg/h is 220 lb/h', () => {
    expect(convertValue('100', to('kg/h', 'lb/h'))).toBe('220')
  })
})

describe('TEMPERATURE IS AFFINE, and getting that wrong is the dangerous case', () => {
  it('20 °C is 68 °F — not 36', () => {
    // A factor-only converter gives 36: a plausible temperature, wrong by 32.
    // Wrong-but-plausible is worse than wrong-and-obvious, because nobody checks.
    expect(convertValue('20', to('°C', '°F'))).toBe('68')
  })
  it('0 °C is 32 °F — the case a pure multiplier gets exactly wrong', () => {
    expect(convertValue('0', to('°C', '°F'))).toBe('32')
  })
  it('round trips', () => {
    expect(convertValue('68', to('°F', '°C'))).toBe('20')
  })
})

describe('head vs pressure — kPa offers both, and the field decides', () => {
  it('offers ft first, because every kPa in the def sets is a head', () => {
    expect(alternatesFor('kPa').map(c => c.to)).toEqual(['ft', 'PSI'])
  })
  it('100 kPa is 33.5 ft of head', () => {
    expect(convertValue('100', to('kPa', 'ft'))).toBe('33.5')
  })
  it('100 kPa is 14.5 PSI', () => {
    expect(convertValue('100', to('kPa', 'PSI'))).toBe('14.5')
  })
})

describe('NON-NUMERIC VALUES ARE REFUSED, NOT MANGLED', () => {
  // Nameplate fields hold "1 1/2", "N/A", "see submittal". A converter that
  // turned those into NaN would destroy a real reading, and one that passed
  // them through unchanged would leave them at the old magnitude under a new
  // label — which is the silent relabel this whole feature exists to prevent.
  it.each(['N/A', '1 1/2', 'see submittal', '', '  ', '225 GPM'])(
    'refuses %j', v => {
      expect(convertValue(v, to('GPM', 'L/s'))).toBeNull()
    })

  it('accepts a negative number — temperatures go below zero', () => {
    expect(convertValue('-10', to('°C', '°F'))).toBe('14')
  })
})

describe('units both systems share have no alternates', () => {
  // These are Ontario drawing practice: air in CFM, pipe in NPS, on drawings
  // that are otherwise metric. Offering a swap would invite one.
  //
  // MBH LEFT THIS LIST ON 2026-08-11, and the distinction is worth keeping. It is
  // still true that MBH is written on both metric and imperial Ontario drawings —
  // that is a fact about the UNIT, and it was never the reason the list existed.
  // The reason is "no counterpart the firm's def sets need". The boiler def set
  // declares `Input Rating (kW)` and `Output Rating (kW)`, and every North
  // American boiler schedule states them in MBH — Avondale's B-1 reads MAX INPUT
  // 800 MBH against a field expecting kW. Without the pair the value matched its
  // field and still could not be written, because putting 800 under a kW label is
  // the relabelling defect arriving through an import instead of an edit.
  it.each(['CFM', 'NPS', 'V', 'A', 'Hz', '%', 'RPM', 'Ø'])(
    '%s offers nothing', u => {
      expect(alternatesFor(u)).toEqual([])
    })

  it('MBH now offers kW, because a def set asks for kW', () => {
    expect(alternatesFor('MBH')).toEqual([
      { to: 'kW', factor: 0.293071, offset: 0, label: '÷ 3.412' },
    ])
    // 800 MBH is 234 kW. A boiler nameplate is the place to get this right.
    expect(convertValue('800', to('MBH', 'kW'))).toBe('234')
  })

  it('a field with no unit offers nothing', () => {
    expect(alternatesFor(null)).toEqual([])
  })
})
