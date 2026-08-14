-- T5 (the class fix) — one def row per (project, type, section, field), as a
-- DATABASE FACT. [RIVET] 2026-08-14, owner-ruled, part 2 of 2 (the data repair
-- that made this index creatable is field-defs-dedupe-repair-migration.sql).
--
-- THE 1.02 LESSON, APPLIED: the seeding guard was a read (the trigger's NOT
-- EXISTS) with no constraint behind it — a check-then-insert that two
-- overlapping writers both passed. Ten of the eleven measured duplicate pairs
-- were two complete seeds 0.25-0.43s apart; the eleventh was a manual
-- field-add collision three minutes later, which the same missing constraint
-- permitted. A guard that is a read refuses nothing; this index is the refusal.
--
-- NULLS NOT DISTINCT deliberately: every keyed column is NOT NULL today, but a
-- plain unique index treats NULLs as distinct and refuses nothing the day one
-- of them is loosened — the proposals-queue index shipped exactly that way and
-- both duplicate inserts succeeded. The clause is load-bearing insurance, not
-- decoration.

create unique index project_equipment_field_defs_one_per_field
  on project_equipment_field_defs (project_id, equipment_type, section, field_name)
  nulls not distinct;

-- The trigger keeps its NOT EXISTS — it is SOVEREIGNTY, not the race guard:
-- a project that deliberately deleted firm fields must not get them re-seeded
-- by the next unit of that type, and ON CONFLICT alone would re-add them (a
-- deleted row is no conflict). ON CONFLICT DO NOTHING covers what NOT EXISTS
-- cannot: two writers passing the check in overlapping snapshots. Belt for
-- sovereignty, braces for the race.
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
      where d.project_id = new.project_id and d.equipment_type = new.equipment_type)
  on conflict (project_id, equipment_type, section, field_name) do nothing;
  return new;
end $$;

-- APPLIED 2026-08-14. Companion code change in the same commit series retires
-- the second writer: EquipmentPage's ensureFieldDefs no longer seeds concrete
-- types (the trigger owns that path since 2026-08-04; the client call sites
-- were the unretired half) and narrows to the __base pseudo-type — which the
-- trigger can never seed, because no equipment row carries it — hardened to an
-- upsert that ignores duplicates over this index.
