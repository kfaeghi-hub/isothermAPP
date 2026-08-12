# Extraction-rules harvest — proposal (BACKBURNER 3f)

**Status: PROPOSAL. Nothing here is built. Awaiting the owner's ruling.**
Written 2026-08-11, after the Avondale incident fired the wake condition.

---

## 1. Why now

3f has waited since 2026-08-04 for one thing: **real correction data**. It now
exists, and the Avondale incident is a worked example of every kind of rule this
harvest is meant to learn.

Adam converted three PDF schedules to Excel and imported them. The extraction
reported success. What it actually did:

| What happened | The rule that would have prevented it |
|---|---|
| `SERVICE` read as the description, so `BOILER B-1 PRIMARY LOOP` typed two pumps as **boilers** | a **column-dialect** rule: on these schedules SERVICE is the duty, not the identity |
| `PUMPS` discarded as a title because the banner row also held `ELECTRICAL` | a **title-convention** rule: this office writes a group header beside the banner |
| 77 spec values stored under headings no field claimed, rendering **zero** | a **field-alias** rule: `MAX INPUT [MBH]` is this firm's `Input Rating (kW)` |

All three were fixed by hand, this week, by reading the file. That is the work the
harvest exists to stop repeating. Every one of them is a pattern that will recur —
the same consultant will send the same dialect on the next project — and none of
them is knowledge the codebase currently keeps.

**The distinction that makes this worth building:** the fixes above are now *rules
in the deterministic layer* — an alias list, a title heuristic, a synonym table.
They cost no tokens and cannot drift. The harvest's job is to produce more of
those, not to make the model cleverer.

---

## 2. Scope of v1 — and what it deliberately excludes

**In scope: column-mapping and type-resolution corrections.**

| Kind | Example | Hardens into |
|---|---|---|
| Column dialect | `DUTY` → `area_served`, seen 4×, corrected 4× | `FIELDS` synonym lists in `intakeExcel.ts` |
| Field alias | `MAX INPUT` → `Input Rating` | `FIELD_ALIASES` in `scheduleFieldMatch.ts` |
| Type alias | `VERTICAL IN-LINE` → `pump` | `equipment_type_aliases` (the existing table) |
| Title convention | banner + group header on one row | a `findTitle` rule, or a per-source note |

**Out of scope for v1: value-level learning.** Nothing that proposes what a
*value* should be — no "this consultant's FLOW is always L/s", no inferred unit
corrections, no filling a blank from a neighbouring row. Two reasons, both
concrete:

1. **There is no evidence it is needed.** Every defect this campaign produced was
   structural — which column, which type, which field. Not one was a wrong value.
2. **The blast radius is different in kind.** A wrong column mapping is visible on
   the review screen before anything is written. A wrong *value* rule silently
   changes an engineering number, and the register's whole claim is that its
   numbers came from a document.

Value-level learning waits for a real incident that asks for it, as this one asked
for column learning.

**Also out of scope:** the few-shot exemplar half of 3f (ratified extractions fed
back to the extractor as examples). It needs volume this firm does not have yet —
four Excel uploads and a handful of PDF pages. Revisit when the corpus is real.

---

## 3. Part (a) — correction capture

### What is recorded

One `extraction_corrections` row per human correction, at the moment it happens:

| Column | Holds | Example |
|---|---|---|
| `upload_id`, `project_id` | provenance | |
| `source_kind` | `excel` \| `pdf` \| `image` | `excel` |
| `source_label` | the sheet or page | `Sheet1` / `p.9` |
| `correction_kind` | `column_map` \| `type` \| `field_alias` | `column_map` |
| `observed` | **the source's own string**, verbatim | `SERVICE` |
| `proposed` | what the extractor chose | `descriptor` |
| `chosen` | what the human chose | `area_served` |
| `context` | jsonb — the sibling headings, the title, the row | `{ headers: [...], title: 'PUMPS' }` |
| `corrected_by`, `corrected_at` | who and when | |

