# Start-Up campaign — the record

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

## Phase 2 — standards-anchored gap fill

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
