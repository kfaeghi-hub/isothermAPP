# Seneca 257889 — Health & Wellness Center · Project Backfill

**Status: PHASE 1 COMPLETE — AWAITING RULING. Nothing written, nothing imported.**

Backfill of the Seneca project from its existing ShareSync documents, so the job
runs live in the software from here forward.

| | |
|---|---|
| Source | `…\My ShareSync\Seneca 257889_Health and Wellness Center Cx` |
| Target project | `Seneca Health and Wellness Center` · COM 257889 · `a0a6791f` |
| Target state at inventory | **empty** — 0 findings, 0 equipment, 0 team, 0 phases, 0 meetings, 0 site reports |
| Phase 1 performed | 2026-07-27 |

This document follows the `CSA-SEEDING-LOG` precedent: it records **structure,
names, counts and outcomes — never document content**. Working copies live in
gitignored `samples/seneca-import/`.

## Read-only compliance

The ShareSync folder is strictly read-only and was never opened for write.

- `git check-ignore -v` run **before** any copy: `samples/` matches `.gitignore:37`,
  covering `samples/seneca-import/` and files beneath it.
- Copy-out is one-way: 15 structured files + 33 equipment schedules read from
  ShareSync, written only to `samples/seneca-import/`.
- Post-copy sweep for any source file modified in the preceding 10 minutes
  returned **empty** — no source file was touched.
- All parsing is pure-stdlib `zipfile`/`ElementTree` against the working copies.
  No Office automation, which could write to the source or leave lock files.

---

## 1 · Corpus shape

197 files across 74 folders. **34 folders are empty**, and which ones is the
substance of this inventory.

| Format | Count |
|---|---|
| PDF | 105 |
| XLSX | 41 |
| DOCX | 34 |
| PNG / JPG | 8 / 5 |
| XLSM | 2 |
| DOC / WBK | 1 / 1 |

Empty folders of consequence: `App_A`–`App_M` (12 Cx Plan appendix folders),
`5.Reports\4.SiteR`, `3.IVCs_Start-Ups\1.IVCs`, `2.Contractor_Provided\{FAT,Startups}`,
`8.Training`, `7.Syst_Mnl`, `1.OPR_BOD`, `5.Reports\2.DrawR`.

## 2 · Five findings that precede the mapping

### 2.1 There is no issues log

`CxPlan-Appen\App_G-IssuesLog` is empty and no issues-log file exists anywhere in
the tree. The nearest equivalent is the design-review series:

| Document | Items | Sections |
|---|---|---|
| `Isotherm_DesignReview_…DocRevN#3.2.docx` (2025-09-25) | 126 numbered, **125 distinct** (1 duplicate in §2) | §1 General/LEED/NZE 3 · §2 HVAC/Plumbing 73 · §3 Electrical 8 · §4 M&E Specs 5 · §5 Envelope BECx 37 |
| `…DocRevN#MASTER_BECx…LEED….docx` | 54 | §5's 37 items duplicate the above |

Numbering is `section.item`, sequential, **no gaps**. These are *design-review
comments*, not construction deficiencies — whether they become findings is a
ruling (D4), not a mapping.

### 2.2 The Cx Index status matrix is 99% empty, and status is COLOUR not text

A value scan of the stage columns returns **zero** populated cells. Status is
encoded as cell fill — a value scan alone would have reported "no status data"
and been wrong. Reading `styles.xml`:

| Fill | Cells | Reading |
|---|---|---|
| `FF00B050` green | 379 | `IFC Drawings/Specifications` — genuine, across 379 distinct rows |
| `FF00B050` green | 5 | `Shop Dwgs` — genuine |
| `FFFFC000` amber | 62 | **all on row 433**, a divider labelled "SYSTEM-BASED REQUIREMENTS", no tag → **formatting, excluded** |

Importable matrix: **384 cells across 2 of the app's 55 columns.** Not a
populated index.

### 2.3 Two competing index files — and it is not close

The app's 12 default stage groups appear to have been derived from the live
master schedule:

| Candidate | Dated | Tags | App default columns matched |
|---|---|---|---|
| `9. Cx Index\Master_…Cx_Master Schedule.xlsx` | 2026-05-28 | 388 | **42 / 55** |
| `CxPlan-Appen\Cx-Index.xlsx` (tender appendix) | 2025-09-08 | 274 | 6 / 55 |

Overlap, normalised: 251 in both · 137 only in the master · 23 only in the tender
appendix. The tender file carries an older 5-stage-group model and **no coloured
status cells at all**.

### 2.4 Contamination in two source files

- `Master_…Cx_Master Schedule.xlsx` sheet `Cover_Page House` reads
  **"Project: ToN Mulock House / IEL Project# 247790"** — cloned from the Mulock
  job, never updated.
- `IELCxPlan257889_…Issued For Tender.pdf` embedded `/Title` is
  **"Seneca Building E Isolation"**.

Neither affects extraction; both matter for the branding rule and for trusting
a file's own self-description.

### 2.5 Tag-format drift, and non-equipment in the equipment column

**15 pairs** differ between sources for the same unit — `CHW-P-01` (live) vs
`CHWP-01` (tender); likewise `HW-P-01…05`, `DCW-P-01`. A naive two-source import
creates duplicate equipment.

Separately, of 418 populated rows in the master schedule's tag column
(410 distinct): **~364 are tag-shaped (356 distinct)** and **54 are prose** —
"Arc-Flash Hazard Analysis Report", "Cable Testing Report LV", "ATS Functional
Test Report". Deliverables sitting in the tag column. *(The shape heuristic
requires a digit, so it under-counts letter-only tags such as `ATS-GEB`; the 54
need eyes, not a regex.)*

