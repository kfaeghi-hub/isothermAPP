// pw-schedule-coverage — the two surfaces the Avondale incident added, SIGHTED.
//
// Real browser, real login, so what is asserted is what a person sees.
//
// WHAT THIS EXISTS TO PREVENT. Adam's import wrote 77 spec values and showed
// zero. Every layer reported success: the parser found its header, the rows were
// created, the endpoint returned 200. The only thing that was wrong was what
// reached the screen — and no data-level assertion can see that difference. The
// same class as the IST generate button that did not exist while 15 structural
// checks passed.
//
// TWO CLAIMS, both about the screen:
//   1. A unit that carries schedule readings with no matching field SHOWS them,
//      under a heading that says what they are.
//   2. The unit's mapped spec values render — the repointed pump shows Flow, Head,
//      Speed, Motor kW, VFD rather than an empty Spec section.
//
// ZZ-TEST only, self-cleaning. The fixture is seeded here rather than borrowed
// from Avondale: a suite must never read a real client's register to prove a
// rendering rule, and a seeded unit can carry exactly the shape being asserted.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject, waitUntil, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-schedule-coverage')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()
const TAG = 'PW-COV-1'

// The exact shape Avondale produced: some readings mapped onto declared fields,
// some with no field to land in.
const MAPPED = { 'Speed': '1760', 'VFD': 'YES' }
const ORPHANS = {
  'LIQUID TEMP [°F]': '180',
  'VFD INPUT [V/Ph/Hz]': '208/1/60',
  'DRY WEIGHT [LBS]': '467',
}

async function cleanup() {
  const { data } = await svc.from('equipment').select('id').eq('project_id', proj.id).eq('tag', TAG)
  for (const e of data ?? []) await svc.from('equipment').delete().eq('id', e.id)
}
await cleanup()

const { data: unit, error: insErr } = await svc.from('equipment').insert({
  project_id: proj.id, tag: TAG, kind: 'equipment', equipment_type: 'pump',
  descriptor: 'coverage fixture',
  nameplate_extra: { spec: MAPPED, shop_drawing: {}, installed: {}, from_schedule: { ...MAPPED, ...ORPHANS } },
}).select('id').single()
if (insErr) { console.error('fixture insert failed:', insErr.message); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })

try {
  await login(page)
  await page.goto(`${BASE_URL}/projects`)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click()
  await page.waitForTimeout(3000)
  await page.getByText(TAG, { exact: false }).filter({ visible: true }).first().click()
  await page.waitForTimeout(2000)

  // ── 1 · the mapped values are ON SCREEN, not merely in the row ─────────────
  const body = await page.locator('body').innerText()
  check(/\b1760\b/.test(body), 'the mapped Speed value 1760 is visible on the unit')
  check(/Speed/i.test(body), 'and its declared field name renders')

  // ── 2 · the unmapped strip exists, is findable, and names its readings ─────
  const strip = page.locator('[data-testid="unmapped-from-schedule"]')
  await strip.first().waitFor({ timeout: 15000 }).catch(() => {})
  check(await strip.count() > 0, 'the "from the schedule · not mapped" strip renders')

  if (await strip.count() > 0) {
    // VISIBLE, not merely present. A strip inside a collapsed section is in the
    // DOM and is not on the screen, which is the exact distinction this suite is
    // named for.
    check(await strip.first().isVisible(), 'the strip is actually visible, not just present in the DOM')
    const text = await strip.first().innerText()
    for (const [k, v] of Object.entries(ORPHANS)) {
      check(text.includes(k), `it names the heading "${k}" as the schedule wrote it`)
      check(text.includes(v), `and shows its value ${v}`)
    }
    // A mapped reading must NOT be repeated here — it is already on screen under
    // its proper field, and showing it twice implies two readings where there is one.
    check(!text.includes('1760'), 'a heading that DID map is not repeated in the strip')
    check(/not mapped/i.test(text), 'the strip says what it is, rather than showing bare values')
  }

  // ── 3 · the count in the heading matches what is listed ───────────────────
  if (await strip.count() > 0) {
    const heading = await strip.first().innerText()
    const m = heading.match(/\((\d+)\)/)
    check(m && Number(m[1]) === Object.keys(ORPHANS).length,
      `the heading's count (${m?.[1]}) equals the ${Object.keys(ORPHANS).length} readings listed`)
  }

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await browser.close()
  await cleanup()
  const { data: left } = await svc.from('equipment').select('id').eq('project_id', proj.id).eq('tag', TAG)
  check((left ?? []).length === 0, 'self-clean: the fixture unit is gone')
}

console.log('\n' + '='.repeat(64))
console.log(fail
  ? `FAIL — ${fail} of ${pass + fail}`
  : `PASS — ${pass} checks. What an import read is visible on the unit.`)
process.exit(fail ? 1 : 0)
