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

### Failures in the PHANTOM-DATA direction need tripwires — they do not announce themselves

**A shortfall is visible. A duplicate looks like data.**

Most of the guard family is about checks that cannot fail. This is about failures
that cannot be *seen*: a mechanism that returns **too much** produces output that
passes every shape check, renders normally, and reads as a fuller answer than the
correct one.

*The evidence, 2026-08-04.* Clairlea M-601 carries 88 units. After table-region
splitting it returned **136** — two crops were reading the same column, so 48 rows
were phantom. Every row was well-formed. Every call reported `ok`. The only reason
anyone knew was that someone had counted the sheet by hand: 32 + 18 + 8 + 30.

**A total cannot tell you this.** 136 against 88 says something is wrong; it does
not say *which* rows are doubled, and a total that happened to land on 88 by
cancelling a shortfall against a duplicate would have said nothing at all. That is
why the gate for this work is **per-region counts against hand counts**, not the
sum.

**And the tripwire must never quietly fix it.** Cross-region tag intersection at
assembly is a loud refusal: it names the tags and the regions and declines to
present the rows as clean. Silently deduplicating would mask the geometry defect
that produced the duplicates — converting a *detectable* failure back into
invisible almost-correctness, which is the whole disease this section is about.

The same tripwire catches the legitimate rare case: a source sheet that genuinely
repeats a tag. The Seneca import handled that by suffixing, **visibly**. Both roads
end at a human looking at it, which is the correct destination for both.

**The general form: when a mechanism can fail by producing MORE, the check is a
cross-check between its parts — not a validation of its output.** Output
validation cannot see a duplicate; only the parts, compared, can.

### The sibling rule: a guard that answers the same in both states is not a guard

The silence family above is about ASSERTIONS that cannot fail. This is the same
disease in shipped code: a check, warning or refusal whose output does not change
between the state it is meant to catch and the state it is meant to allow. It
looks like protection, costs nothing to keep, and teaches everyone to click past
it — so when it finally does mean something, nobody reads it.

Three instances in a single batch, on three unrelated surfaces:

| Guard | Same answer in both states | What it became |
|---|---|---|
| **RLS DELETE on `contact_phones`** | A delete filtered out by policy removes zero rows and returns **no error** — indistinguishable from a delete that worked. `if (error)` passed, and the next statement inserted a duplicate primary. The user saw a constraint about PHONES while editing EMAILS. | The policy was widened to match the edit right, and the whole replacement moved into one transaction that normalises the primary flag itself. The unique index went back to being the last line of defence rather than the first line of validation. |
| **The equipment delete confirm** | "This also removes its Cx Index progress data and attachments" — said whether the unit was untouched or carried fifty verified cells. A warning that never varies is a warning nobody reads. | Count first. Name what will actually be destroyed, or say plainly that nothing references this unit. BLOCK on a linked finding, naming the findings, because that link is part of the signed record. |
| **`openTestProject` in the harness** | `await target.count() === 0` on an asynchronously rendered list: "the test project was not found — create it first", about a project that plainly existed. Two battery reds in three runs, two different suites, and both times the message sent the investigation to the wrong place. | Wait, bounded, before judging. Absence after the wait is still a refusal — but "not there" and "not there YET" are now told apart, and the message says which happened. |
| **The retroactive type assignment** *(feature level)* | STRUCTURALLY GREEN, PURPOSIVELY EMPTY. 118 units were typed, batch-tagged, and every check passed — the script reported success and the counts were right. But `ensureFieldDefs` seeds a project's field defs lazily, only when a human sets a type THROUGH THE UI, so a bulk write bypassed it. The units pointed at def sets that existed at firm level and had never been copied down, and their nameplates rendered empty. The claim "the registers come alive" was made and was false. | Nothing in the code was asserting the FEATURE'S PURPOSE, only its mechanics. A screenshot of one Wall Fin found it in seconds. The backfill is now a general gap-filler for any (project, type) pair with equipment and no defs, because every future bulk write has the same hole. |

The fourth row is a different level from the first three and belongs here anyway.
The first three are guards in code that could not fail. That one is a **claim
about a feature** that could not fail: every mechanical assertion was true —
rows updated, batches written, counts correct — while the thing the work existed
to achieve had not happened. No assertion was wrong; none was aimed at the point.

**RENDER AND LOOK IS NOT A COURTESY, IT IS THE ONLY CHECK AT THAT LEVEL.** A test
suite verifies mechanics. Whether the feature does what it was for is a question
about the screen, and the cheapest honest answer is to open it. This one was
found because a screenshot was requested for a log — not because anything was
suspected.


**The fourth row recurred within the same session.** Extracting the contact modal
produced a patch bug that duplicated an entire block of the assign dialog — the
people list, the "Company only" checkbox and the new-contact button rendered
twice. `pw-contact-modal` passed all seventeen checks, because every one of them
was true: the modal opened, the company was locked, the contact was created with
its channels. Nothing asserted that the dialog contained ONE of each thing.

Twice in one session, the same shape: the mechanics were right and the screen was
wrong, and only opening it said so. That is the argument for render-and-look
being a step rather than a courtesy — not that assertions are unreliable, but
that at the feature level there is nothing else looking.

### The 1.02 set — seven in one session, and the sentence they share

The batch above found three in one day. The 1.02 trio found **seven**, and they
are worth keeping together because the variety is the argument: no two are the
same kind of mistake, and every one of them is the same sentence.

**A check that cannot fail is not a check.**

| # | What looked like a check | Why it could not fail | What it became |
|---|---|---|---|
| 1 | A partial unique index on the proposals queue — "dedup is now a database fact" | `org_id` is NULL on every row, and a plain unique index treats NULLs as **distinct**. Both duplicate inserts succeeded. The index existed, read correctly in `pg_indexes`, and refused nothing. | `NULLS NOT DISTINCT`. Caught only because the leg asserts **the second insert is refused**, not that the index is present. |
| 2 | `check(true, 'the add form renders the picker')` after a bounded wait | Unconditional. It passed *while the wait was timing out* — written the same evening as the rule against exactly this. | Assert the wait's own return value, and throw if it never held. |
| 3 | `FieldSetDraftOutput`, a TypeScript validator | An output validator is **not an instruction to a model**. `drafter.md` carried no Return shape section, so nothing ever told the model what JSON to produce; every call failed `contract-output`. | The contract carries the shape, as the extractor's does. |
| 4 | `fields.every(f => f.sections.length > 0)` and `fields.length <= 20` | Both pass **vacuously on an empty array**. When the draft failed, four checks went green on zero fields — including *"every drafted field belongs to at least one column"*. | Prove arrival first; refuse to assert properties of an empty result. |
| 5 | The finder's pre-ticked candidate pages | Pre-ticking asserted a claim the heuristic had not earned: a completed **checklist** scored "8 schedule terms in 30 columns" and arrived ticked, because a checklist is also a dense tagged table. | Offer without asserting. Only a page **titled** a schedule, or one the sorter confirmed, arrives ticked. |
| 6 | Every structural assertion touching the type vocabulary | They read the **database**, and the data was correct. The Classifications screen — the owner's own ratification queue — had been rendering **nothing** since 2026-07-27 (hooks below an early return), and nothing in the battery could see it. | Found by taking a screenshot for the render-and-look gate. Hooks moved above the return. |
| 7 | `node run-battery.mjs 2>&1 \| tail -12` | The pipeline's exit status is **`tail`'s**. The task notification reported "exit code 0" for a battery that had failed, and the tail truncated away the summary line. A suite was also running alongside it, producing a failure that turned out to be fictional. | Never pipe the runner. Never run anything beside it. Both re-run clean at 31/31. |

**Read the table by column two.** The failures span a database index, a test
assertion, a model contract, an empty-array property, a UI default, a whole
screen, and a shell pipe. Nothing about them is a category of bug you could
grep for. What they share is the shape: *in the state this was meant to catch,
it produced the same output as in the state it was meant to allow.*

**And note where the two most expensive ones came from.** #6 and #7 were not
found by any assertion — one by opening a screen, one by reading an exit code
that had been thrown away. The suites were green throughout. That is the whole
case for render-and-look as a step, and for never letting a pipe stand between
a runner and its verdict.

### Budget classes buy DIFFERENT THINGS — reasoning buys thinking, extraction buys output

**A budget class defines two things: the token ceiling and the thinking posture.**
It used to define only the first, and the omission had a shape:

