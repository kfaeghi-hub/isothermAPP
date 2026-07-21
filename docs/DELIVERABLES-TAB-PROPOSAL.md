# Deliverables Tab — Proposal (Phase 2 close-out)

Status: **APPROVED AND BUILT — 2026-07-21.** All four sign-offs resolved: (1) enum
swapped with formal mapping; (2) snapshot-to-ad-hoc pool-delete fix; (3) OPR & BoD
stays combined; (4) Envelope option + 6 templates seeded DORMANT (active=false) —
activation is two admin toggles + compose when a BECx project is awarded. Reorder is
up/down arrows (team-matrix precedent). Proof: pw-deliverables.mjs 22/22 (incl.
run-twice idempotency and the activate→6-row-delta→deactivate Envelope case) +
pw-dashboard re-run green. The section below is the as-approved proposal.

## 1 · Current table shape (as it actually exists)

`project_deliverables` is further along than the "(soon)" badge suggests — the Phase-2
framework build already landed most of the row shape:

| column | type | notes |
|---|---|---|
| id / project_id / created_at / updated_at | uuid / uuid FK→projects CASCADE / tz / tz | standard |
| template_id | uuid **nullable** FK→deliverable_templates | already nullable — ad-hoc was anticipated |
| status | `deliverable_status_enum` NOT NULL default `not_started` | **enum exists but with different values**: not_started · in_progress · **received · complete · na** |
| assigned_to | **uuid** nullable FK→**contacts** ON DELETE SET NULL | exists but wrong shape vs spec (§12 wants profile-name text) |
| due_date / notes | date / text, nullable | already exist, spec-conformant |
| — | | UNIQUE(project_id, template_id); RLS = single `acc_all` policy: `is_admin_or_dev() OR is_project_member(project_id)` for ALL commands |

Missing vs spec: `name` (ad-hoc), `sort_order`, `date_submitted`, `date_accepted`,
`org_id`, the one-of CHECK. Data state: exactly 14 rows (ZZ-TEST-LEED), all
`not_started`, `assigned_to` all null — the two reshapes below are zero-data-loss.
The four real projects have 0 rows and 1 classification each; ZZ-TEST has 3
classifications, ZZ-TEST-LEED has 5.

**Discovery A — enum mismatch.** The existing enum's `received/complete/na` don't match
the spec's four states. No row uses them → clean type swap: new `deliverable_status`
enum (`not_started, in_progress, submitted, accepted`), `ALTER COLUMN … TYPE … USING`
with the formal mapping received→submitted, complete→accepted, na→not_started, then
drop the old type. (Alternative — keeping old labels as dead values — pollutes every
status dropdown forever; not recommended.)

