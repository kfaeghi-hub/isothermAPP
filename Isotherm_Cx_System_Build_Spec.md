# Isotherm Engineering — Commissioning Management System
## Production Build Specification & Claude Code Blueprint

> **Phase numbering:** the canonical roadmap is `docs/MASTER-BRIEF.md` §5; translations
> in `docs/PHASE-MAP.md`. This document owns product detail for Master Phases 1–3 only.
> "Phase 3 — Intelligence, scale, portal" below is an umbrella dissolved into Master
> Phases 4–9.

**Prepared for:** Tony Faeghi, Isotherm Engineering Ltd.
**Purpose:** Complete blueprint to build Isotherm's internal commissioning management system, replacing the current manual Word/Excel workflow. This document is written to be handed to **Claude Code** to build the production application, and to brief stakeholders.

---

## 1A. Build status (living — update as modules ship)

### Phase 1 — COMPLETE (deployed to https://cx.isothermengineering.com; the isotherm-app.vercel.app URL still works)

**Built, tested, committed:**
- Scaffold (Vite + React + TS + Tailwind v4), Supabase wired (ca-central-1), project on local disk, GitHub repo connected, ARCHITECTURE.md in place.
- **Auth & roles:** branded login page, inline forgot-password flow, Supabase password-reset flow (redirects to `/reset-password`), AuthContext wrapping the full app, no public signup, logout. Four roles at Phase 1 close: admin / developer / user / client. *(Now five — `owner` added 2026-07-20 with the access-control/owner-tier build; §3.3.)*
- Database schema (all tables) with **real per-role RLS** via `get_my_role()` SECURITY DEFINER function (38 tables; dev allow-all fully replaced).
- **Directory** — companies & contacts, extensible roles, filtering.
- **Projects** — list, create with project-type, active/completed sections, search, filters, delete.
- **Project trades** — firm master list + per-project selection; feeds finding categories.
- **Issues Log** — findings with optional `title` field (distinct from category), oldest-first append-only diary, photo upload + delete, open/closed-stays-grey, **finding delete** (confirmation modal, cascades diary entries + photos + storage files, no renumbering).
- **Cx Index** — final 12-group / 88-column structure, per-project editable copy, progress cells, edit-structure controls.
- **Equipment Register** — type-specific editable fields in Spec / Shop Drawing / Installed sections (11 seeded equipment types), tag glossary with discipline-aware descriptors and tag/descriptor autocomplete, per-equipment file attachments.
- **Site Reports** — list, create, PDF generation (Puppeteer + @sparticuz/chromium-min@133.0.0 via Vercel serverless function) + DOCX generation (html-to-docx@1.8.0 via same function). Both outputs from `api/generate-report.ts` (Node.js, `maxDuration: 60`). Report: letterhead, project header, distribution table, narrative, documentation register, issues log with photos. Footer rendered via Puppeteer `displayHeaderFooter` / `footerTemplate` (not `position:fixed`) to prevent row-clipping at page breaks.

### Phase 1 change (2026-07) — project classification framework
- Single `project_type` replaced by five admin-editable classification dimensions
  (§5.1) with real deliverable composition from `option_deliverable_defaults` (§5.2).
  Includes: dynamic New/Edit Project picker, badges + per-dimension list filters +
  "classification incomplete" flag, admin Classifications screen, "Systems to be
  Commissioned" rename (trade_types untouched), client inline-add, COM#/address/phase
  convergence controls. Existing projects backfilled to New Construction.

### Phase 1 additions shipped after the classification framework (2026-07, all live)
- **Directory enhancement** — contact_phones/contact_emails (typed, partial-unique
  primaries), company_locations, company phone/website/email, dual-read transition
  from the legacy columns.
- **Project Team matrix** — company_role_types with abbreviations,
  project_team_assignments (composite FK to contacts, column-scoped SET NULL,
  UNIQUE NULLS NOT DISTINCT), Team tab communication matrix, Company Roles admin
  section with dual-count reference-aware delete.
- **Project dates** — start_date/finish_date, header range, list sort.
- **Findings full register (ASHRAE 202)** — identified_by, building_area, description
  (replaces initial-diary seeding; the diary is the dated resolution record),
  corrective_action; date_closed serves as Date Resolved (label only, auto-set on
  close / cleared on reopen); grouped searchable EquipmentPicker (Systems first,
  Equipment-tab category order); register renders in site-report issue cells
  only-when-present so historical findings regenerate byte-clean.
- **Meeting Minutes** — meeting_types + per-type default agenda topics (admin
  sections on Classifications), meetings/topics/attendees/items (6 tables), topics
  copied per meeting (each meeting owns its agenda), carry-forward retaining
  original item numbers until closed, matrix-attributed responsible parties +
  free-text fallback, FindingPicker display-only links, draft→issued with
  issued_at, generate-minutes on the doc-common stack (role-grouped attendees,
  navy topic bands, Action Summary by Responsible Party, 7-day disclaimer).
- **Internal Dashboard + router** (§6B internal half) — react-router-dom landed
  (`/` dashboard home, `/projects`, `/projects/:id?tab=…`, admin-gated
  `/classifications`, client-role redirect); stat chips, Attention Queue,
  portfolio cards, Follow-up Radar, Portfolio Timeline, findings trend +
  by-system charts, Open Items by Responsible Party (company-id reconciliation,
  never string-matching), My Items (name-matched), Recent Activity (derived, no
  events table); per-project Overview stat header on the SAME derivation as the
  cards; thresholds in one module; dashboard_checklist_coverage view
  (security_invoker).
- **doc-common extraction** — shared letterhead/CSS/toPdf/toDocx/upload layer under
  api/_shared, proven byte-clean by regeneration diff before any new consumer.

### Phase 2 — checklist engine: COMPLETE AND CLOSED (2026-07-21)

**Engine (built and verified on production):** 14-table template/instance/response
schema, Template Library, instance snapshots, multi-unit parallel columns, fill-out
with offline outbox (localStorage, natural-key upserts), failed-item finding modal
with duplicate prevention and a finding QUEUE (bulk copies walk one modal per hit),
signoffs, completion with nameplate snapshot, reopen audit trail, PDF+DOCX
generation in FOUR render modes (§6: completed · blank Field Copy · blank
Contractor Hand-out · transposed check_table fleet mode), standardized empty-cell
semantics, wide-grid ≥5-column per-target rule, section-band keep-with-next
pagination, multi-unit copy feature (row apply-to-all; column copy-from-unit that
never overwrites), PFC/IVC source-identity typing rule (Prefunctional folder →
pfc; names follow type: "⟨Equipment⟩ Prefunctional Checklist").

**Template library: BOTH SEEDING CAMPAIGNS CLOSED — 238 templates in the register
(181 ivc / 57 pfc).** CSA IVC campaign (180 templates) closed 2026-07-21
(`docs/CSA-SEEDING-LOG.md`); PFC campaign (56 templates) closed
(`docs/PFC-SEEDING-LOG.md`); plus the two pre-campaign AHU templates. Extraction
governed by `docs/EXTRACTION-PLAYBOOK.md` — 26 standing rules, six source
grammars, four harness source modes; every template passed the
`audit-template.mjs` five-family self-audit. **The next campaign (Start-Up, then
FPT) starts from those three documents.**

### Phase 2 close-out additions (2026-07-20/21, all live)

- **Access control (as-built record: `docs/ACCESS-CONTROL-PROPOSAL.md`)** —
  `project_members` membership wall + membership-scoped RLS across every
  project-scoped table, destructive-rights concentration, own-drafts rule, C2
  status-guard trigger, creator auto-membership trigger. Gate: pw-access.
- **Symmetric owner tier (as-built record: `docs/OWNER-TIER-PROPOSAL.md`)** —
  5-role model (admin / developer / owner / user / client; §3.3),
  `is_owner`/`is_staff`/`owner_member` helpers, the §3.1 inline-role-list sweep,
  the `project_members` wall predicate, `list_internal_profiles` RPC, `dev.admin`
  as sole all-seeing break-glass account. Gate: pw-access 54/54.
- **Deliverables tab (as-built record: `docs/DELIVERABLES-TAB-PROPOSAL.md`)** —
  four-state lifecycle with app-side date stamps, ad-hoc via the pool-or-adhoc
  CHECK, compose-from-classification with active-flag filtering (idempotent),
  pool-delete snapshot-to-ad-hoc, dashboard overdue queue + My Items. LEED model:
  Fundamental 7 / Enhanced 14 / MBCx 3 / Envelope BECx 6 dormant. Gate:
  pw-deliverables 22/22.
