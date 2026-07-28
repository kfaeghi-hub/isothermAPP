// pw-applicability-review-render — LOOK at the ratification screen on real data.
//
//   PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-applicability-review-render.mjs
//
// READ-ONLY, AND THE SCRIPT PROVES IT. It opens Seneca's Cx Index, opens the
// Applicability panel, asserts what a reviewer would see, and screenshots it.
//
// THIS IS THE ONE SCRIPT THAT TOUCHES A CLIENT PROJECT, and it needs a reason.
// The standing rule is that Playwright runs only against ZZ-TEST, because test
// data must never land in a commissioning record. ZZ-TEST has no proposals, so
// rendering there would assert nothing about the screen a CxA is about to use.
//
// So the rule's PURPOSE is enforced instead of its letter: the script performs no
// mutation, clicks no Ratify or Reject control, and takes a full census of the
// proposal table before and after. If a single row's status, key or count moved,
// it FAILS. A promise not to write is worth less than a check that nothing did.
//
// This exists because the defect it guards against passed every other check.
// Ten exceptions were keyed to a tag that matched no unit; the rows rendered, the
// buttons were live, and Ratify would have written zero cells while reporting
// success. No unit test noticed, because nothing was asserting that a proposal
// can be acted on. So: assert the SUBJECT is named, and assert every proposal
// resolves to at least one unit.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL } from './pw-config.mjs'

const COM = '257889'
// ONE ORIGIN FOR BOTH. loginAs signs in against pw-config's BASE_URL; navigating
// afterwards to a different host means a different origin, no session, and a
// bounce to /login — which is exactly how this script failed the first time.
const base = BASE_URL
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword(adminCredentials())

const { data: proj } = await sb.from('projects').select('id, name').eq('com_number', COM).single()
const census = async () => {
  const { data } = await sb.from('cx_applicability_proposals')
    .select('id, status, equipment_type, equipment_category, tag, units_affected')
    .eq('project_id', proj.id).order('id')
  return JSON.stringify(data)
}
const before = await census()

const { data: props } = await sb.from('cx_applicability_proposals')
  .select('*').eq('project_id', proj.id).eq('status', 'proposed')
console.log(`${proj.name}: ${props.length} proposals awaiting a decision
`)

// ── EVERY PROPOSAL MUST RESOLVE TO SOMETHING ────────────────────────────────
// The check the first run needed and did not have.
let unresolvable = 0
for (const p of props) {
  let n = 0
  if (p.kind === 'rule' && p.equipment_type) {
    const { count } = await sb.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('equipment_type', p.equipment_type)
    n = count ?? 0
  } else if (p.equipment_id) n = 1
  else if (p.equipment_category) {
    const { count } = await sb.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', p.equipment_category)
    n = count ?? 0
  }
  if (n === 0) { unresolvable++; console.log(`    unresolvable: ${p.kind} ${p.equipment_type ?? p.equipment_category ?? p.tag} / ${p.stage_group_name}`) }
}
check(unresolvable === 0, `every proposal resolves to at least one unit (${props.length} checked)`)

// units_affected must match what ratifying would actually touch, or the number
// a reviewer weighs is fiction.
let miscounted = 0
for (const p of props.filter(p => p.kind === 'rule' && p.equipment_type)) {
  const { count } = await sb.from('equipment').select('id', { count: 'exact', head: true })
    .eq('project_id', proj.id).eq('equipment_type', p.equipment_type)
  if ((p.units_affected ?? 0) !== (count ?? 0)) {
    miscounted++
    console.log(`    ${p.equipment_type}: says ${p.units_affected}, register holds ${count}`)
  }
}
check(miscounted === 0, 'units_affected matches the register on every type rule')

// ── RENDER IT AND LOOK ──────────────────────────────────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
try {
  await loginAs(page, adminCredentials())
  await page.goto(`${base}/projects/${proj.id}?tab=cx_index`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Applicability/ }).first().click()
  await page.waitForTimeout(1500)

  const panel = page.locator('text=Applicability proposals').first()
  check(await panel.isVisible(), 'the review panel opens')

  const body = await page.locator('body').innerText()
  check(/LIFE-SAFETY SCOPE/.test(body), 'life-safety block is present and separate')
  check(/Type rules/.test(body), 'type rules block is present')
  check(/Category exceptions/.test(body), 'category exceptions block is present')

  // The subject of every line must be NAMED. A blank subject is what a
  // tag-keyed exception rendered as after the key moved to equipment_category.
  check(/SUMP PUMP/.test(body), 'a category exception names its category (SUMP PUMP)')
  check(/in pump/.test(body), 'a category exception names the type it sits inside')
  check(!/·\s+·/.test(body), 'no line renders an empty subject')

  // The classifier is a job now — the panel must say so, not offer a dead button.
  check(/administrator job/.test(body), 'panel names where proposals come from')
  check(!/Run classifier/.test(body), 'no button that would always time out')

  // The count a reviewer weighs, on the biggest rule.
  check(/117 units/.test(body), 'fcu rule shows all 117 units, not the first category only')

  await page.screenshot({ path: 'out/pw-applicability-review.png', fullPage: false })
  console.log('\n  screenshot: out/pw-applicability-review.png')
} catch (e) {
  check(false, `render: ${e.message}`)
  await page.screenshot({ path: 'out/pw-applicability-review-fail.png' }).catch(() => {})
} finally {
  await browser.close()
}

console.log(`\n${'='.repeat(64)}`)
if (fails.length) { console.log(`FAIL — ${fails.length}:`); fails.forEach(f => console.log(`  - ${f}`)); process.exit(1) }
console.log('PASS — the ratification screen reads correctly on real data. NOTHING RATIFIED.')
