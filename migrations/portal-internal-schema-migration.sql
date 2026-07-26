-- Portal read layer: inner impl + gated wrappers (2026-07-26, ruling D1(d)).
--
-- STEP 1 OF 6, LANDING ALONE. No link-mode code exists yet. This migration is a
-- pure refactor of functions Part A ruled, tested and gated, so it proves itself
-- in isolation against the existing pw-portal legs before anything new is built
-- on it — the same discipline the doc-common extraction used.
--
-- WHAT MOVES AND WHY
-- Each portal read has ONE column whitelist. Today that list is welded to its
-- authorization gate inside a single function. Link mode needs the same list
-- behind a DIFFERENT gate, and copying the list is how whitelists drift — the
-- external register must never grow `identified_by` because someone updated one
-- copy. So the list moves down into portal_internal, and the gate stays up top.
--
--   portal_internal.findings_rows(pid)   ← the ONLY place the column list exists
--            ↑
--   public.portal_findings(pid)          ← gate: portal_can_view(pid)
--            (a second gate is added in step 3 for link mode)
--
-- THE INNER FUNCTIONS ARE UNGATED BY DESIGN. That is safe only because the
-- SCHEMA is unreachable: USAGE is revoked from public, anon and authenticated,
-- so a later mistaken `grant execute` on an inner function still gets nowhere.
-- Function-level revokes were NOT considered sufficient — this codebase already
-- shipped a `revoke all ... from anon` that did nothing because PUBLIC still
-- held the grant (see portal-rpc-grants-migration.sql). Schema isolation is the
-- control that does not depend on remembering that lesson.
--
-- BEHAVIOUR IS UNCHANGED. Every wrapper keeps its exact signature, return type,
-- ordering and gate. A caller cannot tell this migration ran.

-- ── The isolated schema ──────────────────────────────────────────────────────
create schema if not exists portal_internal;
revoke all on schema portal_internal from public;
revoke all on schema portal_internal from anon, authenticated;
grant usage on schema portal_internal to service_role;
comment on schema portal_internal is
  'Ungated portal read implementations. The column whitelists live here and '
  'NOWHERE else. No USAGE for anon/authenticated: reachable only through the '
  'gated wrappers in public, which run SECURITY DEFINER as the owner.';

-- ── Inner implementations — whitelists only, no authorization ────────────────

-- Project header shape, shared by BOTH public entry points (portal_projects
-- filters by membership, portal_project by id) so the five columns are declared
-- once rather than twice.
create or replace function portal_internal.project_rows(pids uuid[])
  returns table(project_id uuid, name text, com_number text, client_name text, status text)
  language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.name, p.com_number, c.name, p.status
    from projects p
    left join companies c on c.id = p.client_company_id
   where p.id = any(pids)
   order by p.name
$function$;

create or replace function portal_internal.findings_rows(pid uuid)
  returns table(finding_id uuid, number text, title text, description text,
                category text, building_area text, corrective_action text,
                status text, date_raised date, date_closed date,
                responsible_company text)
  language sql stable security definer set search_path to 'public'
as $function$
  -- DELIBERATE EXCLUSIONS, do not add: identified_by (which internal engineer
  -- raised it), origin, phase_id, linked_equipment_id, created_at/updated_at.
  select f.id, f.number, f.title, f.description,
         f.category, f.building_area, f.corrective_action,
         f.status, f.date_raised, f.date_closed, co.name
    from findings f
    left join contacts ct on ct.id = f.responsible_party_id
    left join companies co on co.id = ct.company_id
   where f.project_id = pid
   order by f.number
$function$;

create or replace function portal_internal.finding_photo_rows(pid uuid)
  returns table(photo_id uuid, finding_id uuid, caption text, uploaded_at timestamptz)
  language sql stable security definer set search_path to 'public'
as $function$
  -- IDs ONLY. Never storage_url — downloads mint signed URLs through
  -- api/get-file-url, which re-checks access.
  select ph.id, ph.finding_id, ph.caption, ph.uploaded_at
    from finding_photos ph join findings f on f.id = ph.finding_id
   where f.project_id = pid
   order by ph.uploaded_at
$function$;

create or replace function portal_internal.document_rows(pid uuid)
  returns table(kind text, row_id uuid, label text, doc_date date,
                has_docx boolean, has_pdf boolean)
  language sql stable security definer set search_path to 'public'
as $function$
  -- THE ISSUED-ONLY TEST LIVES HERE (9.2a): site reports need a storage_url,
  -- meetings need status='issued'. A draft cannot appear in either mode.
  select 'site_report'::text, sr.id,
         'Site Report ' || coalesce(sr.report_number, ''), sr.report_date,
         sr.storage_url is not null, sr.pdf_url is not null
    from site_reports sr
   where sr.project_id = pid and sr.storage_url is not null
  union all
  select 'meeting'::text, m.id,
         coalesce(mt.name, 'Meeting') || ' #' || coalesce(m.meeting_number::text, ''),
         m.meeting_date, m.storage_url is not null, m.pdf_url is not null
    from meetings m left join meeting_types mt on mt.id = m.meeting_type_id
   where m.project_id = pid and m.status = 'issued'
  order by 4 desc nulls last
$function$;

