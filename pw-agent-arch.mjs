// pw-agent-arch — the Agent Architecture gate.
//
//   node --env-file=.env pw-agent-arch.mjs            (schema + ledger + laws)
//   node --env-file=.env pw-agent-arch.mjs --real-ai  (+ one real librarian harvest)
//
// Tests the ARCHITECTURE, not a feature: the registry parses, the runtime's laws
// are structurally true, the ledger records per category, and one harvest on
// seeded feedback produces a proposal.
//
// Seeded feedback is written to ZZ-TEST and removed in `finally`, per the ops
// rule — cleanup belongs in finally, never as a trailing statement.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { TEST_PROJECT, adminCredentials, apiToken, BASE_URL } from './pw-config.mjs'

const REAL_AI = process.argv.includes('--real-ai')
let pass = 0, fail = 0
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); ok ? pass++ : fail++ }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { email, password } = adminCredentials()
await adm.auth.signInWithPassword({ email, password })

const { data: zz } = await adm.from('projects').select('id, name').eq('name', TEST_PROJECT).single()
const seeded = []

try {
  console.log('\n── Registry ──────────────────────────────────────────────────')
  const files = readdirSync('firm-knowledge/agents').filter(f => f.endsWith('.md'))
  check(files.length >= 6, `agent contracts present (${files.length})`)

  const contracts = {}
  for (const f of files) {
    const raw = readFileSync(`firm-knowledge/agents/${f}`, 'utf8')
    const lines = raw.split('\n')
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    const fm = {}
    for (const l of lines.slice(1, close)) {
      const m = /^([a-z_]+):\s*(.*)$/.exec(l.trim())
      if (m) fm[m[1]] = m[2].trim()
    }
    contracts[f.replace('.md', '')] = fm
  }

  const missing = Object.entries(contracts).filter(([k, c]) =>
    !c.key || !c.budget_class || !c.input_schema || !c.output_schema || !c.autonomy_tier)
  check(missing.length === 0,
    `every contract declares key, budget_class, schemas, autonomy_tier (${missing.length} incomplete)`)

  const keyMismatch = Object.entries(contracts).filter(([f, c]) => c.key !== f)
  check(keyMismatch.length === 0, `every contract's key matches its filename (${keyMismatch.length} off)`)

  // LAW 5, as a DATA FACT. This is the assertion that matters most in this file:
  // the verifier's isolation is not a convention anyone can forget at a call site.
  check(contracts.verifier?.slices === '[]',
    `LAW 5 — verifier declares slices: [] (got "${contracts.verifier?.slices}")`)

  // The addendum: tier 1 everywhere, and only tier 1 implemented.
  const offTier = Object.entries(contracts).filter(([, c]) => c.autonomy_tier !== '1')
  check(offTier.length === 0,
    `every category at autonomy_tier 1 — no other tier implemented (${offTier.length} off)`)

  const noCats = Object.entries(contracts).filter(([, c]) =>
    !c.proposal_categories || c.proposal_categories === '[]')
  check(noCats.length === 0,
    `every agent declares its proposal categories (${noCats.length} missing)`)

  console.log('\n── Law 1: one call site ──────────────────────────────────────')
  // Prove the mechanism, never the silence: grep for callers rather than trusting
  // that nobody added one.
  const apiFiles = readdirSync('api').filter(f => f.endsWith('.ts'))
  const shared = readdirSync('api/_shared').filter(f => f.endsWith('.ts'))
  let strayCall = []
  for (const f of [...apiFiles.map(f => `api/${f}`), ...shared.map(f => `api/_shared/${f}`)]) {
    if (f.endsWith('ai-common.ts')) continue
    const src = readFileSync(f, 'utf8')
    if (/\bcallModel\s*\(/.test(src)) strayCall.push(f)
  }
  check(strayCall.length === 0,
    `LAW 1 — callModel has no caller outside ai-common (${strayCall.join(', ') || 'none'})`)

  console.log('\n── Law 9: resolved against the register, never trusted ───────')
  // Two defects in one session shared a cause: an agent was asked for a key its
  // declared input could not supply, answered at the grain it had, and the
  // assembler wrote the answer down unchecked. Sixteen proposals would have been
  // marked ratified while writing nothing.
  //
  // Both halves of the enforcement are scanned, because either alone still ends
  // in a silent success: the ASSEMBLER must resolve a key before storing it, and
  // the RATIFICATION SURFACE must refuse to settle a proposal that resolves to
  // nothing. Grep the mechanism rather than trusting that it is still there.
  const asm = readFileSync('classify-project.mjs', 'utf8')
  check(/typeSet\.has\(/.test(asm) && /unitsByCategory\.get\(/.test(asm),
    'LAW 9 — the assembler resolves every returned key against the register')
  check(/dropped .* unknown/.test(asm),
    'LAW 9 — an unresolvable key is dropped with a logged reason, not written')

  const surface = readFileSync('src/components/cxindex/ApplicabilityReview.tsx', 'utf8')
  check(/!units\.length \|\| !targets\.length/.test(surface) &&
        /Cannot ratify/.test(surface),
    'LAW 9 — ratifying something that resolves to nothing FAILS rather than no-ops')

  console.log('\n── Ledger ────────────────────────────────────────────────────')
  const { error: ledErr } = await adm.from('agent_feedback').select('id').limit(1)
  check(!ledErr, `agent_feedback readable by staff${ledErr ? ': ' + ledErr.message : ''}`)

  const { data: hv, error: hvErr } = await adm.from('agent_health').select('*').limit(1)
  check(!hvErr, `agent_health view readable${hvErr ? ': ' + hvErr.message : ''}`)

  // Seed a cluster: three EDITS of the same category, which is the pattern the
  // harvest is meant to notice.
  const SEED = [
    { before: 'The systems shall be commissioned as required.',
      after:  'Isotherm will commission the systems listed in the Cx Index.' },
    { before: 'Testing shall be performed as required by the specification.',
      after:  'Isotherm will perform functional testing per the approved procedures.' },
    { before: 'The contractor shall provide documentation as required.',
      after:  'The mechanical contractor shall provide start-up reports.' },
  ]
  for (const [i, s] of SEED.entries()) {
    const { data, error } = await adm.from('agent_feedback').insert({
      agent_key: 'writer', category: 'narrative-draft',
      project_id: zz.id, subject_ref: `ZZ-SEED-${i}`,
      disposition: 'edited', before_text: s.before, after_text: s.after,
    }).select('id').single()
    if (error) { check(false, `seed feedback: ${error.message}`); break }
    seeded.push(data.id)
  }
  check(seeded.length === 3, `seeded ${seeded.length} corrections into the ledger`)

  const { data: health } = await adm.from('agent_health')
    .select('*').eq('agent_key', 'writer').eq('category', 'narrative-draft').maybeSingle()
  check(!!health && health.reviewed >= 3,
    `health view aggregates PER CATEGORY (writer/narrative-draft reviewed=${health?.reviewed ?? 0})`)
  check(health?.edit_pct != null, `edit rate computed (${health?.edit_pct}%)`)

  // A category nobody has fed must be ABSENT rather than zero-filled — a rate of
  // 0% and "no data yet" are different claims.
  const { data: unfed } = await adm.from('agent_health')
    .select('*').eq('agent_key', 'classifier').maybeSingle()
  check(!unfed, 'an unfed category has NO health row (absent, not a misleading 0%)')

  console.log('\n── Librarian ─────────────────────────────────────────────────')
  const token = await apiToken(adminCredentials())
  const post = async (body) => {
    const r = await fetch(`${BASE_URL}/api/librarian-harvest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return { status: r.status, body: await r.json().catch(() => ({})) }
  }

  // The threshold is a real gate: raise it above the seed and the harvest must
  // decline to invent a pattern.
  const high = await post({ min_cluster: 99 })
  check(high.status === 200 && high.body.proposals === 0,
    `threshold respected — nothing harvested below ${99} (${high.body.note ?? high.status})`)

  if (REAL_AI) {
    console.log('\n  --real-ai: running ONE real harvest…')
    const h = await post({ min_cluster: 3 })
    check(h.status === 200, `harvest returned 200 (${h.status})`)
    check((h.body.clusters ?? 0) >= 1, `clustered the seeded corrections (${h.body.clusters})`)
    check((h.body.proposals ?? 0) >= 1,
      `THE GATE — one harvest on seeded feedback produced a proposal (${h.body.proposals})`)
    console.log(`  cost: ${h.body.cost_cents ?? '?'}c`)

    const { data: props } = await adm.from('firm_corrections')
      .select('scope, proposed, evidence, status, applied_at')
      .eq('harvest_run', h.body.harvest_run)
    check((props ?? []).every(p => p.status === 'proposed'),
      'proposals land as PROPOSED — the librarian never writes to the corpus')
    check((props ?? []).every(p => p.applied_at === null),
      'ratified-is-not-applied: applied_at NULL on every new proposal')
    check((props ?? []).every(p => Array.isArray(p.evidence) && p.evidence.length > 0),
      'every proposal carries evidence (contract-enforced)')
    for (const p of (props ?? []).slice(0, 2)) {
      console.log(`    ${p.scope}: ${String(p.proposed).slice(0, 90)}`)
    }
    for (const p of props ?? []) seeded.push(`fc:${p.id ?? ''}`)
    await adm.from('firm_corrections').delete().eq('harvest_run', h.body.harvest_run)
  } else {
    console.log('  (skipping the real harvest — pass --real-ai to run it)')
  }

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  for (const id of seeded.filter(x => !String(x).startsWith('fc:'))) {
    await adm.from('agent_feedback').delete().eq('id', id)
  }
  const { data: left } = await adm.from('agent_feedback')
    .select('id').like('subject_ref', 'ZZ-SEED-%')
  check((left ?? []).length === 0, `self-clean: seeded feedback removed (${(left ?? []).length} left)`)
}

console.log('\n' + '='.repeat(64))
console.log(fail === 0
  ? `PASS — agent architecture: registry parses, laws structural, ledger per-category. ${pass} checks.`
  : `FAIL — ${fail} of ${pass + fail} checks failed.`)
process.exit(fail === 0 ? 0 : 1)
