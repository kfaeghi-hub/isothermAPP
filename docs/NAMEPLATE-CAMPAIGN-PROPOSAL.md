# Nameplate Completion Campaign — PROPOSAL

**Status: PROPOSED 2026-08-02. Nothing seeded. Awaiting ruling.**

Step 1 (inventory) and Step 2 (per-type proposals) below. Step 3 seeds only on
your ruling.

---

## 0 · The finding that reframes the campaign

The brief describes this as "every equipment type gets a proper field-def set."
The inventory says that is **not where the reported pain is coming from**, and
seeding fifteen tables would not have fixed it.

**Most of the named gaps already exist.** Checked field by field against the live
defs rather than taken at face value:

| Reported as missing | Actually present today | Genuinely missing |
|---|---|---|
| boiler + manufacturer / model / fluid / power V-Ph-Hz | Manufacturer, Model Number, Voltage, Phase, Hz **all present** | **fluid type** only |
| pump + manufacturer / model / VFD | Manufacturer, Model Number **present** (shop + installed) | **VFD** only |
| fan + phase / frequency / amps / manufacturer / model / MBH | Phase, Hz, FLA, Manufacturer, Model Number **all present** | **MBH** only |

So why did three users independently report them as missing?

**461 of 834 equipment rows — 55% — have no `equipment_type` at all**, and an
untyped unit gets no field defs whatsoever. `ensureFieldDefs` returns early when
the type is null, so the nameplate renders with nothing in it. On the two live
retrofit projects the field users are actually working, it is nearly everything:

| Project | Equipment | Untyped |
|---|---|---|
| Clairlea PS Steam to HW Conversion | 99 | **92 (93%)** |
| Alexander Muir JSPS Steam to HW + AHU | 89 | **57 (64%)** |
| Seneca Health and Wellness Centre | 367 | 98 (27%) |

Both Steam-to-HW projects are exactly where boilers, pumps, fans and unit heaters
live. A CxA opening a boiler on Clairlea sees an empty nameplate — not because
`boiler` lacks defs (it has 31 across 19 rows), but because **that unit is not a
boiler as far as the system is concerned.**

**Consequence for the ruling: the universal base fields are not a nice-to-have
riding along. They are the primary fix for what was reported**, and the per-type
tables below are the secondary one. If only one thing is built from this
proposal, it should be §1.

---

## 1 · Universal base fields — the mechanism (RECOMMENDED FIRST)

Every unit records identity, **including untyped ones**, so unknown equipment
still captures who made it and what it is.

| Field | Unit | spec | shop | installed |
|---|---|---|---|---|
| Manufacturer | — | — | ✓ | ✓ |
| Model Number | — | — | ✓ | ✓ |
| Serial Number | — | — | — | ✓ |

Three rows. Deliberately minimal: this is the floor beneath every type, not a
type of its own.

**Why those applicabilities.** A *specification* does not name a manufacturer —
it states performance and lets the market answer. The shop drawing proposes a
make and model; the nameplate confirms them and adds the serial, which exists
only on the physical unit. Putting Manufacturer in the spec column would invite
someone to record a design intent that the design never expressed.

**Three ways to build it — I recommend (c):**

| | Approach | Cost | Objection |
|---|---|---|---|
| a | Seed the 3 rows into every type's def set | trivial | Duplicates 45 rows; still gives an **untyped** unit nothing, which is the actual problem |
| b | Render them in the UI as hardcoded rows above the defs | cheap | Invisible to the field-structure editor, so a project cannot reorder or drop them; a second source of truth for what a nameplate is |
| c | **A `__base` def set the resolver always prepends** | small | One row set, applies to typed and untyped alike, editable per project like any other def |

Under (c), `ensureFieldDefs` seeds `__base` when a unit has no type **or**
prepends it to the type's set, and the field-structure editor shows it as an
ordinary group a project may customise. Nothing about the existing per-type sets
changes.

---

## 2 · Types with ZERO defs — fallback-only today

| Type | Units | Status |
|---|---|---|
| `panel` | 26 | zero defs |
| `humidifier` | 8 | zero defs |
| `radiant_panel` | 2 | zero defs |
| `unit_heater` | — | **to mint this pass** (Adam) |

### 2.1 `panel` — Panel (Electrical Distribution) · 26 units

| Field | Unit | spec | shop | installed |
|---|---|---|---|---|
| Manufacturer | — | — | ✓ | ✓ |
| Model / Type | — | — | ✓ | ✓ |
| Serial Number | — | — | — | ✓ |
| Voltage | V | ✓ | ✓ | ✓ |
| Phase | Ø | ✓ | ✓ | ✓ |
| Main Bus Rating | A | ✓ | ✓ | ✓ |
| Main Breaker / MLO | A | ✓ | ✓ | ✓ |
| AIC Rating | kA | ✓ | ✓ | ✓ |
| Circuit Spaces | # | ✓ | ✓ | ✓ |
| Fed From | — | ✓ | ✓ | ✓ |
| Enclosure Type | NEMA | ✓ | ✓ | ✓ |

