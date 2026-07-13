# BAS-SPEC.md — BAS Data Integration Layer for Isotherm Cx Management App

**Status:** Draft v1.2 — ready for Claude Code implementation (v1.1: corrected to actual app stack — React 19 + Vite SPA, not Next.js; v1.2: re-numbered to Master roadmap, 'Phase 3B' label retired)
**Owner:** Tony (admin) · Isotherm Engineering Ltd.
**Repo:** `kfaeghi-hub/isothermAPP` (branch `master`, local `C:\Dev\isotherm-cx`)
**Canonical location:** `docs/BAS-SPEC.md` in-repo
**Related docs:** `docs/MASTER-BRIEF.md` (canonical roadmap — this module implements **Master Phase 6**; its seams S-WORKER/S-CONNECT-DELTA/S-PARTITION belong to Master Phases 8–9) · `docs/PHASE-MAP.md` · `ARCHITECTURE.md` (fulfils the reserved BAS seam)

---

## §0 Maintainability principle

This module follows the §9B maintainability principle documented in `ARCHITECTURE.md`. All
vendor-specific behavior lives behind named interfaces. Nothing outside `lib/bas/adapters/`
may reference a vendor name. Every deferred capability has a named seam (§10).

---

## §1 Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Architecture | BAS layer lives **inside isothermAPP**: React SPA pages + direct `supabase-js` queries under RLS (existing app pattern) + Vercel serverless functions in `/api/` for heavy compute (parse, PDF extraction, LLM), same pattern as `api/generate-report.ts`. Separate Python ingestion worker is a **named seam**, not built now. | No live connectors in MVP; the report-generator function proves the serverless model works. |
| D2 | MVP scope | **BAS-1a** shop-drawing point extraction + mapping UI → **BAS-1b** CSV trend ingestion → **BAS-2** sequences + candidate findings (all = Master Phase 6) → **BAS-3** live connectors/worker (Master Phases 8–9). | Point inventory exists in submittals months before any site access. Zero OT/credential dependency for BAS-1. |
| D3 | Trend storage | Plain Postgres `trend_samples` with composite PK `(bas_point_id, ts)`. Partitioning is a seam (§10.3), added only if a project exceeds ~20M rows. | Three internal users, 2–4 week exports per project. Simplicity wins. |
| D4 | AI integration | **Heuristics first** (TDSB-Delta rule pack, §6), LLM second pass via Anthropic API from a Vercel function (same pattern as `api/generate-report.ts`). LLM is additive, never required. | The heuristic pack alone should hit high accuracy on TDSB Delta naming. |
| D5 | Vendor posture | **Adapter architecture.** Delta enteliWEB is the first `FileImportAdapter`, not a hardcoded assumption. ALC WebCTRL is adapter #2 (stub now, implement when a Bloor CI export is in hand). A `generic_csv` adapter with user-driven column mapping covers unknown clients. | Confirmed portfolio: Delta (Steele, Winston Churchill) + ALC (Bloor CI), all TDSB. Other clients with other systems are expected. |

---

## §2 Ground truth from real data (why the parser spec looks the way it does)

Findings from actual TDSB enteliWEB exports and approved submittals in hand:

1. **Two Delta export shapes.**
   - **TL (single trend):** `Time,Value` — point name only in filename; unit embedded in
     header (`"Value (°C)"` or bare `"Value"`); rows **newest-first**; all values quoted.
   - **MT (multi trend):** paired columns `"Sample Time (Trend N)", "POINT.Present_Value (unit)"`,
     1–5 trends per file. **Each trend has its own timestamp column; rows are NOT
     time-aligned across trends.** Rows ascending. Numerics may be unquoted.
2. **Point identity rules.** MT header names are truth (`MT_RM201A_...csv` contained
   `RM202A_SPT` — filename lied). TL files carry no point name → user must confirm point
   identity at upload (pre-filled from filename heuristic, never trusted silently).
   Some setpoint headers are generic (`SPT_SP.Present_Value`) → identity requires the
   sibling column's equipment prefix as context.
3. **Sentinel/event values interleaved with data:** `On`, `Off`, `1`, `0` (same binary
   points, different exports), `Log Enabled|Disabled`, `log-enabled|disabled`,
   `Time Change (+01:00:01)`. The Time Change rows are DST transitions.
4. **Timestamps:** `YYYY/MM/DD HH:MM:SS.f{1,3}`, wall-clock local (America/Toronto), no
   timezone. DST fall-back creates a genuinely ambiguous hour.
