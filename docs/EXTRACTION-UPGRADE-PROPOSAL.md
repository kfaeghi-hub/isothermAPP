# Model-first extraction with self-verification — build plan

**Status: PLAN, pending ruling on the phase split. Ruling 3 of 2026-08-11 settled
the DIRECTION; this settles what has to be built first, because a recon over nine
subsystems found the ruling rests on five foundations that do not exist yet.**

Companion: `fixtures/extraction-bench/CORPUS.md` (the measurement), and
`docs/EXTRACTION-HARVEST-PROPOSAL.md` (3f, which this feeds).

---

## 1. The case, now measured

Ruling 3's premise — *"the system was only as smart as its rules"* — is no longer
an argument. The benchmark's first run put a number on it.

| | |
|---|---|
| Scored files clean | **3 / 4 (75%)**, target ≥ 90% |
| The one failure | the hostile fixture, on `ambiguity-unflagged` — the only clause with **no mechanism at all** |
| Seneca corpus | 286 rows across 33 real schedules, **69% typed** |
| **Files returning 0% typed** | **12 of 33** — 86 rows |

The 86 are not exotic: 51 VAV terminals, 15 air terminals, every DOAS unit and
coil, the energy-recovery wheel. Ordinary equipment from one real project that the
deterministic path extracts and cannot identify.

**And the hostile fixture found a defect on its first run that rules cannot fix.**
`MBH` sits in column J, outside the `MOTOR` merge (`G2:I2`), and was labelled
`MOTOR MBH`. Forward-fill carries a group header across every following blank cell,
and `read-excel-file` returns a merged cell as *value plus nulls* — **it never
reports the merge's width**. The extent is not in the data the rules are given. A
model looking at the sheet can see it; a rule cannot.

That is the argument for model-first, stated as a measurement rather than a mood.

---

## 2. What the ruling assumes, and what actually exists

A nine-agent recon over the runtime, the schemas, the review UI, the DB and the
gates. **Five of Ruling 3's requirements have no foundation to build on.**

| Ruling 3 asks for | Today |
|---|---|
| (4) "strict structured schema … fails loudly at the boundary" | **No structured outputs and no tool-forcing anywhere.** No `output_config`, no `tools`, no `tool_choice`, no `strict`. JSON is requested in prose and validated post-hoc by a hand-written type guard. `ExtractorOutput`'s validator checks only that `rows` is an array and each row has a string `tag` and a numeric confidence. |
| (3) "a verification pass … the verifier pattern exists" | The verifier exists **for prose only**. `VerifierInput` hard-requires `{ prose, facts }`; flags require a string `span`. Verifying rows needs a new agent key and a new schema pair — not a reuse. Also: `AgentContract.verifier` is parsed and **read by nothing**; every two-pass is hand-written at the call site. |
| (1) "disagreement named … model-found columns offered" | **No second-reading model exists.** Nothing holds two readings of one row; no per-field provenance; no per-field confidence. The only diff surface compares an intake row to an existing `equipment` record, four fields wide. |
| (2) "flag the specific question … flags land in review as questions" | **No ambiguity surface anywhere in intake.** No per-row question, no answer field, and no column to hold either — `intake_rows` has no `note`, `flag`, `question` or `reasoning` column. `ExtractorOutput.rows[].reasoning` is accepted by the contract and **discarded on arrival**. |
| (1) "the Excel path gains a model-read leg" | `readWorkbook` hard-codes `import('read-excel-file/browser')` and has no Node counterpart; `parseSheet` is the only exported entry that takes a grid. `findHeader`, `composeHeader`, `forwardFill`, `detectArtifact`, `findTitle` are **all module-private**. There is no provenance field to say a row came from a model. |

Three more, found in passing, that this build must not step on:

- **`budgetOverride` bypasses the class ceiling entirely** — `opts.budgetOverride
  ?? Math.min(...)` sits two lines under the comment "the number still comes from
  the registry, not the caller". It is **latent, not live**: the field is declared
  and **no call site passes it**. Worth closing before a second pass gives someone
  a reason to.

  *The recon also reported the retry's `budget *= 2` as the same violation. It is
  not.* `ai-common.ts:396` records the ruling: *"the ceiling is unchanged at 8,000
  **with the 16,000 retry**"* — the escalation is deliberate and the calibration
  campaign depends on it. Checked rather than taken on the agent's word, and
  recorded here so nobody "fixes" it later.
