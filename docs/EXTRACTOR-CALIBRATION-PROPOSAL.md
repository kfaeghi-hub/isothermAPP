# EXTRACTOR-CALIBRATION-PROPOSAL.md — diagnosis, fixes, and the numbers

**Status: CLOSED 2026-08-05 — field test PASSED.** This document is now the
as-built record of the campaign: what was broken, what was measured, what was
ruled, and what remains named.

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

## The 2b gate — **PASSED 2026-08-04**

**Bar: all four tables, 88 rows, per-region counts matching the hand counts.
Result: 88/88, every region exact, tripwire silent. PASSED.**

### Run 3 — corrected extent + assembly tripwire

| region | items | rows | hand | out_tok | think | cost |
|---|---|---|---|---|---|---|
| WALL FINS (left) | 503 | **32** | 32 | 13,008 | 0 | 22.4¢ |
| FORCED FLOW HEATERS | 151 | **8** | 8 | 3,896 | 0 | 8.0¢ |
| CONVECTORS | 375 | **30** | 30 | 9,307 | 0 | 16.5¢ |
| WALL FINS (right) | 292 | **18** | 18 | 6,578 | 0 | 12.3¢ |

**88 / 88 · 59.3¢.** Tripwire silent — no tag appears in two regions.

Both risks flagged before the run came back clean: region 1 held at **32** under
the recomputed extent, and FFH's 151-vs-158 items produced **8** rows again, so
the trim took only whitespace. Region 4 finished inside the 8,000 first-pass
ceiling without a retry.

Cost across the three runs: **165.1¢ for 40 rows → 77.7¢ for 136 (48 phantom) →
59.3¢ for exactly 88.**

### The two runs behind it, kept because the sequence is the argument

### Run 1 — before the budget-class amendment

| region | items | rows | outcome |
|---|---|---|---|
| WALL FINS (left) | 510 | **32** | ok — exact to the hand count |
| FORCED FLOW HEATERS | 158 | **8** | ok — exact to the hand count |
| CONVECTORS | 380 | 0 | truncated (5,396 thinking tokens) |
| WALL FINS (right) | 352 | 0 | truncated (4,267 thinking tokens) |

40 of 88 rows, 165.1¢. Failure did not follow size — the largest table succeeded
and a smaller one died — which is what identified thinking spend, not workload,
as the variable.

### Run 2 — thinking disabled (`CLASS_THINKING.extraction = 'off'`)

| region | items | rows | out_tok | **think** | cost |
|---|---|---|---|---|---|
| WALL FINS (left) | 510 | **32** | 12,800 | **0** | 22.2¢ |
| FORCED FLOW HEATERS | 158 | **8** | 3,478 | **0** | 7.5¢ |
| CONVECTORS | 380 | 48 | 12,366 | **0** | 21.4¢ |
| WALL FINS (right) | 352 | 48 | 15,717 | **0** | 26.6¢ |

**136 rows, 77.7¢.** Every call `ok`; zero thinking tokens on all four.

### What the amendment proved, and what it did not

**Proved.** The thinking posture works and the request shape is correct —
measured, not assumed: 0 thinking tokens against 581 / 1,177 / 5,396 / 4,267
before. Both regions that previously truncated now complete. Cost fell from
165.1¢ (40 rows) to 77.7¢ (136 rows). **The budget class was a real cause and it
is fixed.**

**Did not.** The gate still fails, and now in the more dangerous direction:
**over-extraction, not shortfall.**

Regions 3 and 4 both returned **48**. The hand count is 30 convectors and 18
right-hand wall fins — and 18 + 30 = 48. **Both crops are reading the whole
right-hand column**, so that column is extracted twice. On a real project this
would create 48 phantom units, which is worse than the 0 rows it replaced: a
shortfall is visible, a duplicate looks like data.

The cause is in the bounding boxes, not the model. Reading-order segmentation
gives each region a correct *item range*, but the bbox is the min/max of those
items — and where a sheet's reading order interleaves two columns, a region's
extent spans the whole column rather than its own table. Regions 1 and 2 (the
left column) are exact **because that column holds one table above another**;
the right column holds two tables the same way but its item ranges overlap.

**Next, and not tonight:** the bbox must be the table's own extent, not the hull
of its item range — most likely by splitting a region whose items occupy two
disjoint vertical bands, or by clipping each region against the others. Until
then table-region splitting is **not safe to trust on a multi-column sheet**, and
the 88/88 bar stands.

## The field test — three findings, and what the ledger actually said

The gate passed at 88/88 through a harness; the field then reported "~2 rows".
**The ledger settled it, and overturned the diagnosis I had written down.**

### The field-run evidence

Ten `intake:extract-page` calls, all `outcome: ok`, all `thinking_tokens: 0`,
`budget_class: extraction`. **Production was running the region splitter and the
amended budget class.** The rows landed:

