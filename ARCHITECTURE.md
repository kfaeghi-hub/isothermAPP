# Isotherm Cx System — Architecture

> **Standing principle (§9B):** Clear separation of data / logic / UI. Consistent structure. External integrations behind adapter boundaries. Strong typing. Tests on critical flows. Clarity and modularity over cleverness, without over-abstracting for hypothetical needs.

---

## Overview

A React SPA for managing building commissioning (Cx) projects. Used daily by field engineers at Isotherm Engineering. **Deployed** at **https://cx.isothermengineering.com** (custom domain, CNAME → Vercel; the `https://isotherm-app.vercel.app` URL still resolves and works as a fallback). Live modules: auth & roles (5-role model with project membership — see Access control); routed app (react-router-dom — the internal Dashboard is home); directory (companies/contacts + typed phones/emails, locations, role vocabulary); projects (classification framework, dates, team matrix, membership); issues log (full ASHRAE 202 findings register with diary + photos); Cx Index (12-group/88-col); equipment register (11 type templates, tag glossary, attachments); site reports (PDF+DOCX); **checklist engine** (14-table template/instance/response schema, multi-unit fill with offline outbox, auto-findings with duplicate prevention, completed + audience-aware blank + transposed check_table document generation, multi-unit copy feature) with a **fully seeded template library — 238 templates: 181 ivc / 57 pfc** (campaigns closed 2026-07-21; `docs/CSA-SEEDING-LOG.md`, `docs/PFC-SEEDING-LOG.md`, method in `docs/EXTRACTION-PLAYBOOK.md`); **meeting minutes** (typed meetings, agenda skeletons, carry-forward, generated minutes); **Deliverables tab** (four-state lifecycle, ad-hoc rows, compose-from-classification, LEED sets incl. dormant Envelope BECx); **internal dashboard** (Attention Queue incl. overdue deliverables, portfolio, charts, responsible rollup, My Items). Document generation shares `api/_shared/doc-common.ts` (generate-checklist is a deliberate self-contained sibling — it needs landscape + per-mode footers). External integrations (construction PM tools, BAS systems) are seamed but not yet built.

> **Schema provenance:** there is no `supabase/migrations/` tree — DDL is applied to the
> live DB via the Supabase Management API/MCP. Canonical as-built sources:
> `src/types/database.ts` (column-exact mirror; update FIRST on any schema change), the
> three as-built proposal docs (`docs/ACCESS-CONTROL-PROPOSAL.md`,
> `docs/OWNER-TIER-PROPOSAL.md`, `docs/DELIVERABLES-TAB-PROPOSAL.md`), and this file.
> Verbatim policy/function bodies live only in the database (`pg_policies`, `pg_proc`).

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI framework | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (utility-first, no config file) |
| Build | Vite 6 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) — ca-central-1 |
| DB access | `@supabase/supabase-js` v2 (PostgREST + Realtime client) |
| Font | Archivo (display + body, variable width) + Spline Sans Mono (identifiers, dates) via Google Fonts — see UI & Design System |
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
│   ├── landing/                # PUBLIC landing page — V2 CINEMATIC (2026-07-22,
│   │   │                       # docs/LANDING-PAGE-PROPOSAL.md V2). Contained lazy
│   │   │                       # chunk; gsap/lenis/three imported ONLY here.
│   │   ├── LandingPage.tsx     # mode switch: reduced-motion → StaticLanding,
│   │   │                       # else CinematicLanding
│   │   ├── CinematicLanding.tsx# Lenis + GSAP/ScrollTrigger choreography: word-
│   │   │                       # stagger hero → pinned 4-phrase stage → crescendo
│   │   ├── BuildingSection.tsx # V5 centerpiece: cutaway wireframe building with
│   │   │                       # penthouse plant (chiller/boiler/cooling tower w/
│   │   │                       # rotating fan ring), per-floor terminal variety,
│   │   │                       # dampers/valves/diffusers, exhaust riser, stair
│   │   │                       # core, two-way airflow particles, hydronic +
│   │   │                       # electrical risers, and the BAS control web
│   │   │                       # (dashed runs → DDC panels → head end, signal
│   │   │                       # pulses, sensor blinks). FIVE ignition beats:
│   │   │                       # air → hydronic → electrical → controls →
│   │   │                       # complete (cumulative memory-glow). Thin
│   │   │                       # additive line primitives only — diagrammatic,
│   │   │                       # never photoreal. WebGL failure → CSS contour
│   │   ├── CssContour.tsx      # flat SVG contour (fallback + static variant bg)
│   │   ├── StaticLanding.tsx   # reduced-motion first-class path: no motion, no
│   │   │                       # canvas, all content visible
│   │   ├── landing.css         # word masks, fallback drift, reduced-motion stills
│   │   └── sections/LandingFooter.tsx
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
├── generate-checklist.ts       # IVC/PFC documents (maxDuration 60) — FOUR render modes:
│                               # completed · blank Field Copy · blank Contractor Hand-out
│                               # (audience defaults by type: ivc → field, else contractor;
│                               # explicit param wins) · check_table transposed fleet mode.
│                               # DELIBERATELY self-contained (does NOT import doc-common):
│                               # needs landscape PDFs + per-mode footers.
└── generate-minutes.ts         # Meeting minutes (maxDuration 60)

├── _shared/auth-common.ts      # Auth/authz for the generate-* endpoints (as-built
│                               # 2026-07-22, docs/GENERATE-AUTH-PROPOSAL.md):
│                               # applyCors (origin allowlist; foreign origins get NO
│                               # ACAO header) · requireUser (Bearer JWT → 401, BEFORE
│                               # any id lookup) · requireProjectAccess (RLS M-pattern
│                               # mirror: admin/dev OR project_members row — owners
│                               # ride membership; 403). Order: 401 → 404 → 403 →
│                               # service-role pipeline. Gate: pw-generate-auth.
│                               # Endpoints still return PUBLIC storage URLs — the
│                               # storage-privacy pass (§12) closes raw file access.
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
user_profiles         → id (= auth.uid()), name, email, role user_role_enum
                        (admin|developer|owner|user|client — 'owner' via ADD VALUE 2026-07-20)
                        get_my_role() SECURITY DEFINER function reads this bypassing its own RLS —
                        required to bootstrap the RLS chicken-and-egg cycle.
                        Missing profile row → "Account setup incomplete" screen at login.

── Access control (as-built 2026-07-20 — full records: docs/ACCESS-CONTROL-PROPOSAL.md
   + docs/OWNER-TIER-PROPOSAL.md) ───────────────────────────────────────────────

Model: GLOBAL ROLE × PROJECT MEMBERSHIP. The boundary is visibility and
destruction — never workflow (inline-adds and all content work stay member-open).

project_members       → project_id + profile_id (both FK CASCADE), is_lead, added_by;
                        UNIQUE(project_id, profile_id). THE membership wall.

Roles: admin (ALL projects; break-glass/super — dev.admin is an ordinary admin
account, no SQL special-case) · developer (ALL projects; technical/config) ·
owner (member projects ONLY — same scoping as employees; within them everything
admin can do incl. membership management, plus firm-level rights; never user/role
management or orgs writes) · user "Employee" (member projects, content work) ·
client (appears in ZERO policies — fully locked out until the portal).

Helper functions (all SECURITY DEFINER, STABLE; bodies live in the DB):
  get_my_role()            → caller's role text (the root oracle)
  is_admin_or_dev()        → role in (admin, developer) — break-glass meaning
  is_owner() / is_staff()  → role = owner / role in (admin, developer, owner, user)
  is_project_member(pid)   → EXISTS project_members row (NO role condition)
  is_project_lead(pid)     → same AND is_lead
  owner_member(pid)        → is_owner() AND is_project_member(pid) — the owner-split
  my_profile_name()        → caller's profile name (own-drafts matching)

