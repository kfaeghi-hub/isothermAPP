# PFC Long-Tail Seeding Log

One row per seeded template. Campaign opened 2026-07-21 (inventory accepted, batches A→F ratified,
autonomous to the 2.6.11.7 Check-Table gate). Sources: `6. Prefunctional Checksheets\BCA_Construction_Check_List`
+ `...\Elec-IEL` only. Type `pfc` throughout; contractor hand-out is the spot-check render.
Rules per `docs/EXTRACTION-PLAYBOOK.md` (R1–R26).

Pre-campaign register: AHU Prefunctional Checklist (2.6.1.1) — the original campaign's only seeded pfc;
2.6.9.1 covered as ivc `2c1ef7e9` per standing HP ruling. Register-verification note: the recalled
original-campaign coverage (Boiler/Pump/BAS/Chillers/CT/EF/HX/VFD + six IEL) was never in the DB —
those 16 masters fold into this campaign.

## Campaign-opening actions (2026-07-21)

- **vav key minted** (Tony ruling): 26 field defs (spec 8 / shop_drawing 10 / installed 8), CSA VAV Box
  IVC `9fe6dd96` backfilled full-stack per R25 (template row, JSON, TEST-VAV-1/2 fixtures typed vav,
  full re-audit PASS). RULED_KEYS + FIELD_DEF_KEYS + EquipmentPage datalist updated — additive-only,
  no retro pass required. CAV stays null.
- R26 ratified (WIP never beats finished); boiler-trio precedent logged (three distinct templates).

## Register