> **A class that lets thinking eat the output budget fails on exactly its
> densest, highest-value inputs.**

That is the worst possible failure curve. The page worth the most is the page
that dies.

*The evidence, 2026-08-04.* Clairlea M-601 carries 88 units in four schedules —
the richest page in the calibration corpus. Sent whole, the extractor logged
`outcome: truncated` at `max_tokens` 16,000 having spent **10,684 of them
thinking**, leaving about 5,300 for the rows. 27¢ for nothing.

Split into its four tables it got better and stayed wrong: two regions returned
**exactly** the hand-counted row totals (32 and 8), and two returned nothing —
**and not the biggest ones.** The 510-item table succeeded in 119s; the 380-item
table burned 170s and returned zero. **Failure did not follow size**, so the
variable was never the amount of work. It was how much thinking the model
happened to spend, which no amount of splitting controls.

*The precedent* is the classifier's, already recorded in its own contract: a
narrowed ceiling made it skip thinking, and the result was **more complete and
ten times faster**. Deliberation is variance on a transcription task, not value.

**So `extraction` disables thinking outright** (`CLASS_THINKING`), ceiling
unchanged at 8,000 with the 16,000 retry. Reading a table off a page is
transcription; there is nothing to deliberate about, and every token spent
deliberating is a row that does not get written.

Law 4 still holds unchanged: the posture comes from the **class**, never from a
call site.

### Nothing lands on main while a battery is in flight

The suites test **production**. A push to main redeploys the code the harness is
mid-way through testing, so the run reports failures that describe neither the
old code nor the new one.

*2026-08-04:* the battery reported `pw-intake FAIL exit=1` while a push
redeployed `api/intake.ts` underneath it. Run alone, `pw-intake` passed 61/61.

This is the same fictional-regression class as running two suites against the
fixture — the incident the runner header already records — arriving from a
direction that rule did not name. Both are in the header now. **A deploy is a
concurrent writer.**

*A second lesson from the same run, about how the verdict is READ:* the task
notification said "exit code 0" for that failing battery, because the shell's
exit came from a trailing `echo`. The real verdict, `RUN-BATTERY EXIT: 1`, was
inside the output. **Anything appended after the runner becomes the exit code you
are told about** — the same masking as the `| tail -12` incident, wearing a
different costume. Read the summary line, not the wrapper's status.

### A field report describes the SCREEN, not the system

**Reconcile against the ledger before diagnosing the pipeline.**

*2026-08-04:* "the extractor returned ~2 rows" was true and complete as a
description of what was on screen, and wrong about every layer beneath it. The
ledger showed ten calls, all `ok`, thinking disabled, and **88/88 rows extracted
through the real endpoint**. The rows existed; `onStaged(staged[0])` showed one
of ten uploads and 87 rows sat in `parsed` uploads nobody was shown.

Acting on the report alone would have sent the work to the extractor, the budget
class, or the region splitter — all of which were correct — and left the
presentation defect in place. **The reporter is describing the only thing they
can see. The ledger is what they cannot.**

This is the *prove the mechanism* rule pointed at bug reports: a symptom is
evidence about the surface, and the run log is evidence about the machine. Read
the second before rewriting the first.

### A gate that runs through a harness proves the HARNESS

**The gate is the field flow. Harnesses are callers of production modules, never
siblings.**

This is the unwalked-legs rule one layer up. That rule says: when a gate stops
short for safety, name the leg you did not walk. This one says: **a gate that
walks a different path has not walked the leg at all**, however green it comes
back.

*The evidence, 2026-08-04.* Phase 2b's gate reported 88/88 on Clairlea M-601 —
four regions, per-region counts exact against hand counts, tripwire silent. Every
one of those numbers came through `zz-gate3.mjs`, a harness that called
`detectTableRegions` and `renderRegion` in a browser and posted each region to
the endpoint itself. The production path — upload → confirm → `extractConfirmed`
— was wired but never run end to end.

The field test then found "~2 rows" where the gate said 88. **And the ledger
showed production had been right all along**: it ran the splitter, it ran the
amended budget class, and it produced 32 / 8 / 30 / 18 = **88/88** through the
real endpoint. What it did not do was *show* them — region splitting creates N
uploads and the review opened only the first, so 87 rows sat in `parsed` uploads
nobody saw.

So the harness proved extraction and proved nothing about assembly, because
assembly is the part the harness replaced with itself. **A sibling implementation
is not a test of the thing it resembles** — the same argument as the one-matcher
rule, applied to a pipeline instead of a function.

**Two obligations follow:**

1. The gate for a user-facing flow runs **that flow**. A harness may run beside
   it to prove the two agree, and that is dual-path evidence — but it cannot
   stand in for it.
2. A harness **calls** the production module. `cal-finder.mjs` does this
   correctly: it imports `src/lib/schedulePages.ts` through the dev server and
   runs the shipped code. `zz-gate3.mjs` did not, and that gap is exactly where
   the defect lived.

### A test boundary chosen for SAFETY creates a known-untested seam — name it

**Every gate report names the legs it deliberately did not walk.**

*The incident, 2026-08-04.* The schedule-page finder shipped with a render-and-look
gate that stopped at the confirmation screen. That was a deliberate, correct
choice: clicking through would have written intake rows to a real project. But it
meant the leg from *confirm* to *extract* was never walked end to end — and that
leg was **broken from the day it shipped**. `api/intake.ts` derived the media type
from `intake_uploads.filename`, and the finder's own human-readable naming
("…-IFT.pdf — page 7 (M-301)") made `split('.').pop()` return nonsense. Every page
a user confirmed, on every drawing set, returned 400. A field report — *"can't
extract anything"* — is how we learned.

`pw-schedule-finder` was green throughout. It tested the finder. The suite even
*said* what it did not cover — the deterministic filter's accuracy on a real set —
and that honesty is why the gap in the **other** direction is worth a rule: the
suite named an untested *capability*, and missed an untested *seam*.

**The rule:**

> A boundary drawn for safety is still a boundary. When a gate stops short —
> because going further would write to a real project, spend real money, or touch
> a live endpoint — the report says **which leg was not walked and why**. An
> unwalked leg that nobody names reads exactly like a walked one.

This is the render-and-look principle turned around. That rule says the screen is
the only check at the feature level. This one says: **when you decline to look,
say where you stopped.**

*Applied since:* the calibration corpus's manifest names what the fixtures do
**not** contain — no scanned page carrying a schedule, no two-page continuation,
no non-TDSB consultant — so their absence is never mistaken for coverage.

### Identity can live in a BINARY — source is not the artifact

A grep over source proves the **author's intent**. It cannot prove what the
program produces, because output has inputs source never mentions: stored content
in the database, committed binary assets, and a dependency's own defaults.

Found on 2026-08-05, by the harness built for the monochrome amendment
([DOCUMENT-IDENTITY-DECISION.md](docs/DOCUMENT-IDENTITY-DECISION.md), Amendment
1). Every value in `DOC` was monochrome. Every hex literal in `api/` was swept.
`grep -r` over the whole generator layer came back clean.

**The Cx Plan still came out purple.**

Its heading identity was never in `doc-common` at all — it is Word **style
definitions** inside the committed binary `firm-knowledge/skeletons/cx-plan.docx`
→ `word/styles.xml`: `443C8F` ×4 as a `w:fill` behind white text, `5D55AF` ×2 as
level-2 heading text. The skeleton was carved out of a real firm document by
`build-skeleton.mjs`, and it carried that document's palette with it. No amount
of reading `api/` would ever have said so.

**The general form: gate on the RENDERED ARTIFACT, not on the source that
produced it.** Pick the rendered format where the property is actually legible —
for colour that is the DOCX's WordprocessingML, where fills and text colours are
greppable text. A PDF stores colour as content-stream operands, so grepping a PDF
for a hex is a check that cannot fail: it reports clean on a fully purple
document. Where no greppable artifact exists, say so and look at the thing.

*Corollary for anything carved out of a firm document:* a skeleton inherits more
than structure. `styles.xml`, `theme1.xml` and `numbering.xml` all carry identity
decisions somebody made in Word, years ago, for another reason.

### A NEW PERMISSION IS AUDITED IN THE BATCH THAT INTRODUCES IT

A rule that widens what is allowed will be used, immediately, by whoever is
holding the pen — and the first misuse looks exactly like correct use.