---

## 3 · Inventory

| Source | → Entity | Proposed action | Confidence | Q |
|---|---|---|---|---|
| `Master_…Cx_Master Schedule.xlsx` › `Equip.List` | equipment + Cx Index | **Import** — 418 rows → ~364 tag-shaped, 54 manual triage | High struct / Med triage | D1 |
| ↳ same, fill colours | `cx_cell_values` | Import 384 `done`; exclude row 433 | High | D2 |
| `Cx-Index.xlsx` (tender appendix) | — | **Reference only** — superseded snapshot | High | D1 |
| `257889-…Master_Equip_List.xlsm` › `Equipment` | equipment nameplate | Enrich 83 distinct tags (128 rows, doubled per unit) | Medium | D3 |
| `257889-…ELEC_Equip_List.xlsm` | — | **Skip — empty template.** 1 cell, value `x`, 2024-06-14 | High | — |
| `EQU-schedules\*.xlsx` (33 files) | equipment nameplate | 539 data rows, performance/nameplate | Medium — multi-row headers | D3 |
| `Isotherm_DesignReview_…DocRevN#3.2.docx` | findings? | 125 items — **no valid `origin` exists** | High extract / — map | **D4** |
| `…DocRevN#MASTER_BECx…LEED….docx` | — | 54 items; §5 duplicates #3.2 | High | D4 |
| `IELCxPlan257889_…Issued For Tender.pdf` | `cx_plans` | 30 pp, created 2025-09-08 | High | **D5** |
| `…Issued For Tender.wbk` | — | **Skip** — Word autosave backup, not a document | High | — |
| `Isotherm257889-…CxMeetingMASTER.docx` | team + meetings | 19 people / 5 orgs; 17-row item table | High | D6 |
| `…CxMeetingMin#1_2025-07-02.pdf` | meetings | 1 issued minute | Medium — PDF | D6 |
| `meetings_tracker.xlsx` | — | **QUARANTINE — commercial.** Hours and rates | High | — |
| `AHU` / `ATS Construction Checklist.*` | — | **Reference only** — blank samples ("Tag: Sample AHUs") | High | — |
| `Seneca HWC - ME Submittal Log by spec.xlsx` | `documentation_register` | 95 rows (54 mech + 41 elec), dated, status-coded | High | D7 |
| `5.Reports\3.SDR\*.pdf` (5 revisions) | `documentation_register` | Submittal review reports | High | D7 |
| `HWC_Cx_Key_Systems_Tracking….xlsx` | — | 17 rows spec-coverage; no matching app entity | Medium | D7 |
| `Seneca…_IST_REV10.docx` | `documentation_register` | IST plan rev 10 | High | D7 |
| Specs / drawings / shop drawings (~95 PDFs) | attach or leave | Bulk building documents | High | D7 |
| `5.Reports\1.DocR\Linkedin.docx` (4.1 MB) | — | **QUARANTINE — misfiled** | High | — |
| `5.Reports\4.SiteR` | site_reports | **EMPTY — nothing to import** | — | — |
| `3.IVCs_Start-Ups\1.IVCs` | checklist instances | **EMPTY — no filled IVCs** | — | — |
| `8.Training`, `7.Syst_Mnl`, `App_A`–`App_M` | — | **EMPTY** (12 appendix folders) | — | — |

---

## 4 · Finding-number continuity

`findings.number` is **`text`**, constrained `UNIQUE (project_id, number)`, and
assigned by `auto_set_finding_number()`:

```sql
IF NEW.number IS NULL THEN
  SELECT COALESCE(MAX(CASE WHEN number ~ '^\d+$' THEN number::integer END), 0) + 1 …
```

Two properties decide the approach: **a supplied number is preserved untouched**,
and **auto-numbering only counts pure-integer numbers** — anything dotted or
prefixed is invisible to the `MAX`.

| Option | App's next auto-number | Cost |
|---|---|---|
| Import as `2.14` | **1** | Two numbering universes, created by accident — imported `1.1` sits beside app `1` |
| Import as flat `1…125` | 126 | Continuity honest, original identifiers lost |
| **Import as `DR-2.14`** | **1** | Originals preserved exactly; app's construction sequence starts clean at 1; collision impossible; reversible |

**Recommended: `DR-` prefix.** These are pre-app design-review comments; letting
them consume the construction-finding sequence would misrepresent both registers.

---

## 5 · Two blockers for Phase 3 as specified

### 5.1 Provenance has nowhere to live

There is **no `import_batches` table and no `import_batch_id` / `source_file`
column anywhere** in the 69-table schema. The requirement that a bad import be
"identifiable and removable by id, never by pattern" needs a schema delta first:
a batch table plus a nullable FK on each imported entity. That is a schema
change, so under the standing rule it ships with its doc updates in the same
commit series.

### 5.2 `finding_origin_enum` has no design-review value

Current values: `site_visit`, `ivc`, `pfc`, `fpt`. The 125 review items cannot be
imported honestly without adding one. Ruling D4 decides whether that migration is
needed at all.

---

## 6 · Directory reconciliation

Roster from `CxMeetingMASTER.docx`: 33 attendee rows → **19 named people, 5
organisations** (Bird 6 · Dialog 6 · Seneca 4 · IEL 2 · BuildingBio 1).
Directory holds 147 companies / 262 contacts.

