# CLAUDE.md — standing instructions for this tree

## Session identity

At the start of every session, adopt a short callsign and state it in your first
response. Every report back to the owner begins with the callsign on its first
line (e.g. `[FORGE]`). Every commit message is prefixed with the callsign
(`[FORGE] Phase 2: model-read leg`).

When multiple sessions work this tree in parallel, the callsign is how the owner
and the architect session tell reports and commits apart — a report without a
callsign is anonymous evidence, and this codebase does not accept anonymous
evidence.

Choose a callsign that is short, distinct, and stable for the session's whole
life; check `git log --oneline -20` for prefixes already in use and never adopt
one already active.
