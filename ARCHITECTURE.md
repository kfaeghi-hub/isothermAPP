# Isotherm Cx System — Architecture

> **Standing principle (§9B):** Clear separation of data / logic / UI. Consistent structure. External integrations behind adapter boundaries. Strong typing. Tests on critical flows. Clarity and modularity over cleverness, without over-abstracting for hypothetical needs.

---

## Overview

A React SPA for managing building commissioning (Cx) projects. Used daily by field engineers at Isotherm Engineering. **Deployed** (https://isotherm-app.vercel.app). Live modules: auth & roles; routed app (react-router-dom — the internal Dashboard is home); directory (companies/contacts + typed phones/emails, locations, role vocabulary); projects (classification framework, dates, team matrix); issues log (full ASHRAE 202 findings register with diary + photos); Cx Index (12-group/88-col); equipment register (11 type templates, tag glossary, attachments); site reports (PDF+DOCX); **checklist engine** (14-table template/instance/response schema, multi-unit fill with offline outbox, auto-findings with duplicate prevention, completed + blank hand-out document generation, multi-unit copy feature); **meeting minutes** (typed meetings, agenda skeletons, carry-forward, generated minutes); **internal dashboard** (Attention Queue, portfolio, charts, responsible rollup). Document generation shares `api/_shared/doc-common.ts`. External integrations (construction PM tools, BAS systems) are seamed but not yet built.

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI framework | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (utility-first, no config file) |
| Build | Vite 6 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) — ca-central-1 |
| DB access | `@supabase/supabase-js` v2 (PostgREST + Realtime client) |
| Font | IBM Plex Sans (UI) + IBM Plex Mono (identifiers, dates) via Google Fonts |
| Tests | Playwright (browser-driven, key user flows) |

---

## Folder Structure

```
src/
├── lib/
│   ├── supabase.ts             # Supabase client singleton — the only place @supabase/supabase-js is imported
│   ├── auth.ts                 # Auth helpers: signIn, signOut, sendPasswordReset, updatePassword
│   ├── format.ts               # formatDate / formatDateRange
│   ├── classifications.ts      # Classification config fetch, selections, validation, deliverable composition
│   ├── photos.ts               # Finding-photo compression + upload (shared: Issues Log + checklist fill)
│   ├── checklistOutbox.ts      # Durable offline write queue (localStorage, natural-key upserts) + tests
│   ├── dashboardThresholds.ts  # THE thresholds (visit 14/30, finding 30d, draft 7d, checklist 14d) + band helpers
│   └── dashboardData.ts        # Dashboard reads + fetchProjectStatsMap (ONE derivation for cards AND
│                               # the project Overview stat header) + useProjectStats hook. Zero writes.
│
├── types/database.ts           # Schema mirror. Rule: update FIRST whenever the DB schema changes.
├── contexts/AuthContext.tsx    # session + profile (id/name/email/role) via useAuth()
│
├── components/
│   ├── ui/Modal.tsx            # Reusable overlay modal
│   ├── ClassificationPicker.tsx / ClassificationBadges.tsx
│   ├── EquipmentPicker.tsx     # Grouped searchable register picker (Systems first, category order)
│   ├── FindingPicker.tsx       # "#12 — title" searchable select; display-only linkage
│   ├── VisitChip.tsx           # THE last-visit chip (bands from dashboardThresholds) — one component everywhere
│   └── ProjectStatHeader.tsx   # Project Overview stat header (same derivation as dashboard cards)
│
├── routes/ProjectDetailRoute.tsx  # /projects/:id wrapper — supplies companies to ProjectDetailPage
│
├── pages/
│   ├── LoginPage.tsx / ResetPasswordPage.tsx
│   ├── DashboardPage.tsx       # HOME (/) — sections A·Now, B·Projects, C·Findings, D·Mine (Recharts)
│   ├── ProjectsPage.tsx        # /projects — list, filters, create; navigates to /projects/:id
│   ├── ProjectDetailPage.tsx   # Tabs: Overview · Team · Issues Log · Cx Index · Equipment ·
│   │                           #       Site Reports · Meetings · Checklists (tab lives in ?tab=)
│   ├── DirectoryPage.tsx / IssuesLogPage.tsx / CxIndexPage.tsx / EquipmentPage.tsx
│   ├── SiteReportsPage.tsx / MeetingsPage.tsx / ChecklistsPage.tsx / TeamPage.tsx
│   ├── TemplatesPage.tsx       # Firm checklist template library (IVC/PFC/FPT)
│   └── ClassificationsPage.tsx # Admin: dimensions/options, Systems, Company Roles,
│                               #        Meeting Types + Default Topics, Deliverable Templates
│
├── main.tsx                    # <AuthProvider> wrap
└── App.tsx                     # Auth gate → <BrowserRouter> shell (sidebar NavLinks, route table)

api/
├── _shared/doc-common.ts       # SHARED doc layer (not an endpoint — underscore path):
│                               # esc/iso helpers, letterhead (PDF + DOCX variants), BASE_CSS,
│                               # toPdf(html, footer) via Puppeteer + @sparticuz/chromium-min@133,
│                               # toDocx via html-to-docx (width: stripped from th/td),
│                               # uploadDocPair (storage + cache-busted URLs).
│                               # NOTE: import with explicit .js extension (Vercel ESM runtime).
├── generate-report.ts          # Site Notes (maxDuration 60)
├── generate-checklist.ts       # IVC/PFC documents — completed + blank hand-out modes (maxDuration 60)
└── generate-minutes.ts         # Meeting minutes (maxDuration 60)
```

