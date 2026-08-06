// DOCUMENT PALETTE SWEEP — the output-layer gate for a document-identity change.
//
// Why this exists: pw-report-regen strips every tag and compares visible TEXT,
// so it is colour-blind BY CONSTRUCTION and cannot see a palette change. That
// limitation is recorded in doc-common's header and in ARCHITECTURE. This
// harness is the check that CAN fail on colour.
//
// It does NOT grep the source. Source is a pure input; grepping it proves the
// author's intent, not the artifact. Colour can enter a generated document from
// three places source cannot answer for:
//   1. the generators (source — covered anyway, as the cheap first leg)
//   2. STORED CONTENT — template HTML, snapshots, item bodies in the database
//   3. a dependency's own defaults (html-to-docx emits its own table borders)
// Only the rendered artifact sees all three. So: generate one document per
// family, unzip the DOCX, and grep the WordprocessingML for retired hex.
//
// DOCX is the greppable artifact. PDF stores colour as content-stream operands,
// not hex text, so grepping a PDF for '443C8F' is a check that cannot fail —
// it would report clean on a fully purple document. The PDFs are therefore
// downloaded for the render-and-look pass, and this harness says so rather than
// claiming a proof it did not make.
//
// The generators run IN-PROCESS against the working tree via doc-render-local —
// no deployment. The palette question is about this tree, and a preview deploy
// would answer it for a commit instead.
//
// Run: node --env-file=.env doc-palette-sweep.mjs

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { loadHandler, invoke } from './doc-render-local.mjs'
const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'   // ZZ-TEST — Do Not Use
const OUT = 'out/palette'

// The retired identity, and the pale-blue remnants named in the ruling. Every
// one of these appearing in a rendered document is a FAILURE, not a warning.
const RETIRED = {
  '443C8F': 'purple INK/BAND',
  '5D55AF': 'purple BAND_UNIT',
  '7F78CB': 'purple BAND_SUB',
  'E3E1F5': 'purple BAND_TINT',
  'CFCCE0': 'purple BORDER',
  'E1DEEB': 'purple RULE',
  'F7F6FC': 'purple ZEBRA',
  '1F3A5F': 'navy (pre-2026-07-26 identity)',
  'E8432D': 'vermilion accent',
  'D9E2F3': 'legacy pale blue',
  'F4F7FB': 'legacy pale blue',
  '8A93A0': 'cool-cast neutral (report dates/locations)',
  '9AA3AE': 'cool-cast neutral (empty dash)',
  'E8EBEF': 'cool-cast neutral (blocked-cell fill)',
  'F2F5F8': 'cool-cast neutral (column-header fill)',
  'FAFBFC': 'cool-cast neutral (tag-cell fill)',
  'EEF2F6': 'cool-cast neutral (nameplate TH)',
  '6B7280': 'cool-cast neutral (header labels)',
  // Added 2026-08-05 AFTER a render-and-look found them. They lived in the Cx
  // Plan skeleton's word/footer4.xml — a legacy letterhead blue older than navy,
  // on the footer address text and the rule above it. The sweep was GREEN while
  // every page carried a blue footer, because a retired-value list can only find
  // values somebody already knew were retired. That is this gate's standing
  // limit, and it is why the render-and-look is not optional.
  '151897': 'legacy letterhead blue (footer text)',
  '121584': 'legacy letterhead blue (footer rule)',
}

// Semantic colour is IN SCOPE OF THE DOCUMENT and out of scope of the ruling.
// Listed so a reviewer reading the output knows these hits are expected, and so
// that a future run which stops seeing them notices the silence.
const SEMANTIC = {
  'C0392B': 'DOC_SEMANTIC.OUTSTANDING', '1E8449': 'DOC_SEMANTIC.RECORDED',
  'B7791F': 'DOC_SEMANTIC.ITEM_OPEN',   '2B6CB0': 'DOC_SEMANTIC.ITEM_INFO',
  'FFF9C4': 'blank-form banner fill',   'F59E0B': 'blank-form banner border',
  '92400E': 'blank-form banner text',
}