- **5 of 19 match the directory exactly.**
- **14 have no match.** Every one was checked for near-matches: all 21 candidates
  are first-name collisions (e.g. `Jeff Halashewski` vs `Jeff LeBold`). **No real
  duplicates** — creating them would not double-enter anyone.

Three ambiguities for the ruling:

| Ambiguity | Detail |
|---|---|
| **Bird** | Directory splits `Bird Construction` (1 contact) and `Bird Mechanical` (5); roster says only "Bird" |
| **Isotherm** | Directory splits `Isotherm Commissioning Ltd.` (1) and `Isotherm Engineering LTD.` (7, IEL); roster's IEL people sit under **Engineering** |
| **Seneca** | Source uses `senecapolytechnic.ca`; directory carries pre-rename `Seneca College of Applied Arts & Technology` |

**Unrelated data point:** the app's project address reads `750 Finch Ave E`;
every source document says `1750 Finch Avenue East`.

---

## 7 · Decisions required (Phase 2)

| # | Decision |
|---|---|
| **D1** | Index source — live master schedule alone, or merge the tender appendix's 23 unique tags? (Merging imports the hyphenation drift of §2.5.) |
| **D2** | Import the 384 `done` cells knowing 379 are a single column, or start the index blank? |
| **D3** | Nameplate enrichment from the `.xlsm` + 33 schedules, or tags/locations only for now? |
| **D4** | The 125 review items — findings with a new `design_review` origin · `documentation_register` entries · or attach the document and skip? Drives whether §5.2's migration happens. |
| **D5** | Cx Plan — issued `cx_plans` row with the PDF attached, or historical document reference? Rule 4 says the app must never claim to have generated it; **lean: reference-with-attachment** unless it should sit in the revision chain. |
| **D6** | Create the 14 missing contacts, or assign team from existing directory entries only? |
| **D7** | Which document classes register vs. merely attach vs. stay in ShareSync. |

---

## 8 · Phase 2 — Ruling

Ruled 2026-07-27.

| # | Ruling |
|---|---|
| **D1** | Live master schedule alone. The tender's 23 unique tags are **recorded, not imported** (§8.1). |
| **D2** | Import the 384 `done` cells. Row-433 exclusion confirmed. |
| **D3** | Tags / types / locations now. **Nameplate deferred.** |
| **D4** | Findings with a new `design_review` origin, `DR-` prefix, status from the document's own response state. Gate: report the split first; stop if the document carries none. |
| **D5** | Issued `cx_plans` row, PDF attached, label "Issued for Tender", snapshot **null**, batch-tagged. Chain continuity wins — the composer's next revision is Rev 1 of real history. |
| **D6** | Create the 14 (batch-tagged). Bird resolved per person by role in the minutes; IEL people under `Isotherm Engineering LTD.`; rename the directory company to **Seneca Polytechnic** (real-world correction, keep the abbreviation). |
| **D7** | Submittal log + SDRs + IST → documentation register with files attached. Key-Systems reference-only. Drawings/specs stay in ShareSync. Meeting #1 imports with PDF attached and its item table as items. |
| — | Fix the project address to **1750 Finch Avenue East**; note it in the batch. |

### 8.1 · D1 — the 23 tags recorded, not imported

Present in the tender appendix and absent from the live master schedule. Recorded
here so the decision is auditable and reversible:

`EHT-01` · `EHT-02` · `HU-AHU6` · `HU-DOAS2` · `HWT-01` · `JP-01` · `KEF-1` ·
`R-1` · `R-2` · `R-3` and 13 further fan-coil/terminal tags. If any of these turn
out to be live equipment, they are added in the app by hand — not by a second
import pass, which would reintroduce the hyphenation drift of §2.5.

### 8.2 · D4 gate — the split, measured before writing

**The gate passes: the document does carry response state.** Measured against the
document's own closure convention (the literal phrase *"Item closed"*), not
generic keywords — a first pass with keyword matching returned 24/6/86, which was
an artefact of the heuristic, not the document.

The response sits in a **separate table row** below each numbered item (first
cell empty), so a check against the item row's own text sees almost nothing —
that read gave 3 of 126 and would have failed the gate wrongly.

| State | Items | Basis |
|---|---|---|
| **Closed** | **9** | Carries *"Item closed"* — §1×1, §2×4, §3×2, §4×2 |
| Open — responded, no closure marker | 40 | Engineer/Architect replied; item not closed |
| Open — comment label present, no reply | 77 | *"Engineer's Comment:"* with nothing after it |
| **Open total** | **117** | |

126 rows → **125 distinct** (one duplicate number in §2).

**§5 Envelope BECx (37 items) carries zero closures** — every BECx item imports
open. Worth knowing before the register is read as a work backlog.

### 8.3 · D6 — Bird cannot be split by the minutes

**The ruling's mechanism is not available in the source.** The attendee table has
three populated columns — name, company, email — and the remaining two are
ballot-box glyphs for present/virtual attendance. **There is no role or title
column, for any attendee.** The meeting item table attributes actions to
*companies* ("Bird", "Isotherm", "Isotherm + DIALOG"), never to individuals.

So all 6 Bird people are recorded identically: company `Bird`, `@bird.ca`.
Evidence available for the split:

- Item **5.7** — *"the CM, M&E, BAS and TAB contractors…"*, action **Bird** —
  positions Bird as the **CM** on this project, i.e. Bird Construction.
