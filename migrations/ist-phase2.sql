-- IST MODULE — PHASE 2: pre-IST prerequisites as firm data, and the register link.
-- Ruled 2026-08-08. Phase 1 is migrations/ist-phase1.sql.
--
-- §9.1 of the firm's report is a 22-row documentation checklist in four
-- categories, each row tri-state YES / NO / N/A. Those 22 rows are not this
-- project's rows — they are the standard's, and Scarborough merely ticked them.
-- So they live at FIRM level and are copied into a plan, which is the same
-- firm-default / project-copy pattern the checklist templates and the Cx Index
-- already use.
--
-- THE POINT OF THE PHASE IS THE LINK, NOT THE LIST. A prerequisite marked YES
-- with nothing attached is a claim with no evidence behind it, and the guard
-- family has caught that shape repeatedly. `document_id` now REFERENCES the
-- documentation register, so "received" means a row exists that someone can open
-- — not that a box was ticked. This is the known-good-handoff boundary made
-- operational: per-unit readiness stays the Cx Index's, and DOCUMENT
-- prerequisites are checked here against real documents.

begin;

-- ── the firm-level list ──────────────────────────────────────────────────────
create table if not exists ist_prerequisite_defaults (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid,
  item_no      int  not null,
  category     text not null,
  description  text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint ist_prerequisite_defaults_item_no unique (item_no)
);

alter table ist_prerequisite_defaults enable row level security;
drop policy if exists ist_prereq_defaults_read on ist_prerequisite_defaults;
create policy ist_prereq_defaults_read on ist_prerequisite_defaults for select using (true);
drop policy if exists ist_prereq_defaults_write on ist_prerequisite_defaults;
create policy ist_prereq_defaults_write on ist_prerequisite_defaults for all
  using (is_admin_or_dev()) with check (is_admin_or_dev());

-- The 22 rows, verbatim from §9.1, in the standard's own four groups.
insert into ist_prerequisite_defaults (item_no, category, description)
select v.n, v.cat, v.d from (values
  (1,  'Design professional confirmation', 'Sprinkler System Design Professional'),
  (2,  'Design professional confirmation', 'Standpipe System Design Professional'),
  (3,  'Design professional confirmation', 'Fire Alarm System Design Professional'),
  (4,  'Design professional confirmation', 'Fire Pump Design Professional'),
  (5,  'Design professional confirmation', 'Emergency Generator Design Professional'),
  (6,  'Installing contractor confirmation', 'Sprinkler System Contractor'),
  (7,  'Installing contractor confirmation', 'Standpipe System Contractor'),
  (8,  'Installing contractor confirmation', 'Fire Alarm System Contractor'),
  (9,  'Installing contractor confirmation', 'Fire Pump Contractor'),
  (10, 'Installing contractor confirmation', 'Emergency Generator Contractor'),
  (11, 'Installing contractor confirmation', 'Fire Suppression Contractor'),
  (12, 'Installing contractor confirmation', 'Maglocks Contractor'),
  (13, 'Verifying party documentation', 'Contractors'' Material and Test Certificate for Under Ground Piping — Sprinklers'),
  (14, 'Verifying party documentation', 'Contractors'' Material and Test Certificate for Under Ground Piping — Standpipe'),
  (15, 'Verifying party documentation', 'Contractors'' Material and Test Certificate for Above Ground Piping — Sprinklers'),
  (16, 'Verifying party documentation', 'Contractors'' Material and Test Certificate for Above Ground Piping — Standpipe'),
  (17, 'Verifying party documentation', 'Fire Alarm System Verification Report per CAN/ULC-S537'),
  (18, 'Verifying party documentation', 'Fire Signal Receiving Centre Certificate'),
  (19, 'Verifying party documentation', 'Contractors'' Material and Test Certificate for Fire Pump Systems'),
  (20, 'Verifying party documentation', 'Emergency Generator Performance Test Report per CSA C282'),
  (21, 'Authority inspection', 'Electrical Authority Certificate'),
  (22, 'Authority inspection', 'Elevating Devices Authority Certificate')
) as v(n, cat, d)
where not exists (select 1 from ist_prerequisite_defaults d where d.item_no = v.n);

-- ── the register link ────────────────────────────────────────────────────────
-- Phase 1 left document_id untyped so the register's shape could be confirmed
-- before pointing at it. It is documentation_register(id).
alter table ist_prerequisites drop constraint if exists ist_prerequisites_document_fk;
alter table ist_prerequisites add  constraint ist_prerequisites_document_fk
  foreign key (document_id) references documentation_register(id) on delete set null;

-- THE GUARD THIS PHASE EXISTS FOR: 'yes' means a document arrived. A row may be
-- 'no' or 'na' with nothing attached — those are honest states. 'yes' with no
-- document is the claim with no evidence, and it is refused rather than
-- discouraged, because every version of this that was left to discipline has
-- eventually been ticked through.
alter table ist_prerequisites drop constraint if exists ist_prerequisites_yes_needs_document;
alter table ist_prerequisites add  constraint ist_prerequisites_yes_needs_document
  check (state <> 'yes' or document_id is not null);

comment on constraint ist_prerequisites_yes_needs_document on ist_prerequisites is
  'A prerequisite marked YES must point at a row in the documentation register. Received means a document exists, not that a box was ticked.';

-- ── copy the firm list into a plan ───────────────────────────────────────────
-- A function rather than app code: three surfaces will eventually create plans
-- (the UI, an import, and the generator''s revision path), and a rule that lives
-- in one call site is a rule the other two will not have.
create or replace function ist_seed_prerequisites(p_plan_id uuid) returns int
language plpgsql as $$
declare n int;
begin
  insert into ist_prerequisites (plan_id, item_no, category, description, state)
  select p_plan_id, d.item_no, d.category, d.description, 'na'
    from ist_prerequisite_defaults d
   where d.active
     and not exists (select 1 from ist_prerequisites x where x.plan_id = p_plan_id and x.item_no = d.item_no);
  get diagnostics n = row_count;
  return n;
end $$;

commit;
