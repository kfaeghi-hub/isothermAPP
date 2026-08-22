-- E2(a) — mint `hydronic_coil` with the IVC master's coil block, a Duty
-- discriminator, and variant aliases. [RIVET] owner-ruled 2026-08-22.
--
-- WHY A TYPE AND NOT TWO: the master carries a HEATING COIL block and a
-- COOLING COIL block with IDENTICAL rows. That is the textbook
-- variants-are-DATA case — one equipment class, a value that says which duty
-- — and splitting it would fragment a family field staff already read as one
-- thing. `Duty` is the discriminator (Heating / Cooling / Preheat / Reheat);
-- rows that do not apply to a given duty sit blank, exactly as `fan`'s MBH
-- does where there is no heating coil.
--
-- THE FIELD SET IS THE MASTER'S OWN ROWS, expanded where one row carries two
-- values (EAT/LAT DB → two fields; EWT/LWT → two fields) and split where one
-- row carries two facts (TYPE OF FLUID (WATER/GLYCOL %) → Fluid Type +
-- Glycol %). Nothing invented beyond that expansion; identity (Manufacturer /
-- Model / Serial) is NOT restated here because `__base` supplies it to every
-- type and the resolver de-duplicates by field name.
--
-- UNITS follow the ruled firm convention (units proposal, 2026-08-02): metric
-- primary with an imperial counterpart where the quantity swaps, and CFM/MBH
-- kept as-is because those are already what a local engineer writes. The
-- master is an imperial document; a project on the imperial system seeds the
-- right-hand column automatically.
--
-- Idempotent: every insert is NOT-EXISTS guarded, so a re-run adds nothing.

-- ── the type ────────────────────────────────────────────────────────────────
insert into equipment_types (key, name, kind, sort_order, active)
select 'hydronic_coil', 'Hydronic Coil', 'equipment',
       (select coalesce(max(sort_order), 0) + 1 from equipment_types), true
where not exists (select 1 from equipment_types where key = 'hydronic_coil');

-- ── the field set: 11 fields x 3 sections ───────────────────────────────────
insert into equipment_type_field_defs (equipment_type, section, field_name, unit, unit_imperial, sort_order)
select 'hydronic_coil', s.section, f.field_name, f.unit, f.unit_imperial, f.sort_order
from (values
  ('Duty',                 null,  null,   1),   -- Heating | Cooling | Preheat | Reheat
  ('Total Capacity',       'MBH', null,   2),
  ('Air Flow',             'CFM', null,   3),
  ('Entering Air Temp',    '°C',  '°F',   4),
  ('Leaving Air Temp',     '°C',  '°F',   5),
  ('Fluid Type',           null,  null,   6),   -- Water | Glycol
  ('Glycol %',             '%',   null,   7),
  ('Fluid Flow',           'L/s', 'GPM',  8),
  ('Entering Water Temp',  '°C',  '°F',   9),
  ('Leaving Water Temp',   '°C',  '°F',  10),
  ('Fluid Pressure Drop',  'kPa', 'ft',  11)
) as f(field_name, unit, unit_imperial, sort_order)
cross join (values ('spec'), ('shop_drawing'), ('installed')) as s(section)
where not exists (
  select 1 from equipment_type_field_defs d
  where d.equipment_type = 'hydronic_coil'
    and d.section = s.section
    and d.field_name = f.field_name);

-- ── variant aliases: EXACT MATCH ONLY, never as words ───────────────────────
-- Multi-word by design. Every one of these is a phrase a schedule or a
-- descriptor actually uses for this thing — including the five SJWS units'
-- own descriptor, "Heating Coil", and the reporter's "Hydronic Coils".
-- Nothing two-letter: a short token is how a tag prefix starts claiming units.
insert into equipment_type_aliases (type_key, alias, note)
select 'hydronic_coil', a.alias,
       'Owner-ruled 2026-08-22 (RIVET E2): variant alias minted with the type. The master carries heating and cooling coil blocks with identical rows, so duty is DATA (the Duty field), not a separate type.'
from (values
  ('Hydronic Coil'), ('Hydronic Coils'), ('Heating Coil'), ('Cooling Coil'),
  ('Pre-Heat Coil'), ('Preheat Coil'), ('Reheat Coil'), ('Water Coil')
) as a(alias)
where not exists (
  select 1 from equipment_type_aliases x where lower(btrim(x.alias)) = lower(btrim(a.alias)));
