// docx-skeleton — inject composed content into a REAL Word document.
//
// THE SECOND DOCX MECHANISM IN THIS SYSTEM, deliberately (ruling D3b, recorded
// so nobody later "unifies" the two). `doc-common`'s html-to-docx path generates
// site reports, minutes and checklists: short, tabular, generated documents. The
// Cx Plan is a long-form styled document with a table of contents, multi-level
// numbering and section-varying headers. Those are different problems.
//
// THE INSIGHT THAT MAKES THIS CHEAP: we do not generate Word XML. We generate
// PARAGRAPHS THAT REFERENCE STYLES THE SKELETON ALREADY DEFINES. The skeleton is
// authored once in Word; styles.xml, numbering.xml, header*.xml, footer*.xml and
// settings.xml are never touched. The TOC field survives untouched and updates
// when Word opens the file, because it is a real field — not a rendered list.
//
// Assessed against the alternative (rebuilding 157 style definitions, multi-level
// numbering, four header/footer pairs and a TOC field in an HTML→docx generator)
// and chosen because output that opens in Word as-if-native is the bar, and the
// only way to be native is to BE native.
import JSZip from 'jszip'

/** Everything between these two markers in the skeleton's body is replaced. */
export const BODY_START = 'ISOTHERM_BODY_START'
export const BODY_END = 'ISOTHERM_BODY_END'

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'title'; text: string }
  | { kind: 'cover'; text: string }
  | { kind: 'pagebreak' }
  | { kind: 'toc' }
  | { kind: 'table'; header: string[]; rows: string[][] }

/** Style IDs the skeleton must define. Asserted at inject time rather than
 *  assumed — a missing style renders as Normal and silently loses the outline,
 *  which would also lose the TOC entries that depend on it. */
export const REQUIRED_STYLES = [
  'Title', 'Heading1', 'Heading2', 'Heading3', 'BodyText-ABC', 'Bullet1-ABC',
] as const

const STYLE_FOR: Record<string, string> = {
  title: 'Title', cover: 'FrontCoverBody',
  h1: 'Heading1', h2: 'Heading2', h3: 'Heading3',
  para: 'BodyText-ABC', bullet: 'Bullet1-ABC',
}

/**
 * A substitution that replaces NOTHING is a bug, and it fails here.
 *
 * THE THIRD INSTANCE OF THE SILENCE CLASS, so it becomes a mechanism rather than
 * a lesson. The first was `revoke ... from anon`, which was inert while looking
 * like a lock. The second was a served-bundle deploy check pointed at an
 * endpoint that predated the commit. The third was this module's own skeleton
 * re-tint: it substituted a navy that this template does not use, replaced zero
 * values, reported success, and left the document the wrong colour through
 * twelve passing assertions.
 *
 * All three share one shape: an operation that cannot fail is not a check. Any
 * find-and-replace over document XML must therefore assert its own effect.
 */
export function substituteOrThrow(
  haystack: string, find: string | RegExp, replace: string, what: string,
): string {
  const before = haystack
  const out = typeof find === 'string'
    ? haystack.split(find).join(replace)
    : haystack.replace(find, replace)
  if (out === before) {
    throw new Error(
      `substitution matched nothing: ${what}. A replace that changes nothing is ` +
      `a silent failure — fix the pattern or remove the call.`)
  }
  return out
}

/** XML-escape. Every piece of generated text goes through this — a stray `&` in
 *  a company name produces a file Word refuses to open, and the failure looks
 *  like a corrupt document rather than an escaping bug. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const p = (style: string, text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>` +
  (text ? `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : '') +
  `</w:p>`

const pageBreak = () =>
  `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`

/**
 * A REAL Word TOC field, not a rendered list.
 *
 * This is the half of the skeleton decision that earns its keep: the field
 * rebuilds itself from the Heading1/2/3 paragraphs when the document opens, so
 * page numbers are correct after any edit and the reader gets working
 * click-through navigation. A generated list of headings is stale the moment
 * anyone touches the file.
 *
 * Switches: outline levels 1-3, hyperlinked entries, hide tab leaders in web
 * view, use the applied paragraph outline. settings.xml carries
 * updateFields=true so Word refreshes it on open.
 *
 * Composed rather than inherited: the skeleton supplies styles and settings,
 * and the document's structure is entirely generated. That keeps the skeleton a
 * pure style carrier with nothing project-shaped baked in.
 */
const tocField = () =>
  `<w:p><w:pPr><w:pStyle w:val="TOCHeading1"/></w:pPr><w:r><w:t>Contents</w:t></w:r></w:p>` +
  `<w:p>` +
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  `<w:r><w:t>Right-click and choose Update Field to build the contents.</w:t></w:r>` +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
  `</w:p>`

