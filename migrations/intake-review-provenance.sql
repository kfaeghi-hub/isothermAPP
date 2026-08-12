-- Extraction Phase 5 — the columns the review screen has never had.
-- [KEEL] 2026-08-12.
--
-- WHY THIS TOUCHES `intake_rows` AND NOTHING ELSE.
--
-- BACKBURNER 3o (the Documents pool) re-homes the UPLOAD side later:
-- `intake_uploads` gains `pool_document_id`, `storage_path` becomes nullable, and
-- a one-source check constraint arrives with it (DOCUMENTS-TAB-PROPOSAL §3.1).
-- That proposal names this migration as the collision surface by name.
--
-- So the two are kept on opposite sides of the seam: 3o owns `intake_uploads`,
-- this owns `intake_rows`, and neither has to be rewritten because the other
-- shipped first. §3.1 also says intake "keeps intake_uploads / intake_rows exactly
-- as they are" on the upload side — nothing here contradicts that, because every
-- column below is about a ROW's reading, not about where the file lives.
--
-- WHAT THE REVIEW SCREEN COULD NOT SAY BEFORE THIS:
--
--   · which reader produced this row, or this field
--   · that two readers disagreed, and what each said
--   · that the extractor asked a question the sheet does not answer
--   · that a second pass checked a value against a cell, and what it found
--   · why the row was read the way it was
--
-- All five existed in the pipeline and died at the database boundary. The
-- extractor's own `reasoning` field has been accepted by the contract and
-- discarded on arrival since the feature shipped.

begin;

-- WHICH READER. 'rules' | 'model' | 'both' — 'both' means they agreed, which is
-- evidence rather than a tie. Nullable: every row written before today was read by
-- the deterministic path alone, and backfilling a claim about how they were read
-- would be inventing provenance for rows nobody can re-derive.
alter table intake_rows
  add column if not exists read_via text
    check (read_via is null or read_via in ('rules', 'model', 'both'));

-- PER-FIELD ATTRIBUTION. { descriptor: { rules, model, from, agreed }, … }
-- The review screen needs "which reader said this" at FIELD level, not row level:
-- a row can be agreed on its tag and disputed on its type.
alter table intake_rows
  add column if not exists claims jsonb;

-- THE ARGUMENT, KEPT. One entry per disagreement: kind, field, what each leg said,
-- and a plain sentence. Phase 3's ruling — a disagreement is an output, never a
-- resolution — has nowhere to live without this.
alter table intake_rows
  add column if not exists disagreements jsonb;

-- QUESTIONS THE SHEET DOES NOT ANSWER. [{ about, question, where }]
-- "MBH column: input or output? The schedule doesn't say." A guess here would
-- arrive wearing a confidence score, which is worse than a blank.
alter table intake_rows
  add column if not exists questions jsonb;

-- THE SECOND PASS. { checks: [{ field, verdict, cell, found }], totals, missed }
-- `verdict` is enumerated in the agent contract (supported | contradicted |
-- not_found); it is stored as jsonb here rather than normalised because the
-- review screen reads it whole and nothing queries across it yet. When something
-- does, that is a migration with a reason rather than a guess made today.
alter table intake_rows
  add column if not exists verification jsonb;

-- WHY THIS ROW WAS READ THIS WAY. Accepted by `ExtractorOutput.rows[].reasoning`
-- since the feature shipped and dropped on arrival every time.
alter table intake_rows
  add column if not exists reasoning text;

-- Rows carrying an unresolved disagreement or an open question are the ones a
-- reviewer should see first, and the review screen orders by confidence ascending.
-- This index serves the "show me what needs a human" read without changing it.
create index if not exists intake_rows_needs_review
  on intake_rows (upload_id)
  where disagreements is not null or questions is not null;

comment on column intake_rows.read_via is
  'Which reader produced this row: rules | model | both. NULL for rows staged before Phase 5 — their provenance is not recoverable and is not invented.';
comment on column intake_rows.disagreements is
  'Where the two readers disagreed, with both readings. A disagreement is an output, never a resolution (extraction Phase 3).';
comment on column intake_rows.questions is
  'Ambiguities the source does not resolve, carried as questions rather than guessed (extraction Ruling 3.2).';
comment on column intake_rows.verification is
  'The row-verifier second pass: per-claim verdicts with source cells, totals reconciliation, and the miss-hunt (extraction Phase 4).';

commit;
