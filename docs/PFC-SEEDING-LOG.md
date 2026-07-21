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

## Exclusions

- IEL `solar_pv_checklist_WIP.docx` — WIP master; BCA 2.9.2 Photovoltaic seeds instead (R26).
- BCA 2.10.1 Fire Alarm, 2.11.2 Security CCTV — ceded to IEL masters (IEL-wins).
- IEL `.pdf` twins (ats, emergency_generator, fire_alarm, grounding, heating_cable, lighting,
  low_volt_dry_transformer, low_volt_mcc, low_volt_switchgear, medium_volt_switchgear, panel,
  security_cctv, unit_substation, unit_substation_transformer) — render duplicates of the .doc
  masters, seeded once per R19.

## Contamination notes (R21 — for Tony's ShareSync sitting)

(none yet)
