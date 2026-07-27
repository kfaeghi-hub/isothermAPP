// pw-applicability-rules — A3's gate: precedence, re-application, immunity.
//
//   node --env-file=.env pw-applicability-rules.mjs
//
// The guarantee under test is that a human override survives everything a rule
// can do to it, and that a column exception beats its stage-group rule. Both are
// asserted against the real apply_applicability_rules() function on ZZ-TEST.
//
// Firm-level rules are created and removed here, scoped by a reserved type key so
// nothing touches a real rule.
import { createClient } from '@supabase/supabase-js'
import { TEST_PROJECT, adminCredentials } from './pw-config.mjs'

let pass = 0, fail = 0
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); ok ? pass++ : fail++ }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { email, password } = adminCredentials()
await adm.auth.signInWithPassword({ email, password })

const { data: zz } = await adm.from('projects').select('id').eq('name', TEST_PROJECT).single()
// A reserved type of our own, so no real rule or real unit is ever in scope.
const TYPE = 'zz_applic_probe'
const made = { equip: [], rules: [], type: false }

try {
  const { data: grp } = await adm.from('project_cx_stage_groups')
    .select('id, name, project_cx_columns(id, label)')
    .eq('project_id', zz.id).order('sort_order').limit(1).single()
  const cols = grp.project_cx_columns ?? []
  check(cols.length >= 3, `stage group "${grp.name}" has ${cols.length} columns`)

  await adm.from('equipment_types').insert({ key: TYPE, name: 'ZZ Applicability Probe', sort_order: 999 })
  made.type = true

  const { data: eq } = await adm.from('equipment').insert({
    project_id: zz.id, kind: 'equipment', tag: 'ZZ-RULE-1',
    descriptor: 'rule fixture', equipment_type: TYPE,
  }).select('id').single()
  made.equip.push(eq.id)

  const mkRule = async (columnLabel, applicable) => {
    const { data, error } = await adm.from('cx_applicability_rules').insert({
      equipment_type: TYPE, stage_group_name: grp.name,
      column_label: columnLabel, applicable, rationale: 'fixture',
    }).select('id').single()
    if (error) throw new Error(`rule insert: ${error.message}`)
    made.rules.push(data.id)
    return data.id
  }
  const apply = async () => {
    const { data, error } = await adm.rpc('apply_applicability_rules', { pid: zz.id })
    if (error) throw new Error(`apply: ${error.message}`)
    return Array.isArray(data) ? data[0] : data
  }
  const naFor = async () => {
    const { data } = await adm.from('cx_cell_applicability')
      .select('column_id, source').eq('equipment_id', eq.id)
    return new Map((data ?? []).map(r => [r.column_id, r.source]))
  }

  // ── 1. a stage-group rule marks the whole group ─────────────────────────
  await mkRule(null, false)
  let r = await apply()
  let na = await naFor()
  check(na.size === cols.length,
    `group rule marks every column in "${grp.name}": ${na.size} of ${cols.length}`)
  check([...na.values()].every(s => s === 'rule'), 'all written with source=rule')

  // ── 2. A COLUMN EXCEPTION BEATS ITS GROUP RULE ──────────────────────────
  // "fcu: IST n/a, EXCEPT the one column that does apply" is the grammar the
  // brief asked for, and specificity is the whole of it.
  const exceptCol = cols[0]
  await mkRule(exceptCol.label, true)
  await apply()
  na = await naFor()
  check(!na.has(exceptCol.id),
    `COLUMN EXCEPTION BEATS THE GROUP RULE — "${exceptCol.label}" applies again`)
  check(na.size === cols.length - 1,
    `the rest of the group is still n/a (${na.size} of ${cols.length - 1})`)

  // ── 3. a manual override on a rule-covered cell ─────────────────────────
  const manualCol = cols[1]
  await adm.from('cx_cell_applicability')
    .update({ source: 'manual' }).eq('equipment_id', eq.id).eq('column_id', manualCol.id)

  // ── 4. THE GUARANTEE: change the rules, override survives ───────────────
  // Deactivate every rule — the strongest possible re-application, which would
  // clear the group entirely if overrides were not immune.
  for (const id of made.rules) await adm.from('cx_applicability_rules').update({ active: false }).eq('id', id)
  r = await apply()
  na = await naFor()
  check(na.size === 1 && na.get(manualCol.id) === 'manual',
    `RULE CHANGE PRESERVES THE OVERRIDE — every rule off, the manual row survives alone (${na.size})`)
  check(r.cleared >= 1, `re-application cleared the rule rows it owned (${r.cleared})`)

  // ── 5. and a rule cannot re-take a cell a human has claimed ─────────────
  for (const id of made.rules) await adm.from('cx_applicability_rules').update({ active: true }).eq('id', id)
  await apply()
  na = await naFor()
  check(na.get(manualCol.id) === 'manual',
    'rules back on: the overridden cell is STILL source=manual, not re-claimed')

  // ── 6. idempotency ──────────────────────────────────────────────────────
  const before = (await naFor()).size
  await apply(); await apply()
  const after = (await naFor()).size
  check(before === after, `re-applying twice changes nothing (${before} → ${after})`)

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  for (const id of made.equip) {
    await adm.from('cx_cell_applicability').delete().eq('equipment_id', id)
    await adm.from('equipment').delete().eq('id', id)
  }
  for (const id of made.rules) await adm.from('cx_applicability_rules').delete().eq('id', id)
  if (made.type) await adm.from('equipment_types').delete().eq('key', TYPE)

  const { count: lr } = await adm.from('cx_applicability_rules')
    .select('id', { count: 'exact', head: true }).eq('equipment_type', TYPE)
  const { count: le } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true }).eq('tag', 'ZZ-RULE-1')
  check((lr ?? 0) === 0 && (le ?? 0) === 0,
    `self-clean: ${lr ?? 0} rules, ${le ?? 0} fixture units left`)
}

console.log('\n' + '='.repeat(64))
console.log(fail === 0
  ? `PASS — rules: specificity ordered, overrides immune, re-application idempotent. ${pass} checks.`
  : `FAIL — ${fail} of ${pass + fail} checks failed.`)
process.exit(fail === 0 ? 0 : 1)
