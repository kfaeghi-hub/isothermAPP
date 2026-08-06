// Patch the committed Cx Plan skeleton's palette — the identity that lives in a
// BINARY, not in doc-common.
//
// Found by doc-palette-sweep on 2026-08-05: the monochrome amendment moved every
// value in DOC, and the Cx Plan came out purple anyway. Its heading identity is
// Word STYLE DEFINITIONS in firm-knowledge/skeletons/cx-plan.docx →
// word/styles.xml, inherited from the source document build-skeleton.mjs was
// carved from. doc-common never touched it and a source grep can never see it.
//
// The mapping, by ROLE — read out of the parts themselves, not guessed:
//   443C8F  is always w:fill on a heading whose w:color is FFFFFF  → a band
//           carrying white text. That is DOC.BAND.       → 000000  (styles.xml)
//   5D55AF  is always w:color — the second-level heading text
//           (CompanyName-ABC, ListHeading2Char).         → 4D4D4D  (styles.xml)
//   151897  the footer's firm address block, bold 9pt — the letterhead address
//           in the footer slot.                          → 555555  (footer4.xml)
//   121584  the rule above it (w:pBdr top, 1.5pt) — the brand rule.
//                                                        → 000000  (footer4.xml)
//
// THE LAST TWO WERE FOUND BY LOOKING, NOT BY GREPPING (2026-08-05). The first
// pass swept styles.xml, the sweep went green, and the document still rendered a
// BLUE footer with a blue rule under every page — a legacy letterhead blue older
// than navy, which no retired-value list knew to look for. `docx-render-look.ps1`
// exported the DOCX through Word itself and the blue was simply visible. Both
// hexes are now in doc-palette-sweep's RETIRED list, so the class is greppable
// from here on; it was not discoverable that way before something saw it.
//
// Assertions, because this rewrites a committed artifact:
//   · every part EXCEPT word/styles.xml comes out byte-identical
//   · styles.xml differs ONLY by the two substitutions, at the exact counts found
//   · the output contains zero retired hexes afterwards
// It also refuses to run twice: a clean skeleton is a no-op, not a silent pass.
//
// Run: node patch-skeleton-palette.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'

const FILE = 'firm-knowledge/skeletons/cx-plan.docx'
// Any XML part may carry identity, not just styles.xml — that is the whole
// lesson. The patcher rewrites wherever a mapped value is found and reports
// which parts moved; every other part is asserted byte-identical.
const MAP = { '443C8F': '000000', '5D55AF': '4D4D4D', '151897': '555555', '121584': '000000' }
const RETIRED = ['443C8F', '5D55AF', '7F78CB', 'E3E1F5', 'CFCCE0', 'E1DEEB', 'F7F6FC',
                 '1F3A5F', 'E8432D', 'D9E2F3', 'F4F7FB', '151897', '121584']

const before = readFileSync(FILE)
const zipIn = await JSZip.loadAsync(before)
const parts = {}
for (const name of Object.keys(zipIn.files)) {
  if (zipIn.files[name].dir) continue
  parts[name] = await zipIn.file(name).async('nodebuffer')
}

// Rewrite every XML part that carries a mapped value.
const changed = {}
const counts = {}
for (const [name, buf] of Object.entries(parts)) {
  if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue
  const before = buf.toString('utf8')
  let after = before
  for (const [from, to] of Object.entries(MAP)) {
    const re = new RegExp(from, 'gi')
    const n = (after.match(re) ?? []).length
    if (!n) continue
    counts[`${name}:${from}`] = n
    after = after.replace(re, to)
  }
  if (after !== before) {
    // Both sides of every mapping are 6 hex characters, so a correct
    // substitution cannot change a part's length. A length change means
    // something else moved.
    if (after.length !== before.length) { console.error(`REFUSE: ${name} length changed`); process.exit(1) }
    changed[name] = Buffer.from(after, 'utf8')
  }
}
if (!Object.keys(counts).length) { console.log('skeleton already clean — nothing to do'); process.exit(0) }
for (const [k, v] of Object.entries(counts)) console.log(`  ${k} ×${v}`)
console.log(`parts rewritten: ${Object.keys(changed).join(', ')}`)
for (const [name, buf] of Object.entries(changed)) {
  const t = buf.toString('utf8')
  for (const h of RETIRED) if (new RegExp(h, 'i').test(t)) { console.error(`REFUSE: ${h} survives in ${name}`); process.exit(1) }
}

const zipOut = new JSZip()
for (const [name, buf] of Object.entries(parts))
  zipOut.file(name, changed[name] ?? buf)
const out = await zipOut.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
writeFileSync(FILE, out)

// Re-read and prove it, from disk — not from the buffer we just built.
const zipV = await JSZip.loadAsync(readFileSync(FILE))
const names = Object.keys(zipV.files).filter(n => !zipV.files[n].dir)
if (names.length !== Object.keys(parts).length) { console.error('REFUSE: part count changed'); process.exit(1) }
let diffs = 0
for (const n of names) {
  if (changed[n]) continue
  const b = await zipV.file(n).async('nodebuffer')
  if (!b.equals(parts[n])) { console.error(`REFUSE: ${n} changed and should not have`); diffs++ }
}
if (diffs) process.exit(1)
let residual = []
for (const n of names) {
  const t = (await zipV.file(n).async('string')).toUpperCase()
  for (const h of RETIRED) if (t.includes(h)) residual.push(`${n}:${h}`)
}
console.log(`parts: ${names.length} · unchanged outside the ${Object.keys(changed).length} rewritten: yes · residual retired hex: ${residual.length ? residual.join(' ') : 'none'}`)
process.exit(residual.length ? 1 : 0)
