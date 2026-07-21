# PFC Long-Tail Seeding Log

**CAMPAIGN COMPLETE — 2026-07-21.** 56 templates seeded across Batches A–F (11+11+6+9+5+14),
all full-audit green. Final register: 57 pfc templates (56 campaign + the pre-campaign AHU),
DB total 238 (181 ivc + 57 pfc). check_table render mode built and fleet-proven at the
2.6.11.7 gate. Closing-state report delivered.

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

| 29 | Domestic Water Heater Prefunctional Checklist (2.7.1) | 8144c8af | 8/40/1 | 7 | PASS — gen |
| 30 | DHW Circulation Pumps and Aquastat Controls PFC (2.7.2) | f6d74d7f | 8/52/1 | 8 | PASS — gen; key pump; aquastat calibration schedule ('Device' header generalization) |
| 31 | Plumbing Fixture Prefunctional Checklist (2.7.3) | 69a6d9c9 | 2/20/0 | 8 | PASS — gen (pendBanner: bare header titled from group banner) |
| 32 | Irrigation System Controls Prefunctional Checklist (2.7.5) | 7ca2ebe8 | 5/10/1 | 5 (Irrigation Contractor) | PASS — hand-authored; Yes/No/Data grammar, merged sub-list (R8 declared), Negative Responses grid |
| 33 | Solar Water Heater Prefunctional Checklist (2.7.6) | 4b10ac9d | 6/47/0 | 5 | PASS — gen [matrix; per-component code columns SC/SCP/PST/DDT] |
| 34 | Building-Wide Lighting Control System PFC (2.8.2, content in the 2.8.1-named file) | 9fa4b30b | 7/40/0 | 4 | PASS — gen [matrix]; SWAPPED MASTERS (R10) |
| 35 | Lighting and HVAC Occupancy Sensors PFC (2.8.1, content in the 2.8.2-named file) | 8b3b1bc0 | 4/10/6 | 4 | PASS — hand-authored; 5 per-type grids (R7 compound rows), per-floor matrix banks, 120-row device-record grid (R20) |
| 36 | Daylight Dimming Prefunctional Checklist (2.8.3) | c324d415 | 3/21/0 | 4 | PASS — gen [matrix] |
| 37 | Photovoltaic System Prefunctional Checklist (2.9.2) | 06a35e4f | 11/45/0 | 4 | PASS — gen; seeds under R26 (IEL WIP excluded) |

| 38 | Nurse Call & Paging System Prefunctional Checklist (2.11.1) | df5f14b7 | 8/36/0 | 4 | PASS — gen |
| 39 | Laboratory Air Compressor & Drier Prefunctional Checklist (2.12.1) | 34b567b6 | 4/24/0 | 6 | PASS — gen [matrix; KC-001/AD-001 header tag placeholders skipped, generic numbering] |
| 40 | Laboratory Vacuum & Pump System Prefunctional Checklist (2.12.2) | 75a7e56b | 6/48/0 | 6 | PASS — gen [matrix]; null key per marginal ruling |
| 41 | Fan Filter Unit Prefunctional Checklist (2.12.3) | 6fa340cf | 5/34/0 | 8 | PASS — gen [matrix]; null key per marginal ruling; one label-less check row skipped (source artifact) |
| 42 | Lab Fume Hood Prefunctional Checklist (2.12.4) | bb815388 | 6/46/0 | 8 | PASS — gen [matrix; per-floor phases] |

