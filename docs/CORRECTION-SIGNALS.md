# Correction signals — the contract harvest builds against

*[KEEL] Phase 6, ruled 2026-08-13. This document is normative: harvest Phase 1
mines exactly what this schema stores, so a change here is a change to
harvest's ground truth and gets the reversal-on-record treatment.*

## What a signal is

One row per **human disposition on a provenance intake row**: the machine's
proposal, the human's outcome, and enough context to learn from the pair.
Written by a database trigger observing the existing disposition path —
capture is passive, review behavior is unchanged, and **no second door
exists**: the table has no insert policy, so signals are written by the
trigger or not at all. A signal that could be forged by a direct insert would
poison the track record this table *is*.

## The schema (`correction_signals`)

| Group | Column | Meaning |
|---|---|---|
| context | `upload_id` / `row_id` / `project_id` / `source_sheet` / `tag` | Where the row came from. Lifetime rides the upload (cascade); `row_id` survives row housekeeping as NULL. |
| context | `source_surface` | **The seam, named not built.** `intake-review` today. Sheet-kind corrections from the Documents pool (3o) land here with their own value when that arc builds. |
| machine | `read_via` | Which reader produced the row: `rules` / `model` / `both`. |
| machine | `confidence` / `proposed_type` | The merged proposal as the human saw it. |
| machine | `had_conflict` / `conflict_rules` / `conflict_model` | The type conflict, both candidates frozen — even after a human resolves it. |
| machine | `questions_attributed` | How many questions the pipeline attributed to the row. |
| machine | `verification_ran` | False = the second pass did not run (an outage, not a data problem). |
| human | `disposition` | `accepted` / `edited` / `rejected`. Pending→settled transitions only; re-disposing is not re-proposing. |
| human | `edited` | What changed, when the human changed something. |
| human | `chosen_leg` | A resolved conflict **names its reading**: `rules` / `model` / `other`. `other` is a human naming a third type both readers missed — itself a strong signal. |
| human | `question_state` | `answered-via-edit` / `accepted-unanswered` / `rejected-with-question`. An answered question is a correction; an unanswered accept is a fact about the question. |
| human | `resolved_by` | Who ruled. |

## What harvest mines from it, by column

- **Type corrections**: `proposed_type` vs `edited->>'proposed_type'` — the
  machine said X, the human said Y. With `chosen_leg`, conflict resolutions
  split into *the rules leg was right*, *the model leg was right*, and *both
  were wrong* — three different lessons.
- **Leg reliability**: `read_via` × disposition — which reader's rows survive
  review, per sheet-shape, per consultant.
- **Question quality**: `question_state` — a question answered via edit was
  worth asking; a question accepted-unanswered repeatedly is noise the reader
  should stop raising.
- **The denominator discipline** holds here as everywhere: rates are computed
  against dispositions captured, and a signal that was never captured is a
  named gap, not a silent one.

## Sheet-level questions

Normalized in the same phase (`intake_sheet_questions`, one row per question
per sheet — the opening commit). Their answers are **not** captured yet: a
sheet question has no disposition path today. When one gets an answer surface,
its capture lands in this table with the row-less context columns null and
`source_surface` naming the surface that answered it.

## The gate

`pw-correction-capture` (battery member): performs one of each disposition
class on the ZZ-TEST fixture and reads every signal back — including the
refused forge and the cascade-clean. The classes: accept-clean,
accept-unverified, accept-with-question-unanswered, question-answered-via-edit,
conflict-resolved naming each leg, plain edit, reject, and the null-provenance
disposition that must produce **no** signal.
