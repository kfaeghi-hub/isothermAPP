// Audience-aware blank mode audit: Field Copy (internal) vs Contractor Hand-out.
//
//   blank + audience=field       — no contractor banner, subtitle FIELD COPY,
//                                  Company prefilled "Isotherm Engineering Ltd."
//   blank + audience=contractor  — banner + return instruction, blank identity lines
//   blank + no audience          — defaults by type (this instance is ivc → field)
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-blank-audience.mjs <instance_id>

import { writeFileSync, mkdirSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const BASE = process.env.PW_BASE_URL ?? 'https://isotherm-app.vercel.app'
const INSTANCE = process.argv[2]
if (!INSTANCE) { console.error('usage: node pw-blank-audience.mjs <instance_id>'); process.exit(1) }

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

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

function pdfText(buf) {
  let text = ''
  let i = 0
  while ((i = buf.indexOf('stream', i)) !== -1) {
    let s = i + 6
    if (buf[s] === 0x0d) s++
    if (buf[s] === 0x0a) s++
    const end = buf.indexOf('endstream', s)
    if (end === -1) break
    try { text += inflateRawSync(buf.subarray(s + 2, end)).toString('latin1') } catch { /* not flate */ }
    i = end + 9
  }
  return text
}

async function generate(bodyExtra) {
  const res = await fetch(`${BASE}/api/generate-checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance_id: INSTANCE, mode: 'blank', ...bodyExtra }),
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

mkdirSync('out', { recursive: true })

const BANNER = 'Complete on site and return to Isotherm Engineering Ltd.'

for (const audience of ['field', 'contractor']) {
  console.log(`\n=== blank / ${audience} ===`)
  const { ok, status, body } = await generate({ audience })
  if (!ok) { check(false, `${audience}: generation failed (${status}) ${body.error ?? ''}`); continue }

  check(body.pdf_url.includes(`blank-${audience}.pdf`), `${audience}: storage path is blank-${audience}.pdf`)
  check(body.storage_url.includes(`blank-${audience}.docx`), `${audience}: storage path is blank-${audience}.docx`)

  const pdf  = Buffer.from(await (await fetch(body.pdf_url)).arrayBuffer())
  const docx = Buffer.from(await (await fetch(body.storage_url)).arrayBuffer())
  writeFileSync(`out/blank-${audience}.pdf`, pdf)
  writeFileSync(`out/blank-${audience}.docx`, docx)

  const txt  = docxXml(docx).replace(/<[^>]+>/g, ' ')
  const ptxt = pdfText(pdf)

  if (audience === 'contractor') {
    check(txt.includes(BANNER), 'contractor.docx: banner with return instruction PRESENT')
    check(!txt.includes('FIELD COPY'), 'contractor.docx: no FIELD COPY subtitle')
    check(/Company:\s+_+/.test(txt), 'contractor.docx: Company is a blank line')
    check(ptxt.includes('FOR CONTRACTOR USE') || pdf.includes('FOR CONTRACTOR USE'),
      'contractor.pdf: banner text present')
  } else {
    check(!txt.includes(BANNER), 'field.docx: NO contractor banner / return instruction')
    check(txt.includes('FIELD COPY'), 'field.docx: FIELD COPY subtitle')
    check(/Company:\s+Isotherm Engineering Ltd\./.test(txt),
      'field.docx: Company prefilled "Isotherm Engineering Ltd."')
    check(/Name:\s+_+/.test(txt) && /Date:\s+_+/.test(txt),
      'field.docx: Name/Date left blank for handwriting')
    check(!ptxt.includes('FOR CONTRACTOR USE') && !pdf.includes('FOR CONTRACTOR USE'),
      'field.pdf: banner text absent')
  }
}

// Default audience: this instance is ivc → server should pick field.
console.log('\n=== blank / default (ivc → field) ===')
const def = await generate({})
if (!def.ok) check(false, `default: generation failed (${def.status}) ${def.body.error ?? ''}`)
else check(def.body.pdf_url.includes('blank-field.pdf'), 'default on ivc lands on blank-field path')

// Bad audience rejected
const bad = await generate({ audience: 'nonsense' })
check(bad.status === 400, `audience validation rejects bad value (got ${bad.status})`)

console.log('\n' + '='.repeat(64))
if (fails.length === 0) console.log('PASS — audience-aware blank mode verified.')
else { console.log(`FAIL — ${fails.length} check(s):`); for (const f of fails) console.log(`  - ${f}`) }
console.log('='.repeat(64))
process.exit(fails.length === 0 ? 0 : 1)
