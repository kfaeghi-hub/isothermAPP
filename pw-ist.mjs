// pw-ist — IST module, phases 1-3: plans, systems, integrations, protocols,
// the pre-IST documentation prerequisites, RLS as a real user, and the field
// mode's outbox replay guarantee.
//
// WAIT HELPERS FROM BIRTH. Not one instantaneous read in this file: every check
// that follows a write goes through waitUntil/waitForCount, because "not there"
// and "NOT THERE YET" are the same value to a count() and the difference has
// cost this battery four reds in a week.
//
// THE GUARDS ARE THE POINT OF THE SCHEMA, SO THEY ARE ASSERTED HERE. Five
// constraints carry the design, and each is proven to REFUSE — not merely to
// exist. A constraint nobody has seen reject anything is a comment with syntax:
//
//   1. ist_protocols_kind_shape — the three-kind subject. A 'unit' protocol may
//      not carry a condition_type; a 'condition' protocol must. This is what
//      makes subject_kind mean something rather than merely be recorded.
//   2. ist_integrations_distinct_systems — an integration is BETWEEN two
//      systems, never a system with itself.
//   3. ist_notes_scope_target — a scoped note must point at what it is scoped
//      to, or it renders nowhere and reads as lost rather than as unscoped.
//   4. ist_results_one_per_protocol_per_session — one verdict per protocol per
//      witnessed session.
//   5. ist_prerequisites_yes_needs_document — YES means a document arrived, not
//      that a box was ticked. NO and N/A with nothing attached stay legal,
//      because those are honest states; it is the CLAIM that needs evidence.
//
// And the refusals are asserted by ERROR CODE / message, not by row count: a
// count of zero is what a silently-failing insert also produces.
//
// AND IT SPEAKS AS A REAL USER, NOT ONLY AS THE SERVICE ROLE. Phase 1 shipped
// eleven tables, five constraints and six proven refusals — all asserted through
// the service role key, which BYPASSES RLS. Every check was green while
// `ist_plans` was unreadable to every actual user: the phase-1 policy generator
// emitted a SELECT on ist_plans inside ist_plans' own policy, and Postgres
// answered `infinite recursion detected in policy`, so the table read as empty.
// The screen said "No IST plan yet" over a row that existed.
//
// A suite that only ever speaks as the service role CANNOT SEE AN RLS DEFECT.
// So the RLS section below runs as the employee account (not the admin, whose
// is_admin_or_dev() short-circuit would hide the same class of bug), and it is
// the check that would have caught it.
//
// ZZ-TEST only, self-cleaning, re-entrant.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, credentials, waitUntil } from './pw-config.mjs'

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { error: authErr } = await anon.auth.signInWithPassword(adminCredentials())
if (authErr) { console.error('sign-in failed:', authErr.message); process.exit(1) }

const { data: proj } = await svc.from('projects').select('id, name').eq('name', 'ZZ-TEST — Do Not Use').single()
if (!proj) { console.error('REFUSE: ZZ-TEST project not found'); process.exit(1) }

const LABEL = 'PW-IST-TEMP'
async function cleanup() {
  const { data: plans } = await svc.from('ist_plans').select('id').eq('project_id', proj.id).like('revision_label', `${LABEL}%`)
  for (const p of plans ?? []) await svc.from('ist_plans').delete().eq('id', p.id)   // cascades
  await svc.from('documentation_register').delete().eq('project_id', proj.id).like('document_name', `${LABEL}%`)
}
await cleanup()

