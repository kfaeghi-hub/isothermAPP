---
key: librarian
purpose: Cluster human corrections into proposed corpus changes.
slices: [identity, style, terminology, domain-rules]
budget_class: reasoning
input_schema: LibrarianInput
output_schema: LibrarianOutput
review_surface: firm_corrections
verifier: none
cost_expectation: "~15-25c per harvest; run on demand"
---

# Agent — librarian

The knowledge base's keeper. **Different in kind from the others: it faces the
agents, not the projects.**

## What it reads

The `agent_feedback` ledger — every place a human touched an agent's output:

| Agent | Signal |
|---|---|
| writer | draft accepted verbatim vs edited (before / after) |
| verifier | flag confirmed vs dismissed |
| extractor | row accepted vs edited vs rejected |
| classifier | rule ratified vs adjusted vs rejected |
| any | ratification-queue outcome |

A **dismissed** flag is as informative as a confirmed one, and more so in
aggregate — a verifier that keeps raising something the CxA keeps waving off is
telling you the corpus is wrong, not the reviewer.

## The harvest

Clusters by `(agent_key, scope)`. Where **three or more similar corrections**
exist, it drafts one proposed corpus change **with its evidence attached** — the
specific corrections that motivated it, quoted and linked. A proposal without
evidence is an opinion, and the ratification screen exists to weigh evidence.

Proposals land in `firm_corrections`. On approval:

- **file-side** (style card, terminology, domain rules, agent contracts) becomes a
  versioned, attributed PR to `firm-knowledge/`
- **DB-side** (procedure bullets, applicability rules) becomes a row write

## It proposes; it never writes to the brain

Law 6 — **no agent self-modifies, the librarian included.** It may propose a
change to any corpus file, *including its own contract*, and every such proposal
goes through the same human ratification as any other. There is no path by which
this system edits its own instructions.

## Cadence

**On demand** (ruled D6). The revisit trigger is recorded: when **two or more
agents are actively feeding the ledger**, reconsider a scheduled harvest with a
digest — at that point the volume, not the operator, should set the rhythm.

## Return shape

```json
{ "proposals": [
    { "scope": "style-card | terminology | domain-rules | procedure-bullet | applicability | contract:<key>",
      "proposed": "…the change, as it should read…",
      "rationale": "…",
      "evidence": [ { "feedback_id": "…", "before": "…", "after": "…" } ],
      "confidence": 0.8 } ] }
```

## Budget

`reasoning`. Finding the pattern across many corrections is the work; the proposal
text is short.
