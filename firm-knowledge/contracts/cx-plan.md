# Feature contract — Cx Plan composer

Read by `ai-common` for `feature: 'cx-plan'`. Governs what the drafting call is
asked to do and, more importantly, what it is never asked to do.

## What the model drafts

**Narrative sections only** (tagged **N** in the exemplars): Background, the
process overview, per-party responsibility lines, operational-testing narrative,
and on the tender tier the ILS/TAB/schedule narratives.

## What the model NEVER sees or writes

The deterministic layer is assembled **after** the prose returns and is never in
the prompt:

- the commissioning team table (rendered from the project team matrix verbatim)
- the systems and equipment lists
- deliverables and submittals
- the project header, document number, revision label and dates
- appendix references

The model is not instructed to avoid inventing a name — it is **never given the
opportunity**, which is a stronger guarantee than an instruction.

## Hard constraints, stated in every call

1. Use ONLY the facts supplied. If a fact is absent, **omit the claim**. Never
   estimate, never generalise, never emit a placeholder.
2. Do not restate any table or list that arrives as data.
3. Obey the style card's modal discipline: `shall` for another party's
   obligation, `will` for Isotherm's intent, `is/are` for fact.
4. Return the prose **and an enumeration of every factual claim it contains**,
   each citing the fact key that supports it. An unsupported claim must be
   omitted, not cited to nothing.

## Return shape

```json
{ "prose": "…",
  "claims": [ { "text": "…", "supported_by": "fact_key" } ] }
```

## Verification call

A **separate call with no memory of drafting** — a model asked to check its own
output in the same context agrees with itself. Framed adversarially: "You did not
write this text. Assume it contains errors."

```json
{ "flags": [ { "span": "…", "claim": "…",
               "severity": "unsupported|contradicted|vague", "why": "…" } ] }
```

Flags **do not block**. They render as highlights; the CxA rules on each.

## Budget

One drafting call and one verification call per section. Regeneration with a note
is one further pair, for that section only. Every call is logged to
`ai_generations` with model, tokens and cost.