Ruled 2026-08-06, when the Start-Up campaign's Phase 2 gained a new permission:
**firm practice may be cited as an anchor where the codes are silent.** It is a
good rule. Fifty years of field practice is a legitimate source, and refusing it
would have cut real checks — *rotation confirmed before the coupling is made up*
is the most common start-up failure the firm sees, and no standard says to look
for it.

**The permission was misused in its debut batch, by the author who had just
written it.** Six of seven firm-practice items were classified `universal` or
`type-common` while citing firm practice as their only anchor — a claim of
multi-source agreement backed by exactly one source. Every one of them read as
correct: the item was real, the reason was honest, the hint said "firm practice"
out loud. Only the *class* was a lie, and it was the quietest field on the row.

**The fix is not vigilance.** It is a refusal at the point of authorship:

```js
if (/firm practice/i.test(anchor) && convergence !== 'single-source') {
  console.error(`REFUSE: "${label}" cites firm practice but claims ${convergence}.`)
  process.exit(1)          // one source cannot be multi-source agreement
}
```

**The general form: when a ruling widens what may be written, the same commit
adds the check that the widening is not over-used.** A permission and its bound
travel together, because the gap between them is exactly one batch wide and
somebody is already writing in it.

**IT CAUGHT THE SAME AUTHOR AGAIN, ONE BATCH LATER.**

| | Batch | Rows misclassified | Shipped? |
|---|---|---|---|
| First catch | Phase 2 batch 2 — the batch that introduced the permission | 6 of 7 | no — caught in review, guard added |
| Second catch | Phase 2 batch 3 — the very next batch | 8 | no — the guard exited before any file was written |
| Third catch | Phase 2 batch 4 | 6 | no |
| Fourth catch | Phase 2 batch 5 — the batch that IMPORTED the guard rather than restating it | 5 | no |

Same error, same author, one batch after writing this entry. The only difference
is that the second time nothing reached a file, because the drafter exits instead
of emitting. **That is the whole argument for putting the bound in code rather
than in a habit: the habit was two paragraphs old and did not hold.**

**THE SECOND CATCH SHARPENED THE RULE, and this is its permanent form:**

> **Test the SOLE anchor.** An item anchored to a standard *and* firm practice
> has a real second source, and the standard carries the class. An item anchored
> only to us is **single-source, however it is worded.**

That refinement came from a row the guard flagged whose firm-practice mention was
doing no work — the manufacturer IOM already covered it. **The mention came out
rather than the class going down**, which is the correct direction: the fix for a
weak citation is to drop the citation, not to weaken the claim it supports.

**THIRD FIRE, THIRD BATCH, NOTHING SHIPPED.** Phase 2 batch 4 flagged six more
rows citing firm practice as their sole anchor while claiming convergence. The
tally is now three consecutive batches, three catches, one author — the author
who wrote this entry.

> Either the strongest possible argument for mechanical bounds or the weakest
> possible argument for my memory. It is both, and the useful half is the first.

**That is the case made in full.** A rule that lives in a habit decays across a
batch boundary; a rule that lives in an exit code does not. The bound was written
two paragraphs after the permission and still failed to hold as a habit three
times running — so the measure of a guard is not whether the author believes it
is needed, it is whether the author keeps setting it off.

*Precedents in this family:* the drafter that could not write
(`apply-ratified.mjs`), the applier that refuses a moved target, and the
convergence assertion that refuses a sitting sheet whose single-source items
carry no stated reason. Same shape each time — **the permission is real, and the
thing that makes it safe is that it cannot be quietly stretched.**

### A pattern is verified by EXECUTING it, never by reading it

Cross-language escape semantics can make corruption invisible to review.

Found 2026-08-05, in the Start-Up mine. A Python patch script wrote a JavaScript
regex containing `\b` — a word boundary. In a non-raw Python string
`'\b'` is a **valid escape meaning BACKSPACE**, so it raised no
`SyntaxWarning` (unlike `\s`, which is invalid and *does* warn, and which
warned loudly three lines away). Python silently wrote **0x08** into the source
where a word boundary was meant.

The regex then failed to match anything, and — this is the part worth keeping —
**it survived review twice.** `grep` and `sed` render 0x08 invisibly, so
reading the line back showed exactly the pattern that was intended. The file was
read, the pattern was retyped into a test, the test passed, and the conclusion
was that the code was fine. It was not: the pattern under test and the pattern
in the file were different strings.

**What actually caught it:** extracting the pattern *from the file* and executing
*that*.

```js
const line = readFileSync(f, 'utf8').split('\n').find(l => l.includes('signature++'))
const src  = line.match(/\/(\^.*?)\/i\.test/)[1]
console.log(JSON.stringify(src))        // JSON.stringify is what made 0x08 visible
console.log(new RegExp(src, 'i').test('Owners Representative'))   // false
```

`JSON.stringify` was the tell: a real backslash renders as `\\`, a control
character does not.

**The general form: never verify a pattern by looking at it.** Reading proves
what the terminal chose to render. Extract it from the artifact and run it
against a case that must match and a case that must not — the same
arrival-then-absence shape as every other guard here.

**The generator rule that follows:** a script in one language emitting source in
another must use raw strings or build the escape from parts. Every generated file
is also swept for control characters before it is trusted — the sweep found two
occurrences, both in the same file, and nothing anywhere else in the repo.

*Adjacent, same week, same family:* PowerShell variable names are
**case-insensitive**, so `$out = Receive-Job …` silently clobbered `$Out`, an
output-directory path, and a harness began writing files into a directory named
after its own success message. Twice in one session. Both are the same disease —
**a language rule that makes a wrong program look like the right one** — and both
are only caught by running the thing and checking what it actually did.

### An absence assertion proves ARRIVAL first, then absence

The same disease, aimed at nothing. `check(!body.includes(X))` is true of a page
that never loaded, of a half-rendered one, and of the login screen. It is true
before the feature runs and true if the feature is deleted. It is only *evidence*
once you know the page you are reading is the page you meant.

Found by sweeping the harness rather than by a failure — this one had been green
for months:

```js
await page.waitForTimeout(3500)
const body = await page.locator('body').innerText()
check(!body.includes('ZZ-TEST — Do Not Use'), 'dashboard shows no ZZ-TEST after removal')
```

**Measured at that moment: the body is 236 characters** — the sidebar shell. The
assertion had never tested anything, and would have passed identically had the
membership never been removed at all.

The shape of the fix, in two steps that must stay in that order:

```js
const ARRIVED = /No projects assigned yet|Portfolio Register/i   // holds in BOTH outcomes
await waitForText(page, t => ARRIVED.test(t), { what: 'the dashboard to render' })
check(ARRIVED.test(body), 'the page actually rendered (so the next check means something)')
check(!body.includes(X), 'and X is absent')
```

**Choosing the arrival marker is the hard part, and it is where the first two
attempts failed.** A marker that only holds in the *positive* outcome — here,
"ACTIVE PROJECTS", which the trimmed user has none of — makes the guard fail
exactly when it matters. The marker must be true in every outcome the assertion
sits between, or it is testing the outcome rather than the arrival.

*(That hunt also produced a false alarm worth recording: mid-investigation the
empty state looked like a hung dashboard. It is not — with no memberships the
page says "No projects assigned yet — ask an owner to add you to a project",
which is correct and clear. The check was the defect; the product was right.)*

**The test.** For any guard you are about to write or keep, ask: *what does it do
differently in the failing case?* If the answer is "nothing observable", it is
decoration. Give it a count, an error code, a named subject — something that
differs — or delete it, because a decorative guard is worse than none. It occupies
the place where a real one would go.

This one has a particular cost when the guard protects something serious. The
harness guard exists to stop test writes reaching a client's commissioning record.
Training people to shrug at it is the expensive part, not the wasted runs.

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

### Ops: a user-visible ship appends to docs/RELEASES.md in the same commit series

Two sections per entry, and they are for different readers:

- **For the team** — plain language, how-to-use. This is what goes out in update
  emails, so it is written for someone who will act on it, not for someone
  reviewing the diff.
- **Technical record** — mechanisms, rules, what moved underneath. For developers
  and for a future session reconstructing why something is the way it is.

**In the same commit series as the work**, per the standing docs rule. A release
note written later is written from memory; one written alongside the change is
written from the diff — and the difference shows in which details survive.

### Ops: parked work lives in docs/BACKBURNER.md, never in chat

