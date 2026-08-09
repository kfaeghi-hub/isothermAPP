// RLS-INSTRUMENT CENSUS — which suites measure through a client that cannot fail
// the way real users fail?
//
// Ruled 2026-08-08 after `pw-ist` shipped 28/28 green over a feature that was
// unusable: it authenticated with the SERVICE ROLE key, which bypasses RLS, so
// an `infinite recursion detected in policy` on ist_plans was invisible to every
// assertion in it.
//
// The exposure should be KNOWN rather than discovered one incident at a time, so
// this reports it. It does not fix anything: the touch-policy governs the repair
// — a suite gets its non-privileged read when it is next touched.
//
// WHAT COUNTS AS SIGHTED. Three instruments, in descending trustworthiness:
//
//   BROWSER   — the suite drives Playwright through a real login. Every read goes
//               through the app's own anon client with a user JWT, so RLS is
//               fully in the path. These are not blind and never were.
//   EMPLOYEE  — a supabase-js client signed in with credentials() (dev.test,
//               role 'user'). RLS applies in full.
//   ADMIN     — signed in with adminCredentials(). RLS applies, but
//               `is_admin_or_dev()` short-circuits nearly every policy in this
//               codebase, so it proves far less than it looks like it proves.
//   SERVICE   — SUPABASE_SERVICE_ROLE_KEY. BYPASSES RLS ENTIRELY.
//
// A suite is RLS-BLIND when it reads project data and its ONLY instruments are
// SERVICE and/or ADMIN. Service-role use for SETUP and CLEANUP is legitimate and
// expected — seeding a fixture is not a measurement — so the flag is about what
// the suite ASSERTS through, which is why the report prints the instruments
// rather than a bare verdict.
//
// Run: node rls-instrument-census.mjs [--full]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'

const FULL = process.argv.includes('--full')
const files = readdirSync('.').filter(f => /^pw-.*\.mjs$/.test(f) && f !== 'pw-config.mjs').sort()

// Tables the app protects with RLS and that a suite could plausibly read.
const RLS_TABLES = /\b(projects|findings|equipment|checklist_\w+|ist_\w+|site_reports|meetings|deliverables|project_\w+|documentation_register|cx_plans|intake_\w+|company_\w+|contacts|companies)\b/

const rows = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const inst = {
    browser:  /from 'playwright'|chromium\.launch|loginAs\(|\blogin\(page/.test(src),
    employee: /\bcredentials\(\)/.test(src) && !/adminCredentials\(\)\s*\)/.test(src.replace(/\bcredentials\(\)/g, '')) ? /\bcredentials\(\)/.test(src) : /\bcredentials\(\)/.test(src),
    admin:    /adminCredentials\(\)/.test(src),
    service:  /SUPABASE_SERVICE_ROLE_KEY/.test(src),
  }
  // `credentials()` is a substring of `adminCredentials()`; count the employee
  // instrument only where the bare call appears. Getting this wrong would
  // under-report the exposure, which is the direction that matters.
  inst.employee = /(^|[^n])\bcredentials\(\)/m.test(src.replace(/adminCredentials\(\)/g, 'ADMINCRED'))

  const touchesRls = RLS_TABLES.test(src)
  const sighted = inst.browser || inst.employee
  const blind = touchesRls && !sighted && (inst.service || inst.admin)

  rows.push({ suite: f.replace('.mjs', ''), ...inst, touchesRls, blind })
}

const list = a => a.map(r => r.suite).join(', ')
const blind = rows.filter(r => r.blind)
const adminOnly = rows.filter(r => !r.blind && r.admin && !r.browser && !r.employee)
const sighted = rows.filter(r => r.browser || r.employee)

console.log(`RLS-INSTRUMENT CENSUS — ${rows.length} suites\n`)
console.log('INSTRUMENT'.padEnd(14) + 'SUITES')
console.log('browser'.padEnd(14) + rows.filter(r => r.browser).length)
console.log('employee'.padEnd(14) + rows.filter(r => r.employee).length)
console.log('admin'.padEnd(14) + rows.filter(r => r.admin).length)
console.log('service role'.padEnd(14) + rows.filter(r => r.service).length)
console.log('')
console.log(`SIGHTED — reads through a real user at least once:  ${sighted.length}`)
console.log(`RLS-BLIND — asserts only through service/admin:      ${blind.length}`)
if (blind.length) for (const r of blind) {
  console.log(`   · ${r.suite.padEnd(24)} ${[r.service && 'service', r.admin && 'admin'].filter(Boolean).join(' + ')}`)
}

if (FULL) {
  console.log('\nfull table:')
  console.log('SUITE'.padEnd(26) + 'browser employee admin service  rls-tables  verdict')
  for (const r of rows) {
    console.log(r.suite.padEnd(26) +
      (r.browser ? '   ✓   ' : '   ·   ') + (r.employee ? '    ✓    ' : '    ·    ') +
      (r.admin ? '  ✓  ' : '  ·  ') + (r.service ? '   ✓   ' : '   ·   ') +
      (r.touchesRls ? '     ✓     ' : '     ·     ') + (r.blind ? ' BLIND' : ' sighted'))
  }
}

mkdirSync('out', { recursive: true })
writeFileSync('out/rls-instrument-census.json', JSON.stringify(rows, null, 2))
console.log(`\nreport → out/rls-instrument-census.json   Read-only; repairs follow the touch-policy.`)
