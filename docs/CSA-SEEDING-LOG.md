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
| 11 | Fan Powered Box Installation Verification Checklist | ivc/— (fallback) | a574eb8f | 4 | 20 | 1 | 2 | PASS (source "CAV box" copy artifact cleaned to "Box", logged) |
| 12 | Reheat Coil Installation Verification Checklist | ivc/— (fallback) | 8f65bebf | 2 | 13 | 0 | 2 | PASS (no component rows in source — first zero-grid template) |
| 13 | Unit Heater Installation Verification Checklist | ivc/— (fallback) | 77acbe36 | 1 | 13 | 0 | 2 | PASS (VALVAES typo + artifact suffix cleaned, logged; residual project data excluded) |
| 14 | Cabinet Unit Heater Installation Verification Checklist | ivc/— (fallback) | ce1f07b3 | 2 | 15 | 0 | 2 | PASS (same cleanups as UH; residual project data excluded) |
| 15 | Radiant Panel Installation Verification Checklist | ivc/— (fallback) | 48ae8c5f | 3 | 15 | 1 | 2 | PASS |
| 16 | Radiation Installation Verification Checklist | ivc/— (fallback) | 1f78a9ba | 3 | 14 | 1 | 2 | PASS |
| 17 | Split System Air Conditioning Unit Installation Verification Checklist | ivc/fcu | 609c6572 | 2 | 7 | 1 | 2 | PASS |
| 18 | Heat Recovery Wheel Installation Verification Checklist | ivc/erv | 3e45088c | 2 | 7 | 2 | 2 | PASS (duplicate VSD-verified row retained verbatim, logged) |
| 19 | Direct Fired Makeup Air Unit Installation Verification Checklist | ivc/ahu | e322f824 | 3 | 44 | 1 | 2 | PASS (Start-Up re-checks kept verbatim; residual project data excluded) |
| 20 | Fume Exhauster Installation Verification Checklist | ivc/fan | 312593fe | 4 | 21 | 3 | 2 | PASS (two-equipment compound: exhauster + swing-arm motor) |
| 21 | Exhaust Fan Installation Verification Checklist | ivc/fan | 4f7a57c5 | 5 | 30 | 3 | 2 | PASS (compound-sheet ruling: damper matrix as No.1-3 grid — known semantic edge: grid-cell checks don't auto-create findings, CxA logs manually; duplicated bank deduped, logged) |
| 22 | Heat Exchanger Installation Verification Checklist | ivc/— (fallback) | 9844ea5a | 2 | 17 | 1 | 2 | PASS (from -new master per ruling; residual TAG excluded) |
| 23 | Glycol Mixing and Fill Tank Installation Verification Checklist | ivc/— (fallback) | 87cd70df | 2 | 15 | 0 | 2 | PASS |
| 24 | Expansion Tank Installation Verification Checklist | ivc/— (fallback) | 916e0289 | 2 | 25 | 1 | 2 | PASS (cross-page duplicate rows retained) |
| 25 | Variable Frequency Drive Installation Verification Checklist | ivc/— (fallback) | 66f1247c | 3 | 16 | 1 | 2 | PASS (FOOTNOTES block empty in master, logged; SUBMITTED/ACCEPTABLE headers added to audit boundary) |
| 26 | Steam Boiler Installation Verification Checklist | ivc/boiler | f315ef98 | 3 | 41 | 1 | 2 | PASS (Start-Up re-checks kept per ratified precedent) |
| 27 | Fluid Cooler Installation Verification Checklist | ivc/cooling_tower | bfe9ce9d | 2 | 36 | 2 | 2 | PASS (assembled system package: cooler data + expansion tank evaluation, extracted faithfully) |
| 28 | Sump Pump Installation Verification Checklist | ivc/pump | 3f326561 | 3 | 20 | 1 | 2 | PASS |
| 29 | Rooftop Unit Installation Verification Checklist | ivc/ahu | 7f47a1b2 | 10 | 106 | 10 | 2 | PASS (deviant sheet "RTU_Final ST" ruled static-verification by content; three per-fan V/A grids; Roof Curb flashing → Building Envelope) |
| 30 | Domestic Hot Water System Verification Checklist | ivc/— (fallback) | 1ebdc718 | 1 | 12 | 0 | 2 | PASS (system-level; EQUIPMENT NUMBER column → comments; residual project data excluded) |
| 31 | Domestic Cold Water System Verification Checklist | ivc/— (fallback) | 1f71fdee | 1 | 11 | 0 | 2 | PASS (residual project data excluded) |
| 32 | Domestic Hot Water Tank Installation Verification Checklist | ivc/— (fallback) | 9c2983ce | 2 | 20 | 1 | 2 | PASS (residual project data excluded) |
| 33 | Water Heater Installation Verification Checklist | ivc/— (fallback) | 0619d591 | 2 | 19 | 1 | 2 | PASS |
| 34 | Water Meter Installation Verification Checklist | ivc/— (fallback) | 859671c4 | 2 | 8 | 1 | 2 | PASS |
| 35 | Backflow Preventor Installation Verification Checklist | ivc/— (fallback) | 2549bb0b | 2 | 7 | 1 | 2 | PASS (residual project data excluded) |
| 36 | Mixing Valve Installation Verification Checklist | ivc/— (fallback) | 4803d38a | 2 | 4 | 1 | 2 | PASS |
| 37 | Plumbing Fixture Installation Verification Checklist | ivc/— (fallback) | 96747b1e | 2 | 10 | 1 | 2 | PASS (new schedule-table pattern → numbered-blank-row grid; mixed SPECIFIED+COMMENTS header refined harness inference) |
| 38 | Drainage System Installation Verification Checklist | ivc/— (fallback) | ac7d7bb9 | 1 | 0 | 1 | 2 | PASS (first zero-item template — pure fixture schedule) |
| 39 | Pressure Regulating Station Installation Verification Checklist | ivc/— (fallback) | 5d57d496 | 2 | 6 | 1 | 2 | PASS |
| 40 | Water Purification Equipment Installation Verification Checklist | ivc/— (fallback) | 7c593baf | 2 | 24 | 1 | 2 | PASS |
| 41 | Tile Bed Installation Verification Checklist | ivc/— (fallback) | 5a7553a7 | 2 | 24 | 1 | 2 | PASS |
| 42 | DDC Field Control Panel Installation Verification Checklist | ivc/— (fallback) | b41be28a | 2 | 0 | 3 | 2 | PASS (per-panel matrices → panel-column grids; zero items; residual project data excluded) |
| 43 | Pneumatic Control Panel Installation Verification Checklist | ivc/— (fallback) | 4a0cf177 | 2 | 0 | 2 | 2 | PASS |
| 44 | Control Points List Verification Checklist | ivc/— (fallback) | 493e858a | 2 | 0 | 2 | 2 | PASS (points-list schedule; source provides 2 blank rows; residual project data excluded) |
| 45 | Point-to-Point Verification Checklist | ivc/— (fallback) | ee6d4453 | 1 | 0 | 1 | 2 | PASS (USED PROJECT FILE as master — tech name + client project + real point rows all excluded, structure only; zero-item per Drainage precedent as anticipated) |
| 46 | Operator's Workstation Installation Verification Checklist | ivc/— (fallback) | 008cac64 | 2 | 0 | 2 | 2 | PASS (Specified/Installed component table → two-column grid) |
| 47 | Building System Integration Verification Checklist | ivc/— (fallback) | 14ba6c9d | 1 | 0 | 1 | 2 | PASS (pure integration schedule; residual project data excluded) |
| 48 | Smoke Management System Verification Checklist | ivc/— (fallback) | 88c864b5 | 1 | 10 | 0 | 2 | PASS |
| 49 | Chilled Water System Verification Checklist | ivc/— (fallback) | 66d6bd24 | 1 | 18 | 0 | 2 | PASS (loop-position duplicate bank declared + kept; residual project data excluded) |
| 50 | Hot Water Heating System Verification Checklist | ivc/— (fallback) | 5b06d22a | 1 | 14 | 0 | 2 | PASS |
| 51 | Low Voltage Power Circuit Breaker Installation Verification Checklist | ivc/— (fallback) | d8000198 | 3 | 16 | 4 | 2 | PASS (first Elec/NETA-family form: paired-label nameplate blocks → grids; asterisk footnote carried as item hint) |

## Duplication rulings — consistency note (Tony, 2026-07-20)

Two source-duplication cases, two rulings, one principle: **duplicates are kept when
something real distinguishes them, deduped when nothing does.** The RTU's Supply
Fan(s) and Return/Exhaust Fan sections are verbatim-identical item lists but check
different fans — kept. The Exhaust Fan workbook's second damper bank repeated the
same checks against the same NO. 1–3 columns with no distinguisher — deduped (logged
skip). Apply this test to future duplicate blocks.

## Source defects pending upstream answers

- **VFD footnotes (form 25):** items reference "footnote 1" / "footnote 2 & 3" but the
  FOOTNOTES block is empty in the master — logged as a source defect. Tony is asking
  Peiman whether the original footnote text survives; if it does, that template gets a
  hint-enrichment pass, otherwise it stands as seeded.

## Quarantine list

| Form | Reason |
|---|---|
| ~~Pump.xlsx~~ | RESOLVED by ruling 2026-07-20: fragments are wrapped-label continuations, merged upward with logged reconstruction (FD Boiler phrasing as reference). Seeded as form 10. Harness now enforces the merge-upward rule (merged_rows + no-bare-fragment checks). |
| ~~Exhaust_Fans.xlsx~~ | RESOLVED: approved and seeded as form 21. Ratified precedents from this review: (a) per-damper/per-component check matrices extract as grids — grid-cell checks not auto-creating findings is an accepted known semantic edge, not a defect; (b) Start-Up items appearing on the Static Verification sheet itself are kept (MAU/EF pattern) — faithful to source over sheet-name purism. |

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
