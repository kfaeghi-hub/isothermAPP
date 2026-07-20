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
  await page.goto(BASE_URL)
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
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  // guaranteed cleanup: membership restored, probe deleted (cascades all content)
  await restoreZZMembership()
  await deleteProbe()
  const { data: leftover } = await adm.from('projects').select('id').eq('name', PROBE_NAME)
  check((leftover ?? []).length === 0, 'self-clean: probe project removed')
}

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0 ? 'PASS — access control verified at the API layer.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
