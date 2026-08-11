// pw-intake-retry — the storage read retries, and only when retrying can help.
//
// FROM A REAL FAILURE, 2026-08-11: a 0.9 MB PNG page returned a storage
// `Gateway Timeout`, the extract threw the whole run away, and the screen said
// "0 page(s) read" — which reads as *your drawing had nothing in it*. The object
// was fine and downloaded in 436 ms on the next attempt.
//
// WHAT IS PROVEN HERE, and why each leg has to exist:
//
//   1. A FIRST READ THAT FAILS IS RETRIED, and the second lands. Forced, not
//      waited for: the point of a retry is the case you cannot reproduce on
//      demand, so the failure is INJECTED rather than hoped for.
//   2. A NON-RETRYABLE failure fails IMMEDIATELY. Retrying a wrong path is
//      slower wrongness, and a guard that retries everything hides real 404s
//      behind three round trips.
//   3. The attempt count is REPORTED. A flaky-but-succeeding read must not be
//      silent, or storage can degrade for months while every run looks clean.
//
// The retry lives in `api/intake.ts` as `downloadWithRetry`. It is exercised
// here through a local copy of the SAME predicate and a fake storage client,
// because forcing Supabase itself to 504 on demand is not possible and a leg
// that waits for a real flake is a leg that never runs.
//
// NAMED SEAM: this tests the RETRY POLICY, not the wiring. The wiring — that
// intake.ts calls it at all — is asserted separately below by reading the
// deployed handler's own source, which is the cheap half and catches the failure
// that matters (someone removing the call).
import { readFileSync } from 'node:fs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-intake-retry')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

// ── the predicate under test, lifted verbatim from api/intake.ts ─────────────
// Kept in sync by leg 4, which fails if the source drifts from this copy.
const RETRYABLE = /timeout|timed out|gateway|temporarily|unavailable|502|503|504|econnreset|socket hang up|fetch failed/i
async function downloadWithRetry(service, path, tries = 3) {
  let last = null
  for (let attempt = 1; attempt <= tries; attempt++) {
    const r = await service.storage.from('intake-files').download(path)
    if (!r.error && r.data) return { data: r.data, error: null, attempts: attempt, retryable: false }
    last = r.error
    const status = Number(r.error?.statusCode ?? r.error?.status ?? 0)
    const retryable = (status >= 500 && status <= 599) || RETRYABLE.test(String(r.error?.message ?? ''))
    if (!retryable) return { data: null, error: r.error, attempts: attempt, retryable: false }
    if (attempt < tries) await new Promise(r2 => setTimeout(r2, 5))
  }
  return { data: null, error: last, attempts: tries, retryable: true }
}

/** A storage client whose failures are scripted. */
const fakeStorage = script => {
  let i = 0
  return { storage: { from: () => ({ download: async () => { const step = script[Math.min(i++, script.length - 1)]; return step } }) } }
}
const ok = { data: { size: 929422 }, error: null }
const timeout = { data: null, error: { message: 'Gateway Timeout', statusCode: '504' } }
const notFound = { data: null, error: { message: 'Object not found', statusCode: '404' } }
const forbidden = { data: null, error: { message: 'new row violates row-level security', statusCode: '403' } }

// ── 1. a failed first read is retried, and the second lands ─────────────────
{
  const r = await downloadWithRetry(fakeStorage([timeout, ok]), 'p9.png')
  check(!!r.data && r.attempts === 2,
    `a Gateway Timeout on the first read is retried and the SECOND lands (attempts=${r.attempts}, data=${!!r.data})`)
}

// ── 2. it gives up after the bound, and says the failure was retryable ──────
{
  const r = await downloadWithRetry(fakeStorage([timeout]), 'p9.png')
  check(!r.data && r.attempts === 3 && r.retryable === true,
    `three consecutive timeouts stop at the bound and report retryable (attempts=${r.attempts}, retryable=${r.retryable})`)
}

// ── 3. non-retryable failures fail IMMEDIATELY ──────────────────────────────
for (const [name, step] of [['404 Object not found', notFound], ['403 forbidden', forbidden]]) {
  const r = await downloadWithRetry(fakeStorage([step, ok]), 'wrong/path.png')
  check(!r.data && r.attempts === 1,
    `${name} fails on attempt 1 and is NOT retried (attempts=${r.attempts}) — retrying a wrong path is slower wrongness`)
}

// a 500 IS retried, so the family is not just the word "timeout"
{
  const r = await downloadWithRetry(fakeStorage([{ data: null, error: { message: 'Internal Error', statusCode: '500' } }, ok]), 'p9.png')
  check(!!r.data && r.attempts === 2, `a 500 is retried too (attempts=${r.attempts})`)
}

// ── 4. the SHIPPED handler still calls it, and the predicate has not drifted ─
// A policy proven in a copy is worth nothing if the real path stopped using it.
const src = readFileSync('api/intake.ts', 'utf8')
check(/const dl = await downloadWithRetry\(service, up\.storage_path\)/.test(src),
  'api/intake.ts still routes the page read through downloadWithRetry')
check(src.includes(RETRYABLE.source),
  'the retryable-status predicate in the handler matches the one asserted here')
check(/failure: 'fetch'/.test(src) && /attempts: dl\.attempts/.test(src),
  'a failed fetch reports failure kind and attempt count to the client')

// ── 5. the client tells "never fetched" from "read and empty" ───────────────
//
// THESE WERE STRING GREPS AND THAT WAS NOT ENOUGH. On first run they passed over
// a file that DID NOT COMPILE — an escaping slip had turned a newline escape into
// real newlines mid-template-literal, and grepping for a phrase cannot see that
// the code around it is broken. A check that passes on unbuildable source is
// measuring the wrong artifact, which is this codebase's oldest lesson wearing
// a new hat.
//
// So the source is PARSED, not searched: esbuild is asked to transform the file,
// which fails on exactly the class of damage a grep sails past.
const UI = 'src/components/intake/IntakeUpload.tsx'
const ui = readFileSync(UI, 'utf8')
try {
  const { transformSync } = await import('esbuild')
  transformSync(ui, { loader: 'tsx', jsx: 'automatic' })
  check(true, 'the intake upload component parses — the greps below are reading real code')
} catch (e) {
  check(false, `the intake upload component does NOT parse: ${String(e).split('\n')[0]}`)
}
check(/Could not fetch page/.test(ui) && /nothing is wrong with it/.test(ui),
  'the single-page case says the fetch failed, not "0 page(s) read"')
check(/could not be FETCHED/.test(ui),
  'the multi-page summary marks which failures were never fetched')

console.log('\n' + '='.repeat(60))
console.log(fail ? `FAIL — ${fail} of ${pass + fail}` : `PASS — ${pass} checks, storage retry policy and failure attribution.`)
process.exit(fail ? 1 : 0)
