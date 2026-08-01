// apply-migration — run a migration file against the Supabase project.
//
//   node --env-file=.env apply-migration.mjs migrations/<file>.sql
//   node --env-file=.env apply-migration.mjs migrations/<file>.sql --dry-run
//
// WHY THIS EXISTS: migrations used to go through an MCP tool that is not always
// connected. A schema change that can only be applied when one particular
// integration happens to be up is not a repeatable process — the SQL lives in
// migrations/ and this runs it, so the repo is the source of truth either way.
//
// THE GUARD IS THE POINT (ops rule, same shape as every importer here): it
// resolves the project by REF and refuses on mismatch. A migration is the most
// destructive thing in this repo and the one place a wrong target cannot be
// walked back.
import { readFileSync } from 'node:fs'

const PROJECT_REF = 'isztyeczqndploybdtcn'          // isotherm-cx production
const file = process.argv[2]
const dry = process.argv.includes('--dry-run')

if (!file) {
  console.error('usage: node --env-file=.env apply-migration.mjs <file.sql> [--dry-run]')
  process.exit(1)
}
const token = process.env.SUPABASE_MGMT_TOKEN
if (!token) { console.error('REFUSING: SUPABASE_MGMT_TOKEN not in .env'); process.exit(1) }

// Resolve and refuse. The URL in .env is what every other script talks to; if the
// ref hardcoded here is not that project, something is wrong and guessing which
// one is right is exactly the wrong instinct.
const envUrl = process.env.VITE_SUPABASE_URL ?? ''
if (!envUrl.includes(PROJECT_REF)) {
  console.error(`REFUSING: VITE_SUPABASE_URL (${envUrl}) is not project ${PROJECT_REF}.`)
  console.error('Resolve the mismatch deliberately rather than pointing this at whichever one answers.')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
const statements = sql.split(/;\s*$/m).map(s => s.trim()).filter(s => s && !/^--/.test(s)).length
console.log(`${file}: ${sql.length} chars, ~${statements} statements → ${PROJECT_REF}`)

if (dry) {
  console.log('\n--dry-run: nothing sent.\n')
  console.log(sql)
  process.exit(0)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const body = await res.text()

if (!res.ok) {
  console.error(`\nFAILED (HTTP ${res.status})\n${body}`)
  process.exit(1)
}
console.log('\nAPPLIED.')
// Print whatever the last statement returned — a migration that ends in a SELECT
// verifies itself, which is cheaper than trusting that it did what it said.
try {
  const j = JSON.parse(body)
  if (Array.isArray(j) && j.length) console.log(JSON.stringify(j, null, 2).slice(0, 2000))
} catch { /* not JSON — nothing to show */ }
