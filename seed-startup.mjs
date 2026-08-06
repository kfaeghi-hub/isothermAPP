// SEED the Start-Up family from ratified artifacts.
//
// Approved 2026-08-05. This is the APPLY end of the ratification path: it reads
// stored artifacts and writes templates. It does not draft, it does not
// re-classify, and it refuses on anything it was not given.
//
// THREE REFUSALS, because seeding is the irreversible end of the pipeline:
//   1. An artifact without placement rulings is not seeded. Ratification binds
//      to an artifact; an unruled one has not been ratified.
//   2. An equipment type that does not already exist is NEVER minted. The
//      taxonomy learns by ruling, not by a seeder inventing a key at 2am. An
//      unresolved subject seeds with equipment_type null (the basic fallback)
//      and is REPORTED by name.
//   3. Held-out items are not seeded. Three sprinkler-internal functions are
//      still awaiting a scope ruling; seeding them would put unratified content
//      in the product.
//
// Run: node --env-file=.env seed-startup.mjs --plan   (resolution table, no writes)
//      node --env-file=.env seed-startup.mjs          (seed)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const TOKEN = process.env.SUPABASE_MGMT_TOKEN
if (!TOKEN) { console.error('REFUSE: SUPABASE_MGMT_TOKEN missing'); process.exit(1) }
const API = 'https://api.supabase.com/v1/projects/isztyeczqndploybdtcn/database/query'
const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const DIR = 'out/startup-mining/artifacts'
const plan = process.argv.includes('--plan')

const q = v => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`
async function run(query) {
  const res = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Management API ${res.status}: ${JSON.stringify(body)}`)
  return body
}

// ── the ruled taxonomy, read from the database rather than restated ──────────
const typeRows = await run('select key, name from equipment_types order by key')
const TYPES = new Map(typeRows.map(r => [r.key, r.name]))
if (!TYPES.size) { console.error('REFUSE: no equipment types found'); process.exit(1) }

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Subject -> ruled key. Explicit, because a fuzzy matcher that guesses is how a
// taxonomy gets polluted. A subject absent here resolves to null and is named.
const SUBJECT_MAP = {
  'air handling unit': 'ahu', 'air handling units': 'ahu',
  'make up air units': 'mau', 'makeup air units': 'mau', 'direct fired makeup air units': 'mau',
  'air cooled packaged a c units': 'rtu', 'liquid cooled packaged a c units': 'rtu',
  'packaged a c units': 'rtu', 'roof top unit': 'rtu',
  'fan coils': 'fcu', 'fan coil': 'fcu',
  'exhaust fans': 'fan', 'exhaust fan': 'fan', 'fume exhausters': 'fan', 'supply fan': 'fan',
  'heat recovery wheel': 'hrv', 'compartment unit system': 'ahu',
  'air dryers': 'air_compressor', 'air compressor': 'air_compressor',
  'pumps': 'pump', 'pump': 'pump', 'sump pump': 'sump_pump', 'jockey pump': 'jockey_pump',
  'boilers': 'boiler', 'boiler': 'boiler', 'steam boiler': 'boiler',
  'forced draft water boiler': 'boiler', 'natural draft boiler': 'boiler',
  'chillers': 'chiller', 'chiller': 'chiller', 'centrifugal chiller': 'chiller',
  'cooling towers': 'cooling_tower', 'cooling tower': 'cooling_tower',
  'heat exchanger': 'heat_exchanger', 'heat exchangers': 'heat_exchanger',
  'expansion tank': 'expansion_tank', 'expansion tanks': 'expansion_tank',
  'unit heaters': 'unit_heater', 'cabinet unit heaters': 'unit_heater',
  'radiant panel': 'radiant_panel', 'water softener': 'water_softener',
  'humidifier': 'humidifier', 'humidifiers': 'humidifier',
  'water heaters': 'dhw_heater', 'water heater': 'dhw_heater',
  'generator': 'generator', 'essential power diesel generator': 'generator',
  'transformer': 'transformer', 'liquid filled power transformer': 'transformer',
  'dry type transformer': 'transformer',
  'fire alarm systems': 'fire_alarm_panel', 'fire pump': 'fire_pump',
  'backflow preventors': 'backflow_preventer', 'backflow preventer': 'backflow_preventer',
  'variable frequency drive': 'vfd', 'vav box': 'vav', 'cav box': 'vav',
  'unit ventilator': 'unit_ventilator', 'air separator': 'air_separator',
  'motor control centre': 'mcc', 'switchgear': 'switchgear', 'switchboard': 'switchboard',
}
function tryOne(raw) {
  if (!raw) return null
  const n = norm(raw).replace(/^\d+\s+/, '')          // folder names carry a sort prefix
  if (SUBJECT_MAP[n] && TYPES.has(SUBJECT_MAP[n])) return SUBJECT_MAP[n]
  if (TYPES.has(n.replace(/ /g, '_'))) return n.replace(/ /g, '_')
  for (const [k, name] of TYPES) if (norm(name) === n) return k
  return null
}
/** SUBJECT FIRST, THEN THE FOLDER — and the folder is not a fallback hack, it is
 *  where the answer actually lives on half the corpus. On the plumbing and fire
 *  masters the SUBJECT: row names the SYSTEM ("DOMESTIC WATER SYSTEMS") while the
 *  containing folder names the EQUIPMENT ("07 Pumps", "08 Water Heaters"). Reading
 *  only the subject resolved 29 of 81; reading both resolves far more, and neither
 *  source is guessed at — both are structural fields of the source tree. */
