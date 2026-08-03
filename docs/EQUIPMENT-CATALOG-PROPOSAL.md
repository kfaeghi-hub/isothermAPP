# EQUIPMENT-CATALOG-PROPOSAL.md — the CxA equipment world

**Status: PHASE 1, PROPOSED 2026-08-03. No writes performed. No types minted.**

Research-first, per the campaign ruling. Everything below is a candidate awaiting
the owner's ruling; Phase 2 begins only on that ruling.

---

## Part A — the audit: what the vocabulary holds today

19 active types, 31 aliases, 509 typed units across 6 projects.

| Key | Name | Aliases | Defs | Live units | Projects |
|---|---|---|---|---|---|
| `fcu` | Fan Coil Unit | FCU | 28 | 122 | 3 |
| `vav` | VAV Box | VAV Box | 26 | 81 | 2 |
| `convector` | Convector | CONV | 18 | 62 | 2 |
| `pump` | Pump | CHWP, Circ Pump, CWP, HWP | 36 | 53 | 5 |
| `wall_fin` | Wall Fin (Fin-Tube Radiation) | Fin Tube, FTR | 18 | 50 | 1 |
| `ahu` | Air Handling Unit | AHU, Air Handler, DOAS | 31 | 32 | 4 |
| `panel` | Panel (Electrical Distribution) | Panelboard, PNL | 24 | 26 | 1 |
| `unit_heater` | Unit Heater | UH | 27 | 25 | 2 |
| `fan` | Fan | EF, RF, SF | 27 | 15 | 3 |
| `boiler` | Boiler | BLR | 34 | 11 | 6 |
| `humidifier` | Humidifier | HUM | 24 | 8 | 1 |
| `ats` | Automatic Transfer Switch | ATS | 22 | 7 | 2 |
| `expansion_tank` | Expansion Tank | ET, Exp Tank, XT | 15 | 6 | 2 |
| `erv` | Energy Recovery Ventilator | ERV | 28 | 4 | 2 |
| `heat_pump` | Heat Pump | ASHP, HP, WSHP | 20 | 4 | 2 |
| `chiller` | Chiller | CHLR | 29 | 3 | 2 |
| `generator` | Generator | GEN | 31 | 3 | 2 |
| `cooling_tower` | Cooling Tower | Cooling Twr | 25 | 2 | 1 |
| `radiant_panel` | Radiant Panel | *(none — RP is on the never-list)* | 18 | 2 | 1 |

### The register is already asking for six of these

This is **demand evidence, not speculation** — untyped units sitting on live
projects right now, named by the source documents:

| What the register holds, untyped | Units | Candidate |
|---|---|---|
| `Transformer (30 / 45 / 112.5 kVA)` | **18** | `transformer` |
| `Lighting Panel` | **7** | `lighting_panel` |
| `HEAT EXCHANGER` / `Heat Exchanger` | **7** | `heat_exchanger` |
| `Distribution Panel` | **5** | *(alias of `panel`, not a mint — see Part C)* |
| `Switchboard` | 2 | `switchboard` |
| `ELECTRIC DOMESTIC HOT WATER TANK` | 2 | `dhw_heater` |

Plus 51 units with no observed name at all, and the Water Softener already in the
ratification queue from the type-assignment sweep.

---

## Part B — what the research says

Verified against published taxonomies rather than free-associated.

**CSA Z320 (Building Commissioning)** classifies the systems it covers as
**(a) architectural; (b) vertical and horizontal transportation; (c) electrical;
(d) mechanical; (e) control and integration.** Two consequences for this catalog:
*vertical transportation is a named class*, so an elevator is in scope as an
equipment type; and *architectural is its own class*, which is the first evidence
that envelope work does not belong in the mechanical/electrical equipment table.

**ANSI/NETA ATS** (electrical acceptance testing) enumerates, as testable
equipment: **switchgear and switchboard assemblies, panelboard assemblies,
transformers** (dry-type air-cooled and liquid-filled), and cables — plus system
function tests, thermographic survey, and power system studies. Every electrical
mint-now candidate below maps to a NETA equipment class; nothing was invented.

