// pw-drafter — AI-drafted starter field sets (Update 1.02, item 2).
//
//   node --env-file=.env pw-drafter.mjs              (BARE — no model spend)
//   node --env-file=.env pw-drafter.mjs --real-ai    (one real draft, ~2-4c)
//
// The battery runs this BARE, for the same reason it runs pw-extractor bare: a
// suite that bills on every commit gets run less often, and "less often" is how
// a harness stops being a harness. Bare still proves everything that does not
// need a model — the contract, the refusals, and that the endpoint writes
// NOTHING on its own.
//
// The claims:
//   1. The contract declares what the architecture requires of it (prose class,
//      tier 1, its own proposal category, the Law-9 input schema).
//   2. The endpoint REFUSES: not staff, unknown type, and — the one that
//      matters — a type that already has a table.
//   3. It PROPOSES, NEVER WRITES. A draft leaves equipment_type_field_defs
//      exactly as it found it; only the human's approve inserts.
//   4. --real-ai: a real draft excludes __base, gives every field a column, and
//      the approve path writes defs and feeds the ledger.
//
// ZZ-TEST only. The throwaway type is minted and removed in `finally`.
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { adminCredentials, credentials, BASE_URL } from './pw-config.mjs'

const REAL = process.argv.includes('--real-ai')
const fails = []
let passed = 0
const check = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg)
}

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: sess } = await adm.auth.signInWithPassword(adminCredentials())
const token = sess?.session?.access_token

