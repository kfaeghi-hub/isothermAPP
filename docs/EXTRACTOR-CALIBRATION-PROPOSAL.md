# EXTRACTOR-CALIBRATION-PROPOSAL.md — diagnosis, fixes, and the numbers

**Status: AS-BUILT 2026-08-04.** Phase 1 diagnosis and Phase 2/2b fixes shipped.
The record of what was broken, what was measured, and what remains.

Corpus: four real TDSB drawing sets, 93 pages, read-only from ShareSync into
gitignored `samples/calibration/`. See
[`samples/calibration/FIXTURES.md`](../samples/calibration/FIXTURES.md) for the
manifest — what each fixture contains, what each page exercises, and what the
corpus deliberately does **not** cover.

---

## Phase 1 — the taxonomy, before any fix

The field report was *"the equipment extractor can't extract anything."* It was
literally true, and the cause was one line.

| Layer | Class | Evidence |
|---|---|---|
| **A** | **The finder→extraction seam** | `api/intake.ts` derived the media type from `intake_uploads.filename`: `split('.').pop()`. The finder names uploads `"…-IFT.pdf — page 7 (M-301)"` → `"pdf — page 7 (m-301)"` → no match → **400**. **Every confirmed page, every set, since the feature shipped.** |
| **B** | Finder over-proposes | Clairlea 24/55, West Humber 14/19, Workman 9/18 |
| **C** | Dense pages fail | Clairlea p17 (88 units, 4 tables) — 504 at 60s |
| **D** | Rotation ignored | Workman p1–10 `/Rotate 270`, 517 of 571 glyphs rotated; column detection bucketed the PDF x-axis, which runs *down* such a page |
| **E** | No text layer | Clairlea p30–55 (26 pages), Workman M-301 |
| **F** | Tiny fonts | Clairlea p24 — 2,072 of 2,443 items below 5pt |
| **G** | Vocabulary gap | `UNIT VENTILATOR` returned unresolved at 0.55 |

**Per-set, before:**

| Set | Pages | Scanned | Proposed | Extract reached | Rows |
|---|---|---|---|---|---|
| Workman IFT | 18 | 0 | 9 | **0** | **0** |
| Workman M-301 | 1 | 1 | 0 | **0** | **0** |
| Clairlea Tender | 55 | 26 | 24 | **0** | **0** |
| West Humber | 19 | 0 | 14 | **0** | **0** |

Layer A masked everything below it. Isolating it (a well-formed filename) showed
extraction was largely *working*: Workman p7 → 6 rows across four tables;
Clairlea p16 → 7 rows across six schedules.

---

## Phase 2 — fixes by class

**A — the bytes decide.** `intake_uploads.media_type` recorded at creation from
the object's leading bytes; the endpoint re-sniffs the **stored object** and its
reading is authoritative; the extension→media map deleted; refusals carry the
evidence (recorded type + actual bytes). Swept the codebase: one real violation,
two benign (client routing at file-pick, now content-sniffed; a cosmetic storage
suffix). **R18 — filenames lie — was our own rule, broken by our own code.**

**D — rotation-aware, and inert.** Column detection buckets along the true
horizontal per `/Rotate`. Changed the measurement on exactly the 10 rotated pages
(Workman p6 59→23, Clairlea p28 69→29); **flipped zero verdicts**, because the
`>= 6` threshold was the binding constraint. Correct fix, no effect here.

**B — the header row decides.** Density cannot separate a schedule from a plan:
Clairlea p4 is a *plan* with 142 column runs, p17 a real schedule with 147. A
schedule has a **header row** — an identity column (TAG/MARK/UNIT/EQUIPMENT ID)
with two or more descriptive columns beside it within a short run of text items,
because a header row is contiguous in reading order and a plan's stray words are
not. Title alone no longer claims a page: a TDSB title sheet carries a drawing
list, and plan sheets say "as per schedule" in notes.

**C → 2b — table-region splitting.** `maxDuration` 60→300 proved the failure was
*budget*, not time: p17 logged `outcome: truncated`, `max_tokens` 16,000,
`output_tokens` 16,000 exactly, **10,684 of them thinking** — ~5,300 left for 88
rows of JSON. 27¢ for nothing. Row ceilings rejected. **The first splitting
attempt also failed and is recorded:** spatial gap-clustering fragmented p17 into
318 pieces (largest table ~416 items, biggest cluster 143) — gap clustering is
wrong for a CAD sheet where ruled borders are graphics. What works is segmenting
on **header rows in reading order**, since these PDFs emit text table by table.

**E — proven.** Workman M-301 (scanned, zero text items) returns 9 rows, 6 typed,
with honest low confidence and a page note correctly calling it a topology
drawing. The image leg engages.

**G — minted.** `unit_ventilator`, base-only, through the ratified path.

---

## The numbers — same four sets, before and after

**Finder:**

| Set | Pages | Before | After | The survivors |
|---|---|---|---|---|
| Workman IFT | 18 | 9 | **3** | 7, 11, 12 |
| Workman M-301 | 1 | 0 | 0 | (scanned) |
| Clairlea Tender | 55 | 24 | **4** | 16, 17, 21, 22 |
| West Humber | 19 | 14 | **2** | 7, 12 |
| **Total** | **93** | **47** | **9** | |

**Extraction:**

| Page | Before | After |
|---|---|---|
| Workman p7 — 4 tables, rotated | 400 | **6 rows, 6 typed** |
| Workman p12 — single table | 400 | 4 rows |
| Clairlea p16 — 6 schedules | 400 | **11 rows, 10 typed** |
| Clairlea p17 — 88 units | 400 → truncated at 27¢ | region-split; gate result below |
| Clairlea p31 — scanned plan | 400 | 0 rows, correctly identified |
| Workman M-301 — scanned | 400 | **9 rows, 6 typed** |

**Region detection:** p17 → its four tables (WALL FINS 510 items, FORCED FLOW
HEATERS 158, CONVECTORS 380, WALL FINS 352). p16 → its six schedules. p12 → none,
correctly: one table is the page.

---

## Open, named rather than assumed

- **Workman p7 splits 2 of 4.** Its BOILERS and EXPANSION TANK headers use a
  `QTY NO.` shape the identity-column pattern does not match. The page still
  extracts whole and returns all 6 rows, so this costs nothing today — but the
  splitter is not yet general across consultants.
- **No scanned page carrying a schedule** exists in the corpus. The image leg is
  proven to engage and return rows; it is **not** proven to read a table from a
  scan.
- **Two-page continuation** is named in the sorter's contract and absent here.
- **F (tiny fonts)** parked pending evidence from p24 once reachable.
- **Clairlea now has 51 undecided pages** against a 40-page sort ceiling —
  addressed by chunked continuation, not a raise.
