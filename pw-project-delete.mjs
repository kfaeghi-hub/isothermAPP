// Regression: an admin must be able to delete a project that has equipment
// referenced by a checklist instance's target — and the delete must really
// succeed (row gone), not silently no-op.
//
// This is the exact shape that broke (diagnosis 2026-07-22). Deleting such a
// project aborted with Postgres 23503: checklist_instance_targets.equipment_id
// -> equipment was ON DELETE RESTRICT and sits on a SEPARATE cascade branch from
// the instance that owns the target, so the equipment branch fired while its
// target still existed. ProjectsPage.confirmDelete then discarded the { error },
// so the UI showed nothing and the project silently persisted.
//
// Two fixes are under test together, and a regression in EITHER fails this test:
//   1. migration `project_delete_fk_fix` — the FK is now DEFERRABLE INITIALLY
//      DEFERRED, so the whole-project cascade completes at COMMIT. Regress it and
//      the row survives -> the "row deleted" checks fail.
//   2. confirmDelete now issues `.select('id')` + reportWriteBlocked, so a blocked
//      delete raises a visible alert. Regress it (swallow again) and a blocked
//      delete would pass silently — so we also assert the row is truly gone, and
//      that if it were ever blocked the alert we listen for would fire.
//
// Run: node --env-file=.env pw-project-delete.mjs
//
// ISOLATION GUARD (firm rule: Playwright touches only the ZZ-TEST family): this
// suite creates and deletes ONLY projects it made itself, under the unique
// "ZZ-TEST-DELETE <ts> — Do Not Use" prefix. It tears down by the exact id it
// created and never touches the canonical ZZ-TEST / ZZ-TEST-LEED fixtures
// (neither matches this prefix). A delete test cannot reuse the canonical
// fixture — it would destroy it — so a disposable self-made project is required,
// exactly as pw-classification makes its own ZZ-TEST-LEED project.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials } from './pw-config.mjs'

const RUN = Date.now().toString(36)
const PROJECT_NAME = `ZZ-TEST-DELETE ${RUN} — Do Not Use`
const PREFIX = 'ZZ-TEST-DELETE '   // unique to this suite; canonical fixtures don't match

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// ── Admin DB client (the same access the app uses client-side as dev.admin) ──
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
{
  const { error } = await adm.auth.signInWithPassword({
    email: process.env.admin_email, password: process.env.admin_password,
  })
  if (error) { console.error(`admin sign-in failed: ${error.message}`); process.exit(1) }
}

// Sweep any fixtures leaked by a prior interrupted run BEFORE making a new one.
// Safe: the prefix is unique to this suite (canonical fixtures are "ZZ-TEST — Do
// Not Use" / "ZZ-TEST-LEED — Do Not Use"; neither matches "ZZ-TEST-DELETE %").
{
  const { data } = await adm.from('projects').select('id,name').ilike('name', `${PREFIX}%`)
  for (const p of data ?? []) await adm.from('projects').delete().eq('id', p.id)
  if ((data ?? []).length) console.log(`pre-clean: removed ${data.length} leaked delete-fixture project(s)`)
}

// ── Build the fixture: the precise cross-branch shape that broke ─────────────
let projectId = null
const teardown = async () => { if (projectId) await adm.from('projects').delete().eq('id', projectId) }
const die = async (msg) => { console.error(msg); await teardown(); process.exit(1) }

const { data: proj, error: pErr } = await adm.from('projects')
  .insert({ name: PROJECT_NAME }).select('id').single()
if (pErr || !proj) await die(`fixture: project insert failed: ${pErr?.message ?? 'no row'}`)
projectId = proj.id

const { data: eq, error: eErr } = await adm.from('equipment')
  .insert({ project_id: projectId, kind: 'equipment', tag: `TEST-DEL-HP-${RUN}` })
  .select('id').single()
if (eErr || !eq) await die(`fixture: equipment insert failed: ${eErr?.message ?? 'no row'}`)