const post = async (body, tok = token) => {
  const r = await fetch(`${BASE_URL}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const TMP_KEY = 'zz_drafter_probe'
let minted = false

try {
  // ── 1. the contract ───────────────────────────────────────────────────────
  const contract = await readFile('firm-knowledge/agents/drafter.md', 'utf8')
  const fm = contract.slice(0, contract.indexOf('---', 4))

  check(/budget_class:\s*prose/.test(fm),
    'the drafter declares budget_class: prose — the latency lesson, applied from a ' +
    'bounded question rather than a preference')
  check(/autonomy_tier:\s*1/.test(fm),
    'autonomy_tier 1 — individually ratified, like every category')
  check(/proposal_categories:\s*\[field-def-set\]/.test(fm),
    'its own proposal category, so the ledger and health view read it separately')
  check(/input_schema:\s*FieldSetDraftInput/.test(fm) &&
        /review_surface:\s*equipment_type_field_defs/.test(fm),
    'input schema and review surface are declared')

  // LAW 9 AT THE SHAPE. Asserted against the validator's source because the
  // validator is TypeScript and this harness is Node — named plainly rather
  // than dressed up as a behavioural test.
  const schemas = await readFile('api/_shared/agent-schemas.ts', 'utf8')
  const validator = schemas.slice(schemas.indexOf('export const FieldSetDraftInput'))
    .slice(0, 600)
  check(/base_field_names/.test(validator) && /length > 0/.test(validator),
    'LAW 9 — FieldSetDraftInput REQUIRES a non-empty base_field_names: a draft told ' +
    'not to duplicate __base cannot be asked for without being told what __base holds')

  // ── 2. the refusals ───────────────────────────────────────────────────────
  const noAuth = await post({ action: 'draft-field-set', type_key: 'pump' }, null)
  check(noAuth.status === 401 || noAuth.status === 403,
    `an unauthenticated draft is refused (${noAuth.status})`)

  const unknown = await post({ action: 'draft-field-set', type_key: 'zz_not_a_type' })
  check(unknown.status === 404,
    `an unknown type is refused before any spend (${unknown.status})`)

  // THE REFUSAL THAT MATTERS. Approving a draft for a type already in use would
  // silently compete with defs on real projects.
  const { count: pumpDefs } = await adm.from('equipment_type_field_defs')
    .select('id', { count: 'exact', head: true }).eq('equipment_type', 'pump')
  const occupied = await post({ action: 'draft-field-set', type_key: 'pump' })
  check(occupied.status === 409 && /already has/.test(occupied.body.error ?? ''),
    `a type that already has ${pumpDefs} defs is refused, with the count named ` +
    `(${occupied.status}: ${String(occupied.body.error ?? '').slice(0, 60)})`)

  const bad = await post({ action: 'zz-nonsense' })
  check(bad.status === 400 && /draft-field-set/.test(bad.body.error ?? ''),
    'the action allow-list names the valid actions rather than failing vaguely')

  // ── 3. proposes, never writes ─────────────────────────────────────────────
  const { count: afterRefusals } = await adm.from('equipment_type_field_defs')
    .select('id', { count: 'exact', head: true }).eq('equipment_type', 'pump')
  check(afterRefusals === pumpDefs,
    `the refused calls wrote nothing (${pumpDefs} -> ${afterRefusals})`)

  if (!REAL) {
    console.log('\n  (bare run — the drafting leg needs --real-ai and costs ~2-4c)')
  } else {
    // ── 4. one real draft ───────────────────────────────────────────────────
    const maxOrder = 9000
    const { error: mintErr } = await adm.from('equipment_types')
      .insert({ key: TMP_KEY, name: 'ZZ Drafter Probe Convector', sort_order: maxOrder })
    if (mintErr) throw new Error(`could not mint the probe type: ${mintErr.message}`)
    minted = true

    const drafted = await post({ action: 'draft-field-set', type_key: TMP_KEY })
    check(drafted.status === 200 && Array.isArray(drafted.body.fields) && drafted.body.fields.length > 0,
      `a real draft returns fields (${drafted.status}, ${drafted.body.fields?.length ?? 0} fields)`)

    const fields = drafted.body.fields ?? []
    // ARRIVAL BEFORE PROPERTIES. Every check below is a `.every()` or a length
    // bound, and all of them pass VACUOUSLY on an empty array — which is exactly
    // what happened on the first real run: the draft 502'd and four assertions
    // went green on zero fields. Stop here instead.
    if (!fields.length) {
      throw new Error(
        `no fields returned (${drafted.status}: ${drafted.body.error ?? 'no error given'}) ` +
        `- refusing to assert properties of an empty draft`)
    }
    const { data: baseDefs } = await adm.from('equipment_type_field_defs')
      .select('field_name').eq('equipment_type', '__base')
    const baseNames = new Set((baseDefs ?? []).map(d => d.field_name.toLowerCase()))
    check(fields.every(f => !baseNames.has(f.field_name.trim().toLowerCase())),
      'no drafted field duplicates the universal identity set')
    check(fields.every(f => Array.isArray(f.sections) && f.sections.length > 0),
      'every drafted field belongs to at least one column — a field in none would ' +
      'render nowhere, which is a draft that "succeeded" and shows nothing')
    check(fields.length <= 20,
      `the draft is field-worthy, not exhaustive (${fields.length} fields)`)

    // STILL NOTHING WRITTEN. The endpoint proposed; only the human's approve writes.
    const { count: beforeApprove } = await adm.from('equipment_type_field_defs')
      .select('id', { count: 'exact', head: true }).eq('equipment_type', TMP_KEY)
    check((beforeApprove ?? 0) === 0,
      `the draft wrote NOTHING — law 2 (${beforeApprove} defs after drafting)`)

    // The approve path, as the component performs it.
    const rows = fields.flatMap((f, i) => f.sections.map(section => ({
      equipment_type: TMP_KEY, section, field_name: f.field_name.trim(),
      unit: f.unit ?? null, unit_imperial: f.unit_imperial ?? null, sort_order: i + 1,
    })))
    const { error: insErr } = await adm.from('equipment_type_field_defs').insert(rows)
    check(!insErr, `approve writes the defs (${insErr?.message ?? `${rows.length} rows`})`)

    const { count: afterApprove } = await adm.from('equipment_type_field_defs')
      .select('id', { count: 'exact', head: true }).eq('equipment_type', TMP_KEY)
    check((afterApprove ?? 0) === rows.length,
      `the defs are there after approve (${afterApprove})`)

    // A second draft for the same type is now refused — the 409 above, reached
    // by the real path rather than by a fixture.
    const second = await post({ action: 'draft-field-set', type_key: TMP_KEY })
    check(second.status === 409,
      `a second draft for the now-populated type is refused (${second.status})`)
  }

} finally {
  await adm.from('equipment_type_field_defs').delete().eq('equipment_type', TMP_KEY)
  if (minted) await adm.from('equipment_types').delete().eq('key', TMP_KEY)
}

console.log(`\n  ${passed} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1) }
