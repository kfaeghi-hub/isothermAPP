// ACCESS CONTROL GATE — API-layer verification (raw authenticated PostgREST, not UI).
// Proposal §7.1. Requires .env: email/password (dev.test, role user = Employee)
// and admin_email/admin_password (dev.admin, role admin).
//
//   Negative (employee, non-member probe): zero rows on reads, writes rejected,
//     foreign-draft delete rejected, firm-config writes rejected, project INSERT
//     rejected, coverage view scoped.
//   Destruction concentration on MEMBER projects: finding/equipment DELETE no-ops,
//     status-change trigger blocks, issued-meeting delete no-ops.
//   Positive (employee on ZZ-TEST): content CRUD, own-draft deletes, lead settings.
//   Lead both ways on the probe (member → rejected; lead → allowed).
//   Subcontractor scenario at the API layer (the exact writes the UI issues).
//   Dashboard trim (browser): ZZ-TEST vanishes for dev.test, restored in cleanup.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-access.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { BASE_URL } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const PROBE_NAME = 'ZZ-TEST-ACCESS Probe'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const mk = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const emp = mk(), adm = mk()
{
  const e = await emp.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
  const a = await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  if (e.error || a.error) { console.error('login failed:', e.error?.message ?? a.error?.message); process.exit(1) }
}
const { data: empRole } = await emp.rpc('get_my_role')
const { data: admRole } = await adm.rpc('get_my_role')
check(empRole === 'user' && admRole === 'admin', `credential split verified (emp=${empRole}, adm=${admRole})`)
const { data: { user: empUser } } = await emp.auth.getUser()

// ── Setup / pre-clean (admin) ────────────────────────────────────────────────
async function deleteProbe() {
  const { data } = await adm.from('projects').select('id').eq('name', PROBE_NAME)
  for (const p of data ?? []) await adm.from('projects').delete().eq('id', p.id)
}
async function restoreZZMembership() {
  await adm.from('project_members')
    .upsert({ project_id: ZZ, profile_id: empUser.id, is_lead: true },
            { onConflict: 'project_id,profile_id' })
  await adm.from('project_members').update({ is_lead: true })
    .eq('project_id', ZZ).eq('profile_id', empUser.id)
}
await deleteProbe()
await restoreZZMembership()

const { data: probe } = await adm.from('projects')
  .insert({ name: PROBE_NAME, status: 'active' }).select('id').single()
const P = probe.id
// probe content (admin): finding, equipment, draft meeting, checklist instance
const { data: recurType } = await adm.from('meeting_types').select('id').eq('name', 'Recurring Cx Meeting').single()
const { data: admProfile } = await adm.from('user_profiles').select('name').eq('email', process.env.admin_email).single()
await adm.from('findings').insert({ project_id: P, title: 'probe finding', category: 'INFO' })
await adm.from('equipment').insert({ project_id: P, kind: 'equipment', tag: 'PROBE-EQ-1' })
const { data: probeMtg } = await adm.from('meetings').insert({
  project_id: P, meeting_type_id: recurType.id, meeting_number: 1,
  meeting_date: '2026-07-20', status: 'draft', prepared_by: admProfile.name,
}).select('id').single()
await adm.from('checklist_instances').insert({
  project_id: P, source_template_name_snapshot: 'probe instance',
  source_template_type_snapshot: 'pfc', type: 'pfc', status: 'in_progress',
})
console.log(`probe project seeded: ${P}`)