11 rows. `Fed From` earns its place on a commissioning register specifically:
verifying a panel means tracing its source, and it is the one field a CxA cannot
recover from the nameplate alone.

### 2.2 `humidifier` — 8 units

| Field | Unit | spec | shop | installed |
|---|---|---|---|---|
| Manufacturer | — | — | ✓ | ✓ |
| Model Number | — | — | ✓ | ✓ |
| Serial Number | — | — | — | ✓ |
| Type (steam / evaporative) | — | ✓ | ✓ | ✓ |
| Capacity | kg/h | ✓ | ✓ | ✓ |
| Voltage | V | ✓ | ✓ | ✓ |
| Phase | Ø | ✓ | ✓ | ✓ |
| Hz | Hz | ✓ | ✓ | ✓ |
| FLA | A | ✓ | ✓ | ✓ |
| Power Input | kW | ✓ | ✓ | ✓ |
| Control Signal | — | ✓ | ✓ | ✓ |

11 rows.

### 2.3 `radiant_panel` — 2 units

| Field | Unit | spec | shop | installed |
|---|---|---|---|---|
| Manufacturer | — | — | ✓ | ✓ |
| Model Number | — | — | ✓ | ✓ |
| Serial Number | — | — | — | ✓ |
| Panel Length | mm | ✓ | ✓ | ✓ |
| Output | W/m | ✓ | ✓ | ✓ |
| Supply Temp | °C | ✓ | ✓ | ✓ |
| Return Temp | °C | ✓ | ✓ | ✓ |
| Flow | L/s | ✓ | ✓ | ✓ |
| Connection Size | NPS | ✓ | ✓ | ✓ |

9 rows. **I would argue for fewer here, not more** — a hydronic radiant panel is
a passive emitter with no motor, no controls of its own and no serial plate on
many products. Nine is already generous; do not let it grow to match the others.

### 2.4 `unit_heater` — to mint

| Field | Unit | spec | shop | installed |
|---|---|---|---|---|
| Manufacturer | — | — | ✓ | ✓ |
| Model Number | — | — | ✓ | ✓ |
| Serial Number | — | — | — | ✓ |
| Heating Capacity | MBH | ✓ | ✓ | ✓ |
| Airflow | CFM | ✓ | ✓ | ✓ |
| Entering Air Temp | °C | ✓ | ✓ | ✓ |
| Leaving Air Temp | °C | ✓ | ✓ | ✓ |
| Voltage | V | ✓ | ✓ | ✓ |
| Phase | Ø | ✓ | ✓ | ✓ |
| Hz | Hz | ✓ | ✓ | ✓ |
| Motor kW / HP | kW | ✓ | ✓ | ✓ |
| FLA | A | ✓ | ✓ | ✓ |

12 rows. Matches Adam's ask (MNF / model / voltage / phase / MBH) and adds the
airflow and air-temp pair a CxA needs to verify capacity on site rather than take
it from the schedule.

---

## 3 · The three genuine gaps on existing types

Small, surgical additions — not rebuilds.

| Type | Add | Unit | spec | shop | installed | Why |
|---|---|---|---|---|---|---|
| `boiler` | Fluid Type | — | ✓ | ✓ | ✓ | Water / steam / glycol changes the entire test procedure and is not derivable from the other fields |
| `pump` | VFD | yes/no | ✓ | ✓ | ✓ | Whether a pump is driven determines whether there is a drive to commission at all |
| `fan` | Heating Capacity | MBH | ✓ | ✓ | ✓ | Only where the fan carries a heating coil; blank elsewhere |

---

## 4 · Types already in range — NO CHANGE PROPOSED

| Type | Rendered rows | Units | Verdict |
|---|---|---|---|
| `ats` | 10 | 7 | In range. Thin-looking by row count, but an ATS genuinely has few verifiable numbers. |
| `fan` | 12 | 15 | +1 (§3) |
| `cooling_tower` | 13 | 2 | fine |
| `vav` | 14 | 81 | fine |
| `fcu` | 14 | 122 | fine |
| `erv` | 15 | 4 | fine |
| `chiller` | 15 | 3 | fine |
| `generator` | 16 | 3 | at the top of the zone |
| `ahu` | 16 | 32 | at the top of the zone |
| `boiler` | 19 | 11 | +1 (§3); **already above the zone** |
| `pump` | 19 | 53 | +1 (§3); **already above the zone** |
| `heat_pump` | **25** | 4 | **over — I would argue for trimming** |

