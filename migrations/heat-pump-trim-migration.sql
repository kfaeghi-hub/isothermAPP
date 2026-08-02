-- heat_pump TRIM — 25 rendered rows to 14. Cut list approved as tabled 2026-08-02.
--
-- Four units exist in the whole system and the set has never been filled in. A
-- 25-row nameplate is not more rigorous than a 14-row one; it is a form people
-- abandon.
--
-- FIRM DEFS ONLY. project_equipment_field_defs is untouched — a project's copy
-- is sovereign once seeded, and this changes what NEW usage starts from, never
-- an in-flight nameplate.

-- ── the 11 cuts, each for a stated reason ──────────────────────────────────
--   Hz                  constant 60 in Ontario; a row never in doubt is noise
--   FLA, RLA            superseded by MCA on a compressor unit — three current
--                       fields for one machine is two too many
--   LRA                 startup inrush: a datum nobody verifies on a walk
--   MOCP                the maximum PERMITTED device — a design constraint, not
--                       a measurement
--   Connected kW        derivable from V x A; two ways to say one thing invite
--                       the two to disagree
--   Refrigerant Type    does not change between spec, shop and installed
--   Refrigerant Charge  a service datum; nobody weighs charge while commissioning
--   Sound Rating        a selection criterion, checked at submittal review
--   Supply ESP          verified on the fan serving it, not duplicated here
--   Connection Size     read off the pipe when connecting; not a verification
delete from equipment_type_field_defs
 where equipment_type = 'heat_pump'
   and field_name in ('Hz', 'FLA', 'RLA', 'LRA', 'MOCP', 'Connected kW',
                      'Refrigerant Type', 'Refrigerant Charge', 'Sound Rating',
                      'Supply ESP', 'Connection Size');

-- ── identity moves to __base, as it did for every set seeded this campaign ──
-- Keeping a type's own copy would be a second definition of the same row, free
-- to drift from the base one and silently win the dedup.
delete from equipment_type_field_defs
 where equipment_type = 'heat_pump'
   and field_name in ('Manufacturer', 'Model Number', 'Serial Number');

select 'heat_pump own rows' as k, count(distinct field_name)::text v
  from equipment_type_field_defs where equipment_type = 'heat_pump'
union all
select 'rendered (own + 3 base)',
       (count(distinct field_name) + 3)::text
  from equipment_type_field_defs where equipment_type = 'heat_pump'
union all
select 'remaining fields',
       string_agg(distinct field_name, ' · ')
  from equipment_type_field_defs where equipment_type = 'heat_pump';