- **UI overhaul (2026-07-22)** — full visual-system redesign executed with
  EXTERNAL design tooling/skills (not in-repo specs): logo-pinned purple/vermilion
  palette, Archivo + Spline Sans Mono, motion system, single chart grammar. Future
  readers: the styling provenance and as-built record live in ARCHITECTURE.md
  "UI & Design System" — do not look for it in this spec's history.

**Remaining after close-out:** Start-Up campaign (GATED: Word COM fix + the
startup-type decision), FPT module + campaign (PARKED post-rollout; S03
Balancing-Report ruling flagged), then Phase 3 remainder — reminders/aging, Status
& Action Summary (§6A), data import (contacts, equipment), long-form documents
(Cx Plan, OPR, BOD, Systems Manual, Final Report), client portal, MBCx/OCx.
Canonical queue: MASTER-BRIEF §10.

### Master Phase 6 — AI Trend-Log Verification (SPEC'D — see docs/BAS-SPEC.md)
- Module spec complete (v1.2), validated against real TDSB enteliWEB exports and
  approved BAS submittals (Delta: Steele JPS, Winston Churchill CI; ALC: Bloor CI)
- Build order: BAS-1a submittal point extraction → BAS-1b CSV trend ingestion →
  BAS-2 sequences + AI candidate findings. Scheduled/live sources: Master Phases 8–9.
- Not started; blocked on Phase 2 completion by design (MASTER-BRIEF §10)

**Open real-world decisions (not build tasks):** confirm Ontario 10-yr retention specifics with compliance advisor (§9C); finalize hybrid hosting model (§9C); show dad/senior employee for buy-in; capture baseline time-per-report (action item from §12).

---

## 1. Executive Summary

Isotherm Engineering performs building commissioning (Cx). Today the firm runs each project through a set of Word and Excel documents: a master Cx Index/Schedule workbook, equipment IVC/PFC checklists, FPT scripts, dated site reports, and a manually maintained issues log. These are disconnected — a deficiency found during an FPT is re-typed into the issues log, then re-typed again into a site report, with no link between them, and progress is tracked by hand across spreadsheet tabs.

This system replaces that with one connected application built around a single principle:

> **The project-level issues log is the backbone. Every activity — site visits, IVC, PFC, FPT — feeds findings into it. Every report reads from it. Equipment, systems, and deliverables all hang off the project, and findings carry forward across reports until closed.**

The result: faster report generation, no double-entry, real progress tracking (the Cx Index), enforced LEED deliverable sets, and a foundation for a future client portal and recurring-revenue ongoing-commissioning (OCx) services.

---

## 2. Core Concepts & Glossary

