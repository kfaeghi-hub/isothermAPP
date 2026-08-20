-- MEETING ITEMS RICH COLUMN — Phase 3 of RICH-TEXT-PROPOSAL (ruled 2026-08-20,
-- Phase 3 GO with Amendment 1: editor + expand shell are one package). The F1
-- shape: discussion_rich jsonb beside the legacy discussion column; discussion
-- becomes the trio's maintained plain projection (Action Summary and dashboard
-- truncations read it by construction). The tripwire ships in its NULL-HOSTILE
-- form from birth — the Phase 1b lesson (a jsonb string's ->>'type' is NULL
-- and a NULL CHECK verdict passes) applied, third surface running.

alter table public.meeting_items
  add column if not exists discussion_rich jsonb;

alter table public.meeting_items add constraint meeting_items_rich_is_doc check (
  discussion_rich is null
  or (jsonb_typeof(discussion_rich) = 'object' and discussion_rich->>'type' = 'doc'));

-- THE DASH-COUNTER RETIRES HERE, against the §1.1 baseline (Q7, ruled):
-- dash-lines in production at retirement: 0 meetings / 3 findings / 0
-- elsewhere. The 3 findings normalized at their Phase 2 door (2026-08-20,
-- 3/3, Seneca DR-2.12/2.14/2.24). ZERO meeting discussions use dash
-- pseudo-bullets — no door normalization is needed on this surface, and the
-- counter's job is done: every production dash-bullet is now a real
-- bulletList. Legacy rows lift lazily on first edit, at the door.
--
-- CARRY-FORWARD LAW (ruled): carry copies junction parties AND the rich doc
-- whole — asserted in pw-meetings.

select count(*) as meeting_items, count(discussion_rich) as with_rich
from public.meeting_items;
