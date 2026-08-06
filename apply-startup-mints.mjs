// Apply the ratified Start-Up mint table. APPLY ONLY — it reads the stored
// artifact and writes exactly what is in it.
//
// Ratification binds to an artifact. This file cannot draft, cannot infer a key,
// and cannot mint anything the artifact does not name. If the artifact and the
// database disagree about what already exists, it says so and stops rather than
// reconciling on its own initiative.
//
// Run: node --env-file=.env apply-startup-mints.mjs [--write]

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const write = process.argv.includes('--write')
// The artifact is an ARGUMENT, so one applier serves every ratified mint table
// rather than a copy per batch drifting apart.
const ART = process.argv.find(a => a.endsWith('.json')) ?? 'proposals/startup-mints-ratified.json'
const a = JSON.parse(readFileSync(ART, 'utf8'))
if (a._kind !== 'equipment-type-mint-ratification' || !a._ratified_by) {
  console.error('REFUSE: not a ratified mint artifact'); process.exit(1)
}

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const { data: existing, error } = await svc.from('equipment_types').select('key, name, sort_order')
if (error) { console.error('REFUSE:', error.message); process.exit(1) }
const have = new Map(existing.map(r => [r.key, r]))
const maxSort = Math.max(0, ...existing.map(r => r.sort_order ?? 0))

console.log(`${ART}\nratified by ${a._ratified_by} on ${a._ratified_on}`)
console.log(`register holds ${have.size} types\n`)

const toMint = []
for (const m of a.mint) {
  if (have.has(m.key)) { console.log(`  already present, skipping: ${m.key}`); continue }
  toMint.push(m)
}
// The MAP and LEAVE rows write nothing — they are the reasoning, recorded with
// the ruling so a future session can see what was decided NOT to mint and why.
console.log(`  kind: ${a.kind ?? 'equipment'}`)
 console.log(`  mint: ${toMint.length} of ${a.mint.length}`)
console.log(`  map:  ${(a.map ?? []).length} (no writes — recorded reasoning)`)
console.log(`  leave:${(a.leave ?? []).length} (no writes — recorded reasoning)\n`)

if (!toMint.length) { console.log('nothing to do'); process.exit(0) }
for (const m of toMint) console.log(`    ${m.key.padEnd(20)} ${m.name}   [${m.discipline}]`)

if (!write) { console.log('\nDRY RUN — pass --write to apply.'); process.exit(0) }

// kind comes from the ARTIFACT, defaulting to equipment. A system type minted
  // as equipment would attach templates that then render a nameplate grid for a
  // thing with no nameplate — the exact wrongness the targeting guard exists for.
  const kind = a.kind ?? 'equipment'
  const rows = toMint.map((m, i) => ({ key: m.key, name: m.name, kind, sort_order: maxSort + 1 + i, active: true }))
const { error: insErr } = await svc.from('equipment_types').insert(rows)
if (insErr) { console.error('REFUSE:', insErr.message); process.exit(1) }

// ASSERT THE ARRIVAL, not the absence of an error. An insert that silently
// wrote nothing and an insert that wrote everything both return no error.
const { data: after } = await svc.from('equipment_types').select('key')
const now = new Set((after ?? []).map(r => r.key))
const missing = toMint.filter(m => !now.has(m.key))
if (missing.length) {
  console.error(`REFUSE: ${missing.length} type(s) did not arrive: ${missing.map(m => m.key).join(', ')}`)
  process.exit(1)
}
console.log(`\nminted ${toMint.length}; register now holds ${now.size} types`)