- **CxA** — Commissioning Authority (Isotherm's role).
- **Cx Index / Master Schedule** — the project's command center: a matrix of equipment/systems × commissioning stages showing progress.
- **IVC** (Installation Verification Check) — "cold check," equipment un-energized; confirms physical install, wiring, torque, leveling. Component-level.
- **PFC** (Pre-Functional Checklist) — broader readiness gate; incorporates IVC plus startup, flushing, calibration, safeties. System-level. Passing it = ready for FPT.
- **FPT** (Functional Performance Test) — full-system operation tested against the sequence of operations; expected vs. actual response, Pass Y/N.
- **OPR / BOD** — Owner's Project Requirements / Basis of Design; foundational reference documents.
- **Cx Plan** — master plan listing roles, systems, and required documentation.
- **Issues Log** — running record of all deficiencies/observations from every source.
- **Site Report / Site Note** — dated field observation report issued to the client.
- **OCx / MBCx** — Ongoing / Monitoring-Based Commissioning (post-occupancy, recurring).
- **Finding** — one issue in the issues log; has a running dated diary, photos, responsible party, status.

---

## 3. Data Model

### 3.1 Entity overview

```
COMPANY (directory, reusable)
  └─ has many CONTACT (people)
  └─ has one or more ROLE (extensible: Client/Owner, CxA, Mechanical, Controls/BAS, Consultant, GC, TAB, …)

CLIENT = a COMPANY with the Client/Owner role
  └─ has many PROJECT

PROJECT (belongs to a CLIENT, or standalone)
  ├─ MEMBERS (project_members — BUILT 2026-07-20: the access-control wall; §3.3.
  │    profile + is_lead; creator auto-membership trigger; UNIQUE(project, profile))
  ├─ CLASSIFICATIONS (junction → classification_options; five seeded dimensions, §5.1) → drive deliverable composition
  ├─ has many PHASE (optional; e.g., PH-1, PH-2)
  ├─ DISTRIBUTION LIST (references CONTACTs)
  ├─ EQUIPMENT / SYSTEM list (the Cx Index rows)
  ├─ ISSUES LOG → has many FINDING        ← THE BACKBONE
  ├─ DELIVERABLES REGISTER (project_deliverables — BUILT 2026-07-21, the Deliverables
  │    tab; composed from classifications §5.2, plus ad-hoc rows. Each row: pool
  │    template XOR ad-hoc name (CHECK), status not_started→in_progress→submitted→
  │    accepted with date stamps, assigned_to, due_date, sort_order. Distinct from
  │    the GENERATED documents below, which are their own modules:)
  │    ├─ Site Reports (Site Notes)
  │    ├─ IVC / PFC checklists (instances of TEMPLATEs, attached to EQUIPMENT)
  │    ├─ FPT scripts (instances, attached to SYSTEMs)
  │    ├─ OPR, BOD, Cx Plan, Systems Manual, Training, Final Report, 10-month review, OCx Plan (long-form: planned)
  ├─ DOCUMENTATION REGISTER (status of received docs)
  ├─ FILE ATTACHMENTS (shop drawings, TAB, pressure tests, O&M …)
  ├─ TEAM MATRIX (project_team_assignments → company_role_types; communication matrix)
  └─ MEETINGS (BUILT — meetings → topics → items, attendees; carry-forward; minutes doc)

DASHBOARD (BUILT — pure READ layer over everything above; no tables of its own except
  the dashboard_checklist_coverage view. Zero writes by design.)

TEMPLATE LIBRARY (firm-level, reusable across all projects)
  └─ CHECKLIST TEMPLATE per equipment type (Heat Pump IVC, Boiler IVC, ATS, Pump, AHU …)
  └─ FPT TEMPLATE per system type
  └─ each template defines: nameplate fields, sections, line items, measurement grids, sign-off blocks
```

### 3.2 Key entities in detail

**Company**
- id, name, abbreviation, roles[] (extensible list), contacts[]
- A company can hold multiple roles and the role can be refined per project.

**Contact**
- id, companyId, name, role/trade (free text), email, phone

**Project**
- id, name, comNumber, clientCompanyId (nullable for standalone), address
- classifications[] (junction to classification options — five dimensions, §5.1; drives deliverable composition)
- phases[] (optional)
- distribution[] (contactId references)
- createdAt, lastVisitedAt (for aging reminders)

**Equipment / System** (the Cx Index rows — see §4.0 for the full Equipment/Systems Register)
- id, projectId, kind ("equipment" | "system")
- category/group (e.g., "ERVs", "Fans", "Geothermal System")
- tag (ERV-1, B-1, P-3), descriptor, location, areaServed
- nameplate/spec/installed data in three editable sections (§4.0); `nameplate_extra` JSON for type-specific fields
- **progress matrix**: per-column status cells against the project's copy of the 12-group stage structure (§4.2) — values: done / in_progress / na / blank
- Systems (geothermal, refrigeration, PV, lighting controls) carry their own sub-item checklist with % complete + comments.

**Finding** (issues log — the backbone; FULL ASHRAE 202 register as of 2026-07)
- id, projectId, number (auto-managed), phase tag
- **title** (required at creation via UI; DB-nullable for historical rows)
- **description** (the issue itself — distinct from title; REPLACES the old
  initial-diary seeding: the diary starts empty as the dated resolution record)
- **identified_by** (text, defaults to the current user, editable)
- **building_area** (where in the building), **corrective_action** (planned measure)
- category/System (INFO or a project trade), responsibleParty (contactId — ANY role)
- status (Open / Closed), origin (Site Visit / IVC / PFC / FPT — auto-set from checklists)
- dateRaised ("Date Identified" — defaults today, editable),
  dateClosed ("Date Resolved" — same column, label only; auto-set on close, cleared
  on reopen, editable while closed)
- Creation hard-requires Title + Description ONLY — everything else optional with
  visible empty states (never block on knowledge the CxA lacks mid-walkthrough)
- Equipment link picked via the grouped searchable EquipmentPicker (Systems group
  first, then Equipment-tab category order, "TAG — descriptor", explicit None)
- **diary[]**: ordered list of { date, text }, OLDEST FIRST, append-only (supports paragraphs, sub-numbering, bullets)
- photos[] (compressed; before/after accumulate over time)
- linkedEquipmentId (optional — ties finding to a specific unit in the equipment register)
- **Delete:** findings may be deleted by admin/user with an explicit confirmation modal. Deletion cascades diary entries, photos (DB rows), and photo files from storage (best-effort). Finding numbers are NOT renumbered after deletion — gaps are intentional and preserve the audit trail in reports and documents already issued.
- **Rule:** closed findings remain in all future reports, rendered grey, marked CLOSED, in original position.

**Template Pool** (firm library — the single reusable source for ALL deliverables; see §5.2)
- One firm-level pool of reusable templates, each created once and referenced by projects.
- Template types: document templates (OPR, BOD, Cx Plan, Systems Manual, Final Report, training, 10-month review, OCx plan) AND checklist templates (IVC / PFC / FPT).
- id, name, deliverableType, equipmentType (for checklists), type (IVC / PFC / FPT / document)
- For checklist templates: nameplateFields[], sections[] → lineItems[], measurementGrids[], signOffBlock.
- **Default-subset maps per project type** (Standard / LEED Fundamental / Enhanced / MBCx) live here too — they define which pool templates auto-add to a new project of that type.
- *(CORRECTION 2026-07-22 — this entity predates two later decisions and is kept as
  planning history: (1) "project type" was replaced by the classification framework
  (§5.1), so the maps live on classification OPTIONS via
  `option_deliverable_defaults`; (2) the pool split in two — `deliverable_templates`
  (documents) vs `checklist_templates` (equipment checklists) — and the two are
  never conflated (§5.2). Current LEED set counts are in §5.2, not here.)*

**Checklist Template** (a checklist-type entry in the Template Pool)
- id, name, equipmentType, type (IVC / PFC / FPT)
- nameplateFields[] (varies by equipment type)
- sections[] → each has title + lineItems[]
- lineItem: label, statusType (Y/N/NR/NA for IVC/PFC; Pass Y/N for FPT), comment field
- measurementGrids[] (e.g., Rated/Measured volts-amps; sensor calibration tables)
- signOffBlock (roles required to sign)

**Checklist Instance**
- id, projectId, templateId, equipmentId(s) (supports multiple units in parallel columns)
- captured values, statuses, comments, measurements, signatures, date
- **A line item marked "N — Missing/Required" (or Pass = N) auto-creates a FINDING** in the issues log, tagged to that equipment, origin set accordingly.

**Site Report (Site Note)**
- id, projectId, number (e.g., "4", "4.1"), reportDate, observationDate
- narrative line, site progress observations, current-status/outstanding section
- documentation register snapshot, showClosed flag
- Generated as a filtered view of the issues log; carries forward all findings.

**File Attachment**
- id, projectId, equipmentId(optional), filename, type, uploadedBy, uploadedAt, storageUrl
- Upload + download. Types: shop drawings, balancing/TAB, pressure test, startup, O&M, factory test.

**Meeting** (BUILT 2026-07 — six tables; replaces the original stub)
- Reference (admin-editable, Classifications screen): **meeting_types** (8 seeded:
  Cx Kickoff, Recurring Cx, Design Phase Cx, OPR Workshop, FPT Coordination,
  Closeout, Site, Other) and **meeting_type_default_topics** (per-type ordered
  agenda skeleton; Recurring 11 topics, Kickoff 8; edits never touch existing
  meetings).
- **meetings**: project, type, meeting_number (per-project per-type, auto-suggested
  and editable, COM#-style soft duplicate warning), date/time/location,
  prepared_by, next_meeting_date, status draft|issued, issued_at (stamped on FIRST
  issue — the disclaimer's 7-day clock), storage/pdf URLs.
- **meeting_topics**: COPIED from the type's defaults at creation — each meeting
  OWNS its agenda (rule 4); add/rename/reorder per meeting.
- **meeting_attendees**: directory picks (contact FK + snapshots stamped at pick
  time so attendance survives directory churn; role auto-attributed from the team
  matrix) or ad-hoc guests; present|regrets|distribution.
- **meeting_items**: item_number text "{meeting#}.{seq}" stamped once and NEVER
  renumbered; carried_from self-reference; discussion; responsible =
  project_team_assignments FK ("GC — Bird Construction") OR free-text fallback —
  never string-matched; due_date; open|closed|info; display-only linked finding.
- **Carry-forward**: new meeting of a type offers "Carry forward N open items" from
  the most recent prior meeting of that type — original numbers retained until
  closed (construction convention), topics matched by title, unmatched → auto
  "Old Business". Closing a carried item touches the current meeting only; prior
  meetings and their issued documents are frozen records (rule 4).
- Minutes document: generate-minutes on doc-common — attendees grouped by matrix
  role order, navy topic bands (band+first-row keep), empty topics render "No
  items — reviewed, nothing arising.", Action Summary by Responsible Party,
  seven-day disclaimer on every PDF page.

**User** (team + future client)
- id, name, email, role (Admin / Developer / Owner / User / Client — `user_role_enum`)

### 3.3 Permission roles & access control (REWRITTEN AS-BUILT 2026-07-20 —
full records: `docs/ACCESS-CONTROL-PROPOSAL.md` + `docs/OWNER-TIER-PROPOSAL.md`)

**Model: global role × project membership.** `project_members` (project + profile +
`is_lead`) is the visibility wall; membership-scoped RLS runs on every
project-scoped table via SECURITY DEFINER helpers (`get_my_role`,
`is_admin_or_dev`, `is_owner`, `is_staff`, `is_project_member`, `is_project_lead`,
`owner_member`, `my_profile_name`). The boundary is **visibility and destruction —
never workflow**: inline-adds and all content work stay member-open.

| Role | Visibility | Powers |
|---|---|---|
| **Admin** | ALL projects | everything; break-glass/super. `dev.admin` is the sole all-seeing daily account (an ordinary admin — no SQL special-case) |
| **Developer** | ALL projects | technical/config (recorded exception E5) |
| **Owner** | **member projects only** — identical scoping to employees | within member projects: everything admin can do, incl. membership management and all hard-deletes (`owner_member()` split); plus firm-level writes (templates, vocabularies, classifications). Never user/role management or `orgs` writes |
| **User** ("Employee") | member projects only | content work: findings, checklists, reports, equipment, meetings. Leads (is_lead) additionally edit project settings |
| **Client** *(future portal)* | nothing — appears in ZERO policies | read-only portal later |

**Destructive concentration:** project delete/complete (C2 status-guard trigger),
hard-delete findings/equipment, delete ANY checklist instance incl. completed,
delete issued documents — admin/dev OR owner-within-member-project only. Members
may delete their OWN unissued drafts (own-drafts rule, name-text matched).
**Creator auto-membership** is a DB trigger (survives API/test inserts; known
trap: INSERT..RETURNING evaluates SELECT policy before the trigger — the app uses
client-generated ids). `list_internal_profiles()` (SECURITY DEFINER, caller-gated
inside) feeds membership pickers without exposing emails or client rows.

---

## 4. The Cx Index (progress tracking)

### 4.0 Equipment / Systems Register (the project's equipment list — first-class)

Every project has an **Equipment / Systems Register**: the list of all commissioned units and systems on that project. This is a first-class entity in its own right (in the prototype it had its own tab), not merely "rows of the Cx Index" — though it also serves as those rows. It is referenced by four other parts of the system, which is why it is central:
- **Cx Index** — each equipment/system is a row in the progress matrix.
- **Findings** — a finding can link to a specific equipment item (`linkedEquipmentId`).
- **Checklists** — IVC/PFC/FPT instances attach to specific equipment; nameplate data flows from here.
- **Reports & documents** — generated deliverables pull the equipment context.

**Each entry holds:** id, projectId, `kind` ("equipment" | "system"), category/group (e.g. PUMPS, AHU, BOILERS, or a system like GEOTHERMAL), tag (P-1, AHU-2-1, B-1), descriptor, location, area served, full nameplate data (manufacturer, model, serial, V/Ø/Hz/A, flow, capacities, coil data…), plus a `nameplate_extra` JSON catch-all for type-specific fields. **Systems** (geothermal, refrigeration, PV, lighting controls) are entries of kind "system" and carry their own sub-checklist with % complete + comments rather than standard equipment columns.

**Entry methods:** add manually, or **import per-project** from a mechanical equipment schedule / existing Cx Index Excel (see §8). Managed on its own screen (browse/add/edit equipment, view nameplate detail) and surfaced as the rows of the Cx Index; equipment-level detail (its findings, checklists, progress) should be reachable from an equipment entry.

**Type-specific, editable data fields (three sections).** Equipment data is NOT a fixed flat field list — different equipment types (Heat Pump, Boiler, Pump, ATS, AHU…) have different fields. Organize equipment data into three sections matching the real IVC forms' columns: **Spec data**, **Shop Drawing data**, and **Installed nameplate data** (the Specified / Shop Drawing / Installed structure). Each equipment type has a **default field template** (fields per section) pre-loaded when adding equipment of that type, but **fully editable per project** — add, remove, or rename fields for a project's equipment without affecting the firm default or other projects (same editable-defaults principle as §4.3 and §5.2). Implemented via `template_nameplate_fields` (per equipment type) plus `nameplate_extra` JSON for flexibility. Seed defaults for common types from the real IVC forms (heat pump: cooling/heating coil + electrical; boiler: gas/water-treatment/heating; etc.).

**File attachments per equipment:** shop drawings, cut sheets, and submittals attach to the equipment item (storage + download), same pattern as finding photos / file attachments.

**Equipment tag glossary (firm-level, editable reference).** Isotherm uses a standard set of equipment tag abbreviations, organized by discipline. Stored as an editable firm-level reference and used two ways: (1) **tag/descriptor autocomplete** when adding equipment (type/pick a tag → fills descriptor + suggests discipline/category, keeping naming consistent across projects); (2) **mapping major equipment types to the type-specific field templates** (§4.0) — significant equipment (AHU, FCU, ERV/HRV, RTU, boiler, pump variants, chiller, cooling tower, generator, ATS, VRF…) map to full field sets; simpler items (sensors, dampers, exit signs, pull stations) are basic entries without full nameplate forms.

- **Mechanical:** AHU, RTU, MAU, ERV, HRV, HRU, FCU, UV, VAV, CAV, EF, SF, RF, RLF, CUH, UH, FFH, RP, FPB, CH, CT, CU, HP, VRF, HWP, CHWP, CWP, GP, BP, SP, SEP, B/BLR, EB, DWH, DHWB, HX, ET, AS, GF, CPF, FD, SD, FSD
- **Controls/BAS:** TS, STS, HS, CO2, PS, DPS, FS, T, FZS, CS, CP
- **Electrical:** MSB, SWGR, DB, PNL, T, MCC, ATS, GEN, UPS, INV
- **Lighting:** LP, LC, OS, DS, EX, EL
- **Fire Alarm:** FACP, FAA, SD, HD, PS, HS, SPKR, DSD
- **Security:** CR, DC, ES, CAM, ACP
- **Data Center:** CRAH, CRAC, PDU, RPP, STS, CDU, IRC, UPS, GEN

(Full descriptors maintained in the app's reference table.) **Note — overlapping abbreviations across disciplines:** SD = Smoke Damper (mech) vs Smoke Detector (fire); T = Thermostat (BAS) vs Transformer (elec); PS, HS, STS also overlap. The glossary must carry discipline context so the correct descriptor applies.

### 4.1 The Cx Index matrix

The Cx Index is the Equipment/Systems Register × commissioning-stage progress matrix — the heart of project tracking (today's Master Schedule workbook). Rows = equipment (grouped by category) and systems from the register. Columns = a structured set of **stage groups, each containing discipline-specific sub-columns**, separating Mechanical / Electrical / BAS. Cells: done / in-progress / n/a / blank, rolling up to per-equipment and per-project % complete.

### 4.2 Canonical default stage structure — FINAL (12 groups, 88 columns)

This is the agreed default a new project starts with, grounded in Isotherm's real workbooks plus Ontario/ASHRAE/LEED practice. Fully editable per project (§4.3). Detailed verification columns exist only for work Isotherm performs (mechanical, electrical, BAS, plumbing, IST); work subbed out or coordinated (structural, envelope, PV) is tracked as received documents in the documentation register, NOT as Cx Index groups.

1. **Doc Review Stage** (11) — IFC Drawings/Specs · Shop Dwgs · Equipment Submittals · Controls Submittals (BAS) · Sequence of Operation (SOO) · Control Wiring Diagrams/Schematics · Elec. Panel Schedules/Single Line · O&M Manuals–Preliminary (ToC) · TAB Plan/Pre-Req · Short Circuit/Coordination Study · Startup Plan
2. **Mechanical Static Verification** (8) — Pressure Test Report (Hydronic/CHW/HW/Glycol) · Duct Leakage Test · Hydronic Flushing & Cleaning · Glycol Concentration · Water Treatment Report · Insulation Complete/Verified · TAB Valves/Dampers Installed & Set · Fire Stopping Completed
3. **Plumbing / Domestic** (7) — Domestic Water Pressure Test · Backflow Preventer Test/Certification · DHW System Verification · Sanitary/Storm Verification · Domestic Water Flushing/Disinfection · Fixture/Trim Verification · Sump/Sewage Pump Functional
4. **Electrical Static — Physical Install** (5) — Equipment Anchoring · Mechanical Labeling · Conduit/Cable Install · Panelboards Installed & Labeled · Lighting Control Rough-In
5. **Electrical Testing** (14) — Insulation Resistance (Megger) · Contact/Bolted Resistance (Ductor) · Ground Continuity & Resistance · Connection Torque · Phase Rotation/Phasing · Breaker Settings · Protective Device/Relay (Coordination) · Transformer Turns-Ratio (TTR) · e-Power ATS Static Test · ATS Transfer/Re-transfer Timing · Generator Load Bank (100%) · Battery/Engine Start Sequence · Load Bank/Loading · Power Quality
6. **BAS Static Verification** (6) — BAS Panels Powered · Network Connections · Sensors/Devices Installed & Wired · BAS Point Database · I/O Wiring · Controller Addressing/Commissioned
7. **Pre-FPT (Mech)** (3) — Manufacturer Start-Up · Pump Rotation/Flow · Fan Rotation
8. **FPT (Elec)** (7, life-safety at end) — HVAC Control Functional · ATS Functional · Lighting Control Verification · Cx Verification (per-equipment sign-off) · Life Safety Verification (FA Interface) · Life Safety Interlock Test · Emergency Lighting Test
9. **FPT (BAS/Mech)** (7) — Air Balancing (TAB-Air) · Water Balancing (TAB-Water) · Point-to-Point (P2P) · Alarm & Fault · Sequence of Operation–Functional · Trend Log Review · BAS Graphics
10. **IST (Integrated Systems Testing, CAN/ULC-S1001)** (7, core Isotherm service) — IST Plan Prepared · Cause-and-Effect Matrix · Trades/Contractors Coordinated · IST Execution/Witnessing · Deficiencies Documented · IST Report Issued · AHJ/Fire Dept Acceptance
11. **Turnover** (8) — Start-Up Reports · Permanent Power ON · O&Ms Final · Training · As-Builts · Spare Parts/Consumables · Master Issue Log Sign-off · Substantial Performance
12. **Post-Construction** (5) — Cx Report Draft · Cx Report Final · Seasonal–Winter · Seasonal–Summer · Closeout Report

**Always present (system-computed):** Progress % · Comments.

**Tracked as received documents (NOT Cx Index groups):** Structural Cx Report · Envelope Cx Report · PV Commissioning Report · Inverter Startup Report · PV Generation/Performance Report.

Systems (geothermal, refrigeration, PV, lighting controls) are register entries of kind "system" and carry their own sub-checklist with % complete + comments.

### 4.3 CORE PRINCIPLE: editable defaults, never hardcoded

**The structure above is a starting default, not a fixed schema.** Primary architectural requirement:
- Stored as **configurable data**, not hardcoded columns. Firm-level default is copied into each project at creation (`project_cx_stage_groups` / `project_cx_columns`); the firm default is never edited by project work.
- On any project, the user can **add, remove, rename, or reorder** stage groups and individual columns to fit scope.
- Mechanical / Electrical / BAS / Plumbing / IST stay separated; out-of-scope groups are marked N/A or removed per project.
- Editing a project's structure must **not** affect the firm default or other projects, and must **not** break progress data already entered (additive/edit-safe).

The same editable-defaults principle applies to **deliverables** (§5.2) and **equipment data fields** (§4.0).

---

## 5. Project classification & deliverable composition (BUILT 2026-07 — replaces "project type")

### 5.1 The classification framework (admin-editable data, never migrations)

The single `project_type` enum is replaced by a **generic classification framework**. A
project is classified along **dimensions**; each dimension carries **options**; a
junction (`project_classifications`) records the selections. All of it is firm-level
runtime DATA managed on the admin Classifications screen — new dimensions, options,
groups, and deliverable mappings are INSERTs, never schema changes.

- `classification_dimensions` — name, `selection_mode` (single|multi), `required`
  (runtime flag: the creation modal enforces whatever it currently says; deliberately
  NOT a DB constraint so existing projects may live in a "classification incomplete"
  state), sort_order, active.
- `classification_options` — label, nullable `group_label` (optgroup band),
  description, sort_order, active.
- `project_classifications` — project ↔ option junction; denormalized `dimension_id`
  with a composite FK so a row can never claim an option under the wrong dimension;
  single-mode enforced by trigger.

**Seeded dimensions (2026-07):** Project Lifecycle (required, single; NCx/EBCx groups) ·
Facility Type (required, single; 9 groups) · Phases Engaged (required, multi; ASHRAE
Guideline 0 verbatim) · Sustainable Programs (optional, multi; includes the MBCx add-on
option) · Services in Scope (optional, multi).

Deliberately NOT dimensions: building systems (modeled as "Systems to be Commissioned"
= trade_types + the equipment register), performance-verification items (deliverables/
checklists), energy/digital flavors (lifecycle options or roadmap).

**Removed (2026-07-17):** `projects.project_type` (column + `project_type_enum`
Postgres type), `PROJECT_TYPES`/`projectTypes.ts`, the `ProjectType` TS type, and the
transition dual-write. Classifications are the only source of truth.

### 5.2 CORE PRINCIPLE: TWO template pools + composition from options

There are **two deliberately separate firm-level pools — never conflate them:**

1. **`deliverable_templates` — documents.** Cx Plan, Site Reports / Issues Log, FPT
   Reports, Final Cx Report, OPR & BoD Review, Issues-and-Benefits Log, CFR Plan,
   Systems Manual Verification, Training Verification, Seasonal/Deferred Testing,
   10-Month Operations Review, OCx Plan, MBCx Plan, etc. These are what
   `project_deliverables` instantiates and tracks per project.
2. **`checklist_templates` — equipment checklists.** IVC/PFC/FPT per equipment type,
   with sections/items/grids/signoffs, instantiated as snapshotted checklist instances
   (§ Phase 2 checklist engine). They are NOT deliverable documents and never appear
   in deliverable composition.

**Composition:** any classification option may contribute deliverable defaults via
`option_deliverable_defaults` (option → deliverable_template). At project creation the
app composes the **union of all selected options' contributions**, deduped, into the
project's own editable `project_deliverables` copy — and the Deliverables tab
(BUILT 2026-07-21) can re-run composition later as an idempotent delta
(active-flag-filtered; run-twice offers zero rows).

**Seeded mappings (LEED-accuracy pass, 2026-07-21 — as-built record:
`docs/DELIVERABLES-TAB-PROPOSAL.md`):** New Construction → the base Cx set (4);
**LEED Fundamental → 7** (Cx Plan, OPR & BoD Review, Design Review,
Issues-and-Benefits Log, System Test Execution Verification, Final Cx Report,
CFR & O&M Plan); **LEED Enhanced → 14** (Fundamental's 7 replicated + Design
Review Backcheck, Contractor Submittal Review, Systems Manual Verification,
Training Verification, Seasonal/Deferred Testing, 10-Month Operations Review,
OCx Plan); **MBCx → 3** (MBCx Plan, Quarterly Trend Analysis, MBCx Report);
**LEED Envelope Cx (BECx) → 6 — option AND its six Envelope templates seeded
DORMANT (`active=false`)**; activation is two admin toggles + compose when a BECx
project is awarded. OPR & BoD stays one combined deliverable by ruling. Facility
Type / Phases / Services contribute nothing yet — the mechanism is ready when they
should.

**Deliverables register mechanics (as-built):** pool row XOR ad-hoc name
(`pool_or_adhoc` CHECK); four-state status (`not_started → in_progress →
submitted → accepted`) with `date_submitted`/`date_accepted` stamped on advance
and cleared on regression (app-side `statusDates()`, the `date_closed` pattern);
admin pool-template deletion snapshots the name into the row (degrades to ad-hoc)
rather than violating the CHECK; reorder via up/down arrows (team-matrix
precedent, no drag). Overdue deliverables feed the dashboard Attention Queue;
assigned deliverables feed My Items.

Everything else about the pool principle is unchanged: templates are created once and
referenced; per-project copies are editable (remove defaults that don't apply, add any
pool template); updating a pool template never rewrites instantiated copies; admin
maintains pools and mappings centrally.

---

## 6. Document generation

**CORE PRINCIPLE — templates define structure, the project supplies the data.** Every report or deliverable is generated *from within a project* and automatically inherits that project's context: project name, COM# reference, address, **distribution list** (the specific directory contacts on that project, pulled by reference), responsible parties, issues log, equipment list, documentation register, and project type. The user never re-types headers, rebuilds the distribution table, or pastes project details — switching projects re-tailors every generated document automatically. The letterhead/format lives in the (uniform) template; the content is injected from the active project. This applies to all deliverables: site reports, IVC/PFC/FPT, Action Summary exports, and long-form documents.


All generated documents share Isotherm's letterhead/format (kept uniform for simple generation). Engine renders from structured data to **.docx** (and PDF export), matching current templates exactly.

**Shared stack (BUILT):** `api/_shared/doc-common.ts` holds the letterhead, base CSS,
`toPdf` (Puppeteer + chromium-min, displayHeaderFooter footer), `toDocx`
(html-to-docx — inline styles only, `width:` stripped from th/td), and the
storage-upload/cache-bust helper. Every generator imports it; the extraction was
proven byte-clean by regeneration diff. Standing rendering rules, all generators:
section/topic **bands never strand at a page bottom** (band + first row share an
unbreakable tbody); DOCX package-integrity checks; row-count integrity logged.

- **Site Report** — letterhead, project header, distribution, progress observations, documentation table, issues table (open with full diary; closed grey + CLOSED in place; register fields — Location line, description body, corrective-action line — render only-when-present so historical findings regenerate byte-clean), embedded per-finding photos. *(BUILT.)*
- **IVC / PFC** — *(BUILT — api/generate-checklist.ts; deliberately self-contained,
  does NOT import doc-common — it needs landscape PDFs + per-mode footers.)*
  Letterhead, unit identity + nameplate block (Specified/Shop Dwg/Installed;
  multi-unit side-by-side column groups), check sections with Y/N/NR/NA + parallel
  unit columns, measurement grids (**wide-grid rule:** ≥5-column grids render
  per-target stacked; ≤4 combined), sign-offs. **FOUR render modes (as-built):**
  1. **completed** — frozen snapshot (nameplate from `nameplate_snapshot`, never
     live equipment); defined-but-empty → em-dash, not-defined → shaded.
  2. **blank — Field Copy** (audience `field`; DEFAULT for `ivc`) — internal
     hand-out: no banner, Isotherm prefilled, Spec/Shop prefilled, Installed clean
     white for on-site handwriting, no zebra.
  3. **blank — Contractor Hand-out** (audience `contractor`; DEFAULT for non-ivc)
     — "BLANK FORM — FOR CONTRACTOR USE" banner, identity lines blank. Explicit
     audience param always wins; both variants coexist in storage
     (`blank-field.*` / `blank-contractor.*`). (§6D Capability A.)
  4. **check_table** (per-template `render_mode`) — transposed fleet mode for
     high-count equipment (VAV & kin): landscape, units as ROWS, items as numbered
     COLUMNS in section order, "Checkout Procedures and Key" legend, 9-column
     chunking with the unit-tag column repeated per chunk, completed cells render
     status + response date, findings as "→ #n". DOCX attempted-but-optional (wide
     tables may ship PDF-only with a warning).
  **Template library:** 238 templates seeded (181 ivc / 57 pfc) — campaigns closed
  2026-07-21; method and rules in `docs/EXTRACTION-PLAYBOOK.md`, campaign records
  in `docs/CSA-SEEDING-LOG.md` + `docs/PFC-SEEDING-LOG.md`. **Typing rule:**
  template type comes from the SOURCE master's identity — Prefunctional folder →
  `pfc`, Installation Verification → `ivc`, Functional Testing → `fpt`; names
  follow type ("⟨Equipment⟩ Prefunctional Checklist"); ask when ambiguous, never
  guess. (`startup` is deliberately NOT a checklist type today — the Start-Up
  campaign is gated on that decision; MASTER-BRIEF §10.)
- **Meeting Minutes** — *(BUILT — api/generate-minutes.ts, §3.2 Meeting.)*
- **FPT** — front matter + revision control, submittal/participants/approval blocks, requested-documentation table, functional testing record grouped by system (test step / expected & actual / Pass Y/N / note#). *(Planned.)*
- **Cx Plan, OPR, BOD, Systems Manual, Final Report** — templated long-form documents. *(Planned.)*

---

## 6A. Status & Action Summary (cross-cutting follow-up + export)

A dedicated module that aggregates **all open/outstanding items across the project** — open findings, incomplete Cx Index stages, outstanding documents, and pending deliverables — into one actionable view, on-screen and **exportable**. It introduces no new data; it is a filtered, cross-cutting lens over data already in the system (issues log, Cx Index, documentation register, deliverables).

**Purpose:** replace the manual work of assembling "what are we still waiting on / who owes us what" follow-ups. The summary both lets Isotherm see what needs chasing internally and produces a document to push to contractors and clients.

**Three lenses over the same data:**
1. **By responsible party (contractor "Action Required" export)** — filter every outstanding item (open findings, failed checklist items, missing documents) by the party it's assigned to, and generate a clean "what Isotherm needs from [Active Mechanical]" list to email out. One export per contractor.
2. **Internal team view** — everything outstanding across the project, including items owed by Isotherm's own team, so nothing falls through. This is where aging flags surface (open > N days, projects not visited in a while — ties to §7).
3. **Client status summary** — higher-level progress for the owner: overall % complete, open vs. closed counts, what's on track vs. blocked. Basis of the client-facing dashboard (Phase 3) and the OCx offering.

**Outputs:**
- On-screen dashboard (filter by party, status, stage, aging).
- Export to PDF/Word/Excel — e.g., a per-contractor outstanding-items list, an internal follow-up sheet, or a client status one-pager.

**Sources aggregated:** open findings (by responsible party), incomplete Cx Index cells (what stage work remains), documentation register items marked outstanding, deliverables not yet complete.

Build note: this is a Phase 2/3 module (needs the issues log, Cx Index, and deliverables in place first), but design the data model so these are queryable/filterable by responsible party and status from the start.

---

## 6B. Project dashboards (internal half BUILT 2026-07; client portal later)

**BUILT — the internal Dashboard is the app's home (`/`):** four sections — A·Now
(stat chips: active projects, open findings, overdue action items, avg
days-to-close 90d; full-width Attention Queue: overdue meeting items, findings
open >30d with 30/60/90+ age chips, drafts stale >7d, checklists idle >14d — every
row deep-links to its project tab); B·Projects (portfolio cards with classification
badges, open-findings +14d delta, checklist coverage bar, last-visit chip
green<14 / amber 14–30 / red>30 / grey never, next meeting, finish countdown;
Follow-up Radar; Portfolio Timeline with today line); C·Findings (opened-vs-closed
6-month trend, open-by-system, Open Items by Responsible Party — meeting items +
findings unioned on company-id keys via the team matrix, free-text labels surfaced
separately, never string-matched); D·Mine (My Items name-matched; Recent Activity
derived from existing timestamps — no events table). Per-project Overview stat
header shares the same derivation as the cards. Recharts only; thresholds in
`src/lib/dashboardThresholds.ts`; per-project coverage from the
`dashboard_checklist_coverage` view (**security_invoker** — views otherwise run as
owner and bypass RLS). Zero writes. Client role never reaches the route.

**Original planning notes (kept for the client-portal half):**
- **Cx Index progress** — overall % complete + per-discipline breakdown (mech/elec/BAS/plumbing/IST), donut or bar.
- **Issues summary** — open vs. closed counts; findings by category/trade; findings by responsible party (who owes most); aging (how long open).
- **Deliverables status** — complete vs. outstanding (esp. valuable on LEED projects).
- **Activity over time** — findings opened vs. closed per week (is the project converging?).
- **Equipment status** — verified vs. in-progress.

**Client dashboard** (Phase 3, portal): a filtered, simplified, read-only version of the same dashboard — clients see progress and open items, not internal detail. Same engine as the internal dashboard + the client lens of §6A; built on the Client role (already implemented). Mostly a permission/presentation layer over the internal dashboard.

**Tech:** React + a charting library (e.g. Recharts, already compatible with the stack). The work is choosing the right metrics (hence "after real use"), not the charting itself.

---

## 6C. Field & mobile use, drawing markup (roadmap — informed by competitive research)

Noted from the established Cx platforms (CxPlanner, Facility Grid, CxAlloy): field/mobile use and drawing markup are common, valued features. Captured here for later; not current focus. Isotherm's edge is fit (tailored to its exact forms/workflow), not feature-parity with enterprise tools — add these selectively.

**Mobile / field use (moderate; partly achievable sooner).** The app is already a web app, so it opens in a phone browser today. "Mobile" means making it work *well* on site:
- **Responsive layouts** — issues log, equipment forms, finding entry reflow for small screens. The 88-column Cx Index needs a simplified mobile view (it's unusable as a wide matrix on a phone).
- **Fast mobile finding entry** — large tap targets, direct photo capture from the phone camera attaching straight to a finding (you're on site, photograph the issue, it attaches).
- **Offline capability (the hard part)** — mechanical rooms/basements often have no signal; enter findings offline, sync when back in coverage. This is the genuinely difficult piece (local cache + conflict-free sync) and is its own project. Do responsive + camera first; offline later.

**Drawing markup (significant standalone build; later).** Pin a finding to a location on a floor plan/schematic: open the drawing, tap the spot, create a finding linked to those coordinates. This is a real interactive sub-system — upload/display large drawing PDFs, zoom/pan canvas, place and store pin coordinates linked to findings, render markups. Valuable but a focused build on its own; sequence after the checklist engine, dashboards, and basic mobile.

**Deliberately NOT pursuing** (enterprise scope irrelevant to a small firm): Procore/CMMS two-way integrations, 3D model viewers, oil & gas / hyperscale-data-center scale. Per §9A right-sizing.

---

## 6D. Contractor-fillable checklists (hand-out & ingestion — workflow, phased)

Real workflow: Isotherm pre-fills the **Spec** and **Shop Drawing** nameplate columns (design/submittal data — already in the equipment register), hands a checklist to the contractor, and the contractor completes the **static checks** and **Installed/measured** data on site. Isotherm then needs that completed data back in the app.

**Capability A — pre-filled blank checklist to hand out (build with checklist doc generation, §6 / Phase 2).** Generate a checklist document from an instance with Spec/Shop-Drawing nameplate data pre-populated (pulled from the equipment register) and static checks + Installed column blank — a clean fillable form to hand to the contractor. Same generator as completed-checklist output, in a "blank/fillable" mode. Achievable and natural; fold into checklist document generation.

**Capability B — ingest the contractor's completed sheet (harder; phased).** Getting the contractor's filled data back into the app:
- **Best solution: digital/mobile field entry.** The contractor (or Isotherm on site) enters the static checks and installed data *directly* on a phone/tablet — no paper, no re-typing, no OCR. This is the clean path and ties to the mobile/field-use roadmap (§6C). Preferred.
- **Harder later option: AI extraction of a filled form.** Upload a contractor's completed sheet and auto-populate the instance. Works far better if the filled form is *digital/structured* than *scanned handwriting* (handwriting OCR on checkmarks/measurements is error-prone and risky for commissioning records). File under the AI-extraction roadmap (§11A) as a later, human-reviewed feature; do not rely on OCR of handwriting for records.

**Guidance:** build Capability A soon (pre-filled hand-out). For Capability B, favor digital/mobile entry over scan-and-extract — the "get the contractor's data back" problem is really an argument for on-site digital entry, not handwriting OCR.

---

## 7. Reminders & notifications
- Aging open findings (e.g., open > N days without update).
- Projects not visited/updated in a while (uses lastVisitedAt).
- Overdue documentation, equipment not yet tested.
- Upcoming required milestones (seasonal testing, 10-month review).

---

## 8. Data import (onboarding existing data)
- **Contacts (300+)** — bulk import from Excel (TDSB list) and Outlook export (CSV). Map to companies + roles.
- **Equipment lists** — import per-project from mechanical schedule / existing Cx Index Excel.
- **Past projects** — optional load of historical projects; new projects going forward at minimum.
- Importer should be tolerant (the real spreadsheets have merged cells, #REF! errors, inconsistent numbering — clean on import).

---

## 9. Recommended technology stack

A modern, Claude-Code-friendly, cost-modest stack:

- **Frontend:** React + TypeScript + Tailwind (Vite or Next.js).
- **Backend / DB:** **Supabase** (PostgreSQL + Auth + Storage + row-level security) — covers database, team logins, and file storage in one.
- **Hosting:** **Vercel** (frontend) + Supabase (backend). 
- **Document generation:** server-side `docx` (Node) for .docx; the proven generator from the prototype is the starting point. PDF via headless LibreOffice or a PDF lib.
- **File storage:** Supabase Storage (photos, attachments).
- **Auth & permissions:** Supabase Auth + role-based row-level security (Admin/Developer/User/Client).
- **Data residency:** prefer a **Canadian region** for hosting given public-sector clients (e.g., TDSB); enable backups from day one.

*Buy-vs-build note:* commissioning platforms exist (CxPlanner, Bluerithm, Facility Grid). Isotherm's edge is a tool tailored exactly to its templates and workflow; custom is justified, but these are worth a glance for ideas.

---

## 9A. Production-readiness (right-sized, not over-engineered)

The difference between a throwaway prototype and a system the firm can depend on is the "below the waterline" engineering. Include the items below — they are cheap, standard, and make the app reliable, secure, and maintainable. **Equally important: deliberately DO NOT add big-tech-scale infrastructure the app doesn't need.** Over-engineering is as harmful as under-engineering — it slows the build, raises cost, and adds maintenance burden for zero benefit at this scale.

**Include (genuinely needed for a firm-sized, client-data app):**
- **Authentication & authorization** — Supabase Auth + role-based **row-level security** (Admin/Developer/User/Client). Already core.
- **Data validation** — validate all inputs (forms, imports) on both client and server; never trust raw input.
- **Error logging / monitoring** — capture and surface errors (e.g., Sentry or Supabase logs) so field failures are visible and fixable.
- **Backups & data residency** — automated DB backups; prefer a **Canadian region** given public-sector clients (TDSB).
- **File security** — access-controlled storage for photos/attachments; signed URLs, not public buckets.
- **Automated testing** — Playwright for critical flows (create finding → generate report → export .docx) so changes don't silently break things.
- **Version control & CI/CD** — GitHub repo + automatic deploy via Vercel; every change tracked and reversible.
- **Secrets management** — API keys/credentials in environment variables, never in code.
- **Graceful error handling in the UI** — loading states, clear error messages, no silent failures (especially around document generation and uploads).

**Deliberately DO NOT use (over-engineering for this scale — Supabase + Vercel already handle the underlying concerns):**
- Kubernetes / Docker orchestration, custom load balancers, auto-scaling clusters.
- Message queues (Kafka, RabbitMQ, SQS), RPC frameworks, long/short polling infrastructure.
- Alternative/extra databases (DynamoDB, separate caching layers like Redis) — Postgres via Supabase is sufficient.
- Database sharding/partitioning, microservices, serverless lambda sprawl.
- ML/AI infrastructure (TensorFlow, etc.) unless a specific future feature (e.g., MBCx anomaly detection) genuinely requires it.

**Guiding principle:** *production-ready means reliable, secure, and maintainable for Isotherm's users — not maximally complex. Build the right things well; skip what serves only web-scale systems.*

---

## 9B. Maintainability & extensibility (build for future change — right-sized)

Build the codebase so future work — new features, UI/UX improvements, and external integrations (e.g. construction/BAS APIs, PM tools) — is easy for a future Claude Code session, another AI agent, or a developer to do safely. Most of what makes a codebase AI-agent-friendly is simply what makes it good code, so this is not a trade-off against quality.

**Do:**
- **Separation of concerns** — keep data layer (Supabase access), business logic, and UI as distinct, well-defined layers. Change the look without touching logic; change storage without rewriting screens.
- **Consistent, predictable structure** — clear folder layout and naming conventions, applied uniformly.
- **Living architecture doc** — maintain `ARCHITECTURE.md` in the repo explaining how the code is organized and how the pieces fit; update it as modules are added. This is the map a future agent/developer reads first.
- **Integration seams** — put external connections behind clean adapter boundaries so a new API integration is one new adapter, not a rewire. Leave the seam; don't build the integration until needed.
- **Strong typing & validation** — TypeScript types for all data, input validation everywhere (already in place). This is what makes AI-assisted edits safe.
- **Tests on critical flows** — Playwright on key paths (create finding → generate report, etc.) so future changes (human or agent) are caught if they break something.
- **Favor clarity and modularity over cleverness.**

**Don't (avoid over-engineering):**
- No abstraction layers, plugin systems, or "maximum flexibility" for hypothetical futures you can't name. Add seams only where extension is genuinely expected (external integrations, UI theming, new deliverable types).
- Mirrors §9A: right-sized, not maximal. Clean and simple now, with seams at known extension points; resist pre-building for the unknown.

**Standing instruction for Claude Code:** "Build this codebase to be maintainable and extensible — clear separation of data/logic/UI, consistent structure, external integrations behind adapter boundaries, strong typing, tests on critical flows, and a maintained ARCHITECTURE.md — favoring clarity and modularity over cleverness, without over-abstracting for hypothetical needs."

---

## 9C. Data retention, backup & hosting (IMPORTANT — decision pending compliance confirmation)

**Legal context:** Ontario record-retention rules require closed/completed projects to be kept for **10 years**. The firm currently runs its own on-premise server with ShareSync. This shapes where data lives and how it is preserved.

**Two distinct needs (don't conflate):**
- **Backup** — recover from failure (deletion, corruption, ransomware). Largely covered by Supabase automated daily backups of the database; storage files are also recoverable.
- **Retention** — keep completed projects retrievable for 10 years, in the firm's custody, in a form that outlives the software.

**Recommended approach (hybrid — to confirm with firm + compliance advisor):**
- **Live app:** cloud-hosted (Supabase, Canadian region) for accessibility (field work) and managed daily backups.
- **Retention archive:** keep an **independent copy on the firm's own server** (via ShareSync). Two independent copies = no single point of failure; legal custody satisfied.
- **Portability is mandatory:** data and files must always be extractable in **standard formats** (Postgres data export, reports as Word/PDF, photos as image files) — never locked into proprietary formats. A 2026 archive must be openable in 2036 regardless of the app's future.

**Retention method — options, simplest to most built (decide based on what Ontario actually requires):**
1. **Operational full export** (no feature to build): periodically export the full Supabase database + storage files to the firm server via ShareSync. May satisfy retention on its own.
2. **Per-project export feature** (build later): a button bundling one project's reports, data, and photos into a portable folder for archiving a completed project.
3. **Automated export-on-completion** (build later, nice-to-have): packages a completed project into a self-contained archive automatically.

**Decisions pending (before storing real client data):**
- Confirm with the firm's compliance advisor what Ontario retention actually requires (what must be kept, in what form, whether periodic full exports to the firm server satisfy it, or whether per-project records in a specific format are needed). **This is a legal/compliance question, not a software one** — the build should keep everything portable and in the firm's custody; the legal specifics are confirmed separately.
- Finalize hosting (cloud vs. self-host vs. hybrid). Recommended: hybrid as above.

**Do NOW (costs nothing, prevents lock-in):** keep the data architecture export-friendly — standard formats, files in storage, reports as Word/PDF — so any retention/export method can be added later without rework. **Do NOT build an export feature yet** — it's later-phase; the decision matters now, the build does not.

---

## 10. Build phasing

### Phase 1 — Demonstrable core (show your dad; deploy internally)
The slice that proves the model and is genuinely usable:
1. Company/contact directory with extensible roles + role filtering.
2. Clients → projects (and standalone), with **project type** selected at creation.
3. Project-level **issues log** (carry-forward, oldest-first diary, photos, close-stays-grey, responsible party from directory across all roles, auto dates).
4. **Equipment/System list + Cx Index** progress view.
5. **Site reports** with carry-forward + **real .docx export** (wire the proven generator).
6. Distribution by reference; documentation register.
7. Auth with Admin/User roles.

### Phase 2 — Checklist engine & deliverables
8. **Template library** (IVC/PFC/FPT) built from Isotherm's real forms.
9. Checklist **instances** attached to equipment/systems; **failed items auto-create findings**.
10. FPT module (system-grouped test records).
11. LEED-conditional **required-deliverables tracking**.
12. **File attachments** (upload/download) + full Developer role.

### Phase 3 — Intelligence, scale, portal
13. Reminders/aging notifications.
14. **Status & Action Summary module** (§6A) — cross-cutting outstanding-items view with by-contractor / internal / client lenses and PDF/Word/Excel export.
15. Data import (contacts, equipment, past projects).
16. Meetings/minutes; OPR/BOD/Cx Plan/Systems Manual/Final Report generation.
17. **Client portal** (read-only project status + open issues; built on the client-lens summary) — the OCx foundation.
18. MBCx/OCx monitoring layer (recurring-revenue offering).

---

## 11A. AI-assist roadmap (designed-in, not v1)

AI features are valuable seasoning on a reliable core — **build the core first, design clean hooks, add AI once the foundation is proven.** The governing rule for every AI feature below: **AI drafts/suggests → human reviews → human approves.** AI must never auto-finalize, auto-assign, or send anything unreviewed. In a regulated CxA context, a confidently-wrong edit to a finding or report matters, so the human-in-the-loop line is non-negotiable.

**High value, low risk (add first, after core is solid):**
- **Polish-before-generate** — an optional pass that tightens wording, fixes grammar, and makes terse field notes read professionally, with consistent tone across a report. User reviews before generating. *Single best AI feature for this app.*
- **Summarization** — turn a project's raw issues log + progress into a plain-language client status paragraph (feeds the Action Summary client lens and client dashboard) or draft a final-report executive summary from underlying data.
- **Follow-up drafting** — turn an Action Summary contractor list into a clear "what we need from you" email draft; user approves before sending.

**Useful later (needs solid core data):**
- **Consistency / gap checks** before generation — e.g., flag a finding assigned to a party not on the distribution list, an FPT referencing equipment not in the project list, or likely-duplicate findings to merge.
- **AI-assisted equipment extraction / auto-population** — feed a project document (mechanical equipment schedule, existing Cx Index Excel, equipment list from drawings) and have AI read it and propose equipment-register entries (tag, type, nameplate/spec fields), instead of manual entry. Strong fit: AI's strength is document → structured data, the data already exists in handed-over documents, and it saves genuinely tedious work. **Must be "AI proposes → human reviews/corrects → accepts," never silent auto-fill** — real schedules are messy (merged cells, abbreviations, inconsistencies) and a wrong nameplate value matters in a Cx context. Builds on the data-import capability (§8); sequence after manual equipment entry has been used enough to know what good data looks like and where AI is likely to slip. This is one of the higher-value AI features for the app.

**Phase 3+ (separate, harder build; ties to recurring revenue):**
- **OCx/MBCx anomaly detection** — flag equipment drifting from setpoint or operating
  out of sequence. Fully specified as Master Phase 6 (`docs/BAS-SPEC.md` §6): rule
  engine first, LLM narrative second; AI proposes candidate findings which a Cx user
  accepts into the Issues Log — AI never creates issues directly. Live BAS connectivity
  is NOT a prerequisite: uploaded trend exports enable the first increment.

**Design hooks now (so AI is easy to add, not a retrofit):**
- Put an explicit **review step** in the document-generation flow where a polish/summarize/draft pass can slot in.
- Keep findings, Cx Index, deliverables queryable as structured data (already required) so AI can read project context cleanly.

**Infrastructure note:** these can be powered by the **Anthropic API (Claude) called from within the app** — no separate AI stack needed. Add per-feature when ready.

---

## 11. How to drive Claude Code (prompt sequence)

> **Current position:** see §1A for what's built. The list below is the full Phase-1 sequence for reference; steps 1–5 are DONE. Use §1A as the source of truth for "where am I"; don't re-run completed steps.

Build in order; each step is a focused Claude Code session. Keep the issues-log backbone and data model (§3) as the constant reference. Give Claude Code the matching real sample document when building each deliverable module — matching the real artifact is what makes adoption effortless.

1. ~~Scaffold~~ — DONE.
2. ~~Directory~~ — DONE.
3. ~~Projects (with project-type, active/completed, search/filters/delete)~~ — DONE.
4. ~~Issues log (diary, photos, categories from project trades)~~ — DONE.
5. ~~Cx Index (12-group editable structure)~~ — DONE.
6. ~~**Equipment List**~~ — DONE. Shared single source with Cx Index; type-specific editable fields in Spec/Shop-Dwg/Installed sections (§4.0); tag glossary with autocomplete; file attachments per equipment.
7. ~~**Site reports**~~ — DONE. PDF (Puppeteer + @sparticuz/chromium-min via Vercel serverless `api/generate-report.ts`) + DOCX (html-to-docx same function). Letterhead, distribution, narrative, documentation register, issues log with photos; footer via Puppeteer `displayHeaderFooter` to prevent row clipping at page breaks.
8. ~~**Auth/roles**~~ — DONE. Supabase Auth; branded login / forgot-password / reset-password; AuthContext; four roles; per-role RLS on 38 tables via `get_my_role()` SECURITY DEFINER.
9. **Phase 2/3 in order (§10):** template library → checklist instances (confirmed auto-findings) → FPT → LEED deliverables → file attachments → reminders → Action Summary → data import → client portal → MBCx/OCx.

---

## 12. Open decisions & launch assumptions

**Launch assumptions (set as sensible defaults; revisit as needed):**
- **Initial users:** 3 — Tony (admin/builder), his father, and a senior employee (users). Auth + roles in from the start, kept simple for a small team.
- **Hosting / data residency:** default to a **Canadian region** (Supabase) with automated backups from day one, given TDSB and public-sector clients.
- **Pilot/build-against project:** **Seneca Health & Wellness** (most comprehensive real Master Schedule available) — swap if another active project fits better.
- **Baseline metric — ACTION:** before the tool replaces the manual process, **time one real site report end-to-end** and note monthly report volume. This is the proof-of-value number for stakeholders and the success measure; it is intentionally not estimated here.
- **TDSB centralized enteliWEB access (Track B, MASTER-BRIEF §6)** — TDSB runs a central
  enteliWEB production server covering its Delta schools. One read-only access
  negotiation (service account or scheduled export) with TDSB facilities/IT unlocks
  trend data for every Delta TDSB project. Owner: Tony/Peiman. Start during Phase 2.
- **org_id groundwork (MASTER-BRIEF rule 17)** — every new table ships with a nullable
  `org_id uuid` defaulted to the Isotherm org row. Phase 1 legacy tables get backfilled
  in a quiet maintenance window well before any SaaS work.

**Still open (decide during build, low risk):**
- ~~Exact PDF generation approach~~ — RESOLVED: Puppeteer + @sparticuz/chromium-min on Vercel serverless; DOCX via html-to-docx same function (shared via api/_shared/doc-common.ts).
- Whether phases get their own deliverable sets or just tag findings/notes.
- Photo/file storage limits and reminder thresholds (tunable later; dashboard thresholds live in src/lib/dashboardThresholds.ts).
- Client portal scope (status only, or issue-level visibility) — phase 3.
- Data-import specifics for the TDSB Excel and Outlook contacts.

**Open items register (canonical list: MASTER-BRIEF §12; verified 2026-07-22):**
- **Storage privacy hardening** — VERIFIED STILL OPEN, REQUIRED pre-client-rollout:
  all five document buckets (site-reports, meeting-minutes, finding-photos,
  checklists, equipment-files) are public with unguessable URLs; one batched pass
  to private buckets + signed URLs across every download link. (Recorded
  2026-07-19.)
- **No migration history** — schema was applied via the Supabase Management API
  across the build; only three DDL files exist in `migrations/` (partial by
  design — see its README). The DB is the source of truth, ARCHITECTURE.md the
  schema reference. Before any environment duplication (staging, second org,
  disaster recovery), generate a full schema dump as the baseline.
- **Generate-* endpoint authentication** — RESOLVED 2026-07-22 (as-built:
  `docs/GENERATE-AUTH-PROPOSAL.md`): JWT verification + server-side membership
  authorization via `api/_shared/auth-common.ts`; CORS allowlisted. Gates:
  pw-generate-auth 13/13, report-regen byte-clean, battery green. Endpoints
  still return public storage URLs — closed by the storage-privacy pass, which
  the auth helper now simplifies (signed URLs from authorized endpoints).
- **Break-glass / test-admin split** — dev.admin currently serves both the
  human break-glass role and scripted test seeding (.env); split before the firm
  scales past the three owners or real client data lands. (Recorded 2026-07-20.)
- **Document/app brand divergence** — recorded 2026-07-22: generated documents
  still render navy `#1F3A5F` letterhead/table headers while the app reads
  purple/vermilion. Decide whether generators adopt the app identity; contained
  to doc-common's letterhead + CSS constants, but changes document output —
  report-regen needs a deliberate baseline reset; issued files stay as issued.
- **site_reports.issued_at** — future addition; until then the dashboard's Recent
  Activity approximates with updated_at of generated reports, honestly labeled
  "report generated".
- **projects.last_visited_at** — written on project open but unused by the
  dashboard (last visit derives from site-report dates by design); cleanup
  candidate for a later pass.
- **My Items user-id normalization** — identified_by / prepared_by / authored_by /
  assigned_to are name-text conventions matched against profile.name; normalize to
  user-id columns when multi-user pressure warrants.
- **IEL 12-row capacity truing pass** — OPTIONAL, NOT OWED: the Elec-IEL templates
  seeded at the master's capacity; a truing pass against real project row counts
  is a quality option to schedule only if field use demands it, not a debt.

---

*This specification captures the full operating model of Isotherm Engineering's commissioning workflow as gathered with Tony Faeghi, and is intended as the authoritative blueprint for building the production system in Claude Code.*
