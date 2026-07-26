// Second evidence pass: the CLOSED-FINDING GREY BAND.
//
// The first pass could not exercise it — ZZ-TEST carries 22 open findings and
// ZERO closed ones, so `tr.closed` (#E3E3E3 fill, #777 text) never rendered and
// the sample proved nothing about the one convention the brief singled out.
// A file that happens not to contain the thing you are judging is not evidence.
//
// So: create ONE throwaway closed finding on ZZ-TEST, regenerate the site report
// through both deployments, delete it. Creates its own row, touches no existing
// one, and is removed unconditionally.
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const NAVY = 'https://isotherm-app.vercel.app'
const CONV = process.env.CONV_BASE
const SHARE = process.env.VERCEL_SHARE
if (!CONV || !SHARE) { console.error('set CONV_BASE and VERCEL_SHARE'); process.exit(1) }

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
const token = (await sb.auth.getSession()).data.session.access_token
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

const { data: report } = await sb.from('site_reports')
  .select('id, report_number').eq('project_id', ZZ)
  .not('storage_url', 'is', null).order('report_date', { ascending: false }).limit(1).maybeSingle()

let findingId = null
try {
  const { data: f, error } = await sb.from('findings').insert({
    project_id: ZZ, number: '901', title: 'ZZ-PALETTE closed-band sample',
    description: 'Throwaway finding created only to render the closed-finding grey band for the document-identity ruling. Deleted immediately after generation.',
    corrective_action: 'Contractor replaced the damaged isolation damper actuator and re-verified travel.',
    category: 'Mechanical', building_area: 'Level 2 mechanical room',
    status: 'closed', date_raised: '2026-07-10', date_closed: '2026-07-24',
  }).select('id').single()
  if (error) throw new Error(`finding insert: ${error.message}`)
  findingId = f.id
  console.log('seeded closed finding #901')

  const signRow = async (kind) => {
    const r = await fetch(`${NAVY}/api/get-file-url`, {
      method: 'POST', headers, body: JSON.stringify({ table: 'site_reports', id: report.id, kind }),
    })
    return (await r.json().catch(() => ({}))).url ?? null
  }

  for (const [variant, base] of [['converged', CONV], ['navy', NAVY]]) {
    const h = { ...headers, ...(base === CONV ? { Cookie: `_vercel_jwt=${SHARE}` } : {}) }
    const r = await fetch(`${base}/api/generate-report`, {
      method: 'POST', headers: h, body: JSON.stringify({ report_id: report.id }),
    })
    if (!r.ok) { console.log(`  FAIL ${variant}: ${r.status}`); continue }
    for (const kind of ['pdf', 'docx']) {
      const u = await signRow(kind)
      if (!u) { console.log(`  MISS ${variant}.${kind}`); continue }
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer())
      writeFileSync(`out/${variant}-report-closedband.${kind}`, buf)
      console.log(`  · out/${variant}-report-closedband.${kind} (${(buf.length / 1024).toFixed(0)} kB)`)
    }
  }
} finally {
  if (findingId) {
    await sb.from('findings').delete().eq('id', findingId)
    const { data: left } = await sb.from('findings').select('id').eq('project_id', ZZ).eq('number', '901')
    console.log(`  throwaway finding removed — #901 rows remaining: ${(left ?? []).length} (must be 0)`)
  }
  // Restore the persisted row to the NAVY rendering: production must be the
  // resting state, and the navy pass above already overwrote it — but that pass
  // included the throwaway finding. Regenerate once more, now that it is gone.
  const r = await fetch(`${NAVY}/api/generate-report`, {
    method: 'POST', headers, body: JSON.stringify({ report_id: report.id }),
  })
  console.log(`  persisted row restored to navy-without-throwaway: ${r.status}`)
}