**OmniClass Table 23 (Products)** classifies the materials, equipment and
manufactured items installed in buildings; UniFormat maps **D30 HVAC**, **D40
fire protection**, **D50 electrical**. Used here as the discipline spine, not as
a naming source — OmniClass names are not what an Ontario engineer writes on a
schedule, and the display name has to match the schedule.

**BECx framework: ASTM E2813 (Standard Practice) and E2947 (Standard Guide)**,
with field testing under **ASTM E1105** (water penetration of *installed
exterior windows, skylights, doors and curtain walls*), **ASTM E783** (air
leakage through *installed exterior windows and doors*), **ASTM E1186** (air
leakage site detection in *building envelopes and air barrier systems*), and
AAMA 501.2. This split is the whole BECx answer and it is in the standards
themselves — see Part D.

---

## Part C — the ruling table

**Recommendation column:** `MINT NOW` = plausibly appears on Ontario ICI work —
Isotherm's actual project world. `LEARN` = leave to the picker's propose flow; if
it ever arrives, one click queues it, which is exactly what that flow is for.

Alias discipline per row is the shipped one: **exact match only, no tag-prefix
collisions, RP/CT-class exclusions reasoned.**

### C.1 Mechanical — air side

| Key | Display name | Aliases | Rec | Notes |
|---|---|---|---|---|
| `rtu` | Rooftop Unit | *(none needed — see †)* | **MINT NOW** | Ubiquitous on Ontario ICI. Distinct from AHU: packaged, with condensing and gas-fired heating sections an AHU does not carry. |
| `mau` | Make-Up Air Unit | MAU, MUA | **MINT NOW** | Kitchens, shops, labs. Both spellings are in live use. |
| `hrv` | Heat Recovery Ventilator | *(none needed — †)* | **MINT NOW** | Sensible-only where ERV is enthalpy. Genuinely distinct equipment. |
| `vrf` | VRF System (Outdoor Unit) | *(none needed — †)* | **MINT NOW** | Display name carries "Outdoor Unit" deliberately: the indoor units are `fcu` and must not be swept into this key. |
| `dehumidifier` | Dehumidifier | *(none — see collisions)* | **MINT NOW** | Pool halls and arenas. Community and rec centres are squarely Isotherm's world. |
| `duct_heater` | Duct Heater | *(none)* | **MINT NOW** | Electric reheat in schools and offices; scheduled with marks. |
| `fire_smoke_damper` | Fire Smoke Damper | FSD | **MINT NOW** | *Judgement call, flagged.* Integrated life-safety verification needs a per-damper record, and dampers carry schedule marks. The cost: hundreds of rows on a large building. Rule it either way — it is the one mechanical row where I am not confident. |
| `crac` | Computer Room Air Conditioner | CRAC, CRAH | LEARN | Only on data-centre work. `data_center` exists as a discipline label, but no live project carries one. |
| `air_curtain` | Air Curtain | *(none)* | LEARN | Entrance/dock equipment; commissioned rarely. |
| `sound_attenuator` | Sound Attenuator | *(none)* | LEARN | Verified as installed, not performance-tested as a unit. |
| `cav` | CAV Box | *(none)* | LEARN | **Previously ruled null** (VAV mint sitting, 2026-07). Reaffirming rather than reopening. |
| `fan_powered_box` | Fan Powered Box | FPB | LEARN | Rare in this market relative to VAV. |

† **RTU, HRV and VRF need no aliases, and this is the elegant part of the
ruling.** They sit on the never-alias list from tonight because they are distinct
equipment, not shorthand. Minted as *types*, the picker resolves them through
**tier 1 — exact key match** — so typing `RTU` finds Rooftop Unit without an
alias row existing. **The block list stays untouched exactly as ruled, and the
words still work.**

### C.2 Mechanical — hydronic plant

