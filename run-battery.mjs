// run-battery.mjs — THE battery runner. All-green must mean all-good.
//
//   node run-battery.mjs            (env comes from .env automatically)
//
// Runs the autonomous functional suites sequentially (they share the ZZ-TEST
// fixture — never parallelize) and prints one PASS/FAIL line per suite plus a
// summary. Exit 0 only if every suite passed.
//
// AND NEITHER IS "DO NOT DEPLOY DURING A RUN", paid for on 2026-08-04: the
// battery reported pw-intake FAIL exit=1 while a push to main was redeploying
// api/intake.ts underneath it. Run alone, pw-intake passed 61/61. The suites
// test PRODUCTION, so a deploy mid-run swaps the code under the harness — the
// same fictional-regression class as a parallel suite, arriving from a
// direction the rule below did not name. Nothing lands on main while a battery
// is in flight.
//
// NEVER PARALLELIZE IS NOT ADVICE, and it has now been paid for: one battery was
// started in the background while a second battery plus two individual suites ran
// against the same fixture. The result was pw-checklist-offline failing 9
// assertions, pw-signoff-order reporting non-deterministic ordering, and
// pw-project-delete announcing that ZZ-TEST did not exist — three convincing,
// entirely fictional regressions. A clean sequential run was 25/25.
//
// The cost is not the wasted run. It is that a fake failure in a suite about
// OFFLINE DURABILITY reads exactly like a real one, and the next instinct is to
// go and "fix" working code.
//
// SUITE DISCOVERY IS AN EXPLICIT ALLOW-LIST, deliberately. A glob over pw-*.mjs
// once swept in the arg-requiring manual audit tools, which exit 1 with a usage
// message when run bare — false reds that trained us to explain away failures.
//
// EXCLUDED and why:
//   pw-blank-audience.mjs   manual document-audit tool — requires <instance_id>
//   pw-checklist-docs.mjs   manual document-audit tool — requires <instance_id>
//   pw-report-regen.mjs     two-phase before/after determinism harness — needs
//                           a pre-change baseline; only meaningful around
//                           document-generator changes
//   pw-pdf-shot.mjs / pw-ui-shots.mjs / pw-landing.mjs   screenshot generators,
//                           no assertions
//   pw-extractor.mjs runs BARE in the battery (mocked: contract + endpoint
//                           refusal only, no spend). The real extraction is
//                           `--real-ai`, run deliberately, because a battery that
//                           bills on every commit gets run less often.
//   pw-drafter.mjs   same split, same reason: bare proves the contract, the
//                           refusals, and that a draft writes nothing; `--real-ai`
//                           spends ~3c on one real draft.
//   verify-gate.mjs  Phase 4's gate. It is EXCLUDED for the same reason, not for
//                           a different one: it makes two real calls (~2c) because
//                           a verifier proven only against a mock is a verifier
//                           proven against my own idea of a model. Run it
//                           deliberately when the verification path changes.
//   extraction-bench.mjs     reports rather than gates, and its --with-ai leg is
//                           ~$4 a run. The free deterministic leg is a report, not
//                           a pass/fail, so it has nothing to contribute to an
//                           all-green run.
//   pw-applicability-review-render.mjs   asserts, self-checks, and runs bare —
//                           but reads a CLIENT project (Seneca), because ZZ-TEST
//                           holds no classifier proposals and rendering there
//                           would assert nothing about the screen a CxA uses. It
//                           is strictly read-only and proves it with a before/
//                           after census, but the rule above says ZZ-TEST family
//                           only, so it stays a deliberate manual check rather
//                           than a quiet exception inside an all-green run.
//
// Adding a suite: append here ONLY if it runs bare, self-cleans (re-entrant),
// and touches nothing outside the ZZ-TEST family (pw-config.mjs rule).
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { acquire } from './harness-lock.mjs'
import { classify, excerpt, record, promoted, allPromoted, sessionId } from './harness-transients.mjs'
import { assertZzTestQuiet } from './harness-settle.mjs'
import { createClient } from '@supabase/supabase-js'

// The header above has asked for this since the first fictional-failure incident.
// Asking did not work: it was violated twice in one day by its own author. The
// lock makes the rule structural — held for the whole run, passed down to the
// suites this runner spawns, refused to everything else.
const releaseLock = acquire('run-battery')

// ── W2 TREE-STATE GUARD: suites load from the working tree, so an edit
// mid-run IS code landing in a running battery (learned by voiding a 51/53
// by hand). The stamp is taken after SUITES is declared, below; the recheck
// runs before the summary is trusted.
import { treeStamp, guardPaths, stampDiff, announceVoid, VOID_EXIT } from './battery-guard.mjs'

