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
import { acquire } from './harness-lock.mjs'

// The header above has asked for this since the first fictional-failure incident.
// Asking did not work: it was violated twice in one day by its own author. The
// lock makes the rule structural — held for the whole run, passed down to the
// suites this runner spawns, refused to everything else.
const releaseLock = acquire('run-battery')

const SUITES = [
  'pw-access',
  'pw-agent-arch',
  'pw-applicability',
  'pw-applicability-rules',
  'pw-base-fields',
  'pw-checklist-offline',
  'pw-classification',
  'pw-contact-channels',
  'pw-contact-modal',
  'pw-copy',
  'pw-cx-plan',
  'pw-dashboard',
  'pw-dates',
  'pw-deliverables',
  'pw-deliverable-access',
  'pw-directory',
  'pw-finding-register',
  'pw-generate-auth',
  'pw-intake',
  'pw-extractor',
  'pw-meetings',
  'pw-pfc-verify',
  'pw-photo-capture',
  'pw-portal',
  'pw-project-delete',
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
  // Not a pw- suite, and here on purpose. It regenerates one document per family
  // and asserts no table rule is painted inside the reserved footer band. The
  // footer-bleed bug shipped because every gate looked at document CONTENT and
  // none looked at page BOUNDARIES — a defect visible on five of nine pages of a
  // real report passed every check the battery had. It qualifies on the rule
  // above: runs bare, re-entrant (uploads upsert), ZZ-TEST only.
  'pdf-boundary-gate',
]

const t0 = Date.now()
const results = []
for (const s of SUITES) {
  process.stdout.write(`── ${s} … `)
  const t = Date.now()
  const r = spawnSync(process.execPath, ['--env-file=.env', `${s}.mjs`], {
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  })
  const secs = ((Date.now() - t) / 1000).toFixed(0)
  const pass = r.status === 0
  results.push({ s, pass, out: (r.stdout ?? '') + (r.stderr ?? '') })
  console.log(pass ? `PASS (${secs}s)` : `FAIL exit=${r.status} (${secs}s)`)
}

const failed = results.filter(r => !r.pass)
console.log('\n' + '='.repeat(64))
console.log(`BATTERY: ${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 60000).toFixed(1)} min`)
for (const f of failed) {
  console.log(`\n──── FAIL ${f.s} — last 30 lines ────`)
  console.log(f.out.split('\n').slice(-30).join('\n'))
}
releaseLock()
process.exit(failed.length ? 1 : 0)
