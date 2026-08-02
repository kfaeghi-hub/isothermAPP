-- TYPE RATIFICATIONS, ruled 2026-08-02.
--
-- Three types minted from the sweep's unknown queue. All three are ORDINARY
-- equipment types — the sweep found the names, a human ruled on them, and
-- minting is that ruling rather than a side effect.
--
-- THE EMITTER DISCIPLINE, applied as ruled: wall_fin and convector get the
-- radiant_panel treatment — passive emitters with no motor, no controls of
-- their own, often no serial plate. Six own rows plus the three from __base is
-- nine, the same shape radiant_panel was held at. Do not let these grow to
-- match the air-side types; they have less to verify, and a form with rows
-- nobody fills is a form people abandon.

insert into equipment_types (key, name, sort_order, active) values
  ('wall_fin',       'Wall Fin (Fin-Tube Radiation)',
     coalesce((select max(sort_order) from equipment_types), 0) + 1, true),
  ('convector',      'Convector',
     coalesce((select max(sort_order) from equipment_types), 0) + 2, true),
  ('expansion_tank', 'Expansion Tank',
     coalesce((select max(sort_order) from equipment_types), 0) + 3, true)
on conflict (key) do nothing;

with f(equipment_type, field_name, unit, ord) as (values
  -- ── the two emitters share a shape, because they ARE the same job ─────────
  ('wall_fin', 'Length',              'mm',  10),
  ('wall_fin', 'Output',              'W/m', 11),
  ('wall_fin', 'Entering Water Temp', '°C',  12),
  ('wall_fin', 'Leaving Water Temp',  '°C',  13),
  ('wall_fin', 'Flow',                'L/s', 14),
  ('wall_fin', 'Connection Size',     'NPS', 15),

  ('convector', 'Length',              'mm',  10),
  ('convector', 'Output',              'W/m', 11),
  ('convector', 'Entering Water Temp', '°C',  12),
  ('convector', 'Leaving Water Temp',  '°C',  13),
  ('convector', 'Flow',                'L/s', 14),
  ('convector', 'Connection Size',     'NPS', 15),

  -- ── expansion tank: a pressure vessel, so the numbers are volumes and
  --    pressures rather than temperatures and flows. Pre-charge is the one a
  --    CxA actually reads with a gauge on site, which is why it is here at all.
  ('expansion_tank', 'Tank Volume',           'L',   10),
  ('expansion_tank', 'Acceptance Volume',     'L',   11),
  ('expansion_tank', 'Pre-Charge Pressure',   'kPa', 12),
  ('expansion_tank', 'Max Working Pressure',  'kPa', 13),
  ('expansion_tank', 'Connection Size',       'NPS', 14)
),
s(section) as (values ('spec'), ('shop_drawing'), ('installed'))
insert into equipment_type_field_defs (equipment_type, section, field_name, unit, sort_order)
select f.equipment_type, s.section, f.field_name, f.unit, f.ord
  from f cross join s
 where not exists (select 1 from equipment_type_field_defs d
                    where d.equipment_type=f.equipment_type and d.section=s.section
                      and d.field_name=f.field_name);

-- The imperial counterparts, same five swaps as the rest of the sets.
update equipment_type_field_defs set unit_imperial = case unit
  when 'L/s' then 'GPM' when 'kPa' then 'ft' when '°C' then '°F'
  when 'mm' then 'in' when 'kg/h' then 'lb/h' when 'L' then 'US gal' else null end
 where equipment_type in ('wall_fin','convector','expansion_tank')
   and unit in ('L/s','kPa','°C','mm','L');

select equipment_type, count(distinct field_name) own_rows, count(*) defs
  from equipment_type_field_defs
 where equipment_type in ('wall_fin','convector','expansion_tank')
 group by 1 order by 1;