**A decided-but-deferred feature is recorded in the register, not in the
conversation that deferred it.** Each entry carries a two-line spec summary —
enough to restart cold — and its **wake condition**. Items leave by exactly two
exits: **woken** into the active queue, or **shipped** into `docs/RELEASES.md`.
A parked item that turns out to be wrong is marked *dropped* with the reason;
the reasoning is the part worth keeping.

*The evidence: a session opened with a correctly-empty queue while a queue of
parked work existed — it had only ever been stated in chat between the owner and
the architect, so the machine could not find it, and neither could a later
session. The register was real; its location was not durable. Deferring work is
a decision, and decisions live in docs like every other one here.*

### Ops: bounded waits — new assertions from birth, old ones when touched

`pw-config` exports `waitUntil` / `waitForCount` / `waitForText`. They bound a
condition rather than betting on a sleep, and they cover both directions —
"not there" vs "not there YET", and its mirror "gone" vs "not gone YET".

**The standing policy, ruled 2026-08-02:**

> Instantaneous reads are converted to bounded waits **when their suite is next
> touched**. New assertions use the wait helpers **from birth**.

Roughly 150 instantaneous reads remain across the suites, most preceded by a
sleep that masks them. Converting them wholesale is mechanical churn on green
tests, and churn carries more regression risk than the masked reads do. The four
that actually cost battery runs — plus the delete-side cousins found by pattern —
are done.

A bounded wait weakens nothing. A condition that never becomes true still fails;
it just reports what was expected, what was last seen, and how long it waited,
instead of blaming the feature.

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

### Ops: a patch script searches FORWARD and asserts what it is about to splice

Editing source by string surgery is normal here — it keeps a large change
reviewable as one deliberate diff. It has one failure mode, and it is silent.

```python
start = s.index(NEEDLE_A)
end   = s.index(NEEDLE_B)          # searches from 0 — may land BEFORE start
s = s[:start] + new + s[end:]      # end < start ⇒ this PASTES, it does not replace
```

`NEEDLE_B` was `{assignError && …}`, which appears in the step-1 block as well as
the step-2 one. `end` landed on the earlier copy, and the splice duplicated
everything between them: the people list, the "Company only" checkbox and the
new-contact button all rendered twice. **Every assertion still passed** — the
feature worked — and only the screenshot showed it.

Two habits, both cheap:

```python
end = s.index(NEEDLE_B, start)                 # forward-search from `start`
assert end > start, 'anchor ordering'
assert s.count(ANCHOR) == 1, f'{s.count(ANCHOR)} matches'   # before any .replace
```

**Count the target before splicing on it.** A `.replace(x, y, 1)` on a string
that occurs three times edits whichever comes first, quietly. If the count is not
what you expect, the file is not what you think it is, and that is worth stopping
for.

Corollary already learned twice: a Python patch that fails its `assert` writes
nothing, which is why every script here asserts before it opens the file for
writing. A half-applied edit to a page like `DirectoryPage` is far worse than a
failed run.

### Ops: sanitise storage object keys, and read an "RLS error" on a write twice

**Supabase rejects `#`, parentheses and other characters in storage object keys —
and reports the rejection as `new row violates row-level security policy`.** That
message sends you into the policy catalog hunting for a permissions problem that
is actually in the filename. It cost an hour on the Seneca import, where
`257889-SenecaHWC-SDrev#1.1-AHUs_DOAS(2025-11-13).pdf` "failed RLS" while the
file beside it uploaded fine under the same policy, as the same user, in the same
loop.

Two rules follow:

- **Sanitise the key before upload, centrally** — in the one upload helper, not at
  each call site, so a new caller cannot reintroduce it.
- **On an RLS error from a storage write, check the key for illegal characters
  BEFORE touching policies.** If a sibling object succeeded under the same policy
  and user, the policy is not the problem.

Related: buckets differ in who may write them. `cx-plans`, `equipment-files` and
`finding-photos` carry `is_staff()` client policies; **`meeting-minutes`,
`site-reports` and `checklists` carry none by design** — the app writes those
server-side with the service role (`api/generate-minutes.ts` and the report
generators). A tool that needs to write them uses the service role, the way the
app does. **Widening a production bucket policy to suit a one-off import is the
wrong trade.**

### Ops: set document references on every run, not only on insert

An importer that writes `storage_url` / `pdf_url` **only in its insert branch**
leaves whatever is already there when the row exists — and something may well be.
On the Seneca import, issuing the meeting in the UI between two runs called
`generate-minutes`, which wrote an app-**generated** .docx/.pdf pair over both
columns; the next run left them, because its insert branch never ran.

The assertion missed it too: `check(!!row.pdf_url)` passed on a file the stage had
not written. **A non-null check is not a correctness check** — assert the exact
value you intended to write, or the green light means "something is there", which
is the one thing you already knew.

### Ops: a tool that writes to a real project carries a resolve-and-refuse guard

The test harness is guarded one way — `pw-config` forbids touching anything except
ZZ-TEST. **A tool that deliberately writes to a real client project needs the
inverse guard**, and it is not optional: it must resolve its target at run time
and refuse if what comes back is not what it expected.

Resolving by a stable key (`com_number`) and then **asserting the resolved name**
is the shape that works. Either half alone is weak: an id can be stale, and a
name can be edited. Together they catch the realistic failure — a copied script,
an edited constant, a project renumbered between runs.

**Fire it at the wrong target once, and record the refusal.** A guard that has
never refused anything is a guard nobody has tested; it is indistinguishable from
a guard with the comparison inverted. `seneca-import.mjs` was pointed at Humber
and produced:

> `REFUSING: com_number 257882 resolved to "Humber College New Mechanical RM Cx",
> expected "Seneca Health and Wellness Center".`

Same family as prove-the-mechanism: the proof is the refusal, not the absence of
damage.

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

## THE AGENT ARCHITECTURE — one brain, many agents, one keeper

The standing AI model. **Features compose agents; agents read the brain; the
librarian keeps the brain; nothing writes without a human.**

### The registry — `firm-knowledge/agents/<key>.md`

One front-mattered contract per agent. **Front-matter is runtime configuration**
(slices, budget class, schemas, review surface) and is never sent to a model; the
prose below it is the agent's instruction set and the only place its guarantees
are written.

| Agent | Class | Slices | Review surface |
|---|---|---|---|
| `writer` | prose | identity, style, terminology, domain-rules, exemplar | Cx Plan review screen |
| `verifier` | reasoning | **none** | flags on the review screen |
| `classifier` | prose *(narrowed to 4,000)* | terminology, domain-rules | `cx_applicability_proposals` |
| `extractor` | extraction | identity, terminology, domain-rules | intake review screen |
| `analyst` *(stub)* | reasoning | identity, terminology, domain-rules | `ai_candidate_findings` |
| `librarian` | reasoning | identity, style, terminology, domain-rules | `firm_corrections` |

#### The platform takes 12 serverless functions, and the 13th lies about it

A thirteenth function BUILDS cleanly — every asset emitted, no error, 54 seconds
— and then fails at **"Deploying outputs"** with no message naming the limit.
From the outside the symptom is: a green local build, an unchanged bundle hash in
production, and new endpoints answering 404 while the previous deployment keeps
serving perfectly. Nothing in that picture points at a function count.

**Diagnosing it without the Vercel connector**, which is not always available:

```
GET https://api.github.com/repos/<owner>/<repo>/deployments?per_page=1
GET .../deployments/<id>/statuses      -> state + the `npx vercel inspect` command
npx vercel inspect <dpl_id> --logs     -> build log; note where it STOPS
```

A build that completes and then errors is a *deploy-stage* failure, which is a
different class from a compile error and has different causes.

The response is not to campaign for a bigger plan. It is to ask whether two
endpoints were ever two things: `extract-page` and `intake-approve` shared their
upload resolution, their resolve-and-refuse guard and their role check, and are
now one `api/intake.ts` with an `action`. **Count functions when adding one, and
prefer merging siblings over spending the last slot.**

#### Some agent work is a JOB, not a request

A review surface is not always fed by a button. A full applicability pass is 13
bounded calls plus retries; the platform caps a function at 60 seconds and no
setting raises it on this plan (`maxDuration: 300` is accepted and silently
ignored). So the classifier ships as `classify-project.mjs`, run by an
administrator, and `ApplicabilityReview` reads the proposals it leaves behind.

The rule this makes concrete: **decide job-versus-request by the measured shape of
the work, and when it is a job, do not ship a button that always times out.** An
empty review surface that says where proposals come from is honest; a control that
fails after sixty seconds teaches the user the feature is broken.

