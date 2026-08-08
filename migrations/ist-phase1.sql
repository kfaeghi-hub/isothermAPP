-- IST MODULE — PHASE 1: schema + integrations/protocols.
-- Ruled 2026-08-08 from docs/IST-MODULE-PROPOSAL.md. BACKBURNER 3e flips IN PROGRESS.
--
-- CAN/ULC-S1001, Integrated Systems Testing of Fire Protection and Life Safety
-- Systems. Mandatory under OBC 3.2.10.1 since 2020; O. Reg. 87/25 (in force
-- 2026-01-01) made the obligation retroactive to systems installed or modified
-- on or after 2020-01-01. Initial test, retest at one year, then every five.
--
-- THE SHAPE COMES FROM THE FIRM'S OWN ISSUED REPORT, not from a guess at the
-- standard: Scarborough Gardens Arena IST REV2, which is S1001 Appendix C
-- section for section. Where the document and an assumption disagreed, the
-- document won. Three places that mattered:
--
--   1. A protocol's SUBJECT is one of three kinds. Attachment A-1 enumerates
--      CONDITION TYPES (alarm/supervisory/trouble/connection-integrity), A-3
--      enumerates UNITS (ERV-1..DH-1), and A-2 enumerates POINTS with an
--      equipment-type code (S.V./F.S./P.S./L.A.P.S.), stacks several devices
--      under one numbered row, and switches shape mid-attachment back into
--      per-condition sub-tables. A model that assumes one shape bends the firm's
--      document, so `subject_kind` is explicit and the constraint enforces which
--      companion columns each kind may carry.
--
--   2. A RESULT carries its own date, distinct from the session's. Table B-2 is
--      one signed table holding rows tested 2025-11-13 and rows tested
--      2025-11-26. Folding result dates into the session would lose that.
--
--   3. SIGN-OFF IS PER ATTACHMENT TABLE, not per report, and its participants
--      differ per session: B-1 signed by one person on 11-13, B-2 by three
--      across two dates, B-3 by two on 11-27. A report-level signature block
--      would be a different document from the one the firm issues.

-- ── the origin value, and the correction that produced it ────────────────────
-- BACKBURNER 3e said deficiencies would file with `origin = 'ist'` because that
-- value was "already in the origin set", and the proposal repeated it. IT WAS
-- NOT THERE. The enum was (site_visit, ivc, pfc, fpt), later joined by
-- design_review and startup. The first draft of this migration ASSERTED the
-- value's presence and refused to run — which is the only reason the claim was
-- checked before a deficiency tried to use it and failed at the point of entry,
-- in the field, on a live test.
--
-- Outside the transaction on purpose: ALTER TYPE ... ADD VALUE cannot have its
-- new label used in the same transaction that adds it.
alter type public.finding_origin_enum add value if not exists 'ist';

begin;

-- Arrival proven, not assumed: the add above is silent when it is a no-op, so
-- the assertion stays and now guards the thing it can actually catch — the value
-- failing to exist after we tried to create it.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'finding_origin_enum' and e.enumlabel = 'ist'
  ) then
    raise exception 'finding_origin_enum still has no ist value after ADD VALUE; IST deficiencies have nowhere to file';
  end if;
end $$;

-- ── enums ────────────────────────────────────────────────────────────────────

do $$ begin
  create type ist_subject_kind as enum ('condition', 'unit', 'point');
exception when duplicate_object then null; end $$;

do $$ begin
  -- S1001's four condition types, verbatim from the standard and from §5.1.
  create type ist_condition_type as enum ('alarm', 'supervisory', 'trouble', 'connection_integrity');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ist_verdict as enum ('pass', 'fail', 'na');
exception when duplicate_object then null; end $$;

do $$ begin
  -- new = initial test at completion; one_year and five_year are the code cycle;
  -- modification is the trigger O. Reg. 87/25 leans on for existing buildings.
  create type ist_test_type as enum ('new', 'one_year', 'five_year', 'modification');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ist_note_scope as enum ('report', 'attachment', 'row');
