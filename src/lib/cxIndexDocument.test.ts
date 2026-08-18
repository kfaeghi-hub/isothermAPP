// The PDF builder's structural gate (Phase 2b). Three laws pinned:
//   · Amendment 2's rider — COLOUR IS REDUNDANT: every non-blank status
//     renders a DRAWN mark whether or not its fill exists; grayscale keeps
//     the register readable because the marks are the carrier.
//   · THE STATS INVARIANT — the per-column stats row is a <tfoot>, so it
//     repeats on every printed page of every strip, in the one shared form
//     (statLabel: unit n/N, type K/N).
//   · ZERO LABEL TRUNCATION — labelFontPt guarantees the longest firm label
//     fits its budget whole; the '*' by-type marker is ASCII by design (the
//     serverless font already ate one glyph this build).
import { describe, expect, it } from 'vitest'
import { buildCxIndexHtml } from '../../api/_shared/cx-index-document'
import type { CxIndexInput } from '../../api/_shared/cx-index-document'

const FIXTURE: CxIndexInput = {
  projectName: 'ZZ-FIXTURE',
  comNumber: '000000',
  clientName: 'Client Co.',
  address: '1 Test Way',
  groups: [
    { name: 'Doc Review Stage', columns: [
      { id: 'c1', label: 'Shop Dwgs', scope: 'type' },
      { id: 'c2', label: 'Contact / Bolted Connection Resistance (Ductor) Report', scope: 'unit' },
    ]},
    { name: 'Start Up', columns: [{ id: 'c3', label: 'Start-Up Checklist Issued', scope: 'unit' }] },
  ],
  equipment: [
    { id: 'e1', tag: 'AHU-1', descriptor: 'Rooftop', category: 'Air Side', equipment_type: 'ahu' },
    { id: 'e2', tag: 'AHU-2', descriptor: null, category: 'Air Side', equipment_type: 'ahu' },
    { id: 'e3', tag: 'P-1', descriptor: null, category: 'Pumps', equipment_type: 'pump' },
  ],
  cells: new Map([
    ['e1:c1', 'done'], ['e2:c1', 'done'], ['e3:c1', 'in_progress'],
    ['e1:c3', 'done'], ['e2:c3', 'done'], ['e3:c3', 'done'],
  ]),
  na: new Set(['e3:c2']),
}

describe('buildCxIndexHtml — Phase 2b invariants', () => {
  const { html, stats } = buildCxIndexHtml(FIXTURE)

  it('every non-blank status draws its mark, fills or not (colour is redundant)', () => {
    expect(html).toContain('c-done')                       // fill present…
    expect(html.match(/c-done"><span class="m m-done"/)?.length ?? 0).toBeGreaterThan(0) // …and the mark rides it
    expect(html).toContain('m m-half')
    expect(html).toContain('m m-dna')
    expect(html).toContain('print-color-adjust: exact')
  })

  it('the stats row is a tfoot — it repeats on every printed page', () => {
    expect(html).toMatch(/<tfoot><tr class="stats">/)
    expect(html).toContain('PER COLUMN')
  })

  it('stats use the one shared form: unit n/N, type K/N', () => {
    // c3 unit: 3/3 · c1 type: ahu complete, pump not → 1/2 · c2 unit: 2 applicable, 0 done → 0/2
    expect(html).toContain('<td>3/3</td>')
    expect(html).toContain('<td>1/2</td>')
    expect(html).toContain('<td>0/2</td>')
    expect(html).not.toMatch(/<td>\d+%<\/td>/)             // no % form in the stats row
  })

  it('group bands render inside the strip with their palette', () => {
    expect(html).toMatch(/th class="band" colspan="2" style="background:#e2e8f0/)
    expect(html).toContain('Start Up')
  })

  it("the by-type marker is ASCII '*' and rotated labels carry a computed fit size", () => {
    expect(html).toContain('Shop Dwgs *')
    // The 53-char ductor label gets a size below default but above the floor —
    // whole, never truncated.
    const m = html.match(/font-size:(\d+\.\d+)pt">Contact \/ Bolted/)
    expect(m).not.toBeNull()
    expect(parseFloat(m![1])).toBeGreaterThanOrEqual(4.5)
    expect(parseFloat(m![1])).toBeLessThan(6.5)
  })

  it('the cover is a submittal cover and the document ends deliberately', () => {
    expect(html).toContain('Prepared by')
    expect(html).toContain('Client Co.')
    expect(html).toContain('1 Test Way')
    expect(html).toContain('End of Commissioning Index')
  })

  it('descriptor narrows when sparse — here content exists, so it grows', () => {
    expect(html).toContain('width:1.35in')
    const bare = buildCxIndexHtml({ ...FIXTURE,
      equipment: FIXTURE.equipment.map(e => ({ ...e, descriptor: null })) })
    expect(bare.html).toContain('width:0.45in')
  })

  it('packing reports its strip count', () => {
    expect(stats.strips).toBe(1)                            // 3 columns fit one strip
  })
})