- The directory's `Bird Mechanical` contacts are all estimating/site staff
  (VP Estimating, Estimator, Estimating Coordinator, PM, Sitesuper) — a bid-phase
  roster, not the construction-phase team in these minutes.
- All 6 share one domain; none of the 6 exists in either directory company.

**Recommendation: all 6 → `Bird Construction`.** Flagged rather than guessed,
per quarantine discipline. Stage 2 holds until ruled.

**RULED 2026-07-27: all 6 → `Bird Construction`.** The three pieces of evidence
above settle it — item 5.7 seating Bird as CM, `Bird Mechanical`'s directory
roster being bid-phase estimating staff rather than the construction-phase team,
and the single clean `@bird.ca` domain. Recorded in the batch note so the basis
travels with the rows rather than living only here.

Consequence carried forward: because the minutes carry no role or title,
**`contacts.trade` is NULL for all 14**. That is the honest state — a plausible
title inferred from a company would be indistinguishable from a recorded one.

---

## 9 · Phase 3 — EXECUTED appendix

Import order: **schema → directory/team → equipment → index cells → DR- findings
→ meeting → documentation register → cx_plans row → address.** One entity type
per commit-and-verify step, counts reconciled against §3, spot-checked in the UI
between stages.

### Stage 1 — schema + docs · **COMPLETE** 2026-07-27

Migration `migrations/import-provenance-migration.sql`, applied as
`import_provenance` and `finding_origin_design_review`.

| Verified | Result |
|---|---|
| Tables carrying `import_batch_id` | 9 — contacts, project_team_assignments, equipment, cx_cell_values, findings, meetings, meeting_items, documentation_register, cx_plans |
| FK delete rule on all 9 | `r` (RESTRICT) |
| `finding_origin_enum` | site_visit, ivc, pfc, fpt, **design_review** |
| RLS on `import_batches` | enabled · imp_select / imp_insert / imp_update / imp_delete |

**Mechanism proven, not assumed** (ZZ-TEST — Do Not Use, self-cleaning):

| Proof | Result |
|---|---|
| RESTRICT blocked the orphaning delete | **true** |
| Batch removable after its rows are gone | **true** |
| Residual probe rows / batches | **0 / 0** |

Found en route: `equipment.kind` is **NOT NULL** with no default (existing rows
all use `'equipment'`) — Stage 3 must supply it.

### Stage 2 — directory / team · **COMPLETE** 2026-07-27

Two batches, because contacts and team assignments are different entity types and
a batch that spans entities cannot be rolled back cleanly.

| Batch | Entity | Expected | Created |
|---|---|---|---|
| `contacts` | `contacts` + `contact_emails` | 14 | **14** (+14 emails) |
| `project_team_assignments` | company seats | 5 | **5** |

Both sourced from `…/Minutes/Isotherm257889-SenecaH&WCenter-CxMeetingMASTER.docx`
(attendee table, 2025-09-17).

**Company rename (D6):** `Seneca College of Applied Arts & Technology` →
**`Seneca Polytechnic`**. The abbreviation was **NULL** — there was none to keep,
so "keep the abbreviation" is satisfied vacuously and recorded as such rather
than reported as done.

**Team seats:**

| Company | Role |
|---|---|
| Isotherm Engineering LTD. | CxA |
| Seneca Polytechnic | Client/Owner |
| Bird Construction | General/Main Contractor |
| DIALOG | Architect |
| BuildingBio (Envelope Commissioning) | Envelope Cx Provider |

`Client/Owner` follows the established convention (×3 across existing projects,
versus the unused `Client`/`Owner` split). **DIALOG seated as `Architect` is a
narrowing** — it is the prime consultant across disciplines (files are
`DLG-A-S-M-E`) and one assignment row takes one `role_type_id`. Flagged in the
batch note, not silently decided.

**Verification:**

| Check | Result |
|---|---|
| Roster resolution | **19 of 19** now resolve to a directory contact |
| Idempotency — identical re-run | **0 contacts, 0 emails, 0 assignments** added |
| Reconciliation | 14/14 · 5/5, `rows_expected` = `rows_created` on both batches |
| Batch coverage | 14 of 14 contacts and 5 of 5 seats carry `import_batch_id` |
| Blast radius | **0** batch-tagged rows in any other project |

**Observed, not acted on:** the directory carries a pre-existing duplicate,
`Dave Gillingham` under both `Cos Theta Solutions Inc.` and `Brosz Group of
Companies` (created 2026-07-24, no batch tag). Not from this import and outside
its scope — noted for directory hygiene.

### Stage 2a — DIALOG amendment · 2026-07-27

Ruled after the stage-2 spot-check: one firm may hold many seats (the Humber plan
seats Ecosystem in five rows), and the composer's team table must render those
seats populated. DIALOG additionally seated as **Mechanical Engineer** and
**Electrical Engineer** — 7 seats total. The team batch's `rows_expected` was
raised 5 → 7 and the amendment appended to its note, rather than left reading 5
against 7 created.

### Stage 3 — equipment · **COMPLETE** 2026-07-27

**367 distinct tags**, from `Equip.List` of the live master schedule.

#### The triage was decided by the document's structure, not by my keywords

My first pass classified rows by a keyword regex (does the text contain "report",
"study", "manual"…). It gave 380 equipment / 38 deliverables — and it was wrong
in a way worth recording, because a keyword rule cannot see a section boundary.

**Row 433 is a hard divider in the sheet: `SYSTEM-BASED REQUIRED REPORTS/…`.**
Below it the columns change meaning — column C holds a *system* name and column D
holds a *report* name — and **0 of the 43 rows below it carry an equipment type**.
The correct rule is structural:

