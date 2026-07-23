// Deliverable access & visibility — API + browser gate for DELIVERABLES-ACCESS-PROPOSAL
// items #2/#3/#4, plus the two fold-in verifications requested for this pass:
//   #4  guard_deliverable_assignee: a plain member cannot change assigned_to
//       (trigger raises), but can still update status; owner/lead/admin can assign.
//   #2  the picker source (list_internal_profiles ∩ project_members) resolves member names.
//   #3b (b) dev.owner's "Outstanding Deliverables" is scoped to member projects only
//       — checked at the API layer AND visually on the dashboard.
//   (a) AccessCard own-row LEAD/MEMBER is a static badge (no toggle) while another
//       member's row keeps a working toggle — the UI never offers what RLS rejects.
//
// Run: node --env-file=.env pw-deliverable-access.mjs
// Touches only the ZZ-TEST family: a self-made "ZZ-TEST-DELIV … Probe" (deleted at
// the end) and the canonical ZZ-TEST fixture (membership restored, seed removed).

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { BASE_URL } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'   // ZZ-TEST — Do Not Use
const PROBE = `ZZ-TEST-DELIV ${Date.now().toString(36)} Probe`
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const mk = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const emp = mk(), adm = mk(), own = mk()
{
  const e = await emp.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
  const a = await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const o = await own.auth.signInWithPassword({ email: process.env.owner_email, password: process.env.owner_password })
  if (e.error || a.error || o.error) { console.error('login failed:', e.error?.message ?? a.error?.message ?? o.error?.message); process.exit(1) }
}
const { data: ownRole } = await own.rpc('get_my_role')
if (ownRole !== 'owner') { console.error(`dev.owner role is '${ownRole}', not 'owner' — flip via dashboard first`); process.exit(1) }
const { data: { user: empUser } } = await emp.auth.getUser()
const { data: { user: ownUser } } = await own.auth.getUser()
const { data: empProfile } = await adm.from('user_profiles').select('name').eq('email', process.env.email).single()
const { data: ownProfile } = await adm.from('user_profiles').select('name').eq('email', process.env.owner_email).single()
const EMP_NAME = empProfile.name, OWN_NAME = ownProfile.name

// pre-clean stray probes from interrupted runs (unique prefix; canonical fixtures don't match)
{
  const { data } = await adm.from('projects').select('id').ilike('name', 'ZZ-TEST-DELIV %')
  for (const p of data ?? []) await adm.from('projects').delete().eq('id', p.id)
}

let probeId = null, zzDelId = null
const teardown = async () => {
  if (zzDelId) await adm.from('project_deliverables').delete().eq('id', zzDelId)
  await adm.from('project_members').delete().eq('project_id', ZZ).eq('profile_id', ownUser.id)
  if (probeId) await adm.from('projects').delete().eq('id', probeId)  // cascades its deliverable + members
}

