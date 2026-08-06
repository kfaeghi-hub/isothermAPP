# Start-Up campaign — the record

## AS-BUILT — CLOSED 2026-08-06

**The fourth checklist family exists.** 113 templates across 67 of the register's
68 types, 3,123 items, every one convergence-classed and anchored.

| | |
|---|---|
| Phase 0 | document design approved on render review |
| Phase 1 | 81 masters mined · 1,545 items · UNEXPLAINED 0 |
| Placement | 678 flagged items ruled · 13 cut · 3 held out and re-homed |
| Phase 2 | 8 batches · 35 covered types gap-filled · 33 uncovered types built |
| Mints | 7 equipment types · 13 system types |
| Gates | sweep CLEAN at 20 retired values · battery 31/31 |

**One type has no template, and it is not an oversight.** `sprinkler_system`
decomposes into `sprinkler_piping`, `preaction_station` and
`standpipe_system`, which all have checklists; its own content is the NFPA 13
acceptance testing that belongs to [BACKBURNER 7b](BACKBURNER.md). A parent type
whose children carry the work does not need a duplicate.

### DEPARTURES — what changed from the plan, and why

Recorded because a campaign that reports only its plan teaches nothing about how
plans survive contact.

| Departure | Planned | What happened |
|---|---|---|
| **The corpus was two populations** | "~216 banked Start-Up sheets" mined as one corpus | 123 Excel `Start-Up` sheets were **97% placeholder** — *"SHEET INTENTIONALLY LEFT BLANK FOR INDIVIDUAL TO POPUPLATE AS NEEDED"*. The 81 Word `S02 CSP` masters carried everything. **The pilot regime existed for exactly this**: running the full mine against the average of the two would have produced almost nothing while looking like progress. |
| **Placement was delegated** | owner rules every flagged item | 678 items ruled by the machine on domain knowledge; owner ruled a 34-item residue and approved one summary. **Section placement is HVAC knowledge, not firm judgment** — and templates stay admin-editable, so the stakes were low while the law *nothing seeds unratified* stayed intact. |
| **D and E were nearly empty** | mine the corpus, fill gaps | The corpus gave 30 D items and 31 E items against 1,302 in A. **The safety-device tests and the readings tables — the engineering weight of a start-up — are the part the firm never had**, and Phase 2 became the larger half of the campaign rather than a tidy-up. |
| **A protective function lands in TWO sections** | one item, one section | Flame failure proves in D and records in E; freezestat, relief valve and high limit likewise. *A proof without a number cannot be compared to the specification next year; a number without a proof records what a gauge said, not that the device works.* Named as a drafting rule so it stops being rediscovered. |
| **The universal core became a module** | a core written into each type | 33 copies drift into 33 dialects. `phase2-universal-core.mjs` holds 17 rows every checklist imports — **universal because it is literally the same rows**. |
| **A new permission needed a bound in the same commit** | firm practice citable where codes are silent | The permission was misused in its own debut batch, and in the three batches after it. **Four fires, one author — the author who wrote the rule.** The guard now refuses at the point of authorship, and the incident is recorded in ARCHITECTURE as its own law. |
| **Systems needed an attachment mechanism** | templates attach to equipment types | Twelve templates target systems, not units. `equipment.kind` had modelled that since the Cx Index was built and had **zero rows in 935**. Finished rather than invented: `kind` on the type register, a mixed-kind targeting guard DB-side, masthead wording derived from target kind, and **no system attributes** — an empty nameplate grid is worse than an absent one. |

### What the family enforces, structurally

- **HOLD** is a fourth response state fenced to `yn_nr_na_hold` by a database
  CHECK, guard-proven 3/3. A blocked start-up is not a failed one.
- **Two-party sign-off** with both claims printed verbatim — the contractor
  certifies performance, the CxA attests to observation only.
- **The pre-start banner** is a column, not a line item: *a warning that is
  ticked is a warning that was read after the fact.*
- **Integration proof is never a start-up tick.** Every alarm and interlock row
  is *installed and operable*, with the response named to IST or FPT.
- **Manufacturer detail lives in one standing line item.** A template that
  hardcodes one manufacturer's sequence is wrong on every other unit.

---


*Opened 2026-08-05 on Tony's ruling. Both gates cleared the same night — see
[BACKBURNER 7](BACKBURNER.md). Release: [RELEASES 1.06](RELEASES.md).*

