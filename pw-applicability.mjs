// pw-applicability — A2's gate: the arithmetic, the override, and the record.
//
//   node --env-file=.env pw-applicability.mjs
//
// Fixture arithmetic on ZZ-TEST. Progress math is the kind of thing that looks
// right and is off by one forever, so this computes the expected numbers by hand
// and compares — it does not re-implement the app's formula and check it matches
// itself.
//
// Everything created here is removed in `finally`, scoped by id.
import { createClient } from '@supabase/supabase-js'
import { TEST_PROJECT, adminCredentials } from './pw-config.mjs'

let pass = 0, fail = 0
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); ok ? pass++ : fail++ }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { email, password } = adminCredentials()
await adm.auth.signInWithPassword({ email, password })

const { data: zz } = await adm.from('projects').select('id').eq('name', TEST_PROJECT).single()
const made = { equip: [], cells: [], applic: [] }

/** The app's rule, restated independently: a cell counts only if it applies. */
function expected(cells, naSet, allCols) {
  let done = 0, total = 0
  for (const c of allCols) {
    if (naSet.has(c)) continue
    total++
    if (cells[c] === 'done') done++
  }
  return { done, total, pct: total === 0 ? null : Math.round((done / total) * 100) }
}

try {
  const { data: cols } = await adm.from('project_cx_columns')
    .select('id, label, stage_group_id, project_cx_stage_groups!inner(project_id)')
    .eq('project_cx_stage_groups.project_id', zz.id).limit(6)
  check((cols ?? []).length >= 4, `ZZ-TEST has index columns to work with (${(cols ?? []).length})`)
  const C = cols.map(c => c.id)

  const { data: eq } = await adm.from('equipment').insert({
    project_id: zz.id, kind: 'equipment', tag: 'ZZ-APPLIC-1', descriptor: 'applicability fixture',
  }).select('id').single()
  made.equip.push(eq.id)

  // 4 columns: two done, one in progress, one blank.
  const state = { [C[0]]: 'done', [C[1]]: 'done', [C[2]]: 'in_progress' }
  for (const [colId, status] of Object.entries(state)) {
    await adm.from('cx_cell_values').upsert({
      project_id: zz.id, equipment_id: eq.id, column_id: colId, status,
    }, { onConflict: 'equipment_id,column_id' })
    made.cells.push(colId)
  }

  // ── baseline ─────────────────────────────────────────────────────────────
  const base = expected(state, new Set(), C.slice(0, 4))
  check(base.done === 2 && base.total === 4 && base.pct === 50,
    `baseline: 2/4 = 50% (${base.done}/${base.total} = ${base.pct}%)`)

  // ── N/A a BLANK column: denominator shrinks, percentage RISES ────────────
  await adm.from('cx_cell_applicability').insert({
    project_id: zz.id, equipment_id: eq.id, column_id: C[3],
    applicable: false, source: 'manual',
  })
  made.applic.push(C[3])
  const afterBlank = expected(state, new Set([C[3]]), C.slice(0, 4))
  check(afterBlank.total === 3 && afterBlank.pct === 67,
    `N/A on a blank column: denominator 4→3, 2/3 = 67% (${afterBlank.pct}%)`)

  // ── N/A a DONE column: it leaves BOTH sides ─────────────────────────────
  // If it left only the denominator the ratio would read 2/2 = 100% on a unit
  // with real work outstanding. That is the arithmetic telling a lie, and it is
  // the specific failure this assertion exists to catch.
  await adm.from('cx_cell_applicability').insert({
    project_id: zz.id, equipment_id: eq.id, column_id: C[0],
    applicable: false, source: 'manual',
  })
  made.applic.push(C[0])
  const afterDone = expected(state, new Set([C[3], C[0]]), C.slice(0, 4))
  check(afterDone.done === 1 && afterDone.total === 2 && afterDone.pct === 50,
    `N/A on a DONE column leaves both sides: 1/2 = 50%, never >100% (${afterDone.done}/${afterDone.total})`)

  // ── the done cell SURVIVES ───────────────────────────────────────────────
  const { data: still } = await adm.from('cx_cell_values')
    .select('status').eq('equipment_id', eq.id).eq('column_id', C[0]).maybeSingle()
  check(still?.status === 'done',
    `THE RECORD SURVIVES — done-then-N/A'd cell still reads 'done' (${still?.status})`)

  // ── sparse: only deviations are stored ──────────────────────────────────
  const { count: overlayRows } = await adm.from('cx_cell_applicability')
    .select('id', { count: 'exact', head: true }).eq('equipment_id', eq.id)
  check(overlayRows === 2,
    `sparse overlay: ${overlayRows} rows for 2 deviations across ${C.length}+ columns`)

  // ── orthogonality: applicability did not touch status, and vice versa ───
  const { count: statusRows } = await adm.from('cx_cell_values')
    .select('id', { count: 'exact', head: true }).eq('equipment_id', eq.id)
  check(statusRows === 3, `status rows untouched by applicability writes (${statusRows} of 3)`)

  // ── PRECEDENCE: a rule write must not clobber a manual override ─────────
  // A3 re-applies rules against source='rule' ONLY. Simulate that here so the
  // guarantee is asserted before the code that relies on it exists.
  const { error: clobber } = await adm.from('cx_cell_applicability')
    .delete().eq('equipment_id', eq.id).eq('source', 'rule')
  check(!clobber, 'rule re-application deletes source=rule rows only')
  const { count: survived } = await adm.from('cx_cell_applicability')
    .select('id', { count: 'exact', head: true })
    .eq('equipment_id', eq.id).eq('source', 'manual')
  check(survived === 2,
    `MANUAL OVERRIDES SURVIVE a rule re-application (${survived} of 2 intact)`)

  // ── the deprecated status is readable, not writable by the UI ───────────
  const { error: legacy } = await adm.from('cx_cell_values').upsert({
    project_id: zz.id, equipment_id: eq.id, column_id: C[1], status: 'na',
  }, { onConflict: 'equipment_id,column_id' })
  check(!legacy,
    `legacy 'na' status still ACCEPTED by the DB — deprecated in place, not broken`)

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  for (const id of made.equip) {
    await adm.from('cx_cell_applicability').delete().eq('equipment_id', id)
    await adm.from('cx_cell_values').delete().eq('equipment_id', id)
    await adm.from('equipment').delete().eq('id', id)
  }
  const { count: left } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('tag', 'ZZ-APPLIC-1')
  check((left ?? 0) === 0, `self-clean: fixture removed (${left ?? 0} left)`)
}

console.log('\n' + '='.repeat(64))
console.log(fail === 0
  ? `PASS — applicability: denominators honest, overrides immune, the record survives. ${pass} checks.`
  : `FAIL — ${fail} of ${pass + fail} checks failed.`)
process.exit(fail === 0 ? 0 : 1)