### The runtime — `runAgent(agentKey, input, opts)`

Resolve the contract → **validate input before spending a token** → assemble the
declared slices → apply the class budget → call → **validate output fail-closed**
→ log per agent.

**Context is three layers, and the order is the precedence:** corpus slices, then
the **agent** contract (`agents/<key>.md`), then the **feature** contract
(`contracts/<feature>.md`) when a caller names one. Features compose agents: a
feature contract *references* its agents and never restates their constraints.

### Budget classes — the generation-budget lesson, generalised

| Class | Ceiling | Shape |
|---|---|---|
| `reasoning` | 16k | compares many things against many rules |
| `prose` | 10k | writes a few hundred words under a style card |
| `extraction` | 8k | transcribes structure — **per page**, never per document |

The ceiling is a property of the **task shape**, not a number a caller invents.
A contract may declare `max_tokens` to **narrow** its class ceiling — never to
widen it, which would let a contract escape the class the class exists to impose.

#### A ceiling is a LATENCY budget too — correcting the note above

The earlier guidance here said headroom is free because you are billed for what is
*used*, not what is *reserved*. **That is true of money and false of time**, and
the classifier proved it:

| Ceiling | The question asked | Thinking | Result |
|---|---|---|---|
| 16,000 | whole matrix, 3 stage groups | 10,904 | 131s, hit the ceiling |
| 16,000 | whole matrix, **1** stage group | **15,173** | 141s, hit the ceiling |
| 5,000 | whole matrix | **5,000** | 53s, **zero text**, hit the ceiling |
| **4,000** | **one stage group, bounded** | 0–4,000 | **~30s, complete answer** |

A large ceiling invites the model to fill it, and filling it is what takes the
seconds — but **narrowing the ceiling alone does not help**. Row 3 is the proof:
at 5,000 the whole-matrix question spent every token thinking and returned nothing.
An unbounded question has no natural stopping point, so it expands into whatever
allowance it is given and then dies at the edge.

What fixed it was changing the **question**, not the budget. "Which types does
*this one stage group* not apply to?" has a floor: a dozen types, a sentence each.
At 4,000 it answers in about thirty seconds, and 5 of 12 groups that still hit the
ceiling recovered on one retry at 8,000.

**Two lessons, and the second is the expensive one:**

1. Size a ceiling for the answer the task needs. Against a 60-second platform
   limit that decides whether a feature works at all.
2. **Measure the real artifact, not an approximation.** The 13s figure that
   originally sat in row 3 of this table came from a hand-written *approximation*
   of the prompt; the real assembled prompt at the same ceiling took 53s and
   produced no text. That single wrong number pointed four fixes in the wrong
   direction. It is the same failure as the page-text stamp check that was reading
   OpenType feature tags instead of page content — an approximate oracle is not a
   weak measurement, it is a confident wrong one.
Measured on the first run through the runtime: the writer spent 3,407 of 3,908
tokens thinking; the **verifier** spent 1,119 of 1,950 — which is why it is
`reasoning` and not `prose` despite returning a short flag list.

### The universal laws

1. **Every agent reads the brain through `ai-common`.** No private prompts.
   *Enforced:* `callModel` and `buildContext` have zero callers outside the module.
2. **Every agent proposes; none writes.** All output lands in a human
   ratification or review surface.
3. **Corrections feed the corpus through the ledger**, never by hand-editing a
   prompt.
4. **Budgets are per class; parse failures fail closed with the raw logged.**
   *Enforced:* the ceiling comes from `budget_class`, not from a caller.
5. **The verifier never shares context with what it verifies.** *Enforced:*
   `verifier.md` declares `slices: []`, so the runtime sends it an empty system
   prompt. **The isolation is a data fact, not a habit at a call site.**
6. **No agent self-modifies — the librarian included.** Contracts are read-only in
   the runtime.
7. **Nothing autonomous touches the record.** Findings, cells, documents and
   corpus changes all carry a human approval.
8. **Tag strings never decide type or applicability.** On one project `RP` was a
   radiant panel on the mechanical drawings and a receptacle panel on the
   electrical. The source's own descriptor decides; a tag may corroborate.
9. **Never ask an agent for a key its declared input cannot supply.** A contract's
   `input_schema` and `output_schema` must be reconcilable: if the output names a
   key, the input must be able to identify it. *Enforced:* the assembler resolves
   every returned key against the register — re-homing an answer given at a
   coarser grain to the surface that can act on it, and dropping an unresolvable
   one with a logged reason. **Resolved against the register, never trusted.**

   *Evidence — two defects, one session, one class:*

   | Asked for | Input contained | Answered with | Would have produced |
   |---|---|---|---|
   | a **tag** | no tags at all | category names | 10 proposals resolving to zero equipment |
   | an **equipment_type** | `null` on untyped units | the category name | 6 firm rules matching no equipment anywhere |

   Neither answer was wrong; both questions were unanswerable as posed, and the
   model answered at the grain it had. All sixteen would have been marked
   **ratified** while writing nothing — the silent success this architecture
   exists to prevent, arriving through the front door. Ratification surfaces now
   fail loudly on a proposal that resolves to nothing rather than reporting
   success for work they did not do.

   The general form: **where a review surface can act on an answer is part of the
   contract, not an implementation detail downstream.**

### Autonomy is graduated and earned

**Promotion of a category beyond individual ratification requires a demonstrated
acceptance track record in the health view, is ruled by the owner, and is revoked
by the same instrument if the rate slips.**

**Categories touching the signed record are never promoted** — findings, issued
documents, the issues log, and life-safety scope. That is not a threshold anyone
can clear; it is a permanent exclusion.

Every agent contract declares `autonomy_tier`, and **every category is fixed at
tier 1 (individually ratified). No other tier is implemented**, and the runtime
*refuses* a contract claiming one — a field that silently permits what no code
enforces is worse than no field at all.

The mechanics of promotion are a future build justified by future evidence. What
exists now is the **evidence base**: the ledger and the health view are keyed
**per proposal category**, not per agent, because a per-category ruling can only
be made on data captured before anyone thought to ask for it. `classifier:
applicability-rule` and `classifier:fire-integration` are separate track records
from the first row.

### The ledger — `agent_feedback`

Every review surface writes one row when a human touches an agent proposal:
`agent_key · category · disposition · before · after · evidence`.
Dispositions: `accepted` · `edited` · `rejected` · `dismissed` · `confirmed`.

**ONLY AGENT-ORIGINATED PROPOSALS FEED THE LEDGER.** A deterministic sweep and an
owner's ruling are not agent work, and writing them here would inflate the very
acceptance rates the autonomy dial reads — the ledger would report an agent
performing well on decisions it never made.

Ruled 2026-08-02, with two live examples on either side of the line:

| Wrote to the ledger | Did NOT write |
|---|---|
| The classifier's applicability proposals, ratified one at a time on the Cx Index — an agent proposed, a human ruled, and the disagreement rate is real evidence about that agent. | The Excel intake path. It is a parser, not an agent; the gate proves it (`ai_generations` 71 → 71 across a full run). Crediting the extractor for a string match would be crediting nobody. |
| The extractor's intake rows, keyed to the category the contract declares (`register-row` · `enrich-proposal` · `type-proposal`). | The type-assignment sweep and the ratifications that followed it — 118 units typed by the same deterministic all-words matcher, on the owner's ruling. Provenance for those is `import_batches`, the mechanism for human-ruled writes. |

The distinction is not bookkeeping. **The ledger is the evidence base a future
promotion decision reads.** A category showing 95% acceptance because most of its
rows were deterministic string matches would be an argument for autonomy built on
work no agent did.

**Only corrections cluster for the harvest.** An accepted draft is evidence the
corpus is *right* — it belongs in the health view, not in a proposal to change
something. What the librarian reads is where a human disagreed.

**A dismissed flag is as informative as a confirmed one**, and more so in
aggregate: a verifier that keeps raising something the CxA keeps waving off is
telling you the corpus is wrong, not the reviewer.

The ledger is **evidence**, so staff may write to it but only admin/owner may
amend or delete — evidence the measured party can quietly edit is not evidence.
Ledger writes are **non-fatal**: losing a measurement is a cost; losing an
accepted section is a loss.

### `firm_corrections` — the librarian's queue, and the gap it keeps visible

