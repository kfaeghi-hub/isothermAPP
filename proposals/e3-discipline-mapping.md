# E3 — type → discipline mapping, DRY RUN for the owner's red pen

**[RIVET], revised 2026-08-22 into the owner's seven buckets.** Nothing is
written. Nothing is applied. This file is the artifact; **the marks on it are
the taxonomy ruling**, and an applier reads the marked file — ratification
binds to an artifact, never to a process.

**Buckets, as named by the owner:** Mechanical · Electrical · Plumbing ·
Fire Protection · Controls · Architectural · Other.

**COUNT CORRECTION, recorded rather than quietly fixed.** Earlier reports said
"85 / 86 types". That figure came from a census that did **not** filter
`active` and **did** include the `__base` pseudo-type. Measured properly:

| | |
|---|---|
| **active types, excluding `__base`** | **92** |
| equipment-kind | 79 |
| system-kind | 13 |
| **unmapped by this table** | **0** — asserted by the query, not by eye |

**How to mark it:** cross out a bucket, write the right one. A **?** in the
last column is where my assignment is a guess rather than a reading — those
are where the pen earns the most. Rows with no flag are ones I would defend.

**Two vocabulary notes**, because the owner's seven and the glossary's seven
are not the same seven:
- `equipment_tag_glossary.discipline` carries `fire_alarm`, `lighting`,
  `security`, `data_center` — none of which appear in the owner's list. I have
  folded **fire_alarm → Fire Protection** (detection and suppression together)
  and **lighting / security / data_center → Electrical**, each flagged. If the
  intent was to keep any of them standing, say so and the picker gets an
  eighth section.
- Nothing here changes how a type RESOLVES. Discipline is a browse
  affordance; it must never become a matcher input — that is the tag-prefix
  disease one level up.

---

## Mechanical — 40

| type | name | units | ? |
|---|---|---|---|
| `ahu` | Air Handling Unit | 20 | |
| `ahu_builtup` | Built-Up Air Handling Unit | 0 | |
| `air_separator` | Air Separator | 2 | |
| `boiler` | Boiler | 23 | |
| `chiller` | Chiller | 3 | |
| `convector` | Convector | 62 | |
| `cooling_tower` | Cooling Tower | 2 | |
| `dehumidifier` | Dehumidifier | 0 | |
| `erv` | Energy Recovery Ventilator | 10 | |
| `expansion_tank` | Expansion Tank | 9 | |
| `fan` | Fan | 55 | |
| `fcu` | Fan Coil Unit | 146 | |
| `fluid_cooler` | Fluid Cooler | 0 | |
| `glycol_feeder` | Glycol Feeder | 2 | |
| `glycol_tank` | Glycol Mixing & Fill Tank | 1 | |
| `heat_exchanger` | Heat Exchanger | 4 | |
| `shell_and_tube_steam_heat_exchanger` | Shell and Tube Steam Heat Exchanger | 0 | |
| `heat_pump` | Heat Pump | 12 | |
| `hrv` | Heat Recovery Ventilator | 0 | |
| `humidifier` | Humidifier | 8 | |
| `hydraulic_separator` | Hydraulic Separator | 0 | |
| `hydronic_coil` | Hydronic Coil | 5 | *(minted today, E2)* |
| `hydronic_heating_system` *(system)* | Hydronic Heating System | 0 | emptied by E2's re-key; stands |
| `mau` | Make-Up Air Unit | 3 | |
| `pump` | Pump | 82 | |
| `radiant_panel` | Radiant Panel | 3 | |
| `rtu` | Rooftop Unit | 8 | |
| `split_system` | Split System Air Conditioner | 1 | |
| `unit_heater` | Unit Heater | 133 | |
| `unit_ventilator` | Unit Ventilator | 23 | |
| `vav` | VAV Box | 98 | |
| `vrf` | VRF System (Outdoor Unit) | 0 | |
| `wall_fin` | Wall Fin (Fin-Tube Radiation) | 65 | |
| `air_compressor` | Air Compressor | 0 | **?** Plumbing if medical / lab gas |
| `air_dryer` | Compressed Air Dryer | 0 | **?** follows `air_compressor` |
| `duct_heater` | Duct Heater | 2 | **?** an electric duct heater is electrical scope |
| `louver` | Louver | 0 | **?** often an architectural element |
| `mixing_valve` | Mixing Valve | 1 | **?** Plumbing if domestic-water |
| `water_tank` | Water Tank | 5 | **?** Plumbing if domestic |
| `gas_fluid_distribution` *(system)* | Gas & Fluid Distribution | 0 | **?** could be Plumbing |

## Electrical — 21

