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
  // These are Ontario drawing practice: air in CFM, capacity in MBH, pipe in
  // NPS, on drawings that are otherwise metric. Offering a swap would invite one.
  it.each(['CFM', 'MBH', 'NPS', 'V', 'A', 'Hz', '%', 'RPM', 'Ø'])(
    '%s offers nothing', u => {
      expect(alternatesFor(u)).toEqual([])
    })

  it('a field with no unit offers nothing', () => {
    expect(alternatesFor(null)).toEqual([])
  })
})