/**
 * Table cells use `BodyText-ABC` with DIRECT bold on the header row, not the
 * skeleton's inherited `CellBody-ABC` / `CellHeading-ABC`.
 *
 * Why: `CellBody-ABC` renders WHITE text — it was authored for a filled cell in
 * the source template. Using it produced a table whose data rows were present in
 * the XML and invisible on the page. Twelve structural assertions passed on that
 * document; only looking at it caught the fault. Depending on the visual
 * definition of an inherited style is a bet, so this makes no such bet.
 */
function table(header: string[], rows: string[][]): string {
  const cellP = (t: string, bold: boolean) =>
    `<w:p><w:pPr><w:pStyle w:val="BodyText-ABC"/>` +
    (bold ? `<w:rPr><w:b/></w:rPr>` : '') + `</w:pPr>` +
    `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}` +
    `<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`
  const cell = (t: string, bold: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${cellP(t, bold)}</w:tc>`
  const tr = (cells: string[], bold: boolean) =>
    `<w:tr>${cells.map(c => cell(c, bold)).join('')}</w:tr>`
  return `<w:tbl>` +
    `<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>` +
    tr(header, true) +
    rows.map(r => tr(r, false)).join('') +
    `</w:tbl>`
}

export function renderBlocks(blocks: Block[]): string {
  const out: string[] = []
  for (const b of blocks) {
    switch (b.kind) {
      case 'title':     out.push(p(STYLE_FOR.title, b.text)); break
      case 'cover':     out.push(p(STYLE_FOR.cover, b.text)); break
      case 'heading':   out.push(p(STYLE_FOR[`h${b.level}`], b.text)); break
      case 'para':      out.push(p(STYLE_FOR.para, b.text)); break
      case 'bullet':    out.push(p(STYLE_FOR.bullet, b.text)); break
      case 'pagebreak': out.push(pageBreak()); break
      case 'toc':       out.push(tocField()); break
      case 'table':     out.push(table(b.header, b.rows)); break
    }
  }
  return out.join('')
}

export interface InjectResult {
  buffer: Buffer
  /** Style IDs the skeleton was missing. Empty on a healthy inject. */
  missingStyles: string[]
  /** True when the skeleton carries a real TOC field that will self-update. */
  tocFieldPresent: boolean
}

/**
 * Inject rendered blocks into a skeleton .docx.
 *
 * Everything except the marked body region is preserved byte-for-byte, so the
 * output IS the skeleton with different words in it.
 */
export async function injectIntoSkeleton(
  skeleton: Buffer, blocks: Block[],
): Promise<InjectResult> {
  const zip = await JSZip.loadAsync(skeleton)

  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('skeleton has no word/document.xml')
  const doc = await docFile.async('string')

  const stylesFile = zip.file('word/styles.xml')
  const styles = stylesFile ? await stylesFile.async('string') : ''
  const missingStyles = REQUIRED_STYLES.filter(
    id => !styles.includes(`w:styleId="${id}"`))

  // Asserted on the OUTPUT, below — the TOC is composed, not inherited.

  // The markers sit inside their own <w:p> elements in the skeleton. Replace
  // from the START of the paragraph containing BODY_START to the END of the one
  // containing BODY_END, so neither marker paragraph survives into the output.
  const startIdx = doc.indexOf(BODY_START)
  const endIdx = doc.indexOf(BODY_END)
  if (startIdx < 0 || endIdx < 0) {
    throw new Error(`skeleton is missing ${BODY_START}/${BODY_END} markers`)
  }
  const pOpen = doc.lastIndexOf('<w:p ', startIdx) >= 0
    ? Math.max(doc.lastIndexOf('<w:p ', startIdx), doc.lastIndexOf('<w:p>', startIdx))
    : doc.lastIndexOf('<w:p>', startIdx)
  const pCloseTag = doc.indexOf('</w:p>', endIdx)
  if (pOpen < 0 || pCloseTag < 0) throw new Error('could not bound the marker paragraphs')

  const next = doc.slice(0, pOpen) + renderBlocks(blocks) + doc.slice(pCloseTag + '</w:p>'.length)
  // Self-check: the body region must actually have changed. Cheap, and it closes
  // the same silence class the marker bounds could fall into.
  if (next === doc) throw new Error('injection produced an identical document — the marker bounds resolved to an empty region')
  zip.file('word/document.xml', next)

  const tocFieldPresent = /TOC\s+\\o/.test(next)

  const buffer = await zip.generateAsync({
    type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 },
  })
  return { buffer, missingStyles, tocFieldPresent }
}
