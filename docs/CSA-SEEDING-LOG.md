# CSA IVC Seeding Campaign — Log

Autonomous seeding campaign, approved 2026-07-20 after calibration stop #1 (AHU).
Every seeded form passed all five audit-template.mjs check families before commit.
Extraction JSONs live in gitignored `samples/seed-json/csa-ivc/` (ShareSync rule);
this log records only names, IDs, counts, and audit outcomes. Field Copy blank
PDFs for async review are left in `out/`.

Audit families: row reconciliation · vocabulary validity · branding sweep ·
seed verification · render verification. Quarantine rule: deviant/ambiguous
forms are skipped and logged below, never force-fit.

## Seeded templates

| # | Template | Type/Equip | Template ID | Sections | Items | Grids | Signoffs | Audit |
|---|---|---|---|---|---|---|---|---|
| 1 | Air Handling Unit Installation Verification Checklist | ivc/ahu | 8f17455a | 7 | 32 | 13 | 2 | PASS (calibration reference, human-approved) |
| 2 | Fan Coil Installation Verification Checklist | ivc/fcu | e4035c04 | 2 | 13 | 1 | 2 | PASS |
| 3 | Heat Pump Installation Verification Checklist | ivc/heat_pump | 88010795 | 2 | 14 | 1 | 2 | PASS |

## Quarantine list

| Form | Reason |
|---|---|
| Pump.xlsx | 4 item rows with fragmentary labels (R22 "SPECIFICATIONS", R23 "RECOMMENDATIONS", R28 "RECOMMENDED", R30 "OF FLOW CORRECT") — each structurally an independent item row (own status/comments cells, no cross-row merges); intended wording unrecoverable without human read of the source layout. |
| Exhaust_Fans.xlsx | Compound multi-equipment sheet: three separate nameplate blocks, a MOTORIZED DAMPER NO.1–3 status matrix whose first rows read as per-damper identity values, and a duplicated 7-item damper bank (R98–104 = R105–111) with no distinguishing labels. Mapping requires guessing. |

## ZZ-TEST fixtures added for the campaign

TEST-FC-1/2 (fcu), TEST-B-1/2 (boiler), TEST-CH-1/2 (chiller), TEST-CT-1/2
(cooling_tower), TEST-VAV-1/2 + TEST-CAV-1/2 (no key — basic-fallback types).