| Region | Rows | Meaning |
|---|---|---|
| Rows 6-432 (above the divider) | 375 → **367 distinct** | Equipment |
| Rows 434-497 (below the divider) | **43** | System-based required reports → documentation-register candidates, **stage 7** |

The two methods disagree on exactly 5 rows — `CCTV`, `Card Readers`,
`Motion/Occupancy Sensors`, `Signages`, `Doors and Doors Hardwares, Overheads etc`
(rows 445-449). They contain no keyword, so the regex kept them as equipment;
they carry **no type, no location, nothing but a row number and a label**, and
they sit directly beneath row 444, *"Security System Startup and Final Report"* —
they are its sub-items. **Structure wins: they are not equipment.** Same lesson as
the fill-colour finding in §2.2 — the document's own structure beats a heuristic
laid over it.

**8 duplicate tags** in the source collapsed to first occurrence: `RP-01`,
`RP-02`, `UH-L1-01`, `UH-L1-02`, `UH-L2-01`, `UH-L3-01`, `UH-L3-02`, `UH-L3-03`.

#### What was written

Per D3, **tags / types / locations only** — `manufacturer`, `model`,
`serial_number` and every electrical field are deliberately NULL rather than
guessed. `kind` supplied as `'equipment'` per the stage-1 NOT NULL finding.

| Field | Coverage |
|---|---|
| `tag` | 367 / 367 |
| `category` (source section header) | 367 / 367 |
| `descriptor` (source column C) | 283 / 367 |
| `location` / `area_served` | 86 / 87 of 367 |
| `equipment_type` mapped to the app enum | 231 of 367 — `fcu` 117, `vav` 55, `pump` 31, `fan` 11, `ahu` 10, `ats` 4, `erv` 2, `generator` 1 |

The remaining 136 are left NULL rather than forced into the nearest enum value.

#### Verification

| Check | Result |
|---|---|
| Equipment on the project | **367** (expected 367) |
| Carrying this batch id | **367 of 367** |
| Equipment without a batch tag | **0** |
| Duplicate tags on the project | **0** |
| Idempotency — identical re-run | `to insert: 0`, all checks still pass |
| Blast radius | Humber 0 · ZZ-TEST 266 · ZZ-TEST-LEED 2 — **0 batch-tagged rows anywhere but Seneca** |

### Write path — a deviation, recorded

The brief rules that Phase 3 writes go **via the normal API as dev.admin**.
Stage 1 was necessarily a migration. **Stage 2 was written as direct SQL, which
was a deviation** — direct SQL runs as service role and bypasses RLS, so it can
in principle create rows the application itself would refuse. The stage-2 rows
were subsequently read back through the API as dev.admin and are visible and
correct, but RLS was not exercised on the write.

**From stage 3 onward the importer is `seneca-import.mjs`**, which signs in with
`supabase-js` as dev.admin and writes through the same client the app uses, so
every write is subject to the same policies as a human doing it by hand.

It carries **an inverted guard**: `pw-config` forbids touching anything except
ZZ-TEST, whereas this script deliberately writes to a real client project, so it
refuses to run against any project whose `com_number` does not resolve to the
expected name. Proven, not assumed — pointed at Humber (`257882`) it refuses:

> `REFUSING: com_number 257882 resolved to "Humber College New Mechanical RM Cx",
> expected "Seneca Health and Wellness Center".`

### Stage 4 — Cx Index cells · **COMPLETE** 2026-07-27

**372 cells**, all `done`, into 2 of the project's 88 columns. Sparse by design.

#### Reconciliation — 384 raw is not 372 written

| Step | Count |
|---|---|
| Green (`FF00B050`) cells above the divider | **384** |
| less: greens on rows carrying no tag in column D | −4 |
| less: greens on the 8 duplicate source tags collapsed in stage 3 | −8 |
| **written** | **372** |

Greens found **below** row 433: **0** — the row-433 exclusion holds without
needing to be applied. The 62 amber cells all sit on row 433 itself, a
`SYSTEM-BASED REQUIRED REPORTS` divider with no tag, so **no `in_progress` cell
was imported at all** and the check asserting "0 cells with a status other than
done" is the proof.

| Column | Cells |
|---|---|
| `IFC Drawings / Specifications` | 367 |
| `Shop Dwgs` | 5 |

The project's index structure (12 stage groups, 88 columns) was already
materialized from the firm defaults, so the importer resolves columns by label
rather than creating any — the grid is identical to one initialized in the UI.

| Check | Result |
|---|---|
| Cells on the project | **372** (expected 372) |
| Batch coverage | 372 of 372 |
| Tags / columns unresolved | **0 / 0** |
| Status other than `done` | **0** |
| Populated columns | **2 of 88** |
| Idempotency | `UNIQUE (equipment_id, column_id)` + upsert — re-run holds at 372 |

### Stage 5 — design-review findings · **COMPLETE** 2026-07-27

**126 findings**, origin `design_review`, `DR-` prefixed. **9 closed / 117 open**,
matching the measured split in §8.2 exactly.