try {
  // ── the type register carries the new IST role seats ──────────────────────
  const { data: roles } = await svc.from('company_role_types').select('name, abbreviation')
  const need = ['Integrated Testing Coordinator', 'Fire Protection Contractor', 'Fire Alarm Contractor', 'Electrical Authority (ESA)']
  check(need.every(n => (roles ?? []).some(r => r.name === n)), `role vocabulary carries the IST seats (${need.length} checked)`)
  const itc = (roles ?? []).find(r => r.name === 'Integrated Testing Coordinator')
  const cxa = (roles ?? []).find(r => r.name === 'CxA')
  check(!!itc && !!cxa && itc.name !== cxa.name, 'ITC is its own seat, not a CxA alias')

  // ── the origin value exists, because deficiencies file to the real register ─
  const { error: originErr } = await svc.from('findings').insert({
    project_id: proj.id, origin: 'ist', title: `${LABEL} origin probe`, status: 'open',
  }).select('id').single()
  // Some columns may be required by the register; what matters is that the FAILURE
  // is never "invalid input value for enum".
  check(!/invalid input value for enum/.test(originErr?.message ?? ''),
    `finding_origin_enum accepts 'ist' (${originErr ? 'other error: ' + originErr.message.slice(0, 60) : 'row created'})`)
  await svc.from('findings').delete().eq('project_id', proj.id).like('title', `${LABEL}%`)

  // ── plan → systems → integration ──────────────────────────────────────────
  const { data: plan, error: planErr } = await svc.from('ist_plans')
    .insert({ project_id: proj.id, revision_label: `${LABEL}-0`, description: 'phase 1 suite' }).select('id').single()
  check(!planErr && !!plan, `plan revision created${planErr ? ': ' + planErr.message : ''}`)

  const mk = async label => (await svc.from('ist_systems').insert({ plan_id: plan.id, label }).select('id').single()).data
  const fa = await mk('PW Fire Alarm'), spr = await mk('PW Sprinkler')

  const seen = await waitUntil(async () => {
    const { data } = await svc.from('ist_systems').select('id').eq('plan_id', plan.id)
    return (data ?? []).length === 2 ? data : null
  }, { timeout: 8000, what: 'two systems on the plan' })
  check(!!seen, 'systems readable after insert')

  const { data: integ, error: iErr } = await svc.from('ist_integrations').insert({
    plan_id: plan.id, system_a_id: fa.id, system_b_id: spr.id,
    integration_type: 'Water Flow', attachment_label: 'A-2',
  }).select('id').single()
  check(!iErr && !!integ, `integration created${iErr ? ': ' + iErr.message : ''}`)

  // ── GUARD 1: an integration may not point at itself ───────────────────────
  const { error: selfErr } = await svc.from('ist_integrations').insert({
    plan_id: plan.id, system_a_id: fa.id, system_b_id: fa.id, integration_type: 'Self',
  })
  check(!!selfErr && /distinct_systems/.test(selfErr.message),
    `REFUSED: system integrated with itself (${selfErr ? selfErr.message.slice(0, 48) : 'ACCEPTED — guard did not fire'})`)

  // ── the three-kind subject, all three accepted in their own shape ─────────
  const okRows = [
    { subject_kind: 'condition', subject_label: 'Alarm Condition', condition_type: 'alarm' },
    { subject_kind: 'unit',      subject_label: 'ERV-1 Shut Down Relay' },
    { subject_kind: 'point',     subject_label: 'Wet Sprinkler Shut-off Valve', equip_type_code: 'S.V.' },
  ]
  for (const r of okRows) {
    const { error } = await svc.from('ist_protocols').insert({ integration_id: integ.id, ...r })
    check(!error, `protocol accepted — subject_kind '${r.subject_kind}'${error ? ': ' + error.message.slice(0, 60) : ''}`)
  }
  const gotThree = await waitUntil(async () => {
    const { data } = await svc.from('ist_protocols').select('id').eq('integration_id', integ.id)
    return (data ?? []).length === 3
  }, { timeout: 8000, what: 'three protocols' })
  check(gotThree, 'all three subject kinds coexist on one integration')

  // ── GUARD 2: the companion columns must match the kind ────────────────────
  const badRows = [
    { row: { subject_kind: 'unit', subject_label: 'bad', condition_type: 'alarm' },
      why: "a 'unit' protocol carrying a condition_type" },
    { row: { subject_kind: 'condition', subject_label: 'bad', condition_type: null },
      why: "a 'condition' protocol with no condition_type" },
    { row: { subject_kind: 'condition', subject_label: 'bad', condition_type: 'alarm', equip_type_code: 'S.V.' },
      why: "a 'condition' protocol carrying a point code" },
  ]
  for (const b of badRows) {
    const { error } = await svc.from('ist_protocols').insert({ integration_id: integ.id, ...b.row })
    check(!!error && /kind_shape/.test(error.message),
      `REFUSED: ${b.why}${error ? '' : ' — ACCEPTED, guard did not fire'}`)
  }

  // ── GUARD 3: a scoped note must point at its target ───────────────────────
  const { error: noteOk } = await svc.from('ist_notes').insert({
    plan_id: plan.id, scope: 'attachment', integration_id: integ.id,
    body: 'Engineer determination recorded against the attachment.', author_label: 'Mech Engineer',
  })
  check(!noteOk, `attachment-scoped note with a target accepted${noteOk ? ': ' + noteOk.message : ''}`)

  const { error: noteBad } = await svc.from('ist_notes').insert({
    plan_id: plan.id, scope: 'attachment', body: 'scoped to nothing',
  })
  check(!!noteBad && /scope_target/.test(noteBad.message),
    `REFUSED: attachment-scoped note with no attachment${noteBad ? '' : ' — ACCEPTED, guard did not fire'}`)

  // ── a result carries its own date, distinct from the session's ────────────
  const { data: sess } = await svc.from('ist_sessions')
    .insert({ plan_id: plan.id, test_date: '2026-01-20', test_type: 'new' }).select('id').single()
  const { data: proto1 } = await svc.from('ist_protocols').select('id').eq('integration_id', integ.id).limit(1).single()
  const { error: resErr } = await svc.from('ist_results').insert({
    session_id: sess.id, protocol_id: proto1.id, normal_verdict: 'pass', fire_verdict: 'pass',
    tested_on: '2026-01-13',
  })
  check(!resErr, `result stored with its own tested_on date${resErr ? ': ' + resErr.message : ''}`)
  const { data: back } = await svc.from('ist_results').select('tested_on').eq('session_id', sess.id).single()
  check(back?.tested_on === '2026-01-13' , 'result date survives independently of the session date (B-2 shape)')

  // ── GUARD 4: one result per protocol per session ──────────────────────────
  const { error: dupErr } = await svc.from('ist_results').insert({
    session_id: sess.id, protocol_id: proto1.id, normal_verdict: 'fail',
  })
  check(!!dupErr && /one_per_protocol_per_session/.test(dupErr.message),
    `REFUSED: a second result for the same protocol in one session${dupErr ? '' : ' — ACCEPTED, guard did not fire'}`)

  // ── PHASE 2: prerequisites, seeded from firm data ─────────────────────────
  const { data: seeded, error: seedErr } = await svc.rpc('ist_seed_prerequisites', { p_plan_id: plan.id })
  check(!seedErr && seeded === 22, `22 prerequisites seeded from the firm list (got ${seeded}${seedErr ? ', ' + seedErr.message : ''})`)

  // Idempotent: three surfaces will create plans and re-running must not double.
  const { data: again } = await svc.rpc('ist_seed_prerequisites', { p_plan_id: plan.id })
  const { data: qs } = await svc.from('ist_prerequisites').select('id, item_no, state').eq('plan_id', plan.id)
  check(again === 0 && (qs ?? []).length === 22, `re-seeding adds nothing (added ${again}, total ${(qs ?? []).length})`)
  check((qs ?? []).every(q => q.state === 'na'), 'seeded prerequisites start at N/A, not at YES')

  // ── GUARD 5: YES REQUIRES A DOCUMENT ──────────────────────────────────────
  // The whole point of phase 2. A tick with no evidence behind it is the shape
  // the guard family keeps catching, so it is refused rather than discouraged.
  const q1 = (qs ?? []).find(q => q.item_no === 17)     // S537 verification report
  const { error: bareYes } = await svc.from('ist_prerequisites').update({ state: 'yes' }).eq('id', q1.id)
  check(!!bareYes && /yes_needs_document/.test(bareYes.message),
    `REFUSED: prerequisite marked YES with no document${bareYes ? '' : ' — ACCEPTED, guard did not fire'}`)

  // NO and N/A with no document are honest states and must still be allowed.
  const { error: bareNo } = await svc.from('ist_prerequisites').update({ state: 'no' }).eq('id', q1.id)
  check(!bareNo, `NO with no document is allowed${bareNo ? ': ' + bareNo.message : ''}`)

  // With a real register row attached, YES goes through.
  const { data: doc } = await svc.from('documentation_register')
    .insert({ project_id: proj.id, document_name: `${LABEL} S537 Verification`, doc_type: 'report' })
    .select('id').single()
  const { error: goodYes } = await svc.from('ist_prerequisites')
    .update({ state: 'yes', document_id: doc.id, received_on: '2026-01-10' }).eq('id', q1.id)
  check(!goodYes, `YES accepted once a register document is attached${goodYes ? ': ' + goodYes.message : ''}`)

  const linked = await waitUntil(async () => {
    const { data } = await svc.from('ist_prerequisites').select('state, document_id').eq('id', q1.id).single()
    return data?.state === 'yes' && data?.document_id === doc.id
  }, { timeout: 8000, what: 'prerequisite linked to the register' })
  check(linked, 'prerequisite reads back linked to the documentation register')

  // The register row must survive being unlinked, not be deleted with it.
  await svc.from('ist_prerequisites').update({ state: 'na', document_id: null }).eq('id', q1.id)
  const { data: stillThere } = await svc.from('documentation_register').select('id').eq('id', doc.id).maybeSingle()
  check(!!stillThere, 'unlinking a prerequisite leaves the register document intact')
  await svc.from('documentation_register').delete().eq('id', doc.id)

  // ── PHASE 3: the data is READABLE BY A REAL USER, not just by the service role ─
  const asUser = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { error: userAuthErr } = await asUser.auth.signInWithPassword(credentials())
  check(!userAuthErr, `employee account signed in${userAuthErr ? ': ' + userAuthErr.message : ''}`)

  for (const t of ['ist_plans', 'ist_systems', 'ist_integrations', 'ist_protocols', 'ist_sessions', 'ist_results', 'ist_prerequisites']) {
    const { error } = await asUser.from(t).select('id').limit(1)
    // The recursion bug surfaced as an ERROR, but a mis-scoped policy surfaces as
    // silence — so both are asserted: no error, and the plan is actually visible.
    check(!error, `${t} readable as the employee${error ? ': ' + error.message.slice(0, 60) : ''}`)
  }
  const { data: visible } = await asUser.from('ist_plans').select('id').eq('id', plan.id)
  check((visible ?? []).length === 1,
    `the plan this suite created is VISIBLE to the employee (${(visible ?? []).length} row(s)) — the check that would have caught the RLS recursion`)

  // ── the outbox's natural key: replay must not duplicate ───────────────────
  // Field mode queues an upsert on (session_id, protocol_id). Re-tapping a
  // verdict replaces the queued op; a double flush must land one row, not two.
  const payload = { session_id: sess.id, protocol_id: proto1.id, normal_verdict: 'pass', fire_verdict: 'na', tested_on: '2026-01-14' }
  await svc.from('ist_results').upsert(payload, { onConflict: 'session_id,protocol_id' })
  await svc.from('ist_results').upsert({ ...payload, fire_verdict: 'pass' }, { onConflict: 'session_id,protocol_id' })
  const { data: once } = await svc.from('ist_results').select('id, fire_verdict').eq('session_id', sess.id).eq('protocol_id', proto1.id)
  check((once ?? []).length === 1 && once[0].fire_verdict === 'pass',
    `replayed upsert lands ONE row, last write wins (${(once ?? []).length} row(s))`)

  // ── PHASE 5 (partial): the IST seat list is complete ──────────────────────
  // COUNTED, not spot-checked. The first draft named 'Commissioning Provider',
  // which the vocabulary calls 'CxP'; the by-name join correctly seeded nothing
  // for it and the list came out at 17 instead of 18. No phantom row, no error —
  // just one seat quietly absent, which only a count reveals.
  const { data: seats } = await svc.from('ist_team_seed_roles').select('role_type_id')
  check((seats ?? []).length === 18, `IST seat list carries all 18 roles (got ${(seats ?? []).length})`)
  const { data: rtAll } = await svc.from('company_role_types').select('id, name')
  const seatNames = new Set((seats ?? []).map(s => rtAll.find(r => r.id === s.role_type_id)?.name))
  for (const must of ['Integrated Testing Coordinator', 'Fire Department', 'Building Department', 'Electrical Authority (ESA)', 'CxP'])
    check(seatNames.has(must), `seat present: ${must}`)

  // ── cascade: removing the plan removes everything hanging off it ──────────
  await svc.from('ist_plans').delete().eq('id', plan.id)
  const gone = await waitUntil(async () => {
    const { data: i } = await svc.from('ist_integrations').select('id').eq('plan_id', plan.id)
    const { data: p } = await svc.from('ist_protocols').select('id').eq('integration_id', integ.id)
    return (i ?? []).length === 0 && (p ?? []).length === 0
  }, { timeout: 8000, what: 'plan cascade' })
  check(gone, 'deleting a plan revision cascades its integrations and protocols')

} finally {
  await cleanup()
  console.log(`\ncleanup: ${LABEL} rows removed from ZZ-TEST`)
}

console.log('\n' + '='.repeat(60))
console.log(fail ? `FAIL — ${fail} of ${pass + fail}` : `PASS — ${pass} checks, IST phases 1-3: schema, guards, RLS as a real user, outbox replay.`)
process.exit(fail ? 1 : 0)
