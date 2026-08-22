# E3 — type → discipline mapping, DRY RUN for the owner's red pen

**[RIVET] 2026-08-22. Nothing is written. Nothing is applied.** This table is
the artifact; **the owner's marks on it are the taxonomy ruling**, and an
applier reads the marked file — the ratification law's shape (ratification
binds to an artifact, never to a process).

**Why it exists:** the type picker's typed search is good — "pump" ranks Pump
first with its alias caption, measured. What is not good is *browsing*: **86
active types in one flat list**. `equipment_types` carries `kind`
(equipment 73 / system 13), which is an axis but not a discipline.

**The vocabulary is not invented here.** `equipment_tag_glossary.discipline`
already carries seven values, in use today:

| discipline | glossary rows |
|---|---|
| `mechanical` | 44 |
| `controls_bas` | 11 |
| `electrical` | 10 |
| `data_center` | 9 |
| `fire_alarm` | 8 |
| `lighting` | 6 |
| `security` | 5 |

**Two proposed ADDITIONS, flagged rather than assumed** — strike them and I
will fold their members into the nearest existing value:

- **`plumbing`** — the Cx Index already has a *Plumbing / Domestic* stage
  group (7 columns), so plumbing is a discipline in the firm's own structure;
  without it, backflow preventers and DHW heaters sit under `mechanical`.
- **`fire_protection`** — `fire_alarm` is detection and alarm; sprinklers,
  standpipes and fire pumps are **suppression**. Folding suppression into
  `fire_alarm` would put a fire pump under a discipline that does not test it.

**Marks I am asking for:** cross out a discipline and write the right one.
`?` in the last column marks the ones where my proposal is a genuine guess
rather than a reading — those are where the pen is most needed.

---

## mechanical (39)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `ahu` | Air Handling Unit | 20 | 31 | |
| `ahu_builtup` | Built-Up Air Handling Unit | 0 | 0 | |
| `air_separator` | Air Separator | 2 | 25 | |
| `air_compressor` | Air Compressor | 0 | 35 | **?** shop air vs medical vs instrument — could be plumbing |
| `air_dryer` | Compressed Air Dryer | 0 | 0 | **?** follows air_compressor |
| `boiler` | Boiler | 23 | 34 | |
| `chiller` | Chiller | 3 | 29 | |
| `convector` | Convector | 62 | 23 | |
| `cooling_tower` | Cooling Tower | 2 | 25 | |
| `dehumidifier` | Dehumidifier | 0 | 29 | |
| `duct_heater` | Duct Heater | 2 | 40 | **?** electric duct heater is arguably electrical scope |
| `erv` | Energy Recovery Ventilator | 10 | 28 | |
| `expansion_tank` | Expansion Tank | 9 | 30 | |
| `fan` | Fan | 55 | 27 | |
| `fcu` | Fan Coil Unit | 146 | 28 | |
| `fluid_cooler` | Fluid Cooler | 0 | 0 | |
| `glycol_feeder` | Glycol Feeder | 2 | 0 | |
| `glycol_tank` | Glycol Mixing & Fill Tank | 1 | 0 | |
| `heat_exchanger` | Heat Exchanger | 4 | 38 | |
| `shell_and_tube_steam_heat_exchanger` | Shell and Tube Steam HX | 0 | 42 | |
| `heat_pump` | Heat Pump | 12 | 20 | |
| `hrv` | Heat Recovery Ventilator | 0 | 35 | |
| `humidifier` | Humidifier | 8 | 37 | |
| `hydraulic_separator` | Hydraulic Separator | 0 | 0 | |
| `hydronic_coil` | Hydronic Coil | 5 | 33 | *(minted today, E2)* |
| `louver` | Louver | 0 | 32 | |
| `mau` | Make-Up Air Unit | 3 | 31 | |
| `mixing_valve` | Mixing Valve | 1 | 0 | **?** hydronic vs domestic-water — plumbing if the latter |
| `pump` | Pump | 82 | 36 | |
| `radiant_panel` | Radiant Panel | 3 | 29 | |
| `rtu` | Rooftop Unit | 8 | 31 | |
| `split_system` | Split System Air Conditioner | 1 | 29 | |
| `unit_heater` | Unit Heater | 133 | 54 | |
| `unit_ventilator` | Unit Ventilator | 23 | 0 | |
| `vav` | VAV Box | 98 | 26 | |
| `vrf` | VRF System (Outdoor Unit) | 0 | 36 | |
| `wall_fin` | Wall Fin (Fin-Tube Radiation) | 65 | 23 | |
| `fire_smoke_damper` | Fire Smoke Damper | 0 | 31 | **?** mechanical device, life-safety duty — could be fire_protection |
| `water_tank` | Water Tank | 5 | 0 | **?** plumbing if domestic, mechanical if hydronic |

## plumbing (proposed — 6)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `backflow_preventer` | Backflow Preventer | 0 | 24 | |
| `dhw_heater` | Domestic Hot Water Heater | 2 | 30 | |
| `plumbing_fixture` | Plumbing Fixture | 0 | 0 | |
| `water_meter` | Water Meter | 0 | 0 | **?** could be metering/electrical if it is a BAS meter |
| `water_softener` | Water Softener | 3 | 35 | |
| `sump_pump` | Sump Pump | 4 | 32 | **?** sits under `pump` family in the register today |

