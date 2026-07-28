---
key: classifier
purpose: Propose applicability rules and per-unit exceptions for a project's Cx Index.
slices: [identity, terminology, domain-rules]
budget_class: prose
max_tokens: 4000
input_schema: ClassifierGroupInput
output_schema: ClassifierGroupOutput
review_surface: cx_applicability_proposals
verifier: none
autonomy_tier: 1
proposal_categories: [applicability-rule, applicability-exception, fire-integration]
cost_expectation: "~12-18c per project register (batched, roughly one call per 80 units)"
---

# Agent — classifier

Reads an equipment register and the project's stage structure, and proposes which
(type × stage-group) combinations do not apply — so the index's denominators tell
the truth.

## One stage group per call — the question must have a floor

**The whole-matrix framing does not work, at any budget.** Asked to work out every
equipment type against every stage group, the model reasons until its allowance is
gone: 15,999 thinking tokens and *zero* text, repeatedly, even when given a single
stage group alongside 42 types. A question with no natural stopping point expands
to fill whatever room it is given.

So each call asks one bounded question:

> Given **this** stage group and its columns, which of these equipment types does
> it not apply to, and which individual units are exceptions?

The stage group is known by the caller and attached deterministically afterwards.
The model never restates it, so it cannot get it wrong, and the answer is a short
list rather than a matrix.

Fire integration is **its own call** for the same reason — one focused question,
read on its own terms.

## Rules first, exceptions second

Output is **two lists, and the order matters**. A type-level rule settles every
unit of that type in one ratification click; an exception settles one unit. An
agent that returned 367 per-unit judgements would be technically correct and
practically useless — **the burden must scale with types, never units.**

## Tag strings never decide

Universal law 8. On one project `RP` was a **radiant panel** on the mechanical
drawings and a **receptacle panel** on the electrical. Proposals are driven by the
register's `descriptor`, `category` and `equipment_type` — the source's own words.
A tag pattern may support a proposal; it may never be the whole of one.

## Fire integration gets its own block

Life-safety interlock is the one judgement here where a wrong answer is a scope
error rather than an untidy grid. Candidates the CxA should expect to see argued
either way — fire and smoke dampers, fire pump, stair pressurization,
generator/ATS, smoke-control fans — are **proposed from the register, never
assumed**, and rendered as a separate review block so they are read rather than
bulk-ratified.

This list is **guidance for the proposal, not a seed**: the classifier states what
it found in *this* register and why, and the CxA rules.

**Set `life_safety: true` on any proposal touching integrated systems testing,
fire or smoke control, emergency power transfer, or stair pressurization** — the
review surface routes those into their own block so they are read individually
rather than bulk-ratified. Declaring it is the agent's job; inferring it from a
stage-group name downstream would be exactly the kind of string-matching law 8
forbids.

## Confidence and abstention

Every proposal carries a confidence and a rationale in plain language.
**Quarantine rather than guess** (EXTRACTION-PLAYBOOK R16): a unit the register
does not describe well enough lands as a low-confidence exception with the reason
stated, never as a silent default.

## Return shape

```json
{ "rules": [ { "equipment_type": "fcu",
               "stage_group": "IST (Integrated Systems Testing)",
               "column": null, "applicable": false,
               "rationale": "…", "confidence": 0.9, "units_affected": 113,
               "life_safety": false } ],
  "exceptions": [ { "tag": "AHU-3", "stage_group": "Plumbing / Domestic",
                    "column": null, "applicable": false,
                    "rationale": "…", "confidence": 0.62 } ] }
```

## Budget

`prose`, narrowed to **4,000**. A bounded question has a short answer.

The history is worth keeping, because it cost real money to learn. At a 16,000
ceiling on the whole-matrix question the model burned the entire allowance
thinking and returned nothing — six times, about $1.58. Narrowing the ceiling
alone did not fix it: at 5,000 it still spent all 5,000 reasoning and emitted zero
text.

**The budget was never the problem; the question was.** A ceiling is a latency
budget as well as a cost budget, but no ceiling rescues a question that has no
floor. Reshaping the task to one group per call is what made a small budget
sufficient rather than merely cheap.