The last of the three seeding campaigns. IVC and PFC are done; FPT is parked.
This one is different from both in a way that matters: **the other two convert
forms the firm already has. This one designs a document first, then fills it.**

---

## Gates — both cleared 2026-08-05

**(a) Word COM.** `Documents.Open` hung machine-wide on 2026-07-21, on files that
had converted fine before, and forced Batch F onto PDF render twins. Tony fixed
the environment; re-verified independently by `probe-word-com.ps1` — **2/2**,
including `ats_checklist.doc`, the exact file that hung. Two targets on purpose:
the known-bad file plus one that had converted before it, because a probe that
only tries the known-bad file cannot distinguish *fixed* from *that file was
special*.

**(b) The type decision. RULED: `startup` is a first-class fourth
`ChecklistType`** — own tab, own counts on every dashboard / index / deliverables
surface, own template family. Not a fold into `ivc`. Schema deltas: Build Spec
§ `checklist_templates`. EXTRACTION-PLAYBOOK R10/R11 unchanged — start-up content
*embedded on a Static Verification sheet* still stays `ivc`.

**Why it is a type and not a variant.** Its sign-off structure differs: **the
contractor performs, the CxA witnesses, and both sign.** Every other checklist
family has one signing party making one claim. That is the RTU-vs-AHU bar — a
differing signature is a type; a differing value is data.

---

## Phase 0 — the document design

**Designed fresh at the brand class, and monochrome from birth.** Not converted
from a legacy sheet: the legacy Start-Up forms are the *content* source (Phase 1),
not the format source. Mockup harness: `mock-startup-doc.mjs`, rendered on a real
equipment type (boiler B-1, gas-fired condensing, 1000 MBH), in both modes.

It imports `DOC`/`DOC_SEMANTIC` from `doc-common` rather than restating hexes, so
a mockup of the identity cannot drift from the identity.

### Structure

| | Section | Why it is its own section |
|---|---|---|
| **A** | Pre-Start Verification | The **gate**. Every line reads Y or NR before the appliance is energized. |
| **B** | Energization & First-Start Sequence | **Numbered, because the order is the content.** Doing step 3 before step 2 on a fired appliance is the failure the section exists to prevent. This is the only section where numbering encodes information rather than decorating it. |
| **C** | Running Checks | Behaviour under load — after the thing is alive. |
| **D** | Safety Device Verification | Each device is **tested**, not observed. Columns: Required · As found · As left · **Test method**. |
| **E** | Readings to Record | A data table, not checkboxes. Boiler: low / mid / high fire. |
| **F** | Sign-Off | Two parties, two different claims. |

Plus the **nameplate-snapshot block** — Specified / Shop Drawing / Installed,
identical to IVC/PFC, so a unit reads the same across every family.

### What is new to this family, and why

**1. `HOLD` — a fourth response state.** Y / N / NR / **HOLD**. A start-up can be
*blocked* — no permanent power, no water treatment, no gas — and that is not the
same as *not satisfactory*. A blocked start-up recorded as a failure reads, a year
later, as work that was done badly rather than work that could not be done.

**2. Two-party sign-off, side by side.** The contractor certifies performance;
the CxA attests to **observation only, and explicitly does not assume
responsibility for the work**. Both claims are printed in full on the form. This
is the signature of the type and is not negotiable in later revisions.

**3. A masthead band** naming the document type. Start-Up is the only checklist
that is a *procedure with a live appliance at the end of it*; the document says so
before anyone reads a line item.

**4. The standing line item** — *"Manufacturer's IOM start-up steps reviewed,
completed & attached"* — sits first in Pre-Start on every type. Per the ruling,
this is what prevents per-manufacturer template forks.

### Blank mode is the field artifact

Clean white cells (no zebra — striping reads as almost the same grey as a
not-applicable shade on paper), write-on rules in the header block, generous row
height. The blank form's banner says **CONTRACTOR PERFORMS THE START-UP**, not
the generic hand-out wording, because who performs it is the point.

---

## Phase 1 — content mining (not format conversion)

The banked sheets supply *what to check*; Phase 0 supplies *how it is presented*.
Thin or absent content flows to Phase 2 rather than being padded.

### PILOT RESULT — 2026-08-05. The corpus is not one corpus, it is two.

**This is why the pilot regime exists.** "~216 banked Start-Up sheets" turned out
to describe two populations with opposite yields, and running the full mine
against the average of them would have produced mostly nothing while looking
like progress.

