# MASTER-BRIEF.md — Isotherm Commissioning OS → AI Commissioning Intelligence
**Version 2.0 — supersedes `Master_Implementation_Brief_for_Claude.pdf` (v1)**
**Canonical location:** `docs/MASTER-BRIEF.md`
**Companion docs:** `docs/PHASE-MAP.md` (numbering reconciliation) · `docs/BAS-SPEC.md`
(implementation spec for Phases 6 & 8) · `Isotherm_Cx_System_Build_Spec.md` (Phase 1–2
product detail) · `ARCHITECTURE.md` (repo how-to)

Changes from v1: unified phase numbering across all docs; Phases 6/7 swapped (trend
verification before FPT generation); tenant-ID groundwork moved from Phase 11 to "now";
evidence snapshot rule added; field-resilience requirement added to Phase 2; two parallel
non-engineering tracks added (wedge validation, TDSB access); TimescaleDB assumption
softened; BAS schema detail delegated to BAS-SPEC.md.

---

## 1. Identity and stack

Production-grade internal commissioning management system for Isotherm Engineering,
replacing Word/Excel workflows. Not a prototype. Users: Tony (admin/dev), Peiman, Adam.

React 19 + TypeScript strict + Tailwind (Vite SPA) · Supabase Postgres/Auth/Storage
(ca-central-1) with explicit RLS · Vercel hosting + serverless functions for heavy
compute (report generation pattern: `api/generate-report.ts`) · Playwright tests
(+ Vitest for parser-level units).

Priorities: reliability, historical record integrity, traceability, report generation,
AI-readiness.

## 2. Product vision

Commissioning Operating System → AI Commissioning Intelligence Platform → AI BAS/BMS
Intelligence Platform. Never "AI controls buildings." The path is always:

read data → understand data → candidate findings → human review → Issues Log →
reports and follow-up pull from the Issues Log.

**The Issues Log is the backbone.** Everything that discovers a problem — site reports,
IVC/PFC/FPT/IST checklists, equipment and document reviews, AI sequence review, AI trend
review, alarm review, future live monitoring — creates, updates, or links to an Issue.

## 3. Non-negotiable rules (unchanged from v1, plus two)

1. The Issues Log is the backbone.
2. AI creates candidate findings, never official issues.
3. Humans approve important records.
4. Completed checklists are frozen historical records.
5. Reports pull from structured data.
6. Checklist failures link to the Issues Log.
7. BAS integration starts read-only.
8. No autonomous equipment control.
9. Prefer BAS server/head-end/historian/API over controller polling.
10. Design for future tenant isolation.
11. Use explicit RLS.
12. Do not silently remap points or rewrite history.
13. Every AI/BAS finding must have evidence.
14. Future BAS connectors must be modular.
15. Do not let one vendor integration define the whole architecture.
16. **(new) Evidence attached to an issue is snapshotted, not referenced live.** An
    `issue_evidence_links` row must copy the essential values (point name, time range,
    readings/chart, checklist item text) into `metadata_json` at attach time, so a closed
    issue never changes because source data was re-imported, remapped, or edited. This is
    rule 4 extended to evidence.
17. **(new) Every new table ships with `org_id uuid` from day one.** Nullable, defaulted
    to the Isotherm org row, indexed. RLS continues to key on project membership for now;
    `org_id` exists so Phase 11 tenant isolation is a policy change, not a schema
    migration across 30+ tables. Phase 1 legacy tables get backfilled in a scheduled
    maintenance task well before Phase 11 — never during it.

## 4. Current state

Phase 1 complete and deployed (`isotherm-app.vercel.app`): companies/contacts directory
with roles, projects, trades, Issues Log (findings, diary, photos, carry-forward rules,
no renumbering), equipment/system register with tag glossary and spec/shop-drawing/
nameplate sections, Cx Index (12 groups / 88 columns, per-project copies), site report
generation (PDF/DOCX via serverless), Supabase Auth + roles + explicit RLS.

