# Fixture manifest — the extractor calibration corpus

**This file is committed. The drawings it describes are not, and never will be.**

The PDFs live in `samples/calibration/`, which is gitignored (`.gitignore:37`).
They are working copies of client drawings pulled read-only from ShareSync. No
client content is committed, quoted at length, or left in `out/`. What is
committed is this manifest and the calibration numbers — what each fixture
contains and what each page is there to exercise.

**Skip loudly, never silently green.** A suite that cannot find a fixture must
say so by name and mark itself skipped. A green run on a corpus that was not
present is the silence class in its purest form — the check reports the same
result whether the feature works or the file is missing.

---

## Acquisition

Read-only from `C:\Users\TonyF\My ShareSync\0. TDSB Projects\…\1.Dwgs`, copied
**out** to `samples/calibration/` after `git check-ignore` confirmed the
destination. Every run is bracketed by an integrity snapshot — size, mtime and
sha256 of every file in every folder read — and the post-run sweep must report
**identical**. It did: 10 entries, unchanged, on 2026-08-04.

To rebuild the corpus on another machine, copy the four files below from the
same ShareSync paths. Nothing else is needed; the manifest carries the rest.

---

## The founding set — four fixtures, 93 pages

### `workman-IFT.pdf` — J G Workman PS, Steam Boilers Replacement 257970
*`1025032-TDSB-Workman PS Heating plant steam conversion-IFT.pdf`, 8.9 MB, 18 pages*

The field report's own set — the one a real user said "can't extract anything"
about.

| Page | Exercises |
|---|---|
| 1–10 | **Rotated sheets** — `/Rotate 270` with essentially every glyph rotated (517 of 571 items on p3). The case that made column detection rotation-aware. |
| **7** | **Multi-schedule sheet** — BOILERS, EXPANSION TANK, PUMPS, WATER SOFTNER on one page. Extraction returns 6 rows, 6 typed. |
| **12** | **Single-table page** — MECHANICAL EQUIPMENT WIRING SCHEDULE. Region detection returns 0 regions here **on purpose**: one table is the page. |
| 14, 15 | Electrical panel schedules — the *near-miss* the filter now routes to the sorter rather than claiming. |

### `workman-M301-TED.pdf` — the same project's TED sheet
*`M-301  TED.pdf`, 0.9 MB, 1 page*

| Page | Exercises |
|---|---|
| **1** | **The scanned leg.** Zero text items, 71k drawing operations — no text layer at all. This is the proof that the image path engages: post-fix it returns 9 rows, 6 typed, with honest low confidence (0.2–0.5) and a page note correctly calling it a topology drawing rather than a schedule. |

### `clairlea-tender.pdf` — Clairlea PS, Steam to Hot Water Conversion 257972
*`Clairlea PS-Tender Drawings-TR-25-0081.pdf`, 17.9 MB, 55 pages*

The hardest fixture, and the most valuable.

| Page | Exercises |
|---|---|
| **16** | **Six schedules on one sheet** — BOILERS, PUMPS, EXPANSION TANKS, UNIT HEATERS, WATER SOFTENER, UNIT VENTILATOR. Region detection finds all six. The UNIT VENTILATOR is where `unit_ventilator` came from: extracted, unresolved at 0.55, minted. |
| **17** | **The richest page in the corpus — 88 units in four tables** (WALL FINS ×2 at 32 and 18 rows, FORCED FLOW HEATERS 8, CONVECTORS 30). The page that truncated the extractor at 16,000 output tokens for 27¢ and forced table-region splitting. **This page is the Phase 2b gate.** |
| 3–13 | **Plan sheets that read as tables** — p4 is a PLAN with 142 column runs; p17 is a real schedule with 147. The pair that proves density cannot separate them. |
| 21, 22 | Lighting controls · mechanical equipment wiring — real schedules of a different shape. |
| 24 | **Tiny fonts** — 2,072 of 2,443 items below 5pt. Failure class F, parked pending evidence. |
| **30–55** | **26 scanned pages**, no text layer. Nearly half the set. Also the case that puts Clairlea over the 40-page sort ceiling — 51 undecided — which is why the ceiling gained chunked continuation instead of a raise. |

### `westhumber-DWG-ReIFT.pdf` — West Humber JMS, Boiler 267996
*`1025112-TDSB-West Humber JMS-DWG-ReIFT.pdf`, 9.0 MB, 19 pages*

A third consultant's drawing conventions, as a check that the filter is not
tuned to one office's title blocks.

| Page | Exercises |
|---|---|
| 7, 12 | The two genuine schedule sheets. |
| 1–6, 10–19 | The **regression guard**: before calibration the filter proposed 14 of 19 here. Any future change that pushes this back up is over-proposing again. |

---

## Calibration numbers — 2026-08-04

The finder, same four fixtures, before and after:

| Fixture | Pages | Proposed before | Proposed after | Correct after |
|---|---|---|---|---|
| Workman IFT | 18 | 9 | **3** | 7, 11, 12 |
| Workman M-301 | 1 | 0 | 0 | (scanned) |
| Clairlea Tender | 55 | 24 | **4** | 16, 17, 21, 22 |
| West Humber | 19 | 14 | **2** | 7, 12 |
| **Total** | **93** | **47** | **9** | |

Extraction, same pages, before and after the R18 seam fix:

| Page | Before | After |
|---|---|---|
| Workman p7 | 400 | 6 rows, 6 typed |
| Workman p12 | 400 | 4 rows |
| Clairlea p16 | 400 | 11 rows, 10 typed |
| Clairlea p17 | 400 | see the Phase 2b gate |
| Clairlea p31 | 400 | 0 rows, page correctly identified |
| Workman M-301 | 400 | 9 rows, 6 typed |

---

## What is NOT in this corpus

Named so their absence is not mistaken for coverage:

- **A scanned page that contains a schedule.** Both scanned fixtures are
  drawings. The image leg is proven to *engage and return rows*; it is not
  proven to *read a table from a scan*. Pending.
- **A schedule continued across two pages** with the title only on the first —
  named in the sorter's contract as a case it must handle, and absent here.
- **A metric-only set.** All four are Ontario mixed-unit.
- **A set from outside TDSB.** The filter is calibrated on three consultants;
  that is not the same as calibrated on the market.