---

## Layers

### Data Layer — `src/lib/supabase.ts` + `src/lib/auth.ts` + `src/types/database.ts`

All Supabase access goes through the single `supabase` client exported from `src/lib/supabase.ts`. No page or component imports from `@supabase/supabase-js` directly — they import from this module. This is the **integration seam**: if the backend changes, only this file and `auth.ts` change.

`src/lib/auth.ts` wraps the four auth operations (signIn, signOut, sendPasswordReset, updatePassword) used by login/reset pages. `AuthContext.tsx` provides the session + user profile to all components via `useAuth()`, loaded once after the auth state change event fires.

`src/types/database.ts` is the schema mirror. Every table has a matching TypeScript interface. Joined/augmented shapes (e.g. `ProjectWithClient`, `ContactWithCompany`, `FindingWithParty`) extend the base types and are used in query results. **Rule:** when the DB schema changes, update this file first.

Key enums: `ProjectType`, `UserRole`, `FindingStatus`, `FindingOrigin`, `CxProgress`, `ChecklistType`, `DeliverableType`, etc.

### Business Logic

Currently co-located with pages (inside the component's functions). At this stage the app is primarily CRUD, so heavy extraction would be premature. The natural seam for extraction: if a piece of logic needs to be shared across two pages, or if it becomes complex enough to need independent testing, move it to a `src/lib/` module.

**Examples of where logic should eventually live in `src/lib/`:**
- Finding number generation / validation
- Report generation (Phase 6)
- Cx Index scoring

### UI Layer — `src/pages/` + `src/components/`

Pages own their own data fetching, local state, and layout. Shared UI primitives (Modal, future: Button, Badge, etc.) live in `src/components/ui/`. No page imports from another page's internals.

**Two-panel pattern** (list narrows to sidebar when an item is selected): used in DirectoryPage and IssuesLogPage. The active item drives both panels; closing the detail resets to full-width list.

---

## Database Schema (key tables)

```
── Auth ──────────────────────────────────────────────────────────────────────

auth.users            → Supabase-managed; email + password only (public signup DISABLED)
user_profiles         → id (= auth.uid()), name, email, role (admin|developer|user|client)
                        get_my_role() SECURITY DEFINER function reads this bypassing its own RLS —
                        required to bootstrap the RLS chicken-and-egg cycle.
                        Missing profile row → "Account setup incomplete" screen at login.

RLS pattern (38 tables as of Phase 1):
  Firm-level tables (trade_types, equipment_tag_glossary, cx_default_*, etc.):
    SELECT: admin | developer | user
    ALL:    admin | developer
  Project-scoped tables (findings, equipment, site_reports, cx_cell_values, etc.):
    ALL:    admin | developer | user
  user_profiles:
    SELECT own row: WHERE id = auth.uid()
    ALL:            admin
  All policies call get_my_role() — a SECURITY DEFINER function — to avoid RLS recursion on user_profiles.

── Directory & Projects ───────────────────────────────────────────────────────

projects              → the top-level entity; status: active | completed
project_phases        → ordered phases per project (FK → projects CASCADE)
project_trades        → which trade_types are in scope per project (junction)
trade_types           → firm-wide master list of disciplines
project_distribution  → contact list per project (FK → projects, contacts)

companies             → firms (clients, contractors, vendors)
company_roles         → what roles a company plays (many per company)
contacts              → people at companies

── Project classification framework (replaces project_type; 2026-07) ─────────

classification_dimensions  → firm-level, admin-editable: name, selection_mode
                             (single|multi), required (RUNTIME flag — enforced by the
                             creation modal, deliberately not a DB constraint),
                             sort_order, active
classification_options     → per dimension: label, group_label (optgroup band),
                             description, sort_order, active
                             UNIQUE (id, dimension_id) as composite-FK target
project_classifications    → project ↔ option junction. Denormalized dimension_id with
                             composite FK (option_id, dimension_id) → options, so a row
                             can never claim an option under the wrong dimension.
                             Single-mode enforced by trigger
                             (enforce_single_mode_classification).
deliverable_templates      → DOCUMENT pool (Cx Plan, OPR review, Systems Manual…).
                             Deliberately separate from checklist_templates (equipment
                             IVC/PFC/FPT) — never conflate the two pools.
option_deliverable_defaults → option → deliverable_template mapping. Project creation
                             composes the union of all selected options' defaults into
                             project_deliverables (per-project editable copy).

All five carry org_id (rule 17). RLS: firm-config pattern on the config tables,
project-scoped on the junction. projects.project_type (column + enum type) was
REMOVED 2026-07-17 — classifications are the only source of truth.

── Directory child tables (2026-07 enhancement) ───────────────────────────────

company_role_types    → managed role vocabulary (name, abbreviation, sort, active);
                        directory tags AND team-matrix seats share it
company_locations     → one-to-many offices; at-most-one primary (partial unique)
company_trades        → junction to trade_types
contact_phones        → typed (mobile|office|landline|site) + extension; partial-unique primary
contact_emails        → label + is_primary; partial-unique primary
                        Render rule everywhere: primary row ?? legacy contacts.email/phone (dual-read)

── Team matrix ────────────────────────────────────────────────────────────────

project_team_assignments → project seat: role_type_id + company_id (NOT NULL) +
                        contact_id (nullable; composite FK (contact_id, company_id) →
                        contacts(id, company_id), column-scoped ON DELETE SET NULL so
                        contact deletion degrades the seat to company-only).
                        UNIQUE NULLS NOT DISTINCT (project, role, company, contact).
                        Referenced by meeting_items.responsible_assignment_id and the
                        dashboard's responsible rollup (company-id keys).

── Issues Log (FULL ASHRAE 202 register as of 2026-07) ────────────────────────

findings              → issues log entries per project
                        number (text, auto-managed, NOT renumbered on delete — gaps are intentional)
                        title (UI-required at creation; DB-nullable for history)
                        description (the issue itself — replaces initial-diary seeding;
                          the diary is the dated RESOLUTION record and starts empty)
                        identified_by (text, defaults current user) · building_area ·
                        corrective_action — all additive nullable (rule 4, no backfill)
                        category (from project trades or 'INFO'), responsible_party_id (FK → contacts)
                        origin: site_visit | ivc | pfc | fpt
                        date_raised = "Date Identified" (editable); date_closed = "Date
                        Resolved" (label only — auto-set on close via trigger, cleared on
                        reopen, editable while closed)
                        linked_equipment_id (FK → equipment; picked via EquipmentPicker)
                        Report rendering: register fields emit ONLY when present →
                        historical findings regenerate byte-clean (pw-report-regen gate)
finding_diary_entries → append-only dated diary per finding (oldest-first); CASCADE on finding_id
finding_photos        → photo records per finding; storage_url = Supabase Storage full public URL
                        path convention: findings/{finding_id}/{timestamp}.jpg
                        CASCADE on finding_id

── Checklist engine (Phase 2 — 14 tables) ─────────────────────────────────────

checklist_templates / _template_sections / _template_items / _template_grids /
_template_signoffs  → firm pool. Template TYPE comes from the SOURCE master's
                      identity (Prefunctional folder → pfc; Installation
                      Verification → ivc; Functional Testing → fpt) and the name
                      follows the type ("⟨Equipment⟩ Prefunctional Checklist").
                      Series codes live in revision_label only (branding rule).
checklist_instances / _instance_sections / _instance_items / _instance_grids /
_instance_signoffs / _instance_targets → FULL SNAPSHOT copies at creation (name/
                      type/revision + structure); instances never read the template
                      after creation (rule 4). Multi-unit via targets (2–4 units,
                      parallel columns; nameplate_snapshot frozen at completion).
checklist_responses / checklist_grid_responses / checklist_finding_links
                    → natural-key upserts (the outbox's idempotency foundation);
                      one finding per item per target (link uniqueness).

── Meeting minutes (2026-07 — 6 tables) ───────────────────────────────────────

meeting_types / meeting_type_default_topics → admin reference (Classifications
                      screen). Default topics are the agenda SKELETON —
                      copied into new meetings, never referenced.
meetings              → per-project per-type integer numbering (auto-suggested,
                      editable, soft duplicate warning); draft|issued; issued_at
                      stamped on FIRST issue (7-day disclaimer clock)
meeting_topics        → the meeting's OWN agenda copy (rule 4)
meeting_attendees     → contact FK + snapshots stamped at pick time (survives
                      directory churn); role auto-attributed from the team matrix;
                      present|regrets|distribution
meeting_items         → item_number text "{meeting#}.{seq}" stamped once, NEVER
                      renumbered; carried_from_item_id; responsible = team-matrix
                      FK or free-text fallback (never string-matched); display-only
                      linked_finding_id. Carry-forward copies OPEN items from the
                      most recent prior meeting of the type, retaining numbers;
                      unmatched topics → auto "Old Business"; closing a carried
                      item never touches the prior meeting.

── Dashboard read layer ───────────────────────────────────────────────────────

dashboard_checklist_coverage → VIEW (security_invoker = true — REQUIRED: a plain
                      Postgres view runs as owner and silently bypasses RLS; the
                      invoker flag is asserted inside the migration). Per-project
                      responses-recorded vs items×targets expected. The dashboard
                      is otherwise plain authenticated reads — zero writes.

── Cx Index ───────────────────────────────────────────────────────────────────

equipment             → single source for BOTH Cx Index rows and Equipment tab entries.
                        equipment_type text column maps to field template (e.g. 'ahu', 'pump').
                        nameplate_extra jsonb stores {spec:{}, shop_drawing:{}, installed:{}}
                        keyed by field_name. Basic fields (manufacturer, model, etc.) on root
                        columns; type-specific fields in nameplate_extra.

equipment_tag_glossary     → firm-level editable tag glossary (~80 entries: tag, descriptor,
                              discipline, equipment_type, category_label, sort_order)
equipment_type_field_defs  → firm-level default field defs (11 types × 3 sections × ~8-17
                              fields; never edited by users)
project_equipment_field_defs → per-project editable copy of field defs (same editable-defaults
                              pattern as Cx Index stage groups); initialized from firm defaults
                              on first equipment of that type added to the project
equipment_attachments      → per-equipment file attachments; storage in 'equipment-files' bucket
                              (PDF, DOCX, XLS, images; 20 MB limit)
                              file_type: shop_drawing|cut_sheet|submittal|startup_report|om_manual|other

cx_default_stage_groups → firm-level default template: 12 stage groups
cx_default_columns      → 88 columns across the 12 groups (never edited by users)

project_cx_stage_groups → per-project editable copy of stage groups
                          (FK → projects CASCADE; initialized from defaults on first open)
project_cx_columns      → per-project editable columns
                          (FK → project_cx_stage_groups CASCADE; label, sort_order)

── Site Reports ───────────────────────────────────────────────────────────────

site_reports            → numbered Cx Site Notes per project
                          report_number (text), site_visit_date (date), report_date (date),
                          authored_by (text, default 'Tony Faeghi'),
                          progress_narrative (text), show_closed (boolean, default true),
                          doc_register (jsonb → DocRegisterItem[]),
                          storage_url (text, .docx Supabase Storage URL),
                          pdf_url (text, PDF Supabase Storage URL)
                          Generation: Vercel serverless function api/generate-report.ts (Node.js,
                          maxDuration: 60). Two separate HTML builders: buildHtml() for PDF path,
                          buildDocxHtml() for DOCX path (inline styles, no flexbox, width: stripped
                          from th/td to prevent html-to-docx crash). PDF via Puppeteer +
                          @sparticuz/chromium-min@133.0.0; chromium pack downloaded to /tmp on cold
                          start and cached for instance lifetime. Footer via Puppeteer
                          displayHeaderFooter/footerTemplate — NOT position:fixed (which caused
                          rows at page breaks to be clipped/dropped). Row count assertions in
                          buildHtml() log mismatches to Vercel function logs.

cx_cell_values          → sparse progress cells: one row per (equipment × column) where
                          status is set; blank = no row (status: done | in_progress | na)
                          ON DELETE CASCADE on both equipment_id and column_id FKs.
                          Unique constraint on (equipment_id, column_id).
```

**Cx Index invariants:**
- Editing a project's stage groups/columns NEVER touches `cx_default_stage_groups` / `cx_default_columns`.
- Deleting a column with progress data warns the user first; deletion cascades via FK.
- Progress % per row = done / (total - na); na cells excluded from denominator.
- Collapsed groups show a single summary % cell per equipment row.

**Default stage structure (12 groups, 88 columns — as of 2026-06-21):**
1. Doc Review Stage (11) · 2. Mechanical Static Verification (8) · 3. Plumbing/Domestic (7)
4. Electrical Static - Physical Install (5) · 5. Electrical Testing (14) · 6. BAS Static Verification (6)
7. Pre-FPT Mech (5, includes TAB Air+Water Balancing Reports) · 8. FPT Elec (7, life safety at end)
9. FPT BAS/Mech (5) · 10. IST — Integrated Systems Testing (7, CAN/ULC-S1001)
11. Turnover (8) · 12. Post-Construction (5)

All project-referencing FKs use `ON DELETE CASCADE`. *(Corrected 2026-07-20: an older line here claimed Phase 1 ran dev-permissive RLS "until Phase 7" — real per-role RLS via `get_my_role()` has been live since Phase 1 completion; the dev allow-all policies were fully replaced.)*

### Conventions (MASTER-BRIEF rules 16–17)
- Every new table carries `org_id uuid` (nullable, defaulted to the Isotherm org,
  indexed). RLS still keys on project membership; org_id is Phase 11 groundwork.
- Evidence attached to issues is snapshotted into `metadata_json` at attach time —
  closed issues never change because source data changed.

### BAS layer (Master Phase 6/8 — full DDL in docs/BAS-SPEC.md §3)
`bas_sources` · `bas_points` · `bas_point_mappings` · `bas_imports` ·
`trend_samples` (PK `(bas_point_id, ts)`) · `trend_events` ·
`sequence_documents` · `sequence_clauses` · `ai_analysis_runs` · `ai_candidate_findings`
Links to existing tables: `bas_point_mappings.equipment_id → equipment`,
`ai_candidate_findings.accepted_issue_id → issues`.

---

## Storage

**`finding-photos`** bucket (public, 10 MB limit).
- Compression + upload live in `src/lib/photos.ts`, shared by the Issues Log and checklist fill-out.
- Upload: browser canvas → JPEG (1400px max, 0.82 quality) → upload → store full public URL in `finding_photos.storage_url`
- Delete: remove DB record first, then Storage file (best-effort)
- Path: `findings/{finding_id}/{timestamp}.jpg` — only needs the finding id, so it works with a
  client-generated id (a finding still queued in the checklist outbox can still take photos).

> **KNOWN LIMITATION — photos require a live connection.** The checklist outbox
> (`src/lib/checklistOutbox.ts`) makes responses, grid readings, signoffs and findings survive a
> dead-signal mechanical room, but it cannot carry photos: image blobs do not fit in localStorage,
> and durable offline blobs would need IndexedDB — deliberately out of scope (§9A right-sizing).
>
> Behaviour is therefore honest rather than lossy: an upload that fails offline keeps the finding
> modal open, reports exactly how many photos failed, and retains **only** the failed files so a
> retry cannot duplicate ones that already landed. The finding itself is never lost — it queues.
>
> **Workaround:** once back in coverage the queued finding exists in the Issues Log; attach the
> photo to it there.

**`equipment-files`** bucket (access-controlled, 20 MB limit).
- PDF, DOCX, XLS, images for equipment shop drawings, submittals, cut sheets, O&M manuals, etc.
- `equipment_attachments.storage_url` stores full URL; `file_type`: shop_drawing | cut_sheet | submittal | startup_report | om_manual | other

**`site-reports`** bucket (public, no size limit effectively).
- Generated by `api/generate-report.ts` serverless function on Vercel
- Stored at `{project_id}/{report_number}.docx|.pdf`; cache-busted URLs in
  `site_reports.storage_url` / `pdf_url` *(corrected 2026-07-20 — an older line
  documented a `{report_id}/report.docx` path that was never the deployed layout)*

**`checklists`** bucket (public) — generated IVC/PFC documents (completed + blank modes), from `api/generate-checklist.ts`.

**`meeting-minutes`** bucket (public) — generated minutes at `{project_id}/{type-slug}-{n}.pdf|docx`, from `api/generate-minutes.ts`.

> **§12 OPEN ITEM — storage privacy hardening (pre-client-rollout).** Every document
> bucket above is public with unguessable URLs, mirroring the original pattern.
> Required before client rollout / portal: ONE batched pass converting all document
> storage to private buckets + signed URLs across every download link. Canonical
> register: MASTER-BRIEF §12.

**Rule for new buckets:** no new public buckets without review. Access-controlled storage uses signed URLs or service-role upload only.

- `bas-trend-files` (private) — uploaded BAS trend exports; originals retained for audit/replay
- `bas-documents` (private) — BAS submittals/shop drawings. **Source PDFs contain network
  details and credentials — never public; extraction redacts credential lines (BAS-SPEC §8).**

---

## Routing (react-router-dom — landed 2026-07-19)

Auth gating precedes the router: `/reset-password` bypass → loading → login →
no-profile fallback → `<BrowserRouter>` shell. Route map:

| Route | Renders | Notes |
|---|---|---|
| `/` | DashboardPage | HOME. `client` role → `<Navigate to="/projects">` — never reaches the dashboard |
| `/projects` | ProjectsPage | list; row click navigates |
| `/projects/:projectId` | ProjectDetailRoute → ProjectDetailPage | active tab lives in `?tab=` (`issues`, `meetings`, `checklists`, `site_reports`, …) so dashboard rows and external links deep-link straight to a tab |
| `/directory` `/templates` | pages | |
| `/classifications` | ClassificationsPage | admin/developer only (route guard + nav gating; RLS is the real enforcement) |
| `/reset-password` | ResetPasswordPage | pre-router bypass, unchanged |
| `*` | redirect `/` | |

Sidebar items are `<NavLink>`s. `vercel.json` rewrites all non-`api/` paths to
`index.html` (SPA). Historical note: before the router the app had exactly one URL —
nothing could break when it landed; the full Playwright battery re-ran green as the gate.

---

## Design Tokens

| Token | Value | Use |
|---|---|---|
| Primary action | Teal-700 `#0F766E` | Buttons, active states, underlines |
| Sidebar bg | Slate-900 | |
| Content bg | White / Slate-50 | |
| Mono font | IBM Plex Mono | COM#, dates, finding numbers |
| UI font | IBM Plex Sans | Everything else |

---

## Naming Conventions

- **Files:** PascalCase for components/pages (`ProjectsPage.tsx`), camelCase for lib modules (`supabase.ts`)
- **DB columns → TS fields:** snake_case in DB, camelCase only in joined/computed properties; raw DB rows use snake_case as-is
- **State:** plain descriptive names (`findings`, `allContacts`, `selectedId`); boolean flags use `is-` only when truly ambiguous
- **Async functions:** named for what they do (`fetchFindings`, `saveEdit`, `deletePhoto`) not for network verbs (`get`, `post`)
- **Modals:** `xyzOpen: boolean` + `xyzForm: FormType` pairs

---

## Integration Seams

These are the points where external services connect. Each is a single-file boundary:

| Seam | Location | Notes |
|---|---|---|
| Supabase DB | `src/lib/supabase.ts` | All table queries go through this client |
| Supabase Storage | `src/lib/supabase.ts` (same client) | `supabase.storage.from(bucket)` |
| Future: construction PM API | `src/lib/pmAdapter.ts` (not yet built) | Will wrap project create/sync |
| BAS file ingestion | `src/lib/bas/adapters/` (registry + per-vendor adapters) | Master Phase 6; spec: `docs/BAS-SPEC.md`. Vendor-specific parsing lives ONLY here; first adapter: Delta enteliWEB. Live connections: seams S-CONNECT-DELTA / S-WORKER (Master Phases 8–9). |

**Rule:** when a new external integration is needed, create a new adapter module in `src/lib/`. Pages and components must not call external APIs directly.

---

## Open Design Decisions (pending)

### IST — Integrated Systems Testing (CAN/ULC-S1001)

IST is now included as **Group 10** in the Cx Index default stage structure with 7 columns:
IST Plan Prepared · Cause-and-Effect Matrix Developed · Trades Coordinated · IST Execution/Witnessing · Deficiencies Documented · IST Report Issued · AHJ/Fire Dept Acceptance.

This tracks IST progress at the equipment/system level within the same matrix. No separate IST module is planned.

---

## How to Add a New Feature

1. **DB change** → write a Supabase migration, update `src/types/database.ts`
2. **New page** → add `src/pages/NewPage.tsx`, wire into `App.tsx` routing
3. **New shared component** → `src/components/ui/` (only if used in ≥2 places)
4. **New external integration** → `src/lib/newAdapter.ts`, never inline in a page
5. **Update this file** if the structure changes materially

---

## Testing

**HARD RULE: automated tests run ONLY against the "ZZ-TEST — Do Not Use" project**
(guarded by `pw-config.mjs` — `openTestProject` throws on anything else).
Test-created projects use ZZ-TEST-prefixed unique names. Credentials come from
`.env` (`node --env-file=.env <script>`) — never hardcoded.

The standing battery (repo root, `pw-*.mjs`) — all self-cleaning:
- `pw-report-regen.mjs` — regeneration byte-clean diff (the gate for any change
  near the report path; before/after capture, normalized-text compare)
- `pw-checklist-docs.mjs` — four-deliverable checklist content audit (known
  limitation: the ASCII PDF probe can't read glyph-encoded text — PDFs are
  verified via `pw-pdf-shot.mjs` PNG rendering instead)
- `pw-copy.mjs` — multi-unit copy: never-overwrite, copied-N-opens-finding-modal
- `pw-finding-register.mjs` — full ASHRAE register: create → detail → report
  lines → delete → byte-clean restore
- `pw-pfc-verify.mjs` — template typing/naming flows to new instances
- `pw-meetings.mjs` — topic seeding, matrix attribution, minutes content,
  carry-forward number retention, close-carried-item isolation
- `pw-dashboard.mjs` — seeds one state per widget (INSERT-TIME timestamps — only
  updates get trigger-stamped), asserts chips/queue/deep-links/rollup, self-cleans
- plus earlier-era flow scripts (`pw-team`, `pw-dates`, `pw-directory`, …)

**Deploy-verification pattern (learned the hard way):** Vercel queues builds; a
"READY" older deploy can still be serving when a test starts. Before any
production-gated test run, poll until the SERVED JS bundle contains a marker of
the change (fetch index.html → asset URL → grep the bundle), not just the
deployment state. A gate run against a stale bundle is void — re-run and say so.

- BAS parsers: Vitest unit tests against real-file fixtures in `fixtures/bas/`
  (sanitized TDSB exports — TL/MT variants, Excel-damaged file, sentinel values).
  Playwright covers upload → review → commit.
- Checklist fill-out: field-resilience acceptance tests (autosave per response,
  offline/reconnect without data loss) per MASTER-BRIEF Phase 2.

---

## Data Retention & Portability

**Legal requirement:** Ontario requires completed project records to be retained for **10 years**. All build decisions must keep data in the firm's custody and in formats that remain openable in 2036 regardless of the app's future.

**Standing rule: never lock data into proprietary formats.** Every piece of project data must be exportable in standard formats at any time:

| Data type | Format | How it exits |
|---|---|---|
| All relational data | PostgreSQL | Supabase full DB export (pg_dump); project-level SQL export (Phase 3 feature) |
| Photos & file attachments | JPEG / original format | Retrievable from Supabase Storage via standard HTTP at any time |
| Reports (site reports, IVC/PFC, FPT) | `.docx` + PDF | Generated on demand; stored as files, not in opaque binary columns |
| Structured project data | JSON / CSV | Queryable from Postgres; exportable as standard relational tables |

**Current status (Phase 1):** all formats are already portable.
- DB: standard PostgreSQL via Supabase (pg_dump-compatible at any time)
- Photos: stored as standard JPEG files in Supabase Storage; `finding_photos.storage_url` holds the full public URL — files are retrievable independently of the app
- No proprietary binary formats, no opaque blobs, no vendor-specific encodings

**What NOT to do (enforce this as new features are built):**
- Do not store report content in binary blobs inside the DB — generate and store as `.docx`/PDF files
- Do not serialize UI state or config as opaque JSON without a documented schema
- Do not use any storage or DB feature that makes bulk export harder (e.g., Supabase-specific encrypted columns without export tooling)

**Export feature (Phase 3, not yet built):** a per-project export that bundles reports, photos, and a data snapshot into a portable folder for archiving to the firm's on-premise server (ShareSync). The data architecture already supports this — no rework needed when that feature is added.

---

## Standing rules (permanent — apply to every session)

- **ShareSync is READ-ONLY, absolutely** (`C:\Users\TonyF\My ShareSync`). List/read
  only. Working copies land ONLY in gitignored `samples/`. Client-confidential
  content never reaches the repo, GitHub, commits, code, or test fixtures. Check
  `git status` before every commit while ShareSync-sourced files exist locally.
- **Branding rule:** source masters carry legacy branding — extract CONTENT only.
  All generated output renders Isotherm identity; source series codes live in
  `revision_label`/description, never in rendered titles; source signoff company
  names become generic roles.
- **Template typing:** type from the source master's identity (Prefunctional →
  pfc, Installation Verification → ivc, Functional Testing → fpt); names follow
  type; ask when ambiguous — never guess.
