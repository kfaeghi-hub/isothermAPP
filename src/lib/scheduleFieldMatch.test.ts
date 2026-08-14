// scheduleFieldMatch — the gate for mapping a schedule's own headings onto the
// firm's declared nameplate fields.
//
// Every expectation is written by hand from real Avondale headings. The two
// guards below were not designed in advance; the dry run over Adam's units
// produced wrong output and they are what it cost.
import { describe, it, expect } from 'vitest'
import { matchScheduleField, matchScheduleSpec, splitUnit, type DeclaredField } from './scheduleFieldMatch'

const PUMP: DeclaredField[] = [
  { field_name: 'Flow (L/s)', unit: 'L/s' },
  { field_name: 'Head (kPa)', unit: 'kPa' },
  { field_name: 'Motor kW (kW)', unit: 'kW' },
  { field_name: 'Speed (RPM)', unit: 'RPM' },
  { field_name: 'VFD', unit: null },
]
const BOILER: DeclaredField[] = [
  { field_name: 'Input Rating (kW)', unit: 'kW' },
  { field_name: 'Output Rating (kW)', unit: 'kW' },
  { field_name: 'Gas Input (MBH)', unit: 'MBH' },
]

describe('splitUnit — schedules bracket their units every way there is', () => {
  it.each([
    ['FLOW [GPM]', 'FLOW', 'GPM'],
    ['PIPE SIZE (")', 'PIPE SIZE', '"'],
    ['DRY WEIGHT (LBS)', 'DRY WEIGHT', 'LBS'],
    ['Flow (L/s)', 'Flow', 'L/s'],
    ['MANUFACTURER', 'MANUFACTURER', null],
  ])('%s → term %s, unit %s', (label, term, unit) => {
    expect(splitUnit(label)).toEqual({ term, unit })
  })
})

describe('a value never lands under a label that means something else', () => {
  it('writes as-is when the units agree', () => {
    const m = matchScheduleField('RPM', '1760', PUMP)
    expect(m.kind).toBe('exact')
    expect(m.field).toBe('Speed (RPM)')
    expect(m.value).toBe('1760')
  })

  it('converts when a known conversion bridges the units, and says the arithmetic', () => {
    const m = matchScheduleField('FLOW [GPM]', '130', PUMP)
    expect(m.kind).toBe('converted')
    expect(m.field).toBe('Flow (L/s)')
    expect(m.value).toBe('8.2')
    expect(m.note).toContain('130 GPM → 8.2 L/s')
  })

  it('REFUSES when the field matches but the units cannot be bridged', () => {
    // A pump head in feet against a field declared in a unit with no path to it.
    const odd: DeclaredField[] = [{ field_name: 'Head (furlongs)', unit: 'furlongs' }]
    const m = matchScheduleField('HEAD [ft]', '25', odd)
    expect(m.kind).toBe('unit-mismatch')
    expect(m.value).toBeNull()          // nothing written — a blank beats a wrong number
    expect(m.raw).toBe('25')            // and the source reading survives
  })

  it('returns unmatched headings by name rather than dropping them', () => {
    const m = matchScheduleField('WATER PRESSURE DROP (@20°C dT)', '4.5', PUMP)
    expect(m.kind).toBe('unmatched')
    expect(m.header).toBe('WATER PRESSURE DROP (@20°C dT)')
    expect(m.raw).toBe('4.5')
  })
})

/**
 * GUARD 1 — no word-containment. `resolveType` matches on all-words containment
 * because extra words there are qualifiers. Field names do not work that way: an
 * extra word usually names a different quantity on the same machine.
 */
describe('an extra word names a different quantity, not the same one', () => {
  it('"VFD INPUT" does not claim the "VFD" field', () => {
    const m = matchScheduleField('VFD INPUT [V/Ph/Hz]', '208/1/60', PUMP)
    expect(m.kind).toBe('unmatched')
    expect(m.field).toBeNull()
  })

  it('"MAX INPUT" reaches Input Rating by a curated alias, not by sharing a word', () => {
    expect(matchScheduleField('MAX INPUT [MBH]', '800', BOILER).field).toBe('Input Rating (kW)')
    expect(matchScheduleField('MAX INPUT [MBH]', '800', BOILER).value).toBe('234')
  })

  it('and "MAX OUTPUT" lands on Output Rating, not Input Rating', () => {
    expect(matchScheduleField('MAX OUTPUT [MBH]', '787', BOILER).field).toBe('Output Rating (kW)')
  })
})

/**
 * GUARD 2 — two headings may not claim one field.
 *
 * On the first Avondale dry run, `VFD` (= "YES") and `VFD INPUT [V/Ph/Hz]`
 * (= "208/1/60") both resolved to the `VFD` field, and the later one overwrote
 * the earlier. A value destroyed, no error, under a label that now meant
 * something else. Guard 1 fixes that particular pair; this exists because the
 * next collision will be one nobody predicted.
 */