- **No timeout on any model call.** Bare `fetch`, no `AbortController`. A second
  pass doubles the exposure, and the schema file already notes a 170s call that
  returned nothing.
- **No prompt caching**, though the system prefix is a large deterministic corpus
  assembly re-billed on every page of a set — which is exactly what caching is for,
  and matters more once every sheet becomes a model call.

**The doctrine also has to change on the record.** `firm-knowledge/agents/extractor.md`
currently reads: *"Deterministic first — the model is the fallback, not the
default. A clean Excel schedule never reaches this agent."* Ruling 3 reverses that
sentence. It is a contract, so the reversal is an edit to the contract with its
reason attached, not a quiet drift at a call site.

---

## 3. The shape being built

```
        ┌──────────────── the sheet, as its real grid ────────────────┐
        │  banners intact · merges intact · every cell addressed      │
        └───────────────┬─────────────────────────┬──────────────────┘
                        │                         │
              MODEL READ (pass 1)         DETERMINISTIC PARSE
        every unit · type · spec+units    the existing parseSheet
        per-field source cells            unchanged, still exact
        ambiguities as QUESTIONS                  │
                        │                         │
                        └────────► RECONCILE ◄─────┘
                             agree      → high confidence
                             disagree   → model's read, disagreement NAMED
                             model-only → offered, never asserted
                             totals     → reconciled, or the sheet fails loudly
                                    │
                          SELF-VERIFICATION (pass 2)
                     "you said B-1 is 1000 MBH — point to the cell"
                     totals reconciliation · hunt for what pass 1 missed
                                    │
                     disagreement on a VALUE → third targeted read
                                    │
                              REVIEW SCREEN
                  offer-never-assert · lowest confidence first
                  both readings shown · questions asked, not defaulted
                                    │
                          every correction → 3f capture
```

**The deterministic parse does not go away, and this is the point.** It stops
being the reader and becomes the **oracle** — the thing the model's read must
agree with, in the pattern `pw-extractor.mjs` already proves across the Excel and
image paths (*"the oracle is agreement, not my opinion"*). Two independent readings
of one sheet catch what neither catches alone, because a wrong answer would have to
be wrong identically in both.

**Totals discipline is absolute and unchanged**: row counts reconcile, every unit
accounted for, tag-intersection and multi-unit rules as they stand. A sheet whose
two readings cannot be reconciled **fails loudly** rather than shipping the
prettier of the two.

---

## 4. Phases

Each is separately gated. The benchmark's corpus pass rate and cost-per-sheet are
reported at **every** phase boundary, so accuracy always carries its price tag.

| # | Ships | Gate |
|---|---|---|
| **1** | **Boundary hardening.** Strict structured output for extraction (tool-forced, enumerated equipment types, validated units-of-measure); `ExtractorOutput` validator replaced; `budgetOverride` clamped; retry re-clamped; a timeout on every model call. | A malformed read fails at the boundary with a named reason, proven by injection. Battery green. No behaviour change on the existing PDF path — asserted, not assumed. |
| **2** | **Contract reversal + the model-read leg for Excel.** `extractor.md` rewritten model-first with the reversal recorded. Grid→model rendering that preserves banners and **carries merge extents** (below). A Node-side workbook read. Provenance on every row. | Adam's three and CUH read by the model alone, with **zero file-specific code paths**. `MOTOR MBH` reads as `MBH`. Cost-per-sheet reported. |
| **3** | **Reconciliation.** Model read × deterministic read → agreement, named disagreement, model-only-offered. Totals reconciliation, fail-loud on irreconcilable. | The 12 zero-typed Seneca files measured before and after. Corpus rate moves and the number prints. |
| **4** | **Self-verification + tiebreaker.** New agent key and schema pair for row verification (not a reuse of the prose verifier). Per-claim spot-checks, totals, a hunt for what pass 1 missed. Third targeted read only where pass 1 and the verifier disagree on a value; cost logged. | A seeded wrong value is caught and named. Verification failure **fails closed** — an unverified read is not a verified one. |
| **5** | **Review surfaces.** Per-row questions and answers, disagreement rendering, per-field provenance and confidence. Migration for the columns none of this has. | Sighted legs. The hostile fixture's `MBH` question reaches a human as a question. **Benchmark ≥ 90%.** |
| **6** | **Harvest Phases 1–2** (3f, already approved) on top of the capture surface this creates. | Per 3f's own gate: rediscover `SERVICE → area_served` from recorded corrections alone. |