Ratified is **not** applied. Ratifying records the decision; landing it in the
corpus is a deliberate second step — a `firm-knowledge/` PR or a row write — and
`applied_at` stays null until then, so *ratified-but-unapplied* is a visible
state rather than an assumed one.

### Contract validation is real, not decorative

`agent-schemas.ts` holds runnable validators. Two encode lessons paid for in
production:

- **`VerifierOutput` requires `flags` to be present even when empty.** An absent
  array and an empty array mean different things — *"the check did not run"*
  versus *"the check found nothing"* — and collapsing them is exactly what let a
  truncated verification read as a clean bill of health.
- **`LibrarianOutput` requires non-empty evidence.** A proposal without evidence
  is an opinion, and the ratification screen exists to weigh evidence.

### Telemetry — one log, read per specialist

`ai_generations` carries `agent_key`, `run_id`, `budget_class`, `max_tokens`,
`thinking_tokens` and `outcome`. **Failures are logged too**: a run that produced
nothing still cost money, and silence there would hide exactly the failures worth
counting.

`ai_analysis_runs` (BAS-SPEC §3.7) is **superseded** by this table as of
2026-07-27. `ai_candidate_findings` survives as the analyst's ratification queue.

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

## Template content law — universal first, convergence earns the item

Ruled 2026-08-05 for the Start-Up campaign's Phase 2, and written here rather
than only in the campaign doc because it governs any future template family.
Full statement: [STARTUP-CAMPAIGN.md](docs/STARTUP-CAMPAIGN.md) § Phase 2.

**The product of a checklist family is the UNIVERSAL FORM** — one form usable on
most equipment as-is. A universal core of all-sources consensus items, a
deliberately thin type-common band (a handful of items, never a page), and
nothing granular below that.

**Manufacturer and model detail never enters a template.** It lives in one
standing line item — *"Manufacturer's IOM start-up steps completed & attached"*.
**A template that hardcodes one manufacturer's sequence is wrong on every other
manufacturer's unit; one that demands the IOM is right on all of them.** This is
the same reasoning that makes variants conditional sections rather than forks.

**An item earns its place by CONVERGENCE across independent sources**, and its
class is recorded with it: `universal` · `type-common` · `single-source`.
A single-source item is **cut unless a reason is stated** — a jurisdictional
requirement counts, "it seemed useful" does not. **The template holds consensus,
not collection.** The ratification table shows the class, so a sitting sees why
an item exists and not merely what it says.

**Length is not a neutral choice.** Field-worthy, not exhaustive — a lean form
gets filled and a long one gets skipped, and an unfilled form is worth nothing.
The nameplate campaign set the bar the hard way: `heat_pump` reached 25 fields
and was trimmed to 14.

**Anchors are web-verified and cited PER ITEM**, never recalled. Citation is what
makes a future regional re-scope a re-anchoring instead of a rewrite.

## The equipment taxonomy learns — ratified, never auto-minted

`equipment_types` is firm vocabulary as **rows**, mirroring `trade_types` /
`company_role_types`. Before this, the "vocabulary" was a hardcoded array inside
`EquipmentPage` plus whatever keys happened to have field-def rows — so a new
type needed a code change, and the taxonomy could not learn from a project.

- **`equipment.equipment_type` keeps its text key**, now FK'd to
  `equipment_types.key`. Existing keys and their field-def sets are unchanged.
- **A type may carry zero field defs.** It renders the fallback nameplate until
  defs are invested; the `vav` set remains the bar for a rich type. Minting is
  one row, not a 26-field commitment.
- **`proposed_equipment_types` is the ratification queue** — the corrections
  pipeline applied to vocabulary. Equipment fitting no type lands with
  `equipment_type` NULL and its family arrives in the queue for **mint / map /
  dismiss** in `/classifications`.
- **Imports never mint, and this is structural, not advisory.** The FK rejects an
  unknown type outright — proven on ZZ-TEST: inserting equipment with a
  non-existent type raises `foreign_key_violation`.

### Never auto-type from a tag string

**Tag prefixes are not unique across disciplines.** On Seneca 257889, `RP` is a
**radiant panel** on the mechanical drawings and a **receptacle panel** on the
electrical drawings — same project, same register. String matching on tags also
produced `HU-AHU-1` (a humidifier *serving* AHU-1) typed `ahu`, and
`Fire Pump Disconnect/ATS` typed `pump`. Both survived a passing import and were
caught only by an audit sweep afterwards.

An importer may **suggest**; only ratification assigns. The queue is the sole
path from "unrecognised equipment" to "a type in the vocabulary".

A corollary that cost a gate failure: **when a ruling names specific rows, check
whether the register holds more of the same class.** The Seneca ruling named
three receptacle panels because the audit's family regex had split the rest into
separate families; the register actually held 26 identical rows carrying the
source descriptor "Receptacle Panel". Correcting by the source's own descriptor
applied the ruling consistently — correcting by the named tag list would have
left 23 identical rows untyped beside 3 typed.

### The schedule-page finder — three costs, cheapest first (1.02)

Dropping a whole drawing set is now allowed, and the pre-pass is arranged so the
expensive answer is only ever bought for the pages that need it:

| Cost | Where | Scope |
|---|---|---|
| free | the **browser's** text layer (`src/lib/schedulePages.ts`) | every page |
| ~1–2¢/page | the `sorter` agent | only pages the filter could not call |
| the real cost | the `extractor` | **only pages a human ticked** |

**The filter runs client-side on purpose.** The file is already in the user's
hands before a byte is uploaded, so reading its text layer costs nothing, needs
no round trip, and never pushes a 300-page PDF through a serverless function's
memory.

**It is deliberately asymmetric.** A missed schedule page costs a scroll; a
wrongly-included plan sheet costs an extraction call and a page of nonsense rows
in the review screen. So a page needs evidence to be proposed and only obvious
plan-sheet markers to be set aside — and everything in between goes to
`ambiguous`, which is the model's job, not a silent rejection.

**`sorter` takes `slices: [terminology]` and nothing else.** Identity and style
cannot change whether a page is a table. Context that cannot change the answer is
cost — the same argument the extractor's contract makes about spreadsheets.

**A failed sort fails OPEN, into the human's hands.** The pages come back
*undecided* to the confirmation screen. It never drops them, and it never guesses
them in.

**One upload per confirmed page.** The extraction budget is per page, so a page
is the unit of work, of cost, and of provenance — and a set where page 44 fails
still yields 41 and 42. Failures are **named, not counted**.

**Being offered is cheap; being ticked by default is a claim.** Render-and-look
against a completed *checklist* PDF had two of its three pages pre-ticked: a
checklist is also a dense tagged table with MODEL and MANUFACTURER headings, and
it scored "8 schedule terms in 30 columns". The keyword-count route now *offers*
a page without pre-ticking it; only a page **titled** a schedule, or one the
sorter confirmed, arrives ticked. The heuristic was not wrong to surface it — it
was wrong to assert it.

### The drafter — a seventh agent, and why its budget class is argued (1.02)

`drafter` proposes the nameplate table for a newly minted equipment type. It is
the first agent whose contract **argues for its own budget class in prose**, and
that is deliberate: the classifier's incident showed that a `reasoning` budget on
an unbounded question is spent entirely on thinking and returns zero text.
"Draft 10–15 fields for one named type" has a natural stopping point, so it takes
`prose`. Ruled 2026-08-02: **measured after, not before** — telemetry from real
calls moves the class, and it moves narrower before wider.

**Law 9 at the shape.** `FieldSetDraftInput` requires a **non-empty
`base_field_names`**. The contract forbids duplicating the universal identity
set, so the names of that set are a required input rather than something the
model is expected to know. The ruled unit convention is passed the same way. A
contract that demanded either without supplying it would be asking for a key its
declared input cannot supply.

**Three refusals, all before any spend:** not staff (403) · unknown type (404) ·
**a type that already has a table (409, with the count named)**. The third is the
one that matters — approving a draft for a type already in use would silently
compete with defs on live projects.

**The rule is enforced twice, deliberately.** Fields colliding with `__base` are
forbidden in the contract *and* dropped at the endpoint. A rule that lives only
in prose is a rule the next model version may not follow, and the reviewer must
never be shown a row that would duplicate identity.

**A field in no column is refused at approve.** It would render nowhere — a draft
that "succeeded" and shows nothing.

**Two failures from the first real call, both worth keeping:**

