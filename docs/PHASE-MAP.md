# PHASE-MAP.md — Phase numbering reconciliation
**Canonical location:** `docs/PHASE-MAP.md`
The master numbering lives in `docs/MASTER-BRIEF.md` §5. Every other document defers to
it. This map exists because three numbering schemes appeared during planning; when an
older document says "Phase 3B" or the v1 brief says "Phase 7," translate here.

| Master (canonical) | Build Spec (`Isotherm_Cx_System_Build_Spec.md`) | BAS-SPEC (`docs/BAS-SPEC.md`) | v1 Brief (PDF) | Status |
|---|---|---|---|---|
| Phase 1 — Core Cx OS | Phase 1 | — | Phase 1 | Complete, deployed |
| Phase 2 — Checklist Engine | Phase 2 | — | Phase 2 | **Current build** |
| Phase 3 — Report/Closeout Automation | part of Phase 2/3 | — | Phase 3 | Planned |
| Phase 4 — Low-Risk AI Assistance | §11A "high value, low risk" | — | Phase 4 | Planned |
| Phase 5 — AI Equipment/Doc Extraction | §11A "useful later" | §4.5 (submittal extractor, first instance) | Phase 5 | Planned |
| Phase 6 — AI Trend-Log Verification | Phase 3 "Intelligence" (partial) | **BAS-1a + BAS-1b + BAS-2** | Phase 7 ← swapped | Fully spec'd |
| Phase 7 — AI FPT Generation | §11A (implied) | reuses §4.5/§6 pipeline | Phase 6 ← swapped | Planned |
| Phase 8 — BAS Import Layer (scheduled) | Phase 3 (partial) | BAS-3 + seams S-PARTITION | Phase 8 | Schema exists in spec |
| Phase 9 — Read-Only Connectors + worker | Phase 3 (partial) | seams S-WORKER, S-CONNECT-DELTA, S-WEBCTRL | Phase 9 | Seams named |
| Phase 10 — Continuous Monitoring / Operator Assistant | — | seam S-LIVE-MONITOR | Phase 10 | Future |
| Phase 11 — Multi-Tenant SaaS | §9C (retention/hosting notes) | — | Phase 11 | Future; org_id groundwork is rule 17, active now |
| Phase 12 — Human-Approved Writeback | — | explicitly out of scope (§8) | Phase 12 | Far future |

Retired labels — do not use going forward:
- **"Phase 3B"** (previously used for the BAS module) → now **Master Phase 6** (file-based
  portion) and **Master Phase 8** (scheduled portion).
- **v1 brief "Phase 6"/"Phase 7"** → swapped; check content, not number. Trend
  verification = Master 6. FPT generation = Master 7.
- Build Spec **"Phase 3 — Intelligence, scale, portal"** → umbrella dissolved into
  Master Phases 4–9; the Build Spec keeps owning Phase 1–3 product detail only.

Parallel non-engineering tracks (MASTER-BRIEF §6): Track A manual wedge validation,
Track B TDSB access negotiation. These have no phase number and can run any time.