5. **File hygiene:** UTF-8 BOM present on some files; CRLF and LF both occur; trailing
   empty columns occur; **Excel-resaved files occur in the wild** (timestamps destroyed to
   `MM:SS.f` — must be detected and rejected with a clear user message, not ingested).
6. **Site identity is not in the file.** Upload flow must bind files to a project/site.
7. **Submittals are a point-inventory source.** Approved shop drawings contain complete
   point schedules: `Point#, Type, Signal, Point Name, Description, Part, Wire#/Address,
   Fail Position` with full Delta addresses (`531100.AI1401`). Isotherm receives these on
   every project during design phase.
8. **Submittals contain secrets** (plaintext operator passwords, IPs, BBMD details).
   Extraction must never persist credentials; documents live in private storage only.

---

## §3 Data model (Supabase migration `NNN_bas_layer.sql`)

Additive to existing `projects`, `equipment`, `issues`. All tables get RLS mirroring the
existing project-membership policies (same pattern as the issues log). `trend_samples`
uses a lighter policy (project check via `bas_points` join) for insert performance.

Per MASTER-BRIEF rule 17, add `org_id uuid` (nullable, defaulted, indexed) to every
table below when writing the actual migration.

```sql
-- 3.1 Sources: where data came from (file upload now; live connection later — same table)
create table bas_sources (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  source_kind      text not null check (source_kind in
                     ('file_upload','shop_drawing','live_connection')),
  adapter          text not null,          -- 'delta_enteliweb','alc_webctrl','generic_csv','submittal_pdf'
  name             text not null,          -- user label, e.g. "enteliWEB export 2026-06"
  vendor_family    text,                   -- 'delta','alc','siemens', null for generic
  network_zone     text,                   -- future live use: 'OT','DMZ','cloud'
  base_uri         text,                   -- future live use
  auth_type        text,                   -- future live use; secrets NEVER here (§8)
  status           text not null default 'active',
  capabilities     jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

-- 3.2 Point inventory (from submittal extraction, CSV headers, or future discovery)
create table bas_points (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  source_id        uuid references bas_sources(id) on delete set null,
  raw_point_key    text not null,          -- stable identity: Delta 'addr.objtype+inst' when known, else raw name
  raw_name         text not null,          -- e.g. 'HW_SWT1', 'MRS-1_SAT'
  description      text,                   -- e.g. 'Supply Water Temperature 1' (from submittal)
  object_type      text,                   -- 'AI','AO','BI','BO','AV','BV', OPC class, etc.
  object_address   text,                   -- e.g. '531100.AI1401'
  signal           text,                   -- '10K','0-10V','4-20mA' (from submittal)
  unit             text,                   -- canonical unit code (§5.4)
  controller       text,                   -- e.g. 'DSC-1616E @ 531100'
  panel_location   text,                   -- e.g. 'Fan Rm 4,5'
  writable         boolean not null default false,
  is_historized    boolean not null default false,
  origin           text not null check (origin in ('submittal','trend_file','manual','discovery')),
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (project_id, raw_point_key)
);

-- 3.3 Mapping: raw point -> normalized semantics + link to existing equipment register
create table bas_point_mappings (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references projects(id) on delete cascade,
  bas_point_id           uuid not null references bas_points(id) on delete cascade,
  equipment_id           uuid references equipment(id),        -- EXISTING equipment table
  normalized_point_type  text not null,   -- registry key, e.g. 'supply_water_temp' (§5.3)
  haystack_tags          jsonb,           -- ['point','sensor','temp','water','supply']
  confidence             numeric(5,4),
  suggested_by           text not null check (suggested_by in ('heuristic','llm','human')),
  mapping_status         text not null default 'suggested'
                           check (mapping_status in ('suggested','confirmed','rejected')),
  approved_by            uuid references auth.users(id),
  approved_at            timestamptz,
  unique (bas_point_id)                    -- one active mapping per point
);

-- 3.4 Imports: one row per uploaded file (audit + idempotency + replay safety)
create table bas_imports (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  source_id        uuid not null references bas_sources(id),
  adapter          text not null,
  file_name        text not null,
  file_sha256      text not null,          -- duplicate-upload detection
  file_storage_path text,                  -- Supabase Storage ref (private bucket)
  status           text not null default 'parsing'
                     check (status in ('parsing','review','committed','rejected','failed')),
  parse_report     jsonb not null default '{}'::jsonb,   -- §4.4 shape
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid references auth.users(id),
  unique (project_id, file_sha256)
);

-- 3.5 Samples: the time series
create table trend_samples (
  bas_point_id     uuid not null references bas_points(id) on delete cascade,
  ts               timestamptz not null,   -- UTC, converted from wall-clock at ingest (§4.3)
  num_value        double precision,
  bool_value       boolean,
  str_value        text,                   -- only if genuinely non-numeric, non-boolean
  quality          text not null default 'good',  -- 'good','uncertain','dst_ambiguous'
  import_id        uuid references bas_imports(id) on delete cascade,
  primary key (bas_point_id, ts)
);

-- 3.6 Point-level events (log enable/disable, time changes) — NOT samples
create table trend_events (
  id               uuid primary key default gen_random_uuid(),
  bas_point_id     uuid not null references bas_points(id) on delete cascade,
  ts               timestamptz not null,
  event_type       text not null,          -- 'log_enabled','log_disabled','time_change'
  detail           text,                   -- raw token, e.g. 'Time Change (+01:00:01)'
  import_id        uuid references bas_imports(id) on delete cascade
);

-- 3.7 Sequence documents & clauses (BAS-2)
create table sequence_documents (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  file_storage_path text not null,
  title            text,
  source_type      text,                   -- 'submittal','spec_25_00_00','soo','fpt_script'
  extracted_text   text,
  created_at       timestamptz not null default now()
);

create table sequence_clauses (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references sequence_documents(id) on delete cascade,
  equipment_id     uuid references equipment(id),
  clause_no        text,
  clause_text      text not null,
  normalized_intent jsonb,                 -- {trigger, command, expected_response, timing_sec, evidence_point_types[]}
  review_status    text not null default 'draft'
);

-- 3.8 AI candidate findings (BAS-2) — never auto-create issues
create table ai_analysis_runs (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  analysis_type    text not null,          -- 'mapping_suggest','trend_review','sequence_extract'
  scope            jsonb not null default '{}'::jsonb,
  model_info       jsonb,
  status           text not null default 'queued',
  started_at       timestamptz, completed_at timestamptz,
  summary          jsonb
);

create table ai_candidate_findings (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  analysis_run_id  uuid not null references ai_analysis_runs(id) on delete cascade,
  equipment_id     uuid references equipment(id),
  title            text not null,
  description      text not null,
  suspected_cause  text,
  confidence       numeric(5,4),
  evidence         jsonb not null default '[]'::jsonb,  -- refs: point ids, time ranges, clause ids
  status           text not null default 'pending'
                     check (status in ('pending','accepted','rejected')),
  accepted_issue_id uuid references issues(id)          -- EXISTING issues log
);
```

