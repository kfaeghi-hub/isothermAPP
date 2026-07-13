# Isotherm Cx System — Architecture

> **Standing principle (§9B):** Clear separation of data / logic / UI. Consistent structure. External integrations behind adapter boundaries. Strong typing. Tests on critical flows. Clarity and modularity over cleverness, without over-abstracting for hypothetical needs.

---

## Overview

A React SPA for managing building commissioning (Cx) projects. Used daily by field engineers at Isotherm Engineering. **Phase 1 is complete and deployed** (https://isotherm-app.vercel.app): auth & roles, directory, projects, issues log (findings diary + photos + delete), Cx Index (12-group/88-col), equipment register (type-specific field templates, tag glossary, file attachments), and site reports (PDF + DOCX generation via Vercel serverless). Phase 2 (checklist engine — IVC/PFC/FPT templates and instances with auto-findings) is next. External integrations (construction PM tools, BAS systems) are seamed but not yet built.

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
│   ├── supabase.ts        # Supabase client singleton — the only place @supabase/supabase-js is imported
│   ├── auth.ts            # Auth helpers: signIn, signOut, sendPasswordReset, updatePassword
│   └── projectTypes.ts    # Project-type labels/badges + shared formatDate()
│
├── types/
│   └── database.ts        # TypeScript interfaces mirroring DB schema exactly.
│                          # Rule: update here first whenever the DB schema changes.
│                          # Includes joined types used in UI queries (e.g. ProjectWithClient, FindingWithParty)
│
├── contexts/
│   └── AuthContext.tsx    # Provides session, profile (id/name/email/role), loading, signOut.
│                          # Wraps app via <AuthProvider> in main.tsx.
│                          # Loads user_profiles row after auth state change; bubbles "no profile" state.
│
├── components/
│   └── ui/
│       └── Modal.tsx      # Reusable overlay modal (title, onClose, maxWidth prop)
│
├── pages/
│   ├── LoginPage.tsx          # Branded login card (navy #1F3A5F, teal accent) + inline forgot-password flow
│   ├── ResetPasswordPage.tsx  # Password reset — listens for PASSWORD_RECOVERY auth event; signs out + redirects on success
│   ├── ProjectsPage.tsx       # Project list (active/completed tabs, search, filters, create, delete)
│   ├── ProjectDetailPage.tsx  # Single-project shell with tab nav: Overview · Cx Index · Issues Log · Equipment · Site Reports
│   ├── DirectoryPage.tsx      # Company + contact management (two-panel layout)
│   ├── IssuesLogPage.tsx      # Findings log (two-panel list/detail, diary, photos, delete with confirmation)
│   ├── CxIndexPage.tsx        # Cx Index matrix (12-group/88-col progress, stage structure editor)
│   ├── EquipmentPage.tsx      # Equipment/Systems Register (type-specific field sections, tag autocomplete, attachments)
│   └── SiteReportsPage.tsx    # Site reports list + create + trigger PDF/DOCX generation
│
├── main.tsx               # Entry point: wraps app in <AuthProvider> from AuthContext
└── App.tsx                # Root: auth gate (reset-password bypass → loading → login → no-profile fallback → app shell)
                           # Sidebar: Isotherm branding, nav sections by phase, user name/role + logout button

api/
└── generate-report.ts     # Vercel serverless function (Node.js runtime, maxDuration: 60)
                           # POST handler: fetches project + report data from Supabase, fetches finding photos,
                           # builds two separate HTML strings (PDF path and DOCX path), generates both outputs.
                           # PDF: Puppeteer + @sparticuz/chromium-min@133.0.0 (chromium-pack downloaded to /tmp on cold start)
                           #      displayHeaderFooter/footerTemplate for disclaimer (not position:fixed, which clips rows)
                           # DOCX: html-to-docx@1.8.0 (inline styles only; width: stripped from th/td to prevent crash)
                           # Uploads both to Supabase Storage 'site-reports' bucket; stores public URLs in site_reports row
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

── Issues Log ─────────────────────────────────────────────────────────────────

findings              → issues log entries per project
                        number (text, auto-managed, NOT renumbered on delete — gaps are intentional)
                        title (text nullable — optional specific description above the category)
                        category (from project trades or 'INFO'), responsible_party_id (FK → contacts)
                        origin: site_visit | ivc | pfc | fpt
                        linked_equipment_id (FK → equipment, nullable)
                        Deletable: CASCADE on diary entries + photos; storage files deleted best-effort
finding_diary_entries → append-only dated diary per finding (oldest-first); CASCADE on finding_id
finding_photos        → photo records per finding; storage_url = Supabase Storage full public URL
                        path convention: findings/{finding_id}/{timestamp}.jpg
                        CASCADE on finding_id

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

All project-referencing FKs use `ON DELETE CASCADE`. Phase 1 uses dev-permissive RLS (`USING (true) WITH CHECK (true)`) — replaced with real auth policies in Phase 7.

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
- `.docx` stored at `site-reports/{report_id}/report.docx`; URL in `site_reports.storage_url`
- `.pdf` stored at `site-reports/{report_id}/report.pdf`; URL in `site_reports.pdf_url`

**Rule for new buckets:** no new public buckets without review. Access-controlled storage uses signed URLs or service-role upload only.

- `bas-trend-files` (private) — uploaded BAS trend exports; originals retained for audit/replay
- `bas-documents` (private) — BAS submittals/shop drawings. **Source PDFs contain network
  details and credentials — never public; extraction redacts credential lines (BAS-SPEC §8).**

---

## Routing

No router library. `App.tsx` applies auth gating in order: (1) `window.location.pathname === '/reset-password'` bypasses everything → `<ResetPasswordPage>`; (2) `loading` → `<LoadingScreen>`; (3) no session → `<LoginPage>`; (4) session but no `profile` row → "Account setup incomplete" fallback; (5) authenticated → app shell. Within the app shell, `activeItem` string drives which page renders. `ProjectsPage` manages its own `selectedProjectId` state, rendering `<ProjectDetailPage projectId=...>` in place (replaces list, not a new route). A URL router (e.g. TanStack Router) is the natural Phase 3 addition for deep-linking into projects and checklist instances.

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

Playwright scripts in the repo root (`pw-*.mjs`) cover key flows:
- Finding creation → diary entry → photo upload
- Trade selection in project setup → category propagation to Issues Log
- Project status lifecycle (active → completed → reopen)

Future: move to a `tests/` directory with named spec files as coverage grows.

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

*Last updated: 2026-07-05 — Phase 1 complete. All modules built and deployed: auth (login/reset/RLS), directory, projects, trades, issues log (findings + diary + photos + delete), Cx Index (12-group/88-col editable), equipment register (11 type templates, tag glossary, attachments), site reports (PDF + DOCX via Vercel serverless api/generate-report.ts). Phase 2 (checklist engine) in progress.*