| What happened | What it cost | The lesson |
|---|---|---|
| `drafter.md` carried no **Return shape** section, so the model was never told the JSON to produce. Every call failed `contract-output`. | One 502. | An output schema in TypeScript is not an instruction to the model. The contract carries the shape, as the extractor's does. |
| `pw-drafter` asserted properties of the returned fields with `.every()` and a length bound. **Both pass vacuously on an empty array** — so when the draft failed, four checks went green on zero fields, including *"every drafted field belongs to at least one column"*. | Nearly shipped a suite that certified a broken feature. | **A property assertion proves ARRIVAL first.** Same shape as the absence-assertion rule, one layer over. |

### The 12-function ceiling shapes the architecture, not just the deploy (1.02)

`api/` is at 12 of 12. Both new agent calls in 1.02 therefore route through
`api/intake.ts`'s action allow-list rather than taking a function each. The
drafter is a mild semantic stretch — it serves the type vocabulary, not an upload
— and it is the right call, because the ceiling is physical and the alternative
was refactoring four live portal endpoints in the same session.

**The clean fix is parked, not forgotten:** folding `portal-invite` /
`portal-link` / `portal-redeem` / `portal-share-link` into one `api/portal.ts`
router frees three slots. Live security endpoints get their own session with
their own gates — never as a side effect of a feature.

### Applicability is never seeded speculatively — with ONE recorded exception

**The standing boundary.** A newly minted type gets its `__base` identity set
and, on ratification, a drafted nameplate table. **Nothing else.** The classifier
proposes applicability only when a project first carries real units of that type.
A catalog is a claim about what *might* appear; an applicability rule is a claim
about what a *specific project* must verify, and seeding the second from the first
puts a queue of speculative rules in front of a CxA who has never seen most of the
types in it. An unread ratification queue is worse than an empty one.

**The exception, ruled 2026-08-03, and its edge is part of the rule:**

> The exception applies **only** to types minted specifically for integrated
> systems testing, **only** for the fire-integration stage group, and **only**
> where the owner rules the applicability in the same sitting as the mint. It
> does not extend to any other stage group, and it is not a precedent for
> "obvious" applicability anywhere else.

*Why it holds.* The boundary exists to stop an unread **queue** — and a rule the
owner *rules* never enters the queue. An applicability rule is keyed to
*(type × stage group)*, so a project carrying no smoke control fans **never
renders that row**: the rule is invisible until a unit of that type exists, at
which point it is exactly right and arrived without a sitting. For a type whose
entire reason to exist is IST scope, the fire-integration applicability is not a
prediction about a project — **it is a property of the equipment class.** A smoke
control fan is in the integrated test on every building that has one; CAN/ULC-S1001
names smoke control among the systems whose interconnections it verifies.

*Why the edge is written down rather than left to judgement.* The argument
generalises badly. "Types whose reason to exist is IST scope" stretches, with no
effort at all, into "types whose scope is obvious" — and obvious is where
speculation hides. There is a real asymmetry behind that: **a wrong ruled rule is
silently wrong on every future project, while a wrong proposal is read once and
rejected.** An exception without a stated edge is just the rule being weaker than
it says.

*Applied to:* `smoke_control_fan` and `smoke_control_panel`, both ruled in the
same sitting as their mint. No other type carries a rule it did not earn from
real units.

### Variants are DATA. Splitting a type is a mint ruling, not a drafter decision

**A variant within an equipment class is handled by a discriminator field plus
conditional rows — never by splitting the type.** A gas-fired unit heater and an
electric one are both unit heaters; `Heating Medium` says which, and the gas
fields sit blank on the units that have no gas, exactly as `fan`'s MBH sits blank
where there is no heating coil. Same for humidifier `Type`.

**Types are equipment classes. Variants are values.**

Splitting is justified **only when the variants diverge in verification scope the
way distinct equipment does** — the RTU-vs-AHU bar: an RTU carries condensing and
gas sections an AHU does not, so it is verified differently and is its own type.
That is a **mint ruling by the owner**, and it is never a drafter decision, never
an inference from a field set, and never a convenience.

*Two precedents, in both directions.* `booster_pump` was declined: it is a pump
with a duty, and fragmenting a 53-unit family buys nothing a descriptor does not.
`unit_heater_gas` was declined on the same reasoning, with the discriminator the
drafter had already proposed as the mechanism. Against them: `fire_pump`,
`jockey_pump` and `sump_pump` were minted, because a fire pump's verification
scope (NFPA 20/25 flow test, churn, driver) is genuinely not a pump's.

The cost of getting this wrong runs one way. A wrongly-split type fragments a
family that field staff already know how to fill in; a wrongly-merged one costs
some blank rows. **Blank rows are conditional-field cost, not the half-empty-form
problem** — that problem is a form with nothing relevant on it, not a form with a
section that does not apply to this unit.

### Law of the ratification machinery — ratification binds to an ARTIFACT

*A law, not a note. It sits beside "every agent proposes; none writes" and governs
every ratification surface in the system, current and future.*

> **Ratification binds to an artifact, not a process. What is applied is the
> stored, reviewed content — byte-identical to what the human read; re-generating
> at apply time redefines approval as permission, because a model asked twice is
> a different answer. Draft tools cannot write; apply tools cannot draft; the
> applier refuses when the target has moved since ratification.**

*Evidence — 2026-08-03.* The catalog campaign's batch runner re-ran the drafter
inside its `--apply` flag. **A field was applied that was never ratified**
(`lighting_panel` gained `Area Served`, absent from the reviewed twelve), another
type received one addition instead of the two that were read, and the token
counts differed between the two runs. 185 def rows and 10 ledger rows were
written un-ratified and reversed by insertion timestamp.

The shape is the guard family's, one level up: **"apply the approved thing" and
"ask again and apply the answer" return the same output whenever the source is
deterministic, and differ only where it matters.** A model is exactly where it
matters.

#### The audit against this law, 2026-08-03

Every ratification surface in the system, checked rather than assumed:

| Surface | Verdict | What it actually does |
|---|---|---|
| **Drafter** — field-set tables | **COMPLIES (fixed)** | `proposals/batch-N-ratified.json` is the artifact; `apply-ratified.mjs` makes no model call, refuses on a moved target, and reads back every field it claims to have written. `draft-batch.mjs` can no longer write. |
| **Librarian** — corpus proposals | **COMPLIES** | The harvest inserts into `firm_corrections` with `status='proposed'` and states it: *"Queue for ratification. Nothing here is applied."* Approval reads the stored row. No re-derivation, no second model call. |
| **Mint queue** — proposed types | **COMPLIES** | `mintFromProposal` reads `proposed_key`/`observed_name` off the stored proposal and inserts. `normaliseKey` is pure. |
| **Classifier** — rule ratification | **COMPLIES** | `ratify()` upserts exactly the stored proposal's fields into `cx_applicability_rules`. No model call at apply time. |
| **Classifier** — *exception* ratification | **PARTIAL — flagged** | See below. |

**The one partial, stated precisely.** Ratifying a category-scoped *exception*
re-queries the equipment table at apply time to expand the category into unit
IDs. That re-derivation is **deterministic** — it is a database read, not a model
call — so it is not the failure this law exists to prevent. But it means the unit
count written can differ from the count the human read, if units were added or
retyped in between. The screen already refuses to write when the proposal
resolves to *zero* units — *"a button that reports success for work it did not do
is the worst thing in this system"* — but it does not notice when the number has
merely **changed**.

That is the same staleness the drafter's applier now refuses on, and it is
**recorded rather than fixed tonight**: the exception path is deterministic and
its failure mode is a wider-or-narrower write, not a fabricated one. The fix is a
count check at ratify time, matching `apply-ratified.mjs`'s moved-target refusal.
**On the deliberate-pass list.**

### How the artifact split is built

**Drafting and applying are separate acts on a stored proposal. Never one command
that does both.**

*The incident, 2026-08-03.* The batch runner's `--apply` flag re-ran the drafter
and wrote whatever came back. The model is not deterministic, so what landed was
not what the owner had read and approved: `lighting_panel` gained an `Area
Served` field that was never in the ratified twelve, `convector` got one addition
instead of two, and the token counts differed between the two runs. **185 def
rows and 10 ledger rows were written un-ratified** and had to be reversed by
insertion timestamp.

Nothing was lost — the reversal was clean and the ratified tables went in
afterwards from a file. What was nearly lost is the meaning of ratification: an
owner who approves ten tables has approved *those ten tables*, and a system that
answers "apply what I approved" by asking the model again has quietly redefined
approval as permission.

