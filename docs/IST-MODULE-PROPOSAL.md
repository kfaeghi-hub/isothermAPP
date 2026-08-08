# IST-MODULE-PROPOSAL.md — integrated systems testing, CAN/ULC-S1001

**Status: PROPOSED 2026-08-08. No code. No schema. Nothing built until ruled.**
Wakes [BACKBURNER 3e](BACKBURNER.md#3e-the-ist-module--integrated-systems-testing-parked-whole).
Foundation it inherits and does not re-derive: [IST-CATALOG-ADDENDUM.md](IST-CATALOG-ADDENDUM.md).

Two sources define this module, and they settle different things:

1. **`Scarborough Gardens Arena_IST_REV2` — the firm's own issued report**, authored
   by Peiman, ITC role held by Isotherm, tested 2025-11-13 / 11-26, issued
   2025-11-27 at REV2. Read in full. **Its anatomy is the data model's source of
   truth**, and the module must be able to produce it.
2. **Web research on CAN/ULC-S1001**, cited at the foot, filling what one document
   cannot show: the standard's required plan contents, the ITC's qualifications,
   the retest cycle, and what changed in Ontario on 2026-01-01.

---

## The finding that changes how this module should be built

**The firm's document is not a house style. It is S1001 Appendix C.**

The standard requires the Integrated Testing Plan to contain an introduction with
building information and a systems overview, a sequence of operation expressed as
a **cause-and-effect matrix**, **test protocols and procedures**, and
**notifications**; and it requires the Integrated Testing **Report** to consist of
the plan, the documentation collected during implementation, the testing forms for
the initial test, the forms for re-tests, and the life-cycle testing schedule.

Lay that against the Scarborough document's own table of contents:

| S1001 requires | Scarborough document |
|---|---|
| Introduction, building info, systems overview | §3, §3.1, §3.3 |
| Sequence of operation — cause-and-effect matrix | §4 Integrations Matrix |
| Test protocols and procedures | §5 |
| Notifications | §6 |
| Plan + collected documentation | §9.1, §9.2 |
| Forms for the initial test | Attachment A (blank) → Attachment B (completed) |
| Forms for re-tests | Attachment A, kept blank "for future test use" |
| Life-cycle / maintenance schedule | §11 Ongoing Integrated Systems Testing |

**Every section maps.** That is not a coincidence and it is not Peiman following a
template loosely — it is the deliverable the standard specifies.

**Why it matters for the build:** the generator's target is not "a document that
looks like Peiman's". It is **a standard-defined structure that AHJs across
Ontario are already reading**, which means the structure is stable, the fixture is
authoritative, and a faithful regeneration is a real gate rather than a
resemblance test. It also means the module is portable to any project in the
province without redesign.

## The second finding: the market just changed

**Ontario Fire Code amendments under O. Reg. 87/25 took effect 2026-01-01** and
create a **retroactive obligation**: buildings whose fire protection or life
safety systems were installed or modified on or after 2020-01-01, and which the
OBC required to be tested to S1001, must now have that testing completed,
maintained, and **documented and available**. Unmodified existing systems are not
caught; any modification triggers it immediately.

Combined with the standing cycle — **initial test at completion, retest at one
year, then every five years** — this is not a module that serves one project. It
is a module that serves a **recurring, code-mandated, owner-obligated service
line**, on both new construction and an existing-building population that has just
been swept into scope seven months ago.

*This is context for the ruling, not an argument for scope creep.* It is stated
because it changes the value of §11's ongoing-testing table from a footnote into
the part that earns repeat work.

---

## The data model, derived from the document's anatomy

### The central insight the document gives up on close reading

**The three attachment tables are not the same shape, and a naive model would
force them to be.**

- **Table A-1 (FA ↔ Fire Signal Receiving Centre)** enumerates **condition types**:
  Alarm · Supervisory · Trouble · Connection Integrity. Four rows, one per
  condition, each with a Normal Mode and a Fire Mode verdict.
- **Table A-3 (FA ↔ AHU)** enumerates **units**: ERV-1, ERV-2, ERV-3, ERV-6, DH-1.
  Five rows, one per machine, each Normal/Fire.
- **Table A-2 (FA ↔ Sprinkler)** enumerates **points**, and adds a column the
  others do not have — `Equip. Type` carrying **S.V. · F.S. · P.S. · L.A.P.S.** —
  with several device types stacked under one numbered row (row 5 carries three;
  row 6 carries three). It then **switches shape mid-attachment** into two
  "System Room Integrations" sub-tables (air compressor loss of power, low-temp
  thermostat) that are per-condition again.

So a protocol row's subject is one of **three kinds**: a *condition type*, an
*equipment unit*, or a *supervised point*. **The model must carry all three, or it
will bend the firm's own document out of shape.** This is the anatomy finding that
most constrains the schema, and it is invisible unless you read all three tables
against each other.

### Proposed tables

**`ist_plans`** — the plan as a versioned artifact.
Project-scoped. `revision_label` · `revision_date` · `description` · `status`
(draft / issued) · issued snapshot columns per Rule 4. The document's **first
table is its revision control** (REV 0 draft → REV 1 filled with results → REV 2
filled from pre-documentation and engineers' instructions), so revisions are
first-class and each carries *why*. **An issued plan revision is frozen**; a
correction becomes REV n+1, exactly as the site-report and checklist families
already work.

**`ist_systems`** — the participating systems, per plan.
`system_kind` · `label` · `overview_description` (prose) ·
`integrations_objectives` (prose) · optional `equipment_type_key` ·
optional `equipment_id`. **References the register both ways**, per the ruling:
an `equipment` row where the system is a unit, and a **`kind='system'` row** where
it is a system — which is what the system-attachment mechanism was built for and
this is its second consumer. The two prose fields are §3.3's Heading-3 pattern
verbatim (*System Overview Description* / *Systems Integrations & Functional
Objectives*), stored per system per plan because they are project-specific prose,
not firm boilerplate.

**`ist_integrations`** — pairwise and first-class.
`system_a_id` · `system_b_id` · `integration_type` · `normal_mode_behavior` ·
`offnormal_mode_behavior` · `sort_order`. This is §4 exactly. Scarborough carries
**three pairs and nine integration rows** (FA↔FSRC ×4, FA↔Sprinkler ×4,
FA↔HVAC ×1).

**`ist_protocols`** — the test procedure per integration.
`integration_id` · `subject_kind` (**`condition` | `unit` | `point`** — the
finding above) · `subject_label` · `condition_type` (S1001's Alarm · Supervisory ·
Trouble · Connection-Integrity, nullable when the subject is a unit or point) ·
`equip_type_code` (S.V./F.S./P.S./L.A.P.S., nullable) · `normal_mode_steps` ·
`fire_mode_steps` · `expected_result` · `sort_order`. §5 supplies the steps; the
attachment tables supply the subjects.

**`ist_sessions`** — a witnessed test event.
`plan_id` · `test_date` · `test_type` (new / one-year / five-year / modification) ·
`description` · `records_ref`. This is §11's ongoing-testing table, and it is also
what makes the retest cycle trackable rather than remembered. Scarborough's single
row (2025-11-27 · New · initial occupancy · Attachment B) is row one of a table
that should be long by year five.

**`ist_session_participants`** — role · company · contact · per session.
Because Scarborough's participants **differ between sessions and between tables**:
B-1 is signed by Riho Sikes alone on 11-13; B-2 by Peiman, Riho and Tony across
11-13 **and** 11-26; B-3 by Peiman and Riho on 11-27. Participants are not a
project-level fact.

**`ist_results`** — one row per protocol per session.
`session_id` · `protocol_id` · `normal_verdict` · `fire_verdict` (pass / fail /
n-a) · `observed_text` · `numeric_value` + `numeric_unit` (**optional**) ·
`tested_on` · `note`. The document's per-row *"Tested 2025-11-13"* is a **per-result
date distinct from the session date**, which the model must carry — B-2 has rows
tested on two different days inside one signed table.

**`ist_signoffs`** — per integration group, per session.
Because the document signs **each attachment table separately**, with its own
company, name, signature and date. A single report-level signature would be a
different document from the one the firm issues.

**`ist_prerequisites`** — §9.1's 22-row documentation checklist.
`plan_id` · `item_no` · `description` · `category` (design professional
confirmation / contractor confirmation / verifying-party documentation / authority
inspection) · `state` (**YES / NO / N/A** — tri-state, exactly the checklist
engine's status vocabulary) · `document_id` (nullable FK to the documentation
register) · `received_on`.

**`ist_precompleted`** — §9.2's accepted-pre-completed-test table.
`integration_id` · `integration_type` · `documentation_ref` · `comments`. Small,
and structurally important: it is the mechanism by which an ITC accepts someone
else's test as satisfying part of the IST, and it is the row that says *why* a
protocol was not executed live.

### Notes are richer than a text column, and B-3 proves it

Table B-3's note is **one note spanning all five rows**, and it contains: an
observed installation fact, a spec-section citation (`25 40 11 3.4.1`), an
apparent non-conformance, and then **two named engineers' written rulings** that
resolve it — the FA engineer calling the relay above-and-beyond OBC, the
mechanical engineer ruling the spec section not applicable. **REV2 of the entire
document exists because of that note.**

So: notes attach at **protocol-row level or integration-group level**, they are
long-form, and they may carry an attributed determination. Proposed as
`ist_notes` (`scope` = result | integration | session, `body`, `author_label`,
`received_on`) rather than a `note` column that would flatten an engineer's
written ruling into a cell. *A determination that changed a revision is not a
comment.*

---

## Team seeding — classification-driven, admin-editable

**Ruled requirement:** when a project's classification includes IST, the Team tab
seeds the IST role set by default.

The document's §3.2 Project Contacts Matrix carries **14 seats**. Against the 16
role types already in `company_role_types`, the split is:

| Already in the vocabulary | To be added |
|---|---|
| Client/Owner · Architect · Mechanical Engineer · Electrical Engineer · General/Main Contractor · Mechanical Contractor · Electrical Contractor · Elevator Contractor · CxA / CxP | **Integrated Testing Coordinator** · **Fire Protection Engineer** · **Fire Protection Contractor** · **Fire Alarm Contractor** · **Structural Engineer** · **Building Department** · **Fire Department** · **Electrical Authority (ESA)** |

Two notes on that table:

- **`Integrated Testing Coordinator` is a distinct seat and not a synonym for
  CxA.** The research is explicit: the ITC must be a professional engineer or a
  ULC-listed individual at an authorized S1001 service provider, and is
  responsible for collecting the interconnection documentation from the
  responsible professionals and preparing the plan. Isotherm holds it on
  Scarborough — but it is a *role a project has*, and on some projects it will be
  someone else. Modelling it as "the CxA, obviously" would break the first time
  the firm is not the ITC.
- **The AHJ seats (Building Department, Fire Department, ESA) are contacts, not
  team members in the working sense.** They belong in the matrix because the
  document puts them there and because acceptance is a project milestone — but
  the proposal flags them for a ruling: **seed them, or keep the matrix to parties
  who perform work?** Recommendation: **seed them**, because §3.2 is a *contacts*
  matrix and the report prints it verbatim.

**Seeded as team seats — role rows awaiting contacts**, the established
team-matrix pattern, written as **classification-driven data, never hardcoded**.
The new role types are ordinary `company_role_types` rows.

---

## The surfaces

### 1. The Integrations Matrix — recommend the TABULAR form, and here is the count

Tony asked which reads better at real counts. **The document's tabular form, and
it is not close.**

A systems × systems grid at Scarborough's numbers is **4 systems → 16 cells, of
which 3 are populated** — 81% empty, and the populated cells each hold up to four
integration types that a grid cell cannot show without becoming a list anyway. The
grid's one advantage, seeing absence, is not worth it: **an integration that does
not exist is not interesting; an integration that exists and was not tested is**,
and the tabular form shows that in a status column.

The grid gets worse, not better, at scale: a 10-system project is 100 cells for
perhaps 15 integrations. **Proposed: the document's five-column table
(System A · System B · Integration Type · Normal Mode · Off-Normal/Fire Mode),
grouped by pair, with a per-row status chip** (untested / pass / fail / pre-completed).

### 2. Per-integration protocol detail
The four S1001 condition types as tabs **where the subject kind is `condition`**;
a flat list where it is `unit` or `point`. The tabs must not be hardcoded as the
only shape — see the anatomy finding.

### 3. Pre-IST checklist
§9.1's 22 rows, tri-state, each linkable to a row in the documentation register.
**The link is the point**: "YES" with no document attached is the same claim the
guard family keeps catching.

### 4. Session / field mode
Witnessed live, on phones, in a building under construction. Per protocol step:
tap observed + verdict, attach photos, **offline via the established outbox
pattern**. This is the same interaction the checklist engine already ships and
should reuse it rather than grow a sibling.

### 5. Document generation — the plan and the report
Both, in the firm's exact structure, monochrome identity, **Attachment A blank and
Attachment B completed**. That pairing is already solved: it is the checklist
engine's **blank vs completed render modes**, and the tri-state prerequisite table
is its status vocabulary. **The reuse here is substantial and should be the
architecture, not a convenience.**

---

## Firm knowledge layer

Integration-type templates and standard protocol sets at **firm level**, project-
copy on use — the established pattern. Seeded from this document plus the
research:

- **FA ↔ Fire Signal Receiving Centre** — the four condition procedures, verbatim
  from §5.1.
- **FA ↔ Sprinkler** — water flow (with the **90-second** limit the document
  states), valve supervision (two full turns / 10% of stem), dry-system compressor
  loss of power, low-temperature detection.
- **FA ↔ AHU** — shutdown on alarm.
- **FA ↔ Elevator** — recall. *Not in Scarborough* (no elevator), but named by the
  standard and by the addendum's `elevator` ruling; seeded from research so the
  first elevator project does not start empty.
- **FA ↔ door hold-open / mag-lock release** — same reasoning; the addendum
  already ruled these are **interconnections, not equipment rows**, which makes
  them protocol subjects of kind `point`.

**AI protocol drafting stays OUT of v1**, per the entry — it is FPT-agent work and
waits for the same trigger.

---

## Boundaries, each with its destination named

| Not this module | Where it lives | Why |
|---|---|---|
| Per-unit readiness | **Cx Index** fire-integration column | S1001 verifies interconnections and explicitly does **not** verify the individual systems |
| Start-up of the participating machines | **Start-Up family** | *A start-up hands the integrated test a known-good starting position* — the corpus already stopped claiming IST's work |
| Sprinkler acceptance trips | **BACKBURNER 7b**, Acceptance Testing family | A different standard and a different witness |
| S537 fire-alarm verification | **A prerequisite document** (§9.1 item 17) | It is an input to IST, never IST's own work |
| Repeating measurement structures | **BACKBURNER 3d** | v1 keeps expected/observed text + verdict + **one optional numeric**; per-tap TTR and flow curves are 3d's shape and this must not become the third copy |
| Scenario drafting from the FA I/O matrix | **BACKBURNER 5**, FPT agent | Named in 3e; unchanged |

---

## Proposed phases, each gated

1. **Schema + integrations/protocols CRUD.** Battery green. `pw-ist` from birth
   with wait helpers.
2. **Matrix UI + pre-IST tracking**, including the documentation-register link.
3. **Session field mode** — offline outbox, photos, per-result dates.
4. **Document generation.** **Gate: regenerate a structurally faithful Scarborough
   Gardens plan and report from seeded data.** The real document is the fixture
   standard — section order, the three differently-shaped attachment tables, the
   per-table sign-offs, the tri-state prerequisite matrix, Attachment A blank and
   Attachment B completed. Render-and-look at page boundaries, per the boundary
   gate that now rides the battery.
5. **Team seeding** on classification.

Findings file to the existing register with `origin = 'ist'`, never a parallel
register.

> **CORRECTION, made during phase 1.** This proposal said `'ist'` was *already in
> the origin set*, repeating [BACKBURNER 3e](BACKBURNER.md#3e-the-ist-module--integrated-systems-testing-parked-whole).
> **It was not.** The enum held `site_visit, ivc, pfc, fpt`, later joined by
> `design_review` and `startup`. The phase-1 migration's first draft *asserted*
> the value's presence and refused to run, which is the only reason the claim was
> checked before a deficiency tried to use it — and a deficiency is raised in the
> field, mid-test, where a failed insert is the worst possible time to discover a
> missing enum label. The migration now adds the value and then re-asserts it,
> because `ADD VALUE IF NOT EXISTS` is silent when it is a no-op.

---

## What needs a ruling

1. **AHJ seats in the team matrix** — seed Building Department / Fire Department /
   ESA as contact seats, or restrict the matrix to parties who perform work?
   *(Recommendation: seed them; §3.2 prints them.)*
2. **`ist_notes` as a table** vs a note column — the B-3 case argues for the table.
   *(Recommendation: table.)*
3. **Plan and report as one generator or two.** They share ~80% of their content;
   the report is the plan plus Attachment B plus the collected documentation.
   *(Recommendation: one generator, two modes — the checklist engine's precedent.)*
4. **Does the module own the retest schedule as a deliverable?** §11 plus the
   1-year/5-year cycle plus O. Reg. 87/25 make this a live obligation with a date.
   Deliverables already model dated obligations. *(Recommendation: yes — emit the
   one-year and five-year retests as deliverable rows on issue.)*
5. **Phase order** — is team seeding last, or does it ride phase 1 so the first
   real project can populate contacts while the rest is built?

---

## One observation on the source document, offered as a courtesy

Reading it closely for structure surfaced a few things the firm may want to know,
because **a generated document would not reproduce them**:

- **`"the Fire Alarm System. system,"`** appears roughly eight times through §4
  and the attachment table headers — a find-and-replace scar where *"Fire Alarm
  system"* was expanded to *"Fire Alarm System."* mid-sentence.
- **`CAN/ULC-1001-11`** is used in the Executive Summary and §3; the standard is
  **CAN/ULC-S1001**. The `S` is missing in those instances and present elsewhere.
- **§2** describes the project as *"the construction of the Ice Ring"* — Rink.
- **§9.2's** heading is *Documentation for Pre-Completed Test Results* while §9's
  own heading is *PRE-TESTING OCCUPANCIES*, which reads oddly against §8
  *PHASED OCCUPANCIES*; the section is about documentation, not occupancy.

None of these affect the testing or the results. They are exactly the class of
thing that disappears when a document is **generated from structured data rather
than copy-edited from the last project** — which is, in one line, the argument for
this module.

---

## Sources

- [UL Standards — ULC 1001, Integrated Systems Testing of Fire Protection and Life Safety Systems](https://www.shopulstandards.com/ProductDetail.aspx?UniqueKey=36229) — current edition status
- [UL Canada Certification Bulletin 2020-08 — ULC-S1001](https://canada.ul.com/wp-content/uploads/sites/11/2020/05/Certification-Bulletin-2020-08ENG-ULC-S1001.pdf)
- [EGBC — Considerations for the Integrated Systems Testing of Fire Protection and Life Safety Systems](https://tools.egbc.ca/practice-resources/individual-practice/guidelines-advisories/document/01525amw7fixwip5aukzejg3j5ffbn5qgf/considerations%20for%20the%20integrated%20systems%20testing%20of%20fire%20protection%20and%20life%20safety%20systems) — ITC role and duties
- [Alberta Municipal Affairs STANDATA 23-BCI-014 — Integrated Testing Coordinator](https://open.alberta.ca/dataset/cb3d1662-1354-45c8-aab8-29b91f2a6c35/resource/7342f4c1-5c7f-4aee-901e-3388d5464cfc/download/ma-standata-interpretation-building-23-bci-014-2025-03.pdf) — ITC qualification
- [OBOA Building Code Advisory — Qualifications for ULC-S1001 Integrated Systems Testing](https://bcas.oboa.on.ca/support/solutions/articles/70000681078-qualifications-for-ulc-s1001-integrated-systems-testing) — Ontario position
- [Alberta STANDATA 19-BCB-008 — CAN/ULC-S1001 Integrated System Testing Report Sample](https://open.alberta.ca/dataset/6d43297f-e0ab-4ffa-beaa-173af41f1d8e/resource/8b758aa8-b87d-4e31-b55e-1f1b1058852b/download/ma-standata-joint-bulletin-19-bcb-008-19-fcb-008.pdf) — Appendix C report structure
- [City of Markham Builder Tip No. 100 — Testing of Integrated Fire Protection and Life Safety Systems](https://www.markham.ca/sites/default/files/2024-12/Builder%20Tip%20No.%20100%20-%20Testing%20of%20Integrated%20Fire%20Protection%20And%20Life%20Safety%20Systems.pdf) — OBC 3.2.10.1, retest cycle
- [City of London — Integrated Systems Testing Permit Submission Guide](https://london.ca/sites/default/files/2026-03/Integrated%20Systems%20Testing.pdf) — Ontario AHJ submission practice
- [Halton Hills — Integrated System Testing Requirements](https://www.haltonhills.ca/en/residents/resources/Documents/Integrated%20System%20Testing%20Halton%20Hills.pdf)
- [OAA — Requirements for Integrated System Testing: Get to Know CAN/ULC-S1001](https://oaa.on.ca/whats-on/news-and-insights/news-and-insights-detail/Requirement-for-Integrated-System-Testing--Get-to-Know-CAN-ULC-S1001)
- [OCAPPA — Integrated Systems Testing, OFC changes 1 January 2026](https://www.ocappa.ca/topic/intergrated-systems-testing-can-ulc-s1001-ofc-changes-jan-1-2026/) — O. Reg. 87/25
- [Trace Consulting Group — Understanding the Ontario Fire Code 2026 Changes](https://www.traceconsultinggroup.com/understanding-the-ontario-fire-code-2026-changes-what-property-managers-need-to-know/) — retroactive obligation scope
- [H.H. Angus — New Requirements for Testing Integrated Fire Protection and Life Safety Systems](https://hhangus.com/testing-integrated-fire-protection-and-life-safety-systems/) — scope: interconnections, not individual systems

*Prior research, not repeated here:* [IST-CATALOG-ADDENDUM.md](IST-CATALOG-ADDENDUM.md) § Sources.
