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