const SUITES = [
  'pw-access',
  'pw-agent-arch',
  'pw-applicability',
  'pw-applicability-rules',
  'pw-base-fields',
  'pw-checklist-docx-tables',
  'pw-checklist-offline',
  'pw-classification',
  'pw-contact-channels',
  'pw-contact-modal',
  'pw-copy',
  'pw-cx-plan',
  'pw-cx-sticky-header',
  'pw-cx-counting',
  'pw-cx-bulk',
  'pw-cx-export',
  'pw-dashboard',
  'pw-dates',
  'pw-def-seeding',
  'pw-deliverables',
  'pw-deliverable-access',
  'pw-directory',
  'pw-doc-docx-tables',
  'pw-finding-register',
  'pw-generate-auth',
  'pw-intake',
  'pw-intake-review',
  'pw-correction-capture',
  'pw-alias-provenance',
  'pw-approve-matcher',
  'pw-extractor',
  'pw-meetings',
  'pw-pfc-verify',
  'pw-photo-capture',
  'pw-portal',
  'pw-project-delete',
  'pw-projects-toolbar',
  'pw-report-photos',
  'pw-signoff-order',
  'pw-storage-privacy',
  'pw-team',
  'pw-drafter',
  'pw-schedule-finder',
  'pw-type-picker',
  'pw-ist',
  // Regenerates the real Scarborough Gardens content and asserts the STRUCTURE
  // of what comes out — section order, three attachments from nine matrix rows,
  // one sign-off per attachment, the Equip. Type column only where points live.
  // The issued report is the fixture standard, so this is the gate that stops
  // the generator drifting away from the document an AHJ actually reads.
  'ist-regen-gate',
  'pw-ist-team',
  'pw-ist-evidence',
  'pw-ist-generate',
  'pw-equipment-delete',
  'pw-intake-retry',
  // Real client schedules, read from gitignored samples/. SKIPS LOUDLY BY NAME
  // when the files are absent — it never reports a pass on a corpus that is not
  // there. See the calibration FIXTURES.md rule.
  'avondale-schedule-gate',
  'pw-schedule-coverage',
  // Not a pw- suite, and here on purpose. It regenerates one document per family
  // and asserts no table rule is painted inside the reserved footer band. The
  // footer-bleed bug shipped because every gate looked at document CONTENT and
  // none looked at page BOUNDARIES — a defect visible on five of nine pages of a
  // real report passed every check the battery had. It qualifies on the rule
  // above: runs bare, re-entrant (uploads upsert), ZZ-TEST only.
  'pdf-boundary-gate',
]

// The guard's opening stamp — everything this run will execute.
const GUARD_STAMP = treeStamp(guardPaths(SUITES))

// ── THE DEPLOY WINDOW IS A STATE, AND THIS CHECKS FOR IT ────────────────────
//
// A rule that depends on being remembered mid-session is not a rule yet. The
// standing rule — confirm the served bundle postdates the push before believing a
// field report — was written down and then broken by its own author: a battery
// started in the same shell command as a `git push` hit Vercel mid-rollout and
// pw-finding-register came back with an HTML error page where JSON belonged. It
// looked exactly like a real defect for the length of one diagnosis.
//
// Vercel takes ~110s. If HEAD was committed inside that window, say so LOUDLY
// before spending fifteen minutes producing a red run nobody can trust.
{
  const { execSync } = await import('node:child_process')
  try {
    const committed = Number(execSync('git log -1 --format=%ct', { encoding: 'utf8' }).trim()) * 1000
    const age = Date.now() - committed
    if (age < 180_000) {
      const wait = Math.ceil((180_000 - age) / 1000)
      console.log('!'.repeat(70))
      console.log(`HEAD was committed ${Math.round(age / 1000)}s ago — a deploy is probably still rolling.`)
      console.log(`Waiting ${wait}s before starting, so a rollout does not read as a defect.`)
      console.log('!'.repeat(70))
      await new Promise(r => setTimeout(r, 180_000 - age))
    }
  } catch { /* not a git checkout, or git absent — the battery still runs */ }
}

