# Isotherm Engineering — Commissioning Management System
## Production Build Specification & Claude Code Blueprint

**Prepared for:** Tony Faeghi, Isotherm Engineering Ltd.
**Purpose:** Complete blueprint to build Isotherm's internal commissioning management system, replacing the current manual Word/Excel workflow. This document is written to be handed to **Claude Code** to build the production application, and to brief stakeholders.

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
  ├─ project_type (Standard / LEED Fundamental / LEED Enhanced / LEED Enhanced+MBCx) → drives required deliverables
  ├─ has many PHASE (optional; e.g., PH-1, PH-2)
  ├─ DISTRIBUTION LIST (references CONTACTs)
  ├─ EQUIPMENT / SYSTEM list (the Cx Index rows)
  ├─ ISSUES LOG → has many FINDING        ← THE BACKBONE
  ├─ DELIVERABLES (conditional on project_type)
  │    ├─ Site Reports (Site Notes)
  │    ├─ IVC / PFC checklists (instances of TEMPLATEs, attached to EQUIPMENT)
  │    ├─ FPT scripts (instances, attached to SYSTEMs)
  │    ├─ OPR, BOD, Cx Plan, Systems Manual, Training, Final Report, 10-month review, OCx Plan
  ├─ DOCUMENTATION REGISTER (status of received docs)
  ├─ FILE ATTACHMENTS (shop drawings, TAB, pressure tests, O&M …)
  └─ MEETINGS (minutes, attendees, agenda)

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
- projectType (enum, drives required deliverables)
- phases[] (optional)
- distribution[] (contactId references)
- createdAt, lastVisitedAt (for aging reminders)

**Equipment / System** (the Cx Index rows)
- id, projectId, kind ("equipment" | "system")
- category/group (e.g., "ERVs", "Fans", "Geothermal System")
- tag (ERV-1, B-1, P-3), descriptor, location, areaServed
- nameplate data (manufacturer, model, serial, V/Ø/Hz/A, flow, capacities…)
- **progress matrix**: per-stage status cells (Doc Review: Spec / Shop Dwg / Startup Plan; Static Testing stages; FPT) — values: done / n/a / blank / in-progress
- Systems (geothermal, refrigeration, PV, lighting controls) carry their own sub-item checklist with % complete + comments.

**Finding** (issues log — the backbone)
- id, projectId, number (auto-managed), phase tag
- category (INFO or a role/trade), responsibleParty (contactId — ANY role incl. owner)
- status (Open / Closed), origin (Site Visit / IVC / PFC / FPT — auto-set when generated from a checklist)
- dateRaised (auto), dateClosed (auto)
- **diary[]**: ordered list of { date, text }, OLDEST FIRST, append-only (supports paragraphs, sub-numbering, bullets)
- photos[] (compressed; before/after accumulate over time)
- linkedEquipmentId (optional — ties finding to a specific unit)
- **Rule:** closed findings remain in all future reports, rendered grey, marked CLOSED, in original position.

**Template Pool** (firm library — the single reusable source for ALL deliverables; see §5.2)
- One firm-level pool of reusable templates, each created once and referenced by projects.
- Template types: document templates (OPR, BOD, Cx Plan, Systems Manual, Final Report, training, 10-month review, OCx plan) AND checklist templates (IVC / PFC / FPT).
- id, name, deliverableType, equipmentType (for checklists), type (IVC / PFC / FPT / document)
- For checklist templates: nameplateFields[], sections[] → lineItems[], measurementGrids[], signOffBlock.
- **Default-subset maps per project type** (Standard / LEED Fundamental / Enhanced / MBCx) live here too — they define which pool templates auto-add to a new project of that type.

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

**Meeting**
- id, projectId, date, venue, attendees[], agenda, minutes

**User** (team + future client)
- id, name, email, role (Admin / Developer / User / Client)

### 3.3 Permission roles
- **Admin** — full access; creates projects, manages template library, manages users.
- **Developer** — technical/config access (templates, integrations, data import).
- **User** — works projects: findings, checklists, reports, equipment. Cannot manage users/templates.
- **Client** *(future portal)* — read-only view of their own projects' status and open issues; no internal data.

---

## 4. The Cx Index (progress tracking)