**The Excel half is empty.** 123 CSA Z320 workbooks across Mech / Elec / Arch
carry a sheet named `Start-Up`. 121 read; **exactly one — `Air_Handling_Unit` —
has usable content.** The other 120 hold a placeholder:

> SHEET INTENTIONALLY LEFT BLANK FOR INDIVIDUAL TO POPUPLATE AS NEEDED

(sic). Their 3–4 counted "items" are the firm address block, `GENERAL COMMENTS:`
and the date mask. The census counts them anyway — its classifier is deliberately
generous, because a sheet that still reads thin under a rule biased toward
content is unambiguously thin. Two workbooks have no `Start-Up` sheet at all
(`Roof_Top_Unit`, `Fan_Coils - startup_contractors`).

**The Word half is the real source.** The `S02 … CSP` masters — *Contractor
Start-up*, per the CSA form legend — are dense, structured, table-based forms.
A 12-file sample spread evenly across the 81-file corpus (not the first 12, which
share a folder and a template and would measure one form twice):

| | Excel `Start-Up` sheets | Word `S02 … CSP` masters |
|---|---|---|
| Corpus | 123 | 81 |
| Sampled | 123 (all) | 12, evenly spaced |
| Usable (≥ 8 content rows) | **1** | **12 of 12** |
| Median content rows | 3 | **34** |
| Projected content rows | ~30 | **~2,160** |

**What this changes.** Phase 1 mines the **Word CSP corpus**; the Excel
`Start-Up` sheets are not a content source and go to Phase 2 wholesale. The
practical effect is that Phase 2 is larger than planned and Phase 1 is narrower
and better — 81 real forms instead of 204 mixed ones.

Harnesses: `mine-startup.mjs` (Excel census — reuses `audit-template.mjs`'s own
dependency-free xlsx reader, so it measures the same bytes the IVC campaign
measured) and `census-csp-word.ps1` (Word census via COM, counting content-bearing
**table rows** rather than paragraphs, because these forms are tables and a
paragraph count would flatter a blank one). Neither writes anything.

**Awaiting a ruling before the full run** — see *Open* below.

### THE SECTION-PLACEMENT LAW — ruled by the owner, 2026-08-05

**On a start-up form the deciding test is WHAT STATE THE UNIT MUST BE IN FOR THE
CHECK TO MEAN ANYTHING.**

| The check… | Section |
|---|---|
| presence / installation / setting | **A** Pre-Start |
| requires the unit **running** | **C** Running Checks |
| is a protective-device **trip proof** | **D** Safety Device Verification |
| is a **numeric blank** | **E** Readings to Record |
| is an **alarm / interlock INTEGRATION proof** | **not start-up.** The item goes **A** (installed / operable) and carries a note saying the proof lives in the fire-integration (IST) or FPT column |

**The last clause is the one with reach**, and it is the substantive ruling. A
start-up form records that a device is present and works on its own; proving that
it makes *something else* happen is a different document. Applied consistently it
moved **34 occurrences out of D** — the fire-alarm devices and interfaces (smoke,
duct and heat detectors, pull stations, bells, speakers, magnetic door holders,
elevator recall, fan shutdown, central station, flow and supervisory switches) to
**A + IST**, and the BAS change-of-state and supply-temperature alarm
confirmations to **A + FPT**. D fell from 58 to 30, and what remains in D is what
belongs there: devices that protect *this* equipment, tripped during *this*
start-up.

**Practical effect on the residue:** all 34 distinct decisions are ruled. The
owner ruled eight verbatim; the remaining 26 followed the same law, most of them
on one distinction — **a bare noun-phrase names a thing (A); a verb of
verification names an act (C).** *"Electric Operator"* is presence; *"After
Cooler Verified"* is operation.

#### ONE DEFINITION, AT CONTENT SCALE — the shared universal core

The design law says *the universal core dominates*. Batch 5 gave that a
structural form, endorsed 2026-08-06: **the core is a shared module every type
imports, not a block copied into each type.**

`phase2-universal-core.mjs` holds 17 rows. Thirty-three checklists import them
and none restates them.

**The argument, which is the one-definition principle applied to content rather
than to code:** thirty-three copies of the same seven checks *drift*. One gets a
better wording, another gets a fix, a third gets an item nobody meant to add —
and within a year the "universal" core is **thirty-three dialects**, each
defensible on its own and none identical to any other. At that point the word
universal is a claim the artifacts no longer support.

