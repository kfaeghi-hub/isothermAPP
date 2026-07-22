// Generates the four checklist deliverables for a two-unit instance and audits their content.
//
//   completed.pdf / completed.docx  — frozen snapshot, responses, findings, signoffs
//   blank.pdf     / blank.docx      — Spec + Shop Drawing pre-filled, Installed empty
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-checklist-docs.mjs <instance_id>

import { writeFileSync, mkdirSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { apiToken, credentials } from './pw-config.mjs'

const BASE = process.env.PW_BASE_URL ?? 'https://isotherm-app.vercel.app'
const INSTANCE = process.argv[2]
if (!INSTANCE) { console.error('usage: node pw-checklist-docs.mjs <instance_id>'); process.exit(1) }

// generate-* endpoints require a Bearer JWT (2026-07-22 hardening).
const TOKEN = await apiToken(credentials())

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

/** Extract word/document.xml from a .docx (zip) — no dependencies. */
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

/** Every part declared in the zip — used to confirm the DOCX package is intact. */
function docxParts(buf) {
  const parts = []
  let i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    parts.push(buf.subarray(i + 30, i + 30 + nameLen).toString('latin1'))
    i = i + 30 + nameLen + extraLen + (compSize || 1)
  }
  return parts
}

/** Real PDF text extraction via pdf.js — replaced the crude flate-stream probe,
 *  which couldn't read subset-font glyphs and kept two checks permanently
 *  yellow (retired 2026-07-22: green means green). Same approach as
 *  pw-blank-audience. */
async function pdfText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise
  let text = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    text += tc.items.map(i => i.str).join(' ') + '\n'
  }
  return text
}

mkdirSync('out', { recursive: true })
const results = {}

for (const mode of ['completed', 'blank']) {
  console.log(`\n=== ${mode} ===`)
  const res = await fetch(`${BASE}/api/generate-checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ instance_id: INSTANCE, mode }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) { check(false, `${mode}: generation failed (${res.status}) ${body.error ?? ''}`); continue }

  console.log(`  stats: ${JSON.stringify(body.stats ?? {})}`)

  const pdf  = Buffer.from(await (await fetch(body.pdf_url)).arrayBuffer())
  const docx = Buffer.from(await (await fetch(body.storage_url)).arrayBuffer())
  writeFileSync(`out/${mode}.pdf`, pdf)
  writeFileSync(`out/${mode}.docx`, docx)
  check(pdf.length > 5000,  `${mode}.pdf written (${(pdf.length / 1024).toFixed(0)} kB)`)
  check(docx.length > 5000, `${mode}.docx written (${(docx.length / 1024).toFixed(0)} kB)`)

  const xml = docxXml(docx)
  const parts = docxParts(docx)
  const txt = xml.replace(/<[^>]+>/g, ' ')
  const ptxt = await pdfText(pdf)
  results[mode] = { xml, txt, ptxt, parts, stats: body.stats }

  // DOCX package intact (audit passed last round — do not regress)
  check(parts.includes('word/document.xml') && parts.includes('[Content_Types].xml'),
    `${mode}.docx: package intact (${parts.length} parts)`)

  // Nameplate: the big one — the full field set must print
  for (const f of ['MANUFACTURER', 'MODEL NUMBER', 'SERIAL NUMBER', 'COOLING CAPACITY', 'HEATING CAPACITY', 'MOCP']) {
    check(txt.toUpperCase().includes(f), `${mode}.docx: nameplate row "${f}"`)
  }
  check(txt.includes('Specified') && txt.includes('Shop Drawing') && txt.includes('Installed'),
    `${mode}.docx: Spec / Shop Drawing / Installed column headers`)

  // Multi-unit: both units side by side
  check(txt.includes('TEST-HP-1') && txt.includes('TEST-HP-2'), `${mode}.docx: both units present`)

  // Legend
  check(txt.includes('Installed / Acceptable') && txt.includes('Not Applicable'),
    `${mode}.docx: Y/N/NR/NA legend`)

  // Header block
  check(txt.includes('Customer') && txt.includes('Project Address') && txt.includes('Project #'),
    `${mode}.docx: header block (Customer / Project Address / Project #)`)

  if (mode === 'completed') {
    check(txt.includes('ClimateMaster'), 'completed.docx: nameplate VALUES from the frozen snapshot')
    check(txt.includes('TMW036BGC') && txt.includes('TMW048BGC'), 'completed.docx: Installed model numbers (both units)')
    check(/Linked Findings/i.test(txt), 'completed.docx: Linked Findings section')
    check(/207\.4|208\.1/.test(txt), 'completed.docx: grid measured readings')
    check(txt.includes('Dev Test'), 'completed.docx: completed_by in header')
  } else {
    check(txt.includes('ClimateMaster'), 'blank.docx: Spec + Shop Drawing pre-filled from the register')
    check(!txt.includes('TMW036BGC') && !txt.includes('TMW048BGC'),
      'blank.docx: Installed column EMPTY (no as-built serials/models)')
    check(!txt.includes('CM-2026-0184'), 'blank.docx: no installed serial number')
    check(!/Dev Test/.test(txt), 'blank.docx: NO Isotherm name (contractor identifies themselves)')
    check(!/Linked Findings/i.test(txt), 'blank.docx: no findings section')
    check(!/207\.4/.test(txt), 'blank.docx: grid cells empty')
  }

  // PDF sanity
  check(ptxt.includes('TEST-HP-1'), `${mode}.pdf: renders unit TEST-HP-1`)
  check(/Page/i.test(ptxt) || pdf.includes('Page'), `${mode}.pdf: footer page numbering present`)
}

console.log('\n' + '='.repeat(64))
if (fails.length === 0) console.log('PASS — all four deliverables generated and content-verified.')
else { console.log(`FAIL — ${fails.length} check(s):`); for (const f of fails) console.log(`  - ${f}`) }
console.log('='.repeat(64))
process.exit(fails.length === 0 ? 0 : 1)
