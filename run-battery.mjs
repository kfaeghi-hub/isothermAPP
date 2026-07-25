// run-battery.mjs — THE battery runner. All-green must mean all-good.
//
//   node run-battery.mjs            (env comes from .env automatically)
//
// Runs the autonomous functional suites sequentially (they share the ZZ-TEST
// fixture — never parallelize) and prints one PASS/FAIL line per suite plus a
// summary. Exit 0 only if every suite passed.
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
//
// Adding a suite: append here ONLY if it runs bare, self-cleans (re-entrant),
// and touches nothing outside the ZZ-TEST family (pw-config.mjs rule).
import { spawnSync } from 'node:child_process'

const SUITES = [
  'pw-access',
  'pw-checklist-offline',
  'pw-classification',
  'pw-copy',
  'pw-dashboard',
  'pw-dates',
  'pw-deliverables',
  'pw-deliverable-access',
  'pw-directory',
  'pw-finding-register',
  'pw-generate-auth',
  'pw-meetings',
  'pw-pfc-verify',
  'pw-project-delete',
  'pw-signoff-order',
  'pw-team',
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
process.exit(failed.length ? 1 : 0)
