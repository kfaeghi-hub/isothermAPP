-- Multiple responsible parties per meeting item. [KEEL] F1, ruled 2026-08-19.
--
-- WHAT THIS SUPERSEDES (never deletes): meeting_items.responsible_assignment_id
-- (FK → project_team_assignments, ON DELETE SET NULL) + responsible_text — ONE
-- party per item, either a matrix seat or free text. Real items are shared
-- ("Isotherm to update comments, Dialogue to provide feedback" is one item,
-- two parties). The junction keeps the exact duality per PARTY: each row is a
-- seat reference OR a free-text label, never both, ordered.
--
-- SUPERSEDE-NEVER-DELETE: the legacy columns REMAIN and are not dropped or
-- rewritten — today's single value is BACKFILLED as the item's first (only)
-- junction row; zero data invented, zero lost. Readers prefer junction rows
-- when any exist and fall back to the legacy pair otherwise, so an item
-- untouched since this migration renders exactly as it always did.
--
-- SAFE WHILE THE OWNER IS MID-EDIT: additive DDL only (new table), and the
-- backfill writes the NEW table only. Idempotent: the backfill skips items
-- that already have junction rows.

begin;

create table if not exists meeting_item_responsibles (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references meeting_items(id) on delete cascade,
  -- The same seat FK the legacy column carried, same ON DELETE SET NULL: a
  -- deleted seat blanks the reference, and the reader's label fallback names
  -- the hole rather than hiding the row.
  assignment_id uuid references project_team_assignments(id) on delete set null,
  text_label    text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  -- a PARTY is a seat or a name, never both and never neither
  constraint mir_exactly_one check (
    (assignment_id is not null and text_label is null)
    or (assignment_id is null and text_label is not null and btrim(text_label) <> '')
  )
);

comment on table meeting_item_responsibles is
  'One row per responsible party on a meeting item (F1, 2026-08-19). Supersedes '
  'meeting_items.responsible_assignment_id/responsible_text, which remain as '
  'the frozen legacy pair: readers prefer junction rows when any exist. Each '
  'row is a matrix-seat reference OR a free-text label, ordered by sort_order.';

create index if not exists mir_item on meeting_item_responsibles (item_id);
create index if not exists mir_assignment on meeting_item_responsibles (assignment_id);

-- RLS mirrors meeting_items exactly (acc_all via meeting membership).
alter table meeting_item_responsibles enable row level security;
drop policy if exists mir_all on meeting_item_responsibles;
create policy mir_all on meeting_item_responsibles for all
  using (is_admin_or_dev() or exists (
    select 1 from meeting_items mi where mi.id = item_id
      and is_member_via_meeting(mi.meeting_id)))
  with check (is_admin_or_dev() or exists (
    select 1 from meeting_items mi where mi.id = item_id
      and is_member_via_meeting(mi.meeting_id)));

-- ── backfill: today's single value becomes the first entry ──────────────────
insert into meeting_item_responsibles (item_id, assignment_id, text_label, sort_order)
select mi.id, mi.responsible_assignment_id, null, 0
from meeting_items mi
where mi.responsible_assignment_id is not null
  and not exists (select 1 from meeting_item_responsibles r where r.item_id = mi.id);

insert into meeting_item_responsibles (item_id, assignment_id, text_label, sort_order)
select mi.id, null, mi.responsible_text, 0
from meeting_items mi
where mi.responsible_assignment_id is null
  and mi.responsible_text is not null and btrim(mi.responsible_text) <> ''
  and not exists (select 1 from meeting_item_responsibles r where r.item_id = mi.id);

commit;
