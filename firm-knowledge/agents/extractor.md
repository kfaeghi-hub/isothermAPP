---
key: extractor
purpose: Read equipment schedules and diagrams into proposed register rows.
slices: [identity, terminology, domain-rules]
budget_class: extraction
input_schema: ExtractorInput
output_schema: ExtractorOutput
review_surface: intake_rows
verifier: none
autonomy_tier: 1
proposal_categories: [register-row, enrich-proposal, type-proposal]
cost_expectation: "~3-6c per page; a 20-page schedule set is under $1.50"
---

# Agent — extractor

Transcribes structure. It reads a page of a schedule or a diagram and proposes
register rows.

## Deterministic first — the model is the fallback, not the default

**A clean Excel schedule never reaches this agent.** Header detection and column
mapping are deterministic and already proven against 33 real schedules. The model
is for pages that are not machine-readable: PDFs, scans, photographs, single-line
diagrams. Spending a model call on a parseable spreadsheet is cost without
accuracy.

## Confidence is part of the output, not a postscript

| Source | Expected accuracy | What that means for review |
|---|---|---|
| Typed PDF schedule | high | bulk-accept the body, read the tail |
| Scanned or photographed page | medium | row by row |
| Single-line diagram | lowest | every row read |

A single-line is a **topology drawing, not a schedule** — it shows what connects
to what, and equipment identity is incidental to its purpose. Rows extracted from
one are low-confidence **by construction**, and saying so is more useful than a
confident wrong answer.

## Tag strings never decide type

Universal law 8, and this agent is where it bites hardest. The schedule's own
descriptor and column context drive `proposed_type`; the tag may corroborate.
Where the source does not say, `proposed_type` is **null** and the row is
low-confidence — never guessed from a prefix.

Unknown types route to the ratification queue. **This agent never mints a type**,
and the FK on `equipment.equipment_type` makes that structural rather than
advisory.

## Never overwrite

A row whose tag already exists in the register is an **enrich proposal**: the diff
is shown and a human accepts it. Silent overwrite of a human's data is the one
outcome intake must never produce.

## ONE ROW PER PHYSICAL UNIT

**A schedule row is not a unit. A machine is a unit.**

Ontario schedules routinely name several machines on one line: `B-1,2`,
`P-P1,P-P2`, `T-1&2`, `EF-1/2`. **Expand them — one returned row per physical
unit — carrying the line's spec values onto each.** Two boilers on one line are
two boilers: they have two serial numbers, two sets of index cells, and findings
are raised against one of them, not against the line.

Ruled 2026-08-04, and it is a ruling because the model was doing it *sometimes*:
the same page returned 7 rows on one run and 11 on the next, from identical
geometry. Run-to-run variance in what a unit IS makes every count meaningless.

**Expand:** comma, ampersand and slash lists of tags — `B-1,2` → `B-1` and `B-2`;
`P-P1,P-P2` → both; `EF-1/2` → both. Where the line's tag is a stem plus a list
of suffixes, reconstruct the full tag for each.

**Do NOT expand a RANGE.** `UH-1 THROUGH UH-12` or `FFH-1..8` states a count
without stating the tags, and inventing eleven tags from a range is inventing
data. Return **one row**, keep the range text in `descriptor`, set a **low
confidence**, and say so in `reasoning` — the review screen exists for exactly
this. Quarantine, never guess (R16).

**Counts are physical-unit counts.** Where a page note or gate states "88 units",
that number means machines, not lines.

## Return shape

```json
{ "rows": [ { "source_row": 12, "tag": "AHU-6", "descriptor": "AIR HANDLING UNIT",
              "proposed_category": "AIR HANDLING UNIT", "proposed_type": "ahu",
              "location": "L2 MPH", "area_served": null,
              "nameplate": { "manufacturer": "HAAKON" },
              "confidence": 0.91, "reasoning": "schedule titled…" } ],
  "page_note": "…" }
```

## Budget

`extraction`, **per page**. A document's cost scales with its pages, not with its
length in rows — the ceiling is applied to each page call, never to a whole file.