**`observed` verbatim is the whole point.** A correction recorded as "the
description column was wrong" teaches nothing. `SERVICE`, spelled exactly as this
consultant spells it, with its sibling headings beside it, is a pattern the next
sheet can be matched against.

### Where it is captured, and the one thing that is new

Three sources, two of which already have the event and throw it away:

1. **The review screen's re-map / re-type / value fix** — `IntakeReview.dispose()`
   already writes `disposition` and `edited`. It knows the before and the after.
   It records the *decision* and discards the *evidence*: which column heading the
   value came from. Capture is a widening of an existing write.
2. **The named unmatched-columns table from Part 3** — every extraction now
   reports `coverage.captured` and `coverage.ignored` by name. An unmatched
   heading is a correction waiting to happen; it is logged as an *observation*
   (`chosen` null) so a heading seen thirty times without ever being mapped is
   itself a finding.
3. **A repoint like Avondale's** — a batch correction is the highest-value signal
   there is, because a human read the file and ruled. `avondale-repoint.mjs`
   already computes exactly these tuples; it would emit them.

**Nothing new is asked of the user.** No "was this right?" prompt, no extra click.
A capture step that costs a reviewer anything will be skipped, and a harvest fed
by the corrections people bothered to annotate is a biased corpus.

---

## 4. Part (b) — the librarian pass

Periodic, manual-triggered in v1 (a button in `/classifications`, beside the
existing ratification queue — not a cron; see §6).

**It reads corrections and emits proposed rules as stored artifacts**, through the
existing ratification path. Each proposal carries:

```
rule:        SERVICE  →  area_served        (column_map)
occurrences: 4         corrected 4/4        contradicted 0
sources:     Avondale/PMPs.xlsx, Avondale/Boilers.xlsx, Avondale/AS.xlsx,
             Central Tech/CUH.xlsx
evidence:    the four correction rows, verbatim, each with its sibling headings
confidence:  high — no counter-example in the corpus
```

Four properties, each there for a reason this codebase has already paid for:

- **Occurrence counts AND contradiction counts.** A rule seen 6 times and
  contradicted twice is not a weaker version of a rule seen 4 times and never
  contradicted — it is a *different kind of thing*, probably two dialects sharing a
  word. Reporting only the supporting count is how a tie-break becomes a guess.
- **Source evidence per rule, verbatim.** The ratifier must be able to open the
  actual sheet. "Seen 4×" with no way back to the four is an assertion.
- **A minimum before proposing.** A single correction is a typo until it repeats;
  the threshold (proposed: **3 occurrences, 0 contradictions**, tunable per kind)
  is stated in the artifact so a reader knows what the number means.
- **The librarian never proposes a rule that the deterministic layer already
  holds.** Otherwise the queue fills with re-proposals of ratified rules, and a
  queue nobody can clear is a queue nobody reads.

**Nothing applies unratified.** The librarian writes proposals. Ratification is a
human act in the existing queue. This is Law 2 and Law 6 unchanged, and it is the
same shape as the terminology pipeline that already works.

---

## 5. Part (c) — ratified rules harden into the deterministic layer

**This is the part that matters, and it is what separates this from "the model
gets better over time."**

A ratified rule does not become a hint in a prompt. It becomes a row or a constant
the parser reads with no model involved:

| Rule kind | Lands in | Effect |
|---|---|---|
| Column dialect | a new `extraction_column_rules` table, read by `parseSheet` | the mapping is deterministic, testable, free |
| Field alias | `FIELD_ALIASES` (today a constant; becomes a table) | spec values render without a model |
| Type alias | `equipment_type_aliases` — **already exists** | `resolveTypeDetailed` picks it up unchanged |
| Title convention | a `findTitle` rule or a per-source note | |

Two consequences worth stating plainly:

