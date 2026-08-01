-- B1 — MASS INTAKE: the staging tables and the private bucket.
--
-- NOTHING HERE TOUCHES `equipment`. An upload proposes; a human disposes; B3
-- writes. That is law 2 expressed as a schema — the staging rows are a different
-- table from the record, so "approved by accident" is not a state that exists.

create table if not exists intake_uploads (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  filename      text not null,
  -- PATH, NOT URL. Storing a URL was already migrated away from once
  -- (storage-url-to-path-migration.sql): a signed URL expires, so a column
  -- holding one is a fact with a shelf life. The path is durable; the signature
  -- is minted at read time.
  storage_path  text not null,
  kind          text not null check (kind in ('excel','pdf','image')),
  -- Forward-provisioned for B3's idempotency gate: re-uploading the same
  -- schedule must propose zero rows. Adding the column now costs nothing; adding
  -- it after uploads exist means backfilling a hash over files nobody kept.
  content_sha256 text,
  pages         int,
  row_count     int,
  status        text not null default 'uploaded'
                check (status in ('uploaded','parsed','reviewing','approved','discarded','failed')),
  parse_note    text,
  uploaded_by   uuid references user_profiles(id),
  uploaded_at   timestamptz not null default now(),
  -- Set when B3 writes. ON DELETE RESTRICT: the batch is provenance for real
  -- equipment rows, so the upload that produced it cannot be deleted out from
  -- under the record it explains.
  import_batch_id uuid references import_batches(id) on delete restrict
);

create index if not exists intake_uploads_project on intake_uploads(project_id, uploaded_at desc);
create index if not exists intake_uploads_hash on intake_uploads(project_id, content_sha256);

create table if not exists intake_rows (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid not null references intake_uploads(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  source_sheet  text,
  source_page   int,
  source_row    int,
  tag           text,
  descriptor    text,
  proposed_category text,

  -- TWO COLUMNS, NOT ONE, AND THE SPLIT IS LOAD-BEARING.
  --
  -- `proposed_type` carries the firm's vocabulary key and is FK-constrained, so
  -- an import can never mint a type — that is structural, not a habit.
  --
  -- But a NULL there would erase WHAT THE SOURCE ACTUALLY SAID, and the source's
  -- own words are the evidence every later ruling depends on. So the raw string
  -- lives beside it in `observed_type_name`, exactly as
  -- proposed_equipment_types.observed_name does.
  --
  -- Law 9: the review surface is asked to resolve an unknown type, and this is
  -- the input that lets it. A schema that could only say "unknown" would be
  -- asking for a ruling it gave nobody the means to make.
  proposed_type      text references equipment_types(key),
  observed_type_name text,

  location      text,
  area_served   text,
  nameplate     jsonb,
  confidence    numeric(4,3),

  -- Set ⇒ this row ENRICHES an existing unit rather than creating one. The
  -- directory-import standard: never overwrite, always show the diff and let a
  -- human take it field by field.
  match_equipment_id uuid references equipment(id) on delete set null,
  -- Set ⇒ another row in THIS SAME upload claims the same tag. Flagged before
  -- approval, not discovered after.
  duplicate_of  uuid references intake_rows(id) on delete set null,

  disposition   text not null default 'pending'
                check (disposition in ('pending','accepted','edited','rejected')),
  edited        jsonb,
  resolved_by   uuid references user_profiles(id),
  resolved_at   timestamptz,
  created_equipment_id uuid references equipment(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists intake_rows_upload on intake_rows(upload_id, source_row);
create index if not exists intake_rows_pending on intake_rows(upload_id) where disposition = 'pending';
create index if not exists intake_rows_tag on intake_rows(project_id, upper(tag));

-- ── RLS — mirrors cx_applicability_proposals exactly ────────────────────────
-- Read for any project member; write for admin/dev, owner-member, or project
-- lead. owner_member() alone would lock a project lead out of their own intake,
-- which is the bug already paid for once on the applicability editor.
alter table intake_uploads enable row level security;
alter table intake_rows    enable row level security;

drop policy if exists iu_read on intake_uploads;
create policy iu_read on intake_uploads for select
  using (is_admin_or_dev() or is_project_member(project_id));
drop policy if exists iu_write on intake_uploads;
create policy iu_write on intake_uploads for all
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

drop policy if exists ir_read on intake_rows;
create policy ir_read on intake_rows for select
  using (is_admin_or_dev() or is_project_member(project_id));
drop policy if exists ir_write on intake_rows;
create policy ir_write on intake_rows for all
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

-- ── Storage — private, like every other bucket here ─────────────────────────
insert into storage.buckets (id, name, public)
values ('intake-files', 'intake-files', false)
on conflict (id) do nothing;

drop policy if exists intake_files_read on storage.objects;
create policy intake_files_read on storage.objects for select
  using (bucket_id = 'intake-files' and is_staff());
drop policy if exists intake_files_write on storage.objects;
create policy intake_files_write on storage.objects for insert
  with check (bucket_id = 'intake-files' and is_staff());
drop policy if exists intake_files_delete on storage.objects;
create policy intake_files_delete on storage.objects for delete
  using (bucket_id = 'intake-files' and is_admin_or_dev());

select 'intake_uploads' as t, count(*) from intake_uploads
union all select 'intake_rows', count(*) from intake_rows
union all select 'bucket', count(*) from storage.buckets where id='intake-files';