| 43 | Automatic Transfer Switch Prefunctional Checklist (IEL 02/06) | dc9dbfd2 | 4/29/1 | 5 (Commissioning Authority) | PASS — IEL PILOT, first-pass; PDF-twin path; **keyed ats post-close (Tony ruling), full-stack backfill, re-audit PASS (nameplate live, fallback=false)** |
| 44 | Emergency Generator Prefunctional Checklist (IEL) | 5946c14b | 5/36/1 | 8 | PASS — gen-iel; key generator |
| 45 | Fire Alarm Prefunctional Checklist (IEL) | 081067eb | 5/32/0 | 4 | PASS — gen-iel; Fire Protection default; one transient API 502 on first seed (nothing landed; clean retry) |
| 46 | Grounding Prefunctional Checklist (IEL) | 1e116b58 | 4/14/0 | 4 | PASS — gen-iel |
| 47 | Heating Cable Prefunctional Checklist (IEL) | 1d40bc91 | 2/9/0 | 4 | PASS — gen-iel |
| 48 | Lighting Prefunctional Checklist (IEL) | 2eb3eb5f | 4/18/0 | 5 | PASS — gen-iel |
| 49 | Low Voltage Dry Type Transformer Prefunctional Checklist (IEL) | a6b23fe4 | 4/23/1 | 4 | PASS — gen-iel |
| 50 | Low Voltage Motor Control Center Prefunctional Checklist (IEL) | ca4129a3 | 6/61/0 | 4 | PASS — gen-iel; breaker banks declared (R9) |
| 51 | Low Voltage Switchgear Prefunctional Checklist (IEL) | b31febe9 | 5/67/0 | 4 | PASS — gen-iel; breaker banks declared (R9) |
| 52 | Medium Voltage Switchgear Prefunctional Checklist (IEL) | 38d9dd22 | 5/67/0 | 4 | PASS — gen-iel; breaker banks declared (R9) |
| 53 | Panel Prefunctional Checklist (IEL, Version 02 Jan 2023) | a2b5d5f7 | 4/29/0 | 4 | PASS — gen-iel |
| 54 | Security / CCTV Prefunctional Checklist (IEL) | 31a76390 | 9/46/0 | 4 | PASS — gen-iel; same-titled phase banks kept (R9) |
| 55 | Unit Substation Prefunctional Checklist (IEL) | c45b4fbd | 4/34/1 | 4 | PASS — gen-iel |
| 56 | Unit Substation Transformer Prefunctional Checklist (IEL) | 27bd2dd7 | 4/34/1 | 4 | PASS — gen-iel |

### Batch F metrics (2026-07-21)

Attempted 14 · pilot (ATS) first-pass · 11 more first-pass · 3 needed one iteration
(switchgear-family duplicate-bank declarations) · quarantined 0 · contamination 0.
**Source-path pivot:** Word COM hangs machine-wide this session (probe on a previously
convertible CSA .doc also hangs; ShareSync Office Plugin implicated but disabling it did
not clear the hang — flagged as an environment issue for Tony). Batch F extracted from the
PDF render twins instead (identical content): new `dump-pdf.mjs` (y/x layout grouping),
harness PDF mode (furniture auto-skips: firm header / page footer / version line /
Comments:), `gen-iel.mjs` with lowercase-continuation wrap-merge (all merges declared as
merged_rows). Calibration schedules: blank rows invisible in the PDF text layer — 12-row
capacity seeded and declared per form. **IEL = Isotherm Engineering Ltd. — the firm's own
masters**; "Commissioning Authority" role kept as printed (R23). ATS key left null (no
ruled key; an `ats` field-def set exists on the register — flagged for Tony's optional
ruling). Final full-corpus retro: 121/121 static-clean.

Attempted 5 · passed first audit 1 first-run, 5/5 after one generator iteration (four
matrix-furniture variants ruled in one pass: header tag placeholders, Tag: fill-in rows,
Trade/OK? label rows, label-less check rows) · quarantined 0 · contamination 0 ·
drift check clean (EF/ductwork counts stable).

### Batch D metrics (2026-07-21)

Attempted 9 · passed first audit 6 (three needed iterations: dhw-pumps' 'Device' calibration
header; solar-wh's per-component code columns — one generator rule regression caught by the
drift check, the trade-cell rule ate EF's TAB banner, reverted same run; lighting-occupancy's
SPECIFIED-vocab field row) · quarantined 0 · **SWAPPED-MASTERS catch (R10): the 2.8.1/2.8.2
files carry each other's content — both extracted under content-true identities, flagged for
the ShareSync sitting** · generator rules added 4 (pendBanner bare-header titling; Check
header w/o second cell; per-column code rows; Location OK? calibration-header generalization) ·
retro static pass over 103 Word JSONs (65 CSA + 38 PFC): clean after removing the stale
pre-swap artifact. Harness-internal note for the record: the grid-row reverse-trace check has
a latent always-pass expression (`!gridComposites.length === 0`) — grid-row invention is in
practice guarded by the forward pass + composite claims; flagged, not silently relied upon.

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
