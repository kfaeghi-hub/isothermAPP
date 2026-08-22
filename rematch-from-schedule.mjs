// rematch-from-schedule — land newly-bridgeable readings from a project's
// verbatim from_schedule into its declared fields. [KEEL] Built to
// docs/REMATCH-DESIGN-NOTE.md; first act ruled 2026-08-19 (Central Tech).
//
//   node --env-file=.env rematch-from-schedule.mjs --project <uuid> [--type k]
//   node --env-file=.env rematch-from-schedule.mjs --project <uuid> --apply
//
// THE PROBLEM IT EXISTS FOR. A heading unmatched at approval stays unmatched
// forever, even after the vocabulary learns its name. The unit-normalization
// whitelist made ~30 Central Tech readings bridgeable that were refused at
// their approval solely on unit-string case (L/S vs L/s).
//
// MECHANISM: the SAME matcher approval runs, over from_schedule, using the
// project's own declared fields (sovereign project defs first, firm defs as
// fallback — exactly as the approve path resolves them).
//
// SAFETY, as designed and argued in the note:
//   · ADDITIVE ONLY — a declared field holding ANY value is skipped.
//     Present-means-untouchable subsumes edited-values-skipped without needing
//     an edit ledger nameplate_extra does not have. The pass can only fill
//     blanks.
//   · IDEMPOTENT BY CONSTRUCTION — a second run finds its own writes present
//     and lands zero candidates.
//   · from_schedule IS NEVER MODIFIED. It is the verbatim document record that
//     makes the pass possible at all.
//   · DRY RUN IS THE DEFAULT. --apply is the deliberate act.
//   · ONE PROJECT PER INVOCATION, named by id. No fleet mode exists.
//   · ATTRIBUTED — an import_batches row per applied run carrying the counts,
//     the arithmetic, and the MATCHER COMMIT, so a landed value traces to the
//     vocabulary revision that produced it.
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { build } from 'esbuild'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('rematch-from-schedule')

const flag = (k) => {
  const eq = process.argv.find(a => a.startsWith(`--${k}=`))
  if (eq) return eq.split('=').slice(1).join('=')
  const i = process.argv.indexOf(`--${k}`)
  if (i >= 0) {
    const next = process.argv[i + 1]
    if (next && !next.startsWith('--')) return next
  }
  return null
}
const PROJECT = flag('project')
const ONLY_TYPE = flag('type')
const APPLY = process.argv.includes('--apply')

if (!PROJECT || !/^[0-9a-f-]{36}$/i.test(PROJECT)) {
  console.error('usage: --project <uuid> [--type <key>] [--apply]')
  process.exit(1)
}

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── resolve and refuse (ops law) ────────────────────────────────────────────
const { data: proj, error: pErr } = await svc.from('projects')
  .select('id, name, unit_system').eq('id', PROJECT).maybeSingle()
if (pErr || !proj) {
  console.error(`REFUSING: no project ${PROJECT}${pErr ? ` (${pErr.message})` : ''}`)
  process.exit(1)
}

const MATCHER_COMMIT = execSync('git log -1 --format=%h -- api/_shared/schedule-field-match.ts',
  { encoding: 'utf8' }).trim()

await build({
  entryPoints: ['api/_shared/schedule-field-match.ts'], outfile: 'out/rfs-matcher.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
})
const { matchScheduleSpec } = await import('./out/rfs-matcher.mjs')

console.log(`project : ${proj.name} (${proj.unit_system})`)
console.log(`matcher : schedule-field-match @ ${MATCHER_COMMIT}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY RUN'}${ONLY_TYPE ? ` · type=${ONLY_TYPE}` : ''}`)
console.log('')

// declared fields: the project's own copy first, firm defs as fallback
const declaredCache = new Map()
async function declaredFor(type) {
  if (declaredCache.has(type)) return declaredCache.get(type)
  let defs = []
  const { data: projDefs } = await svc.from('project_equipment_field_defs')
    .select('field_name, unit').eq('project_id', proj.id)
    .eq('equipment_type', type).eq('section', 'spec')
  if (projDefs && projDefs.length) defs = projDefs
  else {
    const { data: firm } = await svc.from('equipment_type_field_defs')
      .select('field_name, unit, unit_imperial').eq('equipment_type', type).eq('section', 'spec')
    const imperial = proj.unit_system === 'imperial'
    defs = (firm ?? []).map(d => ({
      field_name: d.field_name,
      unit: imperial ? (d.unit_imperial ?? d.unit) : d.unit,
    }))
  }
  declaredCache.set(type, defs)
  return defs
}

let q = svc.from('equipment').select('id, tag, equipment_type, nameplate_extra')
  .eq('project_id', proj.id).order('tag').limit(5000)
if (ONLY_TYPE) q = q.eq('equipment_type', ONLY_TYPE)
const { data: eq } = await q

