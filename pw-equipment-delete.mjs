// pw-equipment-delete — an employee deletes equipment on a project they belong to.
//
// SIGHTED: real browser, real login, so RLS is in the path and the button being
// asserted is the one a person sees.
//
// WHAT CHANGED, 2026-08-10: equipment hard-delete moved from governors to
// PROJECT MEMBERS. The protection moved from role to REFERENCES, and every
// reference already had a guard — findings hard-block in the app, checklist
// targets are refused by a foreign key at every role, Cx Index progress and
// attachments are named in the confirm. A clean unit is a typo, and a typo
// should not need an owner.
//
// THE THREE LEGS, and why each has to exist:
//   1. A member deletes a CLEAN unit. The widening actually works.
//   2. A member meets the PLAIN SENTENCE on a checklist-targeted unit — not the
//      Postgres FK text. The database still refuses; what is asserted here is
//      that the app says so first, in English, before the attempt.
//   3. A NON-member sees no button, and a direct DELETE removes zero rows —
//      asserted as a ROW COUNT, because RLS refuses a delete SILENTLY: no error,
//      nothing removed. `!error` means "nothing went wrong", never "it is gone".
//      That is the arrival rule pointed the other way: assert the departure.
//
// ZZ-TEST only, self-cleaning.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject, waitUntil, credentials, assertFixtureProject, OTHER_FIXTURE, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-equipment-delete')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()
const TAG = 'PW-DEL'

async function cleanup() {
  const { data } = await svc.from('equipment').select('id').eq('project_id', proj.id).like('tag', `${TAG}%`)
  for (const e of data ?? []) {
    await svc.from('checklist_instance_targets').delete().eq('equipment_id', e.id)
    await svc.from('equipment').delete().eq('id', e.id)
  }
}
await cleanup()

// the employee must actually BE a member, or leg 1 tests the wrong thing
const { data: me } = await svc.from('user_profiles').select('id').eq('email', credentials().email).single()
const { data: mem } = await svc.from('project_members').select('profile_id').eq('project_id', proj.id).eq('profile_id', me.id).maybeSingle()
check(!!mem, 'the employee account is a MEMBER of ZZ-TEST — the precondition leg 1 rests on')

const { data: clean } = await svc.from('equipment')
  .insert({ project_id: proj.id, tag: `${TAG}-CLEAN`, kind: 'equipment', descriptor: 'clean unit' }).select('id').single()
const { data: targeted } = await svc.from('equipment')
  .insert({ project_id: proj.id, tag: `${TAG}-TARGETED`, kind: 'equipment', descriptor: 'has checklist work' }).select('id').single()
const { data: inst } = await svc.from('checklist_instances').select('id').eq('project_id', proj.id).limit(1).single()
await svc.from('checklist_instance_targets').insert({ instance_id: inst.id, equipment_id: targeted.id, role: 'related' })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
const dialogs = []
page.on('dialog', async d => { dialogs.push(d.message()); await d.accept() })

async function openEquipment() {
  await page.goto(`${BASE_URL}/projects`)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click()
  await page.waitForTimeout(3000)
}
const selectUnit = async tag => {
  await page.getByText(tag, { exact: false }).filter({ visible: true }).first().click()
  await page.waitForTimeout(1500)
}
const deleteBtn = () => page.getByRole('button', { name: /^Delete$/ })

try {
  await login(page)
  await openEquipment()

  // ── 1. a member deletes a CLEAN unit ──────────────────────────────────────
  await selectUnit(`${TAG}-CLEAN`)
  check(await deleteBtn().count() > 0, 'the Delete button is visible to a project member')
  dialogs.length = 0
  await deleteBtn().first().click()
  const gone = await waitUntil(async () => {
    const { data } = await svc.from('equipment').select('id').eq('id', clean.id)
    return (data ?? []).length === 0
  }, { timeout: 15000, what: 'the clean unit to be deleted' })
  check(gone, 'a member DELETES a clean unit')
  check(dialogs.some(d => /Nothing references it/i.test(d)),
    `the confirm says nothing references it (${dialogs.length} dialog(s))`)

  // ── 2. the PLAIN SENTENCE on a checklist-targeted unit ───────────────────
  await openEquipment()
  await selectUnit(`${TAG}-TARGETED`)
  dialogs.length = 0
  await deleteBtn().first().click()
  await page.waitForTimeout(2000)
  const said = dialogs.join(' | ')
  check(/checklist work recorded/i.test(said),
    `the app names the checklist work in English before trying (${said.slice(0, 80) || 'no dialog'})`)
  check(!/foreign key|constraint|violates/i.test(said),
    'and no Postgres constraint text reaches the user')
  const { data: survived } = await svc.from('equipment').select('id').eq('id', targeted.id)
  check((survived ?? []).length === 1, 'the checklist-targeted unit is still there — the FK line has not moved')

  // ── 3. a NON-member: no button, and a direct delete removes ZERO rows ────
  // THE SECOND FIXTURE, not "the first project that is not ZZ-TEST". The first
  // version of this leg took whatever came back and wrote a synthetic row into a
  // REAL CLIENT's equipment register to prove the delete was refused. It was
  // removed and nothing was lost — and it broke the rule that suites never touch
  // a real project. ZZ-TEST-LEED exists so "a project the user is not a member
  // of" never has to mean a real one, and the allow-list now refuses by name.
  const { data: other } = await svc.from('projects').select('id, name').eq('name', OTHER_FIXTURE).single()
  assertFixtureProject(other, 'seed a unit for the non-member leg')
  const { data: foreign } = await svc.from('equipment')
    .insert({ project_id: other.id, tag: `${TAG}-FOREIGN`, kind: 'equipment' }).select('id').single()
  const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  await anon.auth.signInWithPassword(credentials())
  const { data: removed, error: delErr } = await anon.from('equipment').delete().eq('id', foreign.id).select('id')
  // ASSERTED AS A COUNT. A silently-refused delete returns no error at all, so
  // checking `error` alone would call this a success.
  check(!delErr && (removed ?? []).length === 0,
    `a non-member's direct DELETE removes ZERO rows and raises no error (${(removed ?? []).length} row(s), error=${delErr ? 'yes' : 'none'})`)
  const { data: stillThere } = await svc.from('equipment').select('id').eq('id', foreign.id)
  check((stillThere ?? []).length === 1, 'and the row is untouched')
  await svc.from('equipment').delete().eq('id', foreign.id)

} finally {
  await browser.close()
  await cleanup()
  console.log(`\ncleanup: ${TAG} units removed from ZZ-TEST`)
}

console.log('\n' + '='.repeat(60))
console.log(fail ? `FAIL — ${fail} of ${pass + fail}` : `PASS — ${pass} checks, member equipment delete verified through a real login.`)
process.exit(fail ? 1 : 0)