Indexes: `trend_samples (bas_point_id, ts desc)` is the PK; add
`bas_points (project_id, raw_name)` and `bas_imports (project_id, status)`.

---

## §4 File ingestion pipeline (BAS-1)

### 4.1 Adapter interface (the seam that makes other vendors plug in)

```ts
// lib/bas/adapters/types.ts
export interface FileImportAdapter {
  id: 'delta_enteliweb' | 'alc_webctrl' | 'generic_csv' | 'submittal_pdf';
  /** Cheap detection from filename + first ~4KB. Returns confidence 0..1. */
  sniff(fileName: string, sampleText: string): number;
  /** Full parse. Never throws on data problems — reports them. */
  parse(file: Buffer, ctx: ParseContext): ParseResult;
}

export interface ParseContext {
  projectId: string;
  tz: string;                    // default 'America/Toronto', per-project setting
  knownPoints: KnownPoint[];     // existing bas_points for reconciliation
}

export interface ParseResult {
  points: ExtractedPoint[];      // identity candidates found in the file
  series: ExtractedSeries[];     // per-point sample arrays
  events: ExtractedEvent[];      // log toggles, time changes
  report: ParseReport;           // §4.4
  needsUserInput: UserPrompt[];  // e.g. TL point identity confirmation
}
```

Adapter registry in `lib/bas/adapters/index.ts`. Upload flow: sniff all adapters, pick
highest confidence ≥ 0.6, else fall back to `generic_csv` (user maps columns manually).

### 4.2 Delta enteliWEB adapter — parsing rules (from §2 ground truth)

1. Strip UTF-8 BOM; normalize CRLF/LF; drop fully-empty trailing columns.
2. **Shape detection:** header `Time,Value*` → TL; header contains `Sample Time (Trend` →
   MT. Extract unit from header suffix `(°C)`, `(%)`, `(kPa)` etc. via regex
   `\(([^)]+)\)\s*$`; map through unit table (§5.4).