Policy patterns:
  M  (membership)   ALL: is_admin_or_dev() OR is_project_member(project_id) —
                    default for all project content; child tables resolve via parent
  L  (lead-gated)   settings writes: … OR is_project_lead() — dates, classifications,
                    phases, systems-in-scope
  AD+owner split    destructive rights: is_admin_or_dev() OR owner_member(project_id) —
                    project delete/complete, hard-delete findings/equipment, delete
                    ANY checklist instance incl. completed, delete issued docs
  Own-drafts        DELETE also allowed to a member on their OWN unissued draft
                    (prepared_by/authored_by = my_profile_name(); name-text, soft)
  Directory         read/insert/update is_staff(); DELETE admin/dev/owner
  Firm-config       read is_staff(); write admin/dev/owner (templates, dimensions,
                    meeting types, Cx defaults, glossary); orgs writes admin-only
  user_profiles     own-row SELECT + admin ALL; list_internal_profiles() RPC
                    (SECURITY DEFINER, caller-gated inside) feeds the Access card
                    without exposing emails or client rows

DB triggers (bodies in the DB; intent recorded here):
  C2 status-guard         BEFORE UPDATE ON projects — status flips only for
                          is_admin_or_dev() OR owner_member(); leads edit dates,
                          never status
  Creator auto-membership AFTER INSERT ON projects — inserts (project, creator,
                          is_lead=true); DB-level so API/test inserts get it too;
                          service-role inserts (auth.uid() null) skip gracefully.
                          Known trap: INSERT..RETURNING evaluates SELECT policy
                          BEFORE the trigger — the app uses client-generated ids +
                          plain INSERT
  enforce_single_mode_classification — rejects a 2nd option in a single-mode dimension
  findings date_closed    auto-set on close, cleared on reopen
  updated_at stamps       on all mutable tables (INSERT-time timestamps stick —
                          only UPDATEs get stamped; the dashboard tests rely on this)

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

── Deliverables tab (as-built 2026-07-21 — record: docs/DELIVERABLES-TAB-PROPOSAL.md) ─

project_deliverables  → per-project register. template_id (nullable FK → pool) XOR
                        name (ad-hoc) via the pool_or_adhoc CHECK; status enum
                        deliverable_status (not_started | in_progress | submitted |
                        accepted — replaced the old received/complete/na enum via
                        ALTER..USING with formal mapping); date_submitted /
                        date_accepted stamped/cleared APP-SIDE by statusDates()
                        (src/lib/deliverables.ts — the date_closed pattern, not a
                        trigger); assigned_to (profile-name text, §12 convention);
                        due_date, notes, sort_order (up/down arrows, no drag);
                        UNIQUE(project_id, template_id) — the compose idempotency
                        backstop.
Compose:                composeDelta() unions the ACTIVE default templates of the
                        project's selected ACTIVE options minus rows already
                        present; applyCompose() upserts with ignoreDuplicates.
                        Dormant options/templates (active=false) never compose.
Pool-delete fix:        admin deletion of a pool template snapshots its name into
                        project_deliverables.name while nulling template_id —
                        rows degrade to ad-hoc instead of violating the CHECK.