exception when duplicate_object then null; end $$;

-- ── 1. the plan, as a versioned artifact ─────────────────────────────────────
-- The document's FIRST table is its revision control: REV 0 draft for review,
-- REV 1 filled with results, REV 2 filled from pre-documentation and engineers'
-- instructions. Each revision carries WHY. Rule 4: an issued revision is frozen;
-- a correction is REV n+1.
create table if not exists ist_plans (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid,
  project_id      uuid not null references projects(id) on delete cascade,
  revision_label  text not null,
  revision_date   date,
  description     text,
  status          text not null default 'draft' check (status in ('draft', 'issued')),
  issued_at       timestamptz,
  issued_by       uuid references user_profiles(id),
  storage_url     text,
  pdf_url         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ist_plans_project on ist_plans(project_id);

-- ── 2. participating systems ─────────────────────────────────────────────────
-- References the register BOTH ways: an equipment row where the system is a
-- unit, a kind='system' type row where it is a system. The system-attachment
-- mechanism's second consumer, and the reason it was built.
--
-- The two prose columns are §3.3's Heading-3 pattern verbatim. They are stored
-- per system per plan because they are project-specific prose — Scarborough's
-- fire alarm description names an EST4 panel in a particular room — not firm
-- boilerplate. Firm-level defaults live in the knowledge layer (phase 4).
create table if not exists ist_systems (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid,
  plan_id                  uuid not null references ist_plans(id) on delete cascade,
  label                    text not null,
  equipment_type_key       text references equipment_types(key) on update cascade,
  equipment_id             uuid references equipment(id) on delete set null,
  overview_description     text,
  integrations_objectives  text,
  sort_order               int  not null default 0,
  created_at               timestamptz not null default now()
);
create index if not exists ist_systems_plan on ist_systems(plan_id);

-- ── 3. integrations — pairwise and first-class ───────────────────────────────
-- §4's Integrations Matrix. Scarborough: three pairs, nine integration rows.
create table if not exists ist_integrations (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid,
  plan_id                  uuid not null references ist_plans(id) on delete cascade,
  system_a_id              uuid not null references ist_systems(id) on delete cascade,
  system_b_id              uuid not null references ist_systems(id) on delete cascade,
  integration_type         text not null,
  normal_mode_behavior     text,
  offnormal_mode_behavior  text,
  attachment_label         text,          -- 'A-1' / 'A-2' / 'A-3' — the sign-off unit
  sort_order               int  not null default 0,
  created_at               timestamptz not null default now(),
  -- An integration is BETWEEN two systems. A row pointing at itself is a data
  -- entry slip that would render as "Fire Alarm / Fire Alarm" in an issued
  -- document, which is the kind of thing nobody reads twice.
  constraint ist_integrations_distinct_systems check (system_a_id <> system_b_id)
);
create index if not exists ist_integrations_plan on ist_integrations(plan_id);

-- ── 4. protocols — THE THREE-KIND SUBJECT ────────────────────────────────────
create table if not exists ist_protocols (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid,
  integration_id    uuid not null references ist_integrations(id) on delete cascade,
  subject_kind      ist_subject_kind not null,
  subject_label     text not null,
  condition_type    ist_condition_type,
  equip_type_code   text,               -- S.V. / F.S. / P.S. / L.A.P.S.
  equipment_id      uuid references equipment(id) on delete set null,
  normal_mode_steps text,
  fire_mode_steps   text,
  expected_result   text,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),

  -- THE COMPANION COLUMNS MUST MATCH THE KIND. Without this, a 'unit' protocol
  -- could carry a condition_type and an 'S.V.' code at once and the generator
  -- would have to guess which attachment shape to render it in. The constraint
  -- is what makes subject_kind mean something rather than merely be recorded.
  constraint ist_protocols_kind_shape check (
    (subject_kind = 'condition' and condition_type is not null  and equip_type_code is null)
 or (subject_kind = 'unit'      and condition_type is null      and equip_type_code is null)
 or (subject_kind = 'point'     and condition_type is null)
  )
);
create index if not exists ist_protocols_integration on ist_protocols(integration_id);