| upload | rows | status |
|---|---|---|
| p16 · BOILERS | 1 | **approved** |
| p16 · PUMPS · EXPANSION TANKS · UNIT HEATERS · WATER SOFTENER · UNIT VENTILATOR | 2 · 1 · 1 · 1 · 1 | parsed |
| **p17 · WALL FINS · FFH · CONVECTORS · WALL FINS** | **32 · 8 · 30 · 18** | parsed |

**p17 returned 88/88 through the real endpoint**, per-region exact against the
hand counts. The F2 gate had already passed, four hours before it was asked for,
and nobody knew.

### F2 — the defect is ASSEMBLY, not extraction or parity

`extractConfirmed` ended with `onStaged(staged[0])`. Region splitting makes N
uploads; the review opened one. **87 rows sat in nine `parsed` uploads that were
never shown**, and "~2 rows" was an accurate reading of the only screen offered.

*This is the unwalked-legs rule at the harness layer, and it is now a rule of its
own:* every 88/88 came through `zz-gate3.mjs`, which called the region functions
itself and posted each region — **it replaced the assembly step with itself**, so
it proved extraction and proved nothing about the part that was broken. See
ARCHITECTURE, *a gate that runs through a harness proves the harness*.

**Fixed:** the total row count across all staged uploads is stated before the
review opens, so a page that *split* is never mistaken for a page that returned
almost nothing.

### F1a — the pre-tick violation, a one-line inconsistency

`picked: p.titled || …`. The **verdict** logic was corrected to stop trusting a
title alone; the **pre-tick** was left trusting it. It shows worst exactly when
things are worst: with the sorter 413'd, `sorted` is empty and `titled` is the
only signal left — the one already ruled untrustworthy.

**Fixed:** `picked: p.headerSignature || sorted[…]?.is_schedule === true`, and the
screen says *"Nothing below has been pre-selected on its behalf."* A transport
failure degrades to **more human choice, never more machine assertion**.
`pw-schedule-finder` gained three legs, including the arrival check that stops the
rule being satisfied by a build that pre-ticks nothing at all.

### The 23-vs-4 reconciliation — not a parity defect

The deployed bundle carries the calibrated filter (header-signature branch
present, titled-alone branch gone). **23 candidates is by design:** undecided
pages are deliberately shown — *a page the machine could not judge is a page the
human should see*. Only the pre-tick was wrong.

### A correction to my own diagnosis: p16 is NOT clipping

I reported p16's six regions as under-extracting — 7 rows where whole-page gave
11 — and attributed it to clipped boxes. **The boxes are correct**: `PUMPS`
contains all 52 of its items, `BOILERS` 36, `UNIT VENTILATOR` 50, each with its
full header and rows.

The difference is **multi-unit row expansion**. That sheet writes combined tags —
`B-1,2`, `T-1,2`, `P-P1,P-P2` — and the model sometimes returns one row per
tag-group and sometimes expands it. Whole-page run 1 gave 7 with combined tags;
run 2 gave 11 expanded. Same geometry, different expansion.

**RULED 2026-08-04 — one row per PHYSICAL UNIT**, written into the extractor's
contract rather than left to vary. Comma / ampersand / slash tag lists expand
(`B-1,2` → `B-1` and `B-2`) carrying the line's spec values onto each row,
because the register is unit-grained: two boilers on one line have two serials,
two sets of index cells, and a finding is raised against one machine, not against
a line.

**Ranges are NOT expanded.** `UH-1 THROUGH UH-12` states a count without stating
tags, and inventing eleven tags is inventing data — one row, the range kept in
the descriptor, low confidence, said in `reasoning`. Quarantine, never guess.

**Consequence for every gate:** hand counts are henceforth **physical-unit
counts**, stated as such. p16's is **11** — `B-1,2`=2 · `P-P1,P-P2` +
`P-S1,P-S2`=4 · `T-1,2`=2 · `UH-B1`=1 · `WS-1`=1 · `UV-1`=1 — which is exactly
what the whole-page run returned on the occasion it happened to expand. The
contract makes that the deterministic answer rather than the lucky one.

## F1b — the 413, and the transport options

The sort payload carries a full-page PNG per scanned page. Clairlea has 26 of
them at roughly 1.4 MB each rendered at scale 0.6 — **~36 MB base64-encoded into
one JSON body**, against a serverless request limit far below that. The 413 is
not a bug in the guard; it is the guard's payload being the wrong shape.

**Three options, deterministic-first split unchanged in all three:**

| Option | Payload | Latency | Cost | Notes |
|---|---|---|---|---|
| **A — downscale for sort only** | scale 0.6 → **0.22**, ~180 KB/page; 40 pages ≈ 7 MB | unchanged | unchanged | **The sort asks "schedule or not", not "read this table".** A page's *shape* — is there a grid of numbers — survives heavy downscaling; extraction-grade resolution is spent on a question that does not need it. |
| **B — per-page requests** | one page per call, ~1.4 MB | 40 × round-trip; slower wall-clock, parallelisable | unchanged | Simple and robust, but 40 requests where 1 would do, and the cost display becomes per-page rather than per-chunk. |
| **C — storage-side reads** | upload page images, send references | extra upload leg | storage cost + cleanup | Most work, most moving parts, and it puts images in storage for a question that may answer "not a schedule". |