> **The core is universal because it is literally the same rows.** Not because
> the rows agree, and not because somebody checks that they agree.

The same reasoning that put `DOC` in one object and the document identity in one
place — a value defined twice is a value that will eventually differ, and the
version that differs is the one nobody is looking at.

**Per-type variation sits on top and stays thin** — averaging ten rows against
the core's seventeen. That ratio is the design law made measurable: if a type's
own band ever outgrows the core, the type is either genuinely exotic or the band
has stopped being a band.

#### `firm practice—core` — the permanent shape for firm-universal rows

Approved 2026-08-06. Three core rows are **universal across every type and every
source the firm has, and carried by no code in the anchor set**: the area-clear
row, the lock-out-and-confirm-zero-energy row, and the no-leaks row.

They are not single-source in the sense the class means — the convergence is
real, across the whole corpus. What is single is the **citation**, and the
citation is ours.

**The shape: a per-row suffix, visible on the row, never an exemption inside the
guard.**

```
anchor: 'firm practice—core'   ->  classed universal, carries CORE_FIRM_NOTE
anchor: 'firm practice'        ->  MUST be single-source, guard exits otherwise
```

A blanket exemption would have been shorter and would have hidden exactly the
thing worth seeing. **Three rows carry a suffix a reader can grep for; a guard
exemption would have carried nothing.**

#### Commentary — the preaction split, and the known-good handoff

Two framings from batch 4 that generalise beyond their types.

**THE PREACTION SPLIT.** Supervisory air resisted the placement law once already
and was held out for it. Its resolution — *split the claim rather than pick a
side* — applied again on the preaction valve station, to the same physical thing:

| | Where it lives | Why |
|---|---|---|
| The pressure is **maintained** | **D**, start-up | a fact about the station, true with nobody watching |
| Its loss is **annunciated** | **IST** | a fact about two systems agreeing, which is integration |

**One device, two claims, two documents** — and neither document is lying by
omission, because each says which half it holds.

**THE KNOWN-GOOD HANDOFF.** Smoke management records each fan and each damper
proven **individually**, from its own control, independent of the matrix.

That is not a weaker version of integrated testing. **It is the precondition
CAN/ULC-S1001 integrated testing assumes before it begins.** An S1001 test that
fails because a damper actuator was never stroked has learned nothing about the
integration — it has discovered an installation defect at the most expensive
possible moment, with the AHJ in the room.

> **A start-up hands the integrated test a known-good starting position. It does
> not duplicate the integrated test, and it does not leave it to discover
> installation faults.**

That sentence is the start-up/IST boundary in one line, and it is quoted into
[BACKBURNER 3e](BACKBURNER.md) where the IST module lives.

#### Placement-law commentary — a protective function can land in TWO sections

**Named 2026-08-06, from the first Phase 2 artifact, because it recurs.**

**When one test yields both a proof and a number, the proof goes in D and the
number goes in E.** They are not duplicates and neither is optional:

| The test | D records | E records |
|---|---|---|
| Flame failure | the main fuel valve closed | the closure time (s) |
| Freezestat | the trip fired and locked out | the trip temperature (°C) |
| Relief valve | seal intact, rating verified against MAWP | the set pressure (kPa) |
| High limit | burner shut down, manual reset required | the cut-out setpoint |

**Why both.** A proof without a number cannot be compared to the specification
next year; a number without a proof records what a gauge said, not that the
device works. The placement law already separates them — *protective-device trip
proof is D, a numeric blank is E* — and this is that law applied to a single
physical act rather than to two different items.

**The practical rule for drafting:** every safety device with a timing or a
setpoint generates a D row AND an E row. Neither is a convergence duplicate, and
a drafter that emits only one has dropped half the evidence.

#### One departure, stated rather than buried

**Width · Height · Duration · Lighting Levels were ruled E** — *"numeric blanks
are readings."* In the source they are **not** numeric blanks: all four are
`[label, STATUS, COMMENTS]` ticks on the Egress Systems master. The ruling is
applied as given, and the effect is that the new form **captures a value where
the old one captured a tick.** That is an improvement the Phase 0 design makes
possible — the readings table exists for exactly this — but it is a change to
what gets recorded, not a re-filing of it, so it is named here rather than
absorbed silently.

#### Three items genuinely resist the law — held out, not guessed