// PROMOTED SIGNATURES ARE ANNOUNCED BEFORE THE RUN, not buried after it. A
// signature that has recurred across sessions is a defect investigation, and this
// run will NOT retry it.
const PROMOTED = allPromoted()
if (PROMOTED.length) {
  console.log('!'.repeat(70))
  console.log('PROMOTED TRANSIENTS — these recur and are no longer treated as weather:')
  for (const p of PROMOTED) {
    console.log(`  ${p.suite} / ${p.signature}: ${p.hits} times across ${p.sessions} sessions since ${p.since.slice(0, 10)}`)
  }
  console.log('  They will NOT be retried. Each is a defect until somebody rules otherwise.')
  console.log('!'.repeat(70))
}

// `--settle=3000` for diagnosis only. Never a default, never a fix.
const SETTLE = Number((process.argv.find(a => a.startsWith('--settle=')) ?? '').slice(9)) || 0
if (SETTLE) console.log(`(diagnostic: ${SETTLE}ms settle between suites — NOT the default path)`)

// Read-only, for the inter-suite invariant. Absent env simply disables it.
const SVC = process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null
const ZZ_ID = 'e0c427d8-2029-4382-b054-6a84248ad8fe'

const SESSION = sessionId()
const t0 = Date.now()
const results = []
const retried = []

const runOne = (s) => {
  const t = Date.now()
  const r = spawnSync(process.execPath, ['--env-file=.env', `${s}.mjs`], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  })
  return { r, out: (r.stdout ?? '') + (r.stderr ?? ''), secs: ((Date.now() - t) / 1000).toFixed(0) }
}

const measurements = []

for (const s of SUITES) {
  process.stdout.write(`── ${s} … `)
  let { r, out, secs } = runOne(s)

  // ONE RETRY, ONLY ON AN ENUMERATED TRANSPORT SIGNATURE, NEVER ON AN ASSERTION.
  if (r.status !== 0) {
    const sig = classify(out)
    const isPromoted = sig ? promoted(s, sig.name) : null
    if (sig && !isPromoted) {
      const ex = excerpt(out, sig)
      process.stdout.write(`TRANSIENT(${sig.name}) — retrying once … `)
      const second = runOne(s)
      const outcome = second.r.status === 0 ? 'passed_on_retry' : 'failed_twice'
      record({ suite: s, signature: sig.name, excerpt: ex, outcome, session: SESSION })
      if (outcome === 'passed_on_retry') retried.push({ suite: s, signature: sig.name })
      r = second.r; out = second.out; secs = `${secs}+${second.secs}`
    } else if (isPromoted) {
      process.stdout.write(`PROMOTED(${sig.name}, not retried) `)
    }
  }

  const pass = r.status === 0
  results.push({ s, pass, out })
  console.log(pass ? `PASS (${secs}s)` : `FAIL exit=${r.status} (${secs}s)`)

  // INSTRUMENTATION SURVIVES A PASSING RUN. Suite stdout is only printed on
  // failure, which is right for noise and wrong for measurements: the first
  // instrumented pw-meetings run PASSED and its `[GENERATION] appeared-after-Nms`
  // — the whole point of the exercise — went into a buffer nobody reads. A number
  // that only survives failure is a number you will pay for twice.
  // A LITERAL, not a string. The first version built this with `new RegExp` from a
  // single-quoted string, so `\s` and `\[` lost their backslashes and the pattern
  // compiled to something that matched nothing — the echo silently never fired and
  // the measurement was lost a second time.
  //
  // THE CONVENTION (ruling 3, 2026-08-12). A suite that MEASURES something prints
  // a tagged line: `[TAG] key-value`, TAG in caps. The battery collects every one
  // of them PASS OR FAIL, echoes it inline, and lands them durably in
  // out/battery-measurements.json. Right-for-noise stays right — suite stdout is
  // still only dumped on failure — but measurements stop dying with success.
  const MARKER = /^\s*\[([A-Z][A-Z-]*)\]\s*(.+)$/
  for (const line of out.split(String.fromCharCode(10))) {
    const m = MARKER.exec(line)
    if (!m) continue
    console.log(`      ${line.trim()}`)
    measurements.push({ suite: s, tag: m[1], value: m[2].trim(), passed: pass, seconds: secs })
  }

  // ── SETTLE BETWEEN SUITES ──────────────────────────────────────────────────
  //
  // THE BATTERY IS SERIAL AND THAT WAS NEVER THE PROBLEM. `spawnSync` blocks;
  // one suite finishes before the next begins. But a suite's process EXITING is
  // not the same as its WRITES LANDING: a request already sent commits on the
  // server whether or not the client waited for the response, so an unawaited
  // cleanup or a fire-and-forget update settles during the NEXT suite's run.
  //
  // The evidence for that, rather than for weather: five different suites failed
  // across four runs, the failing set moved every time, every one of them passes
  // ALONE, and the set now includes pw-pfc-verify — a naming assertion with no
  // document generation in it at all. Weather does not select for neighbours.
  //
  // ── THE INTER-SUITE INVARIANT ─────────────────────────────────────────────
  //
  // ONE HARNESS EDIT INSTEAD OF FORTY-ONE. A suite that leaves residue breaks its
  // NEIGHBOUR, and the neighbour is what turns red — so today's failure names the
  // victim and hides the offender. This reads ZZ-TEST after each suite and says
  // who left what, immediately, while the name is still attached.
  //
  // It REPORTS rather than fails: a suite legitimately mid-campaign may hold rows,
  // and turning that into a red run would be inventing a rule nobody ruled. What
  // it removes is the guessing.
  if (SVC) {
    try { await assertZzTestQuiet(SVC, ZZ_ID, s) } catch { /* reporting never fails a run */ }
  }

  // RULED 2026-08-12: THIS DOES NOT SHIP ON THE DEFAULT PATH. A sleep that makes
  // the battery pass is the battery learning to shrug. It stays behind a flag
  // because it is a useful DIAGNOSTIC — it was the probe that separated
  // pw-pfc-verify (recovered) from pw-meetings (did not) — and for no other reason.
  if (SETTLE) await new Promise(r2 => setTimeout(r2, SETTLE))
}

