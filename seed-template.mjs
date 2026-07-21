// CSA campaign seeder: seed one checklist template from an extraction JSON, plus a
// ZZ-TEST instance targeting existing test equipment, via the Supabase Management API.
//
// Defaults per defaults_note: status_type 'yn_nr_na', creates_finding true,
// hint/expected_response/suggested_category null unless the JSON overrides them.
// Underscore-prefixed JSON fields (_extraction) are metadata — ignored here.
//
// Run: node --env-file=.env seed-template.mjs samples/seed-json/csa-ivc/ahu.json [tag1 tag2 ...]
//   Tags name existing ZZ-TEST equipment for the instance targets (default: by
//   the template's equipment_type). No tags matching -> instance skipped (template still seeds).

import { readFileSync } from 'node:fs'

const TOKEN = process.env.SUPABASE_MGMT_TOKEN
if (!TOKEN) { console.error('SUPABASE_MGMT_TOKEN missing from env'); process.exit(1) }
const PROJECT = 'e0c427d8-2029-4382-b054-6a84248ad8fe' // ZZ-TEST — Do Not Use
const API = 'https://api.supabase.com/v1/projects/isztyeczqndploybdtcn/database/query'

const jsonPath = process.argv[2]
if (!jsonPath) { console.error('usage: node seed-template.mjs <extraction.json> [tags...]'); process.exit(1) }
const tags = process.argv.slice(3)

const t = JSON.parse(readFileSync(jsonPath, 'utf8'))
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`

async function run(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Management API ${res.status}: ${JSON.stringify(body)}`)
  return body
}

let sql = `do $$
declare
  v_tmpl uuid; v_sec uuid; v_inst uuid; v_n int;
begin
  insert into checklist_templates (name, type, equipment_type, description, revision_label, active)
  values (${q(t.name)}, ${q(t.type)}, ${q(t.equipment_type)}, ${q(t.description)}, ${q(t.revision_label)}, true)
  returning id into v_tmpl;
`

for (const sec of t.sections) {
  sql += `
  insert into checklist_template_sections (template_id, title, sort_order)
  values (v_tmpl, ${q(sec.title)}, ${sec.sort_order}) returning id into v_sec;
`
  if (sec.items?.length) {
    const rows = sec.items.map((it, i) =>
      `    (v_sec, ${q(it.label)}, ${q(it.hint ?? null)}, ${q(it.status_type ?? 'yn_nr_na')}, ${it.creates_finding ?? true}, ${q(it.expected_response ?? null)}, ${q(it.suggested_category ?? null)}, ${i})`
    ).join(',\n')
    sql += `  insert into checklist_template_items (section_id, label, hint, status_type, creates_finding, expected_response, suggested_category, sort_order) values\n${rows};\n`
  }
  for (const [gi, g] of (sec.grids ?? []).entries()) {
    sql += `  insert into checklist_template_grids (section_id, title, definition, sort_order)
  values (v_sec, ${q(g.title)}, ${q(JSON.stringify(g.definition))}::jsonb, ${gi});\n`
  }
}

if (t.signoffs?.length) {
  sql += `
  insert into checklist_template_signoffs (template_id, role_label, sort_order) values
${t.signoffs.map(s => `    (v_tmpl, ${q(s.role_label)}, ${s.sort_order})`).join(',\n')};
`
}

// ZZ-TEST instance targeting existing equipment (by tag list, else by equipment_type)
const targetWhere = tags.length
  ? `tag in (${tags.map(q).join(', ')})`
  : `equipment_type = ${q(t.equipment_type)}`
sql += `
  select count(*) into v_n from equipment where project_id = '${PROJECT}' and ${targetWhere};
  if v_n > 0 then
    insert into checklist_instances (project_id, source_template_id, source_template_name_snapshot,
      source_template_type_snapshot, source_template_revision_label_snapshot, created_from_template_at, type, status)
    values ('${PROJECT}', v_tmpl, ${q(t.name)}, ${q(t.type)}, ${q(t.revision_label)}, now(), ${q(t.type)}, 'not_started')
    returning id into v_inst;

    insert into checklist_instance_targets (instance_id, equipment_id, role, sort_order)
    select v_inst, e.id, case when row_number() over (order by e.tag) = 1 then 'primary' else 'tested_unit' end,
           row_number() over (order by e.tag) - 1
    from equipment e where e.project_id = '${PROJECT}' and ${targetWhere};

    insert into checklist_instance_sections (instance_id, source_section_id, title, sort_order)
    select v_inst, s.id, s.title, s.sort_order
    from checklist_template_sections s where s.template_id = v_tmpl;

    insert into checklist_instance_items (instance_id, section_id, source_item_id, label, hint, status_type,
      creates_finding, expected_response, suggested_category, sort_order)
    select v_inst, isec.id, i.id, i.label, i.hint, i.status_type, i.creates_finding, i.expected_response,
      i.suggested_category, i.sort_order
    from checklist_template_items i
    join checklist_template_sections s on s.id = i.section_id and s.template_id = v_tmpl
    join checklist_instance_sections isec on isec.instance_id = v_inst and isec.source_section_id = s.id;

    insert into checklist_instance_grids (instance_id, section_id, source_grid_id, title, definition, sort_order)
    select v_inst, isec.id, g.id, g.title, g.definition, g.sort_order
    from checklist_template_grids g
    join checklist_template_sections s on s.id = g.section_id and s.template_id = v_tmpl
    join checklist_instance_sections isec on isec.instance_id = v_inst and isec.source_section_id = s.id;

    insert into checklist_instance_signoffs (instance_id, source_signoff_id, role_label_snapshot, sort_order)
    select v_inst, sg.id, sg.role_label, sg.sort_order
    from checklist_template_signoffs sg where sg.template_id = v_tmpl;
  end if;
end $$;`

await run(sql)

// Report what landed
const info = await run(`
  select t.id as template_id,
    (select count(*) from checklist_template_sections where template_id = t.id) as sections,
    (select count(*) from checklist_template_items i join checklist_template_sections s on s.id = i.section_id where s.template_id = t.id) as items,
    (select count(*) from checklist_template_grids g join checklist_template_sections s on s.id = g.section_id where s.template_id = t.id) as grids,
    (select count(*) from checklist_template_signoffs where template_id = t.id) as signoffs,
    (select i.id from checklist_instances i where i.source_template_id = t.id order by i.created_from_template_at desc limit 1) as instance_id
  from checklist_templates t
  where t.name = ${q(t.name)}
  order by t.created_at desc limit 1`)
console.log(JSON.stringify(info[0] ?? info, null, 2))
