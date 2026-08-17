# Cx Index → client-facing — export, per-column percentages, portal view

**Status: RULED 2026-08-17 — all ten recommendations adopted; BUILD ACTIVE,
three phases (§9).** Rulings are appended to each question in §7 per the 3o
precedent; four carry owner-confirmation notes. The build is sequenced
percentages → export → portal, gated per §9, with a **hard pause in Phase 1**
for the owner's red pen on the scope mapping before anything is seeded.

*Written by session `ATLAS` (parallel to the extraction arc; nothing in this
document touches intake, the extractor, or any file that arc owns). Three team
asks arrived as one package: (1) client-grade Excel and PDF export of the Cx
Index; (2) per-column completion percentages within sections, with the team
proposing type-level aggregation — "30 FCUs, one shop drawing"; (3) a read-only
interactable Cx Index on the client portal dashboard. The audit below is against
the deployed system and the live register, read-only throughout; every claim
carries its source.*

Companions: Build Spec **§4.1–4.3** (the Cx Index), **§6A** (Status & Action
Summary — the export half of this was already promised there), **§6B** (portal
dashboards — the portal half was promised there *and later ruled out*, see §5),
`docs/PORTAL-PROPOSAL.md` §8, `docs/DOCUMENT-IDENTITY-DECISION.md` (the
monochrome amendment), BACKBURNER **3b** · **3o**.

---

## 0. The finding that frames everything

> **The team's two pains are one pain.** The export prints percentages; the
> percentages are wrong for document columns; and they are wrong because the
> register counts *units* where the work is counted in *documents*. Fix the
> counting first, or the export ships numbers the firm will have to explain
> away to clients, and the portal will show them to clients unprompted.

That ordering — **percentages, then export, then portal** — is this proposal's
spine, argued in §6.

---

## 1. The audit — what exists, measured

A five-reader recon over the data model, the matrix render, the portal's binding
law, the document pipeline, and the shelf; the percentage formulas were then
adversarially re-verified against `CxIndexPage.tsx` line by line (9/9 claims
confirmed). Live-register measurements ran read-only against Seneca and are §2.

### 1.1 The data model

- **Statuses live in one sparse table.** `cx_cell_values`: one row per
  (equipment × column) *where a status has been set*; a blank cell is the
  **absence of a row**. Columns: `project_id, equipment_id, column_id, status,
  notes, updated_at, import_batch_id`; unique on `(equipment_id, column_id)`
  ([ARCHITECTURE.md:436-439](../ARCHITECTURE.md)).