3. **MT:** split into independent (time, value) series per trend pair — **never assume
   row alignment**. Point name = header token before `.Present_Value`. If a name is
   generic (`SPT_SP`), qualify it with the equipment prefix of the sibling trend in the
   same file and flag `needsUserInput` for confirmation.
4. **TL:** point identity = filename heuristic (strip `TL_`/`_TL`/`_COV`/`_POLL`, site
   prefix) presented to user as a pre-filled prompt — never committed without confirmation.
5. **Row classification (in order):**
   - `Time Change (…)` → `trend_events(time_change)`
   - `Log Enabled|Disabled` (case/dash-insensitive) → `trend_events(log_*)`
   - `On|Off` (case-insensitive) → `bool_value` true/false
   - numeric parse (handle quoted and unquoted) → `num_value`; if the point elsewhere
     logs booleans, coerce 1/0 → bool for consistency at commit time
   - anything else → `str_value` + `quality='uncertain'` + counted in parse report
6. **Timestamps:** parse `YYYY/MM/DD HH:MM:SS.f{1,3}` as wall-clock in `ctx.tz`, convert
   to UTC. During the DST fall-back ambiguous hour, resolve by monotonicity against
   neighboring rows; if unresolvable, keep both interpretations' earlier one and set
   `quality='dst_ambiguous'`. TL files are newest-first — sort ascending before commit.
7. **Excel-damage detection:** if >10% of timestamp cells fail full-date parse but match
   `^\d{1,2}:\d{2}\.\d`, mark the file `failed` with message: *"This file appears to have
   been opened and re-saved in Excel, which destroyed its timestamps. Please re-export
   the original CSV from enteliWEB."* Do not ingest partial data.
8. **Dedup/idempotency:** file-level via `file_sha256` unique constraint; row-level via
   `(bas_point_id, ts)` PK with `on conflict do nothing`. Re-uploading an overlapping
   export is safe by construction.

### 4.3 Commit flow (two-phase, human-in-the-loop)

`parsing → review → committed`. Parse writes nothing to `bas_points`/`trend_samples`;
it stages into the `parse_report` + a temp JSON in Storage. The review screen (§7.2)
shows point reconciliation (matched existing point / new point / needs identity), then
commit runs as a single serverless invocation with batched inserts (5k rows/batch).
Vercel limits: for files >50k samples, chunk commits by point with a progress indicator;
the named seam for moving this to a worker is §10.1.

### 4.4 Parse report shape

```json
{
  "rows_total": 576, "rows_data": 560, "rows_events": 12, "rows_unparseable": 4,
  "points_found": ["AHU2_SAT", "AHU2_SAT_SP"],
  "time_range": ["2022-01-02T20:52:14Z", "2022-01-08T04:41:40Z"],
  "warnings": ["4 rows had non-numeric values", "point name from sibling context: SPT_SP → RM202A_SPT_SP"],
  "sha256": "…"
}
```

### 4.5 Submittal point extraction (`submittal_pdf` adapter)

Input: approved BAS shop drawing PDF (private Storage bucket). Pipeline:
1. Extract text per page (serverless; reuse pdf tooling patterns from report module).
2. Detect point-schedule pages by header signature
   (`Point# Type Signal Point Name Point Description`).
3. Parse rows into `ExtractedPoint` with `origin='submittal'`, capturing name,
   description, type (AI/AO/BI/BO), signal, address (`531100.AI1401` → raw_point_key),
   controller, panel/enclosure, fail position → metadata.
4. LLM fallback (D4 pattern) only for pages where the tabular heuristic yields <70% of
   expected columns; the LLM receives page text only, never the whole document.
5. **Secret hygiene:** regex-drop lines matching password/credential patterns before any
   LLM call; never persist IPs/credentials into `bas_points.metadata`.
6. Same review-then-commit flow as trend files. Extracted points later reconcile with
   trend-file points by `raw_name` (exact, then normalized-name fuzzy with user confirm).

---

## §5 Normalization

### 5.1 Pipeline
`raw name → heuristic rule pack → (optional LLM pass) → suggested mapping → human review → confirmed`
Confirmed mappings are never silently changed (report rule): if a later source disagrees,
create a reconciliation task.

### 5.2 TDSB-Delta rule pack (seed data, `lib/bas/rules/tdsb_delta.ts`)

