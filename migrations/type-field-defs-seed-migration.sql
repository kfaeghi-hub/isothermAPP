-- NAMEPLATE CAMPAIGN step 3b — the four type tables and the three additions.
-- Ruled 2026-08-02 as drafted. heat_pump's trim is NOT here; it awaits its own
-- ruling on the cut list.
--
-- IDENTITY IS NOT RESTATED. The drafted tables each opened with Manufacturer /
-- Model Number / Serial Number, because they were written before `__base`
-- existed. Those three now arrive from the base set on every unit, and the
-- resolver dedups by field name — so restating them here would either be dead
-- rows or, worse, a second definition that could drift from the base one and
-- silently win. The types below carry only what is theirs.
--
-- Row counts against the ruled tables:
--   panel          11 ruled - 3 identity =  8
--   humidifier     11 ruled - 3 identity =  8
--   radiant_panel   9 ruled - 3 identity =  6   (held at 9 total, as ruled)
--   unit_heater    12 ruled - 3 identity =  9
--
-- Units are seeded at the firm's current convention, per the units ruling: the
-- metric set deliberately keeps CFM, MBH and NPS.

-- ── unit_heater is minted first: the FK on equipment.equipment_type means the
--    type must exist before anything can be assigned to it. ───────────────────
insert into equipment_types (key, name, sort_order, active)
values ('unit_heater', 'Unit Heater',
        coalesce((select max(sort_order) from equipment_types), 0) + 1, true)
on conflict (key) do nothing;

-- ── the four sets ───────────────────────────────────────────────────────────
-- Every field applies to all three sections, so the section is a cross join
-- rather than three near-identical row lists nobody would keep in step.
with f(equipment_type, field_name, unit, ord) as (values
  -- panel · Panel (Electrical Distribution) · 26 units
  ('panel', 'Voltage',              'V',    10),
  ('panel', 'Phase',                'Ø',    11),
  ('panel', 'Main Bus Rating',      'A',    12),
  ('panel', 'Main Breaker / MLO',   'A',    13),
  ('panel', 'AIC Rating',           'kA',   14),
  ('panel', 'Circuit Spaces',       '#',    15),
  -- Fed From earns its place on a COMMISSIONING register specifically:
  -- verifying a panel means tracing its source, and it is the one field a CxA
  -- cannot recover by reading the nameplate in front of them.
  ('panel', 'Fed From',             null,   16),
  ('panel', 'Enclosure Type',       'NEMA', 17),

  -- humidifier · 8 units
  ('humidifier', 'Type',            null,   10),
  ('humidifier', 'Capacity',        'kg/h', 11),
  ('humidifier', 'Voltage',         'V',    12),
  ('humidifier', 'Phase',           'Ø',    13),
  ('humidifier', 'Hz',              'Hz',   14),
  ('humidifier', 'FLA',             'A',    15),
  ('humidifier', 'Power Input',     'kW',   16),
  ('humidifier', 'Control Signal',  null,   17),

  -- radiant_panel · 2 units · HELD AT 9 TOTAL, as ruled. A hydronic radiant
  -- panel is a passive emitter with no motor, no controls of its own, and often
  -- no serial plate. Do not let this grow to match the others.
  ('radiant_panel', 'Panel Length',    'mm',  10),
  ('radiant_panel', 'Output',          'W/m', 11),
  ('radiant_panel', 'Supply Temp',     '°C',  12),
  ('radiant_panel', 'Return Temp',     '°C',  13),
  ('radiant_panel', 'Flow',            'L/s', 14),
  ('radiant_panel', 'Connection Size', 'NPS', 15),

  -- unit_heater · newly minted (Adam)
  ('unit_heater', 'Heating Capacity',  'MBH', 10),
  ('unit_heater', 'Airflow',           'CFM', 11),
  -- The air-temp pair is what lets a CxA verify capacity ON SITE rather than
  -- copy it off the schedule, which is the difference between commissioning a
  -- unit and transcribing a submittal.
  ('unit_heater', 'Entering Air Temp', '°C',  12),
  ('unit_heater', 'Leaving Air Temp',  '°C',  13),
  ('unit_heater', 'Voltage',           'V',   14),
  ('unit_heater', 'Phase',             'Ø',   15),
  ('unit_heater', 'Hz',                'Hz',  16),
  ('unit_heater', 'Motor kW / HP',     'kW',  17),
  ('unit_heater', 'FLA',               'A',   18),

  -- ── the three surgical additions ──────────────────────────────────────────
  -- Water / steam / glycol changes the entire test procedure and is not
  -- derivable from anything else on the plate.
  ('boiler', 'Fluid Type',        null,  40),
  -- Whether a pump is driven decides whether there is a drive to commission.
  ('pump',   'VFD',               null,  40),
  -- Only where the fan carries a heating coil; blank elsewhere, which is the
  -- honest state for a field that does not apply rather than a zero.
  ('fan',    'Heating Capacity',  'MBH', 40)
),
s(section) as (values ('spec'), ('shop_drawing'), ('installed'))
insert into equipment_type_field_defs (equipment_type, section, field_name, unit, sort_order)
select f.equipment_type, s.section, f.field_name, f.unit, f.ord
  from f cross join s
 where not exists (
   select 1 from equipment_type_field_defs d
    where d.equipment_type = f.equipment_type
      and d.section        = s.section
      and d.field_name     = f.field_name);

select equipment_type,
       count(distinct field_name) rendered_rows,
       count(*) defs
  from equipment_type_field_defs
 where equipment_type in ('panel','humidifier','radiant_panel','unit_heater','boiler','pump','fan','__base')
 group by 1 order by 1;