The law has five branches and these fit none of them. Each is a
**sprinkler-system-internal protective function**: not a device on the equipment
being started, and not a fire-alarm integration. Their proof is an NFPA 13
acceptance test on the sprinkler system itself.

| Item | Why it resists |
|---|---|
| **Accelerator** | dry-pipe accelerator; its proof is a system trip test, not an equipment start-up check |
| **Flooding Valve** | deluge valve; same shape |
| **Supervisory Air** | half installation (A), half annunciation proof (IST), and neither cleanly |

They remain at **D** and stay flagged, pending a ruling on whether they are
start-up scope at all.

#### The three held-out items — RULED 2026-08-06

**Accelerator · Flooding (Deluge) Valve — OUT OF START-UP SCOPE ENTIRELY.**
Both are proven by NFPA 13 trip tests on the sprinkler system: acceptance
testing, not equipment start-up. Nothing on a start-up sheet exercises either
one, and **a form that pretends otherwise records theater.** They are
**deferred WITH A DESTINATION, not dropped** — together with standpipe's 11
orphaned items they are the founding content of
[BACKBURNER 7b, the Acceptance Testing family](BACKBURNER.md).

**Supervisory Air — A, reworded.** The source label was genuinely ambiguous
between the installation and the annunciation, and *the ambiguity resolves by
splitting the claim, not by picking a side*:

- **A** — *"Air maintenance device installed and operational"* — the arrangement,
  which a start-up can honestly confirm.
- **IST** — annunciation on loss of supervisory air, per the placement law:
  **integration proof is never a start-up tick.**

#### The transformer banner — APPROVED

The Liquid Filled Power Transformer master's *"Note: Equipment to be isolated
from all sources of power"* renders as a **bold pre-start banner above section
A**. The reason, recorded because it generalises to every future warning:

> **A warning that is ticked is a warning that was read after the fact.**

A lockout instruction is a precondition of touching the equipment at all, so it
is read before the first line is answered rather than confirmed after the work is
done. It is also the only element on that form whose failure mode is
electrocution.

#### Two Phase 2 seeds, named while ruling

- **D — "Freezestat trip proven"**: the missing half of *"Coil Protected From
  Freezing"*, which records the provisions and never proves the trip.
- **A — "Point-to-point control verification complete"**: the explicit static
  half that scope-less *"Controls Verified"* (now C) leaves unstated.

---

### Section placement — DELEGATED to the machine, 2026-08-05

**Who decided what, so the paper trail says it plainly:**

| | |
|---|---|
| **Placement of every flagged item** | **ruled by the machine, on engineering domain knowledge** |
| The low-confidence residue | ruled by the owner, by hand |
| Final approval of the whole pass | owner, on one summary artifact |

**The reasoning behind the delegation, recorded because it is the precedent:**
section placement is *HVAC domain knowledge, not firm-specific judgment* — what a
check physically requires is a fact about the equipment, not a decision about how
Isotherm works. The stakes are also low: templates stay admin-editable forever.
What is preserved is the system's own law — **nothing seeds unratified.** The
owner approves **one artifact instead of 678 rows**, and reads only the handful
the machine was not sure about.

**The placement test the machine applied**, stated so it can be argued with:

| | The check requires… |
|---|---|
| **A** Pre-Start | the unit can be dead — installation, condition, documents, prerequisites |
| **B** Sequence | an ordered step in energizing or first-starting; the order is the content |
| **C** Running | the unit must be RUNNING — behaviour, modulation, continuous operation |
| **D** Safety | a protective device **proven** — tripped, simulated, or its interlock fired |
| **E** Readings | a quantity **recorded**, with units |

**Confidence is recorded per item**, and only `low` reaches the owner:
`high` (the wording settles it) · `medium` (reasoned, a glance is enough) ·
`low` (genuinely uncertain — owner rules) · `cut` (not a checkable thing).

**Two clusters were web-verified rather than guessed**, per the delegation's
instruction to verify where genuinely uncertain:

- **NETA ATS** separates *Visual and Mechanical Inspection* from *Electrical
  Tests*, both performed before initial energization. So transformer and
  switchgear inspection rows are **A**, and *"All Specified Tests – Data
  Recorded"* is **E**.
- **NFPA 13** dry-pipe air-pressure tests (40 psi / 24 h / < 1.5 psi loss) are
  **acceptance tests completed before the system is in service**, so a
  pressure-loss row is a pre-start result (**A**) and the pressure itself is a
  reading (**E**).

