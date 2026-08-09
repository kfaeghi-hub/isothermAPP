// IST REGENERATION GATE — seed the real Scarborough Gardens content, generate,
// and assert the STRUCTURE matches the document the firm issued.
//
// The bar is indistinguishable-in-structure, not indistinguishable-in-prose: the
// issued report's project-specific sentences are its own, but its ANATOMY is
// CAN/ULC-S1001 Appendix C and that is what a generator must reproduce. So the
// assertions are structural — section order, the number of attachment tables,
// which of them carries the Equip. Type column, one sign-off block per
// attachment, the tri-state prerequisite matrix, and the B-3 note surviving as a
// block spanning its table.
//
// WHY THE COUNTS ARE THE TEST. Scarborough carries NINE integration rows in its
// matrix and THREE attachment tables, because attachments group by label. A
// generator that emitted nine attachments would look plausible in isolation and
// be obviously wrong beside the real document. Counting is what catches that;
// eyeballing a single page is not.
//
// ZZ-TEST only. Self-cleaning.
import { createClient } from '@supabase/supabase-js'
import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('ist-regen-gate')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const LABEL = 'IST-REGEN'
mkdirSync('out/ist', { recursive: true })

async function cleanup() {
  const { data } = await svc.from('ist_plans').select('id').eq('project_id', ZZ).like('revision_label', `${LABEL}%`)
  for (const p of data ?? []) await svc.from('ist_plans').delete().eq('id', p.id)
}
await cleanup()

// ── the fixture: Scarborough Gardens Arena, from the issued report ───────────
const { data: plan } = await svc.from('ist_plans').insert({
  project_id: ZZ, revision_label: `${LABEL}-2`, revision_date: '2025-11-27',
  description: 'Filled based on Pre-documentation received and instructions received from engineers regarding notes in table B-3.',
}).select('id').single()

const sys = {}
for (const [key, label, ov, obj] of [
  ['fa', 'Fire Alarm',
   'The building is protected by a single-stage Fire Alarm System incorporating audible devices and voice messaging. A single EST4 Fire Alarm Control Panel (FACP) is installed in the main electrical room adjacent to the primary entrance.',
   'The Fire Alarm is integrated with the automatic Sprinkler System, and with a Fire Signal Receiving Centre for remote monitoring of Alarm, Trouble and Supervisory conditions.'],
  ['fsrc', 'Fire Signal Receiving Centre', null, null],
  ['spr', 'Sprinkler System',
   'The building is protected throughout by wet-pipe automatic Sprinkler and dry-pipe automatic Sprinkler Systems.',
   'The automatic Wet and Dry Sprinkler Systems are interconnected to the Fire Alarm for monitoring of water flow via Flow Switches, loss of air pressure via Low Air Pressure Switches, and movement of valves controlling water supply via Supervised Valves.'],
  ['ahu', 'Air Handling Units',
   'The building is provided with the following air handling units integrated to the Fire Alarm System: ERV-1, ERV-2, ERV-3, ERV-6 and DH-1.',
   'Fan Shutdown relays are provided for ERV-1, ERV-2, ERV-3, ERV-6 and DH-1 to shut down these units upon any Fire Alarm.'],
]) {
  const { data } = await svc.from('ist_systems').insert({
    plan_id: plan.id, label, overview_description: ov, integrations_objectives: obj,
    sort_order: Object.keys(sys).length,
  }).select('id').single()
  sys[key] = data.id
}

// NINE matrix rows across THREE attachment labels — the real document's shape.
const INTEGRATIONS = [
  ['fa', 'fsrc', 'Alarm Condition', 'A-1'], ['fa', 'fsrc', 'Supervisory Condition', 'A-1'],
  ['fa', 'fsrc', 'Trouble Condition', 'A-1'], ['fa', 'fsrc', 'Connection Integrity', 'A-1'],
  ['fa', 'spr', 'Water Flow', 'A-2'], ['fa', 'spr', 'Valve Supervision', 'A-2'],
  ['fa', 'spr', 'Dry System Compressor Loss of Power', 'A-2'], ['fa', 'spr', 'Sprinkler Room Low Temperature', 'A-2'],
  ['fa', 'ahu', 'Shut down upon Fire Alarm', 'A-3'],
]
const ints = []
for (const [a, b, type, att] of INTEGRATIONS) {
  const { data } = await svc.from('ist_integrations').insert({
    plan_id: plan.id, system_a_id: sys[a], system_b_id: sys[b], integration_type: type,
    attachment_label: att, sort_order: ints.length,
    normal_mode_behavior: 'No off-normal condition on the Fire Alarm System.',
    offnormal_mode_behavior: 'Condition present on the Fire Alarm System; signal transmitted and received.',
  }).select('id').single()
  ints.push({ id: data.id, att, type })
}
const byType = t => ints.find(i => i.type === t).id

