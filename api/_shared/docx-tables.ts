// docx-tables — the docx must hold its columns the way the PDF does.
// [RIVET] 2026-08-16: born in generate-checklist (cycle-2 D1), extracted here
// when the owner ruled the same treatment for doc-common's families (site
// reports, minutes). ONE implementation — two patchers would be two sets of
// rules that drift, and this one's rules were paid for:
//
// MEASURED MECHANISM (checklist families, and the library is the same for
// all): html-to-docx declares NO w:tblLayout on any table (Word therefore
// autofits and re-flows), emits an EMPTY w:tblGrid for a colspan-headed
// table plus a SECOND mid-table grid with FRACTIONAL widths (invalid value,
// invalid position), and equal-width grids elsewhere.
//
// THE REPAIR: each top-level table's grid is rewritten to the BUILDER'S
// declared proportions (the same numbers the PDF colgroups use) — one integer
// grid summing exactly to the table's own width — and w:tblLayout fixed is
// pinned. It REFUSES WHOLE on a top-level count mismatch: splicing widths
// into the wrong table is worse than leaving autofit, and the refusal names
// the drift the day a table is added without its tableGrids row.
//
// NESTED TABLES ARE LEFT EXACTLY AS EMITTED. The site report nests photo
// tables inside issue cells; images size themselves and autofit is correct
// there. Declared grids describe TOP-LEVEL tables only, in emission order.

import JSZip from 'jszip'

interface Span { start: number; end: number }

/** Top-level <w:tbl> spans via a depth walk — a lazy regex would end an outer
 *  table at its first NESTED close and splice the wrong element. Exported so
 *  gates count tables with the SAME walker the patcher uses (one instrument). */
export function topLevelTables(xml: string): Span[] {
  const spans: Span[] = []
  const re = /<w:tbl>|<\/w:tbl>/g
  let depth = 0
  let start = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    if (m[0] === '<w:tbl>') {
      if (depth === 0) start = m.index
      depth++
    } else {
      depth--
      if (depth === 0 && start >= 0) { spans.push({ start, end: m.index + m[0].length }); start = -1 }
    }
  }
  if (depth !== 0) throw new Error(`docx-tables: unbalanced w:tbl nesting (depth ${depth} at end) — refusing to patch.`)
  return spans
}

// The mask sentinel is NUL-delimited, built AT RUNTIME from a code point so
// this source file stays pure ASCII on that line. Well-formed XML cannot
// contain U+0000, so the placeholder can never collide with document text
// (a visible " TBL0 " could — a tag named TBL0 is conceivable). This file's
// first draft carried LITERAL control characters that rendered as ordinary
// spaces and defeated review twice — the 0x08-backspace lesson, verbatim,
// which is why the character is constructed and never typed.
const NUL = String.fromCharCode(0)
const MASK = (i: number) => `${NUL}TBL${i}${NUL}`
const MASK_RE = new RegExp(`${NUL}TBL(\\d+)${NUL}`, 'g')

function patchOneTable(tbl: string, pcts: number[]): string {
  // Mask nested tables so their grids and tblPr are untouched. `inner` is in
  // document order; masking runs right-to-left so earlier offsets stay valid,
  // while MASK(i) carries the document-order index — nested[i] and its
  // sentinel therefore always correspond.
  const raw = tbl.slice('<w:tbl>'.length, -'</w:tbl>'.length)
  const inner = topLevelTables(raw)
  const nested = inner.map(s => raw.slice(s.start, s.end))
  let body = raw
  for (let i = inner.length - 1; i >= 0; i--) {
    body = body.slice(0, inner[i].start) + MASK(i) + body.slice(inner[i].end)
  }

  if (!/<\/w:tblPr>/.test(body)) {
    throw new Error('docx-tables: a top-level table carries no tblPr — refusing to guess where its grid belongs.')
  }
  const tblW = Number(/<w:tblW[^>]*w:w="(\d+)"/.exec(body)?.[1] ?? 10080)
  const widths = pcts.map(p => Math.floor((tblW * p) / 100))
  widths[widths.length - 1] += tblW - widths.reduce((a, b) => a + b, 0)
  const grid = `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`

  let out = body.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g, '')
  out = out.replace(/<\/w:tblPr>/, `</w:tblPr>${grid}`)
  if (!/<w:tblLayout/.test(out)) {
    out = /<w:tblCellMar>/.test(out)
      ? out.replace(/<w:tblCellMar>/, '<w:tblLayout w:type="fixed"/><w:tblCellMar>')
      : out.replace(/<\/w:tblPr>/, '<w:tblLayout w:type="fixed"/></w:tblPr>')
  }

  out = out.replace(MASK_RE, (_: string, i: string) => nested[Number(i)])
  return `<w:tbl>${out}</w:tbl>`
}

export async function fixDocxTables(docx: Buffer, tableGrids: number[][]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docx)
  const path = 'word/document.xml'
  const xml = await zip.file(path)!.async('string')

  const spans = topLevelTables(xml)
  if (spans.length !== tableGrids.length) {
    throw new Error(
      `docx-tables: ${spans.length} top-level tables in the docx vs ${tableGrids.length} declared grids — ` +
      'refusing to splice widths into the wrong table. A table was added without its tableGrids row.',
    )
  }

  let patched = ''
  let cursor = 0
  spans.forEach((s, i) => {
    patched += xml.slice(cursor, s.start) + patchOneTable(xml.slice(s.start, s.end), tableGrids[i])
    cursor = s.end
  })
  patched += xml.slice(cursor)

  zip.file(path, patched)
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
