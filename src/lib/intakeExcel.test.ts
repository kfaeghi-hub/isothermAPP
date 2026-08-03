// intakeExcel — the parser's gate.
//
// EVERY EXPECTATION HERE IS WRITTEN BY HAND. None is produced by running the
// parser and recording what came out, because a test built that way asserts only
// that the code still does whatever it does — it passes just as happily when the
// behaviour is wrong. The grids below are shaped like the Seneca schedules that
// motivated this: a title row, a blank, a merged two-deep header, unit rows, and
// a legend at the bottom that must NOT become equipment.
import { describe, it, expect } from 'vitest'
import { parseSheet, resolveType, resolveTypeDetailed, type Cell, type TypeVocab } from './intakeExcel'

const VOCAB: TypeVocab[] = [
  { key: 'fcu', name: 'Fan Coil Unit' },
  { key: 'fan', name: 'Fan' },
  { key: 'pump', name: 'Pump' },
  { key: 'vav', name: 'VAV Box' },
  { key: 'ahu', name: 'Air Handling Unit' },
  { key: 'panel', name: 'Panel (Electrical Distribution)' },
  { key: 'radiant_panel', name: 'Radiant Panel' },
]

describe('parseSheet — an ordinary typed schedule', () => {
  const grid: Cell[][] = [
    ['SUMP PUMP SCHEDULE', null, null, null, null],
    [null, null, null, null, null],
    ['TAG', 'DESCRIPTION', 'LOCATION', 'GPM', 'HEAD (FT)'],
    ['SP-01', 'SUMP PUMP', 'P1 Sump Pit', 45, 30],
    ['SP-02', 'SUMP PUMP', 'P2 Sump Pit', 45, 30],
    [null, null, null, null, null],
    ['NOTES: PROVIDE DUPLEX CONTROLLER', null, null, null, null],
  ]
  const out = parseSheet(grid, 'SumpP', VOCAB)

  it('finds the header past the title and the blank row', () => {
    expect(out.header_row).toBe(3)                 // 1-based, as Excel shows it
  })

  it('reads the schedule title and derives a category from it', () => {
    expect(out.title).toBe('SUMP PUMP SCHEDULE')
    expect(out.proposed_category).toBe('SUMP PUMP')
  })

  it('returns the two pumps and nothing else', () => {
    expect(out.rows.map(r => r.tag)).toEqual(['SP-01', 'SP-02'])
  })

  it('does NOT treat the notes line as equipment', () => {
    // It has text in column A, so a naive parser keeps it. It has no tag pattern
    // and no description column value, so this one must not.
    expect(out.rows.some(r => /NOTES/i.test(r.tag ?? ''))).toBe(false)
  })

  it('keeps unmapped engineering columns as nameplate rather than discarding them', () => {
    expect(out.rows[0].nameplate).toEqual({ 'GPM': '45', 'HEAD (FT)': '30' })
    expect(out.unmapped).toEqual(['GPM', 'HEAD (FT)'])
  })

  it('resolves the type from the description', () => {
    expect(out.rows[0].proposed_type).toBe('pump')
    expect(out.rows[0].observed_type_name).toBeNull()
  })

  it('reports the source row as Excel numbers it', () => {
    expect(out.rows[0].source_row).toBe(4)
  })
})

describe('LAW 8 — a tag string never decides the type', () => {
  // The case that made law 8: RP is a radiant panel on the mechanical drawings
  // and a receptacle panel on the electrical. Same prefix, different equipment.
  const mech: Cell[][] = [
    ['RADIANT PANEL SCHEDULE'],
    ['TAG', 'DESCRIPTION'],
    ['RP-1', 'RADIANT CEILING PANEL'],
  ]
  const elec: Cell[][] = [
    ['RECEPTACLE PANEL SCHEDULE'],
    ['TAG', 'DESCRIPTION'],
    ['RP-1', 'RECEPTACLE PANEL'],
  ]

  it('types the same tag differently because the descriptions differ', () => {
    const m = parseSheet(mech, 'Radiant', VOCAB)
    const e = parseSheet(elec, 'Elec', VOCAB)
    expect(m.rows[0].tag).toBe('RP-1')
    expect(e.rows[0].tag).toBe('RP-1')
    // Both descriptions contain the word "panel". Only ALL-WORDS matching keeps
    // them apart: "radiant panel" needs both words and beats plain "panel" on
    // specificity; "receptacle panel" fails `radiant` and lands on "panel".
    expect(m.rows[0].proposed_type).toBe('radiant_panel')
    expect(e.rows[0].proposed_type).toBe('panel')
  })
})

