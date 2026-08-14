// pw-def-seeding — one seed per (project, type), and the database refuses the
// second. [RIVET] 2026-08-14, T5 of the first maintenance triage.
//
// THE DEFECT THIS PINS: project_equipment_field_defs had NO unique constraint,
// and its seeding was a check-then-insert (the trigger's NOT EXISTS) with a
// second writer still alive (client-side ensureFieldDefs, which the trigger
// was built to replace on 2026-08-04 and which was never retired). Result:
// 11 (project, type) pairs across 5 real projects with every field exactly
// twice — and because values are keyed by FIELD NAME, the doubled rows bound
// one stored value to two inputs: "both fields populate at the same time."
//
// What is asserted:
//   · PREMISE — the chosen fixture type has firm defs and is genuinely absent
//     from ZZ-TEST (no project defs, no equipment). A seeding assertion on a
//     type that was already seeded proves nothing. The suite REFUSES a
//     candidate with residue rather than deleting what it did not create.
//   · ARRIVAL — inserting a typed unit seeds the full firm set (the trigger's
//     live path, exercised as the EMPLOYEE — the role real content work runs as).
//   · ONE SEED — a second unit of the same type leaves the count unchanged.
//   · THE REFUSAL — a direct duplicate def insert fails with SQLSTATE 23505,
//     asserted BY ERROR CODE, never by row count. This is the leg that was red
//     before the unique index existed (failing-first proof on the record).
//   · ONE INPUT PER FIELD — the rendered nameplate shows each def label exactly
//     as many times as the firm set carries it (the contact-modal lesson:
//     mechanics can pass while the screen shows two of everything).
//
// Self-cleaning both directions: fixture units are tagged ZZ-T5-* and removed
// in finally; the seeded def set is deleted only because the premise proved it
// did not exist before this run. Resting state printed and asserted.
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { credentials, login, openTestProject, waitUntil, TEST_PROJECT } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-def-seeding')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', TEST_PROJECT).single()
if (!proj) { console.error('REFUSING: no ZZ-TEST'); process.exit(1) }

// Employee client — the role content work actually runs as (the RLS lesson:
// a suite that speaks only as the service role cannot see an RLS defect).
const emp = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
{
  const { email, password } = credentials()
  const { error } = await emp.auth.signInWithPassword({ email, password })
  if (error) { console.error(`REFUSING: employee login failed — ${error.message}`); process.exit(1) }
}

// Residue from a killed run: our OWN fixture units are removed by tag,
// unconditionally. Def rows are NOT touched here — the premise below refuses a
// dirty candidate instead of deleting structure this run did not create.
await svc.from('equipment').delete().eq('project_id', proj.id).in('tag', ['ZZ-T5-A', 'ZZ-T5-B'])

// ── PREMISE: pick a fixture type that is genuinely absent from ZZ-TEST ──────
// TWO absent types: the first proves the INSERT route, the second proves the
// UPDATE route (a type change must seed too — the trigger's OR UPDATE branch
// is a creation path the ruling requires proven before the client writer
// stays retired).
//
// Candidates are DERIVED from the vocabulary, not hardcoded (calibration law:
// a hand list encoded the author's guess, and its first run refused three of
// four — one type already lived on ZZ-TEST and two carry zero firm defs,
// which is legal for a minted type). Any type with a real firm set that
// ZZ-TEST has never carried qualifies; alphabetical for a stable pick.
const { data: firmRows } = await svc.from('equipment_type_field_defs')
  .select('equipment_type, section, field_name').neq('equipment_type', '__base')
const byType = new Map()
for (const r of firmRows ?? []) {
  if (!byType.has(r.equipment_type)) byType.set(r.equipment_type, [])
  byType.get(r.equipment_type).push(r)
}
const absent = []
for (const t of [...byType.keys()].sort()) {
  if (byType.get(t).length < 6) continue // a real set, not a stub
  const [{ count: pd }, { count: eq }] = await Promise.all([
    svc.from('project_equipment_field_defs').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('equipment_type', t),
    svc.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('equipment_type', t),
  ])
  if (pd === 0 && eq === 0) { absent.push({ t, fd: byType.get(t) }); if (absent.length === 2) break }
}
const TYPE = absent[0]?.t ?? null, firmDefs = absent[0]?.fd ?? []
const TYPE2 = absent[1]?.t ?? null, firmDefs2 = absent[1]?.fd ?? []
check(!!TYPE && !!TYPE2,
  `premise: two firm-typed, ZZ-absent fixture types exist (${TYPE ?? '—'}, ${TYPE2 ?? '—'})`)

