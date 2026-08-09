-- IST PHASE 5 — team seeding when a project's classification includes IST.
--
-- Ruled: the IST role set seeds by DEFAULT, as team SEATS — role rows awaiting
-- contacts, the established team-matrix pattern — and it is classification-driven
-- data, never hardcoded.
--
-- SO THE SEAT LIST IS A TABLE, not an array in a function. The firm will add a
-- Security Contractor the first time a project has mag-lock integrations, and
-- that must be an edit on the Classifications screen rather than a migration.
--
-- ALL FOURTEEN SEATS, INCLUDING THE AUTHORITIES. Ruled: the firm's own Project
-- Contacts Matrix carries the Building Department, the Fire Department and the
-- ESA, and an IST plan without the AHJ seat named is missing the party the whole
-- exercise reports to. A seat is an empty row awaiting a contact; naming one
-- costs nothing and its absence is what gets noticed at acceptance.

begin;

create table if not exists ist_team_seed_roles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid,
  role_type_id  uuid not null references company_role_types(id) on delete cascade,
  sort_order    int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint ist_team_seed_roles_unique unique (role_type_id)
);

alter table ist_team_seed_roles enable row level security;
drop policy if exists ist_team_seed_read on ist_team_seed_roles;
create policy ist_team_seed_read on ist_team_seed_roles for select using (true);
drop policy if exists ist_team_seed_write on ist_team_seed_roles;
create policy ist_team_seed_write on ist_team_seed_roles for all
  using (is_admin_or_dev()) with check (is_admin_or_dev());

-- The 14 seats, resolved BY NAME against the vocabulary. A name that does not
-- resolve simply does not seed — no silent placeholder row, because a seat
-- pointing at nothing renders as a blank role in the issued contacts matrix.
insert into ist_team_seed_roles (role_type_id, sort_order)
select rt.id, v.ord
  from (values
    -- 'CxP', not 'Commissioning Provider': the first draft used the long form,
    -- it resolved to nothing, and the by-name join silently seeded 17 seats
    -- instead of 18. The guard behaved correctly — no phantom row — but a seat
    -- that quietly does not exist is only visible if you count, so it is counted
    -- in pw-ist.
    ('Client/Owner', 10), ('CxP', 20), ('CxA', 21),
    ('Integrated Testing Coordinator', 30),
    ('Architect', 40), ('Structural Engineer', 50),
    ('Mechanical Engineer', 60), ('Electrical Engineer', 70),
    ('Fire Protection Engineer', 80),
    ('General/Main Contractor', 90),
    ('Fire Protection Contractor', 100), ('Fire Alarm Contractor', 110),
    ('Mechanical Contractor', 120), ('Electrical Contractor', 130),
    ('Elevator Contractor', 140),
    ('Building Department', 200), ('Fire Department', 210), ('Electrical Authority (ESA)', 220)
  ) as v(name, ord)
  join company_role_types rt on lower(rt.name) = lower(v.name)
 where not exists (select 1 from ist_team_seed_roles s where s.role_type_id = rt.id);

-- ── the seeding function ─────────────────────────────────────────────────────
-- ADDITIVE AND IDEMPOTENT. A seat that already exists on the project — with or
-- without a contact in it — is never touched. Seeding must never overwrite a
-- populated seat, and re-running after the team is filled must be a no-op:
-- a classification edit is not permission to clear someone's team.
create or replace function ist_seed_team(p_project_id uuid) returns int
language plpgsql as $$
declare n int;
begin
  insert into project_team_assignments (project_id, role_type_id, sort_order)
  select p_project_id, s.role_type_id, s.sort_order
    from ist_team_seed_roles s
   where s.active
     and not exists (
       select 1 from project_team_assignments a
        where a.project_id = p_project_id and a.role_type_id = s.role_type_id);
  get diagnostics n = row_count;
  return n;
end $$;

commit;