| Key | Display name | Aliases | Rec | Notes |
|---|---|---|---|---|
| `heat_exchanger` | Heat Exchanger | HX | **MINT NOW** | **7 untyped units in the register today.** HX is two characters but has no competing meaning in this domain. |
| `air_separator` | Air Separator | *(none)* | **MINT NOW** | Paired with expansion tanks in every hydronic plant; the CSA seeding campaign already treated them as a bank. |
| `sump_pump` | Sump Pump | *(none)* | **MINT NOW** | See collision §C.6 — this is a Law 8 case. |
| `glycol_feeder` | Glycol Feeder | *(none)* | LEARN | Usually verified as part of the plant. |
| `booster_pump` | Domestic Water Booster Pump | *(none)* | LEARN | **Deliberately not minted.** It is a pump with a duty, and fragmenting the `pump` family (53 units, 36 field defs, 5 projects) buys nothing a descriptor does not. |
| `prv_station` | PRV Station | *(none)* | LEARN | High-rise plumbing; thin in this market. |

### C.3 Plumbing / process

| Key | Display name | Aliases | Rec | Notes |
|---|---|---|---|---|
| `dhw_heater` | Domestic Hot Water Heater | DHW | **MINT NOW** | 2 untyped in the register. `WH` deliberately excluded — two characters, collides with tag prefixes. |
| `water_softener` | Water Softener | *(none)* | **MINT NOW** | **Closes the open queue item** from the type-assignment sweep. |
| `backflow_preventer` | Backflow Preventer | BFP | **MINT NOW** | Annual certification is mandatory in Ontario; the record has to live somewhere. |
| `air_compressor` | Air Compressor | *(none — see collisions)* | **MINT NOW** | Labs, shops, dental, med-air plants. |
| `med_gas_system` | Medical Gas System | *(none)* | LEARN → **ask** | CSA Z7396.1 work is its own discipline. Mint only if health-care projects are actually coming; you know and I do not. |
| `grease_interceptor` | Grease Interceptor | *(none)* | LEARN | Plumbing inspection, not commissioning. |
| `water_meter` | Water Meter | *(none)* | LEARN | Usually a BAS point, not a commissioned unit. |
| `sewage_ejector` | Sewage Ejector | *(none)* | LEARN | Rare; `sump_pump` covers the common case. |

### C.4 Electrical — every row maps to a NETA equipment class

| Key | Display name | Aliases | Rec | Notes |
|---|---|---|---|---|
| `transformer` | Transformer | XFMR | **MINT NOW** | **18 untyped units today — the largest single gap in the register.** NETA: dry-type and liquid-filled. `TX` excluded: two characters, tag-prefix collision. |
| `switchgear` | Switchgear | SWGR | **MINT NOW** | NETA switchgear assemblies. |
| `switchboard` | Switchboard | SWBD | **MINT NOW** | NETA switchboard assemblies; 2 untyped today. |
| `mcc` | Motor Control Centre | MCC | **MINT NOW** | Plant rooms on every institutional job. |
| `lighting_panel` | Lighting Panel | *(none — see collisions)* | **MINT NOW** | **7 untyped today, and a live Law 8 collision — §C.6.** |
| `vfd` | Variable Frequency Drive | VFD | **MINT NOW** | *Boundary stated:* a VFD is a standalone type **only where it is scheduled separately**. The `pump` VFD yes/no field shipped in 1.01 stays exactly as it is — it answers "does this pump have one", which is a different question from "is this drive a commissioned unit". |
| `ups` | Uninterruptible Power Supply | UPS | **MINT NOW** | Data rooms, life-safety, labs. |
| `motor_starter` | Motor Starter | *(none)* | LEARN | Almost always inside an MCC. |
| `disconnect` | Disconnect Switch | *(none)* | LEARN | Too granular to carry a nameplate record. |
| `power_meter` | Power Meter | *(none)* | LEARN | Metering usually arrives as BAS points. |
| `battery_inverter` | Battery / Inverter | *(none)* | LEARN | Folds into `ups` or a PV system. |
| `emergency_lighting` | Emergency Lighting Unit | *(none)* | LEARN | Unit-equipment batteries are verified in bulk, not per unit. |

### C.5 Fire protection

