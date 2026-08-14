// seed-5b-review-fixture — a provenance-rich staged upload on ZZ-TEST, synthetic.
// [KEEL] 5b build fixture. NO model calls: the point is the SHAPES, not the reading.
//
//   node --env-file=.env seed-5b-review-fixture.mjs          # seed
//   node --env-file=.env seed-5b-review-fixture.mjs --clean  # remove
//
// Every provenance shape the 5a pipeline can stage, one row each, so the review
// surface is built against all of them at once:
//   · agreed-by-both, high confidence            (the clean case)
//   · value disagreement (descriptor)            (both read it, differently)
//   · type-one-sided (model typed, rules blank)
//   · TYPE CONFLICT, capped at 0.8               (the standing-conflict shape)
//   · rules-only row                             (model missed it)
//   · model-only row                             (rules missed it)
//   · a row with questions attributed by tag     (via `where`)
//   · verification ran-and-flagged / did-not-run
//
// ZZ-TEST ONLY, findable by filename, deleted by --clean. The battery's
// assertZzTestQuiet reports intake residue between suites, so this fixture must
// NOT be left standing across a battery run.
import { createClient } from '@supabase/supabase-js'

const FILE = 'zz-5b-review-fixture.xlsx'
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()
if (!proj) { console.error('REFUSING: no ZZ-TEST project'); process.exit(1) }

async function clean() {
  const { data: ups } = await svc.from('intake_uploads').select('id').eq('project_id', proj.id).eq('filename', FILE)
  for (const u of ups ?? []) {
    await svc.from('intake_rows').delete().eq('upload_id', u.id)
    await svc.from('intake_uploads').delete().eq('id', u.id)
  }
  return (ups ?? []).length
}

if (process.argv.includes('--clean')) {
  console.log(`cleaned: ${await clean()} fixture upload(s)`)
  process.exit(0)
}

await clean()
const { data: up, error: upErr } = await svc.from('intake_uploads').insert({
  project_id: proj.id, filename: FILE, storage_path: `${proj.id}/${FILE}`,
  kind: 'excel', content_sha256: 'zz-5b-fixture', status: 'parsed',
  row_count: 11, parse_note: '11 rows · synthetic 5b fixture · 0.0c over 0 model calls',
}).select('id').single()
if (upErr) { console.error('upload insert refused:', upErr.message); process.exit(1) }

const claim = (rules, model, from = rules != null && rules === model ? 'both' : rules != null ? 'rules' : 'model') =>
  ({ rules, model, from, agreed: rules != null && rules === model })