- **ZZ-TEST only** for automated tests (see Testing above). Suites verify CONTENT as
  dev.test (employee); privileged seed/cleanup (project create/delete, issued-meeting
  and finding deletes) runs as dev.admin — the §6.1 credential split.
- **Access control (2026-07-20, as-built record: docs/ACCESS-CONTROL-PROPOSAL.md):**
  global role × project membership. Employees see member projects only
  (`project_members` + `is_project_member()` helpers on every project-scoped policy);
  leads additionally edit project settings; owners (admin/dev) create/complete/delete
  projects, manage membership, and hold all hard-deletes (findings, equipment, issued
  documents, completed instances). Creator auto-membership and the project
  status-guard are DB triggers. The boundary is visibility and destruction — never
  workflow (inline-adds and all content work stay member-open).
- **Commit and push are one action.** Never leave local-only commits; report push
  failures immediately.
- **Rule 4 (records):** completed/issued artifacts are frozen point-in-time
  records — corrections change templates/live rows only; snapshots and issued
  documents are never rewritten.

---

*Last updated: 2026-07-20 — routed app with the internal Dashboard as home; checklist engine built through document generation (blank + completed modes, multi-unit copy feature) with real-form seeding in progress (AHU pfc seeded; Boiler next); Meeting Minutes end-to-end; findings full ASHRAE 202 register; doc-common shared generation layer; meeting-types admin sections. See Build Spec §1A for the authoritative module list.*
