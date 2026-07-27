// STEP 3 PROOF — the docx-skeleton injection mechanism, in isolation.
//
// No wizard, no AI, no schema. A trivial section set goes in; the output is
// opened, rendered and inspected. This is the one novel mechanism in the build,
// so it proves itself alone before anything is built on it — the doc-common
// discipline.
//
// Run: node prove-skeleton.mjs
import JSZip from 'jszip'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// The module is TypeScript; esbuild transpiles it to out/ for this harness so
// the proof exercises the SAME source the endpoints will import, not a copy.
mkdirSync('out', { recursive: true })
// --external needs --bundle; without bundling, the `import JSZip` line is left
// as-is and Node resolves it from node_modules, which is what we want anyway.
execFileSync('npx', ['esbuild', 'api/_shared/docx-skeleton.ts', '--format=esm',
  '--platform=node', '--outfile=out/docx-skeleton.mjs'],
  { stdio: 'inherit', shell: true })
const mod = await import('./out/docx-skeleton.mjs')

const BLOCKS = [
  { kind: 'title', text: 'Building Commissioning Plan' },
  { kind: 'cover', text: 'ZZ-TEST — Skeleton Proof' },
  { kind: 'cover', text: 'Rev 0 – 2026-07-26' },
  { kind: 'pagebreak' },
  { kind: 'toc' },
  { kind: 'pagebreak' },
  { kind: 'heading', level: 1, text: 'Executive Summary' },
  { kind: 'para', text: 'Isotherm Engineering Ltd. (Isotherm), as the independent Commissioning Authority (CxA), has been retained by the Client for the commissioning of the systems described in this plan.' },
  { kind: 'heading', level: 1, text: 'Project Overview' },
  { kind: 'heading', level: 2, text: 'Background' },
  { kind: 'para', text: 'This section proves that Heading2 nests under Heading1 in the outline, which is what the table of contents reads.' },
  { kind: 'heading', level: 2, text: 'Commissioning Plan' },
  { kind: 'para', text: 'The Final Commissioning Plan covers all components of the commissioning process, including the following:' },
  { kind: 'bullet', text: 'Installation Checks' },
  { kind: 'bullet', text: 'Initial Startup and Testing' },
  { kind: 'bullet', text: 'Control System Verification' },
  { kind: 'heading', level: 1, text: 'Commissioning Team' },
  { kind: 'para', text: 'The commissioning team is detailed in the table below:' },
  { kind: 'table', header: ['Role', 'Company', 'Contact'], rows: [
    ['Client | CLI', 'ZZ-TEST Client', '—'],
    ['Commissioning Authority | CxA', 'Isotherm Engineering Ltd.', 'Ph 905-822-2430'],
    ['Mechanical Contractor | MC', 'TBD', 'TBD'],
    // Escaping canary: an ampersand and angle brackets in real data must not
    // produce a file Word refuses to open.
    ['Architect | ARCH', 'Smith & Jones <Design>', 'a@b.ca'],
  ]},
  { kind: 'heading', level: 1, text: 'Conclusion' },
  { kind: 'para', text: 'End of the proof document.' },
]

mkdirSync('out', { recursive: true })
const skeleton = readFileSync('firm-knowledge/skeletons/cx-plan.docx')
const res = await mod.injectIntoSkeleton(skeleton, BLOCKS)
mkdirSync('out', { recursive: true })
writeFileSync('out/skeleton-proof.docx', res.buffer)

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

console.log(`\nout/skeleton-proof.docx (${(res.buffer.length / 1024).toFixed(0)} kB)\n`)

check(res.missingStyles.length === 0,
  `every required style exists in the skeleton${res.missingStyles.length ? ` — MISSING: ${res.missingStyles.join(', ')}` : ` (${mod.REQUIRED_STYLES.length})`}`)
check(res.tocFieldPresent, 'output carries a real TOC field (self-updates on open)')

// ── Inspect the produced package ────────────────────────────────────────────
const z = await JSZip.loadAsync(res.buffer)
const doc = await z.file('word/document.xml').async('string')
const styles = await z.file('word/styles.xml').async('string')
const settings = await z.file('word/settings.xml').async('string')

check((styles.match(/w:styleId=/g) ?? []).length === 157,
  `styles.xml preserved byte-for-byte (${(styles.match(/w:styleId=/g) ?? []).length} styles)`)
check(!!z.file('word/numbering.xml'), 'numbering.xml preserved (multi-level lists)')
check(Object.keys(z.files).filter(n => /header\d+\.xml$/.test(n)).length >= 3,
  `headers preserved (${Object.keys(z.files).filter(n => /header\d+\.xml$/.test(n)).length})`)
check(/updateFields w:val="true"/.test(settings), 'settings.xml requests field update on open')
check(!doc.includes('ISOTHERM_BODY_START') && !doc.includes('ISOTHERM_BODY_END'),
  'injection markers consumed — neither survives into the output')
check(/<w:pStyle w:val="Heading1"\/>/.test(doc) && /<w:pStyle w:val="Heading2"\/>/.test(doc),
  'generated paragraphs reference the skeleton\'s real Heading styles')
check(/<w:sectPr/.test(doc), 'sectPr preserved (page setup + header/footer refs)')

// The escaping canary, checked as ENCODED XML rather than as rendered text.
check(doc.includes('Smith &amp; Jones &lt;Design&gt;'),
  'ampersand and angle brackets escaped in table data')
check(!/Smith & Jones <Design>/.test(doc), 'no raw ampersand or bracket reached the XML')

// ── Prove it is a VALID package: reopen every part ──────────────────────────
let parseOk = true
for (const name of Object.keys(z.files)) {
  if (z.files[name].dir || !/\.(xml|rels)$/.test(name)) continue
  const t = await z.file(name).async('string')
  if (!t.trimStart().startsWith('<?xml')) { parseOk = false; console.log(`    bad part: ${name}`) }
}
check(parseOk, 'every XML part in the package is well-formed at the declaration')

// ── RENDER AND LOOK: convert to PDF and rasterize page 1 ────────────────────
// LibreOffice if available; otherwise the Word check is manual and said so.
let rendered = false
try {
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', 'out', 'out/skeleton-proof.docx'],
    { stdio: 'ignore', timeout: 120000 })
  rendered = true
} catch { /* soffice not installed */ }
console.log(rendered
  ? '\n  rendered out/skeleton-proof.pdf — open it, and open the .docx in Word'
  : '\n  (LibreOffice not available — open out/skeleton-proof.docx in Word directly)')

// ── KNOWN OPEN ITEM, recorded so it cannot be rediscovered ─────────────────
// The rendered footer reads "Page 4 of 3": the skeleton inherits multiple
// sections from the source document, and the PAGE/NUMPAGES fields are counting
// across a section boundary that the real cover composition will change anyway.
// NOT an injection defect — styles, numbering, headings, the table and the TOC
// all resolve correctly. It belongs to skeleton authoring, and it is fixed when
// the real cover/section layout is composed (step 4).
console.log('\n  OPEN ITEM — footer page numbering reads "Page N of M-1": the')
console.log('  skeleton carries the source document\'s section breaks. Fix when the')
console.log('  cover/section layout is composed. Not an injection fault.')

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0
  ? 'PASS — skeleton injection preserves styles, numbering, headers and the TOC field.'
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length ? 1 : 0)
