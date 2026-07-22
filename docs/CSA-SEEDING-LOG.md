# CSA IVC Seeding Campaign â€” Log

Autonomous seeding campaign, approved 2026-07-20 after calibration stop #1 (AHU).
Every seeded form passed all five audit-template.mjs check families before commit.
Extraction JSONs live in gitignored `samples/seed-json/csa-ivc/` (ShareSync rule);
this log records only names, IDs, counts, and audit outcomes. Field Copy blank
PDFs for async review are left in `out/`.

Audit families: row reconciliation Â· vocabulary validity Â· branding sweep Â·
seed verification Â· render verification. Quarantine rule: deviant/ambiguous
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
| 8 | Variable Air Volume Box Installation Verification Checklist | ivc/â€” (fallback) | 9fe6dd96 | 3 | 17 | 1 | 2 | PASS |
| 9 | Constant Air Volume Box Installation Verification Checklist | ivc/â€” (fallback) | 64311bf6 | 4 | 17 | 1 | 2 | PASS |
| 10 | Pump Installation Verification Checklist | ivc/pump | 05016509 | 3 | 28 | 2 | 2 | PASS (quarantine lifted by ruling; fragment merges logged in _extraction.merged_rows) |
| 11 | Fan Powered Box Installation Verification Checklist | ivc/â€” (fallback) | a574eb8f | 4 | 20 | 1 | 2 | PASS (source "CAV box" copy artifact cleaned to "Box", logged) |
| 12 | Reheat Coil Installation Verification Checklist | ivc/â€” (fallback) | 8f65bebf | 2 | 13 | 0 | 2 | PASS (no component rows in source â€” first zero-grid template) |
| 13 | Unit Heater Installation Verification Checklist | ivc/â€” (fallback) | 77acbe36 | 1 | 13 | 0 | 2 | PASS (VALVAES typo + artifact suffix cleaned, logged; residual project data excluded) |
| 14 | Cabinet Unit Heater Installation Verification Checklist | ivc/â€” (fallback) | ce1f07b3 | 2 | 15 | 0 | 2 | PASS (same cleanups as UH; residual project data excluded) |
| 15 | Radiant Panel Installation Verification Checklist | ivc/â€” (fallback) | 48ae8c5f | 3 | 15 | 1 | 2 | PASS |
| 16 | Radiation Installation Verification Checklist | ivc/â€” (fallback) | 1f78a9ba | 3 | 14 | 1 | 2 | PASS |
| 17 | Split System Air Conditioning Unit Installation Verification Checklist | ivc/fcu | 609c6572 | 2 | 7 | 1 | 2 | PASS |
| 18 | Heat Recovery Wheel Installation Verification Checklist | ivc/erv | 3e45088c | 2 | 7 | 2 | 2 | PASS (duplicate VSD-verified row retained verbatim, logged) |
| 19 | Direct Fired Makeup Air Unit Installation Verification Checklist | ivc/ahu | e322f824 | 3 | 44 | 1 | 2 | PASS (Start-Up re-checks kept verbatim; residual project data excluded) |
| 20 | Fume Exhauster Installation Verification Checklist | ivc/fan | 312593fe | 4 | 21 | 3 | 2 | PASS (two-equipment compound: exhauster + swing-arm motor) |
| 21 | Exhaust Fan Installation Verification Checklist | ivc/fan | 4f7a57c5 | 5 | 30 | 3 | 2 | PASS (compound-sheet ruling: damper matrix as No.1-3 grid â€” known semantic edge: grid-cell checks don't auto-create findings, CxA logs manually; duplicated bank deduped, logged) |
| 22 | Heat Exchanger Installation Verification Checklist | ivc/â€” (fallback) | 9844ea5a | 2 | 17 | 1 | 2 | PASS (from -new master per ruling; residual TAG excluded) |
| 23 | Glycol Mixing and Fill Tank Installation Verification Checklist | ivc/â€” (fallback) | 87cd70df | 2 | 15 | 0 | 2 | PASS |
| 24 | Expansion Tank Installation Verification Checklist | ivc/â€” (fallback) | 916e0289 | 2 | 25 | 1 | 2 | PASS (cross-page duplicate rows retained) |
| 25 | Variable Frequency Drive Installation Verification Checklist | ivc/â€” (fallback) | 66f1247c | 3 | 16 | 1 | 2 | PASS (FOOTNOTES block empty in master, logged; SUBMITTED/ACCEPTABLE headers added to audit boundary) |
| 26 | Steam Boiler Installation Verification Checklist | ivc/boiler | f315ef98 | 3 | 41 | 1 | 2 | PASS (Start-Up re-checks kept per ratified precedent) |
| 27 | Fluid Cooler Installation Verification Checklist | ivc/cooling_tower | bfe9ce9d | 2 | 36 | 2 | 2 | PASS (assembled system package: cooler data + expansion tank evaluation, extracted faithfully) |
| 28 | Sump Pump Installation Verification Checklist | ivc/pump | 3f326561 | 3 | 20 | 1 | 2 | PASS |
| 29 | Rooftop Unit Installation Verification Checklist | ivc/ahu | 7f47a1b2 | 10 | 106 | 10 | 2 | PASS (deviant sheet "RTU_Final ST" ruled static-verification by content; three per-fan V/A grids; Roof Curb flashing â†’ Building Envelope) |
| 30 | Domestic Hot Water System Verification Checklist | ivc/â€” (fallback) | 1ebdc718 | 1 | 12 | 0 | 2 | PASS (system-level; EQUIPMENT NUMBER column â†’ comments; residual project data excluded) |
| 31 | Domestic Cold Water System Verification Checklist | ivc/â€” (fallback) | 1f71fdee | 1 | 11 | 0 | 2 | PASS (residual project data excluded) |
| 32 | Domestic Hot Water Tank Installation Verification Checklist | ivc/â€” (fallback) | 9c2983ce | 2 | 20 | 1 | 2 | PASS (residual project data excluded) |
| 33 | Water Heater Installation Verification Checklist | ivc/â€” (fallback) | 0619d591 | 2 | 19 | 1 | 2 | PASS |
| 34 | Water Meter Installation Verification Checklist | ivc/â€” (fallback) | 859671c4 | 2 | 8 | 1 | 2 | PASS |
| 35 | Backflow Preventor Installation Verification Checklist | ivc/â€” (fallback) | 2549bb0b | 2 | 7 | 1 | 2 | PASS (residual project data excluded) |
| 36 | Mixing Valve Installation Verification Checklist | ivc/â€” (fallback) | 4803d38a | 2 | 4 | 1 | 2 | PASS |
| 37 | Plumbing Fixture Installation Verification Checklist | ivc/â€” (fallback) | 96747b1e | 2 | 10 | 1 | 2 | PASS (new schedule-table pattern â†’ numbered-blank-row grid; mixed SPECIFIED+COMMENTS header refined harness inference) |
| 38 | Drainage System Installation Verification Checklist | ivc/â€” (fallback) | ac7d7bb9 | 1 | 0 | 1 | 2 | PASS (first zero-item template â€” pure fixture schedule) |
| 39 | Pressure Regulating Station Installation Verification Checklist | ivc/â€” (fallback) | 5d57d496 | 2 | 6 | 1 | 2 | PASS |
| 40 | Water Purification Equipment Installation Verification Checklist | ivc/â€” (fallback) | 7c593baf | 2 | 24 | 1 | 2 | PASS |
| 41 | Tile Bed Installation Verification Checklist | ivc/â€” (fallback) | 5a7553a7 | 2 | 24 | 1 | 2 | PASS |
| 42 | DDC Field Control Panel Installation Verification Checklist | ivc/â€” (fallback) | b41be28a | 2 | 0 | 3 | 2 | PASS (per-panel matrices â†’ panel-column grids; zero items; residual project data excluded) |
| 43 | Pneumatic Control Panel Installation Verification Checklist | ivc/â€” (fallback) | 4a0cf177 | 2 | 0 | 2 | 2 | PASS |
| 44 | Control Points List Verification Checklist | ivc/â€” (fallback) | 493e858a | 2 | 0 | 2 | 2 | PASS (points-list schedule; source provides 2 blank rows; residual project data excluded) |
| 45 | Point-to-Point Verification Checklist | ivc/â€” (fallback) | ee6d4453 | 1 | 0 | 1 | 2 | PASS (USED PROJECT FILE as master â€” tech name + client project + real point rows all excluded, structure only; zero-item per Drainage precedent as anticipated) |
| 46 | Operator's Workstation Installation Verification Checklist | ivc/â€” (fallback) | 008cac64 | 2 | 0 | 2 | 2 | PASS (Specified/Installed component table â†’ two-column grid) |
| 47 | Building System Integration Verification Checklist | ivc/â€” (fallback) | 14ba6c9d | 1 | 0 | 1 | 2 | PASS (pure integration schedule; residual project data excluded) |
| 48 | Smoke Management System Verification Checklist | ivc/â€” (fallback) | 88c864b5 | 1 | 10 | 0 | 2 | PASS |
| 49 | Chilled Water System Verification Checklist | ivc/â€” (fallback) | 66d6bd24 | 1 | 18 | 0 | 2 | PASS (loop-position duplicate bank declared + kept; residual project data excluded) |
| 50 | Hot Water Heating System Verification Checklist | ivc/â€” (fallback) | 5b06d22a | 1 | 14 | 0 | 2 | PASS |
| 51 | Low Voltage Power Circuit Breaker Installation Verification Checklist | ivc/â€” (fallback) | d8000198 | 3 | 16 | 4 | 2 | PASS (first Elec/NETA-family form: paired-label nameplate blocks â†’ grids; asterisk footnote carried as item hint) |
| 52 | Low Voltage Cable Installation Verification Checklist | ivc/â€” (fallback) | 9f8100b7 | 4 | 5 | 4 | 2 | PASS |
| 53 | Capacitor Installation Verification Checklist | ivc/â€” (fallback) | 227a7dbb | 4 | 7 | 4 | 2 | PASS (residual project data excluded) |
| 54 | Circuit Switcher Installation Verification Checklist | ivc/â€” (fallback) | e31ae5da | 3 | 13 | 2 | 2 | PASS (residual project data excluded) |
| 55 | Current Transformer Installation Verification Checklist | ivc/â€” (fallback) | 12e7ef0b | 4 | 6 | 3 | 2 | PASS (three per-CT test banks â†’ CT 1â€“3 grid columns; residual project data excluded) |
| 56 | Dry Type Reactor Installation Verification Checklist | ivc/â€” (fallback) | ac92d095 | 4 | 6 | 5 | 2 | PASS (CT-form copy artifact in item label cleaned+logged; residual project data excluded) |
| 57 | Flooded Lead-Acid Battery Installation Verification Checklist | ivc/â€” (fallback) | f046ebb8 | 3 | 12 | 2 | 2 | PASS |
| 58 | Fall of Potential Ground Resistance Verification Checklist | ivc/â€” (fallback) | 16aaf137 | 2 | 0 | 2 | 2 | PASS (zero-item measurement form) |
| 59 | Insulated Molded Case Circuit Breaker Installation Verification Checklist | ivc/â€” (fallback) | 3923fc01 | 3 | 12 | 4 | 2 | PASS |
| 60 | Liquid Filled Reactor Installation Verification Checklist | ivc/â€” (fallback) | 3e1a9588 | 4 | 9 | 4 | 2 | PASS |
| 61 | Low Voltage Air Switch Installation Verification Checklist | ivc/â€” (fallback) | 5515a0ff | 3 | 17 | 3 | 2 | PASS |

**Excluded (Batch 9a):** Clamp_On_Grounding_Resistance.xlsx â€” sheet reads "SHEET
INTENTIONALLY LEFT BLANK FOR INDIVIDUAL TO POPULATE AS NEEDED"; intentionally blank
master, nothing to extract (exclusion, not quarantine). Residual project data also
present in it.

| 62 | Low Voltage Surge Arrester Installation Verification Checklist | ivc/â€” (fallback) | aa35f6e0 | 4 | 7 | 4 | 2 | PASS (Batch 9b PILOT â€” passed first audit) |
| 63 | Medium/High Voltage Surge Arrester Installation Verification Checklist | ivc/â€” (fallback) | 259d8bbe | 4 | 8 | 4 | 2 | PASS |
| 64 | Medium/High Voltage Cable Installation Verification Checklist | ivc/â€” (fallback) | 7ea6e750 | 4 | 11 | 4 | 2 | PASS |
| 65 | Medium/High Voltage Oil Circuit Breaker Installation Verification Checklist | ivc/â€” (fallback) | c9550ba1 | 3 | 12 | 4 | 2 | PASS |

**Excluded (Batch 9b):** Motor_Stator.xlsx â€” second intentionally-blank master
("SHEET INTENTIONALLY LEFT BLANKâ€¦"), nothing to extract.

## Duplication rulings â€” consistency note (Tony, 2026-07-20)

Two source-duplication cases, two rulings, one principle: **duplicates are kept when
something real distinguishes them, deduped when nothing does.** The RTU's Supply
Fan(s) and Return/Exhaust Fan sections are verbatim-identical item lists but check
different fans â€” kept. The Exhaust Fan workbook's second damper bank repeated the
same checks against the same NO. 1â€“3 columns with no distinguisher â€” deduped (logged
skip). Apply this test to future duplicate blocks.

## Source defects pending upstream answers

- **VFD footnotes (form 25):** items reference "footnote 1" / "footnote 2 & 3" but the
  FOOTNOTES block is empty in the master â€” logged as a source defect. Tony is asking
  Peiman whether the original footnote text survives; if it does, that template gets a
  hint-enrichment pass, otherwise it stands as seeded.

## Quarantine list

| Form | Reason |
|---|---|
| ~~Pump.xlsx~~ | RESOLVED by ruling 2026-07-20: fragments are wrapped-label continuations, merged upward with logged reconstruction (FD Boiler phrasing as reference). Seeded as form 10. Harness now enforces the merge-upward rule (merged_rows + no-bare-fragment checks). |
| ~~Exhaust_Fans.xlsx~~ | RESOLVED: approved and seeded as form 21. Ratified precedents from this review: (a) per-damper/per-component check matrices extract as grids â€” grid-cell checks not auto-creating findings is an accepted known semantic edge, not a defect; (b) Start-Up items appearing on the Static Verification sheet itself are kept (MAU/EF pattern) â€” faithful to source over sheet-name purism. |

Supporting evidence for the Pump quarantine, found later in the batch: the FD Boiler
sheet spells the same checks in full ("INSTALLED AS PER DRAWINGS AND SPECIFICATIONS" /
"â€¦MANUFACTURER'S RECOMMENDATIONS"), suggesting Pump's R22/R23/R28/R30 are truncated
variants of those â€” but confirmation is Tony's call, not an extraction guess.

Source-quality observations (no action taken): Cooling_Towers master carries residual
project data in its identity rows (used copy, excluded via skip); Natural_Draft_Boiler
component data duplicates EWT/LWT pairs verbatim (retained).

## ZZ-TEST fixtures added for the campaign

TEST-FC-1/2 (fcu), TEST-B-1/2 (boiler), TEST-CH-1/2 (chiller), TEST-CT-1/2
(cooling_tower), TEST-VAV-1/2 + TEST-CAV-1/2 (no key â€” basic-fallback types).
| 66 | Medium Voltage Metal Enclosed Switch Installation Verification Checklist | ivc/- (fallback) | f9266762 | 4 | 18 | 7 | 2 | PASS (test package -> phase-column grids) |
| 67 | Medium Voltage Oil Switch Installation Verification Checklist | ivc/- (fallback) | 9613aa35 | 4 | 14 | 7 | 2 | PASS |
| 68 | Valve Regulated Lead-Acid Battery Installation Verification Checklist | ivc/- (fallback) | d9085944 | 3 | 12 | 2 | 2 | PASS (filename says Value Regulated; named Valve Regulated, noted) |
| 69 | Voltage Transformer Installation Verification Checklist | ivc/- (fallback) | 76f7ad47 | 3 | 10 | 4 | 2 | PASS |
| 70 | SF6 Circuit Breaker Installation Verification Checklist | ivc/- (fallback) | 25cbd80d | 3 | 15 | 2 | 2 | PASS |
| 71 | Outdoor Bus Structure Installation Verification Checklist | ivc/- (fallback) | 8c257202 | 4 | 5 | 5 | 2 | PASS |

| 72 | Medium Voltage SF6 Switch Installation Verification Checklist | ivc/- (fallback) | 5f9cde17 | 4 | 15 | 7 | 2 | PASS |
| 73 | Medium Voltage Vacuum Switch Installation Verification Checklist | ivc/- (fallback) | ad9a62e0 | 4 | 14 | 7 | 2 | PASS |
| 74 | Medium Voltage Vacuum Circuit Breaker Installation Verification Checklist | ivc/- (fallback) | 3602cd19 | 4 | 12 | 8 | 2 | PASS (contact-measurement region -> three grids) |
| 75 | Medium Voltage Motor Starter Installation Verification Checklist | ivc/- (fallback) | 48f8e89b | 5 | 15 | 8 | 2 | PASS |

| 76 | Metal Enclosed Busway Installation Verification Checklist | ivc/- (fallback) | 5cd3f4c7 | 4 | 10 | 5 | 2 | PASS |
| 77 | Overcurrent Relay Installation Verification Checklist | ivc/- (fallback) | 75d57358 | 4 | 18 | 4 | 2 | PASS (paired two-column checklist -> two item sections; relay test tables -> grids) |

| 78 | Three Phase Dry Type Transformer Installation Verification Checklist | ivc/- (fallback) | 8beb1be7 | 4 | 7 | 3 | 2 | PASS |
| 79 | Three Phase Liquid Filled Transformer Installation Verification Checklist | ivc/- (fallback) | 491bf2ac | 4 | 11 | 3 | 2 | PASS |

| 80 | Switchgear and Switchboard Assembly Installation Verification Checklist | ivc/- (fallback) | c0e257bb | 3 | 18 | 2 | 2 | PASS |
| 81 | Medium/High Voltage Open Air Switch Installation Verification Checklist | ivc/- (fallback) | 23dac612 | 4 | 17 | 7 | 2 | PASS |
| 82 | Synchronous Motor Installation Verification Checklist | ivc/- (fallback) | 31845ea6 | 4 | 0 | 8 | 2 | PASS (zero-item motor test form; dielectric-absorption tables as 17-row grids; CSA-as-certification-mark kept out of labels to honour the branding sweep; residual project data excluded) |

**Elec directory (1.2) COMPLETE:** 33 files = 31 seeded (forms 51-82 incl. the
Batch-8 LVCB) + 2 intentionally-blank exclusions (Clamp_On_Grounding_Resistance,
Motor_Stator).
| 83 | Architectural Field Review â€” Below Grade â€” Below-grade deck systems Verification Checklist | ivc/- (fallback) | 2c4c2eec | 3 | 26 | 1 | 2 | PASS |
| 84 | Architectural Field Review â€” Below Grade â€” Crawl spaces Verification Checklist | ivc/- (fallback) | 649a2c6e | 4 | 39 | 1 | 2 | PASS |
| 85 | Architectural Field Review â€” Below Grade â€” Perimeter drainage Verification Checklist | ivc/- (fallback) | c30478a6 | 3 | 26 | 1 | 2 | PASS |
| 86 | Architectural Field Review â€” Below Grade â€” Slabs-on grade Verification Checklist | ivc/- (fallback) | ce596f44 | 3 | 26 | 1 | 2 | PASS |
| 87 | Architectural Field Review â€” Below Grade â€” Wall systems Verification Checklist | ivc/- (fallback) | d373e1af | 12 | 143 | 1 | 2 | PASS |
| 88 | Architectural Field Review â€” Common Interior â€” Acoustic barriers Verification Checklist | ivc/- (fallback) | 59886b93 | 2 | 13 | 1 | 2 | PASS |
| 89 | Architectural Field Review â€” Common Interior â€” Active coatings Verification Checklist | ivc/- (fallback) | 8f241e7a | 2 | 13 | 1 | 2 | PASS |
| 90 | Architectural Field Review â€” Common Interior â€” Finishes Verification Checklist | ivc/- (fallback) | a849743c | 2 | 13 | 1 | 2 | PASS |
| 91 | Architectural Field Review â€” Common Interior â€” Glazing Verification Checklist | ivc/- (fallback) | 1d5d4752 | 2 | 13 | 1 | 2 | PASS |
| 92 | Architectural Field Review â€” Common Interior â€” Insulation Verification Checklist | ivc/- (fallback) | e6f84b29 | 2 | 13 | 1 | 2 | PASS |
| 93 | Architectural Field Review â€” Common Interior â€” Joints, junctions, interfaces Verification Checklist | ivc/- (fallback) | 0f1eae69 | 8 | 91 | 1 | 2 | PASS |
| 94 | Elevator Installation Verification Checklist | ivc/- (fallback) | 562830f6 | 2 | 2 | 1 | 2 | PASS |
| 95 | Escalator Installation Verification Checklist | ivc/- (fallback) | 29fd3736 | 2 | 2 | 1 | 2 | PASS |
| 96 | Architectural Field Review â€” Exterior Wall â€” Active/passive shading devices Verification Checklist | ivc/- (fallback) | dc9752fa | 7 | 78 | 1 | 2 | PASS |
| 97 | Architectural Field Review â€” Exterior Wall â€” Back-up walls Verification Checklist | ivc/- (fallback) | 80f8bc5c | 6 | 65 | 1 | 2 | PASS |
| 98 | Architectural Field Review â€” Exterior Wall â€” Cladding Verification Checklist | ivc/- (fallback) | abbc81e5 | 11 | 130 | 1 | 2 | PASS |
| 99 | Architectural Field Review â€” Exterior Wall â€” Fenestration Verification Checklist | ivc/- (fallback) | 9b2f1e65 | 11 | 130 | 1 | 2 | PASS |
| 100 | Architectural Field Review â€” Exterior Wall â€” Interior finishes affecting wall performance Verification Checklist | ivc/- (fallback) | 78ae7fb4 | 6 | 65 | 1 | 2 | PASS |
| 101 | Architectural Field Review â€” Exterior Wall â€” Opaque Walls Verification Checklist | ivc/- (fallback) | 6fbe54b6 | 12 | 143 | 1 | 2 | PASS |
| 102 | Architectural Field Review â€” Floor Ceiling â€” Access floors Verification Checklist | ivc/- (fallback) | 7b8f9dcc | 2 | 13 | 1 | 2 | PASS |
| 103 | Architectural Field Review â€” Floor Ceiling â€” Ballasts Verification Checklist | ivc/- (fallback) | e3b34876 | 2 | 13 | 1 | 2 | PASS |
| 104 | Architectural Field Review â€” Floor Ceiling â€” Membranes Verification Checklist | ivc/- (fallback) | 4c982c7d | 2 | 13 | 1 | 2 | PASS |
| 105 | Architectural Field Review â€” Floor Ceiling â€” Penetrations Verification Checklist | ivc/- (fallback) | 8bf0021d | 2 | 13 | 1 | 2 | PASS |
| 106 | Architectural Field Review â€” Floor Ceiling â€” Protective coatings Verification Checklist | ivc/- (fallback) | 867c9fb3 | 2 | 13 | 1 | 2 | PASS |
| 107 | Architectural Field Review â€” Interior Walls â€” Active/passive shading devices Verification Checklist | ivc/- (fallback) | 46c893d4 | 2 | 13 | 1 | 2 | PASS |
| 108 | Architectural Field Review â€” Interior Walls â€” Cladding Verification Checklist | ivc/- (fallback) | d85e2f70 | 2 | 13 | 1 | 2 | PASS |
| 109 | Architectural Field Review â€” Interior Walls â€” Fenestration Verification Checklist | ivc/- (fallback) | 48c69486 | 2 | 13 | 1 | 2 | PASS |
| 110 | Architectural Field Review â€” Interior Walls â€” Interior finishes affecting wall performance Verification Checklist | ivc/- (fallback) | bb5ee276 | 2 | 13 | 1 | 2 | PASS |
| 111 | Architectural Field Review â€” Interior Walls â€” Opaque walls Verification Checklist | ivc/- (fallback) | 9d5d297e | 2 | 13 | 1 | 2 | PASS |
| 112 | Architectural Field Review â€” Roof â€” EPDM Verification Checklist | ivc/- (fallback) | 4144c871 | 7 | 78 | 1 | 2 | PASS |
| 113 | Architectural Field Review â€” Roof â€” Inverted Verification Checklist | ivc/- (fallback) | 9d6ee692 | 8 | 91 | 1 | 2 | PASS |
| 114 | Architectural Field Review â€” Roof â€” Penetrations Verification Checklist | ivc/- (fallback) | 2bd9e26c | 8 | 91 | 1 | 2 | PASS |
| 115 | Architectural Field Review â€” Roof â€” Walkways Verification Checklist | ivc/- (fallback) | c67df14b | 4 | 39 | 1 | 2 | PASS |

**Arch directory (1.3) COMPLETE:** 37 files = 33 seeded (forms 83-115: 31 AFRC
family via parser-driven generator + Elevator + Escalator) + 4 exclusions
(Roof Four_ply / Green_Roof / Mod_bit / Two_ply - empty Static Verification
sheets, blank-master precedent). Residuals excluded from Elevator + a36 flagged.

**EXCEL CANON COMPLETE: 115 templates seeded across Mech (51), Elec (31), Arch (33).**
| 116 | Supply Fan Installation Verification Checklist | ivc/fan | 7c69200e | 7 | 49 | 7 | 6 | PASS (WORD PILOT - calibration #2 approved; R23/R24 ratified) |
| 117 | Air Dryer Installation Verification Checklist | ivc/- (fallback) | 4ff22425 | 2 | 7 | 1 | 0 | PASS (source prints no signoff block - faithfully zero; duplicate master under Compressed Air seeded once) |
| 118 | Liquid Cooled Packaged A/C Unit Installation Verification Checklist | ivc/- (fallback) | 49a64544 | 2 | 6 | 1 | 6 | PASS |
| 119 | Air Cooled Packaged A/C Unit Installation Verification Checklist | ivc/- (fallback) | 288623e4 | 2 | 7 | 1 | 6 | PASS |
| 120 | Flow Measuring Station Verification Checklist | ivc/- (fallback) | 148a93e7 | 1 | 0 | 1 | 6 | PASS (zero-item schedule) |
| 121 | Water Cooled DE Refrigeration Unit Installation Verification Checklist | ivc/- (fallback) | 4b482af3 | 2 | 14 | 1 | 6 | PASS |
| 122 | Fire Damper Installation Verification Checklist | ivc/- (fallback) | 94ab4c65 | 1 | 0 | 6 | 6 | PASS (six numbered banks No.1-36 all kept as grids) |
| 123 | Compartment Unit Installation Verification Checklist | ivc/- (fallback) | 0fd142ef | 8 | 80 | 10 | 6 | PASS (compound: 6 component grids + fire-damper/CAV/reheat matrices) |

| 124 | Make Up Air Unit Installation Verification Checklist | ivc/ahu | ec6253d5 | 11 | 120 | 14 | 6 | PASS (largest Word compound; ahu via MAU-family ruling; coil bank duplication declared+kept) |
| 125 | Air Compressor Installation Verification Checklist | ivc/- (fallback) | d543b1a3 | 2 | 15 | 1 | 6 | PASS (Motor Voltage source dup retained; Fixtures-folder duplicate master excluded per R19) |
| 126 | Gas/Fluid Distribution Verification Checklist | ivc/- (fallback) | aa75ecce | 1 | 7 | 0 | 6 | PASS (identical master under 08 Specialty seeded once per R19) |
| 127 | Regulating Station Installation Verification Checklist | ivc/- (fallback) | 1f734a0e | 2 | 6 | 1 | 6 | PASS (screened: distinct from Excel plumbing PRS) |
| 128 | Gas Storage Tank Installation Verification Checklist | ivc/- (fallback) | 1789c6cf | 1 | 32 | 0 | 6 | PASS |
| 129 | Gas Supply Station Installation Verification Checklist | ivc/- (fallback) | 6ae19027 | 1 | 11 | 0 | 6 | PASS |
| 130 | Gas Fixture Installation Verification Checklist | ivc/- (fallback) | 8c3c5b22 | 1 | 0 | 1 | 6 | PASS (zero-item schedule) |
| 131 | Hydraulic Fixture Installation Verification Checklist | ivc/- (fallback) | 6f750f31 | 1 | 0 | 1 | 6 | PASS (zero-item schedule) |
| 132 | Communication System Installation Verification Checklist | ivc/- (fallback) | eba4da53 | 1 | 0 | 1 | 6 | PASS (45-row component grid) |
| 133 | Egress System Verification Checklist | ivc/- (fallback) | 506fa3e2 | 1 | 11 | 0 | 6 | PASS (Life Safety categories) |
| 134 | Fire Extinguisher Verification Checklist | ivc/- (fallback) | 2df2ecca | 1 | 0 | 1 | 6 | PASS (per-unit matrix; capacity banks merged) |
| 135 | Fire Alarm System Installation Verification Checklist | ivc/- (fallback) | c714602e | 1 | 0 | 14 | 6 | PASS (14 component grids; Annunicator typo cleaned) |
| 136 | Fire Pump Installation Verification Checklist | ivc/- (fallback) | 7dd1dbdf | 2 | 9 | 1 | 6 | PASS (screened distinct from Excel Pump) |
| 137 | Fire Hose Cabinet Verification Checklist | ivc/- (fallback) | 383bacf0 | 1 | 0 | 1 | 6 | PASS |
| 138 | Preaction Valve Station Installation Verification Checklist | ivc/- (fallback) | e89b8706 | 2 | 11 | 1 | 6 | PASS |
| 139 | Fire and Smoke Separation Verification Checklist | ivc/- (fallback) | ddbc3652 | 1 | 0 | 1 | 6 | PASS (per-room matrix; MS/DE/NA legend noted) |
| 140 | Sprinkler Piping System Verification Checklist | ivc/- (fallback) | ecb6ebcb | 1 | 0 | 1 | 6 | PASS |
| 141 | Standpipe System Installation Verification Checklist | ivc/- (fallback) | 7dc9949c | 2 | 10 | 1 | 6 | PASS |
| 142 | Water Supply Systems Overview Verification Checklist | ivc/- (fallback) | 62af0649 | 8 | 25 | 0 | 6 | PASS (Resevoir typo cleaned) |
| 143 | Air Handling Unit Controls Verification Checklist | ivc/- (fallback) | 7d3927a3 | 2 | 13 | 0 | 6 | PASS |
| 144 | CCS Alarm Printer Verification Checklist | ivc/- (fallback) | 292f9797 | 2 | 7 | 1 | 6 | PASS |
| 145 | Chilled Water Controls Verification Checklist | ivc/- (fallback) | c540b69a | 2 | 16 | 0 | 6 | PASS (per-unit fill-ins retained) |
| 146 | Building Control Field Panel Verification Checklist | ivc/- (fallback) | 9fb023b0 | 2 | 9 | 1 | 6 | PASS (screened distinct from Excel DDC/Pneumatic panels) |
| 147 | Control System Software Verification Checklist | ivc/- (fallback) | 574d406f | 1 | 16 | 0 | 6 | PASS |
| 148 | Emergency Power Control System Verification Checklist | ivc/- (fallback) | 6fafcb43 | 1 | 21 | 0 | 6 | PASS (hospital staged sequence; Life Safety categories) |
| 149 | Hot Water Heating System Controls Verification Checklist | ivc/- (fallback) | 5a9fe4b6 | 3 | 13 | 0 | 6 | PASS |
| 150 | CCS Modem Verification Checklist | ivc/- (fallback) | 8b447d8d | 2 | 11 | 1 | 6 | PASS |
| 151 | CCS Report Printer Verification Checklist | ivc/- (fallback) | 02cf8e23 | 2 | 9 | 1 | 6 | PASS |
| 152 | Sound System Verification Checklist | ivc/- (fallback) | 26e75192 | 2 | 3 | 1 | 1 | PASS (V7 family pilot - first-pass; compound sub-attribute cells kept whole; single Inspected By signoff per R23) |
| 153 | Cable Television System Verification Checklist | ivc/- (fallback) | 3b3850af | 2 | 4 | 1 | 1 | PASS |
| 154 | Clock and Program Equipment Verification Checklist | ivc/- (fallback) | e3cb0b8b | 2 | 5 | 1 | 1 | PASS |
| 155 | Intercommunication System Verification Checklist | ivc/- (fallback) | 9fc47ad2 | 1 | 0 | 1 | 1 | PASS (zero-item) |
| 156 | Medical Dictation System Verification Checklist | ivc/- (fallback) | 8c72dc74 | 2 | 3 | 1 | 1 | PASS |
| 157 | Pocket Paging System Verification Checklist | ivc/- (fallback) | 0eec15da | 2 | 3 | 1 | 1 | PASS |
| 158 | Public Address System Verification Checklist | ivc/- (fallback) | ec0153ae | 2 | 3 | 1 | 1 | PASS |
| 159 | Sound Masking System Verification Checklist | ivc/- (fallback) | 4e0063c0 | 2 | 3 | 1 | 1 | PASS |
| 160 | Telemetry System Verification Checklist | ivc/- (fallback) | 06b74e3b | 2 | 3 | 1 | 1 | PASS (TELEMTERY title typo in skipped row, noted) |
| 161-178 | 2.5 Electrical set (Exit Sign bb317421, Emerg Lighting Battery 1d13a3f1, Lightning Rods a93f3f6e, Direct Wired Circuits c234e29b, Exterior Lighting da767390, Ground Fault Relay 15537f3c, Solid State Relays f068f110, LV Relay System 89989e96, Meters/Relays/IDR a92a3917, Transformer Indication Meter eb144f8d, Interior Lighting db1bcaae, Motor Testing 731967dc, Motor Verification 51f21e0b, Motor Order Form 3a77dd72, Transformer Summary a9aa6a86, Power/Panel Boards 26715b79, Transducers 047c9024, Central Battery System b6187ed2) | ivc/- | - | - | - | - | 6 | 18/18 PASS (17 first-pass; 3 small skip/dup fixes + CATV V7 Note-item R25 correction) |
| 179 | Essential Power Diesel Generator Installation Verification Checklist | ivc/generator | db9baffc | 5 | 23 | 4 | 6 | PASS (generator ruled key; duplicate master folder seeded once per R19; DEISEL banner typo noted) |
| 180 | UPS and Central Battery Systems Verification Checklist | ivc/- (fallback) | 584209d4 | 2 | 51 | 5 | 6 | PASS (six same-titled banks merged; cross-bank duplicate checks declared; Inperative/Tine typos cleaned) |

## CAMPAIGN COMPLETE - 2026-07-21

**Final register: 180 CSA IVC templates** (+2 pre-campaign = 182 total in DB).
Word-only sweep: forms 116-180 (65 forms) across 2.1 HVAC/Compressed Air/
Specialty (16), 2.3 Fire Protection (11), 2.4 BAS (9), V7 comm systems (9),
2.5 Electrical (20). 2.2 Plumbing contributed zero (all Excel-covered).

*(Correction 2026-07-22 — the "+2 pre-campaign = 182" line above miscounts: the two
pre-campaign templates were ONE ivc (A/C / Fan Coil / Heat Pump) and ONE pfc (AHU
Prefunctional). The ivc register is therefore 181 (180 campaign + 1), and the full
DB register is 238 = 181 ivc + 57 pfc, matching PFC-SEEDING-LOG. The campaign's own
count of 180 is unaffected.)*
