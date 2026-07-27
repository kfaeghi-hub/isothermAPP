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

**No project data has been written. Stages 2-9 not started.**

Per the brief, Phase 3 runs one entity type per commit-and-verify step, via the
normal API as `dev.admin`, every row carrying its import batch id, historical
dates preserved from the documents and never invented, idempotent on re-run, with
counts reconciled against §3 and discrepancies named. Nothing touches another
project.
