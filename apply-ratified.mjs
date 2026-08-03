// apply-ratified.mjs — write a RATIFIED batch, and only a ratified batch.
//
//   node --env-file=.env apply-ratified.mjs proposals/batch-1-ratified.json
//   node --env-file=.env apply-ratified.mjs proposals/batch-1-ratified.json --write
//
// THIS EXISTS BECAUSE `draft-batch.mjs --apply` RE-RAN THE DRAFTER.
//
// The apply path called the model a second time and wrote whatever came back.
// The model is not deterministic, so what landed in the database was NOT what
// the owner had read and approved: one type gained a field that was never in the
// ratified table, another lost one, and the token counts differed. 185 def rows
// and 10 ledger rows were written un-ratified and had to be reversed.
//
// The rule this file enforces: **ratification names a specific artifact, and the
// write applies THAT ARTIFACT.** Drafting and applying are separate acts on a
// stored proposal, never one command that does both — because a second call to a
// model is a second answer, and "apply what I approved" cannot be expressed as
// "ask again".
//
// It therefore makes NO model call at all. If this file needs the network for
// anything but the insert, it is wrong.
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { adminCredentials } from './pw-config.mjs'

const FILE = process.argv[2]
const WRITE = process.argv.includes('--write')
if (!FILE) { console.log('usage: apply-ratified.mjs <proposal.json> [--write]'); process.exit(1) }

const proposal = JSON.parse(await readFile(FILE, 'utf8'))
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())

// ── refuse to apply against a moved target ──────────────────────────────────
// The proposal records how many fields each type had WHEN IT WAS DRAFTED. If a
// type has changed since, the enrichment was computed against a different table
// and "additive only" is no longer a claim anyone checked.
const problems = []
for (const t of proposal.types) {
  const { data } = await adm.from('equipment_type_field_defs')
    .select('field_name').eq('equipment_type', t.type_key)
  const names = new Set((data ?? []).map(d => d.field_name))
  if (names.size !== t.existing_field_count) {
    problems.push(`${t.type_key}: had ${t.existing_field_count} fields when drafted, has ${names.size} now`)
  }
  const collide = t.fields.filter(f => names.has(f.field_name)).map(f => f.field_name)
  if (collide.length) problems.push(`${t.type_key}: would duplicate ${collide.join(', ')}`)
}
if (problems.length) {
  console.log('REFUSING — the target moved since ratification:')
  for (const p of problems) console.log(`  ${p}`)
  process.exit(1)
}

let rowCount = 0
for (const t of proposal.types) {
  rowCount += t.fields.reduce((n, f) => n + f.sections.length, 0)
  console.log(`  ${t.type_key.padEnd(18)} ${t.existing_field_count} existing + ${t.fields.length} ratified`)
}
console.log(`\n  ${proposal.types.length} types · ${rowCount} def rows`)

if (!WRITE) { console.log('  DRY RUN — nothing written. Add --write.'); process.exit(0) }

let wrote = 0
for (const t of proposal.types) {
  const rows = t.fields.flatMap((f, i) => f.sections.map(section => ({
    equipment_type: t.type_key, section,
    field_name: f.field_name,
    unit: f.unit ?? null,
    unit_imperial: f.unit_imperial ?? null,
    // Enriched rows sort AFTER the existing table rather than interleaving: a
    // CxA who knows where a field sits should still find it there.
    sort_order: t.existing_field_count + i + 1,
  })))
  const { error } = await adm.from('equipment_type_field_defs').insert(rows)
  if (error) { console.log(`  FAILED ${t.type_key}: ${error.message}`); continue }

  // Ledger-fed per category — this IS an agent-originated proposal, so it feeds
  // agent_feedback and the health view. The anchor rides as evidence, because
  // "why this field?" should be answerable from the ledger row alone.
  await adm.from('agent_feedback').insert({
    agent_key: 'drafter', category: 'field-def-set',
    subject_ref: `equipment_type:${t.type_key}`,
    disposition: 'accepted',
    after_text: JSON.stringify(t.fields),
    evidence: { standards_anchor: t.standards_anchor, batch: proposal.batch, ratified: proposal.ratified },
  })
  wrote += rows.length
}

// READ BACK. "Inserted" is a claim about the write; this is the register answering.
const after = []
for (const t of proposal.types) {
  const { data } = await adm.from('equipment_type_field_defs')
    .select('field_name').eq('equipment_type', t.type_key)
  const names = new Set((data ?? []).map(d => d.field_name))
  const missing = t.fields.filter(f => !names.has(f.field_name)).map(f => f.field_name)
  after.push({ key: t.type_key, fields: names.size, missing })
}
console.log(`\n  WROTE ${wrote} def rows.`)
for (const a of after) {
  console.log(`  ${a.key.padEnd(18)} ${String(a.fields).padStart(2)} fields${a.missing.length ? `  MISSING: ${a.missing.join(', ')}` : ''}`)
}
const bad = after.filter(a => a.missing.length).length
console.log(bad ? `\n  ${bad} type(s) did not land fully — investigate before proceeding.`
                : `\n  Every ratified field is present. Nothing else changed.`)
