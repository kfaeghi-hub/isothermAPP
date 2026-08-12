---
key: row-verifier
purpose: Check extracted equipment rows against the sheet they came from, cell by cell.
slices: []
budget_class: reasoning
input_schema: RowVerifierInput
output_schema: RowVerifierOutput
review_surface: intake_rows
verifier: none
autonomy_tier: 1
proposal_categories: [row-check]
cost_expectation: "~4-12c per sheet — a second extraction-class read of the grid plus the comparison; measured per sheet in extraction-bench"
---

# Agent — row-verifier

Reads a spreadsheet grid and a set of rows somebody claims were extracted from it,
and says, per claim, whether the sheet supports it — **pointing at the cell**.

## Why this is a NEW agent and not the verifier

`verifier` checks PROSE against FACTS. Its input hard-requires `{ prose, facts }`
and every flag it returns carries a string `span`. Rows are not prose and a cell
reference is not a span. Reusing it would have meant widening a contract until it
fit two jobs, and a contract that fits two jobs constrains neither.

## Isolation is registry law, and here it has teeth

`slices: []`. This agent never sees the identity card, the terminology, the
domain rules, or the extractor's contract — and it must never see the extractor's
*reasoning*. A model shown why a claim was made will agree with the reasoning; a
model shown only the grid and the claim has to go and look.

**One consequence, stated because the runtime enforces it:** with no slices, the
system prompt is empty AND this file's prose is not sent either. Everything the
agent is told arrives in the task. This document is the contract for humans; the
call site carries the instruction.

## What it is asked, and what it must not do

Three jobs, in one pass:

1. **Per-claim spot-check.** For each claim — a tag, a type, a spec value — say
   `supported`, `contradicted`, or `not_found`, and **give the cell** (`D7`) when
   supported or contradicted. A verdict with no cell is an opinion.
2. **Totals reconciliation.** How many units does the sheet actually list? A read
   that returned nine rows from a twelve-row schedule is wrong in a way no
   per-claim check can see, because every one of the nine can be perfectly
   supported.
3. **The miss-hunt.** What is on the sheet and NOT in the claims? This is the only
   question that finds a shortfall, and it is asked separately because a checker
   given a list will otherwise only check the list.

**It proposes nothing and writes nothing.** It returns verdicts. Law 2 is not
softened for a verifier — a checker that could correct the record would be an
agent editing an engineering register on its own authority.

## `not_found` is not `contradicted`

They are different facts and the schema keeps them apart. *Contradicted* means the
cell says something else — the extraction is wrong. *Not found* means the checker
could not locate it — which may mean the extraction invented it, or may mean the
checker looked in the wrong place. One is evidence; the other is an absence, and
this codebase does not let an absence pass as evidence.

## Failing closed

A verification that could not complete is **not** a verification that passed. An
empty verdict list from a failed run must never read as "checked, nothing found".
The caller distinguishes them; see ARCHITECTURE, *a verification that failed is
not a verification that passed*.

## Budget

`reasoning`. Comparing every claim against a grid is the reasoning-heavy half of
this pipeline, not the cheap half — the same mistake the prose verifier's original
1,500-token ceiling made.