| Key | Display name | Aliases | Rec | Notes |
|---|---|---|---|---|
| `fire_pump` | Fire Pump | *(none — see collisions)* | **MINT NOW** | Annual flow test; the record matters. **Law 8 collision — §C.6.** |
| `jockey_pump` | Jockey Pump | *(none)* | **MINT NOW** | Same family, same collision. |
| `fire_alarm_panel` | Fire Alarm Panel | FACP | **MINT NOW** | Integrated life-safety testing hangs off it. |
| `sprinkler_system` | — | — | **NOT A TYPE** | Sprinkler and standpipe are *systems*, and the Cx Index **already models that**: `equipment.kind` is `equipment \| system`. They belong as `kind='system'` rows, not as equipment types. Minting them would put the same thing in two places. |

### C.6 Law 8 — every vocabulary collision, flagged

The matcher is all-words, most-specific-wins. A one-token vocabulary term
therefore captures any descriptor containing that token, unless a
more-specific term exists. These are the cases:

| Descriptor in the wild | Resolves today | Should resolve to | Mechanism |
|---|---|---|---|
| `FIRE PUMP` | **`pump`** ✗ | `fire_pump` | "Fire Pump" is 2 tokens and beats "Pump" at 1. **This exact miss is already in ARCHITECTURE's evidence:** *"Fire Pump Disconnect/ATS typed `pump`"*. Minting fixes a recorded defect. |
| `JOCKEY PUMP` | **`pump`** ✗ | `jockey_pump` | Same. |
| `SUMP PUMP` | **`pump`** ✗ | `sump_pump` | Same. |
| `LIGHTING PANEL` | **`panel`** ✗ | `lighting_panel` | `panel`'s display name is "Panel (Electrical Distribution)"; the matcher **drops the parenthetical**, so its core is the single token "panel". 7 real units are mis-resolvable today. |
| `DISTRIBUTION PANEL` | `panel` ✓ | `panel` | **Correct already** — a distribution panel *is* what `panel` means. Recommend adding **"Distribution Panel" as an exact alias** rather than minting a competing type. |
| `AIR COMPRESSOR` | — | `air_compressor` | No collision, but **`AC` must never be an alias**: it is air conditioning to every other trade on the drawing set. RP-class exclusion. |
| `DEHUMIDIFIER` | — | `dehumidifier` | **`DH` must never be an alias** — two characters, tag-prefix collision. |
| `HEAT EXCHANGER` | — | `heat_exchanger` | No collision. `HX` is safe: two characters but no competing meaning in this domain. |
| `VRF` indoor units | — | `fcu` | The display name says "Outdoor Unit" so the indoor fan coils stay `fcu`. Stated, not assumed. |

**One structural consequence worth ruling on explicitly:** minting `fire_pump`,
`jockey_pump` and `sump_pump` changes how *existing* descriptors resolve. The 53
units currently typed `pump` should be re-checked against the new vocabulary — a
retroactive sweep like the one that retyped 118 units, not a silent
re-interpretation. **Proposed as a Phase 2 step, with a before/after census.**

---

## Part D — BECx, handled honestly

**The standards draw the line themselves, and it is not the line the equipment
table draws.**

- **ASTM E1105** tests *installed exterior windows, skylights, doors and curtain
  walls* — discrete, installed, individually addressable.
- **ASTM E783** tests *installed exterior windows and doors* — same.
- **ASTM E1186** detects air leakage in *building envelopes and air barrier
  systems* — continuous, and its unit of verification is a **test location**, not
  a tag.
- ASHRAE's own definition of a continuous air barrier is *"the combination of
  interconnected materials, assemblies, and sealed joints and components"* —
  which is a description of something that cannot be a row.
- **CSA Z320 lists architectural as its own system class**, beside mechanical and
  electrical rather than inside them.

**Proposed: exactly one envelope type is minted, and it is the one that already
appears on mechanical schedules.**

