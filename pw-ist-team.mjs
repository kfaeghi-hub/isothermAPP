// pw-ist-team — the "Needed for IST" seat group on the Team tab.
//
// SIGHTED FROM BIRTH. This drives a real browser through a real login, so every
// read goes through the app's anon client with a user JWT and RLS is fully in the
// path. Written that way on purpose: `pw-ist` shipped 28/28 green over a feature
// no real user could see, because it spoke only as the service role.
//
// WHAT IT PROVES, and why each leg exists:
//   1. The classification option still RESOLVES. The group keys off one label in
//      the vocabulary. If the firm renames it the group silently stops appearing
//      — the safe direction for a hint, but silence is exactly what nobody
//      notices, so it is asserted here rather than trusted.
//   2. Classified project SHOWS the group; unclassified does NOT. A guard that
//      answers the same in both states is not a guard.
//   3. ASSIGNING a seat REMOVES it from the gap list. The group is an absence
//      being shown; if filling one did not shrink it, it would be decoration.
//   4. The gap count is asserted against the DECLARED seat list, not against
//      "some seats appeared". A seed keyed by name silently seeds what matches —
//      17 of 18 looked identical to 18 of 18 until something counted.
//
// ZZ-TEST only, self-cleaning, wait helpers throughout.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject, waitUntil, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-ist-team')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const IST_LABEL = 'CAN/ULC-S1001 IST'
const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()

// ── 1. the option resolves ───────────────────────────────────────────────────
const { data: opt } = await svc.from('classification_options').select('id, label').eq('label', IST_LABEL).maybeSingle()
check(!!opt, `the classification option "${IST_LABEL}" still exists in the vocabulary`)
if (!opt) { console.log('\nFAIL — the group keys off this label; nothing further can be asserted.'); process.exit(1) }

const { data: seats } = await svc.from('ist_team_seed_roles').select('role_type_id').eq('active', true)
check((seats ?? []).length === 18, `seat list declares 18 roles (got ${(seats ?? []).length})`)

// snapshot so the project is left exactly as found
const { data: hadCls } = await svc.from('project_classifications').select('id').eq('project_id', proj.id).eq('option_id', opt.id)
const preClassified = (hadCls ?? []).length > 0
const createdIds = []

async function classify(on) {
  if (on && !preClassified) {
    const { data } = await svc.from('project_classifications')
      .insert({ project_id: proj.id, option_id: opt.id, dimension_id: (await svc.from('classification_options').select('dimension_id').eq('id', opt.id).single()).data.dimension_id })
      .select('id').single()
    if (data) createdIds.push(data.id)
  } else if (!on) {
    await svc.from('project_classifications').delete().eq('project_id', proj.id).eq('option_id', opt.id)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })

async function openTeam() {
  await page.goto(`${BASE_URL}/projects`)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Team', exact: true }).click()
  await page.waitForTimeout(2500)
}

try {
  // ── 2. unclassified: the group must NOT appear ─────────────────────────────
  await classify(false)
  await login(page)
  await openTeam()
  const absent = await waitUntil(async () => (await page.locator('[data-testid="ist-team-gaps"]').count()) === 0,
    { timeout: 8000, what: 'no IST group on an unclassified project' })
  check(absent, 'unclassified project does NOT show the IST seat group')

  // ── 3. classified: the group appears, counted against the declared list ────
  await classify(true)
  await openTeam()
  const shown = await waitUntil(async () => (await page.locator('[data-testid="ist-team-gaps"]').count()) > 0,
    { timeout: 10000, what: 'the IST group' })
  check(shown, 'classified project SHOWS the IST seat group')

  const { data: assigned } = await svc.from('project_team_assignments').select('role_type_id').eq('project_id', proj.id)
  const filled = new Set((assigned ?? []).map(a => a.role_type_id))
  const expectedGaps = (seats ?? []).filter(s => !filled.has(s.role_type_id)).length
  const seatButtons = await page.locator('[data-testid="ist-team-gap-seat"]').count()
  check(seatButtons === expectedGaps,
    `gap list shows every unassigned seat and no more — ${seatButtons} shown vs ${expectedGaps} expected (18 declared − ${filled.size ? [...filled].filter(f => (seats ?? []).some(s => s.role_type_id === f)).length : 0} already assigned)`)

  // ── 4. assigning a seat removes it from the gap list ──────────────────────
  const firstGapRole = (seats ?? []).find(s => !filled.has(s.role_type_id))
  const { data: anyCompany } = await svc.from('companies').select('id').limit(1).single()
  const { data: made } = await svc.from('project_team_assignments')
    .insert({ project_id: proj.id, role_type_id: firstGapRole.role_type_id, company_id: anyCompany.id, sort_order: 900 })
    .select('id').single()
  createdIds.push(`team:${made.id}`)

  await openTeam()
  const shrank = await waitUntil(async () => (await page.locator('[data-testid="ist-team-gap-seat"]').count()) === expectedGaps - 1,
    { timeout: 10000, what: 'the gap list to shrink by one' })
  check(shrank, `assigning a seat removes it from the gap list (${expectedGaps} → ${expectedGaps - 1})`)

  await svc.from('project_team_assignments').delete().eq('id', made.id)
  createdIds.pop()

} finally {
  for (const id of createdIds) if (!String(id).startsWith('team:')) await svc.from('project_classifications').delete().eq('id', id)
  if (!preClassified) await svc.from('project_classifications').delete().eq('project_id', proj.id).eq('option_id', opt.id)
  else await classify(true)
  await browser.close()
  console.log(`\ncleanup: ZZ-TEST classification restored (was ${preClassified ? 'classified' : 'unclassified'})`)
}

console.log('\n' + '='.repeat(60))
console.log(fail ? `FAIL — ${fail} of ${pass + fail}` : `PASS — ${pass} checks, IST team seat group verified through a real login.`)
process.exit(fail ? 1 : 0)