// A-1: four CONDITION protocols. A-2: POINT protocols with equip codes.
// A-3: UNIT protocols, one per machine. All three kinds, as the document has.
const PROTOS = [
  ...['alarm', 'supervisory', 'trouble', 'connection_integrity'].map((c, k) => ({
    integration_id: byType(['Alarm Condition', 'Supervisory Condition', 'Trouble Condition', 'Connection Integrity'][k]),
    subject_kind: 'condition', subject_label: 'Condition', condition_type: c, sort_order: k,
    normal_mode_steps: 'Review Fire Signal Transmitting Unit installation and connection to the Fire Alarm System. Confirm the Fire Alarm System is reset and cleared of any Off-Normal conditions.',
    fire_mode_steps: 'Cause the condition on the Fire Alarm System. Confirm receipt of the signal by the Fire Signal Receiving Centre. Return the Fire Alarm System to Normal condition.',
  })),
  ...[['Domestic Water Inlet Valve PL-01', 'S.V.'], ['Domestic Water Outlet Valve PL-03', 'S.V.'],
      ['Backflow Inlet Supervisory Valve', 'S.V.'], ['Backflow Outlet Supervisory Valve', 'S.V.'],
      ['Dry Sprinkler System Shut-off Valve', 'S.V.'], ['Dry Sprinkler System Low Air Pressure', 'L.A.P.S.'],
      ['Wet Sprinkler System Flow', 'F.S.'], ['Wet Sprinkler System Low Pressure', 'P.S.'],
      ['Sprinkler Test Valve', 'S.V.']].map(([l, code], k) => ({
    integration_id: byType('Water Flow'), subject_kind: 'point', subject_label: l, equip_type_code: code, sort_order: k,
    fire_mode_steps: 'Flow water from the inspection test connection. Alarm signal within 90 seconds.',
  })),
  ...['ERV-1', 'ERV-2', 'ERV-3', 'ERV-6', 'DH-1'].map((u, k) => ({
    integration_id: byType('Shut down upon Fire Alarm'), subject_kind: 'unit',
    subject_label: `${u} Shut Down Relay`, sort_order: k,
    normal_mode_steps: 'Review the Fire Alarm relay and connection to the Fire Alarm System.',
    fire_mode_steps: 'Activate the Alarm condition. Confirm the Air Handling Unit shuts down upon Fire Alarm.',
  })),
]
const { data: protos } = await svc.from('ist_protocols').insert(PROTOS).select('id, integration_id, subject_kind')

await svc.rpc('ist_seed_prerequisites', { p_plan_id: plan.id })
// Item 17 is the S537 verification report — marked received, with the evidence
// where the firm actually keeps it.
const EVIDENCE = 'S537 Verification Cert — ShareSync /2.Bldg_Docs/5.Certs/ rev 1'
await svc.from('ist_prerequisites')
  .update({ state: 'yes', evidence_reference: EVIDENCE, received_on: '2025-11-27' })
  .eq('plan_id', plan.id).eq('item_no', 17)

const { data: sess } = await svc.from('ist_sessions').insert({
  plan_id: plan.id, test_date: '2025-11-27', test_type: 'new',
  description: '2025 Integrated System Testing for initial occupancy of this project.', records_ref: 'Attachment B',
}).select('id').single()

for (const [role, company, name] of [
  ['Integrated Systems Testing Coordinator', 'Isotherm Engineering Ltd.', 'Peiman Faeghi, Riho Sikes, & Tony Faeghi'],
  ['Owner’s Rep.', 'Atlas Construction Inc.', 'Mohsen Alimohammadi'],
  ['Mechanical, Electrical, and Fire Alarm Contractor', 'MultiTech Trades Corp.', 'Bob Neil'],
  ['Fire Protection Contractor', 'Vortec Fire Protection Inc', 'Scott'],
]) await svc.from('ist_session_participants').insert({ session_id: sess.id, role_label: role, name_text: name, company_id: null, sort_order: 0 })

