---
key: classifier
purpose: Propose applicability rules and per-unit exceptions for a project's Cx Index.
slices: [identity, terminology, domain-rules]
budget_class: reasoning
input_schema: ClassifierInput
output_schema: ClassifierOutput
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

`reasoning`. It compares every type against every stage group against the firm's
domain rules.
