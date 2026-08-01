// The parser against a REAL .xlsx, not a hand-built grid.
//
// intakeExcel.test.ts proves the LOGIC over cell arrays. This proves the seam:
// that read-excel-file hands back the grid shape parseSheet expects — merged
// cells blank-to-the-right, 1-based rows, numbers as numbers, trailing nulls.
//
// The seam is where the last two classes of defect in this build actually lived.
// A logic test over a grid I typed myself cannot catch a reader that returns
// something subtly different from what I typed.
//
// The fixture is generated, not borrowed: invented tags and rooms, no client
// content, committed so the gate runs anywhere.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseSheet, type Cell, type TypeVocab } from './intakeExcel'

const VOCAB: TypeVocab[] = [
  { key: 'pump', name: 'Pump' },
  { key: 'vav', name: 'VAV Box' },
  { key: 'fan', name: 'Fan' },
]

/** The browser build takes a File/Blob; under vitest a Buffer is the same bytes. */
async function readFixture() {
  const readXlsxFile = (await import('read-excel-file/node')).default
  const buf = readFileSync('fixtures/intake-sample.xlsx')
  return await readXlsxFile(buf, { trim: true })
}

describe('a real workbook through the real reader', () => {
  it('returns every sheet in one read, named', async () => {
    const sheets = await readFixture()
    expect(sheets.map(s => s.sheet)).toEqual(['Pumps', 'VAV', 'Cover'])
  })

  it('parses the clean schedule and drops the notes line', async () => {
    const sheets = await readFixture()
    const out = parseSheet(sheets[0].data as Cell[][], 'Pumps', VOCAB)
    expect(out.title).toBe('HYDRONIC PUMP SCHEDULE')
    expect(out.proposed_category).toBe('HYDRONIC PUMP')
    expect(out.rows.map(r => r.tag)).toEqual(['P-01', 'P-02', 'P-03'])
    expect(out.rows.every(r => r.proposed_type === 'pump')).toBe(true)
  })

  it('keeps the engineering columns the schema has no field for', async () => {
    const sheets = await readFixture()
    const out = parseSheet(sheets[0].data as Cell[][], 'Pumps', VOCAB)
    // Numbers survive the reader as numbers and are stringified for jsonb.
    expect(out.rows[0].nameplate).toEqual({ 'GPM': '120', 'HEAD (FT)': '45' })
  })

  it('survives a genuinely merged header cell', async () => {
    const sheets = await readFixture()
    const out = parseSheet(sheets[1].data as Cell[][], 'VAV', VOCAB)
    expect(out.mapping.tag).toBe('UNIT TAG')
    expect(out.rows.map(r => r.tag)).toEqual(['TBS-101', 'TBS-102'])
    expect(out.rows[0].proposed_type).toBe('vav')
  })

  it('reports zero rows on a cover page and says what it looked for', async () => {
    const sheets = await readFixture()
    const out = parseSheet(sheets[2].data as Cell[][], 'Cover', VOCAB)
    expect(out.rows).toHaveLength(0)
    expect(out.note).toMatch(/Looked for/)
  })

  it('numbers rows the way Excel does, so a reviewer can find them', async () => {
    const sheets = await readFixture()
    const out = parseSheet(sheets[0].data as Cell[][], 'Pumps', VOCAB)
    // Title row 1, blank row 2, header row 3, first pump row 4.
    expect(out.header_row).toBe(3)
    expect(out.rows[0].source_row).toBe(4)
  })
})