// every protocol passed, with the real per-row dates
await svc.from('ist_results').insert(protos.map(p => ({
  session_id: sess.id, protocol_id: p.id, normal_verdict: 'pass', fire_verdict: 'pass',
  tested_on: p.subject_kind === 'point' ? '2025-11-13' : '2025-11-26',
})))

for (const [att, name, date] of [
  ['A-1', 'Riho Sikes', '2025-11-13'],
  ['A-2', 'Peiman Faeghi, Riho Sikes, & Tony Faeghi', '2025-11-26'],
  ['A-3', 'Peiman Faeghi, Riho Sikes', '2025-11-27'],
]) await svc.from('ist_signoffs').insert({ session_id: sess.id, attachment_label: att, company_text: 'Isotherm Engineering Ltd.', name_text: name, signed_on: date })

// THE B-3 NOTE — the one that caused REV2 to exist.
await svc.from('ist_notes').insert({
  plan_id: plan.id, scope: 'attachment', integration_id: byType('Shut down upon Fire Alarm'),
  author_label: 'Mech Engineer',
  body: 'There are no fire/smoke dampers on this project or a duct detector required in this project; therefore, this section of the specification is not applicable and shall not be considered a deficiency in the Integrated testing plan.',
})

// ── assemble + generate ──────────────────────────────────────────────────────
await build({
  entryPoints: ['api/_shared/ist-document.ts'], outfile: 'out/handlers/ist-document.mjs',
  bundle: true, format: 'esm', platform: 'node', target: 'node20', packages: 'external', logLevel: 'error',
  alias: { '@sparticuz/chromium-min': './doc-render-chromium-shim.mjs' },
})
const { buildIstHtml } = await import(`${pathToFileURL('out/handlers/ist-document.mjs').href}?t=${Date.now()}`)

const { data: allSys } = await svc.from('ist_systems').select('*').eq('plan_id', plan.id).order('sort_order')
const { data: allInt } = await svc.from('ist_integrations').select('*').eq('plan_id', plan.id).order('sort_order')
const { data: allPro } = await svc.from('ist_protocols').select('*').in('integration_id', allInt.map(i => i.id)).order('sort_order')
const { data: allPre } = await svc.from('ist_prerequisites').select('*').eq('plan_id', plan.id).order('item_no')
const { data: allRes } = await svc.from('ist_results').select('*').eq('session_id', sess.id)
const { data: allSgn } = await svc.from('ist_signoffs').select('*').eq('session_id', sess.id)
const { data: allNot } = await svc.from('ist_notes').select('*').eq('plan_id', plan.id)
const { data: allPar } = await svc.from('ist_session_participants').select('*').eq('session_id', sess.id)
const name = id => allSys.find(s => s.id === id)?.label ?? '—'

const doc = {
  project: { name: 'Scarborough Gardens Arena', com_number: 'ZZ-TEST', address: '75 Birchmount Road, Scarborough, ON, M1N 3J7' },
  plan: { revision_label: '2', revision_date: '2025-11-27', description: null },
  revisions: [
    { revision_label: '0', revision_date: '2025-11-18', description: 'Draft issued for engineer’s review.' },
    { revision_label: '1', revision_date: '2025-11-26', description: 'Filled with results of Integrated System Testing.' },
    { revision_label: '2', revision_date: '2025-11-27', description: 'Filled based on Pre-documentation received and instructions received from engineers regarding notes in table B-3.' },
  ],
  systems: allSys.map(s => ({ label: s.label, overview_description: s.overview_description, integrations_objectives: s.integrations_objectives })),
  integrations: allInt.map(i => ({
    id: i.id, integration_type: i.integration_type, attachment_label: i.attachment_label,
    normal_mode_behavior: i.normal_mode_behavior, offnormal_mode_behavior: i.offnormal_mode_behavior,
    system_a: name(i.system_a_id), system_b: name(i.system_b_id),
    protocols: allPro.filter(p => p.integration_id === i.id),
  })),
  prerequisites: allPre, precompleted: [],
  sessions: [{ id: sess.id, test_date: '2025-11-27', test_type: 'new', description: '2025 Integrated System Testing for initial occupancy of this project.', records_ref: 'Attachment B' }],
  participants: allPar.map(p => ({ session_id: p.session_id, role_label: p.role_label, company: 'Isotherm Engineering Ltd.', name: p.name_text })),
  results: allRes, signoffs: allSgn, notes: allNot,
  authored_by: 'Peiman Faeghi, P.Eng., CCP, LEED AP',
}

