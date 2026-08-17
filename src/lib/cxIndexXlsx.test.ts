// The xlsx builder's structural gate — the unzip-and-grep assertion the Q3
// ruling requires, run at unit speed. The battery's pw leg does the same
// against a real browser download; real-Excel and LibreOffice opens are the
// human half of the gate. This half pins the XML the other halves depend on.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildCxIndexXlsx, cxIndexXlsxBlob } from './cxIndexXlsx'
import type { CxIndexXlsxInput } from './cxIndexXlsx'

const FIXTURE: CxIndexXlsxInput = {
  projectName: 'ZZ-FIXTURE',
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
    ['e1:c1', 'done'], ['e2:c1', 'done'],           // ahu type complete on c1
    ['e3:c1', 'in_progress'],
    ['e1:c3', 'done'],
  ]),
  na: new Set(['e3:c2']),                            // overlay-N/A
  generatedStamp: 'Generated 2026-08-17 — reflects register at generation',
}

describe('buildCxIndexXlsx — the workbook is real, and its numbers are the rule’s', () => {
  const { sheetXml, files } = buildCxIndexXlsx(FIXTURE)

  it('freezes the identity columns and both header rows (the sticky analogue)', () => {
    expect(sheetXml).toContain('<pane xSplit="3" ySplit="2" topLeftCell="D3" activePane="bottomRight" state="frozen"/>')
  })

  it('rotates the column headers natively (textRotation 90 in the style table)', () => {
    expect(files['xl/styles.xml']).toContain('textRotation="90"')
    expect(sheetXml).toContain('Shop Dwgs — by type')
  })

  it('writes statuses as real cell values, escaped', () => {
    expect(sheetXml).toContain('<t xml:space="preserve">Done</t>')
    expect(sheetXml).toContain('<t xml:space="preserve">In progress</t>')
    expect(sheetXml).toContain('HW pump &amp; &lt;special&gt; &quot;chars&quot;')
  })

  it('stats are computed VALUES from the shared rule, never formulas', () => {
    // c1 by type: ahu complete (2/2 done), pump not (in_progress) → 1/2
    expect(sheetXml).toContain('<t xml:space="preserve">1/2</t>')
    // c3 by unit: 1 done / 3 applicable → 33%
    expect(sheetXml).toContain('<t xml:space="preserve">33%</t>')
    expect(sheetXml).not.toContain('<f>')             // no formulas anywhere
  })

  it('overlay-N/A renders N/A and leaves the type math (the one-rule discipline)', () => {
    // e3:c2 overlay → N/A text; c2 by type: ahu 0/2 done → 0 complete of… ahu in scope,
    // pump out of scope (its only unit N/A) → 0/1
    expect(sheetXml).toContain('<t xml:space="preserve">N/A</t>')
    expect(sheetXml).toContain('<t xml:space="preserve">0/1</t>')
  })

  it('group bands merge across their columns; category rows merge full-width', () => {
    expect(sheetXml).toMatch(/<mergeCells count="\d+">/)
    expect(sheetXml).toContain('<mergeCell ref="D1:E1"/>')   // Doc Review Stage spans c1..c2
  })

  it('the D5 stamp rides the print footer AND a visible row', () => {
    expect(sheetXml).toContain('reflects register at generation')
    expect(sheetXml).toMatch(/<oddFooter>.*reflects register at generation.*<\/oddFooter>/)
  })

  it('the package unzips whole: every part present and XML-parseable', async () => {
    const blob = await cxIndexXlsxBlob(FIXTURE)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
                        'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
      const content = await zip.file(part)!.async('string')
      expect(content.length, part).toBeGreaterThan(50)
      // Cheap well-formedness: every part must start with an XML declaration.
      expect(content.startsWith('<?xml'), `${part} starts with <?xml`).toBe(true)
    }
  })
})
