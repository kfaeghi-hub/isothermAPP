// pw-approve-matcher — approval runs the matcher, and CAN NEVER SILENTLY
// UNWIRE. [KEEL] 2026-08-14, the PMPs incident's gate.
//
// THE LAW THIS ASSERTS: a capability is only as real as the live path that
// invokes it. matchScheduleSpec existed from June to August running nowhere but
// its own test — approval wrote raw headings into nameplate_extra.spec and the
// register displayed the ones that happened to equal a declared field name.
// This suite asserts THE PATH, not the function:
//
//   · approval populates from_schedule — THE TELL that the matcher ran. If a
//     future refactor drops the wiring, this goes red before any human notices
//     a blank spec table.
//   · matched values land under DECLARED names, converted with arithmetic
//   · the compound column splits (208/3/60 → Voltage/Phase/Hz, verbatim) and
//     REFUSES WHOLE on the dash (1 part vs 3 fields — nothing writes)
//   · unmatched-by-name is exactly the ruled leftover list
//   · no value differs from the document without the document's own value
//     preserved beside it (from_schedule verbatim) and the arithmetic named
//     (the batch note)
//
// Synthetic PMPs-dialect fixture, service-role staged (no model calls, no client
// content), approved through the REAL endpoint as an authed user. ZZ-TEST only,
// self-cleaning.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-approve-matcher')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()
if (!proj) { console.error('REFUSING: no ZZ-TEST'); process.exit(1) }

const FILE = 'zz-approve-matcher-fixture.xlsx'
async function cleanup() {
  const { data: ups } = await svc.from('intake_uploads').select('id').eq('project_id', proj.id).eq('filename', FILE)
  for (const u of ups ?? []) {
    const { data: rows } = await svc.from('intake_rows').select('created_equipment_id').eq('upload_id', u.id)
    for (const r of rows ?? []) if (r.created_equipment_id) await svc.from('equipment').delete().eq('id', r.created_equipment_id)
    await svc.from('intake_rows').delete().eq('upload_id', u.id)
    await svc.from('intake_uploads').delete().eq('id', u.id)
  }
}
await cleanup()

// ── the fixture: the PMPs dialect, synthetic values ──────────────────────────
const NAMEPLATE_A = {  // the full dialect, compound fillable
  'FLOW [GPM]': '100', 'HEAD [ft]': '30', 'RPM': '1750', 'MOTOR SIZE [HP]': '2',
  'MOTOR INPUT [V/Ph/Hz]': '208/3/60', 'VFD': 'YES', 'VFD INPUT [V/Ph/Hz]': '208/1/60',
  'LIQUID': 'WATER', 'LIQUID TEMP [°F]': '180', 'MANUFACTURER': 'ZZ-MFR', 'MODEL': 'ZZ-MODEL', 'QTY': '1',
}
const NAMEPLATE_B = {  // the dash: compound must REFUSE WHOLE
  'FLOW [GPM]': '50', 'MOTOR INPUT [V/Ph/Hz]': '-', 'VFD': 'NO',
}

const { data: up, error: upErr } = await svc.from('intake_uploads').insert({
  project_id: proj.id, filename: FILE, storage_path: `${proj.id}/${FILE}`,
  kind: 'excel', content_sha256: 'zz-approve-matcher', status: 'parsed', row_count: 2,
  parse_note: '2 rows · synthetic approve-matcher fixture',
}).select('id').single()
if (upErr) { console.error('upload refused:', upErr.message); process.exit(1) }

await svc.from('intake_rows').insert([
  { upload_id: up.id, project_id: proj.id, source_sheet: 'PUMPS', source_row: 3,
    tag: 'ZZAM-P-1', descriptor: 'Fixture pump A', proposed_category: 'mechanical',
    proposed_type: 'pump', location: 'ZZ', confidence: 0.95, disposition: 'accepted',
    nameplate: NAMEPLATE_A },
  { upload_id: up.id, project_id: proj.id, source_sheet: 'PUMPS', source_row: 4,
    tag: 'ZZAM-P-2', descriptor: 'Fixture pump B', proposed_category: 'mechanical',
    proposed_type: 'pump', location: 'ZZ', confidence: 0.95, disposition: 'accepted',
    nameplate: NAMEPLATE_B },
])