## electrical (16)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `ats` | Automatic Transfer Switch | 7 | 22 | |
| `distribution_panel` | Distribution Panel | 0 | 0 | |
| `generator` | Generator | 3 | 31 | |
| `load_bank_panel` | Load Bank Panel | 0 | 0 | |
| `main_switchgear` | Main Switchgear | 0 | 0 | |
| `mcc` | Motor Control Centre | 0 | 33 | |
| `metering_system` | Metering System | 0 | 0 | |
| `panel` | Panel (Electrical Distribution) | 26 | 39 | |
| `pv_fused_disconnect` | PV Fused Disconnect | 0 | 0 | |
| `pv_system` | PV System | 1 | 31 | |
| `secondary_switchgear` | Secondary Switchgear | 0 | 0 | |
| `switchboard` | Switchboard | 0 | 30 | |
| `switchgear` | Switchgear | 0 | 25 | |
| `transformer` | Transformer | 0 | 36 | |
| `utility_transformer` | Utility Transformer | 0 | 0 | |
| `ups` | Uninterruptible Power Supply | 0 | 35 | |
| `vfd` | Variable Frequency Drive | 0 | 36 | **?** electrical device, mechanical scope — the drive is commissioned with its pump/fan |

## lighting (1)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `lighting_panel` | Lighting Panel | 0 | 35 | **?** or electrical — the glossary keeps lighting separate, so this follows the glossary |

## fire_alarm (2)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `fire_alarm_panel` | Fire Alarm Panel | 0 | 34 | |
| `smoke_control_panel` | Firefighters' Smoke Control Station | 0 | 34 | |

## fire_protection (proposed — 8)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `fire_pump` | Fire Pump | 1 | 42 | |
| `jockey_pump` | Jockey Pump | 0 | 19 | |
| `fire_extinguisher` | Fire Extinguisher System | 0 | 0 | |
| `fire_protection` | Fire Protection | 1 | 33 | **?** a catch-all type; may want retiring rather than filing |
| `sprinkler_system` | Sprinkler System *(system)* | 0 | 0 | |
| `sprinkler_piping` | Sprinkler Piping System *(system)* | 0 | 0 | |
| `standpipe_system` | Standpipe System *(system)* | 1 | 0 | |
| `preaction_station` | Preaction Valve Station *(system)* | 0 | 27 | |
| `smoke_control_fan` | Smoke Control Fan | 0 | 32 | **?** a fan by construction, smoke-control by duty |
| `smoke_management` | Smoke Management System *(system)* | 0 | 0 | **?** same question, at system level |

## controls_bas (3)

| type | name | units | defs |
|---|---|---|---|
| `bas_ahu_control` | AHU Control System *(system)* | 0 | 0 |
| `bas_chw_control` | Chilled Water Control System *(system)* | 0 | 0 |
| `bas_hw_control` | Hot Water Heating Control System *(system)* | 0 | 0 |

## security (1) · data_center (1)

| type | name | units | defs | ? |
|---|---|---|---|---|
| `security_systems` | Security Systems | 1 | 23 | |
| `it_systems` | IT Systems | 1 | 23 | **?** `data_center` per the glossary, or `electrical` on a normal job |

## no obvious home — the pen decides (10)

| type | name | units | defs | note |
|---|---|---|---|---|
| `elevator` | Elevator | 0 | 41 | vertical transportation; own discipline? |
| `vertical_transportation` | Vertical Transportation | 1 | 31 | **duplicates `elevator`** — one of the two probably retires |
| `door_hardware` | Door Hardware | 1 | 26 | life-safety/egress adjacent |
| `egress_system` | Egress System *(system)* | 0 | 0 | |
| `communication_system` | Communication System *(system)* | 0 | 0 | |
| `gas_fluid_distribution` | Gas & Fluid Distribution *(system)* | 0 | 0 | |
| `fire_separations` | Fire and Smoke Separations *(system)* | 0 | 0 | |
| `hydronic_heating_system` | Hydronic Heating System *(system)* | 0 | 0 | emptied by E2's re-key; stands as a system-kind type |
| `dbf_unidentified` · `gi_unidentified` · `prv_ng_unidentified` · `rhc_unidentified` | four "(unidentified)" placeholders | 0 | 0 | **these are Seneca's MISCELLANEOUS nine, minted as placeholders.** They are the same open question the cycle-3 audit put on your list — file them, or resolve the units and retire them |

---

## What ships on confirm (and only then)

1. `equipment_types.discipline` — a nullable text column, admin-editable like
   every other vocabulary row, defaulted NULL so nothing breaks before it is
   filled.
2. **Browse sections in the picker**, grouped by discipline, ordered by the
   marked table. **Typed search is untouched** — it already works, and the
   ranking law (loose to offer, strict to decide) stays exactly as it is.
3. A one-line back-fill from this artifact, read from the file, no model call,
   refusing on a type whose key has moved since the marks were made.

**Not proposed:** any change to how a type resolves. Grouping is a browse
affordance. A discipline must never become a matcher input — that is the
tag-prefix disease one level up.
