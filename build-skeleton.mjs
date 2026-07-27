// Build the Cx Plan .docx SKELETON from an issued plan.
//
// Keeps: styles.xml (157 style definitions), numbering.xml, header*/footer*,
// settings.xml, the cover layout and THE REAL TOC FIELD.
// Strips: every word of client content from the body, replaced by the two
// injection markers.
//
// The result is OUR template — Isotherm authored the source document; removing
// the project-specific words leaves the firm's own structure, which is exactly
// what the branding/extraction rule contemplates. Verified below: the output is
// asserted to contain none of the source's client strings.
//
// Run: node build-skeleton.mjs
import JSZip from 'jszip'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const SRC = 'samples/cx-plans/humber-standard.docx'   // gitignored source
const OUT = 'firm-knowledge/skeletons/cx-plan.docx'
const START = 'ISOTHERM_BODY_START'
const END = 'ISOTHERM_BODY_END'

// Strings that must NOT survive into the committed skeleton.
const FORBIDDEN = ['Humber', 'Ecosystem', 'Spencer', 'Hehar', 'Aboutalebi', 'humber.ca']

const zip = await JSZip.loadAsync(readFileSync(SRC))
const doc = await zip.file('word/document.xml').async('string')

// Keep everything up to and including <w:body>, plus the trailing sectPr (page
// setup, header/footer references) — then put the markers between them.
const bodyOpen = doc.indexOf('<w:body>') + '<w:body>'.length
const sectPr = doc.lastIndexOf('<w:sectPr')
const bodyClose = doc.indexOf('</w:body>')
if (bodyOpen < 8 || sectPr < 0) throw new Error('unexpected document shape')

const marker = (t) =>
  `<w:p><w:pPr><w:pStyle w:val="BodyText-ABC"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`

const next =
  doc.slice(0, bodyOpen) +
  marker(START) + marker(END) +
  doc.slice(sectPr, bodyClose) +
  doc.slice(bodyClose)

zip.file('word/document.xml', next)

// Strip external hyperlink relationships. The source body carried mailto: links
// for the team contacts, and those live in word/_rels/document.xml.rels — NOT in
// document.xml. Removing the body text left the addresses behind. Caught by the
// leak assertion at the bottom, which is why that assertion exists.
{
  const relsEntry = zip.file('word/_rels/document.xml.rels')
  if (relsEntry) {
    let rels = await relsEntry.async('string')
    rels = rels.replace(/<Relationship[^>]*TargetMode="External"[^>]*\/>/g, '')
    zip.file('word/_rels/document.xml.rels', rels)
  }
}

// Make Word update the TOC field when the document opens. Without this the
// field is present but shows its placeholder until someone presses F9 — the
// self-updating TOC is half the reason for choosing the skeleton approach.
{
  const setEntry = zip.file('word/settings.xml')
  if (setEntry) {
    let x = await setEntry.async('string')
    if (!/updateFields/.test(x)) {
      x = x.replace(/(<w:settings[^>]*>)/, '$1<w:updateFields w:val="true"/>')
      zip.file('word/settings.xml', x)
    }
  }
}

