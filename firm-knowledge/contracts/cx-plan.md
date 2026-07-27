# Feature contract — Cx Plan composer

**A FEATURE, NOT AN AGENT.** This file sits *above* the agent split and is loaded
alongside whichever agent the feature is composing (`runAgent(..., { feature:
'cx-plan' })`).

It states what is true of **this document**. It states nothing about how the
writer drafts or how the verifier checks — those live in
`firm-knowledge/agents/writer.md` and `agents/verifier.md`, and this file
**references them, never restates them**. Two copies of a rule are two rules that
will drift, which is the failure this whole architecture is built against.

## Agents this feature composes

| Agent | Role here |
|---|---|
| [`writer`](../agents/writer.md) | drafts the narrative sections |
| [`verifier`](../agents/verifier.md) | checks each draft against the facts it was given |

The writer's "what it never sees" guarantee and the verifier's isolation are
**stated once, in those contracts**. If you are looking for them, that is where
they are.

## What this feature drafts

**Narrative sections only** (tagged **N** in the exemplars): Background, the
process overview, per-party responsibility lines, the operational-testing
narrative, and on the tender tier the ILS, TAB and schedule narratives.

Every other section is **boilerplate (B)** or **deterministic data (D)** and is
assembled by `cx-plan-assembly` after the prose returns.

## The deterministic layer — this feature's own boundary

Assembled **after** the prose and never placed in any prompt:

- the commissioning team table (rendered from the project team matrix verbatim)
- the systems and equipment lists
- deliverables and submittals
- the project header, document number, revision label and dates
- appendix references

## Document-specific rules

1. **Tiers.** `standard` and `tender` share one section library; the tender tier
   is the standard tier **plus five chapters**, not a different document. The
   exemplar supplied to the writer is chosen by tier.
2. **Role designation** is the project's ruled `CxA` or `CxP`. "Commissioning
   Agent" is retired — see `terminology.md`.
3. **Rule 4 — an issued revision is frozen.** Drafting into an issued plan is
   refused server-side, not merely hidden in the UI.
4. **Approval is explicit.** Generation requires `status = 'approved'`, and
   approval requires every narrative section accepted by a human. There is no
   auto-approval path — not a setting, not a flag.

## Review surface

`cx_plan_sections` — facts beside prose, per-section accept / edit /
regenerate-with-a-note. Verifier flags render as highlights and **do not block**;
the CxA rules on each.

Accepted-verbatim vs edited drafts, and confirmed vs dismissed flags, feed the
`agent_feedback` ledger for the librarian's harvest.
