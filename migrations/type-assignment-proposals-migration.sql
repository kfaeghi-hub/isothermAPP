-- ITEM 5 — the type-assignment sweep.
--
-- The other half of the nameplate diagnosis. 461 of 834 units have no
-- equipment_type, so they render identity only and none of the def sets that
-- were seeded for them. On the two live retrofit projects it is nearly
-- everything: Clairlea 92 of 99, Muir 57 of 89.
--
-- NEVER AUTO-ASSIGNED. A type decides which nameplate a unit gets and which
-- applicability rules apply to it — it is a claim about what a thing IS, and
-- law 2 says an agent proposes and a human disposes. The matcher here is not
-- even an agent: it is the deterministic all-words matcher from the B1 Excel
-- path, run over descriptors. Same rules, same law-8 behaviour, no tokens.
create table if not exists equipment_type_proposals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid default '00000000-0000-0000-0000-000000000001',  -- rule 17
  project_id    uuid not null references projects(id) on delete cascade,
  equipment_id  uuid not null references equipment(id) on delete cascade,
  run_id        uuid,
  proposed_type text references equipment_types(key),
  -- What the SOURCE said, kept when nothing resolved. Law 9: the review surface
  -- is asked to rule on an unknown, so it must be given the means.
  observed_name text,
  confidence    numeric(4,3),
  rationale     text,
  status        text not null default 'proposed'
                check (status in ('proposed','accepted','rejected')),
  resolved_by   uuid references user_profiles(id),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  -- One live proposal per unit. Re-running the sweep refreshes rather than piles.
  unique (equipment_id, status) deferrable initially deferred
);

create index if not exists etp_project on equipment_type_proposals(project_id, status);

alter table equipment_type_proposals enable row level security;
drop policy if exists etp_read on equipment_type_proposals;
create policy etp_read on equipment_type_proposals for select
  using (is_admin_or_dev() or is_project_member(project_id));
drop policy if exists etp_write on equipment_type_proposals;
create policy etp_write on equipment_type_proposals for all
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

select count(*) from equipment_type_proposals;