| # | Name | template_id | s/i/g | signoffs | audit |
|---|---|---|---|---|---|
| 1 | Boiler Prefunctional Checklist (2.6.2.1) | 748554cd | 13/112/1 | 6 (BCA roles) | PASS — Batch A PILOT; first-pass green; harness pre-additions (OK?/Note # headers, Comments: auto-skip) were the whole BCA grammar delta |
| 2 | Boiler (Temporary Start) Prefunctional Checklist (2.6.2.1) | ca10c6b1 | 18/142/1 | 6 (Boiler Startup Contractor variant) | PASS — gen; six safety banks retained (R9), declared |
| 3 | Electric Boiler (Temporary Start) Prefunctional Checklist (2.6.2.1) | f450e525 | 12/51/3 | 6 | PASS — hand-authored; 2021 rewrite grammar (row-number shift rule); CONTAMINATED (R21, privacy flag — see below) |
| 4 | Water Cooled Chiller Prefunctional Checklist (2.6.3.1) | d73ed2a0 | 8/57/1 | 7 (TAB Contractor) | PASS — gen |
| 5 | Air Cooled Chiller Prefunctional Checklist (2.6.3.2) | 54435ddb | 8/55/1 | 7 | PASS — gen |
| 6 | Cooling Tower Prefunctional Checklist (2.6.3.5) | 1eb52674 | 10/63/1 | 7 | PASS — gen |
| 7 | Building Automation System (BAS) Prefunctional Checklist (2.6.4.1) | 7ac0dfbf | 7/22/5 | 4 (GC+CC+CxP+Owner) | PASS — hand-authored; graphics matrix grid (R13), 3 sample sub-forms -> schedule grids (R20) |
| 8 | Exhaust Fan Prefunctional Checklist (2.6.5.1) | d102a6c0 | 7/64/1 | 6 | PASS — gen [matrix mode, R12] |
| 9 | Heat Exchanger Prefunctional Checklist (2.6.6.1) | a89f4928 | 5/39/1 | 6 | PASS — gen; null key |
| 10 | Pump Prefunctional Checklist (2.6.8.1) | e6457c0f | 8/47/1 | 7 (TAB Contractor) | PASS — gen |
| 11 | Variable Frequency Drive Prefunctional Checklist (2.9.1) | ace7bfa5 | 6/58/0 | 6 | PASS — gen; null key; no calibration tail in source |

| 12 | Ductwork Prefunctional Checklist (2.6.1.2) | 7d922406 | 10/65/0 | 7 | PASS — gen [per-floor matrix, R12] |
| 13 | Steam and Condensate Piping Prefunctional Checklist (2.6.2.3) | 8ab67f50 | 7/45/0 | 4 | PASS — gen; PRV Information register block |
| 14 | Chilled Water Piping Prefunctional Checklist (2.6.3.3) | 7935b3c8 | 4/34/0 | 6 | PASS — gen |
| 15 | Condenser Water Piping Prefunctional Checklist (2.6.3.4) | fadc5375 | 5/33/0 | 6 | PASS — gen |
| 16 | Air Separator Prefunctional Checklist (2.6.3.6) | b265adfd | 1/11/0 | 4 | PASS — gen [matrix; bank title carried in header]; lighting-footnote artifact in info block (R6/FPB) |
| 17 | Expansion Tank Prefunctional Checklist (2.6.3.7) | 0d1c27cf | 2/18/0 | 4 | PASS — gen [matrix]; same footnote artifact |
| 18 | Chem-Free Condenser Water Treatment & Conductivity Control PFC (2.6.3.8) | 67ce0515 | 5/29/0 | 5 | PASS — gen |
| 19 | Condenser Water Treatment Circulation Water Filters PFC (2.6.3.9) | 0931de9e | 3/33/0 | 5 | PASS — gen |
| 20 | Air Flow Measuring Station Prefunctional Checklist (2.6.4.3) | f4b38c29 | 4/32/0 | 6 | PASS — gen + declared bare sub-banners (one iteration: OPERATIONAL CHECKS float-filter reverse-trace catch) |
| 21 | Hydronic Flow Meter Prefunctional Checklist (2.6.4.4) | b866be6f | 2/14/1 | 4 (functional roles) | PASS — hand-authored; calibration-check procedure form; Check Record grid w/ method rows |
| 22 | Construction IAQ Plan Prefunctional Checklist (2.6.7.1) | 30b43a8a | 12/46/0 | 8 | PASS — hand-authored; paragraph-run layout ([CHK]-glyph filter added); null categories (cross-trade process) |

| 23 | Fan Powered VAV with Electric Reheat PFC (2.6.11.1) | 30c79f50 | 9/43/1 | 8 | PASS — gen; key vav |
| 24 | Fan Powered VAV with Hot Water Reheat PFC (2.6.11.2) | c42545a1 | 10/53/1 | 8 | PASS — gen; key vav; Associated Checklists block excluded |
| 25 | VAV (Cooling Only) Prefunctional Checklist (2.6.11.3) | e9b47c4a | 8/36/1 | 8 | PASS — gen; key vav |
| 26 | VAV with Electric Reheat Prefunctional Checklist (2.6.11.4) | d4cc32ff | 8/38/1 | 8 | PASS — gen; key vav |
| 27 | VAV with Hot Water Reheat Prefunctional Checklist (2.6.11.6) | e4cca626 | 9/48/1 | 8 | PASS — gen; key vav |
| 28 | VAV Air Terminal Unit (All Types) Prefunctional Checklist (2.6.11.7) | 70c3db84 | 3/17/0 | 5 (incl. Commissioning Agent as printed) | PASS — GATE FORM ACCEPTED (Tony 2026-07-21); render_mode='check_table' (sole user) |

### Gate resolution: check_table render mode (2026-07-21)

Built per Tony's option-1 verdict with all four specifics: (a) fleet-scale acceptance on a
24-TU ZZ-TEST instance (`6ca1879d`, TEST-TU-101..406 vav fixtures, 146 mixed responses) —
**12/12 checks PASS** (out/ct-accept.mjs); (b) landscape + column chunking (1–9 / 10–17,
unit-tag column repeated per chunk, thead repeats on row overflow); (c) completed cells =
status + response date, N red per convention; (d) DOCX attempted — html-to-docx handled the
transposed table, so both formats ship (PDF-only fallback wired and logged if it ever fights).
Migration: `checklist_templates.render_mode` (nullable text), sole user 70c3db84. The
Start-Up campaign inherits the mode for fleet forms. PDFs: out/vavct-fleet-blank-contractor.pdf
(5pp) + out/vavct-fleet-completed.pdf (6pp).

### Batch C metrics (2026-07-21)

Attempted 6 · passed first audit 5 (Check-Table needed one trivial iteration — blank-row
range off by one) · quarantined 0 · harness rules added 1 (transposed-header all-cell
item-label claim) · all five Word VAV forms render on the freshly minted vav nameplate
(fallback=false). Check-Table seeded to ZZ-TEST for the gate render; register acceptance
pending Tony's gate verdict.

### Batch B metrics (2026-07-21)

Attempted 11 · passed first audit 10 (AFMS needed one iteration — bare sub-banner rows +
the all-caps float-filter interaction; fixed via declared banners in config) · quarantined 0 ·
harness rules added 1 ([CHK]-glyph paragraph filter) · retro pass over 76 Word JSONs
(65 CSA + 11 Batch A): clean. First-pass rate **91%**.
Tooling note: the PowerShell re-encode mojibake trap bit gen-pfc.mjs (Get-Content/-replace
round-trip) — generator rewritten via the Write tool, now the standing rule for ALL
unicode-bearing files, not just memory files.

### Batch A metrics (2026-07-21)

Attempted 11 · passed first audit 11 (pilot first-pass; the 8 generated hit one tooling
rework — BOM in the PowerShell dump redirects ate R1, generator-side fix, then all
first-pass; both hand-authored first-pass) · quarantined 0 · harness rules added 4
(OK?/Note # bank-header vocab; (GENERAL )?COMMENTS: auto-skip; row-number shift/drop;
pfc type + contractor-audience render) · retro pass over all 65 CSA Word JSONs: clean.

## Exclusions

- IEL `solar_pv_checklist_WIP.docx` — WIP master; BCA 2.9.2 Photovoltaic seeds instead (R26).
- BCA 2.10.1 Fire Alarm, 2.11.2 Security CCTV — ceded to IEL masters (IEL-wins).
- IEL `.pdf` twins (ats, emergency_generator, fire_alarm, grounding, heating_cable, lighting,
  low_volt_dry_transformer, low_volt_mcc, low_volt_switchgear, medium_volt_switchgear, panel,
  security_cctv, unit_substation, unit_substation_transformer) — render duplicates of the .doc
  masters, seeded once per R19.

## Contamination notes (R21 — for Tony's ShareSync sitting)

- `2.6.2.1 Boiler (Electric) Construction Checklist_Temporary Start.docx` — USED PROJECT FILE:
  Humber College Phase 2 Central Plant in the Project cell; submittal signature fills
  (contractor company "Ecosystem", 18 Mar 2025); approval fills with PERSON NAMES —
  **PRIVACY FLAG: "Isotherm Engineering Ltd. / Tony Faeghi" and "Humber College / Hooman
  Aboutalebi"**. Structure-only extraction; all residuals excluded via skips.