| Category (the document's own sections) | Items |
|---|---|
| HVAC / Plumbing | 73 |
| Envelope Commissioning (BECx) | 37 |
| Electrical Systems | 8 |
| M&E Specifications | 5 |
| General, LEED v4 & Net-Zero Energy | 3 |

Categories preserve the review document's own taxonomy rather than being forced
into `project_trades` — three of the five sections have no trade equivalent, and
mapping the other two while inventing three would make the register's structure
look like a trade breakdown it is not. Adjustable if trade filtering is wanted.

#### The prefix is load-bearing, and it was proven

`auto_set_finding_number()` takes `MAX` over numbers matching `^\d+$` only, so
`DR-` numbers are invisible to it. Verified by running **the trigger's own
expression against live Seneca data** — a read, no write, no test row in a real
project:

> `next_app_created_finding_number = 1` · `numeric_numbers_present = 0`

The project's own construction findings will start at **#1**, with the 126
design-review items sitting in a visibly separate register. No collision is
possible, and the import is fully reversible by batch id.

#### Dates — carried where the document carried them, NULL where it did not

- `date_raised` = **2025-09-24** (the document's revision date) for all 126.
  Individual items carry no raise date; one honest uniform date beats 126
  invented ones.
- `date_closed` set on **5 of 9** closed items, from the date on the closing
  response. The other **4 are NULL** — the source closed them without a date.
  `trg_finding_close_date` is **BEFORE UPDATE only**, so the insert did not stamp
  `CURRENT_DATE`; asserted explicitly (`closed findings stamped with today's
  date: 0`).
- 49 of 126 carry a recorded response in `corrective_action`.

#### A source defect preserved rather than smoothed

Item **2.63 appears twice**, carrying two genuinely different comments — IST
questions, and M9.01 equipment-schedule outdoor-air requirements. Collapsing to
125 would have silently dropped a real review comment. Both are imported; the
second is **`DR-2.63b`**, so the source number stays legible and the suffix marks
the disambiguation rather than hiding it.

| Check | Result |
|---|---|
| Findings on the project | **126** (expected 126) |
| Batch coverage | 126 of 126 |
| Status split | **9 closed / 117 open** |
| Not marked `design_review` | **0** |
| Numeric numbers consumed | **0** — next app finding is #1 |
| Closed findings stamped today | **0** |

### Stage 3b — the AIR HANDLING UNIT category split · **COMPLETE** 2026-07-27

**Amends C5 for this block only.** The source carries ONE header, `AIR HANDLING
UNIT` at row 88, spanning rows 89-296 — **13 equipment families under one label**,
because the source never sub-headered them. Only 5 of the 194 rows are AHUs.

Every new category name comes from the source's **own words** — its column C, its
other section headers, or the title of the matching equipment schedule:

| New category | Rows | Source evidence |
|---|---|---|
| FAN COIL UNIT | 113 | column C: "FAN COIL UNIT" |
| VAV BOX | 55 | column C: "VAV BOX" (TBS + TBE) |
| EXHAUST FAN | 6 | tag convention; already typed `fan` |
| UNIT HEATER | 6 | tag convention; source headers "STANDALONE PROPELLER UNIT HEATER" separately |
| TRENCH FAN COIL UNIT | 3 | `TFCUs.xlsx` — "TRENCH FAN COIL UNIT SCHEDULE" |
| VERTICAL FAN COIL UNIT | 1 | `VFCU.xlsx` — "VERTICAL FAN COIL SCHEDULE" |
| HYDRONIC ELECTRIC BOILER | 1 | `Elec-Boiler.xlsx` — "HYDRONIC ELECTRIC BOILER SCHEDULE" (PRECISION PCW3-304) |
| HYDRAULIC SEPARATOR | 1 | column C: "HYDRAULIC SEPARATOR" |
| CEILING FAN | 1 | tag convention; source names "CEILING FANS" in the tender index |
| **AIR HANDLING UNIT** (retained) | **5** | AHU-1…5 — the real ones |

Two type corrections the schedules settled: **BE-01 → `boiler`**, **CF-1 → `fan`**.

**Unresolved, held rather than guessed: `DBF-1` and `DBF-2`** (locations
"WOMEN'S REC CHN ROOM", "EQ. STORAGE"). They appear in **no** equipment schedule
and carry no descriptor, so they stay under AIR HANDLING UNIT until identified —
which is why that category reads 7, not 5.

Queued for ratification rather than minted: **Unit Heater** (6), **Hydraulic
Separator** (1), **DBF — unidentified** (2).

### Stage 4b — shop drawings: RECEIVED vs REVIEWED · **COMPLETE** 2026-07-27

A new **`SDR`** column under Doc Review Stage. Two columns now carry two
different facts:

- **`Shop Dwgs`** — the submittal was **received**
- **`SDR`** — **Isotherm has reviewed it**

**The evidence is the 4_Shops filename convention:** a package filed without
`-IEL` is the contractor's submission; the `-IEL` copy is Isotherm's marked-up
review. Corroborated by the SDR reports in `5.Reports/3.SDR` (which *are* the
review for AHU/DOAS, RAF and pumps) and the submittal log's `CLS` status.

**The master schedule's 5 green Shop-Dwgs cells were a stale snapshot** — they
marked only AHU-1…5, while **14 packages** have since been received and reviewed.

| Package | Received | Isotherm review | Tags |
|---|---|---|---|
| 20 30 00 Hydronic Pumps | 2026-06-25 | 2026-06-29 | 28 |
| 26 12 17 Dry-Type Transformers | 2026-05-08 | 2026-05-14 | 19 |
| 20 13 13 Expansion + Buffer Tanks | 2026-06-25 | 2026-07-13 | 10 |
| 23 73 23 AHU & DOAS | 2025-11-14 | 2025-11-14 | 7 |
| 23 57 13 Heat Exchangers | 2026-07-15 | 2026-07-15 | 5 |
| 23 34 00-2.0 Return Air Fans | 2026-07-13 | 2026-07-15 | 5 |
| 23 05 17.13 Air Separator | 2026-06-25 | 2026-06-29 | 3 |
| 23 36 00 Trench Fan Coil Units | 2026-06-17 | 2026-06-19 | 3 |
| 26 36 23 Automatic Transfer Switches | 2026-06-23 | 2026-06-24 | 3 |
| 26 36 23-01 Manual TS & Gen Connection | 2026-05-13 | 2026-05-20 | 2 |
| 26 23 00 Switchgear | 2026-04-24 | 2026-05-04 | 2 |
| 26 24 13 Electrical Switchboard | 2026-06-17 | 2026-06-19 | 2 |
| 26 29 19 PV System Disconnect | 2026-05-22 | 2026-05-25 | 1 |
| **total** | | | **90 tags → 180 cells** |

Each cell carries its package and date in `notes`.

**Not written — flagged as ambiguous:**

| Package | Why |
|---|---|
| Panelboards 26 24 16 | Could be the 26 receptacle, 7 lighting or 5 distribution panels. The package does not say and no SD log names tags. |
| VFDs 23 92 49 | No VFD tags in the register — they are integral to pumps/fans. |
| Metering 26 27 13 / 26 27 16 | Two reviewed packages, one metering tag. |
| PV System 48 14 00 | Panels/inverters/racking are not register tags. |

### Stage 3c — ELECTRICAL and PUMPS split · **COMPLETE** 2026-07-27

Same rule as the AHU split, applied to the other two headers hiding many classes.
**ELECTRICAL** was 71 rows across 58 tag families; **PUMPS** 43 rows across 15.

**ELECTRICAL splits on the descriptor the source already carried:**

| New category | Rows | | New category | Rows |
|---|---|---|---|---|
| RECEPTACLE PANEL | 26 | | UTILITY TRANSFORMER | 1 |
| DRY-TYPE TRANSFORMER | 19 | | METERING SYSTEM | 1 |
| LIGHTING PANEL | 7 | | PV DISCONNECT | 1 |
| DISTRIBUTION PANEL | 5 | | LOAD BANK PANEL | 1 |
| TRANSFER SWITCH | 5 | | GENERATOR | 1 |
| SWITCHGEAR / SWITCHBOARD | 2 / 2 | | | |

**A rating is not a category.** The source reads `Transformer (30 kVA)`,
`(45 kVA)`, `(75 kVA)`, `(112.5 kVA)` — all 19 become **DRY-TYPE TRANSFORMER**
with the rating left in `descriptor` as nameplate detail. **UTILITY TRANSFORMER
stays separate**: utility-owned, different scope, and the source names it
distinctly.

**PUMPS splits on the title of the schedule each tag appears in** — its rows
carry almost no descriptor, so the schedules are the evidence:

| New category | Rows | Source schedule |
|---|---|---|
| VENTILATION AIR UNIT | 2 | `DOAS-2.xlsx` — "VENTILATION AIR UNIT SCHEDULE" |
| SUMP PUMP | 1 | `SumpP.xlsx` — "SUMP PUMP SCHEDULE" |
| NATURAL GAS BOILER | 1 | `NG-Boiler.xlsx` — "NATURAL GAS BOILER SCHEDULE" |
| FLUID COOLER | 1 | `FLC.xlsx` — "FLUID COOLER SCHEDULE" |
| WATER TO WATER HEAT PUMP | 1 | `W-W_HPs.xlsx` — "WATER TO WATER HEAT PUMP SCHEDULE" |
| **PUMPS** (retained) | **30** | `Pumps.xlsx` — "PUMP SCHEDULE" |

**ONE SCHEDULE = ONE CATEGORY**, applied consistently — that is what stops the
split becoming taste. `Pumps.xlsx` covers CHW/HW/GEO/GLY/DHWR/DCW/FSP as a single
schedule, so they stay one category; `SumpP.xlsx` is its own schedule, so a sump
pump is its own category.

Two more types settled by the schedules: **BG-01 → `boiler`**, **FSP-01 → `pump`**
(it is in the pump schedule).

**Unresolved, left under PUMPS: `RHC` (3), `GI` (2), `PRV-NG` (2)** — no schedule,
no descriptor. Flagged, not guessed. PUMPS therefore reads 37, not 30.

The register now spans **40 categories**, up from 14. ELECTRICAL is fully
resolved (0 rows remain).

### Ratification queue — 16 proposals awaiting your ruling

| Observed | Rows | | Observed | Rows |
|---|---|---|---|---|
| Dry-Type Transformer | 19 | | Switchboard | 2 |
| Lighting Panel | 7 | | Unit Heater | 6 |
| Distribution Panel | 5 | | DBF (unidentified) | 2 |
| Switchgear | 2 | | Hydraulic Separator | 1 |
| Fluid Cooler | 1 | | + singletons | |

None minted. The rows carry `equipment_type` NULL until ruled.

### Category audit — every category swept · 2026-07-27

All 40 categories checked for equipment that does not belong. **Clean, apart from
the rows already flagged.** No new misfilings.

| Category | Outlier | Status |
|---|---|---|
| PUMPS (37) | `RHC` 3, `GI` 2, `PRV-NG` 2 | held — no schedule, no descriptor |
| AIR HANDLING UNIT (7) | `DBF` 2 | held — no schedule, no descriptor |
| all others | none | internally coherent |

Five tags read as prose (`Solar PV Disconnect`, `UTILITY TRANSFORMER`,
`Load Bank Connection Panel`, `Utility Meter & Digital Metering`,
`Fire Pump Disconnect/ATS`). These are **real equipment the source never tagged**
— kept verbatim per C4 (drawing tags are register tags).

`RP` appearing under both RECEPTACLE PANEL and RADIANT PANEL SCHEDULE is the
known cross-discipline collision, now correctly separated. Not a defect.

### SDR review evidence — verified, and one method retracted

#### The SDR folder claim is PROVEN

All five SDR reports carry **`/Author = Adam Cheney`** — Senior CxA at
`Isotherm Engineering LTD.` in the directory — and their internal timestamps match
their filenames exactly:

| Report | Authored | Timestamp |
|---|---|---|
| SDrev#1 AHUs/DOAS | Adam Cheney | 2025-10-17 |
| SDrev#1.1 | Adam Cheney | 2025-11-13 |
| SDrev#1.2 | Adam Cheney | 2025-11-14 |
| SDrev#2 RAFs | Adam Cheney | 2026-03-31 |
| SDrev#3 Hydronic Pumps | Adam Cheney | 2026-06-29 |

**Authorship metadata is better evidence than a stamp search** — it is structural,
not visual, and it survives scanning.

#### The `-IEL` convention is corroborated, not proven

Shop-drawing PDFs carry no `/Author` (contractor tools strip it). The corroboration
is the **timestamp pattern**, consistent across every comparable pair:

| Package | Submission | `-IEL` copy |
|---|---|---|
| Air Separator | 2026-06-25 18:12 | 2026-06-29 10:29 |
| Hydronic Pumps | 2026-06-25 18:14 | 2026-06-29 10:29 |
| RAF | 2026-07-13 17:58 | 2026-07-15 12:09 |
| TFCU | 2026-06-17 21:30 | 2026-06-19 10:41 |
| Switchboard | 2026-06-17 21:50 | 2026-06-19 10:32 |
| Panelboards 1.1 | 2026-06-17 22:02 | 2026-06-19 10:31 |
| Metering Cabinet | 2026-06-17 22:08 | 2026-06-19 10:28 |

**Every submission lands in the evening; every `-IEL` copy is re-saved 2-4 days
later during business hours.** That is exactly the shape of review-after-receipt,
7 of 7.

#### RETRACTED: the page-text stamp search

A first attempt searched decompressed page streams for "ISOTHERM", "REVIEWED",
"NO EXCEPTION TAKEN" and reported "STAMP FOUND" on 13 files. **That result was
worthless and is withdrawn.** Inspecting what it had actually extracted showed
OpenType feature tags (`pnum`, `rlig`, `salt`) and PDF structure keywords
(`endobj`, `Length`, `Filter`) — it was reading font tables, not page content,
because the documents use subsetted fonts with custom encodings.

Both directions were unreliable: the positives matched structure rather than
stamps, and the negatives proved nothing at all — the five SDR reports, which are
*certainly* ours, returned "no stamp text".

**No cell was written on the basis of that check** — Stage 4b ran before it, on
the filename convention plus the SDR reports plus the log's CLS status, so the
imported data is unaffected. The lesson is the standing one: a detector that
cannot see the thing it is looking for reports absence, and absence from a blind
instrument is not evidence.

#### Evidence tiers, stated plainly

| Tier | Packages | Basis |
|---|---|---|
| **Proven** | AHU/DOAS, RAF, Hydronic Pumps | SDR report authored by Isotherm |
| **Corroborated** | Air Sep, TFCU, HX, Transformers, Switchgear, Switchboard, Metering, PV, ATS, Manual TS | `-IEL` file + timestamp pattern |
| **Log only — weakest** | Expansion Tanks, Buffer Tanks (10 tags / 20 cells) | submittal log `CLS`; no file in 4_Shops, no SDR report |

### Stage 3d — MISCELLANEOUS · **COMPLETE** 2026-07-27

Ruled: park what could not be identified rather than leave it in a category that
is actively wrong. **9 rows moved.**

| Tags | Was | Why it was wrong |
|---|---|---|
| `RHC-01/02/03` | PUMPS | a reheat coil is not a pump |
| `GI-1/2` | PUMPS | unidentified |
| `PRV-NG-1/2` | PUMPS | a gas pressure-reducing valve is not a pump |
| `DBF-1/2` | AIR HANDLING UNIT | unidentified |

**MISCELLANEOUS is the honest holding pen** — it says *"not yet identified"*
rather than asserting something false. The original source placement is recorded
in the batch note, so this stays reversible.

Consequence: **PUMPS is now 30 — every row a pump. AIR HANDLING UNIT is now 5 —
every row an AHU.** Both categories are finally true to their names.

`equipment_type` stays NULL on all nine and each family is queued for
ratification, so parking them did not quietly drop them off the list. Identifying
one later is a category edit, not a re-import.

### Register state at close of the categorisation work

| | |
|---|---|
| Equipment | **367** |
| Categories | **41** (from 14 at import) |
| Typed | 269 |
| Untyped — awaiting ratification | 98 |
| Queue entries awaiting your ruling | **19** |

**Stages 6-9 not started.**

Per the brief, Phase 3 runs one entity type per commit-and-verify step, via the
normal API as `dev.admin`, every row carrying its import batch id, historical
dates preserved from the documents and never invented, idempotent on re-run, with
counts reconciled against §3 and discrepancies named. Nothing touches another
project.
