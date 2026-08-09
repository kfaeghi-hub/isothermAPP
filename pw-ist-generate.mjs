// pw-ist-generate — the door on the IST plan view.
//
// SIGHTED: real browser, real login. The point of this suite is that the feature
// is REACHABLE, which is not a thing a data-level check can see. The generator
// and the endpoint were proven at 15/15 by ist-regen-gate while the button did
// not exist — working code nobody can start is not a shipped feature.
//
// DISCOVERABILITY IS AN ASSERTION HERE, not a matter of taste: the control must
// be in the first viewport of the plan screen, because the owner found the
// feature unfindable when it sat below the working sections. "It is on the page"
// and "it is on the screen" are different claims and only the second one counts.
//
// ZZ-TEST only, self-cleaning.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, loginAs, adminCredentials, openTestProject, waitUntil, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-ist-generate')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()
const LABEL = 'PW-GEN'

async function cleanup() {
  const { data } = await svc.from('ist_plans').select('id').eq('project_id', proj.id).like('revision_label', `${LABEL}%`)
  for (const p of data ?? []) await svc.from('ist_plans').delete().eq('id', p.id)
}
await cleanup()

// a minimal but REAL plan: two systems, one integration, two protocols
const { data: plan } = await svc.from('ist_plans')
  .insert({ project_id: proj.id, revision_label: `${LABEL}-0`, revision_date: '2026-08-09', description: 'generation legs' })
  .select('id').single()
const mk = async l => (await svc.from('ist_systems').insert({ plan_id: plan.id, label: l }).select('id').single()).data
const fa = await mk('Fire Alarm'), spr = await mk('Sprinkler System')
const { data: integ } = await svc.from('ist_integrations').insert({
  plan_id: plan.id, system_a_id: fa.id, system_b_id: spr.id,
  integration_type: 'Water Flow', attachment_label: 'A-1',
}).select('id').single()
await svc.from('ist_protocols').insert([
  { integration_id: integ.id, subject_kind: 'point', subject_label: 'Wet Sprinkler Flow', equip_type_code: 'F.S.', sort_order: 0,
    fire_mode_steps: 'Flow from the inspector test connection. Alarm within 90 seconds.' },
  { integration_id: integ.id, subject_kind: 'point', subject_label: 'Shut-off Valve', equip_type_code: 'S.V.', sort_order: 1 },
])
await svc.rpc('ist_seed_prerequisites', { p_plan_id: plan.id })

const browser = await chromium.launch()
let page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

async function openTab() {
  await page.goto(`${BASE_URL}/projects`)
  await openTestProject(page)
  await page.getByRole('button', { name: 'IST', exact: true }).click()
  await page.waitForTimeout(3000)
}
async function openPlan(label) {
  await openTab()
  const radio = page.locator('[data-testid="ist-plan-row"]').filter({ hasText: label }).locator('input')
  if (await radio.count()) { await radio.first().check(); await page.waitForTimeout(2200) }
}

/**
 * THE COLD LANDING — the state every real user meets first.
 *
 * Added after an incident this suite did NOT cause. The owner reported the
 * Generate control missing on production; diagnosis showed a stale bundle inside
 * the ~110s deploy window and the control present and correct. The check was
 * exonerated — and it still owed a state it had never tested: it always CLICKED
 * a plan radio before asserting, so it only ever answered "is it findable after
 * you already know what to do". Arriving cold, with a plan auto-selected and no
 * interaction, is the findability question.
 *
 * Run for BOTH accounts, because the suite had only ever spoken as the employee
 * and the reporter was the admin.
 */
async function coldLandingLegs(who) {
  await openTab()
  const gen = page.locator('[data-testid="ist-generate"]')
  const seen = await waitUntil(async () => (await gen.count()) > 0,
    { timeout: 12000, what: `the Generate control on a cold landing (${who})` })
  check(seen, `[${who}] Generate is present on a COLD landing — no plan clicked`)
  if (!seen) return
  const box = await gen.boundingBox()
  const vh = page.viewportSize().height
  check(!!box && box.y >= 0 && box.y < vh,
    `[${who}] and inside the first viewport on that cold landing (top ${Math.round(box?.y ?? -1)}px of ${vh}px)`)
  // A plan must actually be auto-selected — if none were, `planId` would be null
  // and the ABSENCE of the control would be correct rather than a defect. The
  // leg has to distinguish those two, or it cannot fail for the right reason.
  const checked = await page.locator('[data-testid="ist-plan-row"] input:checked').count()
  check(checked === 1, `[${who}] exactly one plan revision is auto-selected on arrival (${checked})`)
}

