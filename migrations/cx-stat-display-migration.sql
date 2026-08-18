-- CX STAT DISPLAY — the record of migration cx_stat_display (W1, ruled
-- 2026-08-18 from the owner's field report: the bulk-gesture work displaced
-- the per-column instrument with the gesture's vocabulary).
--
-- TWO ELEMENTS, TWO JOBS: the column stat is an INSTRUMENT (completion by
-- default — unit n/N, type K/N, consistent with what the PDF, the workbook
-- and the portal already print); the bulk gesture is a BUTTON with its own
-- affordance and its own remaining-count language. This column stores the
-- instrument's per-column display preference — completion ↔ remaining —
-- project-scoped and team-editable per §4.3, toggled by clicking the stat
-- cell, persisted across sessions.
--
-- DISPLAY ONLY. cx-counting is untouched; exports and the portal continue
-- printing completion ("remaining" as an export option would be its own
-- ruling).

alter table public.project_cx_columns
  add column if not exists stat_display text not null default 'completion'
  check (stat_display in ('completion','remaining'));

select count(*) as cols, count(*) filter (where stat_display = 'completion') as completion_default
from public.project_cx_columns;