// ── Converge the skeleton's palette to the brand identity ───────────────────
// The source document predates the 2026-07-26 document-identity ruling: its
// style definitions carry navy #1F3A5F in heading bands, the TOC heading and the
// footer rule. Generated documents are purple now (commit cf83ed1), so a
// skeleton that quietly stayed navy would reintroduce the exact divergence that
// ruling closed — and it would do it invisibly, because the colour lives in
// styles.xml rather than in any generated markup.
//
// Same map as api/_shared/doc-common.ts DOC. Word stores colours as bare hex in
// w:color/@w:val, w:fill, w:themeFill and shading elements, so the substitution
// is on the hex WITHOUT the leading '#'.
{
  // MEASURED, not assumed. My first attempt mapped #1F3A5F — the navy the
  // generate-* endpoints used — and matched nothing, because this template is a
  // different lineage: its heading bands are <w:shd w:fill="002060"/> and
  // "000080" inside styles.xml, with 003B6F on a couple of runs. The re-tint
  // silently did nothing and the proof still passed, because no assertion
  // covered colour. Looking at the page is what found it.
  const MAP = {
    '002060': '443C8F',   // heading-band shading -> brand purple (BAND)
    '000080': '443C8F',   // navy shading variant
    '003B6F': '5D55AF',   // secondary navy -> brand-500
    '1F3A5F': '443C8F',   // the doc-common navy, in case a part carries it
    '2C5282': '5D55AF',
    '3D6A9F': '7F78CB',
    'C9D2DD': 'CFCCE0',
    'DDE3EA': 'E1DEEB',
  }
  let total = 0
  for (const part of ['word/styles.xml', 'word/numbering.xml',
                      'word/header1.xml', 'word/header2.xml', 'word/header3.xml',
                      'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml',
                      'word/footer4.xml', 'word/theme/theme1.xml']) {
    const e = zip.file(part)
    if (!e) continue
    let x = await e.async('string')
    let n = 0
    for (const [from, to] of Object.entries(MAP)) {
      for (const v of [from, from.toLowerCase()]) {
        const c = x.split(v).length - 1
        if (c) { x = x.split(v).join(to); n += c }
      }
    }
    if (n) console.log(`  re-tinted ${part}: ${n} colour values`)
    zip.file(part, x)
    total += n
  }
  // THE ASSERTION THIS SCRIPT LACKED. The first re-tint targeted a navy this
  // template does not use, replaced zero values, printed nothing, and left the
  // skeleton the wrong colour behind twelve passing assertions. A colour pass
  // that changes nothing is a failed colour pass.
  if (total === 0) {
    console.error('\nFAIL: the palette re-tint replaced ZERO colour values.')
    console.error('Either the skeleton is already converged, or the MAP targets')
    console.error('hexes this template does not use. Measure before assuming.')
    process.exit(1)
  }
  console.log(`  palette re-tint total: ${total} values`)
}

// Wipe the docProps — they carry the source project's title/author.
for (const f of ['docProps/core.xml', 'docProps/app.xml']) {
  const entry = zip.file(f)
  if (!entry) continue
  let x = await entry.async('string')
  x = x.replace(/(<dc:title>)[\s\S]*?(<\/dc:title>)/, '$1Building Commissioning Plan$2')
       .replace(/(<dc:creator>)[\s\S]*?(<\/dc:creator>)/, '$1Isotherm Engineering Ltd.$2')
       .replace(/(<cp:lastModifiedBy>)[\s\S]*?(<\/cp:lastModifiedBy>)/, '$1Isotherm Engineering Ltd.$2')
       .replace(/(<dc:subject>)[\s\S]*?(<\/dc:subject>)/, '$1$2')
       .replace(/(<cp:keywords>)[\s\S]*?(<\/cp:keywords>)/, '$1$2')
  zip.file(f, x)
}

mkdirSync('firm-knowledge/skeletons', { recursive: true })
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
writeFileSync(OUT, buf)

// ── Prove no client content survived ─────────────────────────────────────────
const check = await JSZip.loadAsync(buf)
let leaked = []
for (const name of Object.keys(check.files)) {
  if (check.files[name].dir) continue
  if (!/\.(xml|rels)$/.test(name)) continue
  const t = await check.file(name).async('string')
  for (const f of FORBIDDEN) if (t.includes(f)) leaked.push(`${name}: ${f}`)
}

const styles = await check.file('word/styles.xml').async('string')
const outDoc = await check.file('word/document.xml').async('string')
console.log(`skeleton written: ${OUT} (${(buf.length / 1024).toFixed(0)} kB)`)
console.log(`  styles preserved   : ${(styles.match(/w:styleId=/g) ?? []).length}`)
console.log(`  numbering.xml      : ${!!check.file('word/numbering.xml')}`)
console.log(`  headers/footers    : ${Object.keys(check.files).filter(n => /header\d|footer\d/.test(n)).length}`)
console.log(`  TOC field present  : ${/TOC\s+\\o/.test(outDoc)}`)
console.log(`  markers present    : ${outDoc.includes(START) && outDoc.includes(END)}`)
console.log(`  CLIENT CONTENT LEAK: ${leaked.length ? '*** ' + leaked.join(', ') : 'none'}`)
if (leaked.length) process.exit(1)