- **Learning becomes rules; it never accumulates as opaque model behaviour.** You
  can read the whole of what the system has learned, in a table, and delete a row
  you disagree with. Nothing is hidden in weights or in a prompt nobody re-reads.
- **The extractor gets cheaper as it learns, not smarter.** Every hardened rule is
  a page the model no longer has to be asked about. That is the same economics as
  the schedule-page finder: push work down to the cheapest layer that can do it.

**The migration risk this creates, named now:** moving `FIELD_ALIASES` and the
`FIELDS` synonym lists from constants into tables means the parser's behaviour
becomes data. That is the point, and it also means a bad ratification can change
how every future import reads. Mitigation, proposed: rules are **additive only in
v1** — a ratified rule may add a synonym, never remove or override a built-in one,
so the floor cannot be lowered by the queue.

---

## 6. What this proposal deliberately does not do

- **No cron.** v1 is triggered by a person. An automatic harvest that files
  proposals nobody asked for produces a queue that grows faster than it is read,
  and the first thing a full queue teaches is to ignore it.
- **No auto-application, at any confidence.** There is no threshold at which a
  rule applies itself. A rule at 40 occurrences and 0 contradictions is a very good
  proposal and still a proposal.
- **No cross-firm learning.** Rules are scoped to this org. A dialect is a fact
  about a consultant, not about mechanical schedules.
- **No silent re-extraction.** Ratifying a rule does not re-run past imports.
  Existing rows were ruled on by a human under the old rules, and changing them
  underneath that ruling would make the register disagree with its own history.
  Re-running an upload stays an explicit act.

---

## 7. Phases, if ruled

| Phase | What ships | Gate |
|---|---|---|
| 1 | `extraction_corrections` table + capture at the three sources | a real review writes a correction row with `observed` verbatim; a sighted leg |
| 2 | the librarian pass + proposal artifacts, read-only | Avondale's own corrections produce the SERVICE → area_served rule with 4 occurrences and its evidence |
| 3 | ratification wiring + hardening for **type aliases only** (the existing table, lowest risk) | a ratified alias changes `resolveTypeDetailed` with no code deploy |
| 4 | column-dialect and field-alias tables, additive-only | the parser reads a ratified rule; built-ins cannot be overridden; battery green |

Phase 2's gate is the honest one: **the harvest must rediscover, from the recorded
corrections alone, the rule I worked out by hand this week.** If it cannot, the
capture is not recording enough, and that is worth knowing before phases 3 and 4
are built on it.

---

## 7b. A named future question — the title-typed confidence band

*Ruled 2026-08-11, deferred here rather than left in a commit message.*

`CLEAN_AT` is 0.85 and a title-typed row scores 0.80, so **every row whose type
came from the schedule's frame rather than its own line routes to review instead
of bulk-accept.** On the intake fixture that moved `Clean — 4` to `Clean — 2`.

**That stands, and it is not a defect.** Title-typed is exactly the class the
Avondale incident burned — four pumps, two of them typed `boiler` — review clicks
are cheap, and each one is a correction event this harvest captures. Paying two
clicks to feed the loop that removes the clicks is the right trade at this volume.

**What would change it is evidence, not comfort.** When Phase 2's recorded
corrections show title-typed rows being *confirmed* at a high rate — the human
agreeing with the frame-derived type, over and over, across sources — that is the
case for giving them their own confidence band rather than the general one. Ruled
then, on data.

Stated here so it is a question the harvest is expected to answer, not a threshold
somebody eventually wonders about.

## 8. The question this proposal cannot answer

Whether the firm's upload volume will ever make this pay. Four Excel uploads and
one PDF page in the system's life is not a corpus; it is an anecdote with a schema.
Phases 1 and 2 are cheap and produce a real answer — after a season of intake, the
correction table either shows clusters or it does not. **Phases 3 and 4 should be
ruled separately, on that evidence, rather than approved now on the strength of
this document.**