try {
  await login(page)

  // ── 0. THE COLD LANDING, as the employee ─────────────────────────────────
  await coldLandingLegs('employee')

  await openPlan(`${LABEL}-0`)

  // ── 1. the action exists, and is ON SCREEN ────────────────────────────────
  const gen = page.locator('[data-testid="ist-generate"]')
  check(await gen.count() > 0, 'the Generate action exists on the plan view')
  const box = await gen.boundingBox()
  const vh = page.viewportSize().height
  check(!!box && box.y < vh,
    `it is inside the first viewport without scrolling (top at ${Math.round(box?.y ?? -1)}px of ${vh}px)`)

  const planBtn = page.locator('[data-testid="ist-generate-plan"]')
  const reportBtn = page.locator('[data-testid="ist-generate-report"]')
  check(await planBtn.count() === 1 && await reportBtn.count() === 1, 'both modes are offered')
  const blurbs = await gen.innerText()
  check(/before testing/i.test(blurbs) && /after testing/i.test(blurbs),
    'each mode states when it is issued, on the choice itself')

  // ── 2. the empty-results warning renders, and does NOT block ──────────────
  const warn = page.locator('[data-testid="ist-gen-warn-report"]')
  check(await warn.count() > 0, 'report mode warns that there are no results yet')
  check(!(await reportBtn.isDisabled()), 'the warning does not block — the human decides')

  // ── 3. plan mode generates and lands ──────────────────────────────────────
  await planBtn.click()
  const landed = await waitUntil(async () => {
    const { data } = await svc.from('ist_generations').select('mode, pdf_url').eq('plan_id', plan.id)
    return (data ?? []).find(g => g.mode === 'plan' && g.pdf_url) ?? null
  }, { timeout: 120000, interval: 2000, what: 'the generated IST Plan' })
  check(!!landed, `IST Plan generated and recorded${landed ? ` → ${landed.pdf_url}` : ''}`)

  const { data: afterPlan } = await svc.from('ist_plans').select('status, pdf_url').eq('id', plan.id).single()
  check(afterPlan.status === 'issued', 'generating marks the revision issued')

  // ── 4. RULE 4 — regenerating an ISSUED revision makes the NEXT one ────────
  const frozen = { ...afterPlan }
  await page.waitForTimeout(1500)
  await openPlan(`${LABEL}-0`)
  await page.locator('[data-testid="ist-generate-report"]').click()
  // MATCHED BY ITS DESCRIPTION, not by "some other plan exists". The first
  // version of this took the most recent plan that was not the original, which
  // would pass if any unrelated revision happened to be lying around — a check
  // that can succeed for a reason it is not testing.
  const nextRev = await waitUntil(async () => {
    const { data } = await svc.from('ist_plans').select('id, revision_label, status, description')
      .eq('project_id', proj.id).neq('id', plan.id)
      .ilike('description', `%Revised from ${LABEL}-0%`).limit(1)
    return (data ?? [])[0] ?? null
  }, { timeout: 120000, interval: 2000, what: 'a revision created FROM this plan' })
  check(!!nextRev, `regenerating an issued revision created a NEW one (${nextRev?.revision_label})`)

  const { data: original } = await svc.from('ist_plans').select('status, pdf_url').eq('id', plan.id).single()
  check(original.pdf_url === frozen.pdf_url && original.status === 'issued',
    'the ORIGINAL revision is untouched — Rule 4, issued is frozen')

  // the copy carries the content, not an empty shell
  if (nextRev) {
    const { data: ni } = await svc.from('ist_integrations').select('id').eq('plan_id', nextRev.id)
    const { data: np } = await svc.from('ist_protocols').select('id').in('integration_id', (ni ?? []).map(x => x.id))
    check((ni ?? []).length === 1 && (np ?? []).length === 2,
      `the new revision carries the content (${(ni ?? []).length} integration, ${(np ?? []).length} protocols)`)
  }

  // ── 5. history is visible on the plan view ───────────────────────────────
  // Asserted on the ORIGINAL revision, whose label is unique to this suite. The
  // first version opened the NEW revision by label — a bare "2", which
  // `hasText` will happily match inside any other row's text. A locator that can
  // select the wrong row is a check that can pass or fail for the wrong reason.
  await openPlan(`${LABEL}-0`)
  const hist = page.locator('[data-testid="ist-gen-row"]')
  const histSeen = await waitUntil(async () => (await hist.count()) > 0,
    { timeout: 10000, what: 'the generation history' })
  check(histSeen, `the plan view shows what was generated, and when (${await hist.count()} row(s))`)

  // ── 6. THE COLD LANDING, as the ADMIN — the reporter's own account ────────
  // A FRESH CONTEXT, not clearCookies(): supabase-js keeps the session in
  // localStorage, so clearing cookies left the employee signed in and the login
  // form never appeared. Caught by this suite failing loudly rather than by
  // quietly re-running the employee legs under an admin label — which is the
  // failure that would have made the new leg decorative.
  await page.close()
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await adminCtx.newPage()
  await loginAs(page, adminCredentials())
  await coldLandingLegs('admin')

} finally {
  await browser.close()
  // remove the revision the suite caused as well as its own plan
  const { data: mine } = await svc.from('ist_plans').select('id, revision_label, description').eq('project_id', proj.id)
  for (const p of mine ?? []) if (/^PW-GEN/.test(p.revision_label) || /Revised from PW-GEN/.test(p.description ?? '')) await svc.from('ist_plans').delete().eq('id', p.id)
  await cleanup()
  console.log(`\ncleanup: ${LABEL} and its revisions removed from ZZ-TEST`)
}

console.log('\n' + '='.repeat(60))
console.log(fail ? `FAIL — ${fail} of ${pass + fail}` : `PASS — ${pass} checks, IST generation reachable and Rule 4 honoured.`)
process.exit(fail ? 1 : 0)
