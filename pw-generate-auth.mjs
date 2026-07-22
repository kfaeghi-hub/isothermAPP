// generate-* endpoint auth gate (GENERATE-AUTH-PROPOSAL.md §4, approved 2026-07-22).
// API-layer, pw-access style, self-cleaning, ZZ-TEST family only.
//
// Matrix (authorization runs BEFORE the render pipeline, so bare seeded rows are
// enough for the 403 legs — no full instance/meeting fixtures needed):
//   anonymous POST                          → 401
//   malformed token                         → 401
//   dev.test  token, non-member project     → 403   (report, minutes, checklist)
//   dev.owner token, non-member project     → 403   (owner tier rides membership —
//                                                    no blanket generation access)
//   dev.test  token, member project (ZZ-TEST report) → 200 with document URLs
//   dev.admin token, any project            → 200
//   authed POST, random uuid                → 404
//   OPTIONS from foreign origin             → no ACAO header
//   OPTIONS from production origin          → ACAO echoes it
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-generate-auth.mjs

import { createClient } from '@supabase/supabase-js'
import { apiToken, credentials, adminCredentials } from './pw-config.mjs'

const BASE = process.env.PW_BASE_URL ?? 'https://isotherm-app.vercel.app'
const ZZ_REPORT = '94b1ee0e-325e-4286-b079-45cecd3400f7' // ZZ-TEST ZZ-1 (regen fixture)

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

function ownerCredentials() {
  const email = process.env.owner_email, password = process.env.owner_password
  if (!email || !password) { console.error('Missing owner_email/owner_password in .env.'); process.exit(1) }
  return { email, password }
}

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  return { status: res.status, payload }
}

// ── Seed: a project neither dev.test nor dev.owner is a member of ──────────────
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
{
  const { email, password } = adminCredentials()
  const { error } = await adm.auth.signInWithPassword({ email, password })
  if (error) { console.error(`admin sign-in failed: ${error.message}`); process.exit(1) }
}

const ts = Date.now()
const projectId = crypto.randomUUID() // client-generated id (INSERT..RETURNING trap)
const projectName = `ZZ-TEST-AUTH-${ts}`
{
  const { error } = await adm.from('projects').insert({ id: projectId, name: projectName, status: 'active' })
  if (error) { console.error(`seed project failed: ${error.message}`); process.exit(1) }
}
// Bare rows — enough for authz-layer 403s (authorization precedes the pipeline).
const reportId = crypto.randomUUID()
const meetingId = crypto.randomUUID()
const instanceId = crypto.randomUUID()
{
  let { error } = await adm.from('site_reports').insert({
    id: reportId, project_id: projectId, report_number: 'A1',
    site_visit_date: '2026-07-22', report_date: '2026-07-22', authored_by: 'ZZ Auth Gate',
  })
  if (error) { console.error(`seed report failed: ${error.message}`); process.exit(1) }
  const { data: mt } = await adm.from('meeting_types').select('id').limit(1).single()
  ;({ error } = await adm.from('meetings').insert({
    id: meetingId, project_id: projectId, meeting_type_id: mt.id, meeting_number: 1,
    meeting_date: '2026-07-22', status: 'draft', prepared_by: 'ZZ Auth Gate',
  }))
  if (error) { console.error(`seed meeting failed: ${error.message}`); process.exit(1) }
  ;({ error } = await adm.from('checklist_instances').insert({
    id: instanceId, project_id: projectId,
    source_template_name_snapshot: 'ZZ Auth Gate IVC',
    source_template_type_snapshot: 'ivc',
    created_from_template_at: new Date().toISOString(),
    type: 'ivc', status: 'not_started',
  }))
  if (error) { console.error(`seed instance failed: ${error.message}`); process.exit(1) }
}
console.log(`seeded: ${projectName} (report, meeting, instance; NO dev.test/dev.owner membership)\n`)

try {
  const testToken  = await apiToken(credentials())
  const ownerToken = await apiToken(ownerCredentials())
  const adminToken = await apiToken(adminCredentials())

  console.log('=== 401 — identity required ===')
  for (const [path, body] of [
    ['/api/generate-report',    { report_id: reportId }],
    ['/api/generate-minutes',   { meeting_id: meetingId }],
    ['/api/generate-checklist', { instance_id: instanceId, mode: 'completed' }],
  ]) {
    const anon = await post(path, body)
    check(anon.status === 401, `${path}: anonymous → 401 (got ${anon.status})`)
  }
  const bad = await post('/api/generate-report', { report_id: reportId }, 'garbage-not-a-jwt')
  check(bad.status === 401, `malformed token → 401 (got ${bad.status})`)

  console.log('\n=== 403 — valid identity, no project access ===')
  for (const [who, token] of [['dev.test', testToken], ['dev.owner', ownerToken]]) {
    const r = await post('/api/generate-report', { report_id: reportId }, token)
    check(r.status === 403, `${who} on non-member project report → 403 (got ${r.status})`)
  }
  const m = await post('/api/generate-minutes', { meeting_id: meetingId }, testToken)
  check(m.status === 403, `dev.test on non-member meeting → 403 (got ${m.status})`)
  const c = await post('/api/generate-checklist', { instance_id: instanceId, mode: 'completed' }, ownerToken)
  check(c.status === 403, `dev.owner on non-member instance → 403 (got ${c.status})`)

  console.log('\n=== 404 — authenticated, unknown id (no anonymous probing) ===')
  const nf = await post('/api/generate-report', { report_id: crypto.randomUUID() }, testToken)
  check(nf.status === 404, `authed random uuid → 404 (got ${nf.status})`)

  console.log('\n=== 200 — member and admin ===')
  const member = await post('/api/generate-report', { report_id: ZZ_REPORT }, testToken)
  check(member.status === 200 && !!member.payload.pdf_url && !!member.payload.storage_url,
    `dev.test member (ZZ-TEST report) → 200 with document URLs (got ${member.status})`)
  const admin200 = await post('/api/generate-report', { report_id: ZZ_REPORT }, adminToken)
  check(admin200.status === 200, `dev.admin → 200 (got ${admin200.status})`)

  console.log('\n=== CORS ===')
  const foreign = await fetch(`${BASE}/api/generate-report`, {
    method: 'OPTIONS', headers: { Origin: 'https://evil.example' },
  })
  check(!foreign.headers.get('access-control-allow-origin'),
    `foreign-origin preflight carries NO ACAO header`)
  const home = await fetch(`${BASE}/api/generate-report`, {
    method: 'OPTIONS', headers: { Origin: 'https://isotherm-app.vercel.app' },
  })
  check(home.headers.get('access-control-allow-origin') === 'https://isotherm-app.vercel.app',
    `production-origin preflight echoes ACAO`)
} finally {
  // ── Self-clean: project delete cascades report/meeting/instance ──────────────
  const { error: delErr } = await adm.from('projects').delete().eq('id', projectId)
  const { data: leftover } = await adm.from('projects').select('id').eq('id', projectId)
  console.log(`\ncleanup: ${delErr ? `FAILED — ${delErr.message}` : `project deleted, residue=${leftover?.length ?? 0}`}`)
  if (delErr || (leftover?.length ?? 0) > 0) fails.push('cleanup incomplete')
}

console.log('\n' + '='.repeat(60))
if (fails.length) { console.log(`FAIL — ${fails.length} check(s):`); fails.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('ALL CHECKS PASSED — generate-* endpoints enforce identity + project access.')
