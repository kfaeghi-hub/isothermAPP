-- T5 (data repair) — remove the doubled project field-def rows.
-- [RIVET] 2026-08-14, owner-ruled class fix, part 1 of 2 (the constraint that
-- prevents recurrence is field-defs-unique-index-migration.sql, applied in its
-- own commit per protocol).
--
-- WHAT WAS MEASURED: 11 (project, type) pairs across 5 projects carried every
-- field exactly twice — Central Tech/fcu (the reported case), Alexander Muir/
-- heat_exchanger, Clairlea/water_softener, Quinte x4 (boiler, fan, heat_pump,
-- pump), SJWS x4 (ahu, fan, mau, hydronic_heating_system[1 field]) — 308
-- duplicate rows in total. Ten pairs were two complete seeds landing 0.25-0.43s
-- apart; one was a single manually-collided field 3m19s later.
--
-- THE MECHANISM: seed_project_field_defs() guards with NOT EXISTS — a
-- check-then-insert with no unique constraint behind it — and the client-side
-- ensureFieldDefs() (which the trigger was built to replace on 2026-08-04, and
-- which was never retired) re-seeded from stale React state right after the
-- trigger had already seeded. Two writers, no database fact refusing the second.
--
-- WHY THIS DELETE IS LOSS-FREE: def rows are pure structure (name, section,
-- unit, sort). Values live in equipment.nameplate_extra keyed by FIELD NAME, so
-- two def rows with one name bind ONE stored value (which is exactly how the
-- defect surfaced: "both fields populate at the same time"). Removing the later
-- copy of each pair discards no value anywhere. No FK references this table
-- (verified against pg_constraint before writing this).
--
-- KEEP THE EARLIEST COPY (created_at, then id) — the first writer's row is the
-- one every earlier read was already using.

with ranked as (
  select id, row_number() over (
    partition by project_id, equipment_type, section, field_name
    order by created_at, id
  ) as rn
  from project_equipment_field_defs
)
delete from project_equipment_field_defs d
using ranked r
where d.id = r.id and r.rn > 1;

-- Resting state, asserted in the same act: zero duplicated keys remain.
-- (A cleanup that silently did nothing looks identical to one that worked.)
-- select count(*) from (
--   select 1 from project_equipment_field_defs
--   group by project_id, equipment_type, section, field_name
--   having count(*) > 1
-- ) dup;  -- must be 0
--
-- APPLIED 2026-08-14 (Supabase Management API): census before = 308 duplicated
-- keys; DELETE .. RETURNING removed exactly 308 rows; census after = 0;
-- Central Tech fcu re-verified at exactly its 28-row firm-set size.
