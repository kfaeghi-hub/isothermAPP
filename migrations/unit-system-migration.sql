-- UNITS — option C, ruled 2026-08-02: a per-project unit system drives def
-- seeding. Option A (the per-field picker with a convert-with-count guard) rides
-- on the same `unit_imperial` column and lands separately.
--
-- WHY THIS IS THE MOMENT OF LEAST COST. The choice is made once, at project
-- setup, by whoever has the drawing set in front of them — and it is NOT
-- retroactive. Existing projects keep their labels and their numbers stay
-- meaningful, which is the same sovereignty rule the nameplate campaign uses.
--
-- THE EXISTING MIX IS CORRECT AND STAYS. CFM, MBH and NPS sit beside L/s and kPa
-- in the metric set, and that is Ontario drawing practice rather than accretion:
-- air is scheduled in CFM, heating capacity in MBH and pipe in NPS on drawings
-- that are otherwise metric. They have NO imperial counterpart below because
-- they are already what a local engineer writes.
--
-- Only five quantities actually swap.

alter table projects
  add column if not exists unit_system text not null default 'metric'
    check (unit_system in ('metric', 'imperial'));

comment on column projects.unit_system is
  'Drives which unit string a field def is seeded with. Applies at seeding time '
  'only — never retroactive to a project whose nameplates already hold values.';

alter table equipment_type_field_defs
  add column if not exists unit_imperial text;

comment on column equipment_type_field_defs.unit_imperial is
  'The imperial counterpart of `unit`, where one exists. NULL means the unit is '
  'already what both systems use (CFM, MBH, NPS, V, A, Hz, %, RPM).';

-- ── the five swaps, and nothing else ────────────────────────────────────────
-- kPa is deliberately mapped to ft rather than PSI: every kPa in the current
-- sets is a PUMP HEAD or a hydronic pressure, and imperial drawings express head
-- in feet. PSI is the right counterpart for a gas or vessel pressure — where one
-- appears, it is a per-field override under option A, not a global rule.
update equipment_type_field_defs set unit_imperial = case unit
  when 'L/s'  then 'GPM'
  when 'kPa'  then 'ft'
  when '°C'   then '°F'
  when 'mm'   then 'in'
  when 'kg/h' then 'lb/h'
  else null
end
where unit in ('L/s', 'kPa', '°C', 'mm', 'kg/h');

select coalesce(unit, '(none)') as metric_unit,
       coalesce(unit_imperial, '— same in both') as imperial_unit,
       count(*) defs
  from equipment_type_field_defs
 group by 1, 2 order by 3 desc;