### Phase 2 must carry merge extents — the datum rules cannot recover

*Named here rather than left as an observation, ruled 2026-08-12.*

The hostile fixture labelled `MBH` as **`MOTOR MBH`**. `MBH` is in column J; the
`MOTOR` group header spans `G2:I2` and stops at I. Forward-fill carries a group
header across every following blank cell, and **`read-excel-file` returns a merged
cell as *value plus nulls* and never reports the merge's width.** The extent is
simply not in the data the deterministic reader is handed — no cleverer rule can
recover it, because the information was discarded before the rule ran.

So **whichever phase hands the model the rendered grid must hand it the merge
extents too.** Concretely, for Phase 2's grid rendering:

- read merge ranges from the worksheet XML (`<mergeCells>`), which the reader
  drops, and pass them alongside the grid;
- render a group header as **spanning its declared columns**, so a column outside
  the span is not silently adopted by it;
- the deterministic parser can then consume the same extents, which fixes
  `MOTOR MBH` on the rules path as well — the fix is a better *input*, not a
  better heuristic.

**The gate is the fixture:** after Phase 2, `hostile-schedule.xlsx` reports the
column as `MBH`, not `MOTOR MBH`. Until then it stands as a known, named defect
with a reproduction — not a mystery.

**Phase 1 is not optional and not reorderable.** Every later phase writes model
output into an engineering register; without a boundary that fails loudly, a
malformed read lands as a plausible wrong row, which is the failure this whole
campaign exists to prevent.

---

## 5. Cost — stated before it is spent

Today a clean Excel sheet costs **nothing**: no model call. After Phase 2 every
sheet costs one extraction-class call, and after Phase 4 a second verification
call plus an occasional third targeted read.

From the calibration record: extraction runs at `budget_class: extraction` (8,000,
thinking off) and measured **7.5¢–22.4¢ per table region**, 59.3¢ for an 88-unit
page across four regions. A typical firm schedule sheet is one region.

| | today | after Ph.2 | after Ph.4 |
|---|---|---|---|
| clean Excel sheet | 0¢ | ~1 extraction call | ~2 calls + occasional 3rd |
| 33-sheet project | 0¢ | one order of a few dollars | roughly double |

**Two things make that number smaller, and both are missing:** prompt caching on
the deterministic system prefix, and not re-billing the corpus on every sheet of a
set. Neither is in this plan's scope; both are named here so the cost reported at
Phase 2 is understood as an unoptimised ceiling rather than the steady state.

**The trade being bought:** 86 rows on one project that the rules cannot type, an
ambiguity mechanism that does not exist, and a merge-extent class of defect that
rules cannot see. Whether that is worth a few dollars a project is a judgement,
and it belongs to the owner — which is why the number is reported at every phase
boundary rather than at the end.

---

## 6. What this plan will not do

- **It will not remove the deterministic parser.** It is promoted to oracle. A
  model-only path has nothing to disagree with, and disagreement is the mechanism.
- **It will not auto-apply anything.** Review stays the gate; offer-never-assert is
  unchanged; Law 2 is untouched.
- **It will not guess at an ambiguity.** A value the sheet does not disambiguate is
  extracted and **asked about**. A default here would be a confident wrong answer
  wearing a high confidence score.
- **It will not add file-specific code paths.** The gate says so explicitly, and the
  benchmark is how it is checked: a fix that only helps one file shows as one file
  moving and the corpus rate standing still.
