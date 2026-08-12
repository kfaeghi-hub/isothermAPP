// verify-gate — Phase 4's gate. [KEEL]
//
//   node --env-file=.env verify-gate.mjs
//
// THE CLAIM BEING PROVEN: a seeded wrong value is caught and NAMED. Not "the
// verifier ran", not "it returned some checks" — a value that is not on the sheet
// comes back `contradicted`, with the cell, and with what the sheet actually says.
//
// It runs on the COMMITTED hostile fixture, so it needs no client documents and
// works on a fresh clone. Two real calls, a few cents, deliberately: a verifier
// proven only against a mock is a verifier proven against my own idea of a model.
//
// The negative half matters as much as the positive: a value that IS on the sheet
// must come back `supported`. A checker that says "contradicted" to everything
// would pass the first half of this gate and be worthless.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('verify-gate')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

await build({
  entryPoints: ['src/lib/intakeExcel.ts'], outfile: 'out/vg-intakeExcel.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error', external: ['read-excel-file'],
})
await build({
  entryPoints: ['api/_shared/verify-extraction.ts'], outfile: 'out/vg-verify.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
  external: ['read-excel-file', 'jszip'],
})
const { readSheetMerges } = await import('./out/vg-intakeExcel.mjs')
const { verifyExtraction, tiebreakContradictions } = await import('./out/vg-verify.mjs')

const FIX = 'fixtures/extraction-bench/hostile-schedule.xlsx'
const bytes = readFileSync(FIX)
const readXlsxFile = (await import('read-excel-file/node')).default
const sheets = await readXlsxFile(bytes, { trim: true })
const merges = await readSheetMerges(bytes)
const sheet = sheets[0]

// The sheet says HP-1 has Q = 79 and TDH = 15, at D4 and E4.
// One claim is TRUE. One is a LIE. The verifier is told neither.
const claims = [
  { tag: 'HP-1', field: 'Q [USGPM]',   value: '79'  },   // true
  { tag: 'HP-1', field: 'TDH [FT WG]', value: '999' },   // seeded wrong
  { tag: 'SP-1', field: 'Q [USGPM]',   value: '130' },   // true
]

console.log(`fixture: ${FIX} · ${sheet.data.length} rows · 4 units\n`)
const r = await verifyExtraction({
  grid: sheet.data, sheetName: sheet.sheet, merges: merges[sheet.sheet] ?? [],
  claims, claimedUnits: 4,
})

check(r.ran, `the verification RAN (failure: ${r.failure ?? 'none'})`)
if (!r.ran) {
  console.log('\nFAIL — a verification that did not run cannot be read as one that passed.')
  process.exit(1)
}

const byField = Object.fromEntries(r.checks.map(c => [`${c.tag}/${c.field}`, c]))
const lie = byField['HP-1/TDH [FT WG]']
const truth = byField['HP-1/Q [USGPM]']
const truth2 = byField['SP-1/Q [USGPM]']

// ── the seeded lie ──────────────────────────────────────────────────────────
check(lie?.verdict === 'contradicted',
  `THE SEEDED WRONG VALUE IS CAUGHT — HP-1 TDH claimed 999, verdict ${lie?.verdict}`)
check(!!lie?.cell, `and it is NAMED with a cell (${lie?.cell ?? 'none'})`)
check(lie?.found != null && /15/.test(String(lie.found)),
  `and the sheet's real value is reported (found: ${JSON.stringify(lie?.found)})`)

// ── the negative half: a checker that cries wolf is worthless ───────────────
check(truth?.verdict === 'supported',
  `a TRUE claim is supported, not flagged — HP-1 Q=79 → ${truth?.verdict}`)
check(truth2?.verdict === 'supported',
  `and a second true claim on another unit — SP-1 Q=130 → ${truth2?.verdict}`)
check(!!truth?.cell, `supported claims carry their cell too (${truth?.cell ?? 'none'})`)

// ── totals ──────────────────────────────────────────────────────────────────
check(r.totals?.onSheet === 4,
  `TOTALS RECONCILE — the sheet lists 4 units (verifier said ${r.totals?.onSheet}); ` +
  `the NOTES row is not equipment`)
check(r.totals?.reconciled === true, 'and the count matches what was claimed')

// ── every claim gets a verdict ──────────────────────────────────────────────
check(r.checks.length === claims.length,
  `every claim came back with a verdict (${r.checks.length}/${claims.length})`)

// ── the third read, bought only for the dispute ─────────────────────────────
const t = await tiebreakContradictions(
  { grid: sheet.data, sheetName: sheet.sheet, merges: merges[sheet.sheet] ?? [] },
  r.checks,
)
check(t.calls === 1, `the third read is bought ONCE — only for the disputed cell (${t.calls} call)`)
const settled = t.checks.find(c => c.tiebreak)
check(settled?.tiebreak?.winner === 'verification',
  `and it settles against the extraction, which was the lie (winner: ${settled?.tiebreak?.winner})`)

const total = r.cost.verify + t.cost
console.log(`\ncost: ${r.cost.verify.toFixed(1)}c verify + ${t.cost.toFixed(1)}c tiebreak = ${total.toFixed(1)}c` +
  `  [SAMPLE — one run]`)
if (r.problems.length) console.log(`verifier output problems: ${r.problems.join(' · ')}`)
if (r.missed.length) console.log(`miss-hunt: ${r.missed.map(m => m.why).join(' · ')}`)

console.log('\n' + '='.repeat(70))
console.log(fail
  ? `FAIL — ${fail} of ${pass + fail}`
  : `PASS — ${pass} checks. A seeded wrong value is caught, named, and settled by a third read.`)
process.exit(fail ? 1 : 0)