create or replace function portal_internal.stats_rows(pid uuid)
  returns table(checklists_total bigint, checklists_complete bigint,
                findings_open bigint, findings_closed bigint, phases text[])
  language sql stable security definer set search_path to 'public'
as $function$
  -- Aggregates only — never the underlying rows.
  select
    (select count(*) from checklist_instances ci where ci.project_id = pid),
    (select count(*) from checklist_instances ci where ci.project_id = pid and ci.status = 'complete'),
    (select count(*) from findings f where f.project_id = pid and f.status = 'open'),
    (select count(*) from findings f where f.project_id = pid and f.status = 'closed'),
    (select array_agg(ph.name order by ph.sort_order) from project_phases ph where ph.project_id = pid)
$function$;

create or replace function portal_internal.team_rows(pid uuid)
  returns table(company_name text, role_name text, role_abbr text, contact_name text)
  language sql stable security definer set search_path to 'public'
as $function$
  -- THIS project's roster only. Never the firm Directory.
  select co.name, rt.name, rt.abbreviation, ct.name
    from project_team_assignments a
    left join companies co on co.id = a.company_id
    left join company_role_types rt on rt.id = a.role_type_id
    left join contacts ct on ct.id = a.contact_id
   where a.project_id = pid
   order by rt.sort_order, co.name
$function$;

-- Second lock on the same door: EXECUTE revoked from PUBLIC (which every role
-- inherits) as well as anon and authenticated by name. Verified at the privilege
-- level rather than by "the call failed" — PostgREST returns PGRST202 for an
-- unexposed schema, which proves ROUTING is blocked, not that the grant is gone:
--
--   has_schema_privilege   USAGE   anon=false  authenticated=false  service_role=true
--   has_function_privilege EXECUTE anon=false  authenticated=false  service_role=false
--
-- service_role deliberately ends up with schema USAGE but NO function EXECUTE.
-- Nothing needs it: the gated wrappers (and, from step 3, the link bundle) are
-- SECURITY DEFINER and reach these as the function OWNER, never as the caller.
-- That is the tighter arrangement and it should stay that way — if a future
-- change needs `grant execute ... to service_role` here, that is a signal the
-- call is bypassing a gate.
revoke all on all functions in schema portal_internal from public;
revoke all on all functions in schema portal_internal from anon, authenticated;

-- ── Public wrappers — gate only, signatures unchanged ────────────────────────

create or replace function public.portal_projects()
  returns table(project_id uuid, name text, com_number text, client_name text, status text)
  language sql stable security definer set search_path to 'public'
as $function$
  -- The LIST: projects this account is an external member of. Staff correctly
  -- get none. Ordering comes from project_rows (by name), as before.
  select * from portal_internal.project_rows(
    array(select pm.project_id from portal_members pm where pm.profile_id = auth.uid()))
$function$;

create or replace function public.portal_project(pid uuid)
  returns table(project_id uuid, name text, com_number text, client_name text, status text)
  language sql stable security definer set search_path to 'public'
as $function$
  -- The HEADER of one project the caller may already view — gated on
  -- portal_can_view, so the staff "view as client" preview has a name to render.
  select * from portal_internal.project_rows(array[pid]) where portal_can_view(pid)
$function$;

create or replace function public.portal_findings(pid uuid)
  returns table(finding_id uuid, number text, title text, description text,
                category text, building_area text, corrective_action text,
                status text, date_raised date, date_closed date,
                responsible_company text)
  language sql stable security definer set search_path to 'public'
as $function$
  select * from portal_internal.findings_rows(pid) where portal_can_view(pid)
$function$;

create or replace function public.portal_finding_photos(pid uuid)
  returns table(photo_id uuid, finding_id uuid, caption text, uploaded_at timestamptz)
  language sql stable security definer set search_path to 'public'
as $function$
  select * from portal_internal.finding_photo_rows(pid) where portal_can_view(pid)
$function$;

create or replace function public.portal_documents(pid uuid)
  returns table(kind text, row_id uuid, label text, doc_date date,
                has_docx boolean, has_pdf boolean)
  language sql stable security definer set search_path to 'public'
as $function$
  select * from portal_internal.document_rows(pid) where portal_can_view(pid)
$function$;

create or replace function public.portal_stats(pid uuid)
  returns table(checklists_total bigint, checklists_complete bigint,
                findings_open bigint, findings_closed bigint, phases text[])
  language sql stable security definer set search_path to 'public'
as $function$
  select * from portal_internal.stats_rows(pid) where portal_can_view(pid)
$function$;

create or replace function public.portal_team(pid uuid)
  returns table(company_name text, role_name text, role_abbr text, contact_name text)
  language sql stable security definer set search_path to 'public'
as $function$
  select * from portal_internal.team_rows(pid) where portal_can_view(pid)
$function$;

-- Grants unchanged from portal-rpc-grants-migration: PUBLIC (which anon
-- inherits) revoked, authenticated granted. Re-applied because `create or
-- replace` on an existing function PRESERVES its ACL — but this migration also
-- runs on environments where these are new, and a missing grant fails closed
-- rather than open, so re-stating is safe and explicit.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.portal_projects()', 'public.portal_project(uuid)',
    'public.portal_findings(uuid)', 'public.portal_finding_photos(uuid)',
    'public.portal_documents(uuid)', 'public.portal_stats(uuid)',
    'public.portal_team(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