**RULED: A, approved 2026-08-04** — the budget-class law applied to pixels.
Extraction still renders at 2.0; only the sort classification is downscaled.
Gate: **zero verdict changes** against the current baseline across the
calibration corpus — any flip fails it and per-page requests (B) get built
instead.

**Original recommendation, for the record:** A, with B as the fallback if A still
exceeds limits on a set larger than Clairlea's. A is a one-line change to the sort render scale, keeps the
single chunked request and its cost display intact, and rests on a real argument
rather than a size heuristic: *the sorter is a classifier, not a reader.* It
should be measured on Clairlea before being trusted — the gate is that its
verdicts do not change against the current baseline.

## Field close — 2026-08-05, PASSED

**The owner walked the full production flow on Clairlea and Workman: upload →
find pages → confirm → extract → review. It passed.**

That sentence is the one the campaign existed to earn, and it is worth being
precise about why it counts where the earlier gates did not. Every 88/88 before
this came through a harness that called the region functions itself and posted
each region — proving extraction, and proving nothing about assembly, which was
the part that was broken. **The field walk is the flow.** It exercised the seam
the harness replaced with itself.

What it covered, in one pass each:

- **Workman** — the fallback path. p7's `QTY NO.` header shape yields no regions,
  so the page extracts whole; that is now the leg's test rather than its blemish.
- **Clairlea** — the splitter on a real multi-column sheet, the assembly total
  stated before the review opens, and the expansion contract producing
  physical-unit rows.

**The campaign's arc, for the record.** A field report of *"can't extract
anything"* — literally true, caused by one expression reading a media type out of
a filename — through six diagnosed failure classes, three ruled amendments, and
back to a field walk that passed. The numbers along the way: finder proposals
**47 → 9**; Clairlea M-601 **0 rows → 40 (truncating) → 136 (48 phantom) → 88
exact**; p16 **7-or-11 by luck → 11 deterministic**; sort payload **2,026 KB →
527 KB**.

## The closing gates — both PASSED 2026-08-04

**Gate A — p16 under the expansion contract: 11 / 11 physical units.**

| region | rows | tags |
|---|---|---|
| BOILERS | 2 | `B-1`, `B-2` |
| PUMPS | 4 | `P-P1`, `P-P2`, `P-S1`, `P-S2` |
| EXPANSION TANKS | 2 | `T-1`, `T-2` |
| UNIT HEATERS · WATER SOFTENER · UNIT VENTILATOR | 1 · 1 · 1 | `UH-B1` · `WS-1` · `UV-1` |

`B-1,2` became two boilers and `T-1,2` two tanks. What varied run-to-run between
7 and 11 from identical geometry is now **deterministic at 11**.

**Gate B — sort downscale: zero verdict changes.** Six Clairlea scanned pages at
0.6 and 0.22: identical verdicts, payload **2,026 KB → 527 KB** (3.8×).

**The limit of Gate B, stated rather than footnoted.** Every sampled page
returned *not a schedule*, because **the corpus contains no scanned page carrying
a schedule** — a gap already named in the fixture manifest. So the gate proves
the downscale does not create **false positives**; it does **not** prove it
preserves **true positives**. That is the strongest evidence this corpus can
produce, and the first scanned schedule that arrives should re-run it.

## Open, named rather than assumed

- **Workman p7: the `QTY NO.` header-shape variant.** Its BOILERS and EXPANSION
  TANK tables head their identity column `QTY` / `NO.` rather than `TAG` or
  `MARK`, which the identity-column pattern does not match. Under the original
  hull geometry the page split 2 of 4; under the corrected extent it returns **0
  regions** and falls back to whole-page extraction — which returns all 6 rows
  correctly, so the fallback covers it and nothing is lost today.

  **Named as a fixture-manifest entry rather than fixed now:** widening the
  identity pattern on one instance is pattern work done from a sample of one, and
  the pattern is the single most dangerous thing in the finder to loosen — it is
  what separates a schedule from a plan. **Fixable when a second instance
  justifies it**; the fallback is correct meanwhile. Recorded in
  [`FIXTURES.md`](../samples/calibration/FIXTURES.md) under Workman IFT p7.
- **No scanned page carrying a schedule** exists in the corpus. The image leg is
  proven to engage and return rows; it is **not** proven to read a table from a
  scan.
- **Two-page continuation** is named in the sorter's contract and absent here.
- **F (tiny fonts)** parked pending evidence from p24 once reachable.
- **Clairlea now has 51 undecided pages** against a 40-page sort ceiling —
  addressed by chunked continuation, not a raise.