Phase 2 (Checklist Engine) is substantially built and committed (through `815e03a`):
the 14-table checklist migration is applied and live; Template Library UI; project
instance creation with full snapshots (template name/type/revision/provenance, sections,
items, grids, signoffs); checklist fill-out view; failed-item Create Finding modal with
duplicate prevention (`checklist_finding_links`); signoffs; completion with equipment
nameplate snapshot; and reopen-with-audit-trail. One real template is seeded (A/C / Fan
Coil / Heat Pump IVC). Remaining on the checklist track: field-resilience acceptance
tests (§5 Phase 2) and seeding the real IVC/PFC/FPT forms at scale; then checklist/FPT
document generation and LEED deliverable tracking, which are Phase 3 (§5).

Phase 6 is fully specified in `docs/BAS-SPEC.md`, validated against real TDSB Delta
enteliWEB exports and approved submittals, with parsers designed around observed
real-world failure modes (misaligned multi-trend timestamps, Excel-corrupted files,
sentinel values, DST ambiguity, filename/header identity mismatches).

## 5. Master roadmap (canonical phase numbering — all other docs defer to this)

**Phase 1 — Core Commissioning OS.** Complete. See §4.

**Phase 2 — Checklist Engine.** CURRENT. IVC/PFC/FPT. Three layers: firm template pool →
project instances (snapshot on creation: name, type, revision label, provenance,
sections, items, grids, signoffs) → responses (constrained statuses; IVC/PFC: Y/N/NR/NA;
FPT: Pass/Fail). Failed item opens prefilled Create Finding modal → normal Issues Log
item with origin (type, instance ID, item ID, target ID). Duplicate prevention per
failed item/target combination. Correcting a failed item never auto-closes the linked
finding. 14 tables across template/instance/response layers.
**Cross-instance integrity constraints are mandatory before migration:** no response,
grid response, or finding link may combine rows from different instances or projects —
composite FKs or equivalent.
**(new) Field-resilience acceptance criteria:** checklist fill-out must survive
mechanical-room connectivity — aggressive autosave (per-response, not per-form),
graceful offline/reconnect behavior with no silent data loss, and phone-friendly photo
capture. If on-site use is flakier than paper, adoption dies; this is an acceptance
test, not a nice-to-have.
Equipment/nameplate data displayed on a completed checklist is snapshotted at completion.

**(new) Multi-unit strategy.** Parallel-column instances (one response column per unit)
are intended for **2–4 units**. The binding constraint is nameplate width on Letter:
1 + 3N columns (Specified / Shop Drawing / Installed per unit) — which also matches the
paper masters' two-unit design. Larger fleets are chunked into multiple instances grouped
by floor, riser, or mechanical room. This is guidance, not UI enforcement — no hard cap.
For high-count equipment (VAV boxes and kin), the planned generic solution is a
**transposed check-table render mode** — units as rows, items as columns, per the firm's
2.6.11.7 VAV Check-Table master — to be built when the VAV family is seeded.
Document rendering: measurement grids with ≥5 columns render per target (stacked, one
grid per unit); ≤4-column grids render combined (one table, both units' column groups).
**Multi-unit copy mechanisms** (field reality: 3–4 identical units, most answers match):
row-level "apply to all" copies one unit's status + comment across the row instantly;
column-level "Copy from [unit]" fills the target unit's *empty* cells only (item statuses
+ comments, grid values row-by-row) — it never overwrites an existing entry, so filling
the exception first is safe; the confirm states the count, the result reports copied vs
kept. **Finding integrity:** findings are never copied — a copied N/fail routes through
the normal finding-modal flow once per target (one finding per item per target). Sign-offs
are never touched. Both mechanisms run through the normal save path (upserts + outbox),
so offline bulk copies queue like any entries and Mark Complete stays blocked while queued.

**Phase 3 — Report and Closeout Automation.** Checklist/FPT PDF-DOCX generation, issue
summary and open/closed deficiency reports, closeout sections, LEED deliverable
tracking. Reports pull from the database, never from retyped documents.

**Phase 4 — Low-Risk AI Assistance.** Report summary, issue wording polish, contractor
follow-up email drafts, note cleanup, final-report paragraph drafting. Pattern: user
selects data → AI drafts → user edits/approves → text enters record. Anthropic API from
serverless, per-feature.

**Phase 5 — AI Equipment and Document Extraction.** Schedules/submittals/point lists →
suggested equipment register rows → human review → accept. (The submittal point-schedule
extractor in BAS-SPEC §4.5 is the first concrete instance of this pattern and may ship
with Phase 6.)