try {
  // ── Probe: project + one deliverable + dev.test as a NON-lead member ──────────
  const { data: proj, error: pErr } = await adm.from('projects').insert({ name: PROBE }).select('id').single()
  if (pErr) throw new Error(`probe insert: ${pErr.message}`)
  probeId = proj.id
  const { data: del } = await adm.from('project_deliverables')
    .insert({ project_id: probeId, name: 'ZZ Deliverable A', status: 'not_started', sort_order: 0 })
    .select('id').single()
  await adm.from('project_members').insert({ project_id: probeId, profile_id: empUser.id, is_lead: false })

  // #2 — the picker source resolves this project's member names (list_internal_profiles ∩ project_members)
  {
    const { data: profs } = await adm.rpc('list_internal_profiles')
    const { data: mems } = await adm.from('project_members').select('profile_id').eq('project_id', probeId)
    const ids = new Set((mems ?? []).map(m => m.profile_id))
    const names = (profs ?? []).filter(p => ids.has(p.id)).map(p => p.name)
    check(names.includes(EMP_NAME), `#2 picker source resolves project-member name(s) via list_internal_profiles (${names.join(', ') || 'none'})`)
  }

  // #4 — a NON-lead member cannot change the assignee (trigger raises)…
  {
    const { error } = await emp.from('project_deliverables').update({ assigned_to: EMP_NAME }).eq('id', del.id)
    check(!!error && /owner or project lead/i.test(error.message ?? ''),
      `#4 member cannot assign — guard_deliverable_assignee raises (${error?.message ?? 'NO ERROR'})`)
  }
  // …but CAN still update status (content path preserved)
  {
    const { data } = await emp.from('project_deliverables').update({ status: 'in_progress' }).eq('id', del.id).select('id')
    check((data ?? []).length === 1, '#4 member CAN still update status')
  }
  // admin can assign
  {
    const { data, error } = await adm.from('project_deliverables').update({ assigned_to: EMP_NAME }).eq('id', del.id).select('id')
    check(!error && (data ?? []).length === 1, '#4 admin CAN assign')
  }
  // promote dev.test to lead → now CAN assign
  {
    await adm.from('project_members').update({ is_lead: true }).eq('project_id', probeId).eq('profile_id', empUser.id)
    const { data, error } = await emp.from('project_deliverables').update({ assigned_to: null }).eq('id', del.id).select('id')
    check(!error && (data ?? []).length === 1, '#4 lead CAN assign/reassign (after promotion)')
  }

  // ── #3b scoping (API): dev.owner, member of ZZ-TEST only, sees only member-project deliverables ──
  await adm.from('project_members').upsert({ project_id: ZZ, profile_id: ownUser.id, is_lead: false }, { onConflict: 'project_id,profile_id' })
  const { data: zzDel } = await adm.from('project_deliverables')
    .insert({ project_id: ZZ, name: 'ZZ-ACCESS Outstanding', status: 'not_started', sort_order: 999, due_date: '2020-01-01' })
    .select('id').single()
  zzDelId = zzDel.id
  {
    const { data } = await own.from('project_deliverables')
      .select('project_id, projects(name)').not('status', 'in', '(submitted,accepted)')
    const names = (data ?? []).map(r => (Array.isArray(r.projects) ? r.projects[0]?.name : r.projects?.name)).filter(Boolean)
    check(names.length > 0 && names.every(n => n.startsWith('ZZ-TEST')),
      `#3b API scoping: owner's outstanding deliverables are member-projects only (${[...new Set(names)].join(', ') || 'none'})`)
    check(!names.includes(PROBE), '#3b API scoping: owner does NOT see the non-member probe deliverable')
  }

  // ── Browser as dev.owner: (b) Outstanding panel scoping + (a) AccessCard badge parity ──
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.goto(`${BASE_URL}/login`)
  await page.locator('input[type="email"]').fill(process.env.owner_email)
  await page.locator('input[type="password"]').fill(process.env.owner_password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForTimeout(3500)

  // (b) governor sees the Outstanding Deliverables panel; every project header is a member project
  {
    const panel = page.locator('[data-testid="outstanding-deliverables"]')
    check(await panel.count() === 1, '(b) governor sees the Outstanding Deliverables panel')
    const headers = (await page.locator('[data-testid="outstanding-project"]').allInnerTexts()).map(h => h.trim())
    check(headers.length > 0 && headers.every(h => h.startsWith('ZZ-TEST')),
      `(b) Outstanding panel shows only member projects (${headers.join(' | ') || 'empty'})`)
  }

  // (a) AccessCard own-row LEAD/MEMBER is a static badge; another member keeps a working toggle
  {
    await page.goto(`${BASE_URL}/projects/${ZZ}`)
    await page.waitForTimeout(2500)
    const card = page.locator('[data-testid="access-card"]')
    check(await card.count() === 1, '(a) owner-member sees the AccessCard')
    const ownRow = card.locator('.group').filter({ hasText: OWN_NAME })
    const ownToggle = ownRow.getByRole('button').filter({ hasText: /LEAD|MEMBER/ })
    check(await ownToggle.count() === 0, "(a) own-row LEAD/MEMBER is a static badge — UI can't offer the self-toggle RLS rejects")
    const otherRow = card.locator('.group').filter({ hasText: EMP_NAME })
    const otherToggle = otherRow.getByRole('button').filter({ hasText: /LEAD|MEMBER/ })
    check(await otherToggle.count() >= 1, '(a) another member row keeps a working toggle (governor may set others’ lead)')
  }
  await browser.close()

  // ── #2 lead visibility: a LEAD (non-governor) must see the Outstanding
  //     Deliverables panel for the project(s) they lead — not just owners/admins.
  //     dev.test is role 'user'; make them a lead of ZZ-TEST and verify in-browser.
  await adm.from('project_members').upsert(
    { project_id: ZZ, profile_id: empUser.id, is_lead: true }, { onConflict: 'project_id,profile_id' })
  {
    const lb = await chromium.launch()
    const lp = await lb.newPage()
    await lp.setViewportSize({ width: 1500, height: 1000 })
    await lp.goto(`${BASE_URL}/login`)
    await lp.locator('input[type="email"]').fill(process.env.email)
    await lp.locator('input[type="password"]').fill(process.env.password)
    await lp.getByRole('button', { name: 'Sign In' }).click()
    await lp.waitForTimeout(3500)
    check(await lp.locator('[data-testid="outstanding-deliverables"]').count() === 1,
      '#2 a LEAD (non-governor) sees the Outstanding Deliverables panel')
    const leadHeaders = (await lp.locator('[data-testid="outstanding-project"]').allInnerTexts()).map(h => h.trim())
    check(leadHeaders.length > 0 && leadHeaders.every(h => h.startsWith('ZZ-TEST')),
      `#2 lead panel scoped to led project(s) only (${leadHeaders.join(' | ') || 'empty'})`)
    await lb.close()
  }

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await teardown()
  const { data: leftover } = await adm.from('projects').select('id').ilike('name', 'ZZ-TEST-DELIV %')
  check((leftover ?? []).length === 0, 'self-clean: probe project removed')
}

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0
  ? 'PASS — deliverable assign-permission enforced; owner scoping + AccessCard parity verified.'
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