Token grammar: `{EQUIP}[_{QUALIFIER}]_{MEASUREMENT}[{INDEX}]`. Confirmed suffix map:

| Suffix | normalized_point_type | Haystack tags |
|--------|----------------------|---------------|
| `_SAT` | supply_air_temp | point,sensor,temp,air,supply |
| `_RAT` | return_air_temp | point,sensor,temp,air,return |
| `_OAT` | outside_air_temp | point,sensor,temp,air,outside |
| `_SPT` | space_temp | point,sensor,temp,zone |
| `_SPT_SP` / `_SP` | setpoint (of parent type) | point,sp |
| `_SWT` / `_RWT` | supply/return_water_temp | point,sensor,temp,water,… |
| `_C` | command/start_stop | point,cmd |
| `_S` | status | point,sensor,run |
| `_FBK` | feedback/position | point,sensor |
| `_MOD` | modulation_cmd | point,cmd,analog |
| `_A` | amperage | point,sensor,current |
| `_VC` | valve_command | point,cmd,valve |
| `_DP` | differential_pressure | point,sensor,pressure |
| `_DX*C` / `_DX*S` | dx_stage_cmd / dx_stage_status | point,cmd/sensor,cool |

Equipment-prefix map: `AHU\d`, `DOAS\d`, `RTU\d`, `BLR\d`, `P[H]?\d` (pumps), `DHW`,
`MRS-\d`, `UH`, `RM\d+[A-Z]?` / `CLSRM_\w+` / `KG_RM\d+` (zones), `PRI|SEC` (plant loops),
`BLDG` (building-level). Prefix match → suggested `equipment_id` link against the
existing equipment register (by tag glossary lookup), else propose creating equipment.

The rule pack is data, not code: `{pattern, point_type, tags, confidence}` rows so new
client conventions (ALC, Siemens) are added as new packs without touching the engine.

### 5.3 `normalized_point_type` registry
Single source of truth `lib/bas/pointTypes.ts` (appConfig-style, per Caspian Pay
interface-programming principle): key, label, expected unit family, value kind
(analog/binary), Haystack tag set. Mapping rows must reference a registry key.

### 5.4 Unit table
`°C→degC`, `%→percent`, `kPa`, `Pa`, `L/s`, `A`, unitless-binary. Store canonical code;
display localized.

---

## §6 AI usage (BAS-1 optional pass, BAS-2 core)

- **Mapping suggestions (BAS-1):** batch unmapped points (name, description, unit,
  5-sample preview) → Anthropic API → JSON suggestions with confidence; write as
  `suggested_by='llm'`. Heuristic results with confidence ≥0.9 skip the LLM.
- **Clause extraction (BAS-2):** 3-pass per report — parse, segment, normalize into
  `normalized_intent`.
- **Candidate findings (BAS-2):** rules first (setpoint deviation, hunting, sensor
  flatline, schedule violation vs occupancy), LLM narrative second. Findings are
  `pending` until a user accepts → creates a row in the existing issues log with
  `issue_evidence` links. **AI never creates issues directly.**

---

## §7 UI (pages under `src/pages/`, wired into `App.tsx` routing per ARCHITECTURE.md convention)

1. **`BASOverviewPage` (`/projects/:id/bas`) — overview:** sources, imports with status chips, point counts
   (total/mapped/unmapped), last activity.
2. **`BASImportReviewPage` (`/projects/:id/bas/imports/:importId`) — review & commit:** parse report, point reconciliation
   table (match / new / needs-identity with pre-filled prompts), warnings, commit button.
3. **`BASMappingWorkbenchPage` (`/projects/:id/bas/points`) — mapping workbench (the core screen):** table with raw name,
   description, address, controller, unit, origin badge, sparkline (last 50 samples),
   suggested type + equipment + confidence, accept/edit/reject, batch-accept for
   confidence ≥ threshold. Filters: unmapped / suggested / confirmed.
4. **`BASPointDetailPage` (`/projects/:id/bas/points/:pointId`) — detail:** full trend chart (existing charting lib),
   events overlay (log gaps, time changes), mapping history.
5. **BAS-2 additions:** `BASSequencesPage`, `BASFindingsPage` (accept → issues log).

App design tokens per ARCHITECTURE.md (navy/steel palette, **IBM Plex Sans** UI +
**IBM Plex Mono** for point names, addresses, and timestamps — these are identifiers, a
natural Plex Mono fit). Sparklines and charts follow existing app chart patterns.

---

## §8 Security