mkdirSync(OUT, { recursive: true })

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { error: authErr } = await sb.auth.signInWithPassword({
  email: process.env.admin_email, password: process.env.admin_password,
})
if (authErr) { console.error('login failed:', authErr.message); process.exit(1) }
const token = (await sb.auth.getSession()).data.session.access_token

// ── sources, one per family ───────────────────────────────────────────────────
const { data: report } = await sb.from('site_reports')
  .select('id, report_number').eq('project_id', ZZ)
  .not('storage_url', 'is', null).order('report_date', { ascending: false }).limit(1).maybeSingle()

// meetings is empty at rest across the whole database; seed and delete, as
// gen-identity-samples does. Deliberately representative, not minimal: two topic
// bands, an open item, a closed item, a due date — otherwise BAND_TINT and the
// semantic statuses never render and the sweep answers a question nobody asked.
let seededMeetingId = null
async function seedMeeting() {
  const { data: type } = await sb.from('meeting_types').select('id').limit(1).maybeSingle()
  if (!type) throw new Error('no meeting_types row to seed from')
  const { data: m, error } = await sb.from('meetings').insert({
    project_id: ZZ, meeting_type_id: type.id, meeting_number: 902,
    meeting_date: '2026-08-05', start_time: '10:00', location: 'Site trailer, Level 1',
    prepared_by: 'Dev Admin', next_meeting_date: '2026-08-19', status: 'draft',
  }).select('id, meeting_number').single()
  if (error) throw new Error(`meeting seed: ${error.message}`)
  seededMeetingId = m.id
  const { data: t } = await sb.from('meeting_topics').insert([
    { meeting_id: m.id, title: 'Mechanical — AHU and Terminal Units', sort_order: 1 },
    { meeting_id: m.id, title: 'Electrical — Distribution and Life Safety', sort_order: 2 },
  ]).select('id, sort_order')
  const by = Object.fromEntries((t ?? []).map(r => [r.sort_order, r.id]))
  await sb.from('meeting_items').insert([
    { meeting_id: m.id, topic_id: by[1], item_number: '1.1', sort_order: 1, status: 'open',
      discussion: 'AHU-1 supply fan VFD parameters confirmed against the sequence of operations.',
      responsible_text: 'Vanguard Mechanical Inc.', due_date: '2026-08-12' },
    { meeting_id: m.id, topic_id: by[1], item_number: '1.2', sort_order: 2, status: 'closed',
      discussion: 'Terminal unit airflow verification complete on Level 2.',
      responsible_text: 'Vanguard Mechanical Inc.' },
    { meeting_id: m.id, topic_id: by[2], item_number: '2.1', sort_order: 1, status: 'open',
      discussion: 'ATS transfer test witnessed. Retest required after the load bank exercise.',
      responsible_text: 'Automated Logic Controls', due_date: '2026-08-19' },
  ])
  return m
}
const meeting = await seedMeeting()

// UNCONDITIONAL. The first run of this harness crashed mid-loop and left the
// seeded meeting on ZZ-TEST — an "unconditionally" comment is not a finally.
async function cleanup() {
  if (!seededMeetingId) return
  const id = seededMeetingId; seededMeetingId = null
  await sb.from('meetings').delete().eq('id', id)
  const { data: left } = await sb.from('meetings').select('id').eq('project_id', ZZ)
  console.log(`  seeded meeting removed — meetings on ZZ-TEST: ${(left ?? []).length} (must be 0)`)
}
process.on('uncaughtException', async (e) => { await cleanup(); console.error(e); process.exit(1) })
process.on('unhandledRejection', async (e) => { await cleanup(); console.error(e); process.exit(1) })

