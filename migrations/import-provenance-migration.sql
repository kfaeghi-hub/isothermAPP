-- import-provenance-migration
--
-- Provenance for rows that were BACKFILLED from documents rather than created in
-- the app. Ruled 2026-07-27 for the Seneca 257889 backfill; the mechanism is
-- generic because every project onboarded from an existing job needs it.
--
-- THE REQUIREMENT THIS EXISTS TO MEET: a bad import must be identifiable and
-- removable BY ID, never by pattern. Deleting "the rows that look imported" is
-- the same class of mistake as a cleanup sweep matching on a label — it cannot
-- distinguish a row the import created from a row a human later edited to look
-- similar, and it eats real work. Every imported row therefore carries an FK to
-- the batch that made it, and removal is `where import_batch_id = $1`.
--
-- ON DELETE RESTRICT, deliberately, on all nine references. `set null` would let
-- someone delete the batch and leave the rows behind, silently unattributable
-- and no longer removable by id — which is precisely the state this table exists
-- to prevent. Restrict makes removal a deliberate two-step: delete the rows by
-- batch id, then the batch. A batch can never lose its rows by accident.

create table if not exists public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,

  -- What this batch imported. One entity type per batch, per the staged-import
  -- discipline: a batch that spans entities cannot be rolled back cleanly.
  entity_type    text not null,

  -- WHERE IT CAME FROM, as a path relative to the project's document store.
  -- Never a local absolute path: those are meaningless on another machine and
  -- would name a user's home directory in a shared record.
  source_file    text not null,
  -- The revision/date the SOURCE FILE carried, when it carried one. This is the
  -- document's own claim about itself, not the import date.
  source_revision text,

  -- Reconciliation, recorded at execution: what the inventory predicted against
  -- what actually landed. A discrepancy is named here, not discovered later.
  rows_expected  integer,
  rows_created   integer,
  note           text,

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_import_batches_project on public.import_batches(project_id);

comment on table public.import_batches is
  'Provenance for document-backfilled rows. Removal is by import_batch_id, never by pattern.';
comment on column public.import_batches.source_file is
  'Path relative to the project document store. Never an absolute local path.';
comment on column public.import_batches.rows_expected is
  'Inventory prediction. Compared against rows_created at each stage; discrepancies named in note.';

-- ── The FK on every entity a backfill can touch ─────────────────────────────
-- NULL means "born in the app", which is the honest default and what every
-- existing row is. Only backfilled rows carry a batch.
alter table public.contacts                 add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.project_team_assignments add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.equipment                add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.cx_cell_values           add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.findings                 add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.meetings                 add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.meeting_items            add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.documentation_register   add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;
alter table public.cx_plans                 add column if not exists import_batch_id uuid references public.import_batches(id) on delete restrict;

create index if not exists idx_contacts_import_batch      on public.contacts(import_batch_id) where import_batch_id is not null;
create index if not exists idx_equipment_import_batch     on public.equipment(import_batch_id) where import_batch_id is not null;
create index if not exists idx_cx_cell_values_import_batch on public.cx_cell_values(import_batch_id) where import_batch_id is not null;
create index if not exists idx_findings_import_batch      on public.findings(import_batch_id) where import_batch_id is not null;
create index if not exists idx_docreg_import_batch        on public.documentation_register(import_batch_id) where import_batch_id is not null;

-- ── RLS, matching the established project-scoped pattern ────────────────────
-- Same shape as findings/equipment: members read and write, owners delete.
alter table public.import_batches enable row level security;

drop policy if exists imp_select on public.import_batches;
drop policy if exists imp_insert on public.import_batches;
drop policy if exists imp_update on public.import_batches;
drop policy if exists imp_delete on public.import_batches;

create policy imp_select on public.import_batches for select
  using (is_admin_or_dev() or is_project_member(project_id));
create policy imp_insert on public.import_batches for insert
  with check (is_admin_or_dev() or is_project_member(project_id));
create policy imp_update on public.import_batches for update
  using (is_admin_or_dev() or is_project_member(project_id))
  with check (is_admin_or_dev() or is_project_member(project_id));
create policy imp_delete on public.import_batches for delete
  using (is_admin_or_dev() or owner_member(project_id));

-- ── D4: the origin a design-review finding actually has ─────────────────────
-- finding_origin_enum was (site_visit, ivc, pfc, fpt) — every value describes a
-- CONSTRUCTION-phase observation. The Seneca backfill carries 125 numbered
-- comments from design review, which none of those four describe. Forcing them
-- into 'site_visit' would put design comments in the site-visit register and
-- misreport where they came from for the life of the project.
alter type public.finding_origin_enum add value if not exists 'design_review';
