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
| 4 | Forced Draft Water Boiler Installation Verification Checklist | ivc/boiler | 9202a224 | 3 | 48 | 1 | 2 | PASS |
| 5 | Natural Draft Boiler Installation Verification Checklist | ivc/boiler | aacf1fa5 | 3 | 26 | 1 | 2 | PASS |
| 6 | Centrifugal Chiller Installation Verification Checklist | ivc/chiller | 4efcf427 | 2 | 45 | 1 | 2 | PASS |
| 7 | Cooling Tower Installation Verification Checklist | ivc/cooling_tower | a11c3fc7 | 2 | 39 | 1 | 2 | PASS |
| 8 | Variable Air Volume Box Installation Verification Checklist | ivc/— (fallback) | 9fe6dd96 | 3 | 17 | 1 | 2 | PASS |
| 9 | Constant Air Volume Box Installation Verification Checklist | ivc/— (fallback) | 64311bf6 | 4 | 17 | 1 | 2 | PASS |
| 10 | Pump Installation Verification Checklist | ivc/pump | 05016509 | 3 | 28 | 2 | 2 | PASS (quarantine lifted by ruling; fragment merges logged in _extraction.merged_rows) |

## Quarantine list

| Form | Reason |
|---|---|
| ~~Pump.xlsx~~ | RESOLVED by ruling 2026-07-20: fragments are wrapped-label continuations, merged upward with logged reconstruction (FD Boiler phrasing as reference). Seeded as form 10. Harness now enforces the merge-upward rule (merged_rows + no-bare-fragment checks). |
| Exhaust_Fans.xlsx | Ruling 2026-07-20: re-extracted with unit-matrix learnings (fan checks → per-target items; per-damper checks → No. 1–3 grid; duplicated bank deduped, logged). Static audit PASS. First compound sheet — JSON awaiting Tony's pre-seed review; seeds on approval. |

Supporting evidence for the Pump quarantine, found later in the batch: the FD Boiler
sheet spells the same checks in full ("INSTALLED AS PER DRAWINGS AND SPECIFICATIONS" /
"…MANUFACTURER'S RECOMMENDATIONS"), suggesting Pump's R22/R23/R28/R30 are truncated
variants of those — but confirmation is Tony's call, not an extraction guess.

Source-quality observations (no action taken): Cooling_Towers master carries residual
project data in its identity rows (used copy, excluded via skip); Natural_Draft_Boiler
component data duplicates EWT/LWT pairs verbatim (retained).

## ZZ-TEST fixtures added for the campaign

TEST-FC-1/2 (fcu), TEST-B-1/2 (boiler), TEST-CH-1/2 (chiller), TEST-CT-1/2
(cooling_tower), TEST-VAV-1/2 + TEST-CAV-1/2 (no key — basic-fallback types).
