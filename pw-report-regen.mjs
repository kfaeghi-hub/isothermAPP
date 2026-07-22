// Regeneration-diff harness for the directory dual-read change.
//
//   node pw-report-regen.mjs <report_id> before   → generates + saves out/regen-before.*
//   node pw-report-regen.mjs <report_id> after    → generates + saves out/regen-after.* and DIFFS
//
// "before" runs against the deployed OLD generator, "after" against the new one.
// The assertion: the distribution table (names / companies / ABRV / emails) is
// IDENTICAL — the dual-read must not change any existing report's content.

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { apiToken, adminCredentials } from './pw-config.mjs'

const BASE = process.env.PW_BASE_URL ?? 'https://isotherm-app.vercel.app'
const [reportId, phase] = process.argv.slice(2)
if (!reportId || !['before', 'after'].includes(phase)) {
  console.error('usage: node pw-report-regen.mjs <report_id> before|after')
  process.exit(1)
}

function docxXml(buf) {
  let i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const method = buf.readUInt16LE(i + 8)
    const compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('latin1')
    const start = i + 30 + nameLen + extraLen
    if (name === 'word/document.xml' && compSize > 0) {
      const data = buf.subarray(start, start + compSize)
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    }
    i = start + (compSize || 1)
  }
  return ''
}

/** The document's visible text, normalized — dates/ids aside, content must match. */
function visibleText(buf) {
  return docxXml(buf).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

console.log(`${phase}: generating report ${reportId} against ${BASE}`)
// admin token: the regen gate may legitimately target any project's report.
const res = await fetch(`${BASE}/api/generate-report`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await apiToken(adminCredentials())}` },
  body: JSON.stringify({ report_id: reportId }),
})
const body = await res.json().catch(() => ({}))
if (!res.ok) { console.error(`generation failed (${res.status}): ${body.error ?? ''}`); process.exit(1) }

const docx = Buffer.from(await (await fetch(body.storage_url)).arrayBuffer())
const pdf  = Buffer.from(await (await fetch(body.pdf_url)).arrayBuffer())
mkdirSync('out', { recursive: true })
writeFileSync(`out/regen-${phase}.docx`, docx)
writeFileSync(`out/regen-${phase}.pdf`, pdf)
console.log(`saved out/regen-${phase}.docx (${(docx.length / 1024).toFixed(0)} kB), .pdf (${(pdf.length / 1024).toFixed(0)} kB)`)

if (phase === 'after') {
  const before = visibleText(readFileSync('out/regen-before.docx'))
  const after  = visibleText(docx)
  if (before === after) {
    console.log('PASS — regenerated document text is IDENTICAL to the pre-change output.')
  } else {
    // Show a focused diff window around the first divergence
    let i = 0
    while (i < Math.min(before.length, after.length) && before[i] === after[i]) i++
    console.log('FAIL — document text diverged. First divergence at char', i)
    console.log('  before: …' + before.slice(Math.max(0, i - 60), i + 120) + '…')
    console.log('  after:  …' + after.slice(Math.max(0, i - 60), i + 120) + '…')
    process.exit(1)
  }
}
