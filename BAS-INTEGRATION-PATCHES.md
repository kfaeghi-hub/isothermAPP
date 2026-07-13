# BAS-INTEGRATION-PATCHES.md (v2)
Exact edits to align the two existing canonical docs with `docs/MASTER-BRIEF.md` and
`docs/PHASE-MAP.md`, and to integrate `docs/BAS-SPEC.md`. **Supersedes patches v1** —
if v1 was never applied, apply only this file. Apply, verify diffs, commit, then delete
this file.

---

## Patch 1 — `Isotherm_Cx_System_Build_Spec.md`

### 1.1 At the very top (below the title), add:

```md
> **Phase numbering:** the canonical roadmap is `docs/MASTER-BRIEF.md` §5; translations
> in `docs/PHASE-MAP.md`. This document owns product detail for Master Phases 1–3 only.
> "Phase 3 — Intelligence, scale, portal" below is an umbrella dissolved into Master
> Phases 4–9.
```

### 1.2 In `## 1A. Build status`, add:

```md
### Master Phase 6 — AI Trend-Log Verification (SPEC'D — see docs/BAS-SPEC.md)
- Module spec complete (v1.2), validated against real TDSB enteliWEB exports and
  approved BAS submittals (Delta: Steele JPS, Winston Churchill CI; ALC: Bloor CI)
- Build order: BAS-1a submittal point extraction → BAS-1b CSV trend ingestion →
  BAS-2 sequences + AI candidate findings. Scheduled/live sources: Master Phases 8–9.
- Not started; blocked on Phase 2 completion by design (MASTER-BRIEF §10)
```

### 1.3 In `## 11A. AI-assist roadmap`, replace the Phase 3+ anomaly-detection bullet:

**Old:**
```md
- **OCx/MBCx anomaly detection** — when live BAS data is integrated, flag equipment drifting from setpoint or out-of-sequence operation.
```

**New:**
```md
- **OCx/MBCx anomaly detection** — flag equipment drifting from setpoint or operating
  out of sequence. Fully specified as Master Phase 6 (`docs/BAS-SPEC.md` §6): rule
  engine first, LLM narrative second; AI proposes candidate findings which a Cx user
  accepts into the Issues Log — AI never creates issues directly. Live BAS connectivity
  is NOT a prerequisite: uploaded trend exports enable the first increment.
```

### 1.4 In `## 12. Open decisions & launch assumptions`, add two items:

```md
- **TDSB centralized enteliWEB access (Track B, MASTER-BRIEF §6)** — TDSB runs a central
  enteliWEB production server covering its Delta schools. One read-only access
  negotiation (service account or scheduled export) with TDSB facilities/IT unlocks
  trend data for every Delta TDSB project. Owner: Tony/Peiman. Start during Phase 2.
- **org_id groundwork (MASTER-BRIEF rule 17)** — every new table ships with a nullable
  `org_id uuid` defaulted to the Isotherm org row. Phase 1 legacy tables get backfilled
  in a quiet maintenance window well before any SaaS work.
```

---

## Patch 2 — `ARCHITECTURE.md`

### 2.1 In `## Integration Seams`, replace the BAS row:

**Old:**
```md
| Future: BAS API | `src/lib/basAdapter.ts` (not yet built) | Will wrap point import for Cx Index |
```

**New:**
```md
| BAS file ingestion | `src/lib/bas/adapters/` (registry + per-vendor adapters) | Master Phase 6; spec: `docs/BAS-SPEC.md`. Vendor-specific parsing lives ONLY here; first adapter: Delta enteliWEB. Live connections: seams S-CONNECT-DELTA / S-WORKER (Master Phases 8–9). |
```

### 2.2 In `## Database Schema (key tables)`, append:

```md
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
```

### 2.3 In `## Storage`, append:

```md
- `bas-trend-files` (private) — uploaded BAS trend exports; originals retained for audit/replay
- `bas-documents` (private) — BAS submittals/shop drawings. **Source PDFs contain network
  details and credentials — never public; extraction redacts credential lines (BAS-SPEC §8).**
```

### 2.4 In `## Testing`, append:

```md
- BAS parsers: Vitest unit tests against real-file fixtures in `fixtures/bas/`
  (sanitized TDSB exports — TL/MT variants, Excel-damaged file, sentinel values).
  Playwright covers upload → review → commit.
- Checklist fill-out: field-resilience acceptance tests (autosave per response,
  offline/reconnect without data loss) per MASTER-BRIEF Phase 2.
```

---

## Patch 3 — `docs/BAS-SPEC.md` — ALREADY APPLIED in the shipped v1.2 file; verify only, do not re-apply

### 3.1 In the header block, replace the Related docs line:

**Old:**
```md
**Related docs:** `Isotherm_Cx_System_Build_Spec.md` (master product spec — this module is **Phase 3B** within its §10 phasing) · `ARCHITECTURE.md` (fulfils the reserved `Future: BAS API` integration seam)
```

**New:**
```md
**Related docs:** `docs/MASTER-BRIEF.md` (canonical roadmap — this module implements
**Master Phase 6**; its seams S-WORKER/S-CONNECT-DELTA/S-PARTITION belong to Master
Phases 8–9) · `docs/PHASE-MAP.md` · `ARCHITECTURE.md` (fulfils the reserved BAS seam)
```

Also bump the status line to `v1.2` and note: "v1.2: re-numbered to Master roadmap;
'Phase 3B' label retired."

### 3.2 In §3 (schema), add one line above the DDL:

```md
Per MASTER-BRIEF rule 17, add `org_id uuid` (nullable, defaulted, indexed) to every
table below when writing the actual migration.
```

---

## Not patched (intentionally)
- Cx Index structure: unchanged; findings flow through the existing Issues Log.
- §9B maintainability: BAS-SPEC §0 declares compliance.
- Roles: BAS and checklist screens use existing project roles.
