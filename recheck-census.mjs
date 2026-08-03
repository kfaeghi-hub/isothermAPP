// recheck-census.mjs — the retroactive re-check, ruled 2026-08-03.
//
//   node --env-file=.env recheck-census.mjs            (DIFF ONLY — writes nothing)
//   node --env-file=.env recheck-census.mjs --apply    (applies, batch-tagged)
//
// WHY THIS EXISTS. Minting `fire_pump`, `jockey_pump`, `sump_pump` and
// `lighting_panel` changes how EXISTING descriptors resolve. "FIRE PUMP" used to
// resolve to `pump` because "Pump" is one token and nothing more specific
// existed; now "Fire Pump" is two tokens and wins. That is a silent
// re-interpretation of 79 units unless someone looks — so this looks, shows the
// diff, and writes nothing until told to.
//
// IT USES THE SHARED MATCHER. `resolveTypeDetailed` is bundled out of
// src/lib/intakeExcel.ts with esbuild rather than reimplemented here. Two
// matchers would be two sets of rules that drift, and the law-8 separation of
// RADIANT CEILING PANEL from RECEPTACLE PANEL is the kind of thing you only get
// right once.
import { createClient } from '@supabase/supabase-js'
import { build } from 'esbuild'
import { writeFile, rm } from 'node:fs/promises'
import { adminCredentials } from './pw-config.mjs'

const APPLY = process.argv.includes('--apply')

// ── bundle the real matcher ─────────────────────────────────────────────────
const TMP = './.recheck-matcher.mjs'
await build({
  entryPoints: ['src/lib/intakeExcel.ts'],
  outfile: TMP, bundle: true, format: 'esm', platform: 'node',
  logLevel: 'silent',
  // xlsx is only needed by the workbook reader, not the matcher.
  external: ['xlsx'],
})
const { resolveTypeDetailed } = await import(new URL(TMP, import.meta.url).href)

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())

try {
  // ── the vocabulary, exactly as the app loads it ───────────────────────────
  const [{ data: types }, { data: aliasRows }] = await Promise.all([
    adm.from('equipment_types').select('key, name').eq('active', true).order('sort_order'),
    adm.from('equipment_type_aliases').select('type_key, alias'),
  ])
  const byKey = new Map()
  for (const a of aliasRows ?? []) {
    if (!byKey.has(a.type_key)) byKey.set(a.type_key, [])
    byKey.get(a.type_key).push(a.alias)
  }
  const vocab = (types ?? []).map(t => ({ ...t, aliases: byKey.get(t.key) ?? [] }))
  const name = k => vocab.find(t => t.key === k)?.name ?? k

  // ARRIVAL PROOF before any census. If the new types are not in the vocabulary
  // this script would report "no changes" and be telling the truth about a
  // vocabulary that was never loaded.
  const probe = resolveTypeDetailed('FIRE PUMP', vocab)
  if (probe?.key !== 'fire_pump') {
    throw new Error(`matcher/vocabulary not live: "FIRE PUMP" resolved to ${probe?.key ?? 'null'}, expected fire_pump`)
  }
  console.log(`  vocabulary: ${vocab.length} types, ${aliasRows?.length ?? 0} aliases`)
  console.log(`  arrival proof: "FIRE PUMP" -> ${probe.key} (via ${probe.via})\n`)

  // ── the units under review ────────────────────────────────────────────────
  const { data: units } = await adm.from('equipment')
    .select('id, project_id, tag, descriptor, equipment_type, projects(name)')
    .in('equipment_type', ['pump', 'panel'])
    .order('equipment_type')

  const changes = []
  const kept = []
  for (const u of units ?? []) {
    // The DESCRIPTOR is what the source document said. The tag never decides —
    // law 8, and the reason this whole vocabulary exists.
    const hit = u.descriptor ? resolveTypeDetailed(u.descriptor, vocab) : null
    if (hit && hit.key !== u.equipment_type) changes.push({ ...u, to: hit.key, via: hit.via, matched: hit.matched })
    else kept.push(u)
  }

  console.log(`  ${units?.length ?? 0} units reviewed (pump + panel)`)
  console.log(`  ${changes.length} would change · ${kept.length} unchanged\n`)

  if (changes.length) {
    const byMove = new Map()
    for (const c of changes) {
      const k = `${c.equipment_type} -> ${c.to}`
      if (!byMove.has(k)) byMove.set(k, [])
      byMove.get(k).push(c)
    }
    for (const [move, list] of [...byMove.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const [from, to] = move.split(' -> ')
      console.log(`  ${name(from)} -> ${name(to)}   (${list.length} unit${list.length === 1 ? '' : 's'})`)
      for (const c of list.slice(0, 8)) {
        console.log(`      ${(c.tag ?? '(no tag)').padEnd(14)} ${String(c.descriptor ?? '').slice(0, 46).padEnd(48)} [${c.projects?.name ?? '?'}]`)
      }
      if (list.length > 8) console.log(`      … and ${list.length - 8} more`)
      console.log('')
    }
  }

  if (!APPLY) {
    console.log('  DIFF ONLY — nothing written. Re-run with --apply to batch-tag and write.')
  } else if (changes.length) {
    // BATCH-TAGGED, so the whole move is one reversible fact rather than 79
    // untraceable edits. Provenance is import_batches, the mechanism for
    // human-ruled writes — the ledger stays clean because this is an owner
    // ruling, not an agent proposal.
    const projects = [...new Set(changes.map(c => c.project_id))]
    const batchByProject = new Map()
    for (const pid of projects) {
      const { data: b, error } = await adm.from('import_batches').insert({
        project_id: pid, entity_type: 'equipment',
        source_file: 'recheck-census.mjs (catalog campaign, ruled 2026-08-03)',
        note: 'Retroactive re-check of pump/panel units against the 26 catalog mints. ' +
              'Owner-ruled; the shared resolveTypeDetailed decided every row.',
        rows_expected: changes.filter(c => c.project_id === pid).length,
      }).select('id').single()
      if (error) throw new Error(`batch: ${error.message}`)
      batchByProject.set(pid, b.id)
    }

    let done = 0
    for (const c of changes) {
      const { error } = await adm.from('equipment')
        .update({ equipment_type: c.to, import_batch_id: batchByProject.get(c.project_id) })
        .eq('id', c.id)
      if (error) { console.log(`  FAILED ${c.tag}: ${error.message}`); continue }
      done++
    }
    for (const [pid, bid] of batchByProject) {
      await adm.from('import_batches').update({
        rows_created: changes.filter(c => c.project_id === pid).length,
      }).eq('id', bid)
    }

    // READ BACK. "Updated" is a claim about the write; this is the register
    // answering.
    const { data: after } = await adm.from('equipment')
      .select('equipment_type').in('id', changes.map(c => c.id))
    const stillOld = (after ?? []).filter(a => ['pump', 'panel'].includes(a.equipment_type)).length
    console.log(`  APPLIED: ${done}/${changes.length} written, ${batchByProject.size} batch(es).`)
    console.log(`  read-back: ${stillOld} of ${changes.length} still on the old type (expect 0)`)
  }
} finally {
  await rm(TMP, { force: true })
}
