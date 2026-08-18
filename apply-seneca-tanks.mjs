// apply-seneca-tanks.mjs — act 2 of the Seneca register cleanup, owner-ruled
// 2026-08-17: the held half, released. [RIVET]
//
//   node --env-file=.env apply-seneca-tanks.mjs            (DRY RUN)
//   node --env-file=.env apply-seneca-tanks.mjs --apply
//
// RULED ORDER (option a, amended): the two PENDING category-scoped exception
// proposals rename in place FIRST (their meaning preserved, the move noted on
// each rationale so the ratifier sees the string moved and why), THEN the
// equipment rows — sequenced so no instant exists where a proposal names a
// category no row carries. Then DHU-01's water-cooled qualifier moves from
// the act-1 batch note onto its descriptor, verbatim ("descriptor" — the
// document's own qualifier finding its ruled home, not invention).
// PUMPS (30 units, plural) seen and deliberately left, noted in the batch.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials } from './pw-config.mjs'

const APPLY = process.argv.includes('--apply')
const PROJECT = 'Seneca Health and Wellness Center'

const TANKS = [
  { from: 'BUFFER TANK SCHEDULE',    to: 'BUFFER TANK',    expect: 2 },
  { from: 'EXPANSION TANK SCHEDULE', to: 'EXPANSION TANK', expect: 8 },
]

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: aErr } = await adm.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }

try {
  const { data: proj } = await adm.from('projects').select('id, name').eq('name', PROJECT).single()
  if (!proj) { console.error(`REFUSING: project "${PROJECT}" not found.`); process.exit(1) }

  // ── resolve-and-refuse: exactly one pending proposal per tank string, and
  // the row counts the ruling was made on ─────────────────────────────────────
  let refused = false
  for (const t of TANKS) {
    const { data: props } = await adm.from('cx_applicability_proposals')
      .select('id, rationale').eq('project_id', proj.id)
      .eq('equipment_category', t.from).eq('status', 'proposed')
    if ((props?.length ?? 0) !== 1) {
      console.error(`REFUSING: expected exactly 1 pending proposal naming "${t.from}", found ${props?.length ?? 0}.`)
      refused = true
    } else t.proposal = props[0]
    const { count } = await adm.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', t.from)
    t.actual = count ?? 0
    if (t.actual !== t.expect) {
      console.error(`REFUSING: "${t.from}" holds ${t.actual} unit(s), ruling expected ${t.expect}.`)
      refused = true
    }
  }
  const { data: dhu } = await adm.from('equipment')
    .select('id, descriptor, category').eq('project_id', proj.id).eq('tag', 'DHU-01').single()
  if (!dhu || dhu.category !== 'DEHUMIDIFICATION UNIT' || dhu.descriptor !== null) {
    console.error(`REFUSING: DHU-01 moved — category "${dhu?.category}", descriptor ${JSON.stringify(dhu?.descriptor)} (expected DEHUMIDIFICATION UNIT / null).`)
    refused = true
  }
  if (refused) process.exit(1)

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN — nothing will be written'} · ${proj.name}\n`)
  for (const t of TANKS) console.log(`  proposal ${t.proposal.id.slice(0, 8)}… "${t.from}" → "${t.to}", then ${t.actual} row(s)`)
  console.log(`  DHU-01 descriptor: null → "Water Cooled"`)
  console.log(`  PUMPS (30 units, plural): seen, deliberately left — noted in the batch`)

  if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0) }

  // ── 1. proposals rename in place, noted for the ratifier ──────────────────
  for (const t of TANKS) {
    const note = ` [Category renamed "${t.from}" → "${t.to}" by the owner-ruled register cleanup, 2026-08-17. Scope unchanged — same ${t.expect} unit(s).]`
    const { data: done, error } = await adm.from('cx_applicability_proposals')
      .update({ equipment_category: t.to, rationale: (t.proposal.rationale ?? '') + note })
      .eq('id', t.proposal.id).select('id')
    if (error || (done ?? []).length !== 1) {
      console.error(`  proposal update FAILED for "${t.from}": ${error?.message ?? '0 rows'}`); process.exit(1)
    }
  }

  // ── 2. the rows ───────────────────────────────────────────────────────────
  for (const t of TANKS) {
    const { data: done, error } = await adm.from('equipment')
      .update({ category: t.to }).eq('project_id', proj.id).eq('category', t.from).select('id')
    if (error || (done ?? []).length !== t.expect) {
      console.error(`  row rename FAILED for "${t.from}": ${error?.message ?? `${done?.length ?? 0}/${t.expect} rows`}`); process.exit(1)
    }
  }

  // ── 3. the qualifier's ruled home ─────────────────────────────────────────
  const { data: dhuDone, error: dhuErr } = await adm.from('equipment')
    .update({ descriptor: 'Water Cooled' }).eq('id', dhu.id).select('id')
  if (dhuErr || (dhuDone ?? []).length !== 1) {
    console.error(`  DHU-01 descriptor FAILED: ${dhuErr?.message ?? '0 rows'}`); process.exit(1)
  }

  const { error: bErr } = await adm.from('import_batches').insert({
    project_id: proj.id, entity_type: 'equipment',
    source_file: 'register category cleanup, act 2 (no source document)',
    source_revision: 'owner-ruled 2026-08-17 — held half released',
    rows_expected: 11, rows_created: 11,
    note: 'CATEGORY CLEANUP ACT 2: the two pending category-scoped applicability exceptions renamed in ' +
      'place FIRST (BUFFER TANK SCHEDULE → BUFFER TANK, EXPANSION TANK SCHEDULE → EXPANSION TANK; move ' +
      'noted on each rationale, scope unchanged), then the 10 equipment rows — sequenced so no instant ' +
      'existed where a proposal named a category no row carries. DHU-01 descriptor set to "Water Cooled" ' +
      'verbatim from the act-1 batch note (the qualifier’s ruled home). PUMPS (30 units, plural name) ' +
      'seen and DELIBERATELY LEFT — singular-vs-plural firm-wide is parked on the owner’s convention list.',
  })
  if (bErr) { console.error(`batch record FAILED: ${bErr.message}`); process.exit(1) }

  // ── read-back: both sides agree ───────────────────────────────────────────
  let bad = 0
  for (const t of TANKS) {
    const { data: p } = await adm.from('cx_applicability_proposals')
      .select('equipment_category').eq('id', t.proposal.id).single()
    const { count: oldLeft } = await adm.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', t.from)
    const { count: nowHave } = await adm.from('equipment').select('id', { count: 'exact', head: true })
      .eq('project_id', proj.id).eq('category', t.to)
    const ok = p?.equipment_category === t.to && oldLeft === 0 && nowHave === t.expect
    console.log(`  ${ok ? 'OK ' : 'BAD'} ${t.to}: proposal="${p?.equipment_category}", old rows ${oldLeft}, new rows ${nowHave}`)
    if (!ok) bad++
  }
  const { data: dhuAfter } = await adm.from('equipment').select('descriptor').eq('id', dhu.id).single()
  const dhuOk = dhuAfter?.descriptor === 'Water Cooled'
  console.log(`  ${dhuOk ? 'OK ' : 'BAD'} DHU-01 descriptor: "${dhuAfter?.descriptor}"`)
  if (!dhuOk) bad++

  console.log(`\nAPPLIED: 2 proposals + 10 rows + 1 descriptor · batch noted · ${bad === 0 ? 'read-back clean, both sides agree' : `${bad} READ-BACK FAILURES`}`)
  if (bad) process.exit(1)
} finally {
  await adm.auth.signOut().catch(() => {})
}