The Cx Index is the equipment/systems list × commissioning-stage progress matrix — the heart of project tracking (today's Master Schedule workbook). Rows = equipment (grouped by category) and systems. Columns = a structured set of **stage groups, each containing discipline-specific sub-columns**, separating Mechanical / Electrical / BAS. Cells: done / in-progress / n/a / blank, rolling up to per-equipment and per-project % complete.

### 4.1 Canonical default stage structure (from Isotherm's most comprehensive Master Schedule)

This is the **default** structure a new project starts with. (See §4.2 — it is fully editable per project.)

1. **Doc Review Stage** — IFC Drawings/Specs · Start-up Form · Shop Dwgs · Equipment Submittals · Controls Submittals (BAS) · Sequence of Operation · Control Wiring Diagrams · Elec. Panel Schedules · O&M Manuals (Preliminary) · TAB Plan / Pre-Req · Short Circuit / Coordination
2. **Mechanical Static Verification** — Piping/Ductwork Pressure Test · Duct Leakage Test · Hydronic Flushing & Cleaning · Glycol Concentration · Water Treatment Report · Insulation Complete · TAB Valves/Dampers Installed · Fire Stopping
3. **Electrical Static Verification** — Equipment Anchoring · Mechanical Labeling · Conduit/Cable Install · Panelboards Installed · Grounding & Bonding · Megger Test · Breaker Settings · e-Power/ATS Static Test · Life Safety Verification · Lighting Control Rough-in
4. **BAS Static Verification** — BAS Panels Powered · Network Connections · Sensors/Devices Installed · BAS Point Database · I/O Wiring · Controller Addressing
5. **Pre-FPT Stage (Mech)** — Manufacturer Start-Up · Pump Rotation/Flow · Fan Rotation · Air Balancing Report · Water Balancing Report
6. **FPT Stage (Elec)** — HVAC Control Functional · Lighting Control Verification · Emergency Lighting Test · ATS Functional Test
7. **FPT Stage (BAS/Mech)** — Point-to-Point Verification · Alarm & Fault Verification · Sequence of Operation · Trend Log Review · BAS Graphics Verification
8. **Turnover Stage** — O&Ms Final · Training · As-Builts · Spare Parts/Consumables
9. **Post-Construction Stage** — Master Issue Log Sign-off · Cx Report Draft · Cx Report Final · Seasonal (Winter / Summer) · Closeout Report
10. **Progress** + **Comments** (always present)

Systems (geothermal, refrigeration, PV, lighting controls) expand into their own sub-checklists (design docs, installation records, testing docs, O&M) each with % complete + comments. The Index is the dashboard view of the project; checklists and findings update it.

### 4.2 CORE PRINCIPLE: editable defaults, never hardcoded

**Everything above is a starting template, not a fixed schema.** This is a primary architectural requirement, not a nice-to-have:

- The stage structure is stored as **configurable data**, not hardcoded columns. The app ships with a **default Cx Index template** (and the firm can maintain more than one default — e.g., a Mechanical-focused default and an Electrical-focused default, since Isotherm separates these).
- On any project, the user can **add, remove, rename, or reorder** stage groups and individual sub-columns to fit that project's scope.
- Stage groups already separate **Mechanical / Electrical / BAS** — keep that separation; a small mechanical-only project can delete the Electrical/BAS groups, a large one keeps all.
- Changing a project's structure must not break existing data (additive/edit-safe).

The same principle applies to **deliverables** (see §5.2).

---

## 5. Deliverables by project type (LEED-conditional)

When a project is created, the user selects **project type**, which determines the required deliverable set the system tracks and can flag as missing.

**Standard commissioning**
- Cx Plan, IVC/PFC checklists, site reports, FPT, issues log, final Cx report.

**LEED Fundamental** (adds)
- OPR & BOD review, issues-and-benefits log maintained throughout, Current Facilities Requirements (CFR) plan, verify system test execution.

**LEED Enhanced** (adds)
- Contractor submittal review, Systems Manual (verify inclusion + delivery), operator/occupant training verification, seasonal/deferred testing, 10-month operations review, develop ongoing commissioning (OCx) plan. (All must be reflected in OPR & BOD.)
- Independence + report-directly-to-owner constraints flagged.

**LEED Enhanced + MBCx** (adds)
- Monitoring-based commissioning plan: tracked points, acceptable-value limits, performance evaluation, ongoing monitoring.

This drives a **required-deliverables checklist** per project so nothing needed for the credit is missed.

### 5.2 CORE PRINCIPLE: a central template pool; project type pulls an editable default subset

There is **one firm-level pool (library) of reusable document & checklist templates** — each template created and saved **once**, then reused across all projects by reference. This pool is the single source for every deliverable type: OPR, BOD, Cx Plan, IVC/PFC checklists (per equipment type), FPT scripts (per system type), Systems Manual, training sign-in, final Cx report, 10-month review, OCx plan, etc.

How projects use the pool:
- When a project is created and its type is selected (Standard / LEED Fundamental / Enhanced / MBCx), the app **auto-adds the default subset of templates** for that type, pulled from the pool.
- The user can **remove** any default that doesn't apply to this project.
- The user can **add any other template from the pool** if this project needs it.
- A project deliverable = a **reference to a pool template, instantiated for that project** (its own captured data, status, signatures, findings). Statuses: not started / in progress / received / complete / N-A.
- **Updating a template in the pool** improves it for future projects (existing instantiated copies are unaffected unless re-pulled).
- The firm (admin) maintains the pool and the **default-subset maps per project type** centrally.

This unifies the "checklist template library" (§3.2) and the deliverables map: **they are the same pool.** Defaults save setup time; the pool guarantees reuse-once; per-project add/remove means no project is forced into a structure that doesn't fit. Mirrors the contacts directory and Cx Index defaults — one source, referenced everywhere, never duplicated.

---

## 6. Document generation

**CORE PRINCIPLE — templates define structure, the project supplies the data.** Every report or deliverable is generated *from within a project* and automatically inherits that project's context: project name, COM# reference, address, **distribution list** (the specific directory contacts on that project, pulled by reference), responsible parties, issues log, equipment list, documentation register, and project type. The user never re-types headers, rebuilds the distribution table, or pastes project details — switching projects re-tailors every generated document automatically. The letterhead/format lives in the (uniform) template; the content is injected from the active project. This applies to all deliverables: site reports, IVC/PFC/FPT, Action Summary exports, and long-form documents.


All generated documents share Isotherm's letterhead/format (kept uniform for simple generation). Engine renders from structured data to **.docx** (and PDF export), matching current templates exactly.

- **Site Report** — letterhead, project header, distribution, progress observations, documentation table, issues table (open with full diary; closed grey + CLOSED in place), embedded per-finding photos. *(Already prototyped and proven.)*
- **IVC / PFC** — letterhead, equipment nameplate block (Specified/Shop Dwg/Installed), check sections with Y/N/NR/NA + comments, measurement grids, sign-off.
- **FPT** — front matter + revision control, submittal/participants/approval blocks, requested-documentation table, functional testing record grouped by system (test step / expected & actual / Pass Y/N / note#).
- **Cx Plan, OPR, BOD, Systems Manual, Final Report** — templated long-form documents.

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

**Phase 3+ (separate, harder build; ties to recurring revenue):**
- **OCx/MBCx anomaly detection** — when live BAS data is integrated, flag equipment drifting from setpoint or out-of-sequence operation.

**Design hooks now (so AI is easy to add, not a retrofit):**
- Put an explicit **review step** in the document-generation flow where a polish/summarize/draft pass can slot in.
- Keep findings, Cx Index, deliverables queryable as structured data (already required) so AI can read project context cleanly.

**Infrastructure note:** these can be powered by the **Anthropic API (Claude) called from within the app** — no separate AI stack needed. Add per-feature when ready.

---

## 11. How to drive Claude Code (prompt sequence)

Build in this order; each step is a focused Claude Code session. Keep the issues-log backbone and data model from §3 as the constant reference.

1. **Scaffold:** "Set up a React + TypeScript + Tailwind app with Supabase (Postgres, Auth, Storage). Create the schema from the data model in this spec (companies, contacts, roles, clients, projects, equipment, findings, site_reports, templates, attachments, users)."
2. **Directory:** "Build the company/contact directory with extensible roles and role filtering, reusable across projects."
3. **Projects:** "Build the projects list + create-project flow with project-type selection (Standard/LEED Fundamental/Enhanced/MBCx) and optional phases; clients and standalone projects."
4. **Issues log:** "Build the project issues log: findings with auto-numbering, oldest-first append-only diary, photo upload (compressed), Open/Closed with closed-stays-grey, responsible party from the directory, auto dateRaised/dateClosed."
5. **Cx Index:** "Build the equipment/system list and the Cx Index progress matrix (equipment/systems × stages with rollup % complete); systems carry their own sub-checklists."
6. **Site reports:** "Build site reports that carry the issues log forward and generate a .docx matching the provided Isotherm template (letterhead, distribution, progress, documentation, issues table with grey closed rows and embedded photos)." *(Feed the proven generator code.)*
7. **Auth/roles:** "Add Supabase Auth with Admin/Developer/User/Client roles and row-level security."
8. Then Phase 2/3 modules in order: template library → checklist instances (auto-findings) → FPT → LEED deliverables → attachments → reminders → import → portal.

**Tip:** give Claude Code the real sample documents (IVC, PFC, FPT, site report, Cx Index) as references when building each corresponding module — matching the real artifact is what makes adoption effortless.

---

## 12. Open decisions & launch assumptions

**Launch assumptions (set as sensible defaults; revisit as needed):**
- **Initial users:** 3 — Tony (admin/builder), his father, and a senior employee (users). Auth + roles in from the start, kept simple for a small team.
- **Hosting / data residency:** default to a **Canadian region** (Supabase) with automated backups from day one, given TDSB and public-sector clients.
- **Pilot/build-against project:** **Seneca Health & Wellness** (most comprehensive real Master Schedule available) — swap if another active project fits better.
- **Baseline metric — ACTION:** before the tool replaces the manual process, **time one real site report end-to-end** and note monthly report volume. This is the proof-of-value number for stakeholders and the success measure; it is intentionally not estimated here.

**Still open (decide during build, low risk):**
- Exact PDF generation approach (LibreOffice vs. library) for document fidelity — test early against a real report.
- Whether phases get their own deliverable sets or just tag findings/notes.
- Photo/file storage limits and reminder thresholds (tunable later).
- Client portal scope (status only, or issue-level visibility) — phase 3.
- Data-import specifics for the TDSB Excel and Outlook contacts.

---

*This specification captures the full operating model of Isotherm Engineering's commissioning workflow as gathered with Tony Faeghi, and is intended as the authoritative blueprint for building the production system in Claude Code.*
