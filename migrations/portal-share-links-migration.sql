-- Share links — view-only portal access with no account (2026-07-26, ruling D2).
--
-- STEP 2 OF 6. Table + the single validation function. No data path yet.
--
-- WHY A SEPARATE TABLE, not an extension of portal_invites: the argument that
-- won at 9.1(a). An invite is a SINGLE-USE SECRET THAT BECOMES AN ACCOUNT
-- (redeemed_at, email NOT NULL, 7-day default). A share link is a STANDING
-- CREDENTIAL used many times, forever if asked (no email, no redemption,
-- nullable expiry). Merged, every policy and query would have to remember which
-- kind it is holding, and email NOT NULL would force a fake value on every link
-- row. Separate keeps portal_invites' existing policies meaning exactly what
-- they mean today — zero blast radius, same as portal_members.
--
-- THE AMENDED PREMISE, recorded where the schema lives: Part A said "no raw
-- share links ever — every view is an identity". That is amended, deliberately
-- and with the cost stated: a share link is attributable to the LINK, not to a
-- person. Anyone holding the URL is that link. It can be forwarded, pasted into
-- a group chat or screenshotted and we will not know who looked. That is why
-- invite-with-account remains the primary mode and this is the secondary one.

create table if not exists public.portal_share_links (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  label          text,                       -- "For Bird PM" — keeps the list legible
  token_hash     text not null unique,       -- sha256 hex. The raw token is NEVER stored.
  expires_at     timestamptz,                -- NULL = never. See the warning below.
  revoked_at     timestamptz,
  created_by     uuid references user_profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  last_viewed_at timestamptz,                -- D5: a link is not attributable to a
  view_count     integer not null default 0, --     person, so make it attributable to itself
  org_id         uuid default '00000000-0000-0000-0000-000000000001'::uuid  -- rule 17
);

create index if not exists portal_share_links_project_idx on public.portal_share_links(project_id);

comment on column public.portal_share_links.expires_at is
  'NULL means NEVER EXPIRES. This is a footgun: `expires_at < now()` silently '
  'invalidates every permanent link, and `expires_at > now()` silently validates '
  'none of them. portal_link_project() is the ONLY function permitted to evaluate '
  'this column. Everything else must call it.';

alter table public.portal_share_links enable row level security;

-- Staff only — identical posture to portal_invites. Owner+lead per D6/9.4a.
-- NO client policy. NO anon policy. A link holder can never read the link table;
-- they reach data only through the SECURITY DEFINER bundle (step 3).
drop policy if exists psl_select on public.portal_share_links;
create policy psl_select on public.portal_share_links for select
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

drop policy if exists psl_insert on public.portal_share_links;
create policy psl_insert on public.portal_share_links for insert
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

-- UPDATE is how revocation happens (revoked_at), and how view telemetry is
-- stamped. No self-exclusion applies here — unlike a membership row, there is no
-- "own row" to protect, and revocation must never be blockable.
drop policy if exists psl_update on public.portal_share_links;
create policy psl_update on public.portal_share_links for update
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

drop policy if exists psl_delete on public.portal_share_links;
create policy psl_delete on public.portal_share_links for delete
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

-- ── THE SINGLE VALIDATION FUNCTION ───────────────────────────────────────────
--
-- The ONLY place expiry and revocation are ever evaluated, in either mode, for
-- data or for files. Returns the project a token grants, or NULL.
--
-- Three properties that matter:
--   1. It takes the RAW token and hashes internally. Callers never hash, so no
--      caller can get the hashing wrong or accidentally log a raw token beside
--      a comparison.
--   2. NULL expiry means never — expressed once, here, as
--      `(expires_at is null or expires_at > now())`.
--   3. It answers NULL for invalid, expired, revoked and unknown alike. One
--      shape, no existence oracle — the same posture as portal-redeem.
create or replace function public.portal_link_project(tok text)
  returns uuid
  language sql stable security definer set search_path to 'public'
as $function$
  select l.project_id
    from portal_share_links l
   -- digest() is SCHEMA-QUALIFIED: pgcrypto lives in `extensions`, and this
   -- function pins search_path to 'public' as every SECURITY DEFINER here does.
   -- Qualifying is preferred over widening the path — a DEFINER function's
   -- search_path is a security control, not a convenience.
   where l.token_hash = encode(extensions.digest(coalesce(tok, ''), 'sha256'), 'hex')
     and l.revoked_at is null
     and (l.expires_at is null or l.expires_at > now())
$function$;

-- Not callable by anyone but the owner and service_role: PUBLIC (which anon
-- inherits) revoked. An authenticated client has no business probing tokens
-- either, so authenticated is NOT granted — the only caller is the step-3
-- bundle, which is SECURITY DEFINER and runs as the owner.
revoke all on function public.portal_link_project(text) from public, anon, authenticated;
grant execute on function public.portal_link_project(text) to service_role;

-- pgcrypto supplies digest(). Already present (portal-redeem hashes in Node, but
-- the DB side needs it here); asserted rather than assumed.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception 'pgcrypto is required for portal_link_project()';
  end if;
end $$;
