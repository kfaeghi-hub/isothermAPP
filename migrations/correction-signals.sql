-- Correction capture: every human disposition on a provenance row becomes a
-- structured signal. [KEEL] Phase 6, ruled 2026-08-13.
--
-- WHAT A SIGNAL IS. The machine proposed (a type, a confidence, two readers'
-- claims); a human disposed (accepted, edited naming a reading, rejected). That
-- pair — proposal, outcome, context — is the raw material harvest Phase 1
-- mines. docs/CORRECTION-SIGNALS.md is the contract harvest builds against.
--
-- CAPTURE IS PASSIVE, BY CONSTRUCTION. A trigger observes the EXISTING
-- disposition path — the same UPDATE the review UI has always written — and
-- composes the signal from the row itself. Review behavior changes not at all;
-- no caller can forget to capture; and there is NO SECOND DOOR:
--
--   · the trigger function is SECURITY DEFINER and the table has NO insert
--     policy, so signals are written by the trigger or not at all. A signal
--     that could be forged by a direct insert would poison the track record
--     harvest reads, so direct inserts REFUSE.
--   · provenance rows only (read_via is not null): a legacy row's disposition
--     is a decision about data with no machine proposal attached — there is
--     no signal in it.
--   · pending -> settled transitions only. Re-disposing is not re-proposing.
--
-- LIFETIME rides the upload (on delete cascade): a ZZ-TEST fixture's cleanup
-- takes its signals with it, and real uploads are never deleted post-approval.
-- row_id is SET NULL so a signal survives its staged row's own housekeeping.

begin;

create table if not exists correction_signals (
  id             uuid primary key default gen_random_uuid(),
  captured_at    timestamptz not null default now(),

  -- ── context ────────────────────────────────────────────────────────────────
  upload_id      uuid not null references intake_uploads(id) on delete cascade,
  row_id         uuid references intake_rows(id) on delete set null,
  project_id     uuid not null,
  source_sheet   text,
  tag            text,
  -- THE SEAM, NAMED NOT BUILT (ruled): sheet-kind corrections from the future
  -- Documents pool feed this same table with their own surface value.
  source_surface text not null default 'intake-review',

  -- ── the machine's proposal, frozen at disposition time ────────────────────
  read_via       text,
  confidence     numeric,
  proposed_type  text,
  had_conflict   boolean not null default false,
  conflict_rules text,
  conflict_model text,
  questions_attributed int not null default 0,
  verification_ran boolean,

  -- ── the human's outcome ───────────────────────────────────────────────────
  disposition    text not null,          -- accepted | edited | rejected
  edited         jsonb,                  -- what changed, when disposition = edited
  chosen_leg     text,                   -- rules | model | other — a resolved conflict names its reading
  question_state text,                   -- answered-via-edit | accepted-unanswered | rejected-with-question
  resolved_by    uuid
);

comment on table correction_signals is
  'One row per human disposition on a provenance intake row: the machine''s '
  'proposal, the human''s outcome, and the context. Written ONLY by the '
  'capture trigger (no insert policy — a forgeable signal would poison the '
  'track record). The contract harvest Phase 1 mines: docs/CORRECTION-SIGNALS.md.';

create index if not exists correction_signals_upload on correction_signals (upload_id);
create index if not exists correction_signals_type on correction_signals (proposed_type);

-- Read for staff; write for NOBODY — the trigger is the only author.
alter table correction_signals enable row level security;
drop policy if exists cs_read on correction_signals;
create policy cs_read on correction_signals for select
  using (is_admin_or_dev() or is_project_member(project_id));

-- ── the capture ───────────────────────────────────────────────────────────────
create or replace function capture_correction_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  conflict_elem jsonb;
  q_count int;
  leg text;
  q_state text;
begin
  -- the type-conflict element, if the readers disagreed at the type level
  select elem into conflict_elem
  from jsonb_array_elements(coalesce(new.disagreements, '[]'::jsonb)) elem
  where elem->>'kind' = 'type-conflict'
  limit 1;

  q_count := coalesce(jsonb_array_length(new.questions), 0);

  -- which reading a resolved conflict took. 'other' is a human naming a THIRD
  -- type both readers missed — itself a strong signal.
  if conflict_elem is not null and new.disposition = 'edited'
     and new.edited ? 'proposed_type' then
    leg := case new.edited->>'proposed_type'
      when conflict_elem->>'rules' then 'rules'
      when conflict_elem->>'model' then 'model'
      else 'other' end;
  end if;

  if q_count > 0 then
    q_state := case new.disposition
      when 'edited'   then 'answered-via-edit'
      when 'accepted' then 'accepted-unanswered'
      else 'rejected-with-question' end;
  end if;

  insert into correction_signals (
    upload_id, row_id, project_id, source_sheet, tag,
    read_via, confidence, proposed_type, had_conflict,
    conflict_rules, conflict_model, questions_attributed, verification_ran,
    disposition, edited, chosen_leg, question_state, resolved_by
  ) values (
    new.upload_id, new.id, new.project_id, new.source_sheet, new.tag,
    new.read_via, new.confidence, new.proposed_type, conflict_elem is not null,
    conflict_elem->>'rules', conflict_elem->>'model', q_count,
    (new.verification->>'ran')::boolean,
    new.disposition, new.edited, leg, q_state, new.resolved_by
  );
  return new;
end $$;

drop trigger if exists capture_correction on intake_rows;
create trigger capture_correction
  after update of disposition on intake_rows
  for each row
  when (old.disposition = 'pending'
        and new.disposition in ('accepted', 'edited', 'rejected')
        and new.read_via is not null)
  execute function capture_correction_signal();

commit;
