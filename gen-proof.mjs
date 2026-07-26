// POST-MERGE VISUAL PROOF (2026-07-26). The ruling shipped; no automated gate
// catches colour, so this regenerates one of each document type from the SAME
// source rows and leaves them in out/ to be looked at.
//
//   proof-*  → current production (converged, post-merge)
//   navy-*   → the immutable PRE-MERGE production deployment, so the side-by-side
//              bundle survives. (An earlier mislabelled run of the evidence
//              harness overwrote the original navy-* files; this restores them
//              from the deployment that actually rendered them.)
//
// Seeding is wrapped in try/finally this time — the earlier version leaked two
// meetings onto ZZ-TEST when it crashed before reaching its cleanup line.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const PROD = 'https://isotherm-app.vercel.app'
const PREMERGE = process.env.PREMERGE_BASE   // pre-palette production deployment

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
const token = (await sb.auth.getSession()).data.session.access_token
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
mkdirSync('out', { recursive: true })

const { data: report } = await sb.from('site_reports')
  .select('id, report_number').eq('project_id', ZZ)
  .not('storage_url', 'is', null).order('report_date', { ascending: false }).limit(1).maybeSingle()
const { data: instance } = await sb.from('checklist_instances')
  .select('id').eq('project_id', ZZ).order('created_at', { ascending: false }).limit(1).maybeSingle()

let meetingId = null
try {
  const { data: type } = await sb.from('meeting_types').select('id').limit(1).maybeSingle()
  const { data: m } = await sb.from('meetings').insert({
    project_id: ZZ, meeting_type_id: type.id, meeting_number: 902,
    meeting_date: '2026-07-26', start_time: '10:00', location: 'Site trailer, Level 1',
    prepared_by: 'Dev Admin', next_meeting_date: '2026-08-09', status: 'draft',
  }).select('id').single()
  meetingId = m.id
  const { data: t } = await sb.from('meeting_topics').insert([
    { meeting_id: m.id, title: 'Mechanical — AHU and Terminal Units', sort_order: 1 },
    { meeting_id: m.id, title: 'Electrical — Distribution and Life Safety', sort_order: 2 },
  ]).select('id, sort_order')
  const by = Object.fromEntries(t.map(r => [r.sort_order, r.id]))
  await sb.from('meeting_items').insert([
    { meeting_id: m.id, topic_id: by[1], item_number: '1.1', sort_order: 1, status: 'open',
      discussion: 'AHU-1 supply fan VFD parameters confirmed against the sequence of operations.',
      responsible_text: 'Vanguard Mechanical Inc.', due_date: '2026-08-01' },
    { meeting_id: m.id, topic_id: by[1], item_number: '1.2', sort_order: 2, status: 'closed',
      discussion: 'Terminal unit airflow verification complete on Level 2. Within tolerance.',
      responsible_text: 'Vanguard Mechanical Inc.' },
    { meeting_id: m.id, topic_id: by[2], item_number: '2.1', sort_order: 1, status: 'open',
      discussion: 'ATS transfer test witnessed. Retest after the generator load bank exercise.',
      responsible_text: 'Automated Logic Controls', due_date: '2026-08-15' },
  ])

  const JOBS = [
    ['report', '/api/generate-report', { report_id: report.id }, 'site_reports', report.id],
    ['minutes', '/api/generate-minutes', { meeting_id: m.id }, 'meetings', m.id],
    ['checklist', '/api/generate-checklist', { instance_id: instance.id, mode: 'completed' }, null, null],
  ]

  const sign = async (table, id, kind) => {
    const r = await fetch(`${PROD}/api/get-file-url`, {
      method: 'POST', headers, body: JSON.stringify({ table, id, kind }),
    })
    return (await r.json().catch(() => ({}))).url ?? null
  }

  async function run(base, tag) {
    console.log(`\n${tag} — ${base}`)
    for (const [kind, path, body, table, rowId] of JOBS) {
      const h2 = base === PREMERGE ? { ...headers, Cookie: `_vercel_jwt=${process.env.PREMERGE_JWT}` } : headers
      const r = await fetch(`${base}${path}`, { method: 'POST', headers: h2, body: JSON.stringify(body) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) { console.log(`  FAIL ${kind}: ${r.status} ${b.error ?? ''}`); continue }
      const urls = table
        ? { docx: await sign(table, rowId, 'docx'), pdf: await sign(table, rowId, 'pdf') }
        : { docx: b.storage_url, pdf: b.pdf_url }
      for (const [ext, u] of Object.entries(urls)) {
        if (!u) { console.log(`  MISS ${tag}-${kind}.${ext}`); continue }
        const buf = Buffer.from(await (await fetch(u)).arrayBuffer())
        writeFileSync(`out/${tag}-${kind}.${ext}`, buf)
        console.log(`  · out/${tag}-${kind}.${ext} (${(buf.length / 1024).toFixed(0)} kB)`)
      }
    }
  }

  if (PREMERGE) await run(PREMERGE, 'navy')
  await run(PROD, 'proof')          // production LAST — the persisted row rests converged
} finally {
  if (meetingId) await sb.from('meetings').delete().eq('id', meetingId)
  const { data: left } = await sb.from('meetings').select('id')
  console.log(`\ncleanup — meetings table total: ${(left ?? []).length} (must be 0)`)
}