const tally = { units: 0, wrote: 0, converted: 0, compound: 0, occupied: 0, mismatch: 0, unmatched: 0 }
const conversions = []
const stranded = new Map()
const writes = []

for (const e of eq ?? []) {
  const fs = e.nameplate_extra && e.nameplate_extra.from_schedule
  if (!fs || !e.equipment_type) continue
  tally.units++
  const spec = { ...((e.nameplate_extra && e.nameplate_extra.spec) ?? {}) }
  const declared = await declaredFor(e.equipment_type)
  const verdicts = matchScheduleSpec(fs, declared)
  const landed = []
  for (const m of verdicts) {
    const landable = (m.kind === 'exact' || m.kind === 'converted' || m.kind === 'compound')
      && m.field && m.value != null
    if (!landable) {
      if (m.kind === 'unit-mismatch') {
        tally.mismatch++
        const k = `unit unbridgeable → ${m.field}`
        stranded.set(k, (stranded.get(k) ?? 0) + 1)
      } else {
        tally.unmatched++
        const k = `no field claims it: ${m.header}`
        stranded.set(k, (stranded.get(k) ?? 0) + 1)
      }
      continue
    }
    // PRESENT MEANS UNTOUCHABLE — the whole safety argument, in one branch
    if (String(spec[m.field] ?? '').trim() !== '') {
      tally.occupied++
      const k = `field already holds a value → ${m.field}`
      stranded.set(k, (stranded.get(k) ?? 0) + 1)
      continue
    }
    spec[m.field] = m.value
    landed.push(m)
    if (m.kind === 'exact') tally.wrote++
    else if (m.kind === 'compound') tally.compound++
    else { tally.converted++; conversions.push(`${e.tag}: ${m.note}`) }
  }
  if (landed.length) {
    writes.push({ id: e.id, tag: e.tag, type: e.equipment_type, spec })
    console.log(`${e.tag} (${e.equipment_type})`)
    for (const l of landed) {
      const extra = l.kind === 'converted' ? `   [${l.note}]`
        : l.kind === 'compound' ? '   [compound part]' : ''
      console.log(`   ${l.header}  →  ${l.field} = ${JSON.stringify(l.value)}${extra}`)
    }
  }
}

const wouldLand = tally.wrote + tally.converted + tally.compound
console.log('')
console.log('='.repeat(66))
console.log(`units with from_schedule : ${tally.units}`)
console.log(`WOULD LAND               : ${wouldLand} readings across ${writes.length} unit(s)`)
console.log(`   as-is                 : ${tally.wrote}`)
console.log(`   converted             : ${tally.converted}`)
console.log(`   compound parts        : ${tally.compound}`)
console.log(`STAY STRANDED            : ${tally.occupied + tally.mismatch + tally.unmatched}`)
console.log(`   field already holds   : ${tally.occupied}   (present means untouchable)`)
console.log(`   unit unbridgeable     : ${tally.mismatch}`)
console.log(`   no field claims it    : ${tally.unmatched}`)
console.log('')
console.log('top stranded reasons:')
for (const [r, n] of [...stranded].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`   ${String(n).padStart(4)}  ${r}`)
}

if (!APPLY) {
  console.log('')
  console.log('Nothing was written. Re-run with --apply.')
  process.exit(0)
}
if (!writes.length) {
  console.log('')
  console.log('Nothing to apply.')
  process.exit(0)
}

// ── the act ────────────────────────────────────────────────────────────────
const note = `from_schedule re-match @ matcher ${MATCHER_COMMIT} — `
  + `${tally.wrote} as-is, ${tally.converted} converted, ${tally.compound} compound part(s) `
  + `across ${writes.length} unit(s); ${tally.occupied} skipped (field already held a value). `
  + (conversions.length ? `Arithmetic: ${conversions.slice(0, 8).join('; ')}` : '')

const { data: batch, error: bErr } = await svc.from('import_batches').insert({
  project_id: proj.id, entity_type: 'equipment', source_file: 'from_schedule re-match',
  rows_expected: writes.length, rows_created: 0, note,
}).select('id').single()
if (bErr) { console.error(`provenance refused: ${bErr.message}`); process.exit(1) }

let done = 0
for (const w of writes) {
  // re-read immediately before writing: from_schedule and every other section
  // are carried forward untouched; only `spec` is replaced.
  const { data: cur } = await svc.from('equipment').select('nameplate_extra').eq('id', w.id).single()
  const next = { ...((cur && cur.nameplate_extra) ?? {}), spec: w.spec }
  const { error } = await svc.from('equipment')
    .update({ nameplate_extra: next, import_batch_id: batch.id }).eq('id', w.id)
  if (error) { console.error(`  !! ${w.tag}: ${error.message}`); continue }
  done++
}
await svc.from('import_batches').update({ rows_created: done }).eq('id', batch.id)
console.log('')
console.log(`APPLIED — ${done}/${writes.length} unit(s) updated · batch ${batch.id}`)
console.log(note)