**Result:** 678 occurrences across 289 distinct labels. 190 moved from the
mapper's default, 475 kept, 13 cut. Final distribution **A 1271 · B 26 · C 225 ·
D 58 · E 33**. Residue: **34 distinct decisions** (67 occurrences) for the owner.

**Section B stopped being empty.** The mine reported `B 0`; placement found 26
genuine energization-sequence steps hiding in section A — the Building System
Integration master is written as ordered start and stop sequences, and those
steps had defaulted to Pre-Start because no rule matched them. The B gap is
therefore smaller than Phase 1 reported, and **D and E remain the real gaps.**

**The form note — proposed placement.** The Liquid Filled Power Transformer
master carries *"Note: Equipment to be isolated from all sources of power."*
Proposed as a **bold pre-start banner above section A** — read-before-touching,
not tick-after. *A warning that is ticked is a warning that was read after the
fact*, and this one is a lockout instruction whose failure mode is electrocution.

Artifacts: `startup-placement-rulings.mjs` (the rulings, one per distinct label,
each with a one-line reason) and `apply-placement-rulings.mjs` (applies them,
asserts full coverage, and **refuses to run twice** — the pass clears the flagged
bit, so a second run would summarise the delta and report "67 ruled, 0 cut" for
work that ruled 678 and cut 13). Summary for approval:
`out/startup-mining/placement-summary.json`.

---

## Phase 2 — standards-anchored gap fill

### OPENED 2026-08-06 — coverage audit

**35 of 68 types covered · 33 uncovered.** The register now holds 55 equipment
types and 13 system types; Phase 1 seeded start-up checklists against 35 of them.

**Uncovered (33):** air_separator · ats · convector · dehumidifier · duct_heater ·
elevator · erv · expansion_tank · fire_pump · fire_smoke_damper · heat_exchanger ·
heat_pump · humidifier · jockey_pump · lighting_panel · louver · mcc · panel ·
radiant_panel · smoke_control_fan · smoke_control_panel · sprinkler_system ·
sump_pump · switchboard · switchgear · unit_heater · unit_ventilator · ups · vav ·
vfd · vrf · wall_fin · water_softener

**Two workstreams, and the placement pass ranked them:**

1. **D and E on the 35 covered types — the priority.** The mined corpus is
   installation-completeness knowledge: it carried 30 D items and 31 E items
   across 81 masters, against 1302 in A. **The safety-device tests and the
   readings tables are the engineering weight of a start-up, and they are the
   part the firm never had.**
2. **Complete checklists for the 33 uncovered types**, the seven new equipment
   mints among them.

### Batch 1 — the first drafted artifact

. Boiler D and E, drafted rather than
mined, because Phase 1 had nothing to mine for either.

**Convergence in practice:** 13 universal · 8 type-common · 1 single-source. The
single-source item — *emergency fuel shutoff at the room exit* — is kept on a
**stated jurisdictional basis** (TSSA requires it for fuel-fired appliance rooms;
no national source in the anchor set carries it). Two items were **cut before the
sheet was written**: a burner nozzle part number (per-manufacturer detail that
belongs in the IOM attachment) and a refractory dry-out schedule (one boiler
construction, no code basis). *The template holds consensus, not collection.*

Anchors web-verified, not recalled: CSA B149.1 confirms the low-water cutoff
requirement, the manual-reset high limit, and that loss of flame must close the
safety shutoff valves immediately — which is why the closure TIME appears as an E
row beside the D row that proves the trip.

** renders the convergence sheet**, and its guard is
proven on both failure modes: an item with no class refuses the sheet, and a
single-source item with no stated reason refuses it too. Neither reaches a
sitting.


**Ruled 2026-08-05, before Phase 2 starts, so it boots from the repo rather than
from conversation memory.** Phase 1's batches finish and the ratification
sittings proceed at the owner's pace first; nothing below begins early.

Phase 2's input is two things: the **B / D / E gaps** the mined corpus left (the
CSP masters are installation-completeness knowledge — they carry no energization
sequence, almost no safety-device *testing*, and no readings table), and
**complete checklists for types the corpus never covered**.

---

### THE DESIGN LAW — universal first

**The start-up family's product is the UNIVERSAL FORM: one form usable on most
equipment as-is.** Everything below follows from that sentence.