| Candidate | Rec | Reasoning |
|---|---|---|
| `louver` | **MINT NOW** | Louvers are scheduled with marks on the *mechanical* drawings, sized for airflow, and already appeared on the earlier marginal-keys list. This is the mechanical/architectural overlap, and it is a unit. |
| `overhead_door` | LEARN | Carries a mark and is testable, but is rarely in a Cx scope here. |
| Windows · Curtain wall · Glazed doors | **WAIT** | They carry schedule marks, and E1105/E783 test them individually — so they are *not* assemblies. But BECx tests a **sample** of openings, not every one, and the record wanted is "test location 3 of 8 passed", which an equipment register cannot express. They need the assemblies model, not an equipment row. |
| Air barrier · Roofing membrane · Sealant joints · Insulation | **NEVER an equipment type** | Continuous by definition. Forcing them into rows would produce one row per building and a nameplate table with nothing in it. |

**Recommendation: do not force assemblies into equipment rows, and do not mint
fenestration yet.** The honest version of BECx is a second register keyed by
*test location and assembly*, which is a design question, not a vocabulary one.
Envelope BECx is already dormant in the deliverable model (MASTER-BRIEF), so
nothing is blocked by waiting. **Proposed for BACKBURNER as its own entry: "BECx
assemblies model — a register of assemblies and test locations, not equipment."**

---

## Part E — the boundary this campaign will not cross

**Applicability rules are not seeded speculatively.** A newly minted type gets
its `__base` identity set and, on ratification, a drafted nameplate table —
nothing else. The classifier proposes applicability **only when a project first
carries real units of that type**.

The reason is the campaign's own logic turned on itself: a catalog is a claim
about what *might* appear, and an applicability rule is a claim about what a
*specific project* must verify. Seeding the second from the first would put 26
types' worth of speculative rules in front of a CxA who has never seen most of
them — and an unread ratification queue is worse than an empty one.

**Recorded as the campaign's deliberate boundary, not an oversight.**

---

## Part F — what Phase 2 does, on the ruling

1. **One migration, batch-tagged:** mint the ruled set base-only (`__base`
   identity fields, no type table), seed the ruled aliases, add "Distribution
   Panel" as an alias of `panel`. The never-alias trigger and its list are
   **untouched** — RTU/HRV/VRF need no alias rows.
2. **Retroactive re-check** of the 53 `pump` units and 26 `panel` units against
   the new vocabulary, with a before/after census. Owner-ruled, not silent.
3. **Drafter in batches of ~10** — field-set tables in the campaign format,
   delivered for ratification in humane groups.
4. **Phase 3** — usage-weighted ranking in the picker, with the render-and-look
   proof: typing "pump" on a real project surfaces Pump first, not ten exotic
   siblings.

---

## Sources

- [CSA Z320 — Building commissioning (CSA Group)](https://www.csagroup.org/store/product/Z320-11/) · [scope summary, SCC](https://scc-ccn.ca/standards/notices-of-intent/csa-group/building-commissioning-standard-check-sheets)
- [ANSI/NETA ATS-2025 — Acceptance Testing Specifications for Electrical Power Equipment](https://blog.ansi.org/ansi/ansi-neta-ats-2025-electrical-power-testing/) · [standard listing](https://standards.globalspec.com/std/13275244/NETA%20ATS)
- [ASHRAE Guideline 0 — The Commissioning Process](https://webstore.ansi.org/standards/ashrae/ASHRAEGuideline2013) · [overview](https://cxplanner.com/commissioning-101/ashrae-guideline-0)
- [NIBS Guideline 3 — Building Enclosure Commissioning Process](https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/NIBS/nibs_gl3.pdf)
- [ASTM E2813 / E2947 BECx framework and field test methods](https://store.astm.org/astm-tpt-963.html) · [field testing scope](https://technicalassurance.com/knowledge-center/building-enclosure-performance-testing/)
- [OmniClass Table 23 — Products (NIBS/NBIMS-US V3)](https://nibs.org/wp-content/uploads/2025/04/NBIMS-US_V3_2.4.4.6_Omniclass_Table_23_Products.pdf)
- [UFGS 01 91 19 — Building Enclosure Commissioning](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2001%2091%2019.pdf)
