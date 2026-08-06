// Seed a RATIFIED Phase 2 artifact into its template. Apply-only.
//
// Phase 2 items are DRAFTED, so the provenance that matters is different from
// Phase 1's: not "which master, which row" but "what convergence class and which
// anchor". Both are written onto the item, because an item a field engineer
// questions in three years should be able to answer for itself.
//
// FOUR REFUSALS:
//   1. Not ratified -> not seeded. `_ratified: true` and a named ratifier.
//   2. Not in proposals/ -> not seeded. A ratified artifact lives in the repo;
//      one still in out/ has not been ruled, whatever its flag says.
//   3. No convergence class on an item, or a single-source item with no stated
//      reason -> refuse. The same rule the sitting sheet enforces, enforced
//      again at the write, because the sheet and the write are different acts.
//   4. No template for the equipment_type -> refuse. Seeding into nothing is
//      the silence class.
//
// Run: node --env-file=.env seed-phase2.mjs proposals/startup-phase2/<f>.json [--write]

import { readFileSync } from 'node:fs'

const TOKEN = process.env.SUPABASE_MGMT_TOKEN
if (!TOKEN) { console.error('REFUSE: SUPABASE_MGMT_TOKEN missing'); process.exit(1) }
const API = 'https://api.supabase.com/v1/projects/isztyeczqndploybdtcn/database/query'
const file = process.argv.find(a => a.endsWith('.json'))
const write = process.argv.includes('--write')
if (!file) { console.error('usage: seed-phase2.mjs <ratified.json> [--write]'); process.exit(1) }
if (!file.startsWith('proposals/')) {
  console.error('REFUSE: a ratified artifact lives in proposals/. One still in out/ has not been ruled.')
  process.exit(1)
}

const a = JSON.parse(readFileSync(file, 'utf8'))
if (a._ratified !== true || !a._ratified_by) { console.error('REFUSE: artifact is not ratified'); process.exit(1) }

const bad = [], noReason = []
for (const s of a.sections) for (const i of s.items) {
  if (!['universal', 'type-common', 'single-source'].includes(i.convergence)) bad.push(i.label)
  if (i.convergence === 'single-source' && !String(i.convergence_reason || '').trim()) noReason.push(i.label)
}
if (bad.length)      { console.error(`REFUSE: ${bad.length} item(s) carry no convergence class`); process.exit(1) }
if (noReason.length) { console.error(`REFUSE: ${noReason.length} single-source item(s) with no stated reason`); process.exit(1) }

const q = v => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`
async function run(query) {
  const res = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Management API ${res.status}: ${JSON.stringify(body)}`)
  return body
}

// TYPE-LEVEL CONTENT GOES TO EVERY TEMPLATE OF THAT TYPE.
// A Phase 2 artifact drafts what is true of the TYPE — universal and
// type-common items anchored to standards — so seeding it into whichever
// template happened to be created first would leave the other boilers without
// their safety-device tests. The corpus has three boiler masters (forced
// draft, natural draft, steam) and all three are fuel-fired.
let tmpl = await run(`select id, name from checklist_templates where type='startup' and equipment_type=${q(a.equipment_type)} order by name`)

