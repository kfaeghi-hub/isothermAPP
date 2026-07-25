-- portal-tables-migration.sql
-- EXTERNAL PROJECT PORTAL, Part A step 1 (approved 2026-07-25, decision 9.1(a)).
-- Applied via the Supabase Management API as `portal_tables`.
--
-- WHY A SEPARATE MEMBERSHIP TABLE (9.1(a)). The recorded model said "client role +
-- a project_members row, membership machinery unchanged". That does not hold:
-- is_project_member() carries NO role condition, so inserting a client into
-- project_members grants full member access — read AND write — through the
-- EXISTING policy set. Proven live on ZZ-TEST before this build (20 findings with
-- all columns, every site-report status, 239 checklist instances, 266 equipment
-- rows, and an ACCEPTED findings INSERT).
--
-- portal_members is therefore a DIFFERENT table for a DIFFERENT concept: a
-- read-only external audience. project_members never contains a client row, so
-- not one existing policy, predicate or endpoint changes meaning — and Build Spec
-- §3.3's "Client … appears in ZERO policies" stays literally true and auditable.
-- Nothing here grants a client SELECT on any base table; the portal reads only
-- through the SECURITY DEFINER RPCs in the companion migration (9.5(a) — RLS
-- cannot filter columns, and the register must exclude identified_by).
--
-- Rule 17: both tables carry org_id (nullable, defaulted to the Isotherm org,
-- indexed) from day one, so Phase 11 tenant isolation is a policy change.

-- ── portal_members — the external audience wall ─────────────────────────────
create table if not exists public.portal_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id)      on delete cascade,
  profile_id  uuid not null references public.user_profiles(id) on delete cascade,
  invited_by  uuid references public.user_profiles(id),
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  -- Hook for the recorded future option (per-company filtering for contractor
  -- accounts). Unused by this build; whole-register visibility is the ruling.
  company_id  uuid references public.companies(id),
  org_id      uuid default '00000000-0000-0000-0000-000000000001'::uuid,
  created_at  timestamptz not null default now(),
  unique (project_id, profile_id)
);
create index if not exists portal_members_profile_idx on public.portal_members(profile_id);
create index if not exists portal_members_project_idx on public.portal_members(project_id);
create index if not exists portal_members_org_idx     on public.portal_members(org_id);
alter table public.portal_members enable row level security;

-- Roster visibility: the external user sees their OWN rows (so the portal can
-- list their projects); staff who run the project see the whole roster.
create policy pm_select on public.portal_members for select
  using (profile_id = auth.uid()
         or is_admin_or_dev()
         or owner_member(project_id)
         or is_project_lead(project_id));

-- 9.4(a): owner + lead manage the external roster (consistent with the
-- lead-assigns-deliverables ruling). Clients match none of these predicates.
create policy pm_insert on public.portal_members for insert
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

-- Self-exclusion mirrors members_update: nobody edits their own membership row.
-- Defensive here (staff hold no portal_members rows), kept for symmetry.
create policy pm_update on public.portal_members for update
  using      ((is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
              and profile_id <> auth.uid())
  with check ((is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
              and profile_id <> auth.uid());

-- Revocation must always work — no self-exclusion clause on DELETE.
create policy pm_delete on public.portal_members for delete
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

-- ── portal_invites — single-use, expiring, revocable ────────────────────────
-- The raw token NEVER touches this table: only its SHA-256 hex hash. A database
-- reader cannot mint a working invite link.
create table if not exists public.portal_invites (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  email       text not null,                    -- stored lowercased by the endpoint
  token_hash  text not null unique,             -- sha256 hex of the raw token
  invited_by  uuid references public.user_profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  redeemed_at timestamptz,
  revoked_at  timestamptz,
  org_id      uuid default '00000000-0000-0000-0000-000000000001'::uuid
);
create index if not exists portal_invites_project_idx on public.portal_invites(project_id);
create index if not exists portal_invites_hash_idx    on public.portal_invites(token_hash);
create index if not exists portal_invites_org_idx     on public.portal_invites(org_id);
alter table public.portal_invites enable row level security;

-- Staff who run the project manage invites. NO client policy. NO anon policy.
-- Redemption runs service-role inside api/portal-redeem, bypassing RLS entirely,
-- so an unauthenticated recipient never needs a policy here.
create policy pi_select on public.portal_invites for select
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));
create policy pi_insert on public.portal_invites for insert
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));
create policy pi_update on public.portal_invites for update
  using      (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));
create policy pi_delete on public.portal_invites for delete
  using (is_admin_or_dev() or owner_member(project_id));

-- ── The portal predicate — deliberately NOT named is_project_member ─────────
-- Kept separate so no existing policy can ever accidentally admit a portal user.
create or replace function public.is_portal_member(pid uuid)
  returns boolean
  language sql stable security definer
  set search_path to 'public'
as $function$
  select exists (select 1 from portal_members
                 where project_id = pid and profile_id = auth.uid())
$function$;
