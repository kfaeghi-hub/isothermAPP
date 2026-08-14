-- 3r: alias provenance stops being erasable. [KEEL] 2026-08-14, ruled wake:
-- fix before harvest Phase 1 builds.
--
-- THE DEFECT (BACKBURNER 3r, found via the DOAS incident): saveAliases saved a
-- type's alias list as DELETE-ALL-THEN-REINSERT, wiping created_by, created_at,
-- and the ruling note for EVERY alias on the type on every ordinary edit. The
-- owner's own deliberate DOAS move destroyed the Seneca-precedent note on the
-- way through, and the edit took forensic timestamp reconstruction to
-- attribute. Harvest mines the correction trail; a UI whose every save erases
-- authorship is destroying harvest's own evidence.
--
-- TWO REPAIRS, this file and the UI diff-save that ships with it:
--   · the UI now writes a DIFF — only aliases actually added or removed are
--     touched, so an untouched alias's provenance is byte-identical after an
--     unrelated edit (the gate asserts this by read-back)
--   · every deliberate change leaves a TRAIL — this table, written only by
--     triggers. A removed or re-pointed alias's provenance is CARRIED into the
--     history rather than destroyed. Had this existed, the 20:37 DOAS edit
--     would have been attributable in seconds.
--
-- THE SEAM STAYS A SEAM (ruled): alias changes are vocabulary corrections —
-- the same class harvest mines, source-surface family of Phase 6's
-- correction_signals seam — but they are NOT wired into correction_signals
-- here. 3r preserves evidence; harvest Phase 1 decides who consumes it.

begin;

create table if not exists equipment_type_alias_history (
  id               uuid primary key default gen_random_uuid(),
  changed_at       timestamptz not null default now(),
  -- auth.uid() of the editor; NULL = a service-role or migration write, which
  -- is itself attribution (there are only two non-human writers and both
  -- commit to git).
  changed_by       uuid,
  action           text not null check (action in ('added', 'removed', 'updated')),
  type_key         text not null,
  alias            text not null,
  -- The displaced row's provenance, carried not destroyed. NULL on 'added'
  -- (nothing was displaced). On 'updated', the BEFORE values.
  prior_created_by uuid,
  prior_created_at timestamptz,
  prior_note       text,
  new_note         text
);

comment on table equipment_type_alias_history is
  'Append-only trail of vocabulary alias changes: who, when, what, and the '
  'displaced row''s provenance carried whole. Written ONLY by triggers — the '
  'UI cannot reach it at all, destructively or otherwise (3r ruling: the '
  'history has no edit path). Vocabulary corrections are source-surface family '
  'to correction_signals (Phase 6 seam); wiring them into harvest''s mining '
  'scope is harvest Phase 1''s call, not made here.';

create index if not exists etah_alias on equipment_type_alias_history (alias);
create index if not exists etah_type on equipment_type_alias_history (type_key);

-- Read for staff. NO client write path in any direction — not insert, not
-- update, not delete. The triggers are SECURITY DEFINER; everything else
-- refuses.
alter table equipment_type_alias_history enable row level security;
drop policy if exists etah_read on equipment_type_alias_history;
create policy etah_read on equipment_type_alias_history for select
  using (is_staff());

-- ── the trail ─────────────────────────────────────────────────────────────────
create or replace function record_alias_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into equipment_type_alias_history (changed_by, action, type_key, alias, new_note)
    values (auth.uid(), 'added', new.type_key, new.alias, new.note);
    return new;
  elsif tg_op = 'DELETE' then
    insert into equipment_type_alias_history
      (changed_by, action, type_key, alias, prior_created_by, prior_created_at, prior_note)
    values (auth.uid(), 'removed', old.type_key, old.alias, old.created_by, old.created_at, old.note);
    return old;
  else
    -- an UPDATE — including a note re-attachment or a type_key re-point done
    -- in place. Before-values carried; the DOAS re-attach would have been a
    -- row here instead of a hand-written commit message.
    insert into equipment_type_alias_history
      (changed_by, action, type_key, alias, prior_created_by, prior_created_at, prior_note, new_note)
    values (auth.uid(), 'updated', new.type_key, new.alias, old.created_by, old.created_at, old.note, new.note);
    return new;
  end if;
end $$;

drop trigger if exists alias_history on equipment_type_aliases;
create trigger alias_history
  after insert or update or delete on equipment_type_aliases
  for each row execute function record_alias_history();

commit;