// Every checklist TYPE, not one checklist — the ruling names all four families,
// and the checklist generator's band ramp is three deep only on some of them.
const { data: instances } = await sb.from('checklist_instances')
  .select('id, source_template_name_snapshot, checklist_templates(type)')
  .eq('project_id', ZZ).order('created_at', { ascending: false })

const byType = new Map()
for (const i of instances ?? []) {
  const t = i.checklist_templates?.type ?? 'unknown'
  if (!byType.has(t)) byType.set(t, i)
}
// SKIP LOUDLY, never silently green. A family with no ZZ-TEST instance is NOT
// swept, and the run must say which — otherwise a clean report reads as coverage
// it does not have. `startup` is listed ahead of its build on purpose.
const EXPECTED_TYPES = ['pfc', 'ivc', 'fpt', 'startup']
const missingTypes = EXPECTED_TYPES.filter(t => !byType.has(t))

const JOBS = [
  { kind: 'report',  handler: 'generate-report',  body: { report_id: report?.id },
    sign: ['site_reports', report?.id] },
  { kind: 'minutes', handler: 'generate-minutes', body: { meeting_id: meeting.id },
    sign: ['meetings', meeting.id] },
]
for (const [type, inst] of byType) {
  // completed AND blank: blank is the mode that renders the contractor banner
  // and the np-blocked fills, which is where three of the swept literals lived.
  for (const mode of ['completed', 'blank']) {
    JOBS.push({ kind: `checklist-${type}-${mode}`, handler: 'generate-checklist',
                body: { instance_id: inst.id, mode }, sign: null })
  }
}
const { data: plan } = await sb.from('cx_plans').select('id, status').eq('project_id', ZZ)
  .neq('status', 'draft').limit(1).maybeSingle()
if (plan) JOBS.push({ kind: 'cx-plan', handler: 'cx-plan-generate', body: { plan_id: plan.id }, sign: null, bucket: 'cx-plans' })
else console.log('  NOTE: no non-draft ZZ-TEST cx_plan — Cx Plan family NOT swept')

console.log('renderer: in-process, working tree')
console.log(`sources: report ${report?.report_number ?? 'NONE'} · meeting ${meeting.meeting_number} · ` +
            `checklist types [${[...byType.keys()].join(', ')}]`)
if (!report) { console.error('no ZZ-TEST site report with storage_url'); process.exit(1) }
if (!byType.size) { console.error('no ZZ-TEST checklist instances'); process.exit(1) }

// ── generate + download ───────────────────────────────────────────────────────
const grab = async (u) => u ? Buffer.from(await (await fetch(u)).arrayBuffer()) : null
async function signPath(bucket, path) {
  if (!path) return null
  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}
async function signRow(table, id, kind) {
  const { body } = await invoke(HANDLERS['get-file-url'], { table, id, kind }, token)
  return body?.url ?? null
}

const HANDLERS = {}
for (const n of ['generate-report', 'generate-minutes', 'generate-checklist', 'cx-plan-generate', 'get-file-url'])
  HANDLERS[n] = await loadHandler(n)

const artifacts = []
for (const job of JOBS) {
  const { status, body: b } = await invoke(HANDLERS[job.handler], job.body, token)
  if (status >= 400) { console.log(`  FAIL ${job.kind}: ${status} ${b?.error ?? ''}`); artifacts.push({ kind: job.kind, failed: true }); continue }
  // Three response shapes: generate-checklist hands back signed URLs; report and
  // minutes persist a bucket-relative path on the row (signed through the app's
  // own row-anchored endpoint); cx-plan-generate returns bucket-relative paths
  // in the response body, so those are signed directly against its bucket.
  let docxUrl, pdfUrl
  if (job.sign)          { docxUrl = await signRow(job.sign[0], job.sign[1], 'docx'); pdfUrl = await signRow(job.sign[0], job.sign[1], 'pdf') }
  else if (job.bucket)   { docxUrl = await signPath(job.bucket, b.storage_url); pdfUrl = await signPath(job.bucket, b.pdf_url) }
  else                   { docxUrl = b.storage_url ?? b.docx_url; pdfUrl = b.pdf_url }
  for (const [ext, url] of [['docx', docxUrl], ['pdf', pdfUrl]]) {
    const buf = await grab(url)
    if (!buf) { console.log(`  MISS ${job.kind}.${ext}`); continue }
    const p = `${OUT}/${job.kind}.${ext}`
    writeFileSync(p, buf)
    artifacts.push({ kind: job.kind, ext, path: p, bytes: buf.length })
    console.log(`  · ${p} (${(buf.length / 1024).toFixed(0)} kB)`)
  }
}