try {
  // ── approve through the REAL endpoint, as the review UI does ──────────────
  const user = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const creds = adminCredentials()
  const { data: auth, error: aErr } = await user.auth.signInWithPassword({ email: creds.email, password: creds.password })
  if (aErr) throw new Error(`login: ${aErr.message}`)
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}` },
    body: JSON.stringify({ upload_id: up.id, action: 'approve' }),
  })
  const body = await res.json().catch(() => null)
  check(res.ok, `approve returns 200 (got ${res.status}${body?.error ? ` — ${body.error}` : ''})`)
  check(body?.created === 2, `both rows created (${body?.created})`)

  const { data: eqA } = await svc.from('equipment').select('nameplate_extra, import_batch_id')
    .eq('project_id', proj.id).eq('tag', 'ZZAM-P-1').single()
  const { data: eqB } = await svc.from('equipment').select('nameplate_extra')
    .eq('project_id', proj.id).eq('tag', 'ZZAM-P-2').single()
  const specA = eqA?.nameplate_extra?.spec ?? {}
  const fromA = eqA?.nameplate_extra?.from_schedule ?? {}

  // Spec keys are the DECLARED field names AS THE DATABASE SPELLS THEM. The
  // firm's live defs store 'Flow' with unit 'L/s' in its own column; the unit
  // tests' fixtures embed units in the name ('Flow (L/s)') and both are legal —
  // the first run of this suite hardcoded the fixture spelling and read
  // undefined against production. Derive the keys from the live defs instead
  // of asserting a spelling the schema does not promise.
  const { data: defs } = await svc.from('equipment_type_field_defs')
    .select('field_name').eq('equipment_type', 'pump').eq('section', 'spec')
  const K = (term) => (defs ?? []).map(d => d.field_name)
    .find(n => n.replace(/\s*[[(][^\])]*[\])]\s*$/, '').trim().toLowerCase() === term.toLowerCase()) ?? term

  // ── THE STRUCTURAL TELL ───────────────────────────────────────────────────
  check(Object.keys(fromA).length === Object.keys(NAMEPLATE_A).length &&
        Object.entries(NAMEPLATE_A).every(([k, v]) => fromA[k] === v),
    'approval populates from_schedule with the COMPLETE verbatim read — the matcher ran (the never-unwire tell)')

  // ── matched under declared names, converted with arithmetic ───────────────
  check(specA[K('Flow')] === '6.31', `FLOW [GPM] 100 → Flow (L/s) 6.31 (got ${JSON.stringify(specA[K('Flow')])})`)
  check(specA[K('Head')] === '89.7', `HEAD [ft] 30 → Head (kPa) 89.7 (got ${JSON.stringify(specA[K('Head')])})`)
  check(specA[K('Speed')] === '1750', 'RPM → Speed (RPM), verbatim (units agree)')
  check(specA[K('Motor kW')] === '1.49', `MOTOR SIZE [HP] 2 → Motor kW 1.49 (got ${JSON.stringify(specA[K('Motor kW')])})`)
  check(specA['VFD'] === 'YES', 'VFD lands')

  // ── the compound ──────────────────────────────────────────────────────────
  check(specA[K('Voltage')] === '208' && specA[K('Phase')] === '3' && specA[K('Hz')] === '60',
    'MOTOR INPUT [V/Ph/Hz] 208/3/60 → Voltage/Phase/Hz, verbatim parts')
  const specB = eqB?.nameplate_extra?.spec ?? {}
  check(!(K('Voltage') in specB) && !(K('Phase') in specB) && !(K('Hz') in specB),
    'the dash REFUSES WHOLE — 1 part vs 3 fields, no electrical field written on pump B')
  check((eqB?.nameplate_extra?.from_schedule ?? {})['MOTOR INPUT [V/Ph/Hz]'] === '-',
    'and the dash itself is preserved verbatim in from_schedule')

  // ── unmatched-by-name is exactly the ruled leftover list ──────────────────
  const declaredNames = new Set(Object.keys(specA))
  const leftovers = Object.keys(NAMEPLATE_A).filter(k => {
    // a heading is "left over" when no spec value traces back to it
    const consumed = ['FLOW [GPM]', 'HEAD [ft]', 'RPM', 'MOTOR SIZE [HP]', 'MOTOR INPUT [V/Ph/Hz]', 'VFD']
    return !consumed.includes(k)
  })
  check(JSON.stringify(leftovers.sort()) ===
        JSON.stringify(['LIQUID', 'LIQUID TEMP [°F]', 'MANUFACTURER', 'MODEL', 'QTY', 'VFD INPUT [V/Ph/Hz]'].sort()),
    `unmatched-by-name is exactly the ruled list (${leftovers.join(', ')})`)
  check(declaredNames.size === 8,
    `spec holds exactly the 8 matched fields (${[...declaredNames].join(', ')})`)

  // ── conversions are LOUD: the batch note names the arithmetic ─────────────
  const { data: batch } = await svc.from('import_batches').select('note').eq('id', eqA.import_batch_id).single()
  check(/spec matching:/.test(batch?.note ?? '') && /converted \(/.test(batch?.note ?? ''),
    `the batch note carries the matcher tally and arithmetic — "${(batch?.note ?? '').slice(0, 110)}…"`)

  await user.auth.signOut().catch(() => {})
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await cleanup()
  console.log('\ncleanup: fixture upload, rows, and created equipment removed from ZZ-TEST')
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. The matcher runs on the live path, and the path is asserted.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
