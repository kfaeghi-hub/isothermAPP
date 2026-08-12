// parity-gate — 5a's parity, in the three layers it can honestly have. [KEEL]
//
//   node --env-file=.env parity-gate.mjs
//
// "IDENTICAL MERGED ROWS" IS NOT ACHIEVABLE AND SAYING SO IS THE POINT. There is
// no temperature (the API rejects it), no seed, and the model id is an alias. Two
// reads of one sheet minutes apart differ — measured across four corpus runs:
// 203, 185, 155, 267 typed, with the failing set changing each time. A gate that
// asserted byte-identical model output would fail for the right reason and teach
// everyone to ignore it.
//
// So parity is asserted where parity is real:
//
//   LAYER 1 — DETERMINISTIC CORE, byte-identical on fixed inputs. `reconcileSheet`
//             is pure. Given the same two readings it must produce the same merge,
//             every time, in both runtimes. This is the layer that actually
//             catches a divergence.
//   LAYER 2 — STRUCTURAL, by construction. The endpoint and the bench must IMPORT
//             the same modules rather than resemble each other. Asserted by
//             reading the source, because "one reading path, two callers" is a
//             claim about the code, not about an output.
//   LAYER 3 — REQUEST, not response. The same task text, the same schema, the same
//             pinned model. Outputs are labelled [SAMPLE] and are not compared.
//
// Layer 3 is where the honesty lives: it asserts the REQUEST is the same bytes
// from the same function, and declines to assert anything about what comes back.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('parity-gate')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

// ── LAYER 1 — the deterministic core, byte-identical ────────────────────────
console.log('\n── LAYER 1 · deterministic core, byte-identical on fixed inputs ──')

await build({
  entryPoints: ['src/lib/reconcile.ts'], outfile: 'out/parity-reconcile.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
})
const { reconcileSheet } = await import('./out/parity-reconcile.mjs')

// Fixed inputs, written by hand — the point is that they never move.
const RULES = [
  { tag: 'P-1', descriptor: 'END SUCTION PUMP', location: 'MECH 1', area_served: 'HEATING',
    proposed_type: 'pump', nameplate: { 'FLOW [GPM]': '130' }, confidence: 0.95 },
  { tag: 'P-1', descriptor: 'SECOND UNIT SAME TAG', location: null, area_served: null,
    proposed_type: 'pump', nameplate: {}, confidence: 0.9 },
  { tag: null, descriptor: 'UNTAGGED ROW', location: null, area_served: 'LOOP',
    proposed_type: null, nameplate: {}, confidence: 0.5 },
]
const MODEL = [
  { tag: 'P-1', descriptor: 'END SUCTION PUMP', location: 'MECH 1', area_served: 'HEATING',
    proposed_type: 'fire_pump', nameplate: { 'HEAD [ft]': '25' }, confidence: 0.9 },
]

const runs = Array.from({ length: 5 }, () =>
  JSON.stringify(reconcileSheet(structuredClone(RULES), structuredClone(MODEL))))
check(new Set(runs).size === 1, `five reconciles of the same inputs are byte-identical (${new Set(runs).size} distinct)`)

const merged = JSON.parse(runs[0])
check(merged.rows.length === 3, `every input row survives the merge (${merged.rows.length}/3) — untagged and repeated-tag included`)
check(merged.disagreements.some(d => d.kind === 'type-conflict'),
  'the seeded type-conflict is recorded, not resolved away')
const conflicted = merged.rows.find(r => r.disagreements.some(d => d.kind === 'type-conflict'))
check(conflicted && conflicted.confidence <= 0.8,
  `a conflicted row is capped below CLEAN_AT (${conflicted?.confidence})`)

// ── LAYER 2 — structural, by construction ───────────────────────────────────
console.log('\n── LAYER 2 · structural parity, asserted by shared imports ──')

const endpoint = readFileSync('api/intake.ts', 'utf8')
const bench = readFileSync('extraction-bench.mjs', 'utf8')
const orch = readFileSync('src/lib/intakeOrchestrator.ts', 'utf8')

