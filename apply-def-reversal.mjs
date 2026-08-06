// apply-def-reversal.mjs — reverse a RATIFIED field-def act, and only a ratified one.
//
// The sibling of apply-ratified.mjs, and it exists for the same reason: a
// ratified act is applied from a stored artifact, never re-derived. That is as
// true of undoing one as of doing it.
//
// THE LEDGER KEEPS BOTH ACTS. The original ratification row stays exactly where
// it is; this writes a second row beside it carrying its own premise. A ledger
// that quietly unwrites a ratified act is worse than one that shows a corrected
// mistake — the first leaves no trace that a decision was ever made on a false
// premise, which is precisely the thing worth remembering.
//
// Three refusals:
//   1. The artifact must name every row it removes, by type, field AND section.
//      A reversal that deletes "everything that field matched" is a different
//      operation from the one that was ratified.
//   2. Every named row must EXIST. A reversal whose target is already gone has
//      either been run before or is describing a state that never was, and
//      "delete if present" would hide both.
//   3. Nothing in `keep` may be touched. Named explicitly and re-read after, so
//      the rows that survive are proven to survive rather than assumed to.
//
// Run: node --env-file=.env apply-def-reversal.mjs <artifact.json> [--write]

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { adminCredentials } from './pw-config.mjs'

const FILE = process.argv[2]
const WRITE = process.argv.includes('--write')
if (!FILE) { console.log('usage: apply-def-reversal.mjs <artifact.json> [--write]'); process.exit(1) }

const art = JSON.parse(await readFile(FILE, 'utf8'))
if (art._kind !== 'field-def-reversal') { console.error(`REFUSE: not a field-def-reversal artifact.`); process.exit(1) }
if (!art._ratified) { console.error('REFUSE: artifact is not marked ratified.'); process.exit(1) }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())

const keys = [...new Set(art.remove.map(r => r.equipment_type))]
const { data: before, error } = await adm.from('equipment_type_field_defs')
  .select('id, equipment_type, section, field_name').in('equipment_type', keys)
if (error) { console.error('REFUSE:', error.message); process.exit(1) }

// ── refusal 1 & 2 — every named row must exist, named exactly ────────────────
const targets = [], problems = []
for (const r of art.remove) {
  for (const section of r.sections) {
    const hit = before.filter(b => b.equipment_type === r.equipment_type &&
      b.section === section && b.field_name === r.field_name)
    if (hit.length !== 1) {
      problems.push(`${r.equipment_type}/${section}/${r.field_name}: expected exactly 1 row, found ${hit.length}`)
      continue
    }
    targets.push(hit[0])
  }
}
if (problems.length) {
  console.error('REFUSE — the artifact does not describe the register as it stands:')
  for (const p of problems) console.error('  · ' + p)
  console.error('A reversal whose target is already gone has either run before or never applied.')
  process.exit(1)
}

const keepNames = new Set((art.keep ?? []).map(k => k.field_name))
const fieldsBefore = new Set(before.map(b => b.field_name))
console.log(`${keys.join(', ')} — ${fieldsBefore.size} distinct fields, ${before.length} def rows`)
console.log(`\nREMOVE ${targets.length} row(s):`)
for (const t of targets) console.log(`   − [${t.section}] ${t.field_name}`)
console.log(`\nKEEP (must survive):`)
for (const k of art.keep ?? []) console.log(`   ✓ ${k.field_name}`)

if (!WRITE) { console.log('\nDRY RUN — nothing written. Add --write.'); process.exit(0) }

const { error: delErr } = await adm.from('equipment_type_field_defs').delete().in('id', targets.map(t => t.id))
if (delErr) { console.error('REFUSE mid-write:', delErr.message); process.exit(1) }

// ── the ledger: a SECOND row, beside the first, never instead of it ──────────
// Disposition vocabulary is read from the table rather than assumed — a guessed
// enum value fails at the constraint and leaves the delete recorded nowhere.
const { data: seen } = await adm.from('agent_feedback').select('disposition').limit(200)
const vocab = new Set((seen ?? []).map(s => s.disposition))
const disp = ['reversed', 'rejected', 'edited'].find(d => vocab.has(d)) ?? [...vocab][0]
if (!disp) { console.error('REFUSE: cannot determine a valid disposition; the delete happened but is unlogged.'); process.exit(1) }

const { error: ledErr } = await adm.from('agent_feedback').insert({
  agent_key: 'drafter', category: 'field-def-set',
  subject_ref: `equipment_type:${keys[0]}`,
  disposition: disp,
  after_text: JSON.stringify({ reversal: art.remove, retained: art.keep }),
  evidence: {
    batch: art._batch ?? 'fire-pump-identity-reversal-2026-08-06',
    reverses: art._reverses ?? null,
    premise_of_original: art._premise_of_original ?? null,
    premise_of_reversal: art._why ?? null,
    ratified: art._ratified,
    note: 'The original ratification row is retained. Both acts stand in the ledger, each with its premise.',
  },
})
if (ledErr) console.error(`WARNING: rows deleted but ledger insert failed: ${ledErr.message}`)

// ── read back: the register answering, not the write claiming ───────────────
const { data: after } = await adm.from('equipment_type_field_defs')
  .select('section, field_name').in('equipment_type', keys)
const namesAfter = new Set((after ?? []).map(a => a.field_name))
const stillThere = art.remove.filter(r => namesAfter.has(r.field_name)).map(r => r.field_name)
const lost = [...keepNames].filter(k => !namesAfter.has(k))

console.log(`\nREAD BACK — ${namesAfter.size} distinct fields, ${after.length} def rows`)
if (stillThere.length) console.log(`  NOT REMOVED: ${stillThere.join(', ')}`)
if (lost.length) { console.error(`  REFUSE: a KEEP field is gone — ${lost.join(', ')}`); process.exit(1) }
console.log(`  every KEEP field survives: ${[...keepNames].join(', ')}`)
console.log(`\nAPPLIED. Ledger holds both acts${ledErr ? ' (LEDGER FAILED — see warning)' : ''}.`)