**`heat_pump` at 25 rendered rows is the "40-row nameplate" case in miniature**:
four units in the whole system, the largest def set of any type, and nobody has
ever filled it in. I would rather trim it to ~14 than seed three more types at
its size. Not doing that unasked — flagging it for your call.

---

## 5 · Seeding rules (Step 3, on ruling)

- Admin-editable rows, as always — these are starting points usage will trim.
- **Existing project field-structures untouched.** Project-level customisation
  stays sovereign; new defs apply to new usage, and no in-flight nameplate is
  retroactively rewritten.
- `org_id` per MASTER-BRIEF rule 17.
- This document records the per-type tables as the seeded baseline.
- **Units seeded at current convention** (metric, matching the existing sets) and
  the fields this affects are listed in §6 of the units proposal, so seeding does
  not pre-empt that ruling.

---

## 6 · What I need ruled

1. **§1 universal base — approach (c), and build it first?** It is the actual fix
   for what the field users reported.
2. **§2 four type tables** — as drafted, or amended.
3. **§3 three additions** — as drafted.
4. **`heat_pump`** — trim to ~14 rows, or leave at 25?
5. **`unit_heater`** — mint in this pass, confirmed.

---

# ADDENDUM — `heat_pump` trim, cut list for ruling (2026-08-02)

**Nothing applied.** Ruled: "propose the trim to ~14 — show me the cut list
before applying."

## Today: 25 rendered rows, 42 defs, 4 units in the whole system

```
Connected kW · Connection Size · Cooling Capacity · Cooling EER · EWT Cooling ·
EWT Heating · FLA · Heating Capacity · Heating COP · Hz · LRA · Manufacturer ·
MCA · MOCP · Model Number · Phase · Refrigerant Charge · Refrigerant Type ·
RLA · Serial Number · Sound Rating · Supply CFM · Supply ESP · Voltage · Water Flow
```

## KEEP — 14 rows

| Field | Unit | Why it stays |
|---|---|---|
| Manufacturer | — | identity (now from `__base`) |
| Model Number | — | identity (now from `__base`) |
| Serial Number | — | identity (now from `__base`) |
| Heating Capacity | kW | the unit's reason for existing |
| Cooling Capacity | kW | as above |
| Heating COP | — | the efficiency actually verified against design |
| Cooling EER | — | as above |
| EWT Heating | °C | a water-source heat pump is meaningless without entering water temp |
| EWT Cooling | °C | as above |
| Water Flow | L/s | commissioned by balancing; a number the CxA reads on site |
| Supply CFM | CFM | air side, balanced and witnessed |
| Voltage | V | electrical identity |
| Phase | Ø | electrical identity |
| MCA | A | the number that sizes the circuit — the one a CxA checks against the panel |

## CUT — 11 rows

| Field | Why it goes |
|---|---|
| Hz | Constant at 60 across every unit this firm will ever commission in Ontario. A field whose value is never in doubt is a row of noise on every nameplate. |
| FLA | Superseded by MCA/RLA for a compressor-bearing unit; three current fields for one machine is two too many. |
| LRA | Startup inrush. Real, and a manufacturer datum nobody verifies on a commissioning walk. |
| RLA | Same family as MCA; keeping MCA is enough to size and check the circuit. |
| MOCP | Paired with MCA on the plate, but it is the *maximum permitted* device — a design constraint, not a measurement. |
| Connected kW | Derivable from V × A; a second way to say the same thing invites the two to disagree. |
| Refrigerant Type | Belongs on the equipment record, not the commissioning nameplate — it does not change between spec, shop and installed. |
| Refrigerant Charge | A service datum. Nobody weighs the charge during commissioning. |
| Sound Rating | A selection criterion, checked at submittal review, never at the unit. |
| Supply ESP | Fan-side static; verified on the AHU/fan serving it, not duplicated here. |
| Connection Size | Read off the pipe when connecting; not a verification. |

**Result: 25 → 14 rows**, and three of the fourteen now arrive from `__base`
rather than being restated, so the type's own set carries eleven.

**Argument for the cut, stated plainly:** four units exist and the set has never
been filled in. A 25-row nameplate is not more rigorous than a 14-row one — it is
a form people abandon. Every cut field above is either constant (Hz), derivable
(Connected kW), a duplicate of a kept field (RLA/FLA vs MCA), or a datum verified
somewhere other than at the unit (Sound Rating, Supply ESP, Refrigerant Charge).

**Not applied. Project field-structures untouched either way** — a trim to the
firm set changes what NEW usage seeds, never an in-flight nameplate.
