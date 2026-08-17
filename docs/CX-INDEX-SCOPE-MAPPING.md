# Cx Index scope mapping — RULED AND SEEDED 2026-08-17

**Status: the red pen came back same-day; seeded and backfilled.** Confirmed
as proposed with **one change: Group 1 #7 (Elec. Panel Schedules / Single
Line) stays `unit`** — a panel schedule is a per-panel artifact reviewed per
panel; applicability keeps the column off non-electrical rows. **Final: 12 of
88 go `type`** (the table below shows the proposal; #7's row is overridden by
this ruling). All flags confirmed as proposed, including the loop-report
columns staying `unit` and the Group 10/12 deferral — the project-scope
question is banked as a named future ruling in
[CX-INDEX-EXPORT-PROPOSAL.md §4.5](CX-INDEX-EXPORT-PROPOSAL.md).

**The backfill was ruled at the pause and executed as its own reviewed
write**: confirmed scopes flowed to all live projects' `project_cx_columns`
(6 projects × 12 columns; ZZ-% excluded; batch record with dry-run numbers:
[migrations/cx-scope-seed-and-backfill.sql](../migrations/cx-scope-seed-and-backfill.sql)).
Scope changes denominators, never storage — zero facts moved; on-screen
percentages on live projects shift where document columns now count types,
which is the point. Any project may re-edit its own scopes afterward; §4.3
stays true.

The semantics being assigned (proposal §4, ruled Q4/Q6):

- **unit** — work per machine. `% = done units / applicable units`. Today's
  math, unchanged.
- **type** — work per submittal, i.e. per equipment type in the project.
  `% = types complete / types in scope`; a type is **complete when every
  applicable unit is done**; partial families count in the denominator only;
  the UI says **"K of N types"**. Storage stays per-unit; the bulk gesture
  ("mark all ⟨type⟩ — N units") is the one-act recording tool.

**Proposed: 13 of 88 go `type`** — the whole Doc Review Stage plus two
Turnover document classes. Every field-verification, test, and functional
column stays `unit`. Judgment calls are flagged **⚑** with the doubt stated —
those are the rows most worth the red pen.

## Group 1 · Doc Review Stage — all 11 → `type`

| # | Column | Proposed | Note |
|---|---|---|---|
| 1 | IFC Drawings / Specifications | **type** ⚑ | Reviewed as discipline sets covering equipment classes. Seneca recorded this as one bulk act across 367 rows — closer to *project*-scoped than type-scoped, but `type` is the honest two-value fit. ⚑ if the owner would rather keep it `unit` because the bulk gesture already makes the recording cheap. |
| 2 | Shop Dwgs | **type** | The founding example — "30 FCUs, one shop drawing." Seneca: 3/117 FCUs marked (the TFCU family), fleet unrecorded. |
| 3 | Equipment Submittals | **type** | One submittal package per type. |
| 4 | Controls Submittals (BAS) | **type** | Per controlled equipment class. |
| 5 | Sequence of Operation (SOO) | **type** | SOOs are written per system/equipment class, not per unit. |
| 6 | Control Wiring Diagrams / Schematics | **type** | Per equipment class. |
| 7 | Elec. Panel Schedules / Single Line | **type** ⚑ | Panel schedules are arguably per-panel (per-unit for the `panel` type); the single-line is project-wide. ⚑ if the owner wants this `unit`. |
| 8 | O&M Manuals - Preliminary (ToC) | **type** | O&Ms come per type/model. |
| 9 | TAB Plan / TAB Pre-Req | **type** ⚑ | One TAB plan per project — degenerate type-scope (most types covered by one document). Still better than 367 unit-claims. |
| 10 | Short Circuit / Coordination Study | **type** ⚑ | One study per project; same degenerate shape as the TAB plan. |
| 11 | Startup Plan | **type** | Startup plans arrive per equipment class. |

## Group 2 · Mechanical Static Verification — all 8 stay `unit`