-- ── 5. sessions — a witnessed test event ─────────────────────────────────────
-- §11's ongoing-testing table. Also the mechanism that makes the retest cycle
-- trackable rather than remembered, which is what O. Reg. 87/25 now obliges.
create table if not exists ist_sessions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid,
  plan_id      uuid not null references ist_plans(id) on delete cascade,
  test_date    date not null,
  test_type    ist_test_type not null default 'new',
  description  text,
  records_ref  text,
  created_at   timestamptz not null default now()
);
create index if not exists ist_sessions_plan on ist_sessions(plan_id);

create table if not exists ist_session_participants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid,
  session_id  uuid not null references ist_sessions(id) on delete cascade,
  role_label  text not null,
  company_id  uuid references companies(id) on delete set null,
  contact_id  uuid references contacts(id) on delete set null,
  name_text   text,                    -- free text where the witness is not a contact row
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists ist_session_participants_session on ist_session_participants(session_id);

-- ── 6. results — one per protocol per session ────────────────────────────────
create table if not exists ist_results (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid,
  session_id      uuid not null references ist_sessions(id) on delete cascade,
  protocol_id     uuid not null references ist_protocols(id) on delete cascade,
  normal_verdict  ist_verdict,
  fire_verdict    ist_verdict,
  observed_text   text,
  -- v1 keeps ONE optional numeric. The repeating-measurement structure is
  -- BACKBURNER 3d and this must not become its third copy — named seam, not an
  -- oversight. The 90-second water-flow limit from §5.2 is what it is for.
  numeric_value   numeric,
  numeric_unit    text,
  tested_on       date,                -- distinct from the session date, per B-2
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ist_results_one_per_protocol_per_session unique (session_id, protocol_id)
);
create index if not exists ist_results_session on ist_results(session_id);

-- ── 7. sign-off, per attachment table per session ────────────────────────────
create table if not exists ist_signoffs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid,
  session_id      uuid not null references ist_sessions(id) on delete cascade,
  attachment_label text not null,      -- matches ist_integrations.attachment_label
  company_text    text,
  name_text       text,
  signed_on       date,
  created_at      timestamptz not null default now()
);
create index if not exists ist_signoffs_session on ist_signoffs(session_id);

-- ── 8. pre-IST prerequisites — §9.1's 22 rows, tri-state ─────────────────────
-- YES / NO / N/A is the checklist engine's own vocabulary, deliberately reused.
-- document_id is the point: a YES with nothing attached is the claim the guard
-- family keeps catching.
create table if not exists ist_prerequisites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid,
  plan_id      uuid not null references ist_plans(id) on delete cascade,
  item_no      int  not null,
  category     text not null,
  description  text not null,
  state        text not null default 'na' check (state in ('yes', 'no', 'na')),
  document_id  uuid,
  received_on  date,
  created_at   timestamptz not null default now()
);
create index if not exists ist_prerequisites_plan on ist_prerequisites(plan_id);

-- ── 9. pre-completed tests accepted by the ITC — §9.2 ────────────────────────
create table if not exists ist_precompleted (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid,
  plan_id            uuid not null references ist_plans(id) on delete cascade,
  integration_id     uuid references ist_integrations(id) on delete set null,
  subject_text       text not null,
  integration_type   text,
  documentation_ref  text,
  comments           text,
  created_at         timestamptz not null default now()
);
create index if not exists ist_precompleted_plan on ist_precompleted(plan_id);