**Phase 6 — AI Trend-Log Verification (file-based). ← was v1 Phase 7; moved ahead.**
The business wedge. Implementation spec: `docs/BAS-SPEC.md` (BAS-1a submittal point
extraction, BAS-1b CSV trend ingestion with vendor adapters, BAS-2 sequence clauses +
rule engine + candidate findings). Rationale for the swap: trend verification depends on
sequences, mapped points, and trend files — all available now — not on generated FPTs;
it is mostly deterministic rules with AI narration (lower risk than FPT generation); and
it is the first revenue-bearing capability (§9). No live BAS connection in this phase.

**Phase 7 — AI FPT Generation from Sequences. ← was v1 Phase 6.**
Sequence of operation → extracted control intent → suggested FPT steps → expert review →
draft checklist template or project FPT instance. Reuses Phase 6's sequence-clause
extraction pipeline, now proven. Drafts only, never final checklists.

**Phase 8 — BAS Data Import Layer (scheduled).** Generalize Phase 6 file ingestion to
scheduled imports (CSV/SFTP, REST where available), watermarks, reconciliation,
alarm-event ingestion. Schema already exists from BAS-SPEC §3; this phase activates
`bas_sources.source_kind='live_connection'` for pull-based sources and seam S-PARTITION
if volume demands.

**Phase 9 — Read-Only BAS Connector System.** Separate Python worker service (BAS-SPEC
seam S-WORKER) implementing the same API contracts. Connectors in preference order: BAS
server/head-end API → historian → scheduled export → OPC UA → Niagara/nHaystack →
BACnet/IP read-only → MS/TP via gateway → Modbus → MQTT → controller polling last.
First target: Delta enteliWEB against TDSB's centralized server (seam S-CONNECT-DELTA).
Main app remains source of truth for projects/equipment/issues/checklists/reports/users.

**Phase 10 — Continuous Monitoring and AI Operator Assistant.** Post-handover
monitoring; a reasoning layer above alarms/trends/sequences/equipment context, not an
alarm dashboard. Recurring-revenue product.

**Phase 11 — Multi-Tenant Commercial SaaS.** Org/tenant isolation (groundwork already
in place via rule 17), role-per-org, tenant-aware storage paths, audit logs, billing,
client portal, export controls, retention policies. Product tracks: Cx OS for CxA firms;
AI BAS trend review per project; owner monitoring; portfolio assistant. Competitive
note: the Cx-OS-for-firms track enters an established field (CxAlloy, Facility Grid,
BlueRithm); the AI trend-review wedge is the differentiated product — lead with it.

**Phase 12 — Human-Approved Writeback.** Much later; only after read-only success.
Requires proven monitoring, audit logs, client authorization, writeback contracts,
cybersecurity review, command boundaries, approval workflow, auto-expiry/rollback,
human override. Never autonomous control of life safety, fire/smoke, freezestat,
boiler/chiller safeties, generator logic, or security systems.

## 6. Parallel tracks (non-engineering; start now)

**Track A — Manual wedge validation (weeks, not phases).** Do not wait for Phase 6
software to test the Phase 6 business. Run 1–2 manual AI-assisted trend reviews on real
completed/active projects using existing trend exports and sequences: produce the §9
deliverable by hand (equipment reviewed, points reviewed, failed/suspicious conditions,
suspected causes, contractor action list, report-ready wording). Pass: 5–10 useful
findings per project and meaningful time savings. Fail: only generic comments. This
de-risks the entire Phase 6 build and defines its acceptance criteria from a real
deliverable. Owner: Tony. Cost: near zero.

**Track B — TDSB access negotiation.** TDSB operates a centralized enteliWEB production
server covering its Delta schools. Request read-only access (service account or
scheduled export) through TDSB facilities/IT under an active project. Months-long
organizational lead time, zero engineering dependency — start during Phase 2 so Phase
8/9 data access lands on schedule. Owner: Tony/Peiman.

## 7. AI architecture

Rule engine + deterministic checks first; LLM for explanation and drafting. Never pure
LLM reasoning over raw numeric trends. Universal pattern: input → deterministic
parse/analysis → AI explanation/draft → candidate output → human approval → official
record. AI never silently modifies completed checklists, closed reports, historical
issues, approved equipment data, or official deliverables.

