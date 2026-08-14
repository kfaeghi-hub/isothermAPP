-- T4 — unit_heater gains its water side. [RIVET] 2026-08-14, owner-ruled.
--
-- THE GAP, measured before ruling: the live unit_heater def set covers the
-- gas-fired and electric variants (Heating Medium discriminator, Gas Input
-- Rating / Gas Type / Gas Inlet Pressure, Heating Element Rating) and carries
-- NO water-side field at all — a hydronic unit heater (and every force-flow
-- heater the T6 ruling just mapped here) had nowhere to record its duty. The
-- campaign's ruled table (NAMEPLATE-CAMPAIGN-PROPOSAL §2.4, shipped 1.01)
-- never had them either: this is a NEW §3-class surgical addition (the
-- fan+MBH precedent — present where hydronic, blank elsewhere), not a missed
-- ruling.
--
-- Ruled: Flow (L/s · GPM), Entering Water Temp (°C · °F), Leaving Water Temp
-- (°C · °F), spec/shop/installed like the air-temp pair. Appended at the end
-- of the sort order — additive, so no existing layout reshuffles; a project
-- may reorder in its own field editor. Existing project field-structures
-- untouched per the campaign's seeding rules (new defs apply forward).
--
-- The firm table carries no unique index (T5's index is the PROJECT table),
-- so each insert guards itself with NOT EXISTS — run twice, adds nothing.

insert into equipment_type_field_defs (equipment_type, section, field_name, unit, unit_imperial, sort_order)
select 'unit_heater', s.section, f.field_name, f.unit, f.unit_imperial, f.sort_order
from (values
  ('Flow',                'L/s', 'GPM', 19),
  ('Entering Water Temp', '°C',  '°F',  20),
  ('Leaving Water Temp',  '°C',  '°F',  21)
) as f(field_name, unit, unit_imperial, sort_order)
cross join (values ('spec'), ('shop_drawing'), ('installed')) as s(section)
where not exists (
  select 1 from equipment_type_field_defs d
  where d.equipment_type = 'unit_heater'
    and d.section = s.section
    and d.field_name = f.field_name);

-- APPLIED 2026-08-14: 9 rows inserted (3 fields x 3 sections), verified by
-- count; re-run adds zero. Central Tech's sovereign 45-row copy unchanged.