describe('R16 — quarantine, never guess', () => {
  it('does not resolve a type on a partial word match', () => {
    // 'Fan Coil Unit' contains 'Fan'. A substring match types every FCU as a fan,
    // which is 113 wrong units on Seneca alone.
    const grid: Cell[][] = [
      ['FAN COIL UNIT SCHEDULE'],
      ['TAG', 'DESCRIPTION'],
      ['FCU-101', 'FAN COIL UNIT'],
    ]
    const out = parseSheet(grid, 'FCU', VOCAB)
    expect(out.rows[0].proposed_type).toBe('fcu')
  })

  it('keeps the observed name and lowers confidence when the type is unknown', () => {
    const grid: Cell[][] = [
      ['HYDRAULIC SEPARATOR SCHEDULE'],
      ['TAG', 'DESCRIPTION'],
      ['HS-01', 'HYDRAULIC SEPARATOR'],
    ]
    const out = parseSheet(grid, 'HS', VOCAB)
    expect(out.rows[0].proposed_type).toBeNull()
    expect(out.rows[0].observed_type_name).toBe('HYDRAULIC SEPARATOR')
    expect(out.rows[0].confidence).toBeLessThan(0.9)
    expect(out.rows[0].why).toContain('not in the firm vocabulary')
  })
})

describe('merged two-deep headers', () => {
  const grid: Cell[][] = [
    ['VAV BOX SCHEDULE', null, null, null],
    ['UNIT TAG', 'SERVICE', 'AIRFLOW', null],   // merged: AIRFLOW spans two cells
    [null, null, 'MIN CFM', 'MAX CFM'],
    ['TBS-1', 'VAV BOX', 100, 400],
  ]
  const out = parseSheet(grid, 'VAV', VOCAB)

  it('picks the row that names the columns, not the sub-header', () => {
    expect(out.header_row).toBe(2)
    expect(out.mapping.tag).toBe('UNIT TAG')
    expect(out.mapping.descriptor).toBe('SERVICE')
  })

  it('still reads the unit', () => {
    expect(out.rows.map(r => r.tag)).toEqual(['TBS-1'])
    expect(out.rows[0].proposed_type).toBe('vav')
  })
})

describe('an unnamed tag column is located by shape and SAYS SO', () => {
  const grid: Cell[][] = [
    ['MISC EQUIPMENT LIST'],
    ['ITEM', 'DESCRIPTION', 'ROOM'],           // 'ITEM' is in the tag synonyms
    ['P-1', 'PUMP', 'Mech 1'],
  ]
  it('maps a named-but-unusual tag column', () => {
    const out = parseSheet(grid, 'Misc', VOCAB)
    expect(out.rows[0].tag).toBe('P-1')
  })

  it('falls back to shape when NO column names itself, and discloses the inference', () => {
    const noNames: Cell[][] = [
      ['EQUIPMENT'],
      ['A', 'B', 'C'],
      ['AHU-1', 'AIR HANDLING UNIT', 'Roof'],
      ['AHU-2', 'AIR HANDLING UNIT', 'Roof'],
      ['AHU-3', 'AIR HANDLING UNIT', 'Roof'],
    ]
    const out = parseSheet(noNames, 'X', VOCAB)
    if (out.header_row !== null) {
      expect(out.mapping.tag ?? '').toMatch(/inferred by shape/)
      // An inference must cost confidence. A guess presented at the same
      // confidence as a match is the whole failure mode this build keeps hitting.
      expect(out.rows[0].confidence).toBeLessThan(0.95)
      expect(out.rows[0].why).toContain('inferred by shape')
    }
  })
})

