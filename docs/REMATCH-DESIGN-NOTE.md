# Re-match over from_schedule — design note, DESIGN ONLY

*[KEEL] Ruled 2026-08-17: mechanism, safety argument, and invocation shape.
Nothing here is built or run on any real project — the act itself gets ruled
separately when this note arrives.*

## Problem statement

A heading unmatched at approval stays unmatched forever, even after the
vocabulary learns its name. The unit-normalization whitelist just made ~30
Central Tech readings bridgeable (`L/S` → `L/s`) — but they were refused at
their approval and live only in `from_schedule`. Every future def addition,
field alias, or normalization entry creates the same stranded class: the
knowledge improves, the already-imported registers don't.

## Mechanism

A targeted, additive, explicit second pass:

```
for each equipment row of <project> [optionally: one type] with from_schedule:
  verdicts = matchScheduleSpec(from_schedule, declaredFor(type))   // TODAY's whitelist + aliases
  for each verdict in (exact | converted | compound):
    if spec[declared_field] is ABSENT → candidate write
    else                             → skip (present = untouchable)
```

`from_schedule` is never modified — it stays the verbatim document record that
makes the pass possible at all. The matcher is the same one approval runs
(one source; the path is already battery-asserted), so a re-match can never
disagree with what a fresh import of the same sheet would produce today.

## Safety argument

- **Additive-only is the whole guarantee.** A field holding *any* value —
  machine-written at approval, human-edited since, anything — is skipped.
  This subsumes "edited-values-skipped" without needing an edit ledger that
  `nameplate_extra` does not have: present means untouchable. The pass can
  only fill blanks.
- **Idempotent by construction:** a second run finds its own writes present
  and lands zero candidates.
- **Explicit act, scoped:** one project per invocation, named in the command;
  no fleet mode exists. Dry-run is the default; `--apply` is the deliberate
  step (the repoint precedent, `avondale-repoint.mjs`).
- **Attributed:** an `import_batches` row per applied run — counts as-is /
  converted (arithmetic named) / refused, the source (`from_schedule
  re-match`), and the whitelist's commit hash, so a register value always
  traces to the pass and the vocabulary revision that produced it.
- **Refusals hold:** unit-mismatch and compound count-mismatch write nothing,
  exactly as at approval. The dry run prints per-field verdicts shape-only
  (field names and units, never client values, if the output is kept).
- **Resolve-and-refuse guard** (ops law): the script resolves the project by
  id and refuses on any ambiguity; harness-locked like every other writer.

## Invocation shape (not built)

```
node --env-file=.env rematch-from-schedule.mjs --project <uuid> [--type pump]           # dry run
node --env-file=.env rematch-from-schedule.mjs --project <uuid> [--type pump] --apply   # the act
```

Output, both modes: per-tag lines `<tag>: <field> ← <verdict>` plus the tally;
`--apply` additionally files the batch row and prints its id.

## What would make this wake

The whitelist landing (done, 2026-08-17) already created the first stranded
class worth reclaiming — Central Tech's ~30 L/S flows. The act on that project
is the natural first ruling when the owner wants those numbers on screen.