const planHtml = buildIstHtml(doc, 'plan')
const reportHtml = buildIstHtml(doc, 'report')
writeFileSync('out/ist/scarborough-plan.html', planHtml)
writeFileSync('out/ist/scarborough-report.html', reportHtml)

// ── the structural assertions ────────────────────────────────────────────────
const count = (h, re) => (h.match(re) ?? []).length
console.log('\nSTRUCTURE — report mode\n')

const SECTIONS = ['ABBREVIATIONS AND DEFINITIONS', 'PURPOSE OF THE INTEGRATED SYSTEMS TESTING REPORT',
  'INTRODUCTION', 'INTEGRATIONS MATRIX', 'TEST PROTOCOLS AND PROCEDURES', 'NOTIFICATIONS',
  'PERSONNEL SAFETY', 'PHASED OCCUPANCIES', 'PRE-TESTING OCCUPANCIES', 'TESTING FORMS',
  'ONGOING INTEGRATED SYSTEMS TESTING', 'ATTACHMENT A MASTER INTEGRATED SYSTEMS TESTING CHECKLIST',
  'ATTACHMENT B RECORDING OF COMPLETED INTEGRATED SYSTEM TESTING']
let last = -1, ordered = true
for (const sec of SECTIONS) { const at = reportHtml.indexOf(sec); if (at < 0 || at < last) ordered = false; last = at }
check(ordered, `all ${SECTIONS.length} Appendix-C sections present and in order`)
check(reportHtml.indexOf('REVISION CONTROL') < reportHtml.indexOf('EXECUTIVE SUMMARY'), 'revision control precedes the executive summary')
check(!planHtml.includes('EXECUTIVE SUMMARY'), 'PLAN mode omits the executive summary')
check(!planHtml.includes('ATTACHMENT B'), 'PLAN mode omits Attachment B')

check(count(reportHtml, /TABLE A-\d/g) === 3, `three Attachment A tables (got ${count(reportHtml, /TABLE A-\d/g)}) — nine matrix rows, three attachments`)
check(count(reportHtml, /TABLE B-\d/g) === 3, `three Attachment B tables (got ${count(reportHtml, /TABLE B-\d/g)})`)
check(count(reportHtml, /Integrated Systems Testing Completion Sign-Off/g) === 6, `six sign-off blocks — one per attachment table, A and B (got ${count(reportHtml, /Integrated Systems Testing Completion Sign-Off/g)})`)
check(count(reportHtml, /Equip\. Type/g) === 2, `the Equip. Type column appears on the sprinkler attachment ONLY, A and B (got ${count(reportHtml, /Equip\. Type/g)})`)

const matrixRows = count(reportHtml.slice(reportHtml.indexOf('INTEGRATIONS MATRIX'), reportHtml.indexOf('TEST PROTOCOLS')), /<tr>/g) - 1
check(matrixRows === 9, `the integrations matrix carries nine rows (got ${matrixRows})`)
check(count(reportHtml, /&#9744;/g) > 0 && count(reportHtml, /&#9746;/g) > 0, 'both empty and ticked boxes render')
check(count(planHtml, /&#9746;/g) === count(planHtml, /YES &#9746;|NO &#9746;|N\/A &#9746;/g),
  'PLAN mode ticks nothing in the attachment forms (only the prerequisite tri-state)')
check(reportHtml.includes('Mech Engineer'), 'the B-3 attachment note survives, with its author')
check(reportHtml.includes('Tested 2025-11-13') && reportHtml.includes('Tested 2025-11-26'),
  'per-result dates render, and they differ inside one signed report')
check(count(reportHtml, /Riho Sikes/g) >= 2, 'per-attachment sign-off names render')
check(count(reportHtml, /YES &#9744;|YES &#9746;/g) === 22, `all 22 prerequisites render tri-state (got ${count(reportHtml, /YES &#9744;|YES &#9746;/g)})`)
check(reportHtml.includes(EVIDENCE) && planHtml.includes(EVIDENCE),
  'the evidence reference survives into the §9 table, in BOTH modes — the claim names where its document lives')

await cleanup()
console.log(`\ncleanup: ${LABEL} removed from ZZ-TEST`)
console.log('\n' + '='.repeat(64))
console.log(fail ? `GATE FAIL — ${fail} of ${pass + fail}` : `GATE PASS — ${pass} structural checks against the issued Scarborough report.`)
console.log('html → out/ist/scarborough-{plan,report}.html')
process.exit(fail ? 1 : 0)
