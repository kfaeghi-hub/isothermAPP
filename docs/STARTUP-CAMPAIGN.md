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

~216 banked Start-Up sheets are mined for **line items and firm knowledge**, then
mapped into the approved template per equipment type. The sheets supply *what to
check*; Phase 0 supplies *how it is presented*. Batch provenance throughout.

**Pilot first: one batch with metrics before the full run.** Thin or absent
content flows to Phase 2 rather than being padded.

## Phase 2 — standards-anchored gap fill

Coverage audit after Phase 1: which of the 47 types have no start-up checklist.
Then the drafter pattern at checklist scale, **web-verifying anchors rather than
recalling them** — ASHRAE Guideline 1.1 / Standard 202 and CSA Z320 for process
structure; per-type anchors (NFPA 20 fire pumps; CSA B149 / TSSA for gas-fired
equipment in Ontario; NETA ATS for electrical energization; AHRI conventions;
manufacturer-IOM-standard sequences).

Variants follow the ruled variant principle — **conditional sections where the
medium or fuel changes the procedure** (the Heating Medium pattern), never
per-manufacturer forks. Delivery in batches of ~10 through the **stored-artifact
ratification path**, source notes per checklist. **Nothing seeds unratified.**

---

## Open

- **Phase 0 awaits approval.** Nothing is generated until the design is ruled on.
- **`doc-palette-sweep.mjs` already lists `startup` in `EXPECTED_TYPES`** and
  prints **NOT SWEPT** until a ZZ-TEST startup instance exists. Listed ahead of
  the build on purpose: the fourth type must not arrive unswept.