function resolveType(subject, master) {
  const bySubject = tryOne(subject)
  if (bySubject) return bySubject
  const folder = String(master ?? '').split(/[\\/]/).slice(-2, -1)[0]
  return tryOne(folder)
}

// ── read and validate the artifacts ──────────────────────────────────────────
const files = readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
const unruled = files.filter(f => !JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))._placement)
if (unruled.length) {
  console.error(`REFUSE: ${unruled.length} artifact(s) carry no placement rulings — not ratified, not seeded.`)
  process.exit(1)
}

const SIGNOFFS = [
  { role_label: 'Start-Up Performed By — Contractor', sort_order: 0 },
  { role_label: 'Witnessed By — Commissioning Authority', sort_order: 1 },
]

const planned = []
for (const f of files) {
  const a = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  const key = resolveType(a.subject, a.source_master)
  const held = []
  const sections = a.sections
    .filter(s => s.key !== 'F')                       // sign-off is signoffs, not items
    .map((s, i) => ({
      title: `${s.key} · ${s.title}`,
      sort_order: i,
      items: s.items.filter(it => {
        if (it.ruling?.held_out) { held.push(it.label); return false }
        return true
      }).map(it => ({
        label: it.label,
        status_type: 'yn_nr_na_hold',
        creates_finding: true,
        hint: it.ruling?.proof_elsewhere ? `Proof of the alarm/interlock response lives in the ${it.ruling.proof_elsewhere} column.` : null,
      })),
    }))
    .filter(s => s.items.length)
  planned.push({ file: f, subject: a.subject, key, sections, held, notes: a.form_notes ?? [],
                 items: sections.reduce((n, s) => n + s.items.length, 0), master: a.source_master })
}

const unresolved = planned.filter(p => !p.key)
console.log(`${planned.length} artifacts · ${planned.reduce((n, p) => n + p.items, 0)} items to seed`)
console.log(`equipment types resolved: ${planned.length - unresolved.length}/${planned.length}`)
if (unresolved.length) {
  console.log(`\nUNRESOLVED — seeding with equipment_type null (basic fallback). NOT auto-minted:`)
  for (const p of unresolved) console.log(`  ${p.subject ?? '(no subject)'}   [${p.file}]`)
  console.log(`\nMinting a type is a ruling, not a side effect of a seeder.`)
}
const heldTotal = planned.reduce((n, p) => n + p.held.length, 0)
if (heldTotal) console.log(`\nheld-out items NOT seeded: ${heldTotal} (awaiting a scope ruling)`)

if (plan) { console.log('\nPLAN ONLY — nothing written.'); process.exit(0) }

