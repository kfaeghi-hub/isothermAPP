-- mir_exactly_one → mir_never_both. [KEEL] 2026-08-19, caught failing-first.
--
-- THE DEFECT: meeting_item_responsibles.assignment_id is ON DELETE SET NULL,
-- and mir_exactly_one required seat XOR text — so nulling the seat ref on a
-- row with no text VIOLATED the check and the seat DELETE ITSELF was refused.
-- The F1 constraint accidentally blocked team-seat deletion anywhere a meeting
-- item referenced the seat — a stricter world than the legacy column ever was.
--
-- THE CORRECTED INVARIANT: never BOTH. A both-null row is the deleted-seat
-- degraded state: pre-issue it renders '—' (the hole is visible, as ruled for
-- the dashboard's sibling finding), post-issue the label_snapshot names what
-- the seat was — which is the whole point of the snapshot.

begin;

alter table meeting_item_responsibles drop constraint if exists mir_exactly_one;
alter table meeting_item_responsibles add constraint mir_never_both check (
  not (assignment_id is not null and text_label is not null)
  and (text_label is null or btrim(text_label) <> '')
);

commit;