const rows = [
  { tag: 'ZZ5B-AHU-1', descriptor: 'Rooftop air handler', proposed_type: 'ahu', confidence: 0.95, read_via: 'both',
    location: 'Roof', area_served: 'Level 3 east',
    claims: { descriptor: claim('Rooftop air handler', 'Rooftop air handler'), location: claim('Roof', 'Roof'), area_served: claim('Level 3 east', 'Level 3 east') },
    disagreements: null, questions: null,
    verification: { ran: true, ok: true, flags: [] } },

  { tag: 'ZZ5B-P-1', descriptor: 'HW circulating pump', proposed_type: 'pump', confidence: 0.9, read_via: 'both',
    location: 'Mech RM 101', area_served: null,
    claims: { descriptor: claim('HW circulating pump', 'Hot water circ pump'), location: claim('Mech RM 101', 'Mech RM 101'), area_served: claim(null, null) },
    disagreements: [{ tag: 'ZZ5B-P-1', kind: 'value', field: 'descriptor', rules: 'HW circulating pump', model: 'Hot water circ pump', note: 'Both readers saw this pump; they wrote its description differently. The rules leg’s wording was kept.' }],
    questions: null, verification: { ran: true, ok: true, flags: [] } },

  { tag: 'ZZ5B-EF-7', descriptor: 'Washroom exhaust fan', proposed_type: 'fan', confidence: 0.82, read_via: 'both',
    location: null, area_served: 'L2 washrooms',
    claims: { descriptor: claim('Washroom exhaust fan', 'Washroom exhaust fan'), location: claim(null, null), area_served: claim('L2 washrooms', 'L2 washrooms') },
    disagreements: [{ tag: 'ZZ5B-EF-7', kind: 'type-one-sided', field: 'proposed_type', rules: null, model: 'fan', note: 'The model typed this unit; the rules leg could not. The model’s type is offered at reduced confidence.' }],
    questions: null, verification: { ran: true, ok: true, flags: [] } },

  { tag: 'ZZ5B-HP-2', descriptor: 'Heat pump, packaged terminal', proposed_type: 'heat_pump', confidence: 0.8, read_via: 'both',
    location: 'L1 corridor', area_served: null,
    claims: { descriptor: claim('Heat pump, packaged terminal', 'Packaged terminal heat pump'), location: claim('L1 corridor', 'L1 corridor'), area_served: claim(null, null) },
    disagreements: [{ tag: 'ZZ5B-HP-2', kind: 'type-conflict', field: 'proposed_type', rules: 'heat_pump', model: 'fcu', note: 'The readers disagree on what this unit IS. Confidence is capped at 0.8 until a human rules; the more specific candidate is offered, never assumed.' }],
    questions: null, verification: { ran: true, ok: true, flags: [] } },

  { tag: 'ZZ5B-CUH-4', descriptor: 'Cabinet unit heater', proposed_type: 'unit_heater', confidence: 0.88, read_via: 'rules',
    location: 'Stair B', area_served: null,
    claims: { descriptor: claim('Cabinet unit heater', null, 'rules'), location: claim('Stair B', null, 'rules'), area_served: claim(null, null) },
    disagreements: [{ tag: 'ZZ5B-CUH-4', kind: 'row-one-sided', field: 'row', rules: 'present', model: null, note: 'Only the rules leg read this row — the model’s band did not return it.' }],
    questions: null, verification: { ran: true, ok: true, flags: [] } },

  { tag: 'ZZ5B-VAV-12', descriptor: 'VAV terminal, hot water reheat', proposed_type: 'vav', confidence: 0.78, read_via: 'model',
    location: null, area_served: 'Suite 210',
    claims: { descriptor: claim(null, 'VAV terminal, hot water reheat', 'model'), location: claim(null, null), area_served: claim(null, 'Suite 210', 'model') },
    disagreements: [{ tag: 'ZZ5B-VAV-12', kind: 'row-one-sided', field: 'row', rules: null, model: 'present', note: 'Only the model read this row — the rules leg’s header map did not reach it.' }],
    questions: null, verification: { ran: true, ok: true, flags: [] } },

  { tag: 'ZZ5B-B-1', descriptor: 'Condensing boiler', proposed_type: 'boiler', confidence: 0.9, read_via: 'both',
    location: 'Mech RM 101', area_served: null,
    nameplate: { MBH: '2000', 'Fuel': 'NG' },
    claims: { descriptor: claim('Condensing boiler', 'Condensing boiler'), location: claim('Mech RM 101', 'Mech RM 101'), area_served: claim(null, null) },
    disagreements: null,
    questions: [{ about: 'duty column', question: 'The sheet has two MBH columns (INPUT and OUTPUT) and the row carries only one value — which duty is it?', where: 'ZZ5B-B-1' }],
    verification: { ran: true, ok: false, flags: [{ row: 'ZZ5B-B-1', field: 'MBH', note: 'value sits in the merged INPUT/OUTPUT band — attribution unverified' }] } },

  { tag: 'ZZ5B-UH-9', descriptor: 'Unit heater, gas', proposed_type: 'unit_heater', confidence: 0.87, read_via: 'both',
    location: 'Parkade P1', area_served: null,
    claims: { descriptor: claim('Unit heater, gas', 'Unit heater, gas'), location: claim('Parkade P1', 'Parkade P1'), area_served: claim(null, null) },
    disagreements: null,
    questions: null,
    verification: { ran: false, failure: 'http-429' } },

  // ── Phase 6 gate-class rows ───────────────────────────────────────────────
  // A second attributed-question row, so the capture gate can show BOTH
  // question outcomes: B-1 accepted-unanswered, F-3 answered-via-edit.
  { tag: 'ZZ5B-F-3', descriptor: 'Supply fan, interior', proposed_type: 'fan', confidence: 0.86, read_via: 'both',
    location: 'L3 mech', area_served: null,
    claims: { descriptor: claim('Supply fan, interior', 'Supply fan, interior'), location: claim('L3 mech', 'L3 mech'), area_served: claim(null, null) },
    disagreements: null,
    questions: [{ about: 'drive', question: 'The DRIVE column is merged across F-3 and F-4 — does “VFD” belong to both rows or one?', where: 'ZZ5B-F-3' }],
    verification: { ran: true, ok: true, flags: [] } },

  // A second type conflict, so the capture gate can name EACH leg once:
  // HP-2 resolves to the rules' reading, CU-2 to the model's.
  { tag: 'ZZ5B-CU-2', descriptor: 'Ceiling-mounted conditioning unit', proposed_type: 'heat_pump', confidence: 0.8, read_via: 'both',
    location: 'L2 corridor', area_served: null,
    claims: { descriptor: claim('Ceiling-mounted conditioning unit', 'Ceiling cassette unit'), location: claim('L2 corridor', 'L2 corridor'), area_served: claim(null, null) },
    disagreements: [{ tag: 'ZZ5B-CU-2', kind: 'type-conflict', field: 'proposed_type', rules: 'heat_pump', model: 'fcu', note: 'The readers disagree on what this unit IS. Confidence is capped at 0.8 until a human rules; the more specific candidate is offered, never assumed.' }],
    questions: null, verification: { ran: true, ok: true, flags: [] } },

  // A NULL-PROVENANCE row, staged the pre-pipeline way. The capture trigger
  // must NOT fire for it — Phase 6 captures dispositions on provenance rows.
  { tag: 'ZZ5B-LEG-0', descriptor: 'Legacy-shape row', proposed_type: 'pump', confidence: 0.7, read_via: null,
    location: null, area_served: null,
    claims: null, disagreements: null, questions: null, verification: null },
]

