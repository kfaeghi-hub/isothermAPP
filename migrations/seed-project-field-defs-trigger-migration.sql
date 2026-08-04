-- F3 — a typed unit must always render its full nameplate template.
--
-- THE PRODUCT RULE: CxAs FILL nameplates; they never have to CREATE them.
--
-- `ensureFieldDefs` lived in EquipmentPage.tsx — a CLIENT-SIDE function invoked
-- from a UI event handler. `api/intake.ts` mentions project_equipment_field_defs
-- ZERO times, so a unit typed by intake got its type and no template: the
-- nameplate rendered __base only, and a CxA standing at a boiler saw three
-- fields where the firm set has twenty.
--
-- The retroactive-typing lesson recurring verbatim — types without project defs,
-- the half-done fix a screenshot caught — arriving through a different door
-- because the seeding lived in an event handler rather than in the data path.
--
-- So it moves INTO the data path. A trigger is structural by construction:
-- intake approval, the picker, retroactive ratification, manual assignment, and
-- every path that does not exist yet. Calling one function from N call sites is
-- a rule the N+1th call site breaks.
--
-- Applied 2026-08-04. Backfill census: 9 (project, type) pairs, 323 def rows.
-- Verified in both states — a typed unit of a never-carried type seeded 32 defs
-- against a 32-row firm set; zero pairs remain missing.
create or replace function seed_project_field_defs() returns trigger
language plpgsql security definer as $$
begin
  if new.equipment_type is null then return new; end if;
  if tg_op = 'UPDATE' and old.equipment_type is not distinct from new.equipment_type then
    return new;
  end if;
  insert into project_equipment_field_defs
    (project_id, equipment_type, section, field_name, unit, sort_order)
  select new.project_id, f.equipment_type, f.section, f.field_name,
         case when coalesce(p.unit_system, 'metric') = 'imperial'
              then coalesce(f.unit_imperial, f.unit) else f.unit end,
         f.sort_order
  from equipment_type_field_defs f
  cross join (select unit_system from projects where id = new.project_id) p
  where f.equipment_type = new.equipment_type
    -- NEVER OVERWRITE: a project's field structure is sovereign once it exists.
    and not exists (
      select 1 from project_equipment_field_defs d
      where d.project_id = new.project_id and d.equipment_type = new.equipment_type);
  return new;
end $$;

drop trigger if exists equipment_seed_defs on equipment;
create trigger equipment_seed_defs
  after insert or update of equipment_type on equipment
  for each row execute function seed_project_field_defs();
