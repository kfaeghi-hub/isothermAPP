-- Responsibility snapshots at issue — the attendee precedent's sibling.
-- [KEEL] Ruled 2026-08-19: an issued document's responsible column can never
-- change retroactively.
--
-- THE HAZARD (F1 audit): meeting_item_responsibles.assignment_id inherits the
-- legacy FK's ON DELETE SET NULL — deleting a team seat blanks responsibility
-- on ALREADY-ISSUED minutes, and regeneration would render '—' where a client
-- read a company's name. Attendees already solved this shape with
-- name_snapshot/company_snapshot; responsibility now does the same.
--
-- MECHANISM: label_snapshot is stamped by the generate endpoint — on any
-- generate of an issued (or issuing) meeting, every junction row WITHOUT a
-- snapshot gets its party ref resolved to the display string and frozen.
-- NEVER overwritten once set: a party added after issue freezes at its first
-- regenerate, and nothing can rewrite an earlier freeze. Document rendering
-- reads snapshot-first; the UI and dashboard stay live (operational views,
-- not issued records).

begin;

alter table meeting_item_responsibles
  add column if not exists label_snapshot text;

comment on column meeting_item_responsibles.label_snapshot is
  'The party''s display string frozen at issue time (never overwritten). '
  'Document rendering prefers this; a deleted seat can no longer blank an '
  'issued minutes'' responsible column. Stamped by generate-minutes.';

commit;