// ── seed ─────────────────────────────────────────────────────────────────────
let seeded = 0, instanceOn = null
for (const p of planned) {
  const name = `${p.subject ?? p.file.replace('.json', '')} Start-Up Checklist`
  const rev = `Phase 1 mine 2026-08-05 · source: ${p.master}`
  // The form's own warning becomes the PRE-START BANNER, not a line item.
  // Multiple notes on one master join with a separator rather than the seeder
  // choosing one — dropping a lockout instruction to keep a field tidy is not a
  // trade anyone should make silently.
  const banner = p.notes.map(nt => nt.note.replace(/^note\s*:\s*/i, '').trim()).filter(Boolean).join('  ')
  let sql = `do $$\ndeclare v_tmpl uuid; v_sec uuid;\nbegin\n` +
    `  insert into checklist_templates (name, type, equipment_type, description, revision_label, prestart_banner, active)\n` +
    `  values (${q(name)}, 'startup', ${q(p.key)}, ${q('Contractor performs, Commissioning Authority witnesses; both sign.')}, ${q(rev)}, ${q(banner || null)}, true)\n` +
    `  returning id into v_tmpl;\n`
  for (const s of p.sections) {
    sql += `  insert into checklist_template_sections (template_id, title, sort_order) values (v_tmpl, ${q(s.title)}, ${s.sort_order}) returning id into v_sec;\n`
    const rows = s.items.map((it, i) => `    (v_sec, ${q(it.label)}, ${q(it.hint)}, ${q(it.status_type)}, ${it.creates_finding}, ${i})`).join(',\n')
    sql += `  insert into checklist_template_items (section_id, label, hint, status_type, creates_finding, sort_order) values\n${rows};\n`
  }
  sql += `  insert into checklist_template_signoffs (template_id, role_label, sort_order) values\n` +
    SIGNOFFS.map(s => `    (v_tmpl, ${q(s.role_label)}, ${s.sort_order})`).join(',\n') + `;\n`
  sql += `end $$;`
  await run(sql)
  seeded++
  if (!instanceOn && p.key) instanceOn = { name, key: p.key, rev }
  if (seeded % 20 === 0) console.log(`  seeded ${seeded}/${planned.length}`)
}
console.log(`seeded ${seeded} templates`)

// ── Gap 1: one ZZ-TEST instance so `startup` stops printing NOT SWEPT ────────
if (instanceOn) {
  const r = await run(`do $$
declare v_tmpl uuid; v_inst uuid; v_n int;
begin
  select id into v_tmpl from checklist_templates where name = ${q(instanceOn.name)} and type = 'startup' order by created_at desc limit 1;
  select count(*) into v_n from equipment where project_id = '${ZZ}' and equipment_type = ${q(instanceOn.key)};
  if v_n = 0 then return; end if;
  insert into checklist_instances (project_id, source_template_id, source_template_name_snapshot,
    source_template_type_snapshot, source_template_revision_label_snapshot, created_from_template_at, type, status, prestart_banner_snapshot)
  values ('${ZZ}', v_tmpl, ${q(instanceOn.name)}, 'startup', ${q(instanceOn.rev)}, now(), 'startup', 'not_started', (select prestart_banner from checklist_templates where id = v_tmpl))
  returning id into v_inst;
  insert into checklist_instance_targets (instance_id, equipment_id, role, sort_order)
  select v_inst, e.id, case when row_number() over (order by e.tag) = 1 then 'primary' else 'tested_unit' end,
         row_number() over (order by e.tag) - 1
  from equipment e where e.project_id = '${ZZ}' and e.equipment_type = ${q(instanceOn.key)};
  insert into checklist_instance_sections (instance_id, source_section_id, title, sort_order)
  select v_inst, s.id, s.title, s.sort_order from checklist_template_sections s where s.template_id = v_tmpl;
  insert into checklist_instance_items (instance_id, section_id, source_item_id, label, hint, status_type, creates_finding, sort_order)
  select v_inst, isec.id, i.id, i.label, i.hint, i.status_type, i.creates_finding, i.sort_order
  from checklist_template_items i
  join checklist_template_sections s on s.id = i.section_id and s.template_id = v_tmpl
  join checklist_instance_sections isec on isec.instance_id = v_inst and isec.source_section_id = s.id;
  insert into checklist_instance_signoffs (instance_id, source_signoff_id, role_label_snapshot, sort_order)
  select v_inst, sg.id, sg.role_label, sg.sort_order from checklist_template_signoffs sg where sg.template_id = v_tmpl;
end $$;`)
  console.log(`ZZ-TEST startup instance: attempted on ${instanceOn.name} (${instanceOn.key})`)
}

const check = await run(`select count(*) filter (where type = 'startup') as templates from checklist_templates`)
console.log(`startup templates in the database: ${check[0]?.templates}`)
writeFileSync('out/startup-mining/seed-report.json', JSON.stringify({ seeded, planned: planned.map(p => ({ file: p.file, subject: p.subject, key: p.key, items: p.items, held: p.held, master: p.master })) }, null, 2))