const { data: inst, error: iErr } = await adm.from('checklist_instances')
  .insert({
    project_id: projectId,
    type: 'ivc',
    source_template_type_snapshot: 'ivc',
    source_template_name_snapshot: 'ZZ-TEST delete-fixture checklist',
  })
  .select('id').single()
if (iErr || !inst) await die(`fixture: checklist_instance insert failed: ${iErr?.message ?? 'no row'}`)

const { data: tgt, error: tErr } = await adm.from('checklist_instance_targets')
  .insert({ instance_id: inst.id, equipment_id: eq.id, role: 'primary' })
  .select('id').single()
if (tErr || !tgt) await die(`fixture: target insert failed: ${tErr?.message ?? 'no row'}`)

console.log(`fixture ready: project ${projectId} has equipment ${eq.id} targeted by instance ${inst.id}`)

// ── Drive the real delete UI as admin ───────────────────────────────────────
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.setViewportSize({ width: 1500, height: 1000 })

// Capture any alert() — the swallow fix surfaces a blocked delete as one. On the
// happy path none fires; if one does, the delete was blocked (a regression).
const dialogs = []
page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}) })

await loginAs(page, adminCredentials())
check(await page.locator('input[type="password"]').count() === 0, 'logged in as admin')

// New Project button / project list live on /projects (sign-in lands on Dashboard).
await page.getByRole('link', { name: 'Projects' }).click()
await page.waitForTimeout(1500)

const row = page.locator('tr', { hasText: PROJECT_NAME })
check(await row.count() === 1, 'fixture project visible in the list')

// Row actions are owner-only and revealed on hover; the click auto-hovers.
await row.first().hover()
await row.getByRole('button', { name: 'Delete', exact: true }).click()
await page.waitForTimeout(500)

const modal = page.locator('.fixed')
check(await modal.getByText('Permanently delete').count() > 0, 'delete confirmation modal opened')
await modal.getByRole('button', { name: 'Delete Project' }).click()
await page.waitForTimeout(2500)

// ── Assert real success ─────────────────────────────────────────────────────
check(dialogs.length === 0,
  `no error dialog fired during delete${dialogs.length ? ` (got: ${dialogs.join(' | ')})` : ''}`)
check(await page.locator('.fixed').getByRole('button', { name: 'Delete Project' }).count() === 0,
  'delete modal closed (confirmDelete did not early-return on a blocked write)')
check(await page.locator('tr', { hasText: PROJECT_NAME }).count() === 0,
  'project no longer shown in the list')

await browser.close()

// Ground truth in the DB: the project and its whole cascade are gone.
{
  const { data: after }     = await adm.from('projects').select('id').eq('id', projectId)
  const { data: eqAfter }   = await adm.from('equipment').select('id').eq('project_id', projectId)
  const { data: instAfter } = await adm.from('checklist_instances').select('id').eq('project_id', projectId)
  const { data: tgtAfter }  = await adm.from('checklist_instance_targets').select('id').eq('id', tgt.id)
  check((after ?? []).length === 0,     'project row deleted (DB truth)')
  check((eqAfter ?? []).length === 0,   'equipment cascade-deleted')
  check((instAfter ?? []).length === 0, 'checklist instance cascade-deleted')
  check((tgtAfter ?? []).length === 0,  'checklist target cascade-deleted')
  if ((after ?? []).length === 0) projectId = null   // the app deleted it; nothing to tear down
}

// Safety net: if the delete did NOT happen (an assert failed), remove the
// fixture by its exact id so a failed run never leaves a stray project behind.
await teardown()

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? 'PASS — admin deleted a project whose equipment a checklist targeted; row + full cascade gone, no swallowed error.'
  : `FAIL — ${fails.length}: ${fails.join('; ')}`)
console.log('='.repeat(60))
process.exit(fails.length === 0 ? 0 : 1)
