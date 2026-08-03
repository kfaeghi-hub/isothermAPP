-- equipment-catalog-campaign-migration.sql — the CxA equipment world, ruled 2026-08-03
--
-- Phase 2 of the catalog campaign. 26 types minted BASE-ONLY: they carry the
-- universal __base identity set and nothing else until the drafter's tables are
-- ratified. A type with no nameplate table is valid and renders identity.
--
-- NOTHING SPECULATIVE IS SEEDED. No applicability rules, no field defs. The
-- classifier proposes applicability only when a project first carries real units
-- of a type — recorded as the campaign's deliberate boundary, because a catalog
-- is a claim about what MIGHT appear and an applicability rule is a claim about
-- what a SPECIFIC project must verify.
--
-- RTU, HRV and VRF get NO alias rows and need none. They are on the never-alias
-- list because they are distinct equipment rather than shorthand; minted as
-- TYPES, the picker resolves them through tier 1 — exact key match — so typing
-- "RTU" finds Rooftop Unit with no alias existing. The block list is untouched.
-- The same reasoning skips redundant aliases for MCC, VFD and UPS.

begin;

-- ── the mints ────────────────────────────────────────────────────────────────

insert into equipment_types (key, name, sort_order, active) values
  -- mechanical, air side
  ('rtu',                'Rooftop Unit',                    100, true),
  ('mau',                'Make-Up Air Unit',                101, true),
  ('hrv',                'Heat Recovery Ventilator',        102, true),
  -- "Outdoor Unit" is load-bearing: the INDOOR units of a VRF system stay `fcu`.
  -- Ruled 2026-08-03 and recorded so the boundary is in the vocabulary itself.
  ('vrf',                'VRF System (Outdoor Unit)',       103, true),
  ('dehumidifier',       'Dehumidifier',                    104, true),
  ('duct_heater',        'Duct Heater',                     105, true),
  -- Ruled MINT: integrated systems testing verifies per device by intent, the
  -- register scales, and intake loads them from the damper schedule.
  ('fire_smoke_damper',  'Fire Smoke Damper',               106, true),
  -- mechanical, hydronic plant
  ('heat_exchanger',     'Heat Exchanger',                  110, true),
  ('air_separator',      'Air Separator',                   111, true),
  ('sump_pump',          'Sump Pump',                       112, true),
  -- plumbing / process
  ('dhw_heater',         'Domestic Hot Water Heater',       120, true),
  ('water_softener',     'Water Softener',                  121, true),
  ('backflow_preventer', 'Backflow Preventer',              122, true),
  ('air_compressor',     'Air Compressor',                  123, true),
  -- electrical — every row maps to an ANSI/NETA ATS equipment class
  ('transformer',        'Transformer',                     130, true),
  ('switchgear',         'Switchgear',                      131, true),
  ('switchboard',        'Switchboard',                     132, true),
  ('mcc',                'Motor Control Centre',            133, true),
  ('lighting_panel',     'Lighting Panel',                  134, true),
  ('vfd',                'Variable Frequency Drive',        135, true),
  ('ups',                'Uninterruptible Power Supply',    136, true),
  -- fire protection
  ('fire_pump',          'Fire Pump',                       140, true),
  ('jockey_pump',        'Jockey Pump',                     141, true),
  ('fire_alarm_panel',   'Fire Alarm Panel',                142, true),
  -- conveying (CSA Z320 names vertical transportation as its own system class)
  ('elevator',           'Elevator',                        150, true),
  -- envelope — the ONE envelope type, because a louver is scheduled with a mark
  -- on the MECHANICAL drawings and is genuinely a unit. Assemblies (air barrier,
  -- roofing, fenestration sampling) wait for the assemblies model: BACKBURNER 3c.
  ('louver',             'Louver',                          160, true)
on conflict (key) do nothing;

-- ── the ruled aliases ────────────────────────────────────────────────────────
-- Exact match only, never as words. Nothing under three characters unless it has
-- no competing meaning in this domain.

insert into equipment_type_aliases (type_key, alias, note) values
  ('mau',               'MAU',   null),
  ('mau',               'MUA',   'Both spellings are in live use on Ontario drawings.'),
  ('fire_smoke_damper', 'FSD',   null),
  ('heat_exchanger',    'HX',    'Two characters, but no competing meaning in this domain — ruled 2026-08-03.'),
  ('dhw_heater',        'DHW',   null),
  ('backflow_preventer','BFP',   null),
  ('transformer',       'XFMR',  null),
  ('switchgear',        'SWGR',  null),
  ('switchboard',       'SWBD',  null),
  ('fire_alarm_panel',  'FACP',  null),
  ('elevator',          'ELEV',  null),
  -- CORRECT ALREADY, so an alias rather than a competing type: a distribution
  -- panel IS what `panel` means. Minting `distribution_panel` would have split
  -- one concept across two keys.
  ('panel',             'Distribution Panel',
     'Alias, not a mint: a distribution panel is what `panel` already means. Ruled 2026-08-03.')
on conflict do nothing;

-- ── never-alias additions, each with its reason ──────────────────────────────
-- The trigger refuses these at the database, and the reason travels with the
-- refusal so a future admin learns rather than being told no.

insert into blocked_type_aliases (alias, reason) values
  ('ac', 'AC is AIR CONDITIONING to every other trade on the drawing set. It must never resolve to air_compressor. Ruled 2026-08-03.'),
  ('dh', 'Two characters; collides with tag prefixes. Dehumidifier is spelled out.'),
  ('tx', 'Two characters; collides with tag prefixes. Transformer uses XFMR.'),
  ('wh', 'Two characters; collides with tag prefixes. Domestic hot water uses DHW.')
on conflict (alias) do update set reason = excluded.reason;

commit;
