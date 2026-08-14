-- Sheet-level questions become a ROW OF THEIR OWN. [KEEL] Phase 6, opening commit.
--
-- WHAT THIS NORMALIZES. The 5a orchestrator staged the sheet's whole ambiguity
-- list onto EVERY row of the sheet (intakeOrchestrator staging payload): a
-- 54-row sheet with two sheet-level questions stored them 108 times, and the 5b
-- review UI deduped on render. That was tolerable for display and is wrong as a
-- foundation: Phase 6 treats an ANSWERED question as a correction signal, and
-- capture built on eight staged copies of one question either captures eight
-- answers or carries dedupe logic forever (ruled 2026-08-13).
--
-- THE SHAPE AFTER THIS MIGRATION:
--   · intake_sheet_questions — one row per (upload, sheet, question). The
--     question the READERS asked about the SHEET, once.
--   · intake_rows.questions — ONLY the questions attributed to that row (the
--     pipeline's `where` names the row's tag). A row carries what is ITS.
--
-- No backfill: no production upload carries provenance yet (surveyed
-- 2026-08-13 — every real upload predates the 5a pipeline), so there is
-- nothing to migrate, only a shape to stop.

begin;

create table if not exists intake_sheet_questions (
  id           uuid primary key default gen_random_uuid(),
  upload_id    uuid not null references intake_uploads(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  source_sheet text not null,
  about        text not null,
  question     text not null,
  created_at   timestamptz not null default now(),
  -- A RESUMED run re-stages its sheet; the same question arriving twice is the
  -- same question, not two. The constraint makes that a database fact.
  unique (upload_id, source_sheet, about, question)
);

comment on table intake_sheet_questions is
  'Sheet-level ambiguities from the two-reader pipeline — the questions the '
  'readers asked that could not be attributed to a single row. One row per '
  'question per sheet. Row-attributed questions live on intake_rows.questions. '
  'Phase 6: an answered question is a correction signal, so the storage is '
  'normalized before capture builds on it.';

-- RLS — mirrors intake_rows exactly, same reasoning recorded there.
alter table intake_sheet_questions enable row level security;

drop policy if exists isq_read on intake_sheet_questions;
create policy isq_read on intake_sheet_questions for select
  using (is_admin_or_dev() or is_project_member(project_id));
drop policy if exists isq_write on intake_sheet_questions;
create policy isq_write on intake_sheet_questions for all
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

commit;
