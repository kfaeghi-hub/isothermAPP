---
key: writer
purpose: Draft narrative prose for a document section from supplied facts only.
slices: [identity, style, terminology, domain-rules, exemplar]
budget_class: prose
input_schema: WriterInput
output_schema: WriterOutput
review_surface: cx_plan_sections
verifier: verifier
cost_expectation: "~10c per section (Roles, the heaviest, measured at 5,211 tokens / 10.44c)"
---

# Agent — writer

Drafts the **narrative** of a document. It is the only agent that produces prose a
client will read, which is why every other constraint here exists.

## What it never sees

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

## Budget

`prose` class. The ceiling is a **total generation budget including reasoning** —
on this corpus a section returning ~450 tokens of prose spends ~4,900 getting
there. A budget sized for the output is sized for about eight per cent of the
call. See ARCHITECTURE, "max_tokens is a TOTAL GENERATION BUDGET".