const failed = results.filter(r => !r.pass)
console.log('\n' + '='.repeat(64))
// A GREEN RUN THAT NEEDED A RETRY NEVER LOOKS CLEAN.
console.log(`BATTERY: ${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 60000).toFixed(1)} min` +
  (retried.length
    ? ` (${retried.length} after retry: ${retried.map(x => `${x.suite}/${x.signature}`).join(', ')})`
    : ''))
for (const f of failed) {
  console.log(`\n──── FAIL ${f.s} — last 30 lines ────`)
  console.log(f.out.split('\n').slice(-30).join('\n'))
}
// ── MEASUREMENTS LAND DURABLY ────────────────────────────────────────────────
//
// Ruling 3. A measurement that lives only in this terminal dies with the scroll
// buffer, and one that only prints on failure dies with success. Both happened to
// the same number in one session. The ledger is append-only across runs so a value
// can be COMPARED to itself — a settle time drifting upward run over run is the
// signal, and a single reading cannot show it.
if (measurements.length) {
  console.log(`\n──── MEASUREMENTS (${measurements.length}) ────`)
  for (const m of measurements) console.log(`  ${m.suite.padEnd(26)} [${m.tag}] ${m.value}`)

  const LEDGER = 'docs/battery-measurements.json'
  let prior = []
  try { prior = JSON.parse(readFileSync(LEDGER, 'utf8')) } catch { /* first run */ }
  // THE LEDGER IS COMMITTED, so the standing law applies to it: client content
  // never reaches a log, and never reaches GitHub. Measurement VALUES are free
  // text written by suites, so a suite that one day prints a schedule's filename
  // would publish it. Path-like and workbook-like tokens are refused here rather
  // than trusted not to appear — the value still shows in the terminal, it just
  // does not land in a tracked file.
  // A slash BETWEEN DIGITS is a ratio, not a path — "merged 269/298" is exactly
  // the measurement this ledger exists to keep, and a naive slash class eats it.
  // Verified in both directions before shipping (out/scrub-test.mjs).
  const CLIENT_SHAPED = /[\\]|(?<![0-9])\/|\/(?![0-9])|[.](?:xlsx|xls|pdf|docx|csv)\b/i
  const safe = measurements.map(m => CLIENT_SHAPED.test(m.value)
    ? { ...m, value: '(withheld: path- or document-shaped)', withheld: true }
    : m)
  const entry = {
    run: sessionId(), at: new Date().toISOString(),
    passed: results.length - failed.length, of: results.length,
    measurements: safe,
  }
  writeFileSync(LEDGER, JSON.stringify([...prior, entry].slice(-50), null, 2) + '\n')
  console.log(`  -> appended to ${LEDGER} (${prior.length + 1} runs)`)
}

// ── W2: the closing re-check. A mutated tree voids the run, whatever the
// summary above said — a green over changed suites is the silence class
// wearing a checkmark. Lock still releases; the exit code is distinct.
{
  const changed = stampDiff(GUARD_STAMP, treeStamp(guardPaths(SUITES)))
  if (changed.length) {
    announceVoid(changed)
    releaseLock()
    process.exit(VOID_EXIT)
  }
}

releaseLock()
process.exit(failed.length ? 1 : 0)