// CREATING A TEMPLATE IS A BIGGER ACT THAN ADDING SECTIONS TO ONE, so it needs
// to be asked for. A gap-fill artifact must never conjure a template — if the
// type has no checklist, a D/E fill has nothing to attach to and the refusal is
// the correct answer. Only a FULL artifact (A through E, for one of the
// uncovered types) may create, and only with --create.
const isFull = ['A', 'B', 'C', 'D', 'E'].every(k => a.sections.some(s => s.key === k && s.items.length))
if (!tmpl.length) {
  if (!process.argv.includes('--create')) {
    console.error(`REFUSE: no startup template for equipment_type '${a.equipment_type}'.`)
    console.error(isFull
      ? 'This artifact is a FULL checklist. Pass --create to create the template from it.'
      : 'This artifact is a gap fill and has nothing to attach to. A gap fill never creates a template.')
    process.exit(1)
  }
  if (!isFull) {
    console.error('REFUSE: --create given, but this artifact is not a full A-E checklist.')
    console.error('A template created from a partial artifact would ship missing its pre-start section.')
    process.exit(1)
  }
  if (!write) { console.log(`\nWOULD CREATE a template for '${a.equipment_type}'. DRY RUN — pass --write.`); process.exit(0) }
  const name = `${a.subject} Start-Up Checklist`
  const rev = `Phase 2 drafted 2026-08-06 · ${a._batch ?? 'standards-anchored'}`
  await run(`insert into checklist_templates (name, type, equipment_type, description, revision_label, active)
    values (${q(name)}, 'startup', ${q(a.equipment_type)},
            ${q('Contractor performs, Commissioning Authority witnesses; both sign.')}, ${q(rev)}, true)`)
  const created = await run(`select id from checklist_templates where type='startup' and equipment_type=${q(a.equipment_type)} limit 1`)
  if (!created.length) { console.error('REFUSE: template creation reported no error but nothing arrived'); process.exit(1) }
  await run(`insert into checklist_template_signoffs (template_id, role_label, sort_order) values
    (${q(created[0].id)}, 'Start-Up Performed By — Contractor', 0),
    (${q(created[0].id)}, 'Witnessed By — Commissioning Authority', 1)`)
  console.log(`created template: ${name}`)
  tmpl = await run(`select id, name from checklist_templates where type='startup' and equipment_type=${q(a.equipment_type)} order by name`)
}


const total = a.sections.reduce((n, s) => n + s.items.length, 0)
console.log(`${file}\nratified by ${a._ratified_by} on ${a._ratified_on}`)
console.log(`targets: ${tmpl.length} template(s) of type '${a.equipment_type}'`)
 for (const t of tmpl) console.log(`   · ${t.name}`)
console.log(`sections: ${a.sections.map(s => `${s.key}(${s.items.length})`).join(' ')}  ·  ${total} items\n`)
for (const s of a.sections) for (const i of s.items) console.log(`  ${s.key}  ${String(i.convergence).padEnd(14)} ${i.label}`)

if (!write) { console.log('\nDRY RUN — pass --write to seed.'); process.exit(0) }

// The hint carries the convergence class and the anchor onto the item itself.
const hintFor = i => {
  const parts = [`${i.convergence}`, i.anchor ? `anchor: ${i.anchor}` : null,
                 i.convergence === 'single-source' ? `kept because: ${i.convergence_reason}` : null,
                 i.note ?? null].filter(Boolean)
  return parts.join(' · ')
}

let sql = `do $$\ndeclare v_sec uuid; v_n int;\nbegin\n`
for (const t of tmpl) {
  const templateId = t.id
  for (const s of a.sections) {
    const title = `${s.key} · ${s.title}`
    sql += `  select id into v_sec from checklist_template_sections where template_id=${q(templateId)} and title=${q(title)} limit 1;\n`
    sql += `  if v_sec is null then\n` +
           `    select coalesce(max(sort_order),-1)+1 into v_n from checklist_template_sections where template_id=${q(templateId)};\n` +
           `    insert into checklist_template_sections (template_id, title, sort_order) values (${q(templateId)}, ${q(title)}, v_n) returning id into v_sec;\n` +
           `  end if;\n`
    sql += `  select coalesce(max(sort_order),-1)+1 into v_n from checklist_template_items where section_id=v_sec;\n`
    for (const [k, i] of s.items.entries()) {
      // Idempotent by label: re-running must not double an item. A duplicate
      // looks like data; a shortfall is visible.
      sql += `  if not exists (select 1 from checklist_template_items where section_id=v_sec and label=${q(i.label)}) then\n` +
             `    insert into checklist_template_items (section_id, label, hint, status_type, creates_finding, sort_order)\n` +
             `    values (v_sec, ${q(i.label)}, ${q(hintFor(i))}, 'yn_nr_na_hold', true, v_n + ${k});\n  end if;\n`
    }
  }
}
sql += `end $$;`
await run(sql)

const after = await run(`select t.name, s.title, count(i.id) as items
  from checklist_templates t
  join checklist_template_sections s on s.template_id=t.id
  left join checklist_template_items i on i.section_id=s.id
  where t.type='startup' and t.equipment_type=${q(a.equipment_type)}
    and (s.title like 'D %' or s.title like 'E %')
  group by t.name, s.title order by t.name, s.title`)
console.log('\nafter seeding:')
for (const r of after) console.log(`  ${String(r.items).padStart(3)}  ${r.title}   [${r.name}]`)
