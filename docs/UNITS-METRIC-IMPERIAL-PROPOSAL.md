# Metric vs Imperial Units — PROPOSAL

**Status: PROPOSED 2026-08-02. No code. Awaiting ruling.**

Two field users hit this independently, which is what makes it a design question
rather than a preference.

---

## The problem, stated precisely

The drawings are imperial. The def sets are metric. A CxA reading "225 GPM" off a
pump schedule types `225` into a field labelled **L/s**.

The number is not wrong on the page — it is wrong *in the database*, and nothing
ever says so. It renders as "225 L/s" in the nameplate, prints as "225 L/s" in an
issued report, and the moment anything computes with it — a delta, a percentage
of design, a sum — the answer is silently off by 15.85×.

**This is the silent-success class again, in the data layer.** The field accepted
the input, the form saved, the document generated. Nothing failed.

### Which fields are exposed today

Every unit string currently in the def sets:

| Unit | Fields using it | Imperial counterpart |
|---|---|---|
| `L/s` | pump Flow, radiant Flow, (proposed) | GPM · CFM for air |
| `kPa` | pump Head, boiler pressures | ft head · PSI |
| `kW` | motor sizing, power input | HP · BTU/h |
| `°C` | every temperature | °F |
| `mm` | impeller, panel length | in |
| `kg/h` | humidifier capacity | lb/h |
| **`CFM`** | fan Airflow, VAV | **already imperial** |
| **`MBH`** | boiler/fan/unit-heater capacity | **already imperial** |
| **`NPS`** | connection sizes | **already imperial** |
| `A` `V` `Ø` `Hz` `%` `RPM` `kA` | electrical | no counterpart — unambiguous |

**Note the third column.** The def sets are *already mixed*: CFM, MBH and NPS are
imperial and sit beside L/s and kPa. Nobody chose that; it accreted. So "the defs
default metric" is not quite true, and any option below has to cope with a
starting state that is inconsistent with itself.

---

## Option A — per-field unit picker in the project field-structure editor

The editor already lets a project rename, reorder and add fields. Add a unit
control to each row, choosing from a list of valid alternates for that quantity.

**Build:** small. One column in `project_equipment_field_defs` (`unit` already
exists — this is a UI affordance over a column that is already there), a picker,
and a per-quantity alternates map so `L/s` offers `GPM` and not `°F`.

| | |
|---|---|
| **Existing data** | Untouched. A project that switches `L/s` → `GPM` changes the LABEL, not the stored numbers. **Every value already entered becomes wrong**, silently, unless someone converts them by hand. |
| **Generated documents** | Print whatever the def says. Correct after the switch, wrong for anything entered before it. |
| **Cost** | ~half a day. |
| **The catch** | It fixes the *next* project and quietly corrupts the current one. Needs a guard: refuse the switch, or offer to convert, when values already exist for that field. |

## Option B — dual display with auto-conversion

Store canonical (say SI), enter in either, display both: `225 GPM (14.2 L/s)`.

**Build:** substantial. A quantity/dimension model (every unit belongs to a
quantity with a conversion to canonical), a numeric input that accepts a unit
suffix, and **every nameplate render plus every document generator** changes —
the report, checklist and minutes generators all print nameplate values.

| | |
|---|---|
| **Existing data** | The hard part. Existing numbers have no recorded unit *of entry* — only the def's label at the time. Adopting canonical storage means asserting that everything currently stored is already in the def's unit, which is precisely the assumption this proposal exists because it is false. Any migration is a guess. |
| **Generated documents** | Every issued document changes format. Documents already issued are point-in-time files and correctly keep their old rendering — but a re-generation of an old report would now differ from the issued one, which the document-identity work says must not happen casually. |
| **Cost** | Several days, and it touches the generators — the highest-consequence code in the system. |
| **The catch** | It is the *right* long-term model and the worst thing to retrofit onto data whose units were never recorded. |

## Option C — per-project unit system preference

One setting on the project: Imperial or Metric. Def seeding picks the matching
unit strings; the field-structure editor still allows per-field override.

**Build:** small-to-moderate. A `unit_system` column on `projects`, imperial
counterparts stored alongside each firm def, and seeding chooses.

| | |
|---|---|
| **Existing data** | Untouched, and **not retroactive** — the preference applies at seeding time, so in-flight nameplates keep their labels and their numbers stay meaningful. This is the same sovereignty rule the nameplate campaign uses. |
| **Generated documents** | Consistent within a project, which is what a client reads. No cross-project comparison changes, because none exists today. |
| **Cost** | ~a day, most of it authoring the imperial counterpart for each firm def. |
| **The catch** | Does not help the 92 already-untyped Clairlea units or anything already entered. And it makes the firm def sets carry two unit strings, which is one more thing to keep true. |

---

## Recommendation

**C, then A as the escape hatch; not B yet.**

- **C** matches how the work actually runs: a project is imperial or it is not,
  decided once at setup by whoever knows the drawing set. It fixes the problem at
  the moment of least cost — before any data exists — and it is not retroactive,
  so it cannot corrupt anything in flight.
- **A** covers the exception C cannot: one field on one project that disagrees
  with the project's system. Cheap, and only meaningful *with* the guard —
  **refuse a unit change on a field that already holds values**, offering
  conversion as a deliberate act with a count of what it will touch.
- **B is the correct destination and the wrong next step.** Retrofitting
  canonical storage requires knowing the unit each existing number was entered
  in, which is exactly the fact that was never recorded. Doing B later, on data
  born under C, is a far smaller job than doing it now on data born under
  neither.

**Whatever is ruled, one thing is worth doing immediately and independently:**
the unit belongs *beside the input*, not only in the column header. A CxA typing
into a cell should see `L/s` in the field, not two rows up. That is a rendering
change, costs nothing, prevents the specific mistake that was reported, and does
not pre-empt any option above.

---

## What I need ruled

1. **C, A, B, or a combination** — and if C, whether A ships with it.
2. **The guard on A**: refuse-with-explanation, or offer-conversion-with-a-count?
3. **The already-mixed state** (CFM/MBH/NPS beside L/s/kPa): normalise the firm
   defs to one system as part of this, or leave the historical mix and let the
   project preference sort it going forward?
4. The unit-beside-the-input change — take it now, separately?