Traceability tables (schema detail in BAS-SPEC §3.7–3.8): `ai_analysis_runs` (every AI
workflow logged: type, scope, inputs, model info, status, who started it) and
`ai_candidate_findings` (pending/accepted/rejected; accepted → `accepted_issue_id`).
Analysis types include: report_polish, contractor_email, equipment_extraction,
fpt_generation, sequence_review, trend_review, alarm_review, bas_monitoring.

Issue origins are an open set — never hard-code around checklists: manual, site_report,
checklist_item, ivc, pfc, fpt, ist, document_review, equipment_review, trend_review,
alarm_review, sequence_review, ai_review, operator_complaint, bas_monitoring.

## 8. Technical architecture

Modular monolith now: one app, one database, one auth system; code organized by module
(companies, contacts, projects, equipment, issues, cx-index, reports, checklists, ai,
bas). Later: Python worker service for connectors/large imports/AI jobs (Phase 9; seam
S-WORKER). Time-series: plain Postgres with composite-PK `trend_samples`; native
partitioning via seam S-PARTITION if a project approaches ~20M rows. Do not assume
TimescaleDB — verify Supabase extension availability at the time it would matter;
native partitioning is the safe default.

## 9. Business plan (summary; unchanged economics from v1)

Wedge: **AI-Assisted BAS Trend & Sequence Review** as a project add-on
($2.5k–$5k small / $5k–$10k medium / $10k–$25k large). Deliverables: equipment and
points reviewed, trend period, sequence checks, failed/suspicious conditions, suspected
root causes, contractor action list, Cx deficiency wording, report-ready summary.
Recurring: monthly AI BAS monitoring post-handover ($750–$3.5k/building;
$5k–$50k/portfolio). Positioning: "We analyze BAS trends, point lists, alarms, and
sequences to find hidden control issues, failed sequences, energy waste, and
commissioning deficiencies before they become expensive post-occupancy problems." Never
"AI controls your building." 90-day validation gate per Track A before commercial build.

## 10. What Claude Code does next

Still the Phase 2/3 checklist track, not AI/BAS yet. The §10 pre-flight and the core
Phase 2 build sequence are DONE and must not re-run: the migration (14 tables,
cross-instance integrity constraints, `org_id` per rule 17), TypeScript types,
ARCHITECTURE.md schema update, Template Library UI, Template Builder, instance creation
with snapshots, fill-out UI, failed-item-to-finding modal with duplicate prevention and
linked-finding badges, signoffs, completion with nameplate snapshot, and
reopen-with-audit-trail — all built and committed through `815e03a`, with one minimal
real template seeded (A/C / Fan Coil / Heat Pump IVC).

Next, in order:
1. Field-resilience acceptance tests on the fill-out UI — autosave per response (not per
   form), graceful offline/reconnect with no silent data loss, phone photo capture. This
   is an acceptance test, not a nice-to-have (§5 Phase 2).
2. Seed the real Isotherm IVC/PFC/FPT forms at scale, now that the flow works end-to-end.
3. Checklist/FPT PDF-DOCX generation (Phase 3) — reuse the `api/generate-report.ts`
   serverless pattern; render from the snapshotted instance data, never retyped.
4. LEED deliverable tracking (Phase 3).

Only after the checklist track lands do the low-risk AI phases begin (Phase 4 onward;
Phase 6 build order is BAS-SPEC §11).

## 11. Final destination

Create project → import equipment → build Cx Index → create IVC/PFC/FPT → field testing
→ failed items create Issues → generate reports → upload sequences → AI verifies trends
→ candidate findings → CxA accepts → reports update → post-handover read-only BAS
connection → continuous monitoring → AI operator assistant. Category: Commissioning
Operating System + AI BAS Intelligence Layer.

## 12. Open items (pre-client-rollout register)

**Storage privacy hardening (REQUIRED before real client rollout / client portal).**
All document buckets (site-reports, meeting-minutes, finding-photos, checklists,
equipment-files) are public with unguessable URLs, mirroring the original pattern —
tolerable for an internal tool with no client eyes, not the posture for client-facing
use. The fix is one batched hardening pass: convert all document storage to private
buckets + signed URLs across every download link (site report links, minutes links,
finding photo renders, checklist document links, equipment attachments) in a single
change, not bucket-by-bucket drift.