**1. The universal core dominates.** These are the all-sources consensus items —
true of essentially any powered equipment being started for the first time:

- rotation verification
- terminations torqued / verified
- safeties proven **before** operation
- nameplate-vs-design confirmation
- alignment / lubrication
- system cleanliness / flush
- permits and prerequisites to start

**2. The type-common band is deliberately thin.** Only items with all-sources
convergence *for that specific type* — a gas-train leak test on gas-fired
equipment, seal and NPSH checks on pumps. **Target a handful of items. Never a
page.** If a type-common band is growing toward page length, that is the signal
that granular detail is leaking in, not that the type is unusually rich.

**3. NO granular type or model detail in templates.** Manufacturer- and
model-specific steps live **exclusively** in the standing line item:

> Manufacturer's IOM start-up steps completed & attached

**A template that hardcodes one manufacturer's sequence is wrong on every other
manufacturer's unit. One that demands the IOM is right on all of them.** This is
also the mechanism that prevents per-manufacturer template forks, which is why
the standing item is added by the mapper rather than hoped for in a source.

**4. Item-count discipline, at the nameplate campaign's bar: field-worthy, not
exhaustive.** A lean form gets filled; a long one gets skipped. An unfilled form
is worth nothing, so length is not a neutral choice — it is a decision to be
ignored. (Precedent: `heat_pump` reached 25 fields and was trimmed back to 14.)

---

### THE METHODOLOGY — convergence-based drafting

**An item earns its place by appearing across multiple independent sources.**
Triangulation, not collection.

Every drafted item records its **convergence class**, in the artifact, visible in
the ratification table:

| Class | Meaning | Disposition |
|---|---|---|
| `universal` | present across all sources, for all equipment | keep — this is the core |
| `type-common` | present across all sources **for this type** | keep — the thin band |
| `single-source` | appears in one source only | **CUT, unless a reason is stated** |

**A single-source item with no stated reason is cut. The template holds
consensus, not collection.** A legitimate stated reason looks like a
jurisdictional requirement — e.g. an Ontario-specific TSSA obligation that no
national source carries. "It seemed useful" is not a reason.

**Ratification tables carry the convergence column**, so a sitting sees *why each
item exists* rather than only what it says. `ruling-table.mjs` gains that column
for Phase 2 artifacts; Phase 1's mined items carry a named master, table and row
instead, which is their provenance.

---

### ANCHOR SCOPE — North America

Web-verified and **cited per item**, never recalled:

- **CSA Z320** — commissioning process
- **CSA B149 / TSSA** — gas-fired equipment, Ontario
- **NFPA 20 / 25** — where they govern (fire pumps, water-based systems)
- **NETA ATS** — electrical energization and acceptance
- **ASHRAE Guideline 1.1 / Standard 202** — process structure
- **AHRI** and **manufacturer-IOM conventions**

**Per-item citation is what makes a future regional re-scoping a RE-ANCHORING
rather than a rewrite.** If the firm ever works outside North America, the items
stay and their anchors change; without citations, the whole family would have to
be re-derived.

---

### Variants

Per the ruled variant principle: **conditional sections where the medium or fuel
changes the procedure** (the Heating Medium pattern). Never per-manufacturer
forks — see the design law, point 3.

### Delivery

Batches of ~10 through the **stored-artifact ratification path**, source notes
and convergence class per item. **Nothing seeds unratified.**

## Open

- **Phase 0 — APPROVED** 2026-08-05 on render review. All four family-defining
  decisions ruled as proposed: HOLD as the fourth response state (and carried
  into the app's response model, not just the paper), the two-party sign-off
  verbatim, numbering confined to section B, the masthead type band.
- **PHASE 1 NEEDS A RULING before the full run**, per the pilot regime:
  1. **Confirm the source switch** — mine the 81 Word CSP masters; send all 123
     Excel `Start-Up` sheets to Phase 2. The Excel half is placeholder text.
  2. **`Air_Handling_Unit` is the one Excel exception** (30 items). Mine it with
     the Word batch, or send it to Phase 2 with its siblings for consistency?
  3. **Batch size.** The Word corpus is 81 forms; the ratified path runs in
     batches of ~10. That is 8 batches.
- **`doc-palette-sweep.mjs` already lists `startup` in `EXPECTED_TYPES`** and
  prints **NOT SWEPT** until a ZZ-TEST startup instance exists. Listed ahead of
  the build on purpose: the fourth type must not arrive unswept.