await cleanup()

// ── THE GATE: grep the rendered DOCX XML ──────────────────────────────────────
// ARRIVAL FIRST. An absence assertion over zero documents is green by vacuum.
const docx = artifacts.filter(a => a.ext === 'docx')
console.log(`\n── sweep ──`)
if (!docx.length) { console.error('REFUSE: zero DOCX artifacts rendered — nothing to sweep'); process.exit(1) }

// A .docx is a zip. Walk the local file headers and inflate every .xml entry —
// document.xml carries the w:fill / w:color attributes html-to-docx wrote, which
// is where a retired hex would actually land.
const SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04])
function xmlOf(path) {
  const zip = readFileSync(path)
  const out = []
  let i = 0
  while ((i = zip.indexOf(SIG, i)) !== -1) {
    const method = zip.readUInt16LE(i + 8)
    const compSize = zip.readUInt32LE(i + 18)
    const nameLen = zip.readUInt16LE(i + 26)
    const extraLen = zip.readUInt16LE(i + 28)
    const name = zip.subarray(i + 30, i + 30 + nameLen).toString('latin1')
    const dataStart = i + 30 + nameLen + extraLen
    if (name.endsWith('.xml') && compSize > 0) {
      try {
        const raw = zip.subarray(dataStart, dataStart + compSize)
        out.push(method === 8 ? inflateRawSync(raw).toString('latin1') : raw.toString('latin1'))
      } catch { /* central-directory false positive — skip */ }
    }
    i = dataStart + compSize
  }
  return out.join('\n')
}

let failures = 0
for (const a of docx) {
  const xml = xmlOf(a.path).toUpperCase()
  const hits = Object.entries(RETIRED).filter(([hex]) => xml.includes(hex))
  const sem  = Object.entries(SEMANTIC).filter(([hex]) => xml.includes(hex))
  const semNote = sem.length ? `  (semantic present, expected: ${sem.map(([h]) => h).join(' ')})` : ''
  if (hits.length) {
    failures++
    console.log(`  FAIL ${a.kind}: ${hits.map(([h, why]) => `${h} — ${why}`).join(' · ')}${semNote}`)
  } else {
    console.log(`  ok   ${a.kind}: clean of all ${Object.keys(RETIRED).length} retired values${semNote}`)
  }
}

// Printed BELOW the ok/FAIL list and ABOVE the verdict, where a reader cannot
// miss it. A column of `ok` lines with an unstated gap reads as coverage it does
// not have — that is the silence class, and this line is what closes it.
if (missingTypes.length)
  console.log(`\nNOT SWEPT — no ZZ-TEST instance for checklist type(s): ${missingTypes.join(', ')}`)
else
  console.log(`\nall ${EXPECTED_TYPES.length} checklist types present on ZZ-TEST and swept`)

const pdfs = artifacts.filter(a => a.ext === 'pdf')
console.log(`\n${pdfs.length} PDFs in ${OUT}/ for the render-and-look pass — NOT swept.`)
console.log('PDF stores colour as content-stream operands, not hex text; grepping one')
console.log('for a retired value is a check that cannot fail. Look at them.')

console.log(`\n${failures === 0 ? 'SWEEP CLEAN' : `SWEEP FAILED — ${failures} document(s)`}`)
process.exit(failures === 0 ? 0 : 1)
