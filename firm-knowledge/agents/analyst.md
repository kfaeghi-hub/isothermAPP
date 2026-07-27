---
key: analyst
purpose: Propose candidate findings from trends, sequences and alarms.
slices: [identity, terminology, domain-rules]
budget_class: reasoning
input_schema: AnalystInput
output_schema: AnalystOutput
review_surface: ai_candidate_findings
verifier: none
cost_expectation: "not yet measured — stub"
---

# Agent — analyst

**STUB. Not built.** Recorded so the registry is visibly complete from the start,
and so BAS-2 arrives as a contract rather than as a prompt inside an endpoint.

## When built

Reads **deterministic analysis output** — trend statistics, sequence-of-operation
extractions, alarm summaries — and proposes candidate findings for the issues log.

Per MASTER-BRIEF §7: rule engine and deterministic checks first, the model for
explanation and drafting. **Never pure model reasoning over raw numeric trends.**

## Its queue survives the telemetry consolidation

`ai_analysis_runs` was superseded by `ai_generations` (D2, 2026-07-27), but
`ai_candidate_findings` (BAS-SPEC §3.8) **survives as this agent's ratification
surface** — one queue among several, not the general mechanism.

A candidate finding is a proposal. **It never becomes an issue without a human
accepting it** — law 7, and the reason `accepted_issue_id` exists on that table.