describe('two columns may not claim one field', () => {
  const twins: DeclaredField[] = [{ field_name: 'Flow (L/s)', unit: 'L/s' }]

  it('refuses BOTH and names the rival, rather than picking one', () => {
    const out = matchScheduleSpec({ 'FLOW [GPM]': '130', 'Flow': '8.2' }, twins)
    expect(out.every(m => m.kind === 'unmatched')).toBe(true)
    expect(out[0].note).toContain('two columns claim')
    expect(out[0].note).toContain('Flow')
  })

  it('a single claimant is unaffected', () => {
    const out = matchScheduleSpec({ 'FLOW [GPM]': '130', 'QTY': '1' }, twins)
    expect(out.find(m => m.header === 'FLOW [GPM]')!.kind).toBe('converted')
    expect(out.find(m => m.header === 'QTY')!.kind).toBe('unmatched')
  })
})

describe('every heading comes back, always', () => {
  it('a full read and a partial read are distinguishable by count', () => {
    const spec = { 'RPM': '1760', 'VFD': 'YES', 'QTY': '1', 'TYPE': 'VERTICAL IN-LINE' }
    const out = matchScheduleSpec(spec, PUMP)
    expect(out).toHaveLength(Object.keys(spec).length)
    expect(out.filter(m => m.kind === 'exact')).toHaveLength(2)
    expect(out.filter(m => m.kind === 'unmatched').map(m => m.header)).toEqual(['QTY', 'TYPE'])
  })
})

// ── compound columns: one heading, several fields (ruled 2026-08-14) ─────────
//
// MOTOR INPUT [V/Ph/Hz] holding 208/3/60 is three quantities in one cell. The
// PMPs incident's dialect; BP-1/BP-2 carry "-" (no VFD drive), which is the
// refusal case: one part against three fields, nothing writes.
describe('compound columns', () => {
  const PUMP_ELEC: DeclaredField[] = [
    { field_name: 'Voltage (V)', unit: 'V' },
    { field_name: 'Phase (Ø)', unit: 'Ø' },
    { field_name: 'Hz (Hz)', unit: 'Hz' },
    { field_name: 'VFD', unit: null },
  ]

  it('splits 208/3/60 into Voltage/Phase/Hz, verbatim', () => {
    const out = matchScheduleSpec({ 'MOTOR INPUT [V/Ph/Hz]': '208/3/60' }, PUMP_ELEC)
    const parts = out.filter(m => m.kind === 'compound')
    expect(parts).toHaveLength(3)
    expect(parts.map(m => [m.field, m.value])).toEqual([
      ['Voltage (V)', '208'], ['Phase (Ø)', '3'], ['Hz (Hz)', '60'],
    ])
    // the raw cell rides on every part — the document's own string, kept
    for (const m of parts) expect(m.raw).toBe('208/3/60')
  })

  it('REFUSES WHOLE on a part-count mismatch — the dash on a pump with no drive', () => {
    const out = matchScheduleSpec({ 'MOTOR INPUT [V/Ph/Hz]': '-' }, PUMP_ELEC)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('unmatched')
    expect(out[0].value).toBeNull()
    expect(out[0].note).toMatch(/1 part\(s\) against 3 fields/)
  })

  it('refuses whole on two parts as well — never guesses which field misses out', () => {
    const out = matchScheduleSpec({ 'MOTOR INPUT [V/Ph/Hz]': '208/60' }, PUMP_ELEC)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('unmatched')
  })

  it('stays unmatched when the type does not declare the target fields', () => {
    const noElec: DeclaredField[] = [{ field_name: 'Flow (L/s)', unit: 'L/s' }]
    const out = matchScheduleSpec({ 'MOTOR INPUT [V/Ph/Hz]': '208/3/60' }, noElec)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('unmatched')
  })

  it('VFD INPUT is NOT compound-aliased — it stays named-unmatched (ruled)', () => {
    const out = matchScheduleSpec({ 'VFD INPUT [V/Ph/Hz]': '208/1/60' }, PUMP_ELEC)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('unmatched')
  })

  it('a compound part joins the collision guard like any other claim', () => {
    const out = matchScheduleSpec(
      { 'MOTOR INPUT [V/Ph/Hz]': '208/3/60', 'VOLTS': '600' }, PUMP_ELEC)
    // VOLTS aliases Voltage; the compound also claims Voltage — both must refuse
    const voltage = out.filter(m => m.field === 'Voltage (V)')
    expect(voltage.length).toBeGreaterThanOrEqual(2)
    for (const m of voltage) expect(m.kind).toBe('unmatched')
  })
})
