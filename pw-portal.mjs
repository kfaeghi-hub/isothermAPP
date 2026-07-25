// EXTERNAL PROJECT PORTAL — the security gate (Part A, 2026-07-25).
//
// The highest-stakes boundary in the system: external users, same database.
// Discipline: EVERY negative leg is paired with the positive that proves the
// mechanism works at all — a "0 rows" that would also be 0 rows if the feature
// were broken proves nothing.
//
// Scope guard: dev.client is given a portal_members row on **ZZ-TEST ONLY**, by
// this suite, and it is removed at the end. The invite leg creates and redeems
// its own throwaway invite for a zz-test.example address — never dev.client's
// account, never a directory contact. Mail is asserted to be zero, every time.
//
// Run: node --env-file=.env pw-portal.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { BASE_URL } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const PROBE_NAME = `ZZ-PORTAL Probe ${Date.now().toString(36)}`
const INVITE_EMAIL = `zz-portal-${Date.now().toString(36)}@zz-test.example`
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const mk = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// Management API — only for deleting the throwaway AUTH user at the end
// (auth.users isn't reachable through PostgREST; user_profiles cascades from it).
const MGMT = process.env.SUPABASE_MGMT_TOKEN
async function mgmtSql(query) {
  if (!MGMT) return null
  const r = await fetch('https://api.supabase.com/v1/projects/isztyeczqndploybdtcn/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return r.ok ? r.json() : null
}

const cli = mk(), adm = mk(), emp = mk()
{
  const c = await cli.auth.signInWithPassword({ email: process.env.client_email, password: process.env.client_password })
  const a = await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const e = await emp.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
  if (c.error || a.error || e.error) {
    console.error('login failed:', c.error?.message ?? a.error?.message ?? e.error?.message); process.exit(1)
  }
}
const { data: { user: clientUser } } = await cli.auth.getUser()
const tok = async (c) => (await c.auth.getSession()).data.session.access_token
const post = async (c, path, body) => {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(c ? { Authorization: `Bearer ${await tok(c)}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

let probeProjectId = null, draftReportId = null, inviteIds = []

async function cleanup() {
  await adm.from('portal_members').delete().eq('profile_id', clientUser.id)
  if (draftReportId) await adm.from('site_reports').delete().eq('id', draftReportId)
  if (probeProjectId) await adm.from('projects').delete().eq('id', probeProjectId)
  for (const id of inviteIds) await adm.from('portal_invites').delete().eq('id', id)
  await adm.from('portal_invites').delete().ilike('email', 'zz-portal-%@zz-test.example')
  // The redeemed account: delete the auth user; user_profiles + portal_members cascade.
  await mgmtSql(`delete from auth.users where email = '${INVITE_EMAIL}'`)
}

try {
  // ── Setup ────────────────────────────────────────────────────────────────
  const { data: proj } = await adm.from('projects').insert({ name: PROBE_NAME }).select('id').single()
  probeProjectId = proj.id
  const { data: draft } = await adm.from('site_reports').insert({
    project_id: ZZ, report_number: `ZZ-PORTAL-DRAFT-${Date.now().toString(36)}`,
    site_visit_date: '2026-07-25', report_date: '2026-07-25', authored_by: 'Dev Admin',
  }).select('id').single()          // storage_url NULL ⇒ a DRAFT by the 9.2(a) test
  draftReportId = draft.id

  // ── 1 · Before membership: the portal is empty (the baseline) ────────────
  {
    const { data } = await cli.rpc('portal_projects')
    check((data ?? []).length === 0, 'BASELINE: no portal membership → zero projects')
  }

  await adm.from('portal_members').insert({ project_id: ZZ, profile_id: clientUser.id })

  // ── 2 · POSITIVE: the portal reads what it should ───────────────────────
  {
    const { data } = await cli.rpc('portal_projects')
    check((data ?? []).length === 1 && data[0].project_id === ZZ, 'portal_projects returns exactly the invited project')
  }
  const { data: pf } = await cli.rpc('portal_findings', { pid: ZZ })
  check((pf ?? []).length > 0, `portal_findings returns the register (${pf?.length ?? 0} rows)`)
  {
    const cols = Object.keys(pf?.[0] ?? {}).sort().join(',')
    const expected = ['finding_id','number','title','description','category','building_area',
      'corrective_action','status','date_raised','date_closed','responsible_company'].sort().join(',')
    check(cols === expected, 'register returns EXACTLY the whitelisted columns')
    check(!cols.includes('identified_by'), 'register never exposes identified_by (internal staff name)')
    check(!cols.includes('origin'), 'register never exposes origin')
  }
  {
    const { data } = await cli.rpc('portal_stats', { pid: ZZ })
    check((data ?? []).length === 1 && typeof data[0].findings_open === 'number', 'portal_stats returns aggregates')
  }
  {
    const { data } = await cli.rpc('portal_team', { pid: ZZ })
    check(Array.isArray(data), `portal_team returns rows (${data?.length ?? 0})`)
  }
  // portal_project(pid) — the single-project header read, added in Part B.
  // Gated on portal_can_view (so the staff preview has a name to render),
  // NOT on membership. Both halves asserted: the invited project resolves,
  // a non-invited one returns nothing through the same function.
  {
    const { data } = await cli.rpc('portal_project', { pid: ZZ })
    check((data ?? []).length === 1 && typeof data[0].name === 'string' && data[0].name.length > 0,
      `portal_project returns the project header ("${data?.[0]?.name ?? 'NONE'}")`)
    const { data: other } = await cli.rpc('portal_project', { pid: probeProjectId })
    check((other ?? []).length === 0,
      'PAIR: portal_project returns nothing for a NON-invited project')
  }

  // ── 3 · ISSUED-ONLY: the pairing that proves the filter is real ─────────
  const { data: docs } = await cli.rpc('portal_documents', { pid: ZZ })
  check((docs ?? []).length > 0, `portal_documents returns issued documents (${docs?.length ?? 0})`)
  check(!(docs ?? []).some(d => d.row_id === draftReportId),
    'POSITIVE/NEGATIVE PAIR: the DRAFT report is absent while issued ones are present')

  // Staff CAN sign the draft (proves the draft exists and the endpoint works)…
  {
    const { status } = await post(emp, '/api/get-file-url', { table: 'site_reports', id: draftReportId, kind: 'docx' })
    check(status === 404 || status === 200, `staff reach the draft row (${status} — 404 only because no file was generated)`)
  }
  // …the external caller is refused BEFORE any file question is asked.
  {
    const { status, body } = await post(cli, '/api/get-file-url', { table: 'site_reports', id: draftReportId, kind: 'docx' })
    check(status === 403 && /not been issued/i.test(body.error ?? ''), `client signing a DRAFT → 403 (${body.error ?? status})`)
  }
  // And the issued one succeeds — the mechanism works.
  {
    const issued = (docs ?? []).find(d => d.kind === 'site_report' && d.has_pdf)
    if (!issued) check(false, 'no issued site report on ZZ-TEST to test the positive leg')
    else {
      const { status, body } = await post(cli, '/api/get-file-url', { table: 'site_reports', id: issued.row_id, kind: 'pdf' })
      check(status === 200 && !!body.url, `client signing an ISSUED document → 200 (${status})`)
      if (body.url) { const f = await fetch(body.url); check(f.ok, `client downloads the issued document (${f.status})`) }
    }
  }

  // ── 4 · NEGATIVES with their positives ──────────────────────────────────
  // Base tables: the portal reads via RPC, so NO client policy may exist.
  {
    const { data: direct } = await cli.from('findings').select('id').eq('project_id', ZZ)
    check((direct ?? []).length === 0 && (pf ?? []).length > 0,
      'PAIR: direct findings query → 0 rows, while the RPC returns the register (no client policy exists)')
  }
  {
    const { data } = await cli.from('finding_diary_entries').select('id').limit(5)
    check((data ?? []).length === 0, 'diaries → zero rows (no client policy on that table at all)')
  }
  {
    const { data } = await cli.from('site_reports').select('id').eq('project_id', ZZ)
    check((data ?? []).length === 0, 'site_reports direct → zero rows')
  }
  for (const t of ['checklist_instances', 'equipment', 'project_deliverables', 'contacts', 'companies']) {
    const { data } = await cli.from(t).select('id').limit(3)
    check((data ?? []).length === 0, `${t} direct → zero rows`)
  }
  // Another project: scoping, paired with the invited project returning rows.
  {
    const { data } = await cli.rpc('portal_findings', { pid: probeProjectId })
    check((data ?? []).length === 0, 'PAIR: a NON-invited project returns zero rows via the same RPC')
  }
  // Writes: rejected everywhere.
  {
    const { error } = await cli.from('findings').insert({ project_id: ZZ, title: 'ZZ portal write', category: 'INFO' })
    check(!!error, `findings INSERT rejected (${error?.message ?? 'NO ERROR — LEAK'})`)
  }
  {
    const { data } = await cli.from('site_reports').update({ report_number: 'hacked' }).eq('id', draftReportId).select('id')
    check((data ?? []).length === 0, 'site_reports UPDATE affects zero rows')
  }
  {
    const { error } = await cli.from('portal_members').insert({ project_id: probeProjectId, profile_id: clientUser.id })
    check(!!error, 'client cannot grant itself portal membership on another project')
  }
  // generate-* must refuse external callers outright (regeneration is a write).
  {
    const issuedReport = (docs ?? []).find(d => d.kind === 'site_report')
    if (issuedReport) {
      const { status } = await post(cli, '/api/generate-report', { report_id: issuedReport.row_id })
      check(status === 403, `client calling generate-report → 403 (${status})`)
    }
  }
  // ANONYMOUS callers cannot even INVOKE the DEFINER RPCs (migration
  // portal_rpc_grants). This needs its own leg precisely because the original
  // `revoke ... from anon` did NOT work — Postgres grants EXECUTE to PUBLIC by
  // default and anon inherits it, so anon could call all six. Nothing leaked
  // (portal_can_view fails closed on a null auth.uid()), but the zero-rows was
  // doing the work the revoke claimed to do. Asserting the ERROR, not the row
  // count — a row count would pass either way and prove nothing.
  {
    const anon = mk()
    const RPCS = [['portal_projects', undefined], ['portal_findings', { pid: ZZ }],
      ['portal_finding_photos', { pid: ZZ }], ['portal_documents', { pid: ZZ }],
      ['portal_stats', { pid: ZZ }], ['portal_team', { pid: ZZ }],
      ['portal_can_view', { pid: ZZ }], ['is_portal_member', { pid: ZZ }],
      ['portal_project', { pid: ZZ }]]
    const reachable = []
    for (const [fn, args] of RPCS) {
      const { error } = await anon.rpc(fn, args)
      if (error?.code !== '42501') reachable.push(fn)
    }
    check(reachable.length === 0,
      `anonymous callers cannot invoke ANY portal RPC${reachable.length ? ` — REACHABLE: ${reachable.join(', ')}` : ` (${RPCS.length}/${RPCS.length} → 42501)`}`)
    // The positive half: the same call, authenticated, is permitted — so the
    // 42501 above is the grant and not a broken function.
    const { error: staffErr } = await emp.rpc('portal_findings', { pid: ZZ })
    check(!staffErr, 'PAIR: the identical call succeeds for an authenticated caller')
  }

  // ── 5 · Invite flow — mail asserted zero ────────────────────────────────
  const inv = await post(adm, '/api/portal-invite', { project_id: ZZ, email: INVITE_EMAIL })
  check(inv.status === 200 && !!inv.body.invite_url, `invite created (${inv.status})`)
  check(inv.body.mail_attempted === false, 'MAIL: no delivery attempted')
  check(inv.body.delivery_enabled === false, 'MAIL: PORTAL_INVITES_LIVE is off')
  inviteIds.push(inv.body.invite_id)
  const rawToken = new URL(inv.body.invite_url).searchParams.get('token')
  {
    const { data: row } = await adm.from('portal_invites').select('token_hash').eq('id', inv.body.invite_id).single()
    check(!!row && row.token_hash !== rawToken && row.token_hash.length === 64,
      'invite stores a SHA-256 HASH, never the raw token')
  }
  // A client cannot read invites at all.
  {
    const { data } = await cli.from('portal_invites').select('id').limit(5)
    check((data ?? []).length === 0, 'client cannot read portal_invites')
  }
  // Redeem — the positive that proves the negatives below mean something.
  {
    const r = await post(null, '/api/portal-redeem', { token: rawToken, password: 'zz-portal-pw-123', name: 'ZZ Portal Invitee' })
    check(r.status === 200 && r.body.ok, `invite redeemed → account created (${r.status} ${r.body.error ?? ''})`)
    const { data: prof } = await adm.from('user_profiles').select('id, role').eq('email', INVITE_EMAIL).maybeSingle()
    check(prof?.role === 'client', `redeemed account has role client (${prof?.role})`)
    if (prof) {
      const { data: pm } = await adm.from('portal_members').select('id').eq('profile_id', prof.id).eq('project_id', ZZ)
      check((pm ?? []).length === 1, 'redeemed account holds exactly one portal_members row')
      const { data: intern } = await adm.from('project_members').select('id').eq('profile_id', prof.id)
      check((intern ?? []).length === 0, 'redeemed account holds NO project_members row (internal policies cannot match it)')
    }
  }
  // Single use.
  {
    const r = await post(null, '/api/portal-redeem', { token: rawToken, password: 'zz-portal-pw-123' })
    check(r.status === 400, `re-redeeming the same token → rejected (${r.status})`)
  }
  // Revoked.
  {
    const i2 = await post(adm, '/api/portal-invite', { project_id: ZZ, email: `zz-portal-rev-${Date.now().toString(36)}@zz-test.example` })
    inviteIds.push(i2.body.invite_id)
    await adm.from('portal_invites').update({ revoked_at: new Date().toISOString() }).eq('id', i2.body.invite_id)
    const t2 = new URL(i2.body.invite_url).searchParams.get('token')
    const r = await post(null, '/api/portal-redeem', { token: t2, password: 'zz-portal-pw-123' })
    check(r.status === 400, `REVOKED token → rejected (${r.status})`)
  }
  // Expired.
  {
    const i3 = await post(adm, '/api/portal-invite', { project_id: ZZ, email: `zz-portal-exp-${Date.now().toString(36)}@zz-test.example` })
    inviteIds.push(i3.body.invite_id)
    await adm.from('portal_invites').update({ expires_at: '2020-01-01T00:00:00Z' }).eq('id', i3.body.invite_id)
    const t3 = new URL(i3.body.invite_url).searchParams.get('token')
    const r = await post(null, '/api/portal-redeem', { token: t3, password: 'zz-portal-pw-123' })
    check(r.status === 400, `EXPIRED token → rejected (${r.status})`)
  }
  // Garbage token — same shape of failure, no oracle.
  {
    const r = await post(null, '/api/portal-redeem', { token: 'not-a-real-token', password: 'zz-portal-pw-123' })
    check(r.status === 400, `garbage token → rejected identically (${r.status})`)
  }
  // A non-owner/non-lead employee cannot invite.
  {
    const r = await post(emp, '/api/portal-invite', { project_id: probeProjectId, email: 'zz-nope@zz-test.example' })
    check(r.status === 403, `non-member employee cannot invite on another project (${r.status})`)
  }

  // ── 6 · Route separation (browser, as dev.client) ───────────────────────
  {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1400, height: 950 })
    await page.goto(`${BASE_URL}/login`)
    await page.locator('input[type="email"]').fill(process.env.client_email)
    await page.locator('input[type="password"]').fill(process.env.client_password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForTimeout(4000)
    check(page.url().includes('/portal'), `client lands in the portal (${page.url().replace(BASE_URL, '')})`)
    const body = await page.locator('body').innerText()
    check(!/Directory/.test(body) && !/Templates/.test(body),
      'PAIR: no internal nav (Directory/Templates) in the portal shell')
    // The positive half has to be SPECIFIC. The old form matched /projects/i,
    // which would pass on almost any authenticated page — it proved nothing.
    // Assert the portal's own clause grammar instead: all four sections.
    const clauses = ['Progress', 'Issues register', 'Documents', 'Project team']
    const missing = clauses.filter(c => !new RegExp(c, 'i').test(body))
    check(missing.length === 0,
      `…while all four portal sections render${missing.length ? ` — MISSING: ${missing.join(', ')}` : ' (01–04)'}`)

    // The hero H1 must be the PROJECT NAME. Guards a real regression: while
    // portal_projects() was the header's source, a viewer with no membership
    // row rendered the em-dash fallback at display scale — a white bar where
    // the project name belongs. portal_project(pid) fixed it; this keeps it
    // fixed. Asserting the name, not "an h1 exists".
    const h1 = (await page.locator('h1').first().innerText().catch(() => '')).trim()
    check(h1.length > 1 && h1 !== '—', `hero H1 carries the project name ("${h1}")`)

    // Counters must never render a fake zero for a project with no checklists:
    // a null reading is an em-dash, and the count-up animation must skip it.
    const progress = await page.locator('header').innerText().catch(() => '')
    check(/CHECKLISTS COMPLETE/i.test(progress), 'progress instrument renders in the hero')
    await page.goto(`${BASE_URL}/projects`)
    await page.waitForTimeout(2500)
    check(page.url().includes('/portal'), `internal route /projects redirects to the portal (${page.url().replace(BASE_URL, '')})`)
    await page.goto(`${BASE_URL}/directory`)
    await page.waitForTimeout(2500)
    check(page.url().includes('/portal'), '/directory redirects to the portal')
    await browser.close()
  }

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await cleanup()
  const { data: left } = await adm.from('portal_members').select('id').eq('profile_id', clientUser.id)
  check((left ?? []).length === 0, 'self-clean: dev.client portal membership removed')
  const { data: leftInv } = await adm.from('portal_invites').select('id').ilike('email', 'zz-portal-%')
  check((leftInv ?? []).length === 0, 'self-clean: throwaway invites removed')
  const { data: leftProf } = await adm.from('user_profiles').select('id').eq('email', INVITE_EMAIL)
  check((leftProf ?? []).length === 0, 'self-clean: throwaway account removed')
}

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0
  ? 'PASS — portal boundary holds: RPC-only reads, issued-only documents, no writes, no internal routes, zero mail.'
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