check(/from '\.\/_shared\/sheet-model-read\.js'/.test(endpoint),
  'the endpoint imports the shared reading path (sheet-model-read)')
check(/sheet-model-read/.test(bench),
  'the bench imports the SAME reading path, not a copy')
check(/from '\.\/_shared\/verify-extraction\.js'/.test(endpoint),
  'the endpoint imports the shared verification path')
check(/from '\.\/reconcile'/.test(orch) && /src\/lib\/reconcile\.ts/.test(bench),
  'the orchestrator and the bench reconcile through the same module')
check(/from '\.\/sheetBands'/.test(orch) && !/planChunks|readSheetChunked/.test(endpoint),
  'banding is a CALLER concern — the endpoint never bands, so one grid per request holds')
// THIS CHECK EXISTS BECAUSE THE GATE MISSED IT ONCE. Layer 2 asserted the
// orchestrator's import and the endpoint's lack of one, and never that the BENCH
// used the same splitter — so two banding implementations passed a parity gate.
check(/sheetBands/.test(bench) && /planBands/.test(bench),
  'the BENCH bands with the same splitter as the browser — one implementation, not two')
check(!/readSheetChunked/.test(readFileSync('api/_shared/sheet-model-read.ts', 'utf8')),
  'and the second banding implementation is gone rather than merely unused')

// THE BET THAT IS NOT TAKEN. A runtime import from api/ into src/ has never been
// exercised on Vercel, and the repo's own convention implies it would fail.
const apiFiles = ['api/intake.ts', 'api/_shared/sheet-model-read.ts', 'api/_shared/sheet-render.ts',
                  'api/_shared/verify-extraction.ts', 'api/_shared/extract-contract.ts']
const runtimeCrossings = apiFiles.flatMap(f => {
  const src = readFileSync(f, 'utf8')
  return [...src.matchAll(/^import\s+(?!type\b)[^\n]*from\s+'(\.\.\/\.\.\/src\/[^']+)'/gm)].map(m => `${f} → ${m[1]}`)
})
check(runtimeCrossings.length === 0,
  `NO runtime import crosses api/ into src/ (${runtimeCrossings.join(', ') || 'none'})`)

// ── LAYER 3 — the request, not the response ─────────────────────────────────
console.log('\n── LAYER 3 · request parity — same bytes, same schema, same model ──')

await build({
  entryPoints: ['api/_shared/sheet-model-read.ts'], outfile: 'out/parity-read.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
  external: ['read-excel-file', 'jszip'],
})
const readMod = readFileSync('api/_shared/sheet-model-read.ts', 'utf8')
check(/const TASK = \[/.test(readMod),
  'the task text is a single constant in the shared module — not assembled per caller')
check((readMod.match(/task:\s*TASK/g) ?? []).length === 1,
  'and exactly one call site uses it, so both callers send the same bytes')

const schemas = readFileSync('api/_shared/agent-schemas.ts', 'utf8')
check(/RowVerifierInput, RowVerifierOutput,/.test(schemas),
  'the verifier schema pair is registered — output shape is enforced by the registry')

const aiCommon = readFileSync('api/_shared/ai-common.ts', 'utf8')
check(/export const MODEL_PIN/.test(aiCommon) && /MODEL PIN MISMATCH/.test(aiCommon),
  'the model is pinned and a mismatch is reported rather than absorbed')

await build({
  entryPoints: ['api/_shared/ai-common.ts'], outfile: 'out/parity-ai.mjs',
  format: 'esm', bundle: true, platform: 'node', logLevel: 'error',
})
const { verifyModelPin } = await import('./out/parity-ai.mjs')
const pin = await verifyModelPin()
check(pin.ok, `the pin still holds — ${pin.note}`)

console.log('\n  Model OUTPUT is deliberately not compared. Four corpus runs of the same')
console.log('  corpus typed 203 / 185 / 155 / 267 rows. Every model figure is [SAMPLE].')

console.log('\n' + '='.repeat(70))
console.log(fail
  ? `FAIL — ${fail} of ${pass + fail}`
  : `PASS — ${pass} checks across three layers. The core is identical, the paths are shared, the request is the same bytes.`)
process.exit(fail ? 1 : 0)
