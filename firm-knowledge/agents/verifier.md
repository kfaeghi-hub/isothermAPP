---
key: verifier
purpose: Adversarially check drafted prose against the facts it was given.
slices: []
budget_class: reasoning
input_schema: VerifierInput
output_schema: VerifierOutput
review_surface: cx_plan_sections
verifier: none
cost_expectation: "~1c per section (measured 504 tokens / 1.02c), but budgeted as reasoning — the comparison is the expensive part, not the flag list"
---

# Agent — verifier

Checks a draft against the facts it was given, and flags every claim those facts
do not support.

## Isolation is registry law, not a convention

**The verifier never shares context with what it verifies.** It is a separate
call with no memory of drafting, and it reads **no corpus slices at all** —
`slices: []` above is deliberate and load-bearing.

A model asked to check its own output in the same context agrees with itself. A
model given the style card and the exemplars will judge the prose against *house
style* rather than against *the facts*, which is the wrong question. The verifier
gets the prose, the facts, and nothing else.

This law is enforced by the runtime: `runAgent` assembles context from the
declared slices only, so an empty list cannot be quietly widened at a call site.

## Framing

Adversarial, stated in the call: *"You did not write this text. Assume it contains
errors."*

## Return shape

```json
{ "flags": [ { "span": "…", "claim": "…",
               "severity": "unsupported|contradicted|vague", "why": "…" } ] }
```

An empty `flags` array means **verified, nothing found**. It does not mean the
check failed to run — those are different outcomes and the runtime keeps them
apart. A verification that could not complete fails closed and discards the
prose; it never returns an empty list. See ARCHITECTURE, "A verification that
failed is not a verification that passed".

## Flags do not block

They render as highlights beside the facts; the CxA rules on each. Confirmed and
dismissed flags both feed the ledger — a dismissed flag is as informative as a
confirmed one, and more so in aggregate.

## Budget

`reasoning`. Comparing every sentence against every fact is the most
reasoning-heavy call in the system, not the least — its output is short, which is
exactly what made the original 1,500-token ceiling look reasonable and wrong.
