// Document-identity EVIDENCE harness. Not a battery suite, not committed logic —
// it renders the same three ZZ-TEST source documents through two deployments and
// leaves 12 files in out/ for a human ruling.
//
//   NAVY      = production          (master, the current identity)
//   CONVERGED = the preview branch  (preview/document-identity, palette only)
//
// Same source rows, same Puppeteer, same @sparticuz/chromium, same html-to-docx.
// The ONLY difference between the two sets is the palette, which is what makes
// the side-by-side worth anything.
//
// Run: node --env-file=.env gen-identity-samples.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const NAVY = 'https://isotherm-app.vercel.app'
const CONV = process.env.CONV_BASE
const SHARE = process.env.VERCEL_SHARE   // _vercel_jwt cookie value for the preview
if (!CONV || !SHARE) { console.error('set CONV_BASE and VERCEL_SHARE'); process.exit(1) }

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { error: authErr } = await sb.auth.signInWithPassword({
  email: process.env.admin_email, password: process.env.admin_password,
})
if (authErr) { console.error('login failed:', authErr.message); process.exit(1) }
const token = (await sb.auth.getSession()).data.session.access_token

mkdirSync('out', { recursive: true })

// ── Pick one real ZZ-TEST source row per document type ────────────────────────
const { data: report } = await sb.from('site_reports')
  .select('id, report_number').eq('project_id', ZZ)
  .not('storage_url', 'is', null).order('report_date', { ascending: false }).limit(1).maybeSingle()

// The meetings table is EMPTY at rest across the whole database — pw-meetings
// creates and deletes its own. So this harness seeds one too, and deletes it in
// the finally block. It is deliberately REPRESENTATIVE, not minimal: two topic
// bands (the judgment call), an open item, a closed item, and an assigned item
// with a due date, so the action-summary group rows render as well. Anything
// less would make the greyscale question unanswerable.
let seededMeetingId = null
async function seedMeeting() {
  const { data: type } = await sb.from('meeting_types').select('id, name').limit(1).maybeSingle()
  if (!type) throw new Error('no meeting_types row to seed from')
  const { data: m, error } = await sb.from('meetings').insert({
    project_id: ZZ, meeting_type_id: type.id, meeting_number: 901,
    meeting_date: '2026-07-25', start_time: '10:00', location: 'Site trailer, Level 1',
    prepared_by: 'Dev Admin', next_meeting_date: '2026-08-08', status: 'draft',
  }).select('id, meeting_number, status').single()
  if (error) throw new Error(`meeting seed: ${error.message}`)
  seededMeetingId = m.id

  const topics = [
    { title: 'Mechanical — AHU and Terminal Units', sort_order: 1 },
    { title: 'Electrical — Distribution and Life Safety', sort_order: 2 },
  ]
  const { data: t } = await sb.from('meeting_topics')
    .insert(topics.map(x => ({ ...x, meeting_id: m.id }))).select('id, sort_order')
  const byOrder = Object.fromEntries((t ?? []).map(r => [r.sort_order, r.id]))

  await sb.from('meeting_items').insert([
    { meeting_id: m.id, topic_id: byOrder[1], item_number: '1.1', sort_order: 1,
      discussion: 'AHU-1 supply fan VFD parameters confirmed against the sequence of operations. Contractor to provide the final commissioned parameter list.',
      responsible_text: 'Vanguard Mechanical Inc.', due_date: '2026-08-01', status: 'open' },
    { meeting_id: m.id, topic_id: byOrder[1], item_number: '1.2', sort_order: 2,
      discussion: 'Terminal unit airflow verification complete on Level 2. Results within tolerance; no further action.',
      responsible_text: 'Vanguard Mechanical Inc.', status: 'closed' },
    { meeting_id: m.id, topic_id: byOrder[2], item_number: '2.1', sort_order: 1,
      discussion: 'ATS transfer test witnessed. Retest required after the generator load bank exercise.',
      responsible_text: 'Automated Logic Controls', due_date: '2026-08-15', status: 'open' },
    { meeting_id: m.id, topic_id: byOrder[2], item_number: '2.2', sort_order: 2,
      discussion: 'Fire alarm interface matrix outstanding from the previous meeting.',
      responsible_text: 'Automated Logic Controls', due_date: '2026-07-31', status: 'open' },
  ])
  console.log(`  seeded meeting #${m.meeting_number} (${topics.length} topics, 4 items) — will be deleted`)
  return m
}
const meeting = await seedMeeting()

