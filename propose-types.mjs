// propose-types — the type-assignment sweep (nameplate campaign, item 5).
//
//   node --env-file=.env propose-types.mjs <com_number>
//   node --env-file=.env propose-types.mjs <com_number> --dry-run
//
// 461 of 834 units have no equipment_type, so they render identity only and none
// of the def sets seeded for them. This proposes assignments from each unit's own
// DESCRIPTOR, using the SAME all-words matcher the B1 Excel path uses — not a
// second implementation, because two matchers are two sets of rules that drift,
// and separating RADIANT CEILING PANEL from RECEPTACLE PANEL is the kind of thing
// you get right once.
//
// NO MODEL IS INVOLVED. A descriptor is text the engineer already wrote; matching
// it against a fixed vocabulary is a solved problem, and paying tokens for it
// would make a reproducible answer probabilistic.
//
// NOTHING IS ASSIGNED. Proposals land in equipment_type_proposals for the review
// screen. A type decides which nameplate a unit gets and which applicability
// rules reach it — it is a claim about what a thing IS.
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const com = process.argv[2]
const dry = process.argv.includes('--dry-run')
if (!com) {
  console.error('usage: node --env-file=.env propose-types.mjs <com_number> [--dry-run]')
  process.exit(1)
}

execFileSync('npx', ['esbuild', 'src/lib/intakeExcel.ts',
  // --outbase pins the output path. Without it esbuild derives it from the
// COMMON ANCESTOR of the entry points, so one file lands at
// dist-test/intakeExcel.js and two land at dist-test/src/lib/... — and an
// import written for one shape silently picks up a stale artifact from the
// other. That is a build system quietly serving yesterday's code.
  '--format=esm', '--platform=node', '--outdir=dist-test', '--outbase=.',
  '--log-level=error'],
  { stdio: 'inherit', shell: process.platform === 'win32' })
const { resolveType } = await import('./dist-test/src/lib/intakeExcel.js')

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

// Resolve and refuse — the guard every importer here carries.
const { data: proj } = await svc.from('projects')
  .select('id, name, com_number').eq('com_number', com).maybeSingle()
if (!proj) { console.error(`REFUSING: no project with com_number ${com}`); process.exit(1) }
console.log(`target: ${proj.name} (${proj.com_number})${dry ? '  [DRY RUN]' : ''}\n`)

const { data: vocab } = await svc.from('equipment_types')
  .select('key, name').eq('active', true).order('key')
const { data: units } = await svc.from('equipment')
  .select('id, tag, descriptor, category')
  .eq('project_id', proj.id).is('equipment_type', null).order('category').order('tag')

if (!units?.length) { console.log('No untyped units. Nothing to propose.'); process.exit(0) }
console.log(`${units.length} untyped units · ${vocab.length} types in the vocabulary\n`)

const runId = randomUUID()
const rows = []
let unresolved = 0

for (const u of units) {
  // DESCRIPTOR FIRST, CATEGORY SECOND, TAG NEVER. Law 8: on one project RP was a
  // radiant panel on the mechanical drawings and a receptacle panel on the
  // electrical. The category is weaker evidence than the descriptor because it
  // is a source HEADER — often one header over many equipment classes, which is
  // exactly what the Seneca AHU split had to unpick.
  const fromDesc = u.descriptor ? resolveType(u.descriptor, vocab) : null
  const fromCat  = !fromDesc && u.category ? resolveType(u.category, vocab) : null
  const type = fromDesc ?? fromCat
  const observed = u.descriptor || u.category || null

  let confidence, rationale
  if (fromDesc) {
    confidence = 0.95
    rationale = `descriptor "${u.descriptor}" matches ${type} on every word of the type name`
  } else if (fromCat) {
    confidence = 0.7
    rationale = `no match on the descriptor; category "${u.category}" matches ${type}. ` +
                `A category is a source header and may cover several classes — read this one.`
  } else {
    confidence = 0.2
    rationale = observed
      ? `nothing in "${observed}" matches a type in the vocabulary`
      : `this unit has neither a descriptor nor a category to match on`
    unresolved++
  }

  rows.push({
    project_id: proj.id, equipment_id: u.id, run_id: runId,
    proposed_type: type, observed_name: type ? null : observed,
    confidence, rationale,
  })
}

const byType = {}
for (const r of rows) { const k = r.proposed_type ?? '(unresolved)'; byType[k] = (byType[k] ?? 0) + 1 }
for (const [k, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`)
}
const high = rows.filter(r => r.confidence >= 0.85).length
console.log(`\n${high} at 0.95 (descriptor match) · ${rows.length - high - unresolved} at 0.70 ` +
            `(category only) · ${unresolved} unresolved`)

if (dry) { console.log('\n--dry-run: nothing written.'); process.exit(0) }

// Clear this project's live proposals and re-propose. A stale proposal from an
// earlier run is worse than none: it describes a register that has since moved.
await svc.from('equipment_type_proposals')
  .delete().eq('project_id', proj.id).eq('status', 'proposed')
const { error } = await svc.from('equipment_type_proposals').insert(rows)
if (error) { console.error('insert failed:', error.message); process.exit(1) }

// ── UNKNOWNS GO TO THE RATIFICATION QUEUE, deduped ──────────────────────────
// Clairlea is 50 Wall Fin and 30 Convector — real hydronic emitters with no type
// in the firm vocabulary. That is not a matcher failure, it is the vocabulary
// being incomplete, and the answer is to put the NAMES in front of a human
// rather than force them into the nearest existing type. Minting is a
// ratification, never a side effect of a sweep.
const unknownNames = [...new Set(rows.filter(r => !r.proposed_type && r.observed_name)
                                     .map(r => r.observed_name))]
let queued = 0
if (unknownNames.length) {
  const { data: have } = await svc.from('proposed_equipment_types')
    .select('observed_name').eq('project_id', proj.id).eq('status', 'proposed')
  const seen = new Set((have ?? []).map(h => h.observed_name.toUpperCase()))
  const fresh = unknownNames.filter(n => !seen.has(n.toUpperCase()))
  if (fresh.length) {
    const { error: qErr } = await svc.from('proposed_equipment_types').insert(
      fresh.map(n => ({
        project_id: proj.id, observed_name: n, status: 'proposed',
        evidence: { source: 'type-sweep', run: runId, project: proj.com_number,
                    units: rows.filter(r => r.observed_name === n).length },
      })))
    if (qErr) console.error('type queue:', qErr.message)
    else queued = fresh.length
  }
}

console.log(`\n${rows.length} proposals written \u00b7 ${queued} new type name(s) queued ` +
            `for ratification. NOTHING ASSIGNED, NOTHING MINTED.`)
