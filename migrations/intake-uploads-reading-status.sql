-- `reading` — the state progressive staging created. [KEEL] Phase 5a.
--
-- A DEVIATION FROM WHAT I SAID, REPORTED RATHER THAN SLIPPED IN. The Phase 5
-- migration was scoped to `intake_rows` only, so that 3o's re-homing of the
-- UPLOAD side would not have to be rewritten around it. This touches
-- `intake_uploads`. Why it is still safe:
--
--   3o (DOCUMENTS-TAB-PROPOSAL §3.1) adds `pool_document_id`, makes
--   `storage_path` nullable, and adds a NEW constraint `intake_uploads_one_source`.
--   This alters a DIFFERENT constraint — `intake_uploads_status_check` — and adds
--   one permitted value to it. The two do not touch the same column or the same
--   constraint, and this one is purely additive: every status that was legal
--   before is legal after.
--
-- WHY IT IS NEEDED. Before 5a a spreadsheet was parsed and staged in one act, so
-- an upload was either `uploaded` or `parsed` — there was no in-between to name.
-- The model leg takes 20–105s per sheet, so sheets now stage AS THEY COMPLETE and
-- a run can be interrupted halfway. That state is real whether or not it has a
-- name, and the ruling was explicit: a partially-staged upload must be visible as
-- what it is, never a mystery half-population.
--
-- FOUND THE HARD WAY, and worth recording. The orchestrator was written to insert
-- `status: 'reading'` before anyone checked the constraint permitted it. The
-- insert was rejected, the run produced nothing at all, and the sighted gate
-- reported "0 sheets staged" — which reads as a broken pipeline and was a rejected
-- write. That is *a contract is only as real as the table it lands in*, arriving
-- from the other direction: not a column that silently swallowed a value, but a
-- constraint that loudly refused one nobody had asked about.

begin;

alter table intake_uploads drop constraint if exists intake_uploads_status_check;

alter table intake_uploads add constraint intake_uploads_status_check
  check (status in (
    'uploaded',    -- the file is stored; nothing has been read
    'reading',     -- a run is in flight, or was interrupted part-way (5a)
    'parsed',      -- every sheet was read and staged
    'reviewing',   -- a human is ruling on the staged rows
    'approved',    -- the approved rows were written to the register
    'failed'       -- the read could not complete and produced nothing usable
  ));

comment on column intake_uploads.status is
  'uploaded | reading | parsed | reviewing | approved | failed. `reading` means a '
  'per-sheet run is in flight OR was interrupted: rows for completed sheets are '
  'already staged and the upload is resumable by content hash. Added with the '
  'browser orchestrator (extraction Phase 5a), because progressive staging made '
  'the half-read state real.';

commit;