try {
  // ── NEGATIVE: employee vs non-member probe ────────────────────────────────
  for (const t of ['findings', 'site_reports', 'meetings', 'checklist_instances', 'equipment', 'project_team_assignments']) {
    const { data } = await emp.from(t).select('id').eq('project_id', P)
    check((data ?? []).length === 0, `non-member read of ${t}: zero rows`)
  }
  {
    const { data } = await emp.from('projects').select('id').eq('id', P)
    check((data ?? []).length === 0, 'non-member cannot see the probe project itself')
  }
  {
    const { error } = await emp.from('findings').insert({ project_id: P, title: 'x', category: 'INFO' })
    check(!!error, 'non-member finding INSERT rejected')
  }
  {
    const { data } = await emp.from('projects').update({ name: 'hacked' }).eq('id', P).select('id')
    check((data ?? []).length === 0, 'non-member project UPDATE affects zero rows')
  }
  {
    const { data } = await emp.from('meetings').delete().eq('id', probeMtg.id).select('id')
    check((data ?? []).length === 0, "foreign draft meeting DELETE affects zero rows")
  }
  {
    const { error } = await emp.from('checklist_templates').insert({ name: 'x', type: 'pfc' })
    check(!!error, 'firm-config: template INSERT rejected')
  }
  {
    const { error } = await emp.from('classification_dimensions').insert({ name: 'x', selection_mode: 'multi', required: false })
    check(!!error, 'firm-config: classification dimension INSERT rejected')
  }
  {
    const { error } = await emp.from('meeting_types').insert({ name: 'x' })
    check(!!error, 'firm-config: meeting type INSERT rejected')
  }
  {
    const { error } = await emp.from('projects').insert({ name: 'ZZ-TEST-ACCESS emp-created' })
    check(!!error, 'C1: employee project INSERT rejected')
  }
  {
    const { data } = await emp.from('dashboard_checklist_coverage').select('*').eq('project_id', P)
    check((data ?? []).length === 0, 'coverage view scoped through membership (no probe row)')
  }

  // ── Destruction concentration on a MEMBER project (ZZ-TEST) ──────────────
  const { data: empFinding } = await emp.from('findings').insert({
    project_id: ZZ, title: 'ZZ-ACCESS emp finding', category: 'INFO', description: 'access gate',
  }).select('id').single()
  check(!!empFinding, 'member finding INSERT succeeds (content work)')
  {
    const { data } = await emp.from('findings').delete().eq('id', empFinding.id).select('id')
    check((data ?? []).length === 0, 'C3: member finding DELETE affects zero rows (even own)')
  }
  {
    const { data } = await emp.from('equipment').delete().eq('project_id', ZZ).eq('tag', 'TEST-AHU-1').select('id')
    check((data ?? []).length === 0, 'C3: member equipment DELETE affects zero rows (fixture intact)')
  }
  {
    const { error } = await emp.from('projects').update({ status: 'completed' }).eq('id', ZZ)
    check(!!error && /owner/i.test(error.message), `C2: status-guard trigger blocks lead status change (${error?.message})`)
  }

  // ── Positive: member/lead on ZZ-TEST ─────────────────────────────────────
  {
    const { error } = await emp.from('findings').update({ building_area: 'Gate Wing' }).eq('id', empFinding.id)
    check(!error, 'member finding UPDATE succeeds')
  }
  {
    const { data: mtg } = await emp.from('meetings').insert({
      project_id: ZZ, meeting_type_id: recurType.id, meeting_number: 950,
      meeting_date: '2026-07-20', status: 'draft', prepared_by: 'Dev Test',
    }).select('id').single()
    const { data: del } = await emp.from('meetings').delete().eq('id', mtg.id).select('id')
    check((del ?? []).length === 1, 'own DRAFT meeting delete succeeds')
  }
  {
    const { data: rep } = await emp.from('site_reports').insert({
      project_id: ZZ, report_number: 'ZZ-ACCESS-1', site_visit_date: '2026-07-20',
      report_date: '2026-07-20', authored_by: 'Dev Test',
    }).select('id').single()
    const { data: del } = await emp.from('site_reports').delete().eq('id', rep.id).select('id')
    check((del ?? []).length === 1, 'own UNGENERATED report delete succeeds')
  }
  {
    const { data: inst } = await emp.from('checklist_instances').insert({
      project_id: ZZ, source_template_name_snapshot: 'ZZ-ACCESS instance',
      source_template_type_snapshot: 'pfc', type: 'pfc', status: 'in_progress',
    }).select('id').single()
    const { data: del } = await emp.from('checklist_instances').delete().eq('id', inst.id).select('id')
    check((del ?? []).length === 1, 'A1: member deletes own NON-completed instance')
  }
  {
    const { data: audit } = await emp.from('checklist_instances').delete()
      .eq('project_id', ZZ).eq('status', 'complete').select('id')
    check((audit ?? []).length === 0, 'A1: completed instances immune to member delete (frozen records)')
  }
  {
    const { data } = await emp.from('projects').update({ start_date: '2026-01-01' }).eq('id', ZZ).select('id')
    check((data ?? []).length === 1, 'LEAD settings write on ZZ-TEST succeeds (dates)')
    await emp.from('projects').update({ start_date: null }).eq('id', ZZ)
  }

  // ── Lead both ways on the probe ──────────────────────────────────────────
  await adm.from('project_members').insert({ project_id: P, profile_id: empUser.id, is_lead: false })
  {
    const { error } = await emp.from('findings').insert({ project_id: P, title: 'member content on probe', category: 'INFO' })
    check(!error, 'after member add: content write on probe succeeds')
  }
  {
    const { data } = await emp.from('projects').update({ start_date: '2026-02-01' }).eq('id', P).select('id')
    check((data ?? []).length === 0, 'member (not lead): settings write on probe affects zero rows')
  }
  await adm.from('project_members').update({ is_lead: true }).eq('project_id', P).eq('profile_id', empUser.id)
  {
    const { data } = await emp.from('projects').update({ start_date: '2026-02-01' }).eq('id', P).select('id')
    check((data ?? []).length === 1, 'after lead flip: settings write on probe succeeds')
  }
  // Leave the probe roster clean for the owner leg's membership-management block
  await adm.from('project_members').delete().eq('project_id', P).eq('profile_id', empUser.id)

  // ── Subcontractor scenario (API layer — the exact writes the UI issues) ──
  {
    const { data: co, error: e1 } = await emp.from('companies')
      .insert({ name: 'ZZ-ACCESS Mechanical Ltd' }).select('id').single()
    const { data: roleType } = await emp.from('company_role_types').select('id, name').limit(1).single()
    // Legacy dual-write: the app writes role_type_id AND the legacy role text
    const { error: e2 } = await emp.from('company_roles')
      .insert({ company_id: co.id, role_type_id: roleType.id, role: roleType.name })
    const { data: ct, error: e3 } = await emp.from('contacts')
      .insert({ name: 'ZZ-ACCESS Pat Fitter', company_id: co.id }).select('id').single()
    const { data: seat, error: e4 } = await emp.from('project_team_assignments')
      .insert({ project_id: ZZ, role_type_id: roleType.id, company_id: co.id, contact_id: ct.id }).select('id').single()
    const { error: e5 } = await emp.from('findings').update({ responsible_party_id: ct.id }).eq('id', empFinding.id)
    const { data: mtg2 } = await emp.from('meetings').insert({
      project_id: ZZ, meeting_type_id: recurType.id, meeting_number: 951,
      meeting_date: '2026-07-20', status: 'draft', prepared_by: 'Dev Test',
    }).select('id').single()
    const { data: topic } = await emp.from('meeting_topics')
      .insert({ meeting_id: mtg2.id, title: 'Access Gate', sort_order: 0 }).select('id').single()
    const { error: e6 } = await emp.from('meeting_items').insert({
      meeting_id: mtg2.id, topic_id: topic.id, item_number: '951.1',
      discussion: 'subcontractor scenario item', responsible_assignment_id: seat.id, status: 'open',
    })
    check(!e1 && !e2 && !e3 && !e4 && !e5 && !e6,
      `SELF-SUFFICIENCY: company→role→contact→seat→finding→meeting item, zero permission errors (${[e1,e2,e3,e4,e5,e6].filter(Boolean).map(e=>e.message).join('; ') || 'clean'})`)
    // scenario cleanup: own draft meeting; seat by emp; directory rows need admin (dir_delete)
    await emp.from('meetings').delete().eq('id', mtg2.id)
    await emp.from('project_team_assignments').delete().eq('id', seat.id)
    await adm.from('contacts').delete().eq('id', ct.id)
    await adm.from('companies').delete().eq('id', co.id)
  }
  // gate finding cleanup (member cannot — admin does)
  await adm.from('findings').delete().eq('id', empFinding.id)

  // ── Dashboard trim (browser as dev.test) ─────────────────────────────────
  await adm.from('project_members').delete().eq('project_id', ZZ).eq('profile_id', empUser.id)
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 950 })
  await page.goto(`${BASE_URL}/login`) // unauthenticated "/" is the landing page (2026-07-22)
  await page.locator('input[type="email"]').fill(process.env.email)
  await page.locator('input[type="password"]').fill(process.env.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(3500)
  const bodyText = await page.locator('body').innerText()
  check(!bodyText.includes('ZZ-TEST — Do Not Use'), 'TRIM: dashboard shows no ZZ-TEST after membership removal')
  await browser.close()
  await restoreZZMembership()
  {
    const { data } = await emp.from('projects').select('id').eq('id', ZZ)
    check((data ?? []).length === 1, 'RESTORE: dev.test sees ZZ-TEST again (lead restored)')
  }
  // ═══ OWNER LEG (OWNER-TIER-PROPOSAL §6) ══════════════════════════════════
  const own = mk()
  {
    const o = await own.auth.signInWithPassword({ email: process.env.owner_email, password: process.env.owner_password })
    if (o.error) throw new Error(`dev.owner login failed: ${o.error.message}`)
  }
  const { data: ownRole } = await own.rpc('get_my_role')
  check(ownRole === 'owner', `dev.owner role is 'owner' (got '${ownRole}' — flip via dashboard before this leg)`)
  if (ownRole !== 'owner') throw new Error('owner leg aborted: role not flipped yet')
  const { data: { user: ownUser } } = await own.auth.getUser()

  // Negative: dev.owner is NOT a member of the probe — the tier's entire point
  for (const t of ['findings', 'meetings', 'checklist_instances', 'equipment']) {
    const { data } = await own.from(t).select('id').eq('project_id', P)
    check((data ?? []).length === 0, `OWNER negative: non-member read of ${t} → zero rows`)
  }
  {
    const { data } = await own.from('projects').select('id').eq('id', P)
    check((data ?? []).length === 0, 'OWNER negative: cannot see the non-member probe project')
  }
  {
    const { error } = await own.from('project_members')
      .insert({ project_id: P, profile_id: ownUser.id })
    check(!!error, 'WALL: owner self-add into a foreign project rejected')
  }
  {
    const { data } = await own.from('user_profiles').update({ role: 'admin' }).eq('id', ownUser.id).select('id')
    check((data ?? []).length === 0, 'OWNER negative: role self-promotion affects zero rows (admin-only)')
  }
  {
    const { error } = await own.from('orgs').insert({ name: 'x' })
    check(!!error, 'OWNER negative: orgs write rejected')
  }

  // Admin stocks the probe with frozen records, then adds dev.owner as MEMBER
  const { data: probeFnd2 } = await adm.from('findings')
    .insert({ project_id: P, title: 'owner-leg finding', category: 'INFO' }).select('id').single()
  const { data: probeInst } = await adm.from('checklist_instances').insert({
    project_id: P, source_template_name_snapshot: 'owner-leg completed instance',
    source_template_type_snapshot: 'pfc', type: 'pfc', status: 'complete',
  }).select('id').single()
  await adm.from('meetings').update({ status: 'issued' }).eq('id', probeMtg.id)
  await adm.from('project_members').insert({ project_id: P, profile_id: ownUser.id, is_lead: false })

  // Positive: full destructive rights within the member portfolio
  {
    const { data } = await own.from('findings').delete().eq('id', probeFnd2.id).select('id')
    check((data ?? []).length === 1, 'OWNER: finding hard-delete succeeds on member project')
  }
  {
    const { data } = await own.from('checklist_instances').delete().eq('id', probeInst.id).select('id')
    check((data ?? []).length === 1, 'OWNER: COMPLETED instance delete succeeds (A1 extension)')
  }
  {
    const { data } = await own.from('meetings').delete().eq('id', probeMtg.id).select('id')
    check((data ?? []).length === 1, 'OWNER: ISSUED meeting delete succeeds on member project')
  }
  {
    const { error } = await own.from('projects').update({ status: 'completed' }).eq('id', P)
    check(!error, 'OWNER: status trigger admits owner-member (complete)')
    await own.from('projects').update({ status: 'active' }).eq('id', P)
  }
  // Membership management on own project
  {
    const { error: a1 } = await own.from('project_members').insert({ project_id: P, profile_id: empUser.id, added_by: ownUser.id })
    const { data: u1 } = await own.from('project_members').update({ is_lead: true })
      .eq('project_id', P).eq('profile_id', empUser.id).select('id')
    const { data: d1 } = await own.from('project_members').delete()
      .eq('project_id', P).eq('profile_id', empUser.id).select('id')
    check(!a1 && (u1 ?? []).length === 1 && (d1 ?? []).length === 1,
      'OWNER: membership management (add employee, flip lead, remove) on own project')
  }

  // Firm-level rights
  {
    const { data: tpl, error } = await own.from('checklist_templates')
      .insert({ name: 'ZZ-OWNER template probe', type: 'pfc', active: false }).select('id').single()
    const { data: del } = tpl ? await own.from('checklist_templates').delete().eq('id', tpl.id).select('id') : { data: [] }
    check(!error && (del ?? []).length === 1, 'OWNER: firm-config write (template create + delete)')
  }
  {
    const { data: co, error } = await own.from('companies')
      .insert({ name: 'ZZ-OWNER Directory Probe Ltd' }).select('id').single()
    const { data: del } = co ? await own.from('companies').delete().eq('id', co.id).select('id') : { data: [] }
    check(!error && (del ?? []).length === 1, 'OWNER: directory delete right (create + delete company)')
  }
  {
    // Client-generated id + plain insert — INSERT..RETURNING evaluates the SELECT
    // policy BEFORE the auto-membership trigger, so returning-inserts fail for
    // owners (the app creates projects the same way for the same reason).
    const projId = crypto.randomUUID()
    const { error } = await own.from('projects')
      .insert({ id: projId, name: 'ZZ-TEST-OWNER Created', status: 'active' })
    const { data: mem } = await own.from('project_members').select('is_lead')
      .eq('project_id', projId).eq('profile_id', ownUser.id)
    check(!error && mem?.[0]?.is_lead === true, 'OWNER: project creation + creator auto-LEAD membership')
    const { data: del } = await own.from('projects').delete().eq('id', projId).select('id')
    check((del ?? []).length === 1, 'OWNER: deletes own created project')
  }
  // Picker: internal profiles RPC — rows for owner, ZERO for employee
  {
    const { data: forOwner } = await own.rpc('list_internal_profiles')
    const { data: forEmp } = await emp.rpc('list_internal_profiles')
    check((forOwner ?? []).length > 0 && (forEmp ?? []).length === 0,
      `PICKER: list_internal_profiles → owner ${forOwner?.length ?? 0} rows, employee ${forEmp?.length ?? 0}`)
  }

  // Dashboard scoping as dev.owner (browser): member of ZZ-TEST only
  await adm.from('project_members').upsert(
    { project_id: ZZ, profile_id: ownUser.id, is_lead: false },
    { onConflict: 'project_id,profile_id' })
  {
    const { data: visible } = await own.from('projects').select('name')
    const names = (visible ?? []).map(p => p.name)
    const allowed = names.every(n => n.startsWith('ZZ-TEST'))
    check(names.includes('ZZ-TEST — Do Not Use') && allowed,
      `OWNER scoping: sees ZZ-TEST + test artifacts only (got: ${names.join(', ')})`)
  }
  const b2 = await chromium.launch()
  const pg2 = await b2.newPage()
  await pg2.setViewportSize({ width: 1500, height: 950 })
  await pg2.goto(`${BASE_URL}/login`) // unauthenticated "/" is the landing page (2026-07-22)
  await pg2.locator('input[type="email"]').fill(process.env.owner_email)
  await pg2.locator('input[type="password"]').fill(process.env.owner_password)
  await pg2.getByRole('button', { name: 'Sign In' }).click()
  await pg2.waitForTimeout(3500)
  const dashText = await pg2.locator('body').innerText()
  check(dashText.includes('ZZ-TEST — Do Not Use'), 'OWNER dashboard: member project visible')
  await b2.close()
  // restore: dev.owner back to zero memberships (pre-test state)
  await adm.from('project_members').delete().eq('profile_id', ownUser.id)

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  // guaranteed cleanup: membership restored, probe deleted (cascades all content),
  // dev.owner memberships cleared, stray owner-leg artifacts removed
  await restoreZZMembership()
  await deleteProbe()
  const { data: strayProj } = await adm.from('projects').select('id').eq('name', 'ZZ-TEST-OWNER Created')
  for (const p of strayProj ?? []) await adm.from('projects').delete().eq('id', p.id)
  await adm.from('checklist_templates').delete().eq('name', 'ZZ-OWNER template probe')
  await adm.from('companies').delete().eq('name', 'ZZ-OWNER Directory Probe Ltd')
  const { data: ownProfile } = await adm.from('user_profiles').select('id').eq('email', process.env.owner_email).single()
  if (ownProfile) await adm.from('project_members').delete().eq('profile_id', ownProfile.id)
  const { data: leftover } = await adm.from('projects').select('id').eq('name', PROBE_NAME)
  check((leftover ?? []).length === 0, 'self-clean: probe project removed')
}

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0 ? 'PASS — access control verified at the API layer.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
