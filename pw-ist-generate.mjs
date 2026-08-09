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
import { login, openTestProject, waitUntil, BASE_URL } from './pw-config.mjs'
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

async function openPlan(label) {
  await page.goto(`${BASE_URL}/projects`)
  await openTestProject(page)
  await page.getByRole('button', { name: 'IST', exact: true }).click()
  await page.waitForTimeout(2500)
  const radio = page.locator('[data-testid="ist-plan-row"]').filter({ hasText: label }).locator('input')
  if (await radio.count()) { await radio.first().check(); await page.waitForTimeout(2200) }
}

try {
  await login(page)
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
  await openPlan(nextRev?.revision_label ?? `${LABEL}-0`)
  const hist = page.locator('[data-testid="ist-gen-row"]')
  check(await hist.count() > 0, 'the plan view shows what was generated, and when')

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