The shape is familiar from the guard family — **"apply the approved thing" and
"ask again and apply the answer" produce the same output on a deterministic
source, and only differ where it matters.** A model is exactly where it matters.

The mechanism: the ratified batch is written to `proposals/batch-N-ratified.json`
by hand from the reviewed output; `apply-ratified.mjs` reads that file, **makes
no model call at all**, refuses if the target moved since ratification (field
count changed, or a name would now duplicate), and reads back every field it
claims to have written.

### Aliases — exact match only, and a never-alias list with teeth (1.02)

`equipment_type_aliases` makes shorthand **vocabulary data**: a row an admin
edits beside the types, not a constant that needs a deploy. `resolveTypeDetailed`
resolves in three tiers — canonical name/key, then **exact alias**, then the
all-words law-8 matcher — and reports *which* tier hit, so the picker can show
`matched "UH"` instead of asking to be trusted.

**Aliases match exactly and never as words.** "UH" resolves to Unit Heater;
"UH-3 PUMP ROOM" resolves to nothing. Treating two-letter shorthand as a word bag
is how a tag prefix starts claiming units — the same failure the section above
exists for, arriving one layer lower.

**`blocked_type_aliases` + a BEFORE INSERT trigger.** Some shorthand must never
become an alias and the reasons are specific, so the reason travels with the
refusal. `rp` (the RADIANT/RECEPTACLE collision), `ct` (a current transformer on
the electrical side of the same set), `ch`/`p`/`wf` (tag-prefix collisions), and
`rtu`/`hrv`/`vrf` — **distinct equipment, not shorthand**, which arrive through
the picker's propose flow when a real unit surfaces. A doc note would not have
stopped a future admin typing `RP` into the alias field; the database does, and
it answers differently in the two states.

**The save is never blocked.** No match offers a dropdown row that saves the unit
with `observed_type_name` and files a deduped queue entry. An unknown type is a
vocabulary gap, not a data-entry error.

**Two self-catches from this build, both instances of rules already written here:**

| What looked right | What was true | How it surfaced |
|---|---|---|
| A partial unique index on the proposals queue — "dedup is now a database fact" | `org_id` is NULL on every row, and a plain unique index treats NULLs as **distinct**. Both duplicate inserts succeeded. The index existed, read correctly, and refused nothing. Fixed with `NULLS NOT DISTINCT`. | The pw leg asserts the second insert is **REFUSED**, not that the index is present. Asserting the artifact would have stayed green forever. |
| `check(true, 'the add form renders the picker')` after a bounded wait | The wait was timing out and the check passed anyway — a check that answers the same in both states, written the same evening as the rule against them. Now asserts the wait's own return value. | The next line used the picker and threw. Had it not, this suite would have shipped green while testing nothing. |

**The general form, again: assert the REFUSAL, not the guard's existence.** A
constraint you can see in `pg_indexes` and a constraint that fires are different
claims, and only one of them is worth a test.

---

## Import provenance — `import_batches`

Rows that were **backfilled from documents** rather than created in the app carry
an FK to the batch that made them. Nine tables have a nullable `import_batch_id`:
`contacts`, `project_team_assignments`, `equipment`, `cx_cell_values`, `findings`,
`meetings`, `meeting_items`, `documentation_register`, `cx_plans`. NULL means
"born in the app", which is what every pre-existing row is.

**The requirement it exists to meet: a bad import must be removable BY ID, never
by pattern.** Deleting "the rows that look imported" is the cleanup-sweep mistake
in another costume — it cannot tell a row the import created from a row a human
later edited to resemble one, so it eats real work. Removal is
`where import_batch_id = $1`.

**`ON DELETE RESTRICT` on all nine references, deliberately.** `SET NULL` would
let someone delete the batch and leave the rows behind — silently unattributable
and no longer removable by id, which is exactly the state the table exists to
prevent. RESTRICT makes removal a deliberate two-step: rows first, then the
batch. Proven on ZZ-TEST rather than assumed: the orphaning delete raises
`foreign_key_violation`, and the batch deletes cleanly once its rows are gone.

The batch row records `source_file` (**relative to the document store — never an
absolute local path**, which would be meaningless elsewhere and would name a
user's home directory in a shared record), the `source_revision` the file claimed
about itself, and `rows_expected` vs `rows_created` so a discrepancy is named at
execution instead of discovered later.

`finding_origin_enum` gained **`design_review`** in the same migration. The four
existing values all describe construction-phase observation; design-review
comments are none of them, and forcing them into `site_visit` would misreport
their origin for the life of the project.

---

## Standing rules (permanent — apply to every session)

- **Every change maintains its own paper trail, in the SAME commit series.**
  New module, schema change, new architecture layer, new standing pattern — the
  documentation is part of the change, not follow-up work.

  **Purpose, stated so the rule is applied rather than performed: drift visible,
  debugging cheap. A future session must be able to reconstruct what changed, why,
  and what it touched from the repo alone.** Every row below exists because a
  session that lacks it re-derives, contradicts, or rebuilds.

  *(Surface expanded 2026-08-02 — the original rule named the first four rows
  only. RELEASES, BACKBURNER, the queue lists, the graph, and provenance were all
  in force but recorded elsewhere or nowhere.)*

  | Kind of state | Where it belongs |
  |---|---|
  | As-built technical state, mechanisms, rules + evidence tables | `ARCHITECTURE.md` |
  | Schema deltas · feature state | Build Spec §3 · §1A / §12 |
  | Roadmap state | `docs/MASTER-BRIEF.md` §4 / §10 |
  | A completed proposal | The proposal doc itself, **flipped to as-built with a departures table** |
  | Every user-visible ship | `docs/RELEASES.md` — both voices |
  | Parked work, in and out | `docs/BACKBURNER.md` |
  | Open items that must survive a session boundary | The todo / queue lists |
  | Code structure | **The knowledge graph — re-run `/graphify .`** after a session that moves it |
  | What a write actually did | Migrations · batch provenance · the commit message's per-file doc-change list |

  **The graph row is not optional tidiness.** A stale graph answers *confidently*
  about code that has moved — the silence-class failure in a new costume, and
  worse than no graph, because it converts "I don't know" into a wrong answer
  delivered with structure.

  **The docs are how sessions boot.** A shipped change that is not in them does
  not exist for the next session.

  Two obligations that come with it:
  - **Flag stale claims, never silently rewrite them.** A struck line with a dated
    correction beneath it teaches what was believed and why it was wrong. A
    silently corrected line teaches nothing and hides that anyone was ever
    mistaken. (Precedents: the `project_members` → `portal_members` corrections,
    the byte-clean-baseline claim, the `gray-400` contrast note.)
  - **List per-file doc changes in the commit message.** A reviewer must be able
    to see which documents moved without opening the diff.

- **NEVER run `vercel dev`, `vercel link` or `vercel deploy` in this working tree.
  `doc-render-local.mjs` is the local render path.**

  Ruled 2026-08-05 after a real incident. `npx vercel dev --yes` was run to get a
  local surface for the monochrome sweep. `--yes` accepted every prompt: it
  **created a second Vercel project** (`isotherm-cx`) under the `isotherm` team
  and **connected it to the production GitHub repo**. Two projects on one repo
  means the next push builds twice — a duplicate deploy against production
  infrastructure, from a command that reads like a local dev server.

  It also did not work. Vercel detected the Vite framework and handed the port
  straight to `vite --port $PORT`; `/api` was never mounted. **The command that
  created the hazard could not have answered the question anyway.**

  Recovery, in the order it should be done: `vercel git disconnect` first (stop
  the deploys), then revert the `.gitignore` line Vercel appends, then remove
  `.vercel/`, then delete the project. The project deletion is the owner's call,
  not the agent's.

  **The local render path is `doc-render-local.mjs`** — it esbuild-bundles an
  `api/*.ts` handler, calls it in-process with a Vercel-shaped `(req, res)`, and
  returns the response. Real handler, real Supabase, real `html-to-docx`, working
  tree, no deployment, no project, no link. A palette or generator question costs
  nothing. Its one substitution is `@sparticuz/chromium-min` → a Playwright
  Chromium shim, because the real package ships a Linux Lambda pack that cannot
  resolve on Windows; that seam is named in the shim's own header and is valid
  for colour, not for pagination or font fallback.

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
