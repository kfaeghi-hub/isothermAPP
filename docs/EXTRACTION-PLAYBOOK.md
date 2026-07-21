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
| R20 | **Schedule tables → numbered-row grids** — blank fill-in schedule tables (Equipment No./Fixture Location/Spec/Shop/Installed) become a grid with the schedule columns and numbered blank rows; a pure-schedule form may have zero items. Pagination repeats of the same schedule merge into one grid. | Batch 7 |
| R21 | **Contaminated masters: flag-and-proceed** — used/filled source files keep extracting, structure-only: identity/residual skips exclude ALL filled data (client, project, technician, live values); nothing reaches the seed; one summary line per residual for Tony's later ShareSync cleanup. Contamination alone is never a skip/quarantine reason. Files containing a person's name get an explicit privacy flag — still proceed. | Tony ruling 2026-07-21 |
| R22 | **Standard marks are data** — certification/standard acronyms appearing as field CONTENT (CSA/UL listing marks on a nameplate, code references in a check) are recorded as grid-cell/comment values, never in labels — the branding sweep stays absolute with zero exceptions. Record the option set in _extraction. | Synchronous Motor, endorsed 2026-07-21 |

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
- **Plumbing**: backflow preventors (install/certify/operate), makeup-water connections; **default trade for domestic-water equipment/system forms** (tanks, heaters, meters, fixtures, purification, drainage, tile bed — Batch 7 precedent), with C/BAS-Electrical carve-outs as usual.
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

### Batch 7 (water/plumbing, forms 30–41, 2026-07-21)

**(a) Novel source behaviors → general rules:** (1) *Blank schedule tables*
(Equipment No. | Fixture Location | Spec | Shop | Installed with empty fill-in
rows; Plumbing Fixture, Drainage) → grid with the schedule columns and numbered
blank rows (numbered-blank-row precedent). Drainage is a pure schedule → the
first zero-item template; renders fine. **New rule R20: schedule tables →
numbered-row grids; a form may have zero items.** (2) *System-level verification
sheets* (DHW/DCW: VERIFICATION ACTIVITIES + EQUIPMENT NUMBER + YES/NO/N-A) →
items; equipment references go in comments (R5 extension); YES/NO/N-A maps to
yn_nr_na directly. (3) *Trade default shift*: domestic-water forms default to
Plumbing (not Mechanical) — precedent added to §3.

**(b) Near-miss → check:** the Plumbing Fixture R54 header mixes SPECIFIED with
COMMENTS (source mislabel) — the component-counter wrongly demanded a grid.
Refined: SPECIFIED marks a component header only when COMMENTS is absent. Also an
ops failure worth recording: fixture SQL POSTed via PowerShell ConvertTo-Json
failed silently-ish and 13 templates seeded without instances (cleaned up via
safety-checked delete of instance-less templates). **Ops rules: run SQL files via
`node --env-file=.env out/run-sql.mjs <file>`; capture seeder output with
`Out-File -Encoding ascii` (BOM breaks JSON.parse); verify instance_id is non-null
before moving on.**

**(c) Judgment → code:** duplicate-bank detector added this batch (from the
Batch-1–6 retro) and immediately earned its keep — flagged fume-exhausters'
undeclared-but-correct bank on the retroactive pass (declaration added; template
unchanged).

### Batch 8 (controls/system-level + first Elec form, forms 42–51, 2026-07-21)

**(a) Novel source behaviors → general rules:** (1) *Per-panel data+check
matrices* (DDC/PCP: Field/PC Panel 1–3) → grids with panel columns for both data
rows and check rows (R13 extension; six zero-item grid-only templates this batch).
(2) *Component tables with Specified/Installed columns* (OWS) → two-column grids.
(3) *Elec/NETA family* (LVCB, precedent for the whole 1.2 directory): paired-label
nameplate blocks (two label/value pairs per row, no standard NAMEPLATE block) →
single-Recorded grids; asterisk footnotes → item hints; INSPECTED/N-A columns =
yn_nr_na. (4) A master can be a **used project file** (Point_to_Point: technician
name, client project, live point rows) — structure extracts, every content cell
skips, flag loudly for ShareSync cleanup.

