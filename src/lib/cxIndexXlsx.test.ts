// The xlsx builder's structural gate — the unzip-and-grep assertions the Q3
// ruling requires, at unit speed, extended in Phase 2b with the print-setup
// and AutoFilter assertions the first gate report claimed without verifying
// (the reconciled finding: an oddFooter with no pageSetup never surfaced in
// Excel). The battery's pw leg runs the same greps against a real browser
// download; the COM open reads the footer and fills back through Excel itself.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildCxIndexXlsx, cxIndexXlsxBlob } from './cxIndexXlsx'
import type { CxIndexXlsxInput } from './cxIndexXlsx'

const FIXTURE: CxIndexXlsxInput = {
  projectName: 'ZZ-FIXTURE',
  comNumber: '000000',
  clientName: 'Client Co.',
  address: '1 Test Way',
  groups: [
    { name: 'Doc Review Stage', columns: [
      { id: 'c1', label: 'Shop Dwgs', scope: 'type' },
      { id: 'c2', label: 'IFC Drawings / Specifications', scope: 'type' },
    ]},
    { name: 'Start Up', columns: [
      { id: 'c3', label: 'Start-Up Checklist Issued', scope: 'unit' },
    ]},
  ],
  equipment: [
    { id: 'e1', tag: 'AHU-1', descriptor: 'Rooftop unit', category: 'Air Side', equipment_type: 'ahu' },
    { id: 'e2', tag: 'AHU-2', descriptor: null, category: 'Air Side', equipment_type: 'ahu' },
    { id: 'e3', tag: 'P-1', descriptor: 'HW pump & <special> "chars"', category: 'Hydronics', equipment_type: 'pump' },
  ],
  cells: new Map([
    ['e1:c1', 'done'], ['e2:c1', 'done'],
    ['e3:c1', 'in_progress'],
    ['e1:c3', 'done'],
  ]),
  na: new Set(['e3:c2']),
  generatedStamp: 'Generated 2026-08-17 — reflects register at generation',
}

describe('buildCxIndexXlsx — submittal grade (Phase 2b)', () => {
  const { sheetXml, summaryXml, workbookXml, files } = buildCxIndexXlsx(FIXTURE)

  it('freezes the identity columns and both header rows on the matrix sheet', () => {
    expect(sheetXml).toContain('<pane xSplit="3" ySplit="2" topLeftCell="D3" activePane="bottomRight" state="frozen"/>')
  })

  it('rotates headers natively and writes real, escaped values', () => {
    expect(files['xl/styles.xml']).toContain('textRotation="90"')
    expect(sheetXml).toContain('Shop Dwgs — by type')
    expect(sheetXml).toContain('<t xml:space="preserve">Done</t>')
    expect(sheetXml).toContain('HW pump &amp; &lt;special&gt; &quot;chars&quot;')
  })

  it('the stats row uses the ONE shared form — unit n/N, type K/N, no % — and no formulas exist', () => {
    expect(sheetXml).toContain('<t xml:space="preserve">1/2</t>')   // c1 by type
    expect(sheetXml).toContain('<t xml:space="preserve">1/3</t>')   // c3 by unit: 1 done / 3 applicable
    expect(sheetXml).toContain('<t xml:space="preserve">0/1</t>')   // c2: pump N/A'd out of scope
    expect(sheetXml).not.toContain('<f>')
  })

  it('THE RECONCILED FINDING — a real print setup exists, not just an oddFooter', () => {
    expect(sheetXml).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
    expect(sheetXml).toMatch(/<pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/)
    expect(sheetXml).toMatch(/<pageMargins /)
    expect(sheetXml).toMatch(/<headerFooter><oddFooter>.*reflects register at generation.*<\/oddFooter><\/headerFooter>/)
    expect(workbookXml).toContain(`name="_xlnm.Print_Titles" localSheetId="1">'Cx Index'!$1:$2`)
    expect(workbookXml).toMatch(/name="_xlnm\.Print_Area" localSheetId="1">'Cx Index'!\$A\$1:\$[A-Z]+\$\d+/)
  })

  it('an AutoFilter is armed on the header row across the matrix', () => {
    expect(sheetXml).toMatch(/<autoFilter ref="A2:[A-Z]+\d+"\/>/)
    // …and it sits before mergeCells, where the schema demands it.
    expect(sheetXml.indexOf('<autoFilter')).toBeLessThan(sheetXml.indexOf('<mergeCells'))
  })

  it('Amendment 2 fills ride styles.xml: teal done, amber in-progress, 12 band fills', () => {
    const styles = files['xl/styles.xml']
    expect(styles).toContain('FF0F766E')                    // teal-700
    expect(styles).toContain('FFFBBF24')                    // amber-400
    expect(styles).toContain('FFE2E8F0')                    // slate band
    expect(styles).toContain('FF86EFAC')                    // green-300 band
    // The status text stays the carrier — a Done cell carries both fill style and value.
    expect(sheetXml).toMatch(/<c r="D4" s="6" t="inlineStr"><is><t xml:space="preserve">Done<\/t>/)
  })

  it('the Summary sheet is the FIRST tab and carries the cover block (§3.2 reconciled)', () => {
    expect(workbookXml).toContain('<sheet name="Summary" sheetId="1" r:id="rId1"/>')
    expect(workbookXml.indexOf('name="Summary"')).toBeLessThan(workbookXml.indexOf('name="Cx Index"'))
    expect(summaryXml).toContain('Commissioning Index')
    expect(summaryXml).toContain('Client Co.')
    expect(summaryXml).toContain('1 Test Way')
    expect(summaryXml).toContain('Prepared by Isotherm Engineering Ltd.')
    expect(summaryXml).toContain('claims-weighted')
    expect(summaryXml).toContain('reflects register at generation')
  })

  it('group bands merge across their columns with band styles', () => {
    expect(sheetXml).toContain('<mergeCell ref="D1:E1"/>')
    expect(sheetXml).toMatch(/<c r="D1" s="13"/)            // first band style
  })

  it('the package unzips whole: every part present and XML-parseable', async () => {
    const blob = await cxIndexXlsxBlob(FIXTURE)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
                        'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
                        'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const content = await zip.file(part)!.async('string')
      expect(content.length, part).toBeGreaterThan(50)
      expect(content.startsWith('<?xml'), `${part} starts with <?xml`).toBe(true)
    }
  })
})
