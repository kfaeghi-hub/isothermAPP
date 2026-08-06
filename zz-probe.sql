select
  (select count(*) from equipment_types where kind='equipment') as equip_types,
  (select count(*) from equipment_types where kind='system') as system_types,
  (select count(distinct equipment_type) from checklist_templates where type='startup' and equipment_type is not null) as covered,
  (select string_agg(t.key, ' ' order by t.key) from equipment_types t
     where not exists (select 1 from checklist_templates c where c.type='startup' and c.equipment_type=t.key)) as uncovered;