**(b) Near-misses → checks:** four first-audit failures, ALL harness-inference
gaps on the new families, zero extraction errors: banner rows fuzzy-consuming
items ("TRIP UNIT NAMEPLATE" ate "Trip unit battery" — grid/section-title
banners now claim before fuzzy items), word-split labels ("SOFT WARE PROGRAM" —
despaced equality added), and panel-matrix boundary vocabulary (PANEL n / Y/N /
INSPECTED added to both boundary regexes — the vocabulary-growth sweep flagged
Y/N and INSPECTED pre-batch but the regexes weren't extended until the audit
failed: **extend the regexes when the sweep finds new words, not after**).
Reverse-trace now pools ALL text cells (paired-label layouts).

**(c) Judgment → code:** none new; the schedule-row-count judgment (how many
numbered rows a blank schedule gets) recurred 4 times (PF 8, DS 16, CP 2, PTP 36,
BSI 12) with the rule "match the source table extent" — candidate for a harness
check next batch (count blank formatted rows between header and next block).

### Batch 9a (Elec directory, forms 52–61 + 1 exclusion, 2026-07-21)

**(a) Novel behaviors → rules:** Elec forms EXTRACT their nameplate blocks (they
are breaker/cable/test data, not the register's project nameplate) — so the bare
"NAMEPLATE" banner needs an explicit skip when its block becomes a grid.
Intentionally-blank masters ("SHEET INTENTIONALLY LEFT BLANK…") are exclusions,
not quarantines. Per-unit test banks (CT 1–3) → unit columns (EF-dampers
pattern). Elec source labels are bare with units/options in adjacent cells —
extracted labels carry the qualifier ("Length (ft)").

**(b) Near-misses → checks:** 6/10 first-audit failures in two classes: missing
NAMEPLATE-banner skips (2 forms — extraction-side) and bare-vs-qualified label
matching (4 forms — harness; prefix-anchored containment added, safe against the
mid-string-swallow bug). **Regime revision adopted (see metrics): pilot-first —
run ONE form of any new family/directory through static audit BEFORE authoring
the rest.** Both failure classes would have been caught on the pilot and forms
2–10 would have passed first-time.

**(c) Judgment → code:** none new this batch; schedule-row-count check still
pending.

## 6 · Batch metrics

**What the first-pass metric measures (Tony, 2026-07-21): harness-anticipation of
new territory — NOT extraction quality.** Extraction quality is the JSON-corrections
number (0 / 0 / 2 across Batches 7–9a). A future first-pass dip triggers the
question "new family — was there a pilot?" BEFORE any alarm about the extractions.

| Batch (session) | Attempted | Passed first audit | Quarantined | Harness rules added | First-pass rate |
|---|---|---|---|---|---|
| 1 (calibration) | 1 | 1 (human-gated) | 0 | — (harness built after) | — |
| 2–4a (forms 2–9) | 10 | 6 | 2 (Pump, EF) | 3 (greedy-match, NO.N boundary, pdf.js probe) | 60% |
| 4b–5 (forms 10–20 + EF parked) | 12 | 12 | 0 | 2 (merged_rows, no-bare-fragment) | 100% |
| 6 (forms 21–29) | 9 | 8 | 0 | 1 (SUBMITTED/ACCEPTABLE boundary) | 89% |
| 7 (forms 30–41) | 12 | 11 | 0 | 2 (duplicate-bank detector; SPECIFIED+COMMENTS header refinement) | 92% |
| 8 (forms 42–51) | 10 | 6 | 0 | 4 (title-banner precedence; despaced equality; PANEL/Y-N/INSPECTED boundaries; all-cell reverse-trace) | 60% |
| 9a (forms 52–61, +1 exclusion) | 10 | 4 | 0 | 1 (prefix-anchored containment) | 40% |
| 9b (forms 62–82, +1 exclusion) | 21 | 20 | 0 | 2 (bounded prefix; composite-row match) | **95%** |

| 10 (forms 83–115, +4 exclusions) | 33 | 32 | 0 | 1 (section-title lookahead boundary) | **97%** |

### Batch 10 retrospective (2026-07-21)
**(a)** Arch AFRC family exactly as anticipated: least equipment-like of the
campaign — one uniform shape (prefilled Subject/Assembly nameplate → skip with
identity carried in template name; components grid; repeated per-component
Cx-process review block with Interim/Final acceptance gate items; Performance
Criteria → comments). Uniformity made a PARSER-DRIVEN generator the right tool —
faithful per-sheet component lists at 31-form scale. Envelope groups →
Building Envelope; interior groups → null category (process items, no single
trade); Elevator/Escalator → Vertical Transportation. Empty Static Verification
sheets (4 Roof variants) = blank-master exclusions.
**(b)** Pilot caught the one gap (component-counter ran into block headers that
REUSE component names — fixed with a title-plus-eval-header lookahead). No
misses after the pilot.
**(c)** Elevator sheet's minor source spellings (receptables/resevoir) left
verbatim as data-field names — R6 normalization is for typos in checklist
literals; field-name spellings on long nameplate lists get a lighter touch,
noted per form. Schedule-row-count check: DROPPED with reason — schedule tables
appeared in exactly two batches, the counts have never drifted post-seed, and
the reverse-trace + component-count checks already bound grid shape.

**Batch 9b verdict: the pilot-first prediction (≥90% on a piloted family) is
CONFIRMED at 95%.** The pilot passed first-time; the single miss (MHV cables) was
a prefix-rule greedy trap introduced mid-batch and fixed with composite-row
matching (retroactive clean across all 82 JSONs after both matcher changes).
Trend restored: 40% → 95% under the revised regime. Pilot-first stands as the
standing rule for every new family/directory.

### Batch 9b retrospective (2026-07-21)
**(a)** Elec long-tail patterns all ruled: per-unit test banks → unit columns;
dielectric-absorption minute tables → 17-row grids; paired two-column checklists
(OCR) → two item sections; certification-mark acronyms (CSA on a motor listing)
are DATA and stay out of labels to honour the branding sweep — record in
_extraction, values in cells. Second intentionally-blank master excluded.
**(b)** The mid-batch matcher trap (bare "CABLE" prefix-matching a long item)
shows single-candidate matching is fragile; composite-row matching (label +
same-row option cells) fixed the class. If a third greedy trap appears, replace
first-candidate matching with best-candidate scoring rather than patching again.
**(c)** Schedule-row-count check still pending (carried two batches — do it in
Batch 10 or drop it with a reason).

**Called per the regime rule: by the headline metric (92% → 60% → 40%) the loop
is NOT learning, and the regime needs revision.** The extraction-error rate tells
the opposite story (JSON changes needed: B7 0, B8 0, B9a 2 — all small skip
additions), but the metric as defined measures first-contact harness fit, and
every new family keeps paying a 1-form tax spread across the whole batch because
all forms are authored before the first audit runs. Revision adopted for Batch 9b
onward: **pilot-first** — author + static-audit ONE form per new family, fix
harness/pattern gaps, then author the rest. Prediction: Batch 9b (same NETA
family, pilot already paid) should run ≥90% first-pass; if it doesn't, escalate
to Tony with a proposed metric redefinition rather than another patch.

Retroactive flags to date: 1 (fume-exhausters undeclared duplicate bank —
declaration added, seeded template unchanged). Retroactive passes after every
harness change remain clean across all 51 JSONs.

Trend: 60% → 100% → 89% → 92% → **60%**. Read honestly: the headline metric
dipped hard in Batch 8. The split tells a different story — **extraction
first-pass was 10/10** (no JSON needed any change); all four failures were
harness-inference gaps on two brand-new structure families (panel matrices,
Elec paired-label blocks) hit in one batch. The loop's learning shows up as: the
same class of miss (boundary vocabulary) recurred from Batch 6 despite the sweep
running — because the sweep's findings weren't applied to the regexes before
extraction. Rule tightened in retro 8(b): the sweep must UPDATE the regexes, not
just observe. Watch Batch 9 (Elec directory, now-precedented family): if the
harness metric doesn't rebound above 90% on a known family, the loop is not
learning and the regime needs revision.