const payload = rows.map(r => ({
  upload_id: up.id, project_id: proj.id, source_sheet: 'SCHED-1',
  tag: r.tag, descriptor: r.descriptor, proposed_category: 'mechanical',
  proposed_type: r.proposed_type, observed_type_name: null,
  location: r.location, area_served: r.area_served,
  nameplate: r.nameplate ?? null, confidence: r.confidence,
  match_equipment_id: null, read_via: r.read_via, claims: r.claims,
  disagreements: r.disagreements, questions: r.questions, verification: r.verification,
  reasoning: null,
}))
const { error } = await svc.from('intake_rows').insert(payload)
if (error) { console.error('rows insert refused:', error.message); await clean(); process.exit(1) }

// The sheet-level question, ONCE, in its own table (Phase 6 normalization).
const { error: qErr } = await svc.from('intake_sheet_questions').insert({
  upload_id: up.id, project_id: proj.id, source_sheet: 'SCHED-1',
  about: 'sheet legend',
  question: 'The legend note “all heaters interlocked with CO sensors” could not be attributed to specific rows — does it belong on the register?',
})
if (qErr) { console.error('sheet question refused:', qErr.message); await clean(); process.exit(1) }
console.log(`seeded: ${FILE} (upload ${up.id}) — ${payload.length} rows, every provenance shape`)
console.log('clean up with: node --env-file=.env seed-5b-review-fixture.mjs --clean')