| # | Column | Proposed | Note |
|---|---|---|---|
| 1 | Pressure Test Report (Hydronic/CHW/HW/Glycol) | unit ⚑ | The report covers a *loop*, not a type — loop ≠ type, so `type` would be the wrong aggregation. Field practice marks the units on the tested loop. |
| 2 | Duct Leakage Test | unit | Per duct section / served unit. |
| 3 | Hydronic Flushing & Cleaning Report | unit ⚑ | Same loop nuance as pressure testing. |
| 4 | Glycol Concentration Report | unit ⚑ | System-wide sample; recorded per affected unit. |
| 5 | Water Treatment Report | unit ⚑ | Same shape. |
| 6 | Insulation Complete / Verified | unit | Field verification per unit. |
| 7 | TAB Valves/Dampers Installed & Set | unit | Per device. |
| 8 | Fire Stopping Completed | unit | Per penetration/unit area. |

## Group 3 · Plumbing / Domestic — all 7 stay `unit`

Backflow certification is per device; flushing/disinfection reports carry the
loop nuance (⚑ on 5); everything else is field verification.

## Group 4 · Electrical Static - Physical Install — all 5 stay `unit`

Anchoring, labeling, conduit, panelboards, rough-in: per unit, no flags.

## Group 5 · Electrical Testing — all 14 stay `unit`

Megger, ductor, ground, torque, phase rotation, breaker settings, relay
settings, TTR, ATS static + timing, generator load bank, battery/engine start,
load bank, power quality: every one is a per-device test with a per-device
result. No flags.

## Group 6 · BAS Static Verification — all 6 stay `unit`

Panels, network, sensors, point database, I/O wiring, controller addressing:
per device/controller. No flags.

## Group 7 · Pre-FPT (Mech) — all 5 stay `unit`

Manufacturer start-up reports are per unit; rotations per unit; the TAB air and
water *balancing* columns record per-unit balancing results even though the
bound report is one document (the report is the evidence, the balancing is the
work — §4.4's split, applied to scope).

## Group 8 · FPT (Elec) — all 7 stay `unit`

Functional tests per unit, including the Life Safety / FA-interface columns
(the IST boundary ruling stands: the fire-integration column is the per-unit
readiness tracker, and its scope stays `unit` for the same reason).

## Group 9 · FPT (BAS/Mech) — all 5 stay `unit`

P2P, alarm/fault, SOO functional test, trend review, graphics: per unit.

## Group 10 · IST — all 7 stay `unit` ⚑ (an observation, not a proposal)

IST Plan Prepared, C&E Matrix, Trades Coordinated, Execution, Deficiencies,
Report Issued, AHJ Acceptance — these are **project milestones**, not per-unit
and not per-type work. A third scope (`project`) would fit them; it is
**deliberately not proposed** — the ruling adopted the two-value CHECK, the IST
tab is the real IST surface, and widening a just-ruled vocabulary in its seed
commit is exactly the drift the ruling process exists to prevent. Flagged so
the owner sees the shape; if a `project` scope is ever wanted it is its own
small ruling.

## Group 11 · Turnover — 2 of 8 → `type`

| # | Column | Proposed | Note |
|---|---|---|---|
| 1 | Start-Up Reports | unit | Collected per unit. |
| 2 | Permanent Power ON | unit ⚑ | Project milestone (the Group-10 observation applies). |
| 3 | O&Ms Final | **type** | O&M manuals arrive per type/model — the same class the 3o pool seeds as a category. |
| 4 | Training | unit ⚑ | Project milestone. |
| 5 | As-Builts | unit ⚑ | Project milestone. |
| 6 | Spare Parts / Consumables | **type** ⚑ | Spare-parts lists come per type/model; ⚑ because some firms record per-unit spares for major equipment. |
| 7 | Master Issue Log Sign-off | unit ⚑ | Project milestone. |
| 8 | Substantial Performance | unit ⚑ | Project milestone. |

## Group 12 · Post-Construction — all 5 stay `unit` ⚑

Cx Report Draft/Final, Seasonal Winter/Summer, Closeout Report: project
milestones, same observation as Group 10.

---

## What happens after the red pen

The seed commit (and nothing before it): writes the confirmed `type` values to
`cx_default_columns`; **does not** touch existing projects' `project_cx_columns`
(a live project's scopes are its own, per §4.3 — the owner may separately order
a backfill to named projects, which would be its own reviewed write); teaches
the client-side initializer to copy `scope` alongside `label`/`sort_order`; and
only then do the Phase 1 formulas land, reading whatever scope says.

*Seneca check the seed will be measured against (Phase 1 gate): with the
proposed mapping, Shop Dwgs reads "K of N types" — on today's register that is
1 of ~14 types substantially complete rather than 24% of units — and the number
finally matches what a CxA would say out loud.*
