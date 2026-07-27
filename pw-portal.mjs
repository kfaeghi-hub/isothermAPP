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

let probeProjectId = null, draftReportId = null, inviteIds = [], linkIds = []

async function cleanup() {
  await adm.from('portal_members').delete().eq('profile_id', clientUser.id)
  if (draftReportId) await adm.from('site_reports').delete().eq('id', draftReportId)
  for (const id of linkIds) await adm.from('portal_share_links').delete().eq('id', id)
  // Sweep by PROJECT, not by label. The label sweep missed a row whose label was
  // NULL, because NULL never matches LIKE — and the suite only ever creates
  // links on ZZ-TEST, so the project is the honest scope. This is the ops rule
  // in ARCHITECTURE ("clean unconditionally and by ID") catching its own author.
  await adm.from('portal_share_links').delete().eq('project_id', ZZ)
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


  // == 7 . SHARE-LINK MODE ===================================================
  // The amended access mode (2026-07-26). Every leg pairs its negative with the
  // positive that proves the mechanism is live -- a link that "returns nothing"
  // would also return nothing if the whole feature were broken.
  {
    const mkLink = async (label, expires) => {
      const r = await post(adm, '/api/portal-share-link', { project_id: ZZ, label, expires })
      if (r.status !== 200) return null
      linkIds.push(r.body.link_id)
      return { id: r.body.link_id, url: r.body.link_url, token: r.body.link_url.split('/portal/link/')[1] }
    }
    const openLink = async (tok) => {
      const r = await fetch(`${BASE_URL}/api/portal-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok }),
      })
      return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers }
    }
    const signViaLink = async (tok, body) => {
      const r = await fetch(`${BASE_URL}/api/get-file-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_token: tok, ...body }),
      })
      return { status: r.status, body: await r.json().catch(() => ({})) }
    }

    const live = await mkLink('ZZ-LINK live', '1m')
    check(!!live, `share link created (${live ? 'ok' : 'FAILED'})`)

    // -- POSITIVE: the link opens and carries the record --------------------
    const opened = await openLink(live.token)
    check(opened.status === 200, `valid link opens (${opened.status})`)
    check((opened.body.findings ?? []).length > 0,
      `link bundle carries the register (${(opened.body.findings ?? []).length} findings)`)
    check(!!opened.body.project?.name,
      `link bundle carries the project header ("${opened.body.project?.name}")`)

    // -- THE ANTI-DRIFT TEST: field-by-field against ACCOUNT mode -----------
    // This is the leg that fails the moment the two paths diverge, which is the
    // entire reason the column lists were moved into portal_internal.
    {
      const { data: acctF } = await cli.rpc('portal_findings', { pid: ZZ })
      const linkF = opened.body.findings ?? []
      const acctCols = Object.keys(acctF?.[0] ?? {}).sort().join(',')
      const linkCols = Object.keys(linkF[0] ?? {}).sort().join(',')
      check(acctCols === linkCols && acctCols.length > 0,
        acctCols === linkCols
          ? `ANTI-DRIFT findings columns identical account vs link (${acctCols.split(',').length} fields)`
          : `ANTI-DRIFT findings columns DIVERGED\n      account: ${acctCols}\n      link:    ${linkCols}`)
      check(!linkCols.includes('identified_by') && !linkCols.includes('origin'),
        'link register excludes identified_by and origin, exactly as account mode does')

      for (const [name, rpc, arr] of [
        ['documents', 'portal_documents', opened.body.documents],
        ['team', 'portal_team', opened.body.team],
        ['photos', 'portal_finding_photos', opened.body.photos],
      ]) {
        const { data: a } = await cli.rpc(rpc, { pid: ZZ })
        const ac = Object.keys(a?.[0] ?? {}).sort().join(',')
        const lc = Object.keys((arr ?? [])[0] ?? {}).sort().join(',')
        check(ac === lc, `ANTI-DRIFT ${name} columns identical account vs link${ac === lc ? '' : ` (${ac} | ${lc})`}`)
      }
      const { data: aStats } = await cli.rpc('portal_stats', { pid: ZZ })
      check(Object.keys(aStats?.[0] ?? {}).sort().join(',') === Object.keys(opened.body.stats ?? {}).sort().join(','),
        'ANTI-DRIFT stats columns identical account vs link')
    }

    // -- Expiry: NEGATIVE paired with the SAME link working before ----------
    {
      const tmp = await mkLink('ZZ-LINK expiring', '1d')
      const before = await openLink(tmp.token)
      check(before.status === 200, `PAIR: link works before expiry (${before.status})`)
      await adm.from('portal_share_links')
        .update({ expires_at: new Date(Date.now() - 86400000).toISOString() }).eq('id', tmp.id)
      const after = await openLink(tmp.token)
      check(after.status === 403, `EXPIRED link rejected (${after.status}) - same token that just worked`)
    }

    // -- Revocation: NEGATIVE paired with the SAME link working before ------
    {
      const tmp = await mkLink('ZZ-LINK revoking', '1m')
      const before = await openLink(tmp.token)
      check(before.status === 200, `PAIR: link works before revocation (${before.status})`)
      await adm.from('portal_share_links')
        .update({ revoked_at: new Date().toISOString() }).eq('id', tmp.id)
      const after = await openLink(tmp.token)
      check(after.status === 403, `REVOKED link rejected (${after.status}) - same token that just worked`)
    }

    // -- NEVER expires is HONORED: the NULL footgun, tested directly --------
    {
      const never = await mkLink('ZZ-LINK never', 'never')
      const { data: row } = await adm.from('portal_share_links')
        .select('expires_at').eq('id', never.id).single()
      check(row?.expires_at === null, 'never-preset stores NULL expiry (not a far-future date)')
      const r = await openLink(never.token)
      check(r.status === 200, `NEVER-expiring link honored (${r.status})`)
    }

    // -- A link for project A cannot read project B ------------------------
    // Non-vacuous: give B real data FIRST, so "sees nothing" means a wall and
    // not an empty project.
    {
      const { data: seeded } = await adm.from('findings').insert({
        project_id: probeProjectId, number: '1',
        title: 'ZZ-LINK cross-project canary', status: 'open',
      }).select('id').single()
      check(!!seeded, 'PAIR: project B seeded with a canary finding to leak')

      const r = await openLink(live.token)
      const titles = (r.body.findings ?? []).map(f => f.title)
      check(!titles.includes('ZZ-LINK cross-project canary'),
        'link for project A cannot read project B (canary absent)')
      check(r.body.project?.project_id === ZZ,
        `link bundle scoped to its own project (${r.body.project?.project_id === ZZ ? 'ZZ-TEST' : r.body.project?.project_id})`)

      const { data: bReport } = await adm.from('site_reports').insert({
        project_id: probeProjectId, report_number: 'ZZ-LINK-B', site_visit_date: '2026-07-26',
        report_date: '2026-07-26', authored_by: 'Dev Admin', storage_url: 'fake/path.docx',
      }).select('id').single()
      const fr = await signViaLink(live.token, { table: 'site_reports', id: bReport.id, kind: 'docx' })
      check(fr.status === 403, `link for A cannot sign a file on B (${fr.status})`)
      await adm.from('site_reports').delete().eq('id', bReport.id)
      await adm.from('findings').delete().eq('id', seeded.id)
    }

    // -- THE THREE WALLS behind "no write path", asserted by ERROR CODE -----
    {
      const anon = mk()
      const ins = await anon.from('findings').insert({
        project_id: ZZ, number: '999', title: 'ZZ-LINK write probe', status: 'open',
      })
      check(!!ins.error, `WALL 1 anon PostgREST insert denied (${ins.error?.code ?? 'NO ERROR - IT WROTE'})`)

      const rpc = await anon.rpc('portal_findings', { pid: ZZ })
      check(rpc.error?.code === '42501',
        `WALL 2 anon cannot EXECUTE the portal RPCs (${rpc.error?.code ?? 'REACHED'}) - error code, not row count`)

      const gen = await fetch(`${BASE_URL}/api/generate-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_token: live.token, report_id: draftReportId }),
      })
      check(gen.status === 401 || gen.status === 403,
        `WALL 3 generate-report refuses a link token (${gen.status})`)

      const anonLinks = await anon.from('portal_share_links').select('id')
      const staffLinks = await adm.from('portal_share_links').select('id').eq('project_id', ZZ)
      check((anonLinks.data ?? []).length === 0 && (staffLinks.data ?? []).length > 0,
        `PAIR: link table opaque to anon (${(anonLinks.data ?? []).length}) while staff read it (${(staffLinks.data ?? []).length})`)
    }

    // -- Files through link auth: ISSUED 200, DRAFT 403 --------------------
    {
      const issued = (opened.body.documents ?? []).find(d => d.kind === 'site_report' && d.has_pdf)
      if (!issued) check(false, 'no issued site report in the link bundle to test the positive leg')
      else {
        const r = await signViaLink(live.token, { table: 'site_reports', id: issued.row_id, kind: 'pdf' })
        check(r.status === 200 && !!r.body.url, `link signs an ISSUED document (${r.status})`)
        if (r.body.url) {
          const f = await fetch(r.body.url)
          check(f.ok, `link-signed URL actually fetches (${f.status})`)
        }
      }
      const dr = await signViaLink(live.token, { table: 'site_reports', id: draftReportId, kind: 'docx' })
      check(dr.status === 403 && /not been issued/i.test(dr.body.error ?? ''),
        `link signing a DRAFT -> 403 (${dr.body.error ?? dr.status})`)

      // equipment_attachments is refused OUTRIGHT for external callers. This
      // needs a REAL row: the first version of this leg passed a site_reports id,
      // which 404s on the missing row before the refusal ever runs -- it would
      // have passed identically with the refusal deleted. There are no
      // equipment_attachments rows on ZZ-TEST at rest, so the suite makes one.
      {
        const { data: eq } = await adm.from('equipment')
          .select('id').eq('project_id', ZZ).limit(1).maybeSingle()
        if (!eq) check(false, 'no ZZ-TEST equipment row to hang an attachment on')
        else {
          const { data: att, error: attErr } = await adm.from('equipment_attachments').insert({
            project_id: ZZ, equipment_id: eq.id,
            filename: 'ZZ-LINK-refusal-probe.pdf', file_type: 'shop_drawing',
            storage_url: 'fake/zz-link-probe.pdf',
          }).select('id').single()
          if (attErr) check(false, `could not seed an attachment: ${attErr.message}`)
          else {
            // PAIR: staff CAN reach it, so the client refusal is a wall and not
            // a missing row.
            const staff = await post(emp, '/api/get-file-url', {
              table: 'equipment_attachments', id: att.id, kind: 'file',
            })
            check(staff.status === 200 || staff.status === 500,
              `PAIR: staff reach the attachment row (${staff.status})`)
            const ea = await signViaLink(live.token, { table: 'equipment_attachments', id: att.id, kind: 'file' })
            check(ea.status === 403 && /Not available in the portal/i.test(ea.body.error ?? ''),
              `link cannot reach equipment_attachments (${ea.body.error ?? ea.status})`)
            const acct = await post(cli, '/api/get-file-url', {
              table: 'equipment_attachments', id: att.id, kind: 'file',
            })
            check(acct.status === 403, `account-mode client also refused equipment_attachments (${acct.status})`)
            await adm.from('equipment_attachments').delete().eq('id', att.id)
          }
        }
      }

      // A VALID link asking for an id that does not exist must answer 403, not
      // 404 -- otherwise an unauthenticated caller can distinguish "this id
      // exists" from "it does not" across every table this endpoint serves.
      {
        const ghost = await signViaLink(live.token, {
          table: 'site_reports', id: '00000000-0000-0000-0000-000000000000', kind: 'pdf',
        })
        check(ghost.status === 403, `link mode is not an id-existence oracle (${ghost.status}, must be 403 not 404)`)
      }
    }

    // -- Garbage tokens answer identically: no oracle ----------------------
    for (const [name, tok] of [['garbage', 'not-a-real-token-at-all'], ['single-char', 'x']]) {
      const r = await openLink(tok)
      check(r.status === 403, `${name} token rejected identically (${r.status})`)
    }

    // -- noindex, asserted rather than assumed -----------------------------
    check(/noindex/i.test(opened.headers.get('x-robots-tag') ?? ''),
      `link endpoint sends X-Robots-Tag noindex ("${opened.headers.get('x-robots-tag')}")`)

    // -- D5 telemetry actually increments ----------------------------------
    {
      const { data: before } = await adm.from('portal_share_links')
        .select('view_count').eq('id', live.id).single()
      await openLink(live.token)
      const { data: after } = await adm.from('portal_share_links')
        .select('view_count, last_viewed_at').eq('id', live.id).single()
      check(after.view_count > before.view_count && !!after.last_viewed_at,
        `view telemetry increments (${before.view_count} -> ${after.view_count})`)
    }

    // -- Non-owner/lead cannot create a link (D6 / 9.4a) -------------------
    {
      const r = await post(emp, '/api/portal-share-link', {
        project_id: probeProjectId, label: 'ZZ-LINK denied', expires: '1d',
      })
      check(r.status === 403, `non-member employee cannot create a link on another project (${r.status})`)
    }

    // -- Section cleanup, proven --------------------------------------------
    for (const id of linkIds) await adm.from('portal_share_links').delete().eq('id', id)
    linkIds = []
    const { data: leftLinks } = await adm.from('portal_share_links').select('id')
    check((leftLinks ?? []).length === 0, `self-clean: share links removed (${(leftLinks ?? []).length} left)`)
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

    // The instrument's three readings, by their labels. (An earlier form of
    // this check used locator('header') — there are TWO headers, the chrome and
    // the hero, so it was a strict-mode violation that resolved to empty string
    // and failed. Which is the point: it failed loudly instead of passing on a
    // technicality.)
    const readings = ['Checklists complete', 'Open issues', 'Issues resolved']
    const absent = readings.filter(r => !new RegExp(r, 'i').test(body))
    check(absent.length === 0,
      `progress instrument renders all three readings${absent.length ? ` — MISSING: ${absent.join(', ')}` : ''}`)
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