let cleanupDefs = false
try {
  if (TYPE) {
    const FIRM_COUNT = firmDefs.length

    // ── ARRIVAL: the first typed unit seeds the full firm set ───────────────
    const { error: insErr } = await emp.from('equipment').insert({
      project_id: proj.id, kind: 'equipment', tag: 'ZZ-T5-A',
      descriptor: 'T5 seeding fixture A', category: 'ZZ-T5', equipment_type: TYPE,
    })
    check(!insErr, `the employee inserts a typed unit (${insErr?.message ?? 'ok'})`)
    cleanupDefs = true

    const defCount = async () => {
      const { count } = await svc.from('project_equipment_field_defs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', proj.id).eq('equipment_type', TYPE)
      return count ?? 0
    }
    const seeded = await waitUntil(async () => await defCount() === FIRM_COUNT ? FIRM_COUNT : null,
      { timeout: 10000, what: `the project copy to hold exactly ${FIRM_COUNT} defs` })
    check(seeded === FIRM_COUNT, `the trigger seeded the full firm set (${await defCount()}/${FIRM_COUNT})`)

    // ── ONE SEED: a second unit changes nothing ─────────────────────────────
    const { data: unitB, error: insBErr } = await emp.from('equipment').insert({
      project_id: proj.id, kind: 'equipment', tag: 'ZZ-T5-B',
      descriptor: 'T5 seeding fixture B', category: 'ZZ-T5', equipment_type: TYPE,
    }).select('id').single()
    check(!insBErr && !!unitB, `a second unit of the type inserts cleanly (${insBErr?.message ?? 'ok'})`)
    // The trigger runs inside the insert's own statement, so once the row is
    // back the seed (had one fired) would already be visible.
    check(await defCount() === FIRM_COUNT,
      `the second unit did not re-seed (still ${await defCount()}/${FIRM_COUNT})`)

    // ── THE UPDATE ROUTE: a type CHANGE seeds too ───────────────────────────
    // The ruled condition on retiring the client writer: every creation path
    // proven. INSERT is proven above; this is the trigger's UPDATE branch —
    // the type-picker, retroactive ratification and T6-style queue approvals
    // all arrive through an UPDATE of equipment_type. Guarded on TYPE2 so a
    // one-candidate world reads as an UNPROVEN route, never a vacuous 0/0 pass.
    if (TYPE2) {
      const { error: updErr } = await emp.from('equipment')
        .update({ equipment_type: TYPE2 }).eq('id', unitB.id)
      check(!updErr, `the employee re-types unit B to ${TYPE2} (${updErr?.message ?? 'ok'})`)
      const def2Count = async () => {
        const { count } = await svc.from('project_equipment_field_defs')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', proj.id).eq('equipment_type', TYPE2)
        return count ?? 0
      }
      const seeded2 = await waitUntil(async () => await def2Count() === firmDefs2.length ? firmDefs2.length : null,
        { timeout: 10000, what: `${TYPE2} defs to arrive after the type change` })
      check(seeded2 === firmDefs2.length,
        `the UPDATE route seeded ${TYPE2}'s full firm set (${await def2Count()}/${firmDefs2.length})`)
    } else {
      check(false, 'UPDATE route unproven — no second absent type available')
    }

    // ── THE REFUSAL: a duplicate def row is refused BY THE DATABASE ─────────
    const { data: one } = await svc.from('project_equipment_field_defs')
      .select('project_id, equipment_type, section, field_name, unit, sort_order')
      .eq('project_id', proj.id).eq('equipment_type', TYPE).limit(1).single()
    const { error: dupErr } = await emp.from('project_equipment_field_defs').insert(one)
    check(dupErr?.code === '23505',
      `a duplicate def insert is REFUSED with 23505 (got ${dupErr ? `${dupErr.code}: ${dupErr.message}` : 'SUCCESS — the constraint is not there'})`)

    // ── ONE INPUT PER FIELD, on the real screen ─────────────────────────────
    // Probe with the LONGEST field name: a short generic one ("Type") also
    // matches page chrome and turns the count into a lie about the nameplate.
    const probe = firmDefs
      .filter(d => !['Manufacturer', 'Model Number', 'Serial Number'].includes(d.field_name))
      .sort((a, b) => b.field_name.length - a.field_name.length)[0]
    const expected = firmDefs.filter(d => d.field_name === probe.field_name).length
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setViewportSize({ width: 1500, height: 900 })
      await login(page)
      await openTestProject(page)
      await page.getByRole('button', { name: 'Equipment', exact: true }).click()
      const row = page.getByText('ZZ-T5-A', { exact: true })
      const found = await waitUntil(async () => await row.count() > 0 ? row : null,
        { timeout: 15000, what: 'the fixture unit in the register list' })
      check(!!found, 'the fixture unit is findable on the Equipment tab')
      if (found) {
        await found.first().click()
        const label = page.getByText(probe.field_name, { exact: true })
        const settled = await waitUntil(async () => await label.count() >= expected ? await label.count() : null,
          { timeout: 10000, what: `the nameplate to render "${probe.field_name}"` })
        check(settled === expected,
          `"${probe.field_name}" renders exactly ${expected}x (its section count) — got ${settled ?? await label.count()}; doubled defs would show ${expected * 2}`)
      }
    } finally {
      await browser.close()
    }
  }
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await svc.from('equipment').delete().eq('project_id', proj.id).in('tag', ['ZZ-T5-A', 'ZZ-T5-B'])
  if (cleanupDefs) {
    for (const t of [TYPE, TYPE2].filter(Boolean)) {
      await svc.from('project_equipment_field_defs').delete()
        .eq('project_id', proj.id).eq('equipment_type', t)
    }
  }
  if (TYPE) {
    const { count: eqLeft } = await svc.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).in('tag', ['ZZ-T5-A', 'ZZ-T5-B'])
    const { count: defLeft } = await svc.from('project_equipment_field_defs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).in('equipment_type', [TYPE, TYPE2].filter(Boolean))
    console.log(`\ncleanup: fixture units left ${eqLeft} (must be 0) · fixture-type project defs left ${defLeft} (must be 0)`)
    if (eqLeft !== 0 || defLeft !== 0) { fails.push('cleanup left residue on ZZ-TEST') }
  }
  await emp.auth.signOut().catch(() => {})
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. One seed per (project, type); the database refuses the second.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