const { data: instance } = await sb.from('checklist_instances')
  .select('id, source_template_name_snapshot').eq('project_id', ZZ)
  .order('created_at', { ascending: false }).limit(1).maybeSingle()

console.log('sources:')
console.log('  site report :', report?.report_number ?? 'NONE')
console.log('  meeting     :', meeting?.meeting_number ?? 'NONE', `(${meeting?.status ?? '-'})`)
console.log('  checklist   :', instance?.source_template_name_snapshot ?? 'NONE')
if (!report || !meeting || !instance) { console.error('missing a ZZ-TEST source row'); process.exit(1) }

const JOBS = [
  { kind: 'report',    path: '/api/generate-report',    body: { report_id: report.id } },
  { kind: 'minutes',   path: '/api/generate-minutes',   body: { meeting_id: meeting.id } },
  { kind: 'checklist', path: '/api/generate-checklist', body: { instance_id: instance.id, mode: 'completed' } },
]

/** The generators PERSIST for report/minutes; we only read what they hand back.
 *  Both deployments write to the same buckets, so CONVERGED runs last would
 *  otherwise leave purple files attached to a real row. Handled below. */
async function generate(base, job, variant) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  if (base === CONV) headers.Cookie = `_vercel_jwt=${SHARE}`
  const r = await fetch(`${base}${job.path}`, { method: 'POST', headers, body: JSON.stringify(job.body) })
  const b = await r.json().catch(() => ({}))
  if (!r.ok) { console.log(`  FAIL ${variant}/${job.kind}: ${r.status} ${b.error ?? ''}`); return null }

  // generate-checklist hands back SIGNED URLS (it persists nothing).
  // generate-report/minutes hand back bucket-relative PATHS and persist them on
  // the row — so sign those through the app's own row-anchored endpoint rather
  // than guessing the bucket. Signed IMMEDIATELY after each generation, which is
  // why converged files survive the navy run that overwrites the same row.
  const signRow = async (table, id, kind) => {
    const r = await fetch(`${NAVY}/api/get-file-url`, {
      method: 'POST', headers,
      body: JSON.stringify({ table, id, kind }),
    })
    const j = await r.json().catch(() => ({}))
    return j.url ?? null
  }
  const grab = async (u) => u ? Buffer.from(await (await fetch(u)).arrayBuffer()) : null

  let docxUrl = null, pdfUrl = null
  if (job.kind === 'checklist') { docxUrl = b.storage_url; pdfUrl = b.pdf_url }
  else {
    const table = job.kind === 'report' ? 'site_reports' : 'meetings'
    const id = job.kind === 'report' ? report.id : meeting.id
    docxUrl = await signRow(table, id, 'docx')
    pdfUrl = await signRow(table, id, 'pdf')
  }
  const docx = await grab(docxUrl)
  const pdf = await grab(pdfUrl)
  for (const [ext, buf] of [['docx', docx], ['pdf', pdf]]) {
    if (!buf) { console.log(`  MISS ${variant}/${job.kind}.${ext}`); continue }
    writeFileSync(`out/${variant}-${job.kind}.${ext}`, buf)
    console.log(`  · out/${variant}-${job.kind}.${ext} (${(buf.length / 1024).toFixed(0)} kB)`)
  }
  return b
}

// NAVY LAST, deliberately: report/minutes persist their output onto the real
// ZZ-TEST row, so whatever runs last is what stays attached. Production/navy
// must be the resting state — this harness must not leave a purple document
// hanging off a real record.
console.log('\nCONVERGED (preview branch):')
for (const job of JOBS) await generate(CONV, job, 'converged')

console.log('\nNAVY (production) — run last so the persisted state ends navy:')
for (const job of JOBS) await generate(NAVY, job, 'navy')

console.log('\nsamples in out/. Verifying the persisted rows ended NAVY-side…')
const { data: after } = await sb.from('site_reports').select('storage_url, updated_at').eq('id', report.id).maybeSingle()
console.log('  site_reports row storage_url:', after?.storage_url ?? '(none)')

// ── Clean up the seeded meeting, unconditionally ──────────────────────────────
if (seededMeetingId) {
  await sb.from('meetings').delete().eq('id', seededMeetingId)
  const { data: left } = await sb.from('meetings').select('id').eq('project_id', ZZ)
  console.log(`  seeded meeting removed — meetings on ZZ-TEST: ${(left ?? []).length} (must be 0)`)
}