| type | name | units | ? |
|---|---|---|---|
| `ats` | Automatic Transfer Switch | 7 | |
| `distribution_panel` | Distribution Panel | 0 | |
| `generator` | Generator | 3 | |
| `load_bank_panel` | Load Bank Panel | 0 | |
| `main_switchgear` | Main Switchgear | 0 | |
| `mcc` | Motor Control Centre | 0 | |
| `metering_system` | Metering System | 0 | |
| `panel` | Panel (Electrical Distribution) | 26 | |
| `pv_fused_disconnect` | PV Fused Disconnect | 0 | |
| `pv_system` | PV System | 1 | |
| `secondary_switchgear` | Secondary Switchgear | 0 | |
| `switchboard` | Switchboard | 0 | |
| `switchgear` | Switchgear | 0 | |
| `transformer` | Transformer | 0 | |
| `utility_transformer` | Utility Transformer | 0 | |
| `ups` | Uninterruptible Power Supply | 0 | |
| `vfd` | Variable Frequency Drive | 0 | **?** electrical device, commissioned with its pump/fan |
| `lighting_panel` | Lighting Panel | 0 | **?** glossary keeps `lighting` as its own discipline |
| `it_systems` | IT Systems | 1 | **?** low-voltage; glossary says `data_center` |
| `security_systems` | Security Systems | 1 | **?** low-voltage; glossary says `security` |
| `communication_system` *(system)* | Communication System | 0 | **?** low-voltage |

## Plumbing — 6

| type | name | units | ? |
|---|---|---|---|
| `backflow_preventer` | Backflow Preventer | 0 | |
| `dhw_heater` | Domestic Hot Water Heater | 2 | |
| `plumbing_fixture` | Plumbing Fixture | 0 | |
| `water_softener` | Water Softener | 3 | |
| `sump_pump` | Sump Pump | 4 | **?** sits in the `pump` family in the register today |
| `water_meter` | Water Meter | 0 | **?** Electrical if it is a BAS meter |

## Fire Protection — 13

| type | name | units | ? |
|---|---|---|---|
| `fire_pump` | Fire Pump | 1 | |
| `jockey_pump` | Jockey Pump | 0 | |
| `fire_extinguisher` | Fire Extinguisher System | 0 | |
| `sprinkler_system` *(system)* | Sprinkler System | 0 | |
| `sprinkler_piping` *(system)* | Sprinkler Piping System | 0 | |
| `standpipe_system` *(system)* | Standpipe System | 1 | |
| `preaction_station` *(system)* | Preaction Valve Station | 0 | |
| `smoke_management` *(system)* | Smoke Management System | 0 | |
| `smoke_control_panel` | Firefighters' Smoke Control Station | 0 | |
| `fire_alarm_panel` | Fire Alarm Panel | 0 | **?** glossary's `fire_alarm` folded here — detection with suppression |
| `smoke_control_fan` | Smoke Control Fan | 0 | **?** a fan by construction, life-safety by duty |
| `fire_smoke_damper` | Fire Smoke Damper | 0 | **?** mechanical device, life-safety duty |
| `fire_protection` | Fire Protection | 1 | **?** a catch-all type — retire rather than file? |

## Controls — 3

| type | name | units |
|---|---|---|
| `bas_ahu_control` *(system)* | AHU Control System | 0 |
| `bas_chw_control` *(system)* | Chilled Water Control System | 0 |
| `bas_hw_control` *(system)* | Hot Water Heating Control System | 0 |

## Architectural — 5

| type | name | units | ? |
|---|---|---|---|
| `door_hardware` | Door Hardware | 1 | |
| `egress_system` *(system)* | Egress System | 0 | |
| `elevator` | Elevator | 0 | **?** vertical transportation may deserve its own bucket |
| `vertical_transportation` | Vertical Transportation | 1 | **DUPLICATE of `elevator`** — one of the two should retire |
| `fire_separations` *(system)* | Fire and Smoke Separations | 0 | **?** assemblies, but a fire duty — could be Fire Protection |

## Other — 4

| type | name | units | note |
|---|---|---|---|
| `dbf_unidentified` | DBF (unidentified) | 0 | Seneca MISCELLANEOUS placeholder |
| `gi_unidentified` | GI (unidentified) | 0 | Seneca MISCELLANEOUS placeholder |
| `prv_ng_unidentified` | PRV-NG (unidentified) | 0 | Seneca MISCELLANEOUS placeholder |
| `rhc_unidentified` | RHC (unidentified) | 0 | Seneca MISCELLANEOUS placeholder |

**All four "(unidentified)" placeholders are Seneca's MISCELLANEOUS nine** —
the same open item the cycle-3 audit put on the owner's list. Filing them
under Other is a holding position, not an answer: either the units get
resolved and these retire, or they earn real names.

---

## What ships on confirm — and only then

1. `equipment_types.discipline`, nullable text, admin-editable like every
   other vocabulary row, defaulted NULL so nothing breaks before it is filled.
2. **Browse sections in the picker**, grouped by discipline in the marked
   order. **Typed search is untouched** — it already ranks correctly, and the
   ranking law (loose to offer, strict to decide) stands.
3. A back-fill read **from this marked file**, no model call, refusing on any
   type whose key has moved since the marks were made.
