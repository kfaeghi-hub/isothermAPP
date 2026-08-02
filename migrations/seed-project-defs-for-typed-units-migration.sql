-- THE RETROACTIVE TYPING WAS HALF A FIX, and the screenshot found it.
--
-- 118 units were given a type by the ratification script, and their nameplates
-- still rendered empty — because a project's field defs are seeded lazily by
-- ensureFieldDefs, which only runs when a human sets a type THROUGH THE UI. A
-- bulk write bypasses it. Clairlea had project defs for ahu, boiler and pump and
-- nothing else, so 82 freshly-typed units pointed at a def set that existed at
-- firm level and had never been copied to the project.
--
-- "The registers come alive" was the claim. They had not.
--
-- This seeds the project's own copy for every (project, type) pair that has
-- equipment but no defs — including `__base`, which every unit needs. It is
-- written as a general backfill rather than a fix for two projects, because any
-- future bulk write has the same hole until the writer seeds too.
--
-- SOVEREIGNTY IS PRESERVED: a project that ALREADY has defs for a type is left
-- alone entirely. This only fills gaps, never overwrites a customised set.
insert into project_equipment_field_defs
  (project_id, equipment_type, section, field_name, unit, sort_order)
select need.project_id, d.equipment_type, d.section, d.field_name,
       -- The project's unit system decides the label, exactly as seeding does.
       case when pr.unit_system = 'imperial' then coalesce(d.unit_imperial, d.unit)
            else d.unit end,
       d.sort_order
  from (
    -- every type in use on a project, plus __base which is universal
    select distinct e.project_id, e.equipment_type
      from equipment e where e.equipment_type is not null
    union
    select distinct e.project_id, '__base' from equipment e
  ) need
  join projects pr on pr.id = need.project_id
  join equipment_type_field_defs d on d.equipment_type = need.equipment_type
 where not exists (
   select 1 from project_equipment_field_defs x
    where x.project_id = need.project_id
      and x.equipment_type = need.equipment_type);

select p.name, count(distinct d.equipment_type) type_sets, count(*) defs
  from project_equipment_field_defs d join projects p on p.id = d.project_id
 where p.com_number in ('257972','267991') group by 1 order by 1;
