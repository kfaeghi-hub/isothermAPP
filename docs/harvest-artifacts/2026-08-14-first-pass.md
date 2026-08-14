# Harvest librarian — first pass, 2026-08-14

*Read-only (Phase 1). Threshold to propose: ≥3 occurrences, 0 contradictions — stated here so the numbers mean something. Erring machine for the replay corpus: `93d2fe9`. Evidence pointers are correction_signals UUIDs; client values stay behind them, in the database.*

Signals read: 7 · machine side joined: 100%

## Rediscoveries (already held by the deterministic layer — the capture works)

- **SERVICE → area_served** — 7 occurrences, 0 contradictions · column attribution: SERVICE: 7/7 · sheets: Sheet1 · ALREADY HELD by the deterministic layer (measured: today's parser lands a SERVICE column in area_served) — REDISCOVERY, not proposed
  - signals: 65e65395-8696-4944-9c70-ecd41cca2136, b8ce5f80-5986-4456-b882-5dceb0326925, 9e49174d-e93d-46ec-82bb-4d4e04411eda, 8953bbe0-a0b6-4c3a-b00a-147f659a6300, d9eec373-3330-4819-a5e4-656dac602c59, 4b7d9b4c-bf3d-4904-bcbc-6278a3fab83f, 900a4eda-facf-4e03-93f9-e1c63b3b877b

## Proposals (would enter the ratification queue — Phases 3–4, not greenlit)

*(none)*

## Below threshold (listed, never proposed)

- boiler→pump — 2× (type_correction) · signals: 8953bbe0-a0b6-4c3a-b00a-147f659a6300, d9eec373-3330-4819-a5e4-656dac602c59
- NULL→pump — 2× (type_correction) · signals: 4b7d9b4c-bf3d-4904-bcbc-6278a3fab83f, 900a4eda-facf-4e03-93f9-e1c63b3b877b

## Leg reliability

- rules·edited: 7

## Title-typed confirmation rate (§7b named line)

- not computable on this corpus: the erring machine predates typeFrom staging, and the live orchestrator does not stage typeFrom either — NAMED GAP; the rate becomes computable when typeFrom stages (flagged, not built)

## Question quality

- no question-carrying dispositions in the corpus yet

## Capture-scope findings

- nameplate/field-alias corrections have NO disposition path: the review surface has no nameplate editor, so a MAX INPUT-class lesson is invisible to capture today. Found by replay, reported before it cost a confused gate.

## Alias history (read-only source)

- {"added":1,"removed":1} — probe rows from the 3r gate self-clean; real vocabulary changes accumulate here for future passes.