- All uploads to a **private** Supabase Storage bucket (`bas-documents`,
  `bas-trend-files`); RLS-scoped signed URLs only.
- No credentials/secrets in any table. Future live connections store a `secret_ref`
  (Vercel env / vault), enforced by schema (no secret column exists).
- Submittal extraction redacts credential-pattern lines before persistence or LLM calls.
- Everything is read-only by design in BAS-1/2; writeback does not exist in this spec
  and requires a separate authorization annex (report language) before ever being scoped.
- Audit: `bas_imports` + `approved_by/approved_at` on mappings and findings give a full
  who-did-what trail.

## §9 API surface

Two tiers, matching the app's existing split:

**Tier 1 — direct `supabase-js` under RLS (all CRUD, reads, confirm/reject actions).**
Listing points, confirming/rejecting mappings, accepting findings, reading parse
reports — all plain table operations through `src/lib/supabase.ts`, no function needed.

**Tier 2 — Vercel serverless functions (heavy compute only), pattern of `api/generate-report.ts`:**

```
api/bas-parse.ts              upload → sniff → adapter parse → staged result + parse_report
api/bas-commit.ts             staged result → batched inserts (5k rows/batch, chunk by point)
api/bas-extract-submittal.ts  PDF → point-schedule extraction (+ redaction, LLM fallback)
api/bas-suggest-mapping.ts    heuristic pack + optional Anthropic API pass
api/bas-samples.ts            downsampled series for charts (LTTB, maxPoints param)
```

Function response envelope: `{ ok, data, errors[], warnings[], trace_id }` (per report).

## §10 Named seams (deferred, do not build)

1. **S-WORKER:** Python ingestion worker replaces the Tier-2 serverless functions for
   live connectors and >50k-sample files. Contract = §9 function signatures; the worker
   becomes their implementation. Trigger: first live connector or first oversized-file
   failure. Supersedes the placeholder `src/lib/basAdapter.ts` seam in ARCHITECTURE.md —
   the seam is now the adapter registry at `src/lib/bas/adapters/` (patch provided).
2. **S-CONNECT-DELTA:** enteliWEB northbound (API/ODBC/scheduled CSV-to-SFTP) against
   the TDSB central server (`tgstbasentlprd`). One negotiation with TDSB facilities/IT
   unlocks all Delta schools. `bas_sources.source_kind='live_connection'` already models it.
3. **S-PARTITION:** monthly partitioning of `trend_samples`. Trigger: ~20M rows/project.
4. **S-WEBCTRL:** ALC WebCTRL export adapter (Bloor CI). Blocked on obtaining one real
   WebCTRL trend export; adapter stub with `sniff()` returning 0 ships in BAS-1.
5. **S-HAYSTACK-BRICK:** Brick relationship graph on top of Haystack tags. Trigger:
   cross-project analytics or digital-twin queries.
6. **S-LIVE-MONITOR:** COV/SSE/MQTT near-real-time. Far future; requires S-WORKER.

## §11 Build order for Claude Code

Follows the ARCHITECTURE.md "How to Add a New Feature" recipe at each step
(migration → `src/types/database.ts` → page → `App.tsx` route). Parser logic gets a
**Vitest** unit layer (new dep, natural in Vite) against the real-file fixtures;
Playwright covers the upload→review→commit flow per the existing testing convention.

1. Migration + RLS + Storage buckets (§3, §8) + `src/types/database.ts` update.
2. Adapter interface + registry at `src/lib/bas/adapters/` + `delta_enteliweb` adapter with the §4.2 rules (pure functions, unit-testable without Supabase).
   **Test fixtures: the real TDSB files** (TL numeric, TL COV/binary, MT aligned-looking,
   MT with generic SPT_SP, MT Excel-damaged, ARMOUR variants) — commit sanitized copies
   under `/fixtures/bas/`.
3. Upload → parse → review → commit flow + screens §7.1–7.2.
4. Mapping workbench §7.3 + TDSB-Delta rule pack + point-type registry.
5. `submittal_pdf` adapter + its review flow.
6. LLM suggestion pass (D4).
7. Point detail chart + downsampling endpoint.
8. (BAS-2, separate milestone) sequences → candidate findings → issues hook.

Acceptance for BAS-1: every fixture file ingests with zero silent data loss, the
Excel-damaged file is rejected with the correct message, re-upload of the same file is a
no-op, and ≥80% of the Winston Churchill submittal's point schedule rows extract with
correct name/type/address.