-- ── 10. notes — a table, because B-3 proved a column is not enough ───────────
-- That note spans five rows, cites a spec section, states an apparent
-- non-conformance, and then carries two named engineers' written determinations
-- resolving it. REV2 of the whole document exists because of it.
-- A determination that changed a revision is not a comment.
create table if not exists ist_notes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid,
  plan_id         uuid not null references ist_plans(id) on delete cascade,
  scope           ist_note_scope not null,
  integration_id  uuid references ist_integrations(id) on delete cascade,
  result_id       uuid references ist_results(id) on delete cascade,
  body            text not null,
  author_label    text,
  received_on     date,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  -- A scoped note must point at what it is scoped to, or it renders nowhere and
  -- reads as lost rather than as unscoped.
  constraint ist_notes_scope_target check (
    (scope = 'report'     and integration_id is null and result_id is null)
 or (scope = 'attachment' and integration_id is not null)
 or (scope = 'row'        and result_id is not null)
  )
);
create index if not exists ist_notes_plan on ist_notes(plan_id);

-- ── RLS — the established shape ──────────────────────────────────────────────
alter table ist_plans                enable row level security;
alter table ist_systems              enable row level security;
alter table ist_integrations         enable row level security;
alter table ist_protocols            enable row level security;
alter table ist_sessions             enable row level security;
alter table ist_session_participants enable row level security;
alter table ist_results              enable row level security;
alter table ist_signoffs             enable row level security;
alter table ist_prerequisites        enable row level security;
alter table ist_precompleted         enable row level security;
alter table ist_notes                enable row level security;

-- Plan-scoped tables reach the project through their plan. Written out rather
-- than denormalised project_id onto every table: a second copy of the project
-- link is a second thing that can disagree with the first.
do $$
declare t text; plan_expr text;
begin
  foreach t in array array[
    'ist_plans','ist_systems','ist_integrations','ist_protocols','ist_sessions',
    'ist_session_participants','ist_results','ist_signoffs','ist_prerequisites',
    'ist_precompleted','ist_notes'
  ] loop
    plan_expr := case t
      when 'ist_plans' then '(select project_id from ist_plans p where p.id = %1$s.id)'
      when 'ist_protocols' then '(select p.project_id from ist_plans p join ist_integrations i on i.plan_id = p.id where i.id = %1$s.integration_id)'
      when 'ist_session_participants' then '(select p.project_id from ist_plans p join ist_sessions s on s.plan_id = p.id where s.id = %1$s.session_id)'
      when 'ist_results' then '(select p.project_id from ist_plans p join ist_sessions s on s.plan_id = p.id where s.id = %1$s.session_id)'
      when 'ist_signoffs' then '(select p.project_id from ist_plans p join ist_sessions s on s.plan_id = p.id where s.id = %1$s.session_id)'
      else '(select project_id from ist_plans p where p.id = %1$s.plan_id)'
    end;

    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select using (is_admin_or_dev() or is_project_member(' || plan_expr || '))', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all using (is_admin_or_dev() or owner_member(' || plan_expr || ') or is_project_lead(' || plan_expr || ')) with check (is_admin_or_dev() or owner_member(' || plan_expr || ') or is_project_lead(' || plan_expr || '))', t);
  end loop;
end $$;

-- ── the 8 new role types — admin data, not code ──────────────────────────────
-- From the document's §3.2 Project Contacts Matrix, cross-checked against the 16
-- role types already in the vocabulary. Seeded as ordinary rows so the owner can
-- rename, reorder or retire any of them from the Classifications screen.
--
-- Integrated Testing Coordinator is a DISTINCT seat and never a CxA synonym: the
-- standard requires a P.Eng or a ULC-listed individual at an authorized S1001
-- service provider, and on some projects that is not this firm.
insert into company_role_types (name, abbreviation, sort_order, active)
select v.name, v.abbr, v.ord, true
  from (values
    ('Integrated Testing Coordinator', 'ITC',  100),
    ('Fire Protection Engineer',       'FPE',  101),
    ('Fire Protection Contractor',     'FPC',  102),
    ('Fire Alarm Contractor',          'FAC',  103),
    ('Structural Engineer',            'SE',   104),
    ('Building Department',            'BD',   105),
    ('Fire Department',                'FD',   106),
    ('Electrical Authority (ESA)',     'ESA',  107)
  ) as v(name, abbr, ord)
 where not exists (select 1 from company_role_types r where lower(r.name) = lower(v.name));

commit;