**Discovery B — the admin pool-delete flow conflicts with the CHECK.**
`ClassificationsPage` handles pool-template deletion by nulling
`project_deliverables.template_id` first (comment: "NO ACTION by design — clear it
first"). Under the new CHECK that row becomes invalid (null template + null name).
Fix folded into this build: the delete flow snapshots the template's name into `name`
as it nulls `template_id` — pool deletion converts project rows to ad-hoc instead of
orphaning them. The CHECK stays strict.

## 2 · Migration (additive + the two reshapes)

```sql
-- 1. Status enum swap (all rows not_started; mapping formal)
create type deliverable_status as enum ('not_started','in_progress','submitted','accepted');
alter table project_deliverables alter column status drop default,
  alter column status type deliverable_status using (case status::text
    when 'received' then 'submitted' when 'complete' then 'accepted'
    when 'na' then 'not_started' else status::text end)::deliverable_status,
  alter column status set default 'not_started';
drop type deliverable_status_enum;

-- 2. assigned_to: uuid FK -> profile-name text (§12 convention; all null today)
alter table project_deliverables drop constraint project_deliverables_assigned_to_fkey,
  alter column assigned_to type text using null;

-- 3. Additive columns
alter table project_deliverables
  add column name text,                                  -- ad-hoc display name
  add column sort_order integer not null default 0,
  add column date_submitted date,                        -- date_closed pattern:
  add column date_accepted date,                         -- auto-stamped, editable, cleared on regression (app-side)
  add column org_id uuid default '00000000-0000-0000-0000-000000000001' references orgs(id),  -- rule 17
  add constraint project_deliverables_pool_or_adhoc check
    ((template_id is not null and name is null) or (template_id is null and name is not null));

-- 4. Backfill sort_order on the 14 existing rows from their template's pool order
```

RLS: the `acc_all` policy is row-scoped and column-agnostic — new columns are covered
unchanged; verified, nothing to add. Date stamping is app-side per the `date_closed`
pattern (advance to submitted stamps `date_submitted`, to accepted stamps
`date_accepted`; both editable; regressing below a state clears its date).

## 3 · LEED seed deltas — final option → deliverable mapping

**New option:** Sustainable Programs gains **"LEED Envelope Cx (BECx)"** at sort 4
(after MBCx; TGS through Envision shift +1). Description: *"Enhanced Cx Option 2 —
Building Envelope Commissioning per NIBS Guideline 3. Independently pursuable (does
not require systems Enhanced Cx); envelope work subcontracted, deliverables tracked as
coordinating CxA. v4/v4.1 share this scope."* Versions stay out of the option list per
§9A; a future v5 split is admin-screen INSERTs — recorded here, not built.

**Pool changes** — 1 rename, 1 description tweak, 10 new templates (existing entries
adjusted, never duplicated):

- Rename: `CFR Plan` → **CFR & O&M Plan** (v4's actual artifact: current facilities requirements *and* O&M plan)
- Description tweak: `MBCx Plan` gains "corrective action plan" in its points/limits wording
- New: **Design Review** · **Design Review Backcheck** · **Quarterly Trend Analysis** ·
  **MBCx Report** · **Envelope OPR & BoD Input** · **Envelope Design Review** ·
  **Envelope Submittal Review** · **Envelope Field & Mockup Testing Verification** ·
  **Envelope Cx Report** · **Envelope 10-Month Review**

**Final mappings** (Enhanced replicates Fundamental's rows per the existing
inherits-by-replication ruling; ✓ = mapping already exists, **+** = new mapping):

| Template | Fundamental | Enhanced | MBCx | Envelope (new) |
|---|---|---|---|---|
| Cx Plan | + | + | | |
| OPR & BoD Review | ✓ | ✓ | | |
| Design Review | + | + | | |
| Issues-and-Benefits Log | ✓ | ✓ | | |
| System Test Execution Verification | ✓ | ✓ | | |
| Final Cx Report | + | + | | |
| CFR & O&M Plan (renamed) | ✓ | ✓ | | |
| Design Review Backcheck | | + | | |
| Contractor Submittal Review | | ✓ | | |
| Systems Manual Verification | | ✓ | | |
| Training Verification | | ✓ | | |
| Seasonal / Deferred Testing | | ✓ | | |
| 10-Month Operations Review | | ✓ | | |
| OCx Plan | | ✓ | | |
| MBCx Plan | | | ✓ | |
| Quarterly Trend Analysis | | | + | |
| MBCx Report | | | + | |
| Envelope OPR & BoD Input | | | | + |
| Envelope Design Review | | | | + |
| Envelope Submittal Review | | | | + |
| Envelope Field & Mockup Testing Verification | | | | + |
| Envelope Cx Report | | | | + |
| Envelope 10-Month Review | | | | + |

Notes: **(a)** the spec names "OPR review" and "BOD review" as separate lines — the
pool's combined `OPR & BoD Review` covers both as one row, matching how the firm
actually submits; proposed kept combined (splitting is a 2-minute admin-screen edit
later). **(b)** "Fundamental Cx Report" reuses the existing `Final Cx Report` template
via mapping rather than a near-duplicate entry; the NC-lifecycle mapping already
composes it, and union-dedupe means LEED projects get one row. **(c)** Design Review
lands in Fundamental per the spec's list (v4.1-aligned); the Backcheck template
carries Enhanced's CD-stage back-check distinctly. **(d)** ZZ-TEST-LEED's existing 14
rows are untouched by the seed deltas (compose-from-classification picks up the new
mappings as its re-sync). **(e)** The MBCx mapping lives on the Sustainable Programs
"MBCx" option; the Project Lifecycle "Monitoring-Based Cx (MBCx)" option is untouched.

## 4 · UI — the Deliverables tab

Tab bar: `deliverables` flips `built: false → true`; stub block replaced.

```
┌ Deliverables ──────────────────────────────── [+ Add deliverable] ┐
│ ⠿  Cx Plan                    [In Progress ▾]  T. Faeghi  Aug 15  ✎ 🗑 │
│ ⠿  OPR & BoD Review           [Submitted ▾]    —          —      ✎ 🗑 │  ← date_submitted in chip tooltip/edit
│ ⠿  Roof Warranty Letter *     [Not Started ▾]  —          —      ✎ 🗑 │  ← * ad-hoc marker
│ …                                                                  │
│ ── empty/backfill state ──────────────────────────────────────────│
│  "Compose from classification" → preview: "Will add 7: Cx Plan,   │
│   Design Review, …"  [Apply]                                       │
└────────────────────────────────────────────────────────────────────┘
```

- Row: name (template name or ad-hoc name), status chip (dropdown-advance, stamps/clears
  dates), assigned_to (profile-name text input with member datalist, §12 convention
  stated in the tooltip like My Items), due date, notes (inline expand), drag-reorder
  (`sort_order`), remove with confirm (member-deletable, content pattern).
- **Add** opens the pool picker grouped by pool sort with already-present entries
  disabled (UNIQUE backstop), plus an ad-hoc name field, plus inline "+ add to firm
  pool" (inserts to `deliverable_templates`, then links — reusables graduate; admin
  screen unchanged).
- **Compose from classification** (always in the header menu, prominent in empty
  state): union of `option_deliverable_defaults` for the project's *current*
  `project_classifications` minus template_ids already present, lists exactly what it
  will add, applies with `ON CONFLICT DO NOTHING`. Idempotent by construction; doubles
  as re-sync after classification edits (add Envelope Cx mid-project → compose offers
  its 6). All four real projects (0 rows, pre-framework) start here.

## 5 · Dashboard deltas (nothing else touched)

- **Attention Queue**: new kind `overdue_deliverable` — `due_date < today AND status
  NOT IN ('submitted','accepted')` → "⟨name⟩ overdue", detail "⟨n⟩d overdue", deep link
  to the tab. Constant `DELIVERABLE_OVERDUE_GRACE_DAYS = 0` lands in
  `dashboardThresholds.ts` so the number lives where the others live.
- **My Items**: adds `assigned_to === profileName AND status ≠ accepted` rows, same
  §12 free-text matching as findings/meetings (inherits the §12 normalization note's
  future FK migration path).

## 6 · Touchpoints & test plan

Touchpoints: creation-time composition in `ProjectsPage` unchanged (insert already
sets `status: 'not_started'`; new columns default sanely); `ClassificationsPage` admin
gains nothing except the Discovery-B delete-flow fix (snapshot-to-ad-hoc);
`database.ts` types; tab bar; `dashboardData.ts` queries. Not building (§9A): doc
linkage, approvals, notifications, client visibility, percent rollups, version
taxonomy.

**pw-deliverables.mjs** (ZZ-TEST only, self-cleaning): compose-from-classification on
ZZ-TEST → run **twice**, second run must offer/add zero (idempotency proven); status
walk not_started→in_progress→submitted→accepted asserting date_submitted/date_accepted
stamping and clear-on-regression; ad-hoc add (CHECK exercised) + remove; add Envelope
Cx to ZZ-TEST-LEED's classification → compose offers exactly the 6 envelope rows →
apply → remove option + rows; one dev.test-assigned row with a past due date → assert
it in the Attention Queue and My Items → clean. Then **pw-dashboard.mjs re-run** to
prove the existing queue is undisturbed.

## Sign-off items

1. Enum swap (Discovery A) — replace type vs append values.
2. Pool-delete snapshot-to-ad-hoc fix (Discovery B).
3. Combined vs split `OPR & BoD Review`.
4. Envelope option's sort position (proposed: 4, after MBCx).
