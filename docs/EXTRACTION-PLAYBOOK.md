# CSA Extraction Playbook

The single canonical rulebook for the CSA IVC seeding campaign. **Every session
starts by reading this file. Every batch ends by updating it** (new patterns, new
edge cases, resolution + the general rule) **and appending a retrospective.**
Rulings here are ratified by Tony and enforced by `audit-template.mjs` where
codified. `docs/CSA-SEEDING-LOG.md` records *what* was seeded; this file records
*how to extract*.

## 1 · Ratified rulings (binding)

| # | Rule | Origin |
|---|---|---|
| R1 | **Identity skip** — contractor identity block (NAME/COMPANY/ADDRESS/CUSTOMER/PROJECT/FILE NO./DATE) and top NAMEPLATE block (+ SUPPLEMENTAL INFO) are never extracted: generator/register territory. Residual client data in these rows is excluded with them (log it; Tony cleans masters). | Calibration #1 |
| R2 | **Register-nameplate skip** — any Manufacturer/Model/Serial block with SPECIFIED / SHOP DRAWINGS / INSTALLED columns at unit level = the register's field-def structure; skip. | Calibration #1 |
| R3 | **Component sections → measurement grids** — one grid per source component section, rows = source fields in order (stable snake_case keys), single "Recorded" column. Spec/shop values live in the register, not the checklist. | Calibration #1 |
| R4 | **Evaluation rows → yn_nr_na items**, creates_finding true unless clearly informational; suggested_category from trade_types verbatim. STATUS/COMMENTS, VALUE/COMPLIES, SUBMITTED, and ACCEPTABLE column layouts are all the same item model. | Calibration #1 |
| R5 | **VALUE → comments** — source VALUE columns (and value-type rows under STATUS sections, e.g. "Nameplate head (ft)", Start-Up temps/capacities) have no item-model analog: keep as items, values go in item comments. | Calibration #1, Pump |
| R6 | **Typo/case normalization with logging** — all-caps → sentence case; obvious typos cleaned (NUMER, VALVAES, REMOVEABLE, COMPONEBTS, SENDORS, STRTUP, PRPOPERLY, INDENTIFICATION, (OC)/(EC)→(°C)); copy-paste artifacts corrected ("CAV box" on the FPB form → "Box"; artifact suffix "INSTALLED" on "Vibration & noise"). Every cleanup is logged in `_extraction.notes`. Rewording beyond typo/artifact repair is NOT allowed. | Calibration #1 + Batch 4/5 |
| R7 | **Compound rows stay whole** — e.g. "Horsepower / Voltage / No. of Phases / Full Load Amps" is one grid row. | Calibration #1 |
| R8 | **Fragment merge-upward** — orphan fragment rows (wrapped-label continuations) merge upward into their preceding partial row; never seed a fragment as an item. First-line-lost fragments reconstruct from a sibling form's full phrasing. All merges/reconstructions logged in `_extraction.merged_rows`. Harness-enforced. | Pump ruling |
| R9 | **Duplication distinguisher test** — duplicate source blocks/rows are KEPT when something real distinguishes them (RTU's two fan sections = different fans; ND Boiler's EWT/LWT pairs; MAU/Steam Boiler Start-Up re-checks) and DEDUPED (as a logged skip) when nothing does (EF's second damper bank). | EF + RTU rulings |
| R10 | **Content over sheet-name** — sheet names don't decide type; content does. "Verification Program" sheets are IVC sheets. The RTU's "RTU_Final ST" read as static verification → extracted. A sheet whose *content* is start-up-only would be excluded instead. | FD Boiler + RTU |
| R11 | **Embedded Start-Up items are kept** — Start-Up sections appearing ON the Static Verification sheet extract as sections (faithful to source over sheet-name purism). | MAU/EF ratification |
| R12 | **Unit-matrix → per-target columns** — NO.1–N / TAG-1–N column matrices over per-UNIT checks = the app's per-target item columns; extract as plain items. | HP calibration |
| R13 | **Per-component matrices → grids** — matrices over sub-components of one unit (EF's dampers No.1–3) become a grid with those columns; known accepted semantic edge: grid-cell checks don't auto-create findings (CxA logs manually). | EF ruling |
| R14 | **Value rows → grids, check rows → items (by position/role)** — identity/data rows at the top of a matrix (manufacturer/location/size/flow) → component grid (even a 1-row grid, e.g. Radiant Panel's Location); measurement rows under a Start-Up STATUS header → items per R5. A SPECIFIED-column Start-Up block → a "Start-Up Measurements" grid (HRW/FE). | VAV + RHC + HRW precedents |
| R15 | **Paginated sources merge** — repeated NAMEPLATE page-header blocks are logged skips; same-titled continuation sections/blocks merge into one section (FD Boiler, Chiller, ET, VFD, Steam Boiler, Fluid Cooler; VAV's second "Reheat Coils"). | Batch 3 |
| R16 | **Quarantine, never guess** — deviant/ambiguous structure that no rule resolves → skip the form, log the reason, continue the campaign. Rulings then convert quarantines into rules (Pump → R8, EF → R13). | Campaign charter |
| R17 | **Branding** — CSA/Z320/Z318/BCA/BCxA/IEL and firm/client names appear ONLY in revision_label/description. Isotherm identity on all output; generic signoff roles (IVC convention: "Commissioning Authority (CxA)" + "Contractor"). | Standing rule |
| R18 | **Equipment keys are ruled, never invented** — ahu (incl. RTU, Direct-Fired MAU), pump (incl. sump), fan (incl. fume exhausters), fcu (incl. split-system AC), heat_pump, chiller, cooling_tower (incl. fluid cooler), boiler (FD/ND/steam), erv (heat recovery wheel). Everything else → null → basic fallback nameplate (works; verified). | Step-1 rulings |
| R19 | **Duplicate masters** — seed the ruled master only (Heat_Exchanger-new, not Heat_Exchanger; Fan_Coils, not the startup_contractors variant). | Step-1 rulings |

## 2 · Structural patterns catalog

- **Canonical workbook**: 3 sheets — Static Verification (seed), Start-Up, "Functional Performance Testing " (often trailing space). 117/123 Mech+Elec+Arch workbooks match.
- **AHU-family layout**: component sections w/ SPECIFIED-3-col + EVALUATION w/ VALUE/COMPLIES + V/A phase rows + comments + signoff. (AHU, RTU.)
- **STATUS/COMMENTS family**: simpler two-col evaluation; may embed Start-Up sections. (Most Mech forms.)
- **Unit-matrix family**: NO.1–6 or TAG-1–6 columns. (HP, VAV, CAV, FPB, RHC, UH, CUH, RP, RAD.)
- **Paginated compound**: repeated nameplate headers + same-titled continuation blocks. (Boilers, Chiller, CT, ET, VFD, FLC, MAU, SB, SP, EF.)
- **Multi-equipment compound**: distinct sub-equipment each with own grids/sections (FE's exhauster + swing-arm motor; EF's fan + dampers; FLC's cooler + system expansion tank package).
- **Known source defects**: fragmentary wrapped labels (Pump); empty FOOTNOTES block with dangling references (VFD — pending Peiman); residual client project data in identity rows (Cooling_Towers, Cav_Box, Unit_Heaters, Cabinet_Unit_Heaters, Direct_Fired_MAU, Heat_Exchanger-new's TAG — Tony cleaning masters); copy-paste artifacts from sibling workbooks (FPB).

## 3 · Category-mapping precedents (suggested_category)

- Default for install/mechanical work: **Mechanical** (calibration precedent — not HVAC).
- **Controls/BAS**: control valves/thermostats/actuator behavior (non-energized position, spring return, modulation-to-signal), interlocks, safeties-as-controls, sequence/summer-winter/manual-auto verification, points/BAS interface, hertz/FLA drive settings, level alarms, float switches.
- **Electrical**: starters/disconnects, fused disconnects, wiring, speed switches, marine vapor-proof lights, VSDs/VFD hardware, basin/immersion heaters, essential power, drive install checks.
- **Refrigeration**: refrigerant/oil levels & sight glasses, TXV, circuiting, crankcase heater, rupture disk, refrigerant monitor, refrigeration start-up report.
- **TAB**: air/water balancing, balance reports, balance marks, measured temps/capacities/dP-across checks.
- **Plumbing**: backflow preventors (install/certify/operate), makeup-water connections.
- **Fire Protection**: fire dampers, FACP interlocks, duct smoke detectors.
- **Life Safety**: CO detector w/ calibration certificate (MAU).
- **Building Envelope**: roof-curb flashing/sealing integration (RTU).

## 4 · Pipeline (per form)

1. Dump: `node out/dump-xlsx.mjs <file> "<sheet>" > out/<x>-dump.txt`
2. Author JSON → `samples/seed-json/csa-ivc/<x>.json` (with `_extraction` skips/merges/notes)
3. Static audit: `node --env-file=.env audit-template.mjs <json>` — must PASS
4. Seed: `node --env-file=.env seed-template.mjs <json> TAG-1 TAG-2` (ZZ-TEST fixtures; create pairs if type lacks them)
5. Full audit: `... audit-template.mjs <json> --template <id> --instance <id>` — must PASS (leaves Field Copy PDF in out/)
6. Log row in CSA-SEEDING-LOG.md → commit+push
7. Batch end: playbook update + retrospective + retroactive audit (if harness changed) + metrics line

## 5 · Retrospectives

### Batches 1–6 (retroactive, written 2026-07-21)

**(a) Novel source behaviors and their general rules:** every novel behavior met in
Batches 1–6 has been converted to rules R5–R15 above (fragments, pagination,
matrices, embedded start-up, compound sheets, value-vs-check rows, duplicate
masters, deviant sheet names). Nothing remains unruled.

**(b) Near-misses revealing missing checks:** four, each now a check: fuzzy-match
greedy consumption ("TYPE" swallowing a longer item — exact-first two-tier
claiming); component counter running through NO.1–N headers (HP) and through
SUBMITTED/ACCEPTABLE headers (VFD) — boundary regex extended twice, second time
for new vocabulary the first fix should have anticipated: **when a boundary
vocabulary grows, grep the remaining canon for other header words before moving
on**; PDF text probe false-negatives (glyph/punctuation artifacts — pdf.js +
normalized/despaced compare).

**(c) Repeated judgments that became (or should become) harness rules:** fragment
handling → codified (merged_rows checks). Duplication distinguisher test —
codified as process (R9) but detection is still judgment: the harness does not yet
FLAG verbatim-duplicate item banks; adding a duplicate-bank detector is the
candidate check for Batch 7. Sentence-casing/typo logging remains judgment by
design (R6 requires human-quality phrasing).

## 6 · Batch metrics

| Batch (session) | Attempted | Passed first audit | Quarantined | Harness rules added | First-pass rate |
|---|---|---|---|---|---|
| 1 (calibration) | 1 | 1 (human-gated) | 0 | — (harness built after) | — |
| 2–4a (forms 2–9) | 10 | 6 | 2 (Pump, EF) | 3 (greedy-match, NO.N boundary, pdf.js probe) | 60% |
| 4b–5 (forms 10–20 + EF parked) | 12 | 12 | 0 | 2 (merged_rows, no-bare-fragment) | 100% |
| 6 (forms 21–29) | 9 | 8 | 0 | 1 (SUBMITTED/ACCEPTABLE boundary) | 89% |

Trend: 60% → 100% → 89%. The Batch-6 dip was a single new-vocabulary boundary miss
(VFD), not a repeat of a known failure mode; its class-level fix (sweep the canon
for boundary words when the vocabulary grows) is recorded in retro (b). Loop is
learning; watch whether Batch 7 (new discipline: plumbing) holds ≥90%.