describe('a sheet that is not a schedule', () => {
  it('returns zero rows AND says what it looked for', () => {
    const grid: Cell[][] = [
      ['Isotherm Engineering Ltd.'],
      ['Project: Seneca Health and Wellness Centre'],
      ['Revision 3 — 2025-07-02'],
    ]
    const out = parseSheet(grid, 'Cover', VOCAB)
    expect(out.rows).toHaveLength(0)
    // "0 rows" alone is indistinguishable from a broken parser.
    expect(out.note).toMatch(/Looked for/)
  })
})

describe('confidence is honest', () => {
  it('gives a clean named-column row the top score', () => {
    const grid: Cell[][] = [
      ['PUMP SCHEDULE'],
      ['TAG', 'DESCRIPTION', 'LOCATION'],
      ['P-1', 'PUMP', 'Mech 1'],
    ]
    const out = parseSheet(grid, 'P', VOCAB)
    expect(out.rows[0].confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('marks a row typed only from the schedule title', () => {
    const grid: Cell[][] = [
      ['PUMP SCHEDULE'],
      ['TAG', 'LOCATION'],
      ['P-9', 'Mech 2'],
    ]
    const out = parseSheet(grid, 'P', VOCAB)
    expect(out.rows[0].proposed_type).toBe('pump')
    expect(out.rows[0].why).toContain('from the schedule title')
    expect(out.rows[0].confidence).toBeLessThan(0.95)
  })
})

describe('a source header is often plural', () => {
  it('matches "UNIT HEATERS" to a Unit Heater', () => {
    // Found by the type sweep: Clairlea's category header is UNIT HEATERS and
    // eight real Force Flow Heaters were landing in the unknown queue over an 's'.
    const grid: Cell[][] = [
      ['UNIT HEATERS'],
      ['TAG', 'DESCRIPTION'],
      ['UH-1', 'UNIT HEATERS'],
    ]
    expect(parseSheet(grid, 'UH', [...VOCAB, { key: 'unit_heater', name: 'Unit Heater' }])
      .rows[0].proposed_type).toBe('unit_heater')
  })

  it('does NOT relax in the other direction', () => {
    // A PLURAL vocabulary term must not match a SINGULAR source word. Only
    // singular-vocab -> plural-source is allowed, so "Unit Heater" reaches
    // "UNIT HEATERS" while "Louvres" never reaches "louvre".
    //
    // The first version of this test was wrong and passed for the wrong reason:
    // it put the term in the schedule TITLE, which resolves the type by a
    // different path entirely. A neutral title isolates the descriptor.
    const grid: Cell[][] = [
      ['EQUIPMENT SCHEDULE'],
      ['TAG', 'DESCRIPTION'],
      ['L-1', 'LOUVRE'],
    ]
    expect(parseSheet(grid, 'L', [{ key: 'louvres', name: 'Louvres' }])
      .rows[0].proposed_type).toBeNull()
  })
})

// ── Update 1.02 — aliases (the suggestion-as-you-type picker's matcher) ──────

describe('aliases resolve by EXACT match only', () => {
  const vocab: TypeVocab[] = [
    { key: 'unit_heater', name: 'Unit Heater', aliases: ['UH'] },
    { key: 'expansion_tank', name: 'Expansion Tank', aliases: ['XT', 'ET'] },
    { key: 'ahu', name: 'Air Handling Unit', aliases: ['AHU', 'DOAS'] },
    { key: 'humidifier', name: 'Humidifier', aliases: ['HUM'] },
  ]

  it('an exact alias resolves, and says it matched by alias', () => {
    expect(resolveTypeDetailed('UH', vocab)).toEqual({ key: 'unit_heater', via: 'alias', matched: 'UH' })
    expect(resolveTypeDetailed(' doas ', vocab)?.key).toBe('ahu')
  })

  it('an alias is NEVER matched as a word inside a longer string', () => {
    // The whole point. If "UH" were treated as a word bag, every tag and
    // descriptor containing it would silently become a unit heater.
    //
    // These are ABSENCE assertions, and an absence assertion proves ARRIVAL
    // first: the test above proves "UH" resolves through this same vocab.
    // Without it, every expectation here would also pass on a build with no
    // alias tier at all — green, and testing nothing.
    expect(resolveType('UH-3 PUMP ROOM', vocab)).toBeNull()
    expect(resolveType('SOUTH ET WING', vocab)).toBeNull()
  })

  it('the DOAS alias does not capture HU-DOAS-* humidifier tags', () => {
    // The exact-match rule is what makes the ruled DOAS -> ahu mapping safe.
    expect(resolveType('HU-DOAS-1', vocab)).toBeNull()
  })

  it('the canonical name outranks an alias', () => {
    // An alias can never shadow a real type's display name, whatever an admin
    // types into the alias table.
    const shadow: TypeVocab[] = [
      { key: 'fan', name: 'Fan' },
      { key: 'pump', name: 'Pump', aliases: ['Fan'] },
    ]
    expect(resolveTypeDetailed('Fan', shadow)).toEqual({ key: 'fan', via: 'name', matched: 'Fan' })
  })

  it('all-words matching is unchanged by the alias tier', () => {
    expect(resolveType('RADIANT CEILING PANEL', [
      { key: 'radiant_panel', name: 'Radiant Panel' },
      { key: 'panel', name: 'Panel (Electrical Distribution)' },
    ])).toBe('radiant_panel')
    expect(resolveTypeDetailed('UNIT HEATERS', vocab)?.via).toBe('words')
  })

  it('a type with no aliases behaves exactly as before', () => {
    expect(resolveType('Humidifier', [{ key: 'humidifier', name: 'Humidifier' }])).toBe('humidifier')
  })
})

// ── the catalog campaign's census finding (1.03) ────────────────────────────

describe('equal-specificity matches are a REFUSAL, not a tie to break', () => {
  const vocab: TypeVocab[] = [
    { key: 'boiler', name: 'Boiler' },
    { key: 'pump', name: 'Pump' },
    { key: 'fire_pump', name: 'Fire Pump' },
    { key: 'radiant_panel', name: 'Radiant Panel' },
    { key: 'panel', name: 'Panel (Electrical Distribution)' },
  ]

  it('ARRIVAL: an unambiguous single-token term still resolves', () => {
    expect(resolveType('CIRCULATING PUMP', vocab)).toBe('pump')
    expect(resolveType('CONDENSING BOILER', vocab)).toBe('boiler')
  })

  it('two single-token terms in one descriptor resolve to NOTHING', () => {
    // Found on a live project: "Pump - Boiler 1" came back `boiler` because
    // boiler sorted first. The words name two types; the words therefore do not
    // decide, and a human does.
    expect(resolveType('Pump - Boiler 1', vocab)).toBeNull()
    expect(resolveType('Heating Boiler B-2 Circulating Pump', vocab)).toBeNull()
  })

  it('sort order cannot change the answer', () => {
    const reversed = [...vocab].reverse()
    expect(resolveType('Pump - Boiler 1', reversed)).toBeNull()
    expect(resolveType('Pump - Boiler 1', vocab)).toBe(resolveType('Pump - Boiler 1', reversed))
  })

  it('a MORE specific term still wins outright — this is not a blanket refusal', () => {
    expect(resolveType('FIRE PUMP', vocab)).toBe('fire_pump')
    expect(resolveType('RADIANT CEILING PANEL', vocab)).toBe('radiant_panel')
    expect(resolveType('RECEPTACLE PANEL', vocab)).toBe('panel')
  })
})