LEED sets (seeded):     Fundamental 7 · Enhanced 14 (Fundamental's 7 replicated + 7)
                        · MBCx 3 · Envelope BECx 6 — option + all 6 templates
                        seeded DORMANT (active=false; activation = two admin
                        toggles + compose when a BECx project is awarded).
Dashboard:              overdue deliverables feed the Attention Queue
                        (DELIVERABLE rows, DELIVERABLE_OVERDUE_GRACE_DAYS) and
                        assigned deliverables surface in My Items.

All tables carry org_id (rule 17). RLS: firm-config pattern on the config tables,
project-scoped (M) on the junctions and register. projects.project_type (column +
enum type) was REMOVED 2026-07-17 — classifications are the only source of truth.

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
_template_signoffs  → firm pool — SEEDED AT SCALE: 238 templates (181 ivc /
                      57 pfc), both campaigns closed 2026-07-21. Extraction method
                      and 26 standing rules: docs/EXTRACTION-PLAYBOOK.md; campaign
                      records: docs/CSA-SEEDING-LOG.md + docs/PFC-SEEDING-LOG.md.
                      Template TYPE comes from the SOURCE master's
                      identity (Prefunctional folder → pfc; Installation
                      Verification → ivc; Functional Testing → fpt) and the name
                      follows the type ("⟨Equipment⟩ Prefunctional Checklist").
                      Series codes live in revision_label only (branding rule).
                      checklist_templates.render_mode selects document layout:
                      null → standard portrait; 'check_table' → transposed fleet
                      mode (landscape, units as rows / items as numbered columns,
                      9-column chunking, status+date cells; DOCX attempted-but-
                      optional — may ship PDF-only with a warning).
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

Every FK that references `projects.id` **directly** uses `ON DELETE CASCADE`, so a
project delete removes its own children. *(Corrected 2026-07-22: an earlier version
of this line generalized that to "all project-referencing FKs," which was wrong for
one **grandchild** edge and caused a real bug. `checklist_instance_targets` sits two
levels down and is reached by two independent cascade branches from a project —
`projects → equipment` and `projects → checklist_instances → checklist_instance_targets`.
Its `equipment_id → equipment` FK was `ON DELETE RESTRICT`; because Postgres doesn't
order sibling cascade branches, the equipment branch could fire while the targets
still existed, aborting the whole project delete with SQLSTATE 23503. The `equipment_id`
FK is now `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED` — the check runs at
COMMIT, after all cascades complete, so a whole-project delete succeeds while a
standalone equipment delete that would orphan a completed checklist's target still
fails, preserving the frozen-record protection (rule 4). See
`migrations/project-delete-fk-fix-migration.sql`.)* *(Corrected 2026-07-20: an older
line here claimed Phase 1 ran dev-permissive RLS "until Phase 7" — real per-role RLS
via `get_my_role()` has been live since Phase 1 completion; the dev allow-all policies
were fully replaced.)*

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

> **ALL FIVE APP BUCKETS ARE PRIVATE (§12 storage privacy pass, executed
> 2026-07-24).** The DB stores bucket-relative PATHS, never URLs; every read
> mints a short-lived signed URL through `api/get-file-url` — row-anchored
> (callers name a table row, never a raw path), running the same
> `applyCors → requireUser → requireProjectAccess` chain as the generate-*
> endpoints. Expiries: documents 10 min (click-to-open), finding photos 60 min
> (batch-signed per finding view). Client-side uploads (finding-photos,
> equipment-files) survive via `is_staff()`-gated INSERT storage policies;
> service-role uploads (documents) are unaffected. Old raw
> `/object/public/...` links died at the flip — by design; no issued .docx/.pdf
> embeds a live storage URL (photos are baked in as base64), so existing
> documents are unaffected. Gate: `pw-storage-privacy.mjs`. Migrations:
> `storage-url-to-path-migration.sql` + `storage-privacy-flip-migration.sql`.

**`finding-photos`** bucket (private, 10 MB limit).
- Compression + upload live in `src/lib/photos.ts`, shared by the Issues Log and checklist fill-out.
- Upload: browser canvas → JPEG (1400px max, 0.82 quality) → upload → store bucket-relative path in `finding_photos.storage_url`
- Render: Issues Log batch-signs a finding's photos on detail open (`getFindingPhotoUrls`);
  `generate-report` embeds photos via service-role `download()` (base64 data URIs)
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

**`equipment-files`** bucket (private, 20 MB limit, mime-restricted).
- PDF, DOCX, XLS, images for equipment shop drawings, submittals, cut sheets, O&M manuals, etc.
- `equipment_attachments.storage_url` stores the bucket-relative path; `file_type`: shop_drawing | cut_sheet | submittal | startup_report | om_manual | other
- *(Corrected 2026-07-24: this bucket was documented "access-controlled" but was
  actually public and — worse — had NO storage policies at all, so the client-side
  upload path had nothing granting it. The privacy pass flipped it private and
  added the `ef_insert/ef_select/ef_delete` `is_staff()` policies, mirroring
  finding-photos' `fp_*` trio.)*

**`site-reports`** bucket (private, docx/pdf only).
- Generated by `api/generate-report.ts` serverless function on Vercel
- Stored at `{project_id}/{report_number}.docx|.pdf`; bucket-relative paths in
  `site_reports.storage_url` / `pdf_url` *(corrected 2026-07-20 — an older line
  documented a `{report_id}/report.docx` path that was never the deployed layout)*

**`checklists`** bucket (private) — generated IVC/PFC documents (completed + blank modes), from
`api/generate-checklist.ts`. Nothing persisted — the endpoint returns 10-minute signed URLs directly.

**`meeting-minutes`** bucket (private) — generated minutes at `{project_id}/{type-slug}-{n}.pdf|docx`, from `api/generate-minutes.ts`.

> **§12 storage privacy hardening: CLOSED 2026-07-24.** Executed as the staged
> one-pass conversion this item required: paths + signing code deployed and
> verified against still-public buckets first, then the private flip as the
> final act. Canonical register: MASTER-BRIEF §12.

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
| `/` (unauthenticated) | LandingPage | public landing page (2026-07-22, as-built: docs/LANDING-PAGE-PROPOSAL.md); lazy-split chunk; CTA → `/login` |
| `/login` | LoginPage · authenticated → `<Navigate to="/">` | the login form's real URL; `pw-config.loginAs` targets it |
| any other path (unauthenticated) | LoginPage **in place** | URL untouched → after sign-in the requested route mounts (deep-link-through-login) |
| `/` (authenticated) | DashboardPage | HOME — no landing interstitial. `client` role → `<Navigate to="/portal">` (2026-07-25) — never reaches the dashboard, or any internal route |
| `/portal/accept?token=…` | PortalAccept | **pre-router bypass** beside `/reset-password` — the invitee has no account yet, so nothing assuming a session may run first |
| `/portal/*` (authenticated) | PortalApp (lazy) | **rendered OUTSIDE `Shell`** — no internal chrome exists in this world. Staff may open it deliberately: that is the "view as client" preview |
| `/projects` | ProjectsPage | list; row click navigates |
| `/projects/:projectId` | ProjectDetailRoute → ProjectDetailPage | active tab lives in `?tab=` (`issues`, `meetings`, `checklists`, `site_reports`, …) so dashboard rows and external links deep-link straight to a tab |
| `/directory` `/templates` | pages | |
| `/classifications` | ClassificationsPage | admin/developer only (route guard + nav gating; RLS is the real enforcement) |
| `/reset-password` | ResetPasswordPage | pre-router bypass, unchanged |
| `*` | redirect `/` | |

Sidebar items are `<NavLink>`s. `vercel.json` rewrites all non-`api/` paths to
`index.html` (SPA). Historical note: before the router the app had exactly one URL —
nothing could break when it landed; the full Playwright battery re-ran green as the gate.

The internal routes now live under a single `path="*"` element that is the
`isClient ? <Navigate to="/portal"> : <Shell>…</Shell>` fork, with `/portal/*`
matched **before** it. Route separation is UX and defence in depth — the RPCs and
`portal_members` are the actual enforcement (see below).

---

## External project portal — the security model (Part A, as-built 2026-07-25)

Full record: `docs/PORTAL-PROPOSAL.md`. Gate: `pw-portal.mjs` (49 assertions).

**The finding that shaped it.** The recorded plan was `client` role + a
`project_members` row. That does not hold: `is_project_member(pid)` is

```sql
select exists (select 1 from project_members where project_id = pid and profile_id = auth.uid())
```

— **no role condition**. An external account in `project_members` would satisfy
every existing membership policy, read *and* write. Proven live on ZZ-TEST before
any code was written: all 20 findings including internal columns, every
site-report status, 239 checklist instances, 266 equipment rows, and an
**accepted findings INSERT**. Tables that returned zero rows were *empty*, not
protected — an important distinction that a naive probe would have reported as
safety.

### Two tables, zero blast radius

| Table | Columns of consequence | Policies |
|---|---|---|
| `portal_members` | `project_id`, `profile_id`, `invited_by`, `invited_at`, `accepted_at`, `company_id` (hook for later per-company filtering), `org_id` (rule 17), `UNIQUE(project_id, profile_id)` | `pm_select`: own rows **OR** admin/dev **OR** `owner_member(project_id)` **OR** `is_project_lead(project_id)` · `pm_insert`/`pm_update`: admin/dev OR owner_member OR lead (update also `profile_id <> auth.uid()`, mirroring `members_update`'s self-exclusion) · `pm_delete`: the same staff set with **no** self-exclusion, so revocation can never be blocked |
| `portal_invites` | `email`, `token_hash` (unique), `expires_at` (default +7d), `redeemed_at`, `revoked_at`, `org_id` | `pi_*`: staff only. **No client or anon policy of any kind** — an external account cannot read the invite table it came through |

Nothing internal reads either table, so **no existing policy, predicate, or
endpoint changed meaning in this build**, and "the client role appears in zero
internal policies" remains literally true.

### Reads: SECURITY DEFINER RPCs, because RLS cannot filter columns

Every RPC is `security definer stable`, gated on
`portal_can_view(pid) = is_portal_member(pid) or is_admin_or_dev() or is_project_member(pid)`
(the last two admit staff, which is what makes "view as client" work), and
`revoke all … from anon`.

| RPC | Returns | The deliberate exclusions |
|---|---|---|
| `portal_projects()` | the caller's portal projects: id, name, com_number, client_name, status | no internal notes, no cross-project anything |
| `portal_findings(pid)` | `finding_id, number, title, description, category, building_area, corrective_action, status, date_raised, date_closed, responsible_company` | **no `identified_by`** (which internal engineer raised it) and **no `origin`** |
| `portal_finding_photos(pid)` | photo **IDs**, finding_id, caption, uploaded_at | **never a storage path** — the URL must be minted through the signing endpoint, which re-checks membership |
| `portal_documents(pid)` | union of `site_reports WHERE storage_url IS NOT NULL` and `meetings WHERE status = 'issued'` | drafts cannot appear; the issued test is **in the SQL**, not the UI |
| `portal_stats(pid)` | aggregates only (checklist totals, open/closed counts, phases) | never the underlying rows |
| `portal_team(pid)` | company, role, contact name for **this project's** team | not the Directory — the firm's 261 contacts are unreachable by construction |

**`finding_diaries` has no client policy and no RPC.** Internal working notes are
structurally unreachable, not merely un-surfaced. Same for equipment, checklists,
deliverables, contacts, companies — verified as direct-query-returns-zero *paired
with* the RPC returning data, so the zero proves a wall rather than an empty table.

### Files: two gates before a URL is signed

`api/get-file-url` branches on role. Staff → `requireProjectAccess`, which now
**requires a staff role explicitly** (`admin|developer|owner|user`) — it previously
admitted any membership row regardless of role, which was the same latent hole.
External → `requirePortalAccess` (portal membership, or staff preview) **plus**:
`equipment_attachments` refused outright; `site_reports` refused when
`storage_url IS NULL`; `meetings` refused when `status <> 'issued'`. The issued
test therefore exists twice, independently.

### Invite lifecycle

1. `POST /api/portal-invite` — owner or lead **of that project** (enforced in code:
   the service role bypasses RLS, so the check cannot be left to policy). A 32-byte
   token is generated; only `sha256(token)` is stored. Response carries the
   copy-link, `expires_at`, `mail_attempted`, `delivery_enabled`.
2. **Delivery** is behind `PORTAL_INVITES_LIVE`, read in **exactly one function**,
   `deliverInvite()`. Nothing else in the flow consults it, so the entire invite
   path is testable with mail structurally impossible. Unset/false → `{attempted:
   false}` and the copy-link is the permanent delivery mechanism.
3. `POST /api/portal-redeem` — unauthenticated. Looks up by hash; answers
   **identically** (400 `INVALID`) for invalid, expired, revoked, and
   already-redeemed, so it is not an existence oracle. Creates the account with
   `email_confirm: true` — which is what keeps **Supabase's own mailer** silent, a
   second channel the feature flag does not control. Refuses to demote an existing
   internal account. Inserts `portal_members` first, stamps `redeemed_at` only
   after membership lands.
4. **Revocation is deleting the `portal_members` row** — instant, total, and
   independent of the invite record.


### Link mode — view-only access with no account (2026-07-26)

The **secondary** access mode. Invite-with-account remains primary; a share link
is for a read-only viewer for whom account creation is friction that gets the
portal not-used. Full record: `docs/PORTAL-ACCESS-UI-PROPOSAL.md`, amendment in
MASTER-BRIEF §10 / Build Spec §6B / PORTAL-PROPOSAL §4.

**The cost, stated where it will be read:** a share link is attributable to the
LINK, not to a person. Anyone holding the URL is that link.

#### One whitelist, two gates

The column lists live in **`portal_internal`**, a schema with `USAGE` revoked from
`public`, `anon` and `authenticated`. Nothing reaches those functions except the
gated wrappers, which are `SECURITY DEFINER` and run as the function owner.

```
portal_internal.findings_rows(pid)          <- the ONLY place the column list exists
   |                                    |
public.portal_findings(pid)          portal_link_bundle(tok)
  gate: portal_can_view(pid)           gate: portal_link_project(tok)
  (authenticated)                      (service_role; the API endpoint)
```

Schema isolation rather than function-level revokes, because a `revoke ... from
anon` alone is not a lock — PUBLIC still holds the grant (learned the hard way in
`portal-rpc-grants-migration.sql`). Verified by privilege, not by "the call
failed": `has_schema_privilege(anon,'portal_internal','USAGE') = false`.

`pw-portal` compares the two paths **field-by-field** for findings, documents,
team, photos and stats. That leg fails the moment they diverge, which is the
entire reason the lists were moved.

#### The single expiry evaluator

`portal_link_project(tok)` is the ONLY function permitted to evaluate expiry or
revocation, in either mode, for data or for files:

```sql
select project_id from portal_share_links
 where token_hash = encode(extensions.digest(coalesce(tok,''),'sha256'),'hex')
   and revoked_at is null
   and (expires_at is null or expires_at > now())   -- NULL = never
```

`NULL means never` is a footgun: `expires_at < now()` silently invalidates every
permanent link and `expires_at > now()` silently validates none of them. Making
this function the sole evaluator is the mitigation, and the column comment says so.
It answers NULL for invalid, expired, revoked and unknown alike — one shape, no
existence oracle.

#### `portal_share_links`

Separate from `portal_invites` on the 9.1(a) argument: an invite is a single-use
secret that becomes an account; a link is a standing credential used many times,
forever if asked. RLS is staff-only (admin/dev · `owner_member` · `is_project_lead`,
D6/9.4a) with **no client and no anon policy** — a link holder can never read the
link table. `expires_at` NULL = never; `last_viewed_at`/`view_count` (D5) make the
link attributable to *itself*, which is the only accountability available when it
is not attributable to a person.

**Expiry presets are derived server-side** (`1d|1w|1m|1y|never`, default 1 month)
by `portal_share_link_create`. The endpoint does not accept a client timestamp: a
crafted request would set year 9999 and bypass the "Never requires a distinct
confirmation" rule, which is a UI control and therefore no control at all alone.

#### Files under link mode

`api/get-file-url` takes `{link_token, ...}` with no Authorization header. It:

1. validates the token **before any row lookup** — 404-before-403 would let a
   completely unauthenticated caller distinguish "this id exists" from "it does
   not" across every table the endpoint serves;
2. resolves the project **from the token**, never from the request;
3. refuses when the row's project differs from the token's;
4. applies `refuseUnlessIssued()` — **shared verbatim with the account path**, so
   the issued-only test exists in exactly two places (that function and
   `portal_internal.document_rows`) and gained no third copy.

A valid token asking for a missing row answers **403, not 404**. Staff keep their
404: useful diagnostics for a caller who is already authorized.

#### No write path — three walls, all asserted

1. `anon` has no policy on any portal table (PostgREST insert → 42501).
2. `anon` has no EXECUTE on any portal function (RPC → 42501, asserted by **error
   code**, never by row count).
3. `generate-*` refuse a link token (401).

Plus a structural one: **the link page constructs no Supabase client at all**
(`src/lib/portalLink.ts` talks only to `/api/portal-link` and
`/api/get-file-url`). The channel does not exist.

#### Route

`/portal/link/:token`, pre-router like `/portal/accept`, and before the loading
gate — there is no session to wait for, and a signed-in staff member opening a
link should see what the recipient sees. Carries `noindex` and `no-referrer` as
both meta tags (removed on unmount) and response headers. No sign-out, no project
switcher, no name: there is no identity to show.


**Go-live: `docs/PORTAL-GOLIVE.md`** is the runbook — ordered steps, each with its
own verification, none of it performed. Do not keep a second copy of the list here;
it will drift. Summary of what it covers: flip `PORTAL_INVITES_LIVE` (and the fact
that `deliverInvite()` has no transport yet, so the flag alone sends nothing) → one
rehearsal invite to Tony's own address → **the Supabase Auth-mailer review** (a
second channel the flag does not gate; password reset is never suppressed) → invite
rendering on a real phone → first-invitee criteria → cleanup, including the one
`pw-portal` assertion that is *expected* to fail once the flag is live.

Two decisions to make before that day, tracked elsewhere:
- Whole-register vs per-company visibility (the `company_id` hook on
  `portal_members` exists for the latter).
- The navy-documents / purple-app split — one-pager at
  `docs/DOCUMENT-IDENTITY-DECISION.md`, undecided by design.

---

## UI & Design System (as-built 2026-07-22)

> **Provenance note:** the visual system was overhauled in July 2026 through a series of
> UI enhancement passes driven by external design tooling/skills (visual-world redesign →
> brand-pinned palette + logo → Apple-grade motion/material pass → chart system pass).
> The styling did NOT all originate from in-repo specs; this section is the record of
> what is actually shipped. Commits: `c99b048` (visual world) → `816bac4` (brand repin +
> logo) → `eb9a2c0` (dashboard motion pass) → `42e803a` (chart system) → `fed6f67`
> (whole-app motion/material sweep).

### Token layer — `src/index.css` (single source; Tailwind v4 `@theme`, no config file)

The brand is **pinned to the logo**: purple `#443C8F` (institution) + vermilion
`#E8432D` (heat/attention) on paper white `#fbfaf8`. Two token strategies coexist:

1. **Semantic scales** — `brand-*` (purple 50–950, wordmark `#443C8F` = 600),
   `standard-*` (alias of brand-*, referenced by Modal/Login/StatHeader),
   `vermilion-*` (partial: 50/400/500/600/700), plus world names
   `--color-cover #181536`, `--color-paper`, `--color-ink`, `--color-rule`.
2. **Remapped stock Tailwind scales** (the migration bridge — legacy utilities inherit
   the new world with zero per-file edits): `teal-*` → purple (`teal-600 = #443c8f`;
   **`teal-400 = #f2704f` vermilion** — the class name lies, see debt list),
   `slate-*` → purple-tinted cover/ink ramp (`slate-900 = #181536` is the sidebar),
   `gray-*` → neutral ink ramp with faint violet cast (`gray-200 #e0dfe6` hairline,
   `gray-400 #7b7a85` muted), and `rose/sky/violet-*`.

**Status colors keep their meaning:** green `#1E7A4E` (600) success, amber `#8A5400`
(700) attention, vermilion red `#C2371F` (600) deviation/overdue. Chip convention is
tinted field + same-hue text (`bg-green-50 text-green-700`), never gray-on-color.
`VisitChip` (`src/components/VisitChip.tsx`) is the canonical band chip and exports
`BAND_HEX` for SVG/chart use — never `#7B7A85` for a live band.

Radii are print-sharp (xs 1px … 2xl 10px); shadows are flat paper offsets, never halos.

### Typography

- **Archivo** (variable, wdth 62–125) is display AND body; `.font-display` sets
  `font-stretch: 110%` + `-0.01em` tracking for headings/mastheads/stat numbers.
- **Spline Sans Mono** for identifiers, dates, clause numbers, readings;
  `tabular-nums` forced on `.font-mono` so figures column-align.
- Loaded via one Google Fonts css2 request in `index.html`. Micro-labels run uppercase
  with wide tracking (0.06–0.22em); large numerals use `tracking-[-0.02em]`.

### Shared components

| Component | Purpose |
|---|---|
| `components/Logo.tsx` | `LogoMark` (SVG I-beam + vermilion isotherm curves; `color`/`reverse`); brand hex intentionally hardcoded here |
| `components/VisitChip.tsx` | THE last-visit band chip (bands from dashboardThresholds) |
| `components/AccessCard.tsx` | Project membership management (owner/admin-gated) |
| `components/ProjectStatHeader.tsx` | 4-stat project Overview header; same derivation as dashboard cards |
| `components/ClassificationBadges.tsx` / `ClassificationPicker.tsx` | Per-dimension badges + creation picker |
| `components/EquipmentPicker.tsx` / `FindingPicker.tsx` | Grouped searchable combo-boxes |
| `components/ui/Modal.tsx` | The shared dialog: scrim, `.modal-sheet` entrance, standard-600 accent bar, Escape, `sm/md/lg` |
| `components/ui/EmptyState.tsx` | Empty states with the ink contour watermark |

Pills, tab bars, and section heads are NOT extracted — they live inline per page
(e.g. `ClauseHead` in DashboardPage; the tab bar in ProjectDetailPage).

### Shell & layout

Desktop: 60-unit `slate-900` (purple cover) left rail with clause-numbered nav —
groups Operations (1 Dashboard, 2 Projects, 3 Directory), Library (4 Templates,
5 Classifications), Administration (6 Users super-only, 7 Action Summary "soon").
Active state = 3px vermilion bar + mono clause number. Mobile: `lg:hidden` header +
slide-over drawer (fixed overlay, `drawer` keyframe). Content pages are
master/detail `flex h-full overflow-hidden` layouts that assume desktop width;
Dashboard is the most responsive surface (`grid-cols-1 lg:grid-cols-2`).

**Known gap — the checklist fill view is desktop-first:** the multi-unit response
matrix in `ChecklistsPage.tsx` scrolls horizontally (`overflow-x-auto`, min-width
cells) rather than reflowing on phones. Mobile reflow is roadmap (§6C), not built.

### Motion system (all hand-rolled CSS — no motion library)

- `.rise` — staggered entrance (420ms, `--rise-i * 45ms`); fill-mode `backwards`
  deliberately, so the transform clears and never becomes a containing block for
  `position:fixed` overlays. On all primary page roots.
- `.card-tile` — card depth + hover lift; interruptible 200ms transitions.
- `.chrome-material` — translucent chrome (blur 16px + saturate); Dashboard sticky header.
- `.modal-sheet` / `drawer` — dialog and drawer entrances.
- Global press response: `button:active` scales 0.985 (80ms).
- Guards: `prefers-reduced-motion` disables all of it; `prefers-reduced-transparency`
  solidifies `.chrome-material`.

### Charts — `src/lib/chartTheme.ts`

One chart grammar (recharts, DashboardPage is currently the only consumer): single
purple hue for magnitude, semantic green/amber reserved for status, vermilion for
thresholds via annotated `ReferenceLine`s (color never carries the encoding alone),
neutral `#C6C5CD` for no-data, 12px bars with 4px rounded data ends, recessive
hairline grid, ink-colored text (never series-colored).

### Icons & UI dependencies

`lucide-react` (sole icon set) · `recharts` · `react-router-dom` · Tailwind v4 via
`@tailwindcss/vite`. No component library (no Radix/shadcn). The APP has no
motion library — all app motion is the hand-rolled CSS system.

**Landing-page-only dependencies (V2 cinematic, 2026-07-22 — imported ONLY under
`src/pages/landing/`, carried by its lazy chunk; the authenticated app pays
zero bytes):** `gsap` 3.15 (+ bundled ScrollTrigger; SplitText is Club-only —
word splitting is a local helper) · `lenis` 1.3 (smooth scroll via gsap.ticker)
· `three` 0.185 + `@types/three` (the shader-displaced contour-field
centerpiece; plain Three, not react-three-fiber). Landing chunk ≈182 KB gz —
accepted by ruling: performance is explicitly not a constraint on this page;
containment is.

### Known UI debt (recorded 2026-07-22 — flagged, deliberately not yet fixed)

0. **`gray-400` has never met WCAG AA (found 2026-07-25, portal Part B).** The
   token carried the comment "4.6:1 on white". Measured, it is **4.23:1 on white
   and 4.05:1 on the app's actual paper ground `#fbfaf8`** — under the 4.5:1
   floor for normal text, everywhere it is used, and it is used for muted text
   across the app. The comment was corrected in place; **the colour was not
   touched**, because re-tinting it changes muted text on every surface and that
   is a judged change, not a drive-by one. `#73727e` clears 4.54:1 on paper if we
   take it. The portal uses `gray-500` (5.03:1) and contains no `gray-400` text.
   *Decide this one deliberately — it is the largest single a11y item on the list.*

1. **Legacy navy `#1F3A5F` hardcodes survive the repin:** App.tsx loading/error
   screens (fully off-token inline styles), AccessCard LEAD badge,
   ProjectDetailPage tag badge, UsersPage/TeamPage role badges, and
   **ResetPasswordPage** (heaviest — ~9 inline navy/old-teal values, never adopted
   the token layer).
2. **Two card patterns:** canonical `.card-tile bg-white rounded-xl` vs legacy
   `bg-white rounded-lg border` (popovers, some DeliverablesPage/SiteReportsPage
   internals); radii diverge xl/lg/md across cards, popovers, and Modal.
3. **Ad-hoc chips:** LEAD/MEMBER, role badges, and tag badges are styled inline
   instead of via a shared Badge component; ClassificationBadges uses stock
   `blue-*`, which is NOT remapped — an off-palette blue in the purple world.
4. **`teal-400` = vermilion** via remap — works visually, but the class name lies;
   new code should use `vermilion-*`/`brand-*` names.
5. **Orphans:** `.tbl-ruled` (defined, referenced nowhere), stale `theme-color`
   meta `#062A1D` in index.html, and cover-green-era prose in the index.css
   header comments. (`LogoLockup` was on this list until 2026-07-22 — the
   landing page is now its consumer.)
7. ~~**Document/app brand divergence**~~ — **CLOSED 2026-07-26.** Converged to
   the brand purple identity (Tony's ruling, Option A of
   `docs/DOCUMENT-IDENTITY-DECISION.md`, shipped in `cf83ed1`). The 104 hex
   literals across the four generators are gone: `DOC` in `doc-common` is now the
   single definition, and `DOC_SEMANTIC` fences off the conformance colours that
   deliberately did NOT move. Issued files stay as issued (rule 4), so projects
   mid-flight permanently hold both eras — accepted with the ruling.
   *The old entry claimed report-regen needed a deliberate baseline reset. It did
   not — see the Testing section. No reset was performed.*
6. Contour watermark SVG path duplicated between `.contour-mark` (white) and
   `.contour-mark-ink` (purple) rather than shared.

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

### THE NAMED RULE: prove the mechanism, never the silence

**An assertion that would also pass if the feature did not exist proves nothing.**
Every negative must be paired with the positive that shows the mechanism is live,
and the assertion must land on the *mechanism's own signal* — not on an absence
that has many possible causes. Learned three times, at three different layers:

| Layer | The silence that lied | What the assertion had to become |
|---|---|---|
| **Policy** (RLS) | "the client reads 0 rows from `equipment`" — the table was simply **empty**, not protected. A probe reporting that as safety would have been wrong on every populated table. | Pair each 0-row read with the same read succeeding through the sanctioned path, so the 0 proves a wall rather than an empty table. Prove writes with a real INSERT. |
| **Data** (Supabase writes) | RLS-blocked UPDATE/DELETE returns **success with 0 rows affected** — identical to a legitimate no-op. | Assert the affected-row count, not the absence of an error (`reportWriteBlocked`). |
| **Function grants** | `revoke … from anon` on the portal RPCs looked like a lock and was **inert** (PUBLIC still granted EXECUTE; anon inherits it). The calls returned 0 rows only because `portal_can_view()` fails closed — the fail-safe was doing the control's job. | Assert the **error code** (`42501`), not the row count. A row count passes whether or not the grant exists. |

Corollaries that follow from it:
- A test that cannot fail is a comment. Before adding a check, ask what would have
  to break for it to go red — if nothing plausible would, rewrite it.
- Verify a fix by *reintroducing the bug* and watching the check fail. (Done for
  the `api/` typecheck: the `user.id`/`user.userId` bug was put back and failed at
  both call sites.) Do it on a rolled-back probe when the change is destructive.
- Deploy-verified means the SERVED bundle carries the change (see below), not that
  a deployment says READY.
- An unexplained count is a finding until explained. Investigate the number; do not
  round it off. (239 vs 238 was a deliberately-maintained fixture; 242 vs 239 was a
  second fixture project the tracked figure never included. Both were real answers.)

### The refactor corollary: a green build proves SYNTAX, not OUTPUT

**A refactor that changes how strings are BUILT is only proven at the output
layer.** Type-checking tells you the program compiles; it says nothing about what
the program emits. Where the two diverge, the compiler is silent and confident.

The 2026-07-26 palette consolidation is the case to remember. Replacing hex
literals with `${DOC.INK}` tokens hit **24 sites where the literal sat inside a
SINGLE-QUOTED string**. Single quotes do not interpolate, so those became the
literal characters `${DOC.INK}` — perfectly valid TypeScript, `tsc` clean, and it
would have printed that text into every generated document. **The build was green
with the bug present, twice.**

So, for any refactor of string construction — template-literal conversions,
i18n/token extraction, CSS-in-JS moves, query builders, log formatters:

- **Assert on the artifact, not the compile.** Generate real output and grep it
  for the token syntax that must never appear (`${`, `{{`, `%s`, `:param`). One
  line, and it is the only check that can actually fail here.
- **Detect with a parser-aware scan, not grep.** Two attempts to find these by
  grep were wrong: a multi-line template literal carries a backtick only on its
  opening line, so "line has `${` but no backtick" reported false positives
  everywhere. What worked was scanning single-quote PAIRS within each line
  (single-quoted strings cannot span lines) — and the detector that found the 24
  sites then performed the fix, so nothing outside a real match could be touched.
- **Count what you converted and re-run the detector to zero.** "24 found,
  24 converted, detector now reports 0" is a proof; "looks right" is not.

### Ops: harness cleanup belongs in `finally`, never as a trailing statement

Any script that SEEDS fixture rows must remove them in a `finally` block. Cleanup
written as the last statement of the happy path is skipped by every throw above
it — and a harness crashes precisely when something unexpected happened, which is
exactly when you least want fixtures left behind.

Learned by leaking two meetings onto ZZ-TEST from a harness whose cleanup was the
final line: an unrelated `ERR_INVALID_URL` aborted the run after the seed. The
same rule already holds for the `pw-*` suites (they clean in `finally` or with a
best-effort catch) — it applies to one-off harnesses too, which are the ones most
likely to crash because they are written once and never hardened.

Two habits that go with it:
- **Clean unconditionally and by ID**, not "if a flag was set" and not "the most
  recent row" — a time-scoped or id-scoped delete cannot eat a standing fixture.
- **Assert the resting state after cleanup** and print it (`meetings table total:
  0 (must be 0)`). A cleanup that silently did nothing looks identical to one that
  worked.

### Wait for the condition, never for the clock

**`waitForTimeout(n)` before an assertion is an assumption about how long
something takes, not a wait for the thing being asserted.** Use a bounded
`waitFor` on the element or state the assertion is about, then assert. The
assertion stays honest — if the thing genuinely never arrives, the wait expires
and the check still fails — but it stops failing for reasons that have nothing to
do with the behaviour under test.

The cost is specific and was paid in `pw-deliverable-access`: a 3.5-second sleep
after login held when the suite ran alone and expired inside the battery, where
nineteen suites had gone before it. It reported **"the governor cannot see the
Outstanding Deliverables panel"** — which reads as a permissions regression, on a
gate whose entire subject is permissions. It was not one; the API-level scoping
assertion had passed in the same run, and later assertions in the same browser
session passed too.

A gate that fails for reasons other than the thing it gates is worse than no
gate. It manufactures a regression that does not exist, and it teaches whoever
reads it next to discount the failure — so the real one, when it comes, gets read
as another flake.

The standing battery (repo root, `pw-*.mjs`) — all self-cleaning:
- `pw-cx-plan.mjs` — the Cx Plan composer gate. Mocked AI by default (the
  drafting endpoint is never called in the battery); `--real-ai` makes ONE real
  call as a manual smoke. Asserts the client/server SECTION lists are identical,
  the team table **field-by-field against the matrix**, that a draft cannot
  generate, that an approved-but-unaccepted plan still cannot, role gating **by
  error code**, that the ACCEPTED text (not the draft) reaches the document, and
  that an issued revision is frozen with its snapshot written.
- `pw-report-regen.mjs` — regeneration diff (the gate for any change near the
  report path; before/after capture, normalized-text compare).
  **It compares VISIBLE TEXT, not bytes** — `word/document.xml` with every tag
  stripped. Two consequences, both learned the hard way in the 2026-07-26 palette
  convergence: a style-only change passes it untouched and needs **no baseline
  reset**; and it will **not catch a colour error for you**. Nothing automated
  will. Style changes are proven by looking at one of each document type, PDF and
  DOCX. Manual, argument-taking, deliberately outside the battery.
- `pw-checklist-docs.mjs` — four-deliverable checklist content audit. PDF checks
  use real pdf.js text extraction (upgraded 2026-07-22 from an ASCII flate probe
  that kept two checks permanently yellow — green means green). Canonical
  fixture: the two-unit A/C / Fan Coil / Heat Pump instance on ZZ-TEST.
- `pw-copy.mjs` — multi-unit copy: never-overwrite, copied-N-opens-finding-modal
- `pw-finding-register.mjs` — full ASHRAE register: create → detail → report
  lines → delete → byte-clean restore
- `pw-pfc-verify.mjs` — template typing/naming flows to new instances
- `pw-meetings.mjs` — topic seeding, matrix attribution, minutes content,
  carry-forward number retention, close-carried-item isolation
- `pw-dashboard.mjs` — seeds one state per widget (INSERT-TIME timestamps — only
  updates get trigger-stamped), asserts chips/queue/deep-links/rollup, self-cleans
- `pw-access.mjs` — the access-control gate: API-layer RLS verification via raw
  authenticated PostgREST, all three legs (employee / owner / admin), 54 checks
- `pw-deliverables.mjs` — Deliverables tab end-to-end: compose idempotency, date
  stamps, ad-hoc CHECK, queue/My-Items, LEED re-sync, Envelope activate/deactivate
- `pw-blank-audience.mjs` — audience-aware blank mode (Field Copy vs Contractor)
- `pw-signoff-order.mjs` — records integrity: signoff render order stability
- `pw-checklist-offline.mjs` — field-resilience acceptance (outbox, reconnect)
- `pw-classification.mjs` — classification → deliverable composition via UI
- `pw-landing.mjs` — public landing + routing: landing on unauthenticated `/`,
  CTA → `/login`, no interstitial for authenticated users, reduced-motion
  render, `/reset-password`, deep-link login-in-place
- plus earlier-era flow scripts (`pw-team`, `pw-dates`, `pw-directory`, …)

**Deploy-verification pattern (learned the hard way):** Vercel queues builds; a
"READY" older deploy can still be serving when a test starts. Before any
production-gated test run, confirm the SERVED code carries the change, not just
that a deployment says READY. A gate run against a stale deploy is void — re-run
and say so.

**How you confirm depends on WHAT changed** — and picking the wrong method is its
own failure mode. See the standing rule *"Verify a deploy by what actually
changed"*: served-bundle grep covers **client code only**; an API function change
is verified by the deployment record's lambda state or by a **functional probe of
the changed behaviour itself**, never by polling an endpoint that predates the
commit.

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
- Photos: stored as standard JPEG files in Supabase Storage. Since the privacy pass (2026-07-24) `finding_photos.storage_url` holds a **bucket-relative path**, not a public URL, and the buckets are private — retrieval is a signed URL (`api/get-file-url`) or the service key. Portability is unchanged: the objects are ordinary JPEGs and a service-key bulk download needs no app code
- No proprietary binary formats, no opaque blobs, no vendor-specific encodings

**What NOT to do (enforce this as new features are built):**
- Do not store report content in binary blobs inside the DB — generate and store as `.docx`/PDF files
- Do not serialize UI state or config as opaque JSON without a documented schema
- Do not use any storage or DB feature that makes bulk export harder (e.g., Supabase-specific encrypted columns without export tooling)

**Export feature (Phase 3, not yet built):** a per-project export that bundles reports, photos, and a data snapshot into a portable folder for archiving to the firm's on-premise server (ShareSync). The data architecture already supports this — no rework needed when that feature is added.

---

## Cx Plan Composer (as-built 2026-07-27)

Questionnaire + deterministic assembly + AI narrative -> issued Cx Plans. Record:
`docs/CX-PLAN-COMPOSER-PROPOSAL.md` (rulings D1a-D7). Gate: `pw-cx-plan.mjs`.

### The three-engine boundary, enforced structurally

| Engine | Owns | Where |
|---|---|---|
| **Deterministic** | Everything the database holds: parameterised boilerplate, the team table, systems, submittals, the header, appendices | `api/_shared/cx-plan-assembly.ts` |
| **Questionnaire** | Facts that exist only in the CxA's head, as structured answers | `cx_plan_answers`, keyed by `(project, document_type, question_key)` |
| **Narrative** | AI, from questionnaire facts + project data + corpus slices | `api/cx-plan-draft.ts` |

`buildDeterministic()` runs with **no model involvement at all**; narrative
arrives as a separate map merged in afterwards. **The model is never handed the
team table**, so it cannot restate it wrongly — it is not given the opportunity,
which is stronger than instructing it not to. `SECTIONS` is one declaration read
by the assembler, the wizard and the review screen, and `pw-cx-plan` asserts the
client's copy is identical to the server's.

### Two calls, deliberately

1. **Draft** — writes prose AND enumerates its own factual claims, each citing
   the fact key that supports it.
2. **Verify** — a SEPARATE call with no memory of drafting, framed
   adversarially. A model asked to check its own output in the same context
   agrees with itself. Flags do not block; the CxA rules on each.

Empty facts are **deleted** before the call rather than passed as null, so an
absent fact is genuinely absent and not something to narrate around. Both calls
log to `ai_generations` with model, tokens and cost.

### The refusals — all server-side

| Refusal | Enforced |
|---|---|
| A draft cannot generate | `status` must be `approved`, **and** every narrative section must be `accepted` — re-checked at generate time so an approved-then-redrafted plan cannot slip out |
| Approve/issue is owner+lead (D6) | In the endpoint. **RLS can see a resulting row but not a status TRANSITION**, so this rule cannot live in a policy |
| An issued revision is frozen (rule 4) | Re-issuing refused; redrafting into an issued plan refused |
| Client/portal roles cannot reach either endpoint | `requireProjectAccess`'s explicit staff restriction. Asserted **by error code** |

A redraft **un-accepts** the section: an approval applies to text a human read,
and after a redraft that is not the text.

### docx-skeleton — the second docx mechanism, deliberately

`doc-common`'s html-to-docx path generates site reports, minutes and checklists:
short, tabular, generated documents. The Cx Plan is long-form and styled with a
table of contents. Different problems — **do not unify them.**

The insight that makes it cheap: **we do not generate Word XML, only paragraphs
that reference styles the skeleton already defines.** `styles.xml` (157
definitions), `numbering.xml`, headers/footers and `sectPr` pass through
untouched; the TOC is a real field that rebuilds itself on open. The skeleton at
`firm-knowledge/skeletons/cx-plan.docx` is built by `build-skeleton.mjs`, which
asserts that no client string survives.

**Hard-won rules in that module:**
- **Make no bet on an inherited style's visual definition.** Table cells use
  `BodyText-ABC` with direct bold, because `CellBody-ABC` renders WHITE — a table
  whose rows were correct in the XML and invisible on the page, through twelve
  passing assertions.
- **`substituteOrThrow()`** — a find-and-replace that changes nothing throws.
  Third instance of the silence class; see the standing rules.
- The palette re-tint fails when it replaces zero values, and injection refuses
  to emit a document identical to the skeleton.

### Lifecycle

`draft` -> `approved` -> `issued`. Issue writes `cx_plan_snapshots`: the answers,
the sections (drafts and edits) and the **corpus commit SHA**. Rev 1 therefore
diffs against what Rev 0 said *and* against the knowledge that produced it.
Revision labels follow the samples' own convention ("Issued for Tender").

Storage: private `cx-plans` bucket, staff-only, read through the row-anchored
`api/get-file-url`. `cx_plans` is **explicitly refused** for external callers
rather than relying on the absence of a case — a Cx Plan is not a portal surface.

### Open item

The skeleton inherits the source document's section breaks, so the footer can
read "Page N of M-1". Not an injection fault; it is fixed when the cover/section
layout is authored in Word.

---

## The Firm Knowledge Layer — the standing AI architecture (2026-07-26)

**Every AI feature in this system reads `api/_shared/ai-common.ts`.** It is the
doc-common of AI. Record: `docs/CX-PLAN-COMPOSER-PROPOSAL.md`.

### Two rules

1. **Firm knowledge lives in DOCUMENTS, never in weights.** No fine-tuning, ever.
   Everything the model knows about Isotherm arrives as context that can be
   shown, audited, corrected and diffed in a pull request. A model that "just
   knows" our conventions is a model whose knowledge cannot be reviewed.
2. **No feature carries a private prompt that duplicates corpus content.** The
   moment two features each hold a copy of the style rules, they drift. This is
   the same failure the portal column whitelists (`portal_internal`) and the
   document palette (`DOC`) were built to prevent; the pattern is established and
   this is its third application.

### The corpus — `firm-knowledge/`

Versioned in the repo, reviewed in PRs, deployed with the app that reads it.

| File | Holds |
|---|---|
| `identity.md` | Firm facts: since 1975, services, client types, how Isotherm runs a project |
| `style-card.md` | The writing rules, **extracted from three issued plans** — person, modal discipline (`shall`/`will`/`is`), sentence discipline, Canadian spelling, structure, and an explicit NEVER list |
| `terminology.md` | Controlled vocabulary + rulings. **CxA = Commissioning Authority · CxP = Commissioning Provider · "Agent" retired** (D1a, with the evidence for why it needed ruling) |
| `domain-rules.md` | Seeded from `EXTRACTION-PLAYBOOK.md` — branding absolutism, ruled equipment keys, verification vocabulary, quarantine-never-guess |
| `procedures/` | Procedure-bullet library keyed by system, `_index.json` mapping systems → equipment keys |
| `exemplars/` | Merge-fielded skeletons only (D7). **Never full client documents** — that would breach the ShareSync rule |
| `contracts/` | One per feature. States what the model drafts, what it never sees, hard constraints, return shape, budget. Stubs exist for `fpt`, `polish`, `summarize`, `equipment-extract` so the next feature is written as a contract, not as a prompt in an endpoint |

**Hybrid storage (D4):** files are the base; DB rows (admin-editable procedure
bullets, ratified corrections) merge OVER them at assembly time. Files win on
identity and style; the DB only adds.

### `ai-common` surface

- `buildContext({ feature, slices, exemplar, dbAdditions })` → the SYSTEM prompt.
  Deterministic: the same request always yields the same text, which is what
  makes a generation reproducible from its snapshot.
- `callModel({ system, user })` — **the only place this system talks to a model.**
  One implementation of cost, model choice and failure handling.
- `logGeneration()` → `ai_generations` (feature, model, tokens, cost, who).
  Non-fatal on failure: a logging error must never lose work the user is looking at.
- `knowledgeVersion()` — the corpus commit SHA, stamped on every generation and
  every issued snapshot, so a document traces to the knowledge that produced it.
- `parseJson()` — one lenient parser, so no feature reinvents a fragile one.
- `parseModelJson(result, validate)` — the parser a feature should actually call.
  It returns *which* kind of failure occurred, because they have different fixes:
  `thinking-overrun` · `truncated` · `unparseable` · `wrong-shape`.

### `max_tokens` is a TOTAL GENERATION BUDGET, reasoning included

The current models think before they answer, and **reasoning tokens are drawn
from `max_tokens` and billed as output.** A budget sized for the expected prose
is not a small budget — it is roughly a tenth of what the call needs.

This cost a live calibration run. The Roles section failed; the first diagnosis
read the ceiling as a prose overrun and doubled it, and the model spent the whole
of the larger budget reasoning and emitted **no text block at all**. Measured
against the API with the real system prompt:

| `max_tokens` | stop reason | thinking | text |
|---|---|---|---|
| 3000 | `max_tokens` | 2,998 | 0 chars |
| 6000 | `end_turn` | 4,929 | 1,317 chars |

Consequences, now built in:

- **Budget for the reasoning, not the answer** — the section budgets are 8–10k
  for a few sentences of output. We are billed for what is *used*, not what is
  *reserved*, so headroom is free and a short ceiling costs a failed section.
- **A thinking-only response is its own diagnosis.** `blockTypes` containing
  `thinking` with no `text` means the budget ran out before the answer began.
  `outputTokens === maxTokens` alone cannot tell you that, and the raw text is
  empty, so without the block types there is nothing to look at.
- **Retry a budget failure at double the ceiling, never the same one.** A retry
  at the same ceiling buys the identical cut-off at the identical cost.
- **The logged cost is mostly reasoning.** `outputTokens` includes thinking, so
  the figure in `ai_generations` is correct but is not a measure of prose.

### A verification that failed is not a verification that passed

The verify call in the two-call design read `parseJson(...)?.flags ?? []`. A
truncated or unreadable fact-check therefore produced an empty flag list —
indistinguishable, on screen and in the database, from a clean bill of health.
The one guarantee the design exists to provide would have vanished silently.

**Any check whose failure mode is an empty result must fail closed and say so.**
This is the same class as the inert `revoke … from anon`, the zero-replacement
substitution, and the cleanup sweep that matched nothing — prove the mechanism,
never the silence. It is now the fourth instance, and it was found while fixing
the third.

### The corrections pipeline

Review-screen edits are captured. A cluster of similar edits becomes a **proposed
corpus addition** for ratification — **nothing self-modifies**. Ratified
additions land as a PR to `firm-knowledge/`. This is the EXTRACTION-PLAYBOOK loop
generalised; that document grew to 26 ratified rules exactly this way.

---

## Standing rules (permanent — apply to every session)

- **Every major change updates the docs in the SAME commit series that ships it.**
  New module, schema change, new architecture layer, new standing pattern — the
  documentation is part of the change, not follow-up work. Where each kind of
  state belongs:

  | Kind of state | Document |
  |---|---|
  | As-built technical state | `ARCHITECTURE.md` |
  | Product state | Build Spec §1A / §3 / §12 |
  | Roadmap state | `docs/MASTER-BRIEF.md` §4 / §10 |
  | A completed proposal | The proposal doc itself, **flipped to as-built** |

  **The docs are how sessions boot.** A shipped change that is not in them does
  not exist for the next session — it will be re-derived, contradicted, or
  rebuilt. That is the whole reason for the rule; it is not bookkeeping.

  Two obligations that come with it:
  - **Flag stale claims, never silently rewrite them.** A struck line with a dated
    correction beneath it teaches what was believed and why it was wrong. A
    silently corrected line teaches nothing and hides that anyone was ever
    mistaken. (Precedents: the `project_members` → `portal_members` corrections,
    the byte-clean-baseline claim, the `gray-400` contrast note.)
  - **List per-file doc changes in the commit message.** A reviewer must be able
    to see which documents moved without opening the diff.

- **Verify a deploy by what actually CHANGED.** "Deploy verified" is a claim about
  the specific change, not about the deployment. Match the method to the artifact:

  | What changed | How to verify | Why |
  |---|---|---|
  | Client code (`src/**`) | Fetch `index.html` → asset URL → **grep the served bundle** for a marker of the change | The bundle is fetchable; content is the proof |
  | **API functions (`api/**`)** | The deployment record's SHA + lambda state, **or a functional probe of the changed behaviour itself** | Serverless function source is NOT fetchable. There is no bundle to grep |
  | SQL / migrations | Query the live catalog (`pg_proc`, `has_*_privilege`, `pg_policies`) | The database is the deployment |
  | Docs only | Nothing to verify | No runtime artifact |

  **Never verify an API change by polling an endpoint that predates the commit.**
  That is what this rule exists for: a `get-file-url` change was "confirmed live"
  by polling `/api/portal-link`, which had shipped in the *previous* commit and
  therefore answered correctly the whole time. The gate passed, the suite then ran
  against old code, and a leg failed for a reason that had nothing to do with the
  code under test. **A green check on the wrong artifact is worse than no check —
  it converts "I don't know" into "I verified", and the next failure gets
  misattributed.**

  The functional probe is usually two lines and always unambiguous: exercise the
  *new* behaviour and assert the *new* answer. For the case above that was
  creating a share link and asking for a nonexistent row id — old code answers
  404, new code answers 403, and there is nothing to interpret.

  Same shape as **"prove the mechanism, never the silence"**: an endpoint that was
  always going to answer 200 proves nothing about a change it predates, exactly as
  a table that was always empty proves nothing about a policy.

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
- **Access control (2026-07-20, as-built records: docs/ACCESS-CONTROL-PROPOSAL.md +
  docs/OWNER-TIER-PROPOSAL.md):** global role × project membership, 5-role model
  (admin / developer / owner / user / client). Employees AND owners see member
  projects only (`project_members` + the helper family on every project-scoped
  policy); leads additionally edit project settings; destructive rights are
  admin/dev OR owner-within-member-projects (`owner_member()`); `dev.admin` is the
  sole all-seeing account (an ordinary admin — break-glass lives in the account
  layer, not SQL). Creator auto-membership and the project status-guard are DB
  triggers. The boundary is visibility and destruction — never workflow
  (inline-adds and all content work stay member-open).
- **Commit and push are one action.** Never leave local-only commits; report push
  failures immediately.
- **Never round-trip unicode-bearing source files through PowerShell** (echo,
  Set-Content, -replace pipelines): it mojibakes em-dashes, arrows, and accented
  characters. Use the Edit/Write file tools. This has bitten four times.
- **Pre-push build verification is `npm run build`, nothing less.** The deployed
  build runs `tsc -b && vite build`; `tsc --noEmit -p tsconfig.json` on the
  solution-style config CHECKS NOTHING and `vite build` alone does not typecheck.
  Run the real build command locally before every push that touches src/ or api/.
  (Learned 2026-07-22: three Vercel deploys broke on missing imports a false-green
  local check waved through, leaving a user-visible window where endpoints
  required auth the served app didn't send.)
- **Deploy verification is bundle-content, not deploy-state:** after pushing,
  confirm the SERVED JS bundle contains a marker of the change (fetch index.html
  → asset URL → grep the bundle) before any production-gated test run. A gate run
  against a stale bundle is void (see Testing). The pair is the standard: build
  locally, push, verify what's actually live.
- **Rule 4 (records):** completed/issued artifacts are frozen point-in-time
  records — corrections change templates/live rows only; snapshots and issued
  documents are never rewritten.

---

*Last updated: 2026-07-22 — Phase 2 closed: checklist engine end-to-end with four
render modes and the 238-template register (both campaigns closed); access control +
symmetric owner tier; Deliverables tab with the LEED model (Envelope BECx dormant);
UI & Design System section added (brand repin to purple/vermilion, motion system,
chart grammar — external design tooling provenance noted). See Build Spec §1A for
the authoritative module list.*