- **Vocabulary: `done` | `in_progress` | `na` + blank.** `na` is **deprecated in
  place** (ruling D1): the click-cycle is blank → done → in_progress → blank and
  no longer writes `na`; legacy rows still read
  ([CxIndexPage.tsx:42-54](../src/pages/CxIndexPage.tsx#L42)). No CHECK or enum
  exists in the DB — the vocabulary is TS-union-and-prose only.
- **Not-applicable is a separate axis**: `cx_cell_applicability`, a sparse
  overlay where row-presence means N/A (`source: rule | manual`), fed by
  firm-level `cx_applicability_rules` keyed **by `equipment_type` +
  stage-group *name* + column *label*** and by manual alt-click. Precedence:
  manual > column exception > group rule > default-applicable. Marking N/A never
  touches `cx_cell_values`, so "done, later N/A'd" survives as a fact.
- **Columns carry `label` + `sort_order` and nothing else.** No kind, no scope,
  no metadata. Nothing distinguishes a *document* column (Shop Dwgs) from an
  *activity* column (Manufacturer Start-Up) except the words in the label.
  Firm defaults: 12 groups / 88 columns, copied per-project.
- **A cell is a bare status.** No completed-on date, no responsible party, no
  per-cell evidence link; `notes` exists in the schema and is **dead** — never
  selected, rendered, or written. No history: toggling overwrites in place.
- **No type-level status sharing exists anywhere.** Only *applicability*
  operates at type level. Marking "start-up complete" for Seneca's FCUs is 117
  individual cell writes.

### 1.2 The three counting functions — and a defect

The page computes "how done is it" in **three places with three different
rules**, verified line-by-line:

| where | rule | N/A overlay? |
|---|---|---|
| `rowProgress()` — the row `%` column ([:342-354](../src/pages/CxIndexPage.tsx#L342)) | done / (columns − N/A); blank counts as not-done; overlay-N/A and legacy `na` leave **both** numerator and denominator (a done-then-N/A'd cell counts nowhere) | **consulted** |
| collapsed-group summary `gPct` ([:913-916](../src/pages/CxIndexPage.tsx#L913)) | done / (group columns − legacy-`na` only) | **ignored** |
| `stageState()` — filters + per-unit panel ([:552-561](../src/pages/CxIndexPage.tsx#L552)) | na = overlay OR legacy; done; else outstanding | consulted |

> **DEFECT, found by this audit:** the collapsed-group percentage **does not
> consult the `cx_cell_applicability` overlay** — an overlay-N/A cell stays in
> its denominator as not-done, and a done-but-overlay-N/A'd cell stays in its
> numerator. It disagrees with the row percentage beside it for any unit with
> overlay rows (Seneca has **201**). Since D1 deprecated writing `na`,
> every *new* N/A is overlay-only — the collapsed number drifts further from the
> row number with every ratified rule. §7 Q7 proposes when to fix it.

**And a promise unkept:** Build Spec §4.1 says cells roll up "to per-equipment
and **per-project** % complete." No project-wide percentage is computed anywhere
on the page — only the per-row % and the per-row-per-group collapsed cell.

### 1.3 The render contract an export must echo

The T7 work defines the geometry ([RELEASES.md:369-377](RELEASES.md)):
a two-row `thead` — 24px group-band row + 120px rotated-label row
(`writing-mode: vertical-rl` + 180° rotation), the seam gate-asserted at +24px
(`pw-cx-sticky-header.mjs`); corner cells pinned on both axes at z-50;
`border-separate` forced by Chromium crbug 702927. Three body columns pinned
left: `#` (2rem), Tag/Descriptor (160px); the trailing `%` column is not pinned.
Cell states: done = teal-700 fill, white **✓**; in-progress = amber-400 fill,
white **◐**; N/A = gray **·**; done-but-N/A'd = **struck-through ✓** ("someone
did that work, and hiding it would quietly discard the fact",
[:938-941](../src/pages/CxIndexPage.tsx#L938)); blank = zebra row.

The print analogues are mechanical: sticky-top → the two header rows repeat per
page; sticky-left → `#` + Tag repeat per horizontal strip; the 12-color group
band palette is screen identity, not document identity.

**What does not translate, named:** tooltips (they carry the N/A source and
"was completed" — on paper that is the legend's job); hover; click-to-cycle;
collapse state (transient `useState`, nothing durable to read — the export
prints expanded-all); search highlights; the near-white blank-vs-N/A
distinction, which will not survive print contrast without the glyphs.

**There is no print or export affordance anywhere on the page today** — no
`window.print`, no `@media print`, no button. The export starts from zero with
T7 and the gate as the only written geometry contract.

### 1.4 What the export inherits from the document pipeline

- **Landscape exists — but only privately.** `generate-checklist`'s own
  `toPdf(html, landscape)` with `@page { size: letter landscape }` and column
  chunking (`CT_CHUNK = 9`) serves the check_table fleet record. The **shared**
  `doc-common.toPdf()` has no landscape parameter. The Cx Index needs the shared
  path extended (or the checklist's pattern lifted) — named as a build item.
- **Repeating headers are proven.** `thead { display: table-header-group }` is
  in BASE_CSS and verified repeating. Page-break CSS is in stock.
- **The monochrome amendment binds** (ruled 2026-08-05): the DOC palette is
  all-monochrome; `DOC_SEMANTIC` is **the only colour in any generated
  document**, and "adding a colour here is now a semantic claim." The
  closed-band precedent: grey means *settled*, never green-means-passed.
- **`generationStamp()` (D5: every copy, every mode) is private to
  `generate-checklist.ts`.** Report, minutes, IST and cx-plan footers do not
  carry it. A Cx Index export honouring D5 means **hoisting the stamp to
  doc-common** — a build item this proposal names rather than absorbs silently.
- **Wide-matrix DOCX is unproven.** The one precedent (check_table) is ruled
  "attempted-but-optional — if html-to-docx throws, the caller ships PDF-only
  with a note." `width:` on `th`/`td` crashes html-to-docx. This proposal
  therefore does **not** offer a DOCX Cx Index; Excel is the editable format
  (§3.2) and PDF the issued one.
- **Storage has two poles**: persisted-paths (site-reports, minutes, cx-plans)
  vs **ephemeral** (checklists: nothing persisted, the response carries 10-min
  signed URLs). Which pole the export takes is a rule-4 question → Q2.
- **`api/` is at 12 of 12.** The riding precedent is `generate-report`'s
  explicit `document: 'site' | 'ist'` allow-list (IST Phase 4). The export adds
  `'index'` there — zero new slots, and one more rider deepening 3b's
  *"or sooner"*, stated exactly as 3o stated it.
- **No xlsx writer exists** — `read-excel-file` is a reader; no exceljs/sheetjs
  anywhere. But **JSZip is already a production dependency** (docx-tables,
  docx-skeleton), and the repo already hand-authors valid minimal OOXML
  workbooks in dev fixture scripts (`gen-hostile-schedule.mjs`) — an existence
  proof that the dependency precedent ("no new dependency beyond a zip writer")
  covers a real .xlsx. → Q3.

### 1.5 The portal's binding law — and the collision, stated plainly

The portal reads through **eight SECURITY DEFINER RPCs**, thin gated wrappers
over `portal_internal.*` where every column whitelist lives exactly once; link
mode and account mode call the same inner functions, compared **field-by-field**
by `pw-portal`'s anti-drift leg. Stats are **aggregates only, never rows**,
computed inside `portal_internal`. No client appears in `pg_policies` at all.

**The collision:** PORTAL-PROPOSAL §8's NOT-building list includes, verbatim,
*"deliverables/Cx-Index/equipment exposure in any form"* — and equipment rows
are a NEVER exclusion the battery asserts in both modes. **A portal Cx Index in
any form requires a dated amendment to a shipped ruling.** The precedent for how
is the share-links amendment: the default stays, the amendment is recorded with
its cost stated.

**And the counter-current:** Build Spec §6B's kept planning notes *promise*
portal content of exactly this shape — *"Cx Index progress — overall % complete
+ per-discipline breakdown."* The spec promised it; the portal ruling later
excluded it; both are on the record. This proposal asks for the amendment with
the spec's own words as the case (§5), and proposes the **aggregate** form so
the equipment-row NEVER exclusion stands untouched.

### 1.6 Shelf reconciliation

- **§6A Status & Action Summary already promises the export half** — an
  exportable cross-cutting lens with a per-contractor export, an internal view,
  and a *"client status summary … basis of the client-facing dashboard."* This
  proposal delivers the **Cx Index slice** of §6A, not the module: the findings
  / documentation-register / deliverables lenses stay §6A's. Named so it is
  reconciled, not built beside.
- **3o (Documents pool): cleared, explicitly.** The trio does not need the pool.
  A shop-drawing *column* is a status cell — register data; §4.4's law (*a claim
  names its evidence, it does not have to own it*) covers the review act without
  a document in custody. Depending on the pool would chain this behind 3o's
  double wake for nothing.
- **3b:** not triggered (zero slots needed) but deepened — third rider on the
  allow-list pattern.
- **IST boundary:** the fire-integration column stays the per-unit readiness
  tracker; the export must not present it as IST scenario results.
- Everything else on the shelf: checked and cleared (3g, 3h, 3i, 3f, 3l, 3m,
  entries 4–10; entry 6's deterministic-facts split is precedent to copy, not a
  collision).
- **Per-COLUMN percentages are genuinely new** — no spec section or shelf entry
  promises that axis. §4.1 promises per-equipment and per-project only.

---

## 2. The Seneca measurement — the team's pain, counted

Seneca (367 units — 117 `fcu`, 98 untyped, 55 `vav`, 30 `pump`, 26 `panel` …)
is the specimen. Its grid is 367 × 89 = **32,663 cells carrying 545 marks**, and
**544 of the 545 came from the import backfill** — this is the firm's own
workbook practice faithfully inherited, not app behaviour. Both failure modes
are live in the same project:

**The bulk-mark.** "IFC Drawings / Specifications" is `done` on **all 367
rows** — 366 of them stamped in a single minute. One review act, recorded as 367
row-facts. The act was honest; the model made it heavy, and re-opening that
review would be 367 heavy in reverse.

**The under-mark.** "Shop Dwgs" on FCUs is `done` on **3 of 117** — and the
three are the complete **TFCU tag family** (TFCU-01…03), while the 113-unit
FCU-L\* family and VFCU-01 carry nothing. The register cannot say whether the
main fleet's shop drawing is *unreviewed* or *reviewed and nobody marked 113
rows*. Pumps: 28/30. AHUs: 6/7. Untyped: 43/98.

**The nuance that decides the design:** the marks followed the **tag family**,
not the type key. A CxA marked the TFCU drawing's three units and deliberately
did not claim the FCU-L fleet. The team's proposed blanket type-average — and
equally a type-*shared* stored status — would have painted all 117 FCUs done
from a 3-row act the CxA scoped narrower on purpose. **Type is the right
denominator for counting document work; it is the wrong grain for storing
facts.** (Model-level grouping is not an option at all: zero of Seneca's
FCUs/VAVs/pumps carry a model value.)

On today's row-based math, Seneca's Shop Dwgs column reads ~24% (85/356-ish
applicable units). Counted the way the work actually arrives — one submittal
per type — the same register reads ~**60%** (types substantially complete /
types in scope). Neither number is *wrong*; they answer different questions,
and the column header should say which question it is answering. That is §4.

---

## 3. Export design

One generator, two formats, riding `generate-report`'s allow-list as
`document: 'index'` (the IST Phase 4 precedent — zero new slots). Everything
factual computed by the deterministic layer from the same reads the page makes;
no model call anywhere in this feature.

### 3.1 PDF — the issued form

- **Landscape letter**, via a `landscape` parameter added to the shared
  `doc-common.toPdf()` (the checklist's private implementation is the in-repo
  proof it works; hoisting it is the named build item, alongside
  `generationStamp()` which D5 obliges on every page of every copy).
- **Column strips, sections as chapters.** 89 columns do not fit one landscape
  page. The check_table precedent chunks columns (`CT_CHUNK = 9`); the Cx Index
  export chunks **by stage group** — each group is a chapter that starts a new
  strip, headed by the group name (the 24px band's print analogue) and its
  rotated column labels, with the `#` + Tag/Descriptor columns repeated on
  every strip (the sticky-left analogue) and `thead` repeating on every page
  (proven). Category header rows and per-category numbering render as on
  screen.
- **Statuses as glyphs, monochrome**: ✓ done · ◐ in progress · **·** N/A ·
  struck-✓ done-but-N/A'd · blank. This is **already the screen's glyph
  vocabulary** — the fills (teal/amber) are screen identity; the glyphs are the
  information. A legend renders on every strip's footer line. Q1 offers the
  colour alternative honestly; the recommendation is monochrome, because the
  amendment stands and because the glyph set was designed to carry the
  distinctions at any contrast (blank vs N/A survives print only because of the
  glyph, per the audit).
- **Cover block, not cover page**: project header (inherited letterhead),
  the project-wide % (built in §4's phase), per-group percentages, counts
  (`N items · M columns · K entries`), and the D5 stamp. The export always
  prints the **full register, expanded** — collapse is transient view state,
  and filters do not silently shape a client document; a filtered export is
  deferred until asked for, and would carry an explicit "filtered: N of M"
  banner per the on-screen model.
- **Client grade vs internal grade** — one flag, whitelist-shaped (Q9):
  client mode drops the `notes` column concept entirely (dead schema anyway),
  drops N/A provenance ("by rule" is internal curation), and — Q9's real
  question — how the struck-✓ reads to a client.

### 3.2 Excel — the working form

A **real .xlsx** with real values, not a screenshot and not a CSV:

- Native **rotated column headers** (`textRotation` in the style record — the
  matrix's print identity), **frozen panes** echoing the sticky work exactly:
  first two rows (band + labels) and the tag columns frozen via one
  `<pane>` element.
- **Real cell values**: `Done` / `In progress` / `N/A` / blank as text (Q9 may
  glyph them), one sheet per stage group or one wide sheet — recommend **one
  wide sheet** (Excel is the format whose whole point is that the firm can
  filter and pivot it; chapters are a PDF idiom).
- Percentages as **computed values**, not formulas — a client's Excel must not
  recompute different numbers than the issued PDF beside it.
- The D5 stamp as a workbook footer plus a stamp row on the cover sheet.
- **Writer: hand-rolled minimal OOXML on JSZip** (Q3) — the Cx Plan composer's
  own justification ("no new dependency beyond a zip writer") and the dev
  fixture scripts prove the shape. **Generated client-side**, in the page: the
  matrix data is already loaded in the browser under RLS; xlsx needs no
  Chromium, no endpoint, no bucket, no slot, and is ephemeral by construction.
  Only the PDF crosses the wire.

---

## 4. Per-column percentages — scope, not averaging

### 4.1 The frame: a column has a scope

The register's columns answer two kinds of question and the schema currently
cannot tell them apart (audit §1.1 — columns are `label` + `sort_order` only):

- **Unit-scoped** (the default): the work happens *per machine*. Start-up,
  point-to-point, IST readiness. Denominator: applicable units.
- **Type-scoped**: the work happens *per submittal*, which in this firm's
  practice means per equipment type in the project. Shop drawings, SDR, O&Ms.
  Denominator: **types with ≥ 1 applicable unit**.

Proposal: add **`scope text not null default 'unit' check (scope in
('unit','type'))`** to `cx_default_columns` and `project_cx_columns`, set on
the firm defaults once (the Doc Review group's document columns become
`type`), editable per project like every other column property (§4.3:
editable defaults, never hardcoded). By 3o Q2's recorded law this sits on the
policy side — humans consume it, admins set it — with the two-value vocabulary
itself a CHECK, exactly as `sheet_kind` vs `document_categories` split.

### 4.2 The formulas, stated exactly

All three inherit `rowProgress`'s N/A discipline — overlay-N/A and legacy `na`
leave both sides; blank counts against:

- **Unit-scoped column %** = units `done` / applicable units.
- **Type-scoped column %** = types complete / types in scope, where a type is
  **complete when every applicable unit of that type is `done`**, and *in
  scope* when it has ≥ 1 applicable unit. Partial families (TFCU done, FCU-L
  blank) count in the denominator and not the numerator — visible as the
  honest "1 of N types" rather than a misleading 2.6% or a false 100%. Q6
  offers the alternative definition and argues against it.
- **Section (stage-group) %** = mean of its column %s? **No — weighted by
  claims**: Σ numerators / Σ denominators across the group's columns, each in
  its own scope's units. An unweighted mean lets a 2-unit column swing a
  117-unit column's group. Same rule for the **project-wide %** (finally
  delivering §4.1's promise), shown in the top bar, the export cover, and the
  portal.

**What this deliberately does not change:** the per-equipment row % keeps its
current definition untouched — a row is a machine, and machine-progress is
unit-scoped by nature. Consistency between the row numbers and the new column
numbers is maintained by both obeying the same N/A discipline, not by forcing
one scope onto both axes.

### 4.5 The project-scope question — banked, named, waiting on evidence

*Recorded at the owner's instruction with the 2026-08-17 red pen; a question
for a future ruling, not a threshold someone wonders about.*

The scope mapping surfaced a third shape the two-value vocabulary deliberately
does not cover: **project milestones**. Groups 10 and 12 (IST Plan Prepared,
C&E Matrix, AHJ Acceptance, Cx Report Draft/Final, Seasonal tests, Closeout
Report) and four Turnover columns (Permanent Power ON, Training, As-Builts,
Master Issue Log Sign-off, Substantial Performance) are neither per-machine
nor per-submittal — they happen once per project, and both existing scopes
misdescribe them (`unit` makes "IST Report Issued 12%" mean nothing; `type`
would just be a smaller nothing).

They stay `unit` — today's behaviour — until there is evidence the number
misleads someone real. **The wake condition:** a team member or client reads a
milestone column's percentage and asks what it means, or the export ships one
to a client. Then a `project` scope (one claim per project, complete/not) is
its own small ruling: a one-value addition to the CHECK, a formula case that
is trivially `0/1 or 1/1`, and a mapping pass over ~16 columns. It was not
folded into the seed because widening a just-ruled vocabulary in its own seed
commit is exactly the drift the ruling process exists to prevent.

### 4.3 Against the team's blanket type-average — with their own example

"30 FCUs, one shop drawing" is right about the *denominator* and the proposal
adopts it — for the columns where it is true. A **blanket** type-average
(applied to every column) would make "Manufacturer Start-Up 100%" mean "some
FCU started up," which is exactly the confident-wrong-number failure. And the
measured register (§2) shows even the document columns need the per-unit facts
*underneath* the type-level count: the TFCU/FCU-L split is real, deliberate,
and only expressible per-unit.

### 4.4 Display and the bulk act — fixing the workflow, not just the math

The team's follow-on ask — should type-scoped columns *share status* across a
type's rows — is answered **no on storage, yes on gesture**:

- **Storage stays per-unit.** A type-level stored status cannot record the
  TFCU-done/FCU-L-pending state that the firm's own workbook records today, nor
  a per-unit exception (one rejected resubmittal in a fleet of approved).
- **The gesture becomes one act**: on a type-scoped column, the header cell
  (or a cell context action) offers **"Mark ⟨column⟩ done for all ⟨type⟩ —
  N units"** with the count shown, writing N rows in one confirmed action —
  which is precisely what the Seneca import's one-minute 366-row stamp proves
  the practice already is, done honestly and attributably instead of by
  spreadsheet drag. Offer-never-assert; the confirmation names the number.
- **Display**: type-scoped columns *may* additionally render a per-type
  rollup band in the matrix; that is polish, deferred to the build's sighted
  phase, and changes no number.

**And the §1.2 defect is in this phase's scope** (Q7): the collapsed-group
summary starts consulting the overlay, bringing all three counting sites under
one rule before any number is printed on client paper.

---

## 5. Portal Cx Index — the aggregate clause, behind an amendment

**The ask requires amending a shipped ruling, and this proposal asks for the
narrow version.** PORTAL-PROPOSAL §8 excludes "Cx-Index … exposure in any
form"; Build Spec §6B promised "Cx Index progress — overall % complete +
per-discipline breakdown." The amendment reconciles them the way the
share-links amendment did: the default stands, the new surface is scoped and
its cost stated.

**Proposed surface — aggregates only, no amendment to the equipment
exclusion:**

- A new numbered clause (**"05 · Commissioning progress"**) in the section
  stack **both shells render identically** — one shared component,
  mode-specific access injected as props, per the Register/Documents pattern.
- Content: the project-wide %, per-stage-group bars, and the per-discipline /
  per-category breakdown §6B named — **counts and percentages only. No
  equipment rows, no tags, no cells, no column-level drill in v1.** The NEVER
  exclusion ("no equipment") stands untouched; nothing row-shaped crosses.
- "Interactable" means: expand a group to see its per-column percentages
  labelled with their scope ("by type" / "by unit"), sort, and nothing else.
  Every drill-down bottoms out at a number, never at a unit or an internal
  surface. No link into the app, no export trigger from link mode (a shipped
  assertion refuses link-token generation, and it stays true).
- Data path, exactly per the shipped shape: `portal_internal.cx_index_stats(pid)`
  — the only place the aggregate definition lives — computed inline (the
  `dashboard_checklist_coverage` security_invoker lesson, already recorded),
  wrapped by a gated `public.portal_cx_index(pid)`, included in
  `portal_link_bundle` so link mode reads the same inner function, and joined
  to `pw-portal`'s field-by-field anti-drift leg and the three-walls write
  refusal. The percentages the portal shows are computed by the **same §4
  formulas** — one definition, asserted identical between the internal page and
  the portal by the battery, not by discipline.
- Placement: after Progress (01), before the Register — it is the "how far
  along" instrument the Hero's checklist bar already gestures at; Q8 leaves
  final placement to the owner.

**What stays internal, said plainly:** the matrix itself. A client who needs
cell-level detail gets the **issued PDF export** — a frozen artifact (rule 4
pole), which is exactly the boundary MASTER-BRIEF already draws: *"if it is a
frozen, issued artifact or a register column, it can be external; if it is
working state, it cannot."* The live matrix is working state; the export is the
issued artifact; the portal clause is register-derived aggregates. All three
land on the right side of the line.

---

## 6. Sequencing and blast radius

**Order: percentages → export → portal.** The export prints the percentages;
printing them before the scope model lands means client documents whose numbers
change meaning a month later. The portal consumes the same aggregates last,
behind its amendment ruling, its own battery legs, and its own session (ruled
portal surfaces get their own gates — 3b's rule, applied by analogy).

| piece | touches | independent of |
|---|---|---|
| **1 · Percentages + scope** | `project_cx_columns`/`cx_default_columns` (+`scope`), `CxIndexPage` math + bulk-set gesture, the §1.2 collapsed-% defect | extraction arc entirely; portal entirely |
| **2 · Export** | `generate-report` allow-list (`'index'`), `doc-common` (landscape param + `generationStamp` hoist — shared-file changes, flagged), client-side xlsx module, an Export button on the page | extraction arc; portal |
| **3 · Portal clause** | `portal_internal` + one wrapper + bundle + both shells + `pw-portal` | everything else; **gated on the §5 amendment ruling** |

- **No 3o dependency** — cleared in §1.6; this trio must not wait on the pool's
  double wake.
- **No extraction-arc collision** — none of these files are in that arc's
  blast radius; the trio can build while the arc runs, subject to the standing
  nothing-lands-during-a-battery rule.
- **Slots: zero new.** `document:'index'` rides generate-report; xlsx is
  client-side. Third rider on the allow-list pattern — 3b's "or sooner"
  deepens again, noted as 3o noted it.
- **Shared-file caution:** the `doc-common` changes (landscape, stamp hoist)
  touch every generator's shared module — they land with the full
  doc-generation battery green, in their own commit, before the export
  consumes them.

---

## 7. The ten questions — recommendations, and the rulings

**All ten ruled 2026-08-17, every recommendation adopted.** Original text kept;
rulings appended. Four rulings carry owner-confirmation notes that shape the
build (Q1's future-amendment clause, Q3's dual-application gate, Q4's dry-run
pause, Q8's amendment-first ordering).

**Q1 · Status rendering on paper: monochrome glyphs or a colour exception?**
→ **Monochrome glyphs** (✓ / ◐ / · / struck-✓ / blank, legend on every strip).
*Reason:* the monochrome amendment stands — "every remaining colour carries
meaning"; Cx statuses are *progress*, not conformance, so they have no claim on
`DOC_SEMANTIC`'s red/green (the closed-band precedent: grey means settled,
never green-means-passed). The glyphs are already the screen's information
layer and survive site greyscale printing by construction. *The alternative,
stated honestly:* a ruled exception adding progress fills to `DOC_SEMANTIC` —
teal/amber echoing the screen — would make the export prettier and would be the
first colour re-admitted since the amendment; if wanted, it is an amendment to
a ruling, not a style choice.

> **RULED — monochrome glyphs, legend on every strip.** The owner may amend to
> colour later; if so it is **recorded as an amendment to the monochrome
> ruling**, never as a style choice slipped into a commit.

**Q2 · Is the export ephemeral or issued (rule 4 pole)?**
→ **Ephemeral in v1** — the checklists precedent exactly: nothing persisted,
10-minute signed URLs in the response. It is a regenerable lens over live
register data. *The boundary to respect:* the moment an export is **delivered
to a client** (portal document list, or a formal transmittal), it must flip to
the issued pole — persisted path, frozen, rule 4. That flip is deliberately out
of v1 and would be its own small build; the internal button does not create
frozen records the firm then has to manage.

> **RULED — ephemeral v1, checklists pole.** The issued-flip is **its own
> future build**, and the boundary stands in this document: the moment an
> export is delivered to a client, it becomes an issued frozen record.

**Q3 · The xlsx writer: hand-rolled OOXML on JSZip, or a library?**
→ **Hand-rolled minimal OOXML on JSZip, client-side.** *Reason:* the dependency
precedent is explicit ("no new dependency beyond a zip writer" — and the zip
writer is already shipped); the dev fixtures already author valid xlsx this
way; the feature needs exactly one workbook shape (grid + styles + frozen pane
+ rotation + footer), not a spreadsheet library's surface area. Client-side
means zero slots, zero maxDuration exposure, ephemeral by construction. *Cost,
stated:* styles.xml and sharedStrings are fiddly; the gate is opening the
artifact in real Excel and LibreOffice, plus a structural assertion
(unzip-and-grep, the docx-tables idiom) in the battery.

> **RULED — hand-rolled OOXML on JSZip, client-side.** The gate is dual and
> both halves are mandatory: the artifact **opens clean in real Excel AND
> LibreOffice**, plus the structural unzip-and-grep assertion in the battery.

**Q4 · Where does `scope` live?**
→ **On the column defs** (`cx_default_columns` + `project_cx_columns`),
two-value CHECK, admin/project-editable like every column property. *Reason:*
scope is a property of what the column *claims*, not of any document kind (no
document model exists in the register, and §1.6 cleared the pool dependency);
per-project editability follows §4.3. The firm-default assignment (which of the
88 go `type`) is seeded once and is itself the owner's call to confirm.

> **RULED — scope on the column defs, two-value CHECK, per-project editable.
> The firm-default assignment ships as a DRY-RUN MAPPING TABLE** — all 88
> columns, proposed scope each — **and the build PAUSES for the owner's red pen
> before seeding.** The mapping: [CX-INDEX-SCOPE-MAPPING.md](CX-INDEX-SCOPE-MAPPING.md).

**Q5 · Should type-scoped columns share stored status across the type's rows?**
→ **No on storage, yes on gesture.** Per-unit rows stay; the header gains
"mark all ⟨type⟩ — N units" as one confirmed act. *Reason:* the measurement —
the firm's own records mark the TFCU family and not the FCU-L fleet, a state a
type-level stored status cannot hold; and per-unit exceptions are real.
The one-act gesture removes the 117-click pain the team is actually reporting.

> **RULED — no shared storage; the bulk gesture, with the count named in the
> confirmation.** Attributable writes, offer-never-assert.

**Q6 · When is a type "complete" for a type-scoped %?**
→ **All applicable units done** (partial families count in the denominator
only). *Reason:* "any unit done ⇒ type complete" would have called Seneca's
FCU shop drawings complete on the 3-unit TFCU mark while 114 units carried
nothing — a false 100% manufactured from the exact case the team cited. The
strict definition makes the bulk gesture (Q5) the natural way to record a
type-wide approval, and the % moves when the recording is honest.

> **RULED — type-complete = all applicable units done; partial families count
> in the denominator only. And the UI shows "K of N types"** so the strictness
> reads as honesty, not failure — the label carries the definition.

**Q7 · The collapsed-group % defect — fix in phase 1, or separately first?**
→ **In phase 1, as its first commit, with its own battery leg.** *Reason:* it
changes on-screen numbers, so it must not ride silently inside a feature — its
own commit names the change and the reason — but shipping the export while the
page shows two disagreeing percentages for the same group would print a number
the screen contradicts. Sequenced: defect fix → scope model → export.

> **RULED — Phase 1's FIRST commit, its own battery leg.** All three counting
> sites under one rule before anything prints.

**Q8 · The portal amendment — aggregates-only clause 05, or unit-level matrix?**
→ **Aggregates only** (§5's shape), placed after Progress. *Reason:* it
satisfies §6B's promised content while leaving the equipment NEVER exclusion
untouched and the working-state boundary intact; the issued PDF is the
cell-level vehicle. A unit-level portal matrix would amend two shipped
exclusions at once and put working state in front of clients — recommended
against even as an option. The amendment to PORTAL-PROPOSAL §8 gets its dated
entry either way, share-links style.

> **RULED — aggregates-only clause 05. The dated amendment to PORTAL-PROPOSAL
> §8 is written share-links-style — the default stands, the scope and cost are
> stated, §6B's promise cited as the case — and the amendment entry is part of
> Phase 3's FIRST commit, not an afterthought.**

**Q9 · What does client grade exclude — and how does struck-✓ read to a
client?**
→ Client mode drops N/A provenance and everything note-shaped; renders
struck-✓ **as struck-✓ with its legend line** ("completed; later ruled not
applicable"). *Reason:* collapsing it to a plain · would erase recorded work
from a client document — the same fact the screen refuses to hide; the legend
is exactly the tool paper has for it. The alternative (client sees plain ·) is
simpler and defensible; the owner picks the firm's posture here.

> **RULED — struck-✓ with its legend line, in client mode too.** Recorded work
> is not erased from a client document.

**Q10 · Sequencing.**
→ **Percentages → export → portal; independent of the extraction arc; portal
gated on the Q8 amendment.** §6's reasons. The one coupling to respect: the
`doc-common` shared-file changes land first, alone, battery-green.

> **RULED — as proposed.**

---

## 8. What this proposal will not do

- **It will not average away the register.** Every percentage is derived from
  per-unit facts that stay per-unit; scope changes denominators, never storage.
- **It will not put working state in front of a client.** The portal clause is
  aggregates; the client's cell-level view is a frozen, issued artifact.
- **It will not add colour to documents.** Monochrome glyphs, unless the owner
  amends the amendment (Q1) — and then it is recorded as one.
- **It will not screenshot the matrix.** Excel is real cells; PDF is a real
  print rendering of the same data through the same formulas.
- **It will not take a function slot.** `document:'index'` rides
  generate-report; xlsx never leaves the browser.
- **It will not touch the extraction arc's files, and it will not wait on 3o.**
- **It will not silently change a number.** The collapsed-% fix and the scope
  model each land in named commits with battery legs before anything prints.

---

## 9. The build — phases and gates (ruled 2026-08-17)

Standing rules throughout: battery green before anything lands; RELEASES entry
per phase; reversals quoted; **stop-and-show on anything that smells like a
second collision with a shipped ruling.**

| # | Ships, in order | Gate |
|---|---|---|
| **1 · Counting** | Defect fix (own commit, own battery leg) → `scope` column + the dry-run mapping table → **PAUSE for the owner's red pen** → seed → formulas (column / section / project-wide, claims-weighted) → bulk gesture (offer-never-assert, count named in the confirmation, attributable writes). | The three counting sites agree under one N/A discipline (battery leg); the project-wide % exists (Build Spec §4.1's promise finally kept); the bulk gesture writes N rows in one confirmed act on ZZ-TEST; Seneca's Shop Dwgs column reads its honest "K of N types" on screen and in the formula tests. |
| **2 · Export** | `doc-common` changes first, **alone** (landscape param + `generationStamp` hoist), full doc-generation battery green, own commit → `document:'index'` PDF (group-chapter strips, repeated identity columns, glyphs + legend, cover block with the Phase 1 percentages, D5 stamp every page) → client-side xlsx (real cells, computed values not formulas, frozen panes, rotation, stamp). | Both artifacts open clean in their real applications (Excel **and** LibreOffice for the xlsx); the battery's structural assertions pass; the PDF's numbers match the screen's for the same register state. |
| **3 · Portal clause** | The dated §8 amendment entry (first commit) → `portal_internal.cx_index_stats` (aggregates computed inline; **one definition — the same Phase 1 formulas, asserted identical between page and portal by the battery, not by discipline**) → gated wrapper → bundle → both shells, one shared component → `pw-portal` anti-drift + three-walls legs extended. | Field-by-field parity between modes; zero row-shaped data crossing; link-mode export refusal still asserted. |
