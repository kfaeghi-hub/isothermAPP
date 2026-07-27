# Domain rulings

Part of the Firm Knowledge Layer. Read by `ai-common` into drafting calls that
touch checklists, equipment or extracted content.

**Seeded 2026-07-26 from `docs/EXTRACTION-PLAYBOOK.md`** — that document holds 26
ratified rulings governing template extraction, grown over the CSA and PFC
campaigns. What follows is the subset that governs *how Isotherm talks about
equipment and verification*, restated for prose generation. The playbook remains
canonical for extraction itself; this file must not contradict it, and when it
changes, this file is updated in the same commit series (standing rule).

---

## Branding — absolute, no exceptions

**Playbook R17 / R22, standing rule.** Source masters carry legacy branding
(CSA, Z320, Z318, BCA, BCxA, IEL series codes, and prior firms' names).

- **Extract content only.** All generated output renders **Isotherm** identity.
- Source series codes and lineage live in `revision_label` / description fields,
  **never in rendered titles or prose**.
- Signoff blocks use **generic roles** — "Commissioning Authority (CxA)",
  "Contractor" — never a company name.
- **Standard marks are data, not labels.** A CSA or UL listing mark recorded on a
  nameplate is a recorded *value*. A requirement reference inside a check label
  ("Conforms to SMACNA") is content and stays. The distinction: a mark describing
  the equipment is data; a mark describing our document is branding, and branding
  is removed.

## Equipment vocabulary — ruled, never invented

**Playbook R18.** Equipment keys are a closed, ruled set. When prose names an
equipment class, it uses the project's own register terms, not a synonym:

`ahu` (includes RTU and direct-fired MAU) · `pump` (includes sump and DHW
circulation) · `fan` (includes fume exhausters) · `fcu` (includes split-system
and packaged A/C) · `heat_pump` · `chiller` · `cooling_tower` (includes fluid
cooler) · `boiler` (FD / ND / steam) · `erv` (heat recovery wheel) · `generator` ·
`vav` (terminal units including fan-powered; CAV is deliberately not a key) ·
`ats`

Anything outside the set has **no key** and takes the basic fallback. **Do not
invent a category to make a sentence read better.**

## Verification vocabulary

- **Installation Verification (IVC)** — static, pre-energisation checks that the
  equipment is installed as specified.
- **Prefunctional Checklist (PFC)** — contractor-completed readiness checks
  before startup.
- **Startup** — a distinct activity from installation verification, performed by
  the contractor or manufacturer, witnessed by Isotherm. *(This distinction is
  why the section heading is "Installation and Startup Testing Procedures" —
  ruling D2, 2026-07-26.)*
- **Functional Performance Testing (FPT)** — dynamic testing against the sequence
  of operations, directed by Isotherm.
- A checklist item that fails **creates a finding**. Findings are numbered once
  and never renumbered.

## Statements about verification

- The plan describes **what will be verified and by whom**. It never asserts the
  result.
- Responsibility is stated at line level with the actor in parentheses (style
  card). Where responsibility is genuinely shared, say so — do not pick one.
- A system not in the project's register is **not** commissioned. Never list a
  system because it commonly appears.

## Quarantine, never guess

**Playbook R16, restated for prose.** Where the supplied facts do not resolve a
question, the correct output is **omission plus a flag**, never a plausible
sentence. A drafted claim that no fact supports is the failure mode this whole
pipeline is built to prevent, and the verification pass (call 2) exists to catch
it when the drafting call fails to.
