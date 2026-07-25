-- portal-rpcs-migration.sql
-- EXTERNAL PROJECT PORTAL, Part A step 2 (approved 2026-07-25, decision 9.5(a)).
-- Applied via the Supabase Management API as `portal_rpcs`.
--
-- WHY RPCs AND NOT CLIENT POLICIES. RLS cannot filter COLUMNS. A client SELECT
-- policy on findings would let any caller request identified_by (an internal
-- staffer's name) — or any column added later — straight through PostgREST.
-- These functions are the only portal read path: the column whitelist, the
-- issued-only filter and the row scope are all one auditable body per surface,
-- and `client` stays absent from pg_policies entirely.
--
-- Every function is SECURITY DEFINER (bypasses RLS) and therefore gates itself
-- on portal_can_view() as its FIRST action. Staff are admitted too, which is what
-- makes the owner/lead "View as client" preview possible without a client session.
--
-- Deliberately NOT returned anywhere here: identified_by, origin, phase_id,
-- linked_equipment_id, created_at/updated_at, any checklist content, any
-- equipment row, any deliverable, any diary entry. finding_photos returns IDS
-- ONLY — never a storage path; downloads mint signed URLs through the
-- row-anchored api/get-file-url.

-- ── The gate ────────────────────────────────────────────────────────────────
create or replace function public.portal_can_view(pid uuid)
  returns boolean
  language sql stable security definer
  set search_path to 'public'
as $function$
  -- external portal member, or staff (admin/dev anywhere; internal members of
  -- this project) for the View-as-client preview
  select is_portal_member(pid) or is_admin_or_dev() or is_project_member(pid)
$function$;

-- ── 1 · the caller's projects ───────────────────────────────────────────────
create or replace function public.portal_projects()
  returns table (project_id uuid, name text, com_number text, client_name text, status text)
  language sql stable security definer
  set search_path to 'public'
as $function$
  select p.id, p.name, p.com_number, c.name, p.status
    from portal_members pm
    join projects  p on p.id = pm.project_id
    left join companies c on c.id = p.client_company_id
   where pm.profile_id = auth.uid()
   order by p.name
$function$;

-- ── 2 · the issues register (whole register per project — the ruling) ───────
create or replace function public.portal_findings(pid uuid)
  returns table (
    finding_id uuid, number text, title text, description text,
    category text, building_area text, corrective_action text,
    status text, date_raised date, date_closed date, responsible_company text
  )
  language sql stable security definer
  set search_path to 'public'
as $function$
  select f.id, f.number, f.title, f.description,
         f.category, f.building_area, f.corrective_action,
         f.status, f.date_raised, f.date_closed, co.name
    from findings f
    left join contacts  ct on ct.id = f.responsible_party_id
    left join companies co on co.id = ct.company_id
   where f.project_id = pid
     and portal_can_view(pid)
   order by f.number
$function$;

-- ── 3 · finding photos — IDS ONLY, no storage path ─────────────────────────
create or replace function public.portal_finding_photos(pid uuid)
  returns table (photo_id uuid, finding_id uuid, caption text, uploaded_at timestamptz)
  language sql stable security definer
  set search_path to 'public'
as $function$
  select ph.id, ph.finding_id, ph.caption, ph.uploaded_at
    from finding_photos ph
    join findings f on f.id = ph.finding_id
   where f.project_id = pid
     and portal_can_view(pid)
   order by ph.uploaded_at
$function$;

-- ── 4 · issued documents ONLY (decision 9.2(a)) ────────────────────────────
-- site report "issued" = storage_url IS NOT NULL (the existing convention, already
-- the definition used by the sr_delete policy). meetings carry a real status.
-- The filter lives HERE, in SQL — never in the UI.
create or replace function public.portal_documents(pid uuid)
  returns table (
    kind text, row_id uuid, label text, doc_date date,
    has_docx boolean, has_pdf boolean
  )
  language sql stable security definer
  set search_path to 'public'
as $function$
  select 'site_report'::text, sr.id,
         'Site Report ' || coalesce(sr.report_number, ''), sr.report_date,
         sr.storage_url is not null, sr.pdf_url is not null
    from site_reports sr
   where sr.project_id = pid
     and sr.storage_url is not null          -- ISSUED ONLY
     and portal_can_view(pid)
  union all
  select 'meeting'::text, m.id,
         coalesce(mt.name, 'Meeting') || ' #' || coalesce(m.meeting_number::text, ''),
         m.meeting_date,
         m.storage_url is not null, m.pdf_url is not null
    from meetings m
    left join meeting_types mt on mt.id = m.meeting_type_id
   where m.project_id = pid
     and m.status = 'issued'                 -- ISSUED ONLY
     and portal_can_view(pid)
  order by 4 desc nulls last
$function$;

-- ── 5 · progress stats — AGGREGATES ONLY, never rows ───────────────────────
-- Computed inline rather than through dashboard_checklist_coverage: that view is
-- security_invoker by design, and its behaviour inside a DEFINER function is a
-- subtlety this boundary should not depend on.
create or replace function public.portal_stats(pid uuid)
  returns table (
    checklists_total bigint, checklists_complete bigint,
    findings_open bigint, findings_closed bigint, phases text[]
  )
  language sql stable security definer
  set search_path to 'public'
as $function$
  select
    (select count(*) from checklist_instances ci where ci.project_id = pid),
    (select count(*) from checklist_instances ci where ci.project_id = pid and ci.status = 'complete'),
    (select count(*) from findings f where f.project_id = pid and f.status = 'open'),
    (select count(*) from findings f where f.project_id = pid and f.status = 'closed'),
    (select array_agg(ph.name order by ph.sort_order) from project_phases ph where ph.project_id = pid)
  where portal_can_view(pid)
$function$;

-- ── 6 · project team (matrix, display only) ────────────────────────────────
create or replace function public.portal_team(pid uuid)
  returns table (company_name text, role_name text, role_abbr text, contact_name text)
  language sql stable security definer
  set search_path to 'public'
as $function$
  select co.name, rt.name, rt.abbreviation, ct.name
    from project_team_assignments a
    left join companies          co on co.id = a.company_id
    left join company_role_types rt on rt.id = a.role_type_id
    left join contacts           ct on ct.id = a.contact_id
   where a.project_id = pid
     and portal_can_view(pid)
   order by rt.sort_order, co.name
$function$;

-- Execute rights: authenticated callers only. The body's portal_can_view() gate
-- is the real authorization; this just keeps anon out.
revoke all on function public.portal_projects()             from anon;
revoke all on function public.portal_findings(uuid)         from anon;
revoke all on function public.portal_finding_photos(uuid)   from anon;
revoke all on function public.portal_documents(uuid)        from anon;
revoke all on function public.portal_stats(uuid)            from anon;
revoke all on function public.portal_team(uuid)             from anon;
revoke all on function public.portal_can_view(uuid)         from anon;
revoke all on function public.is_portal_member(uuid)        from anon;
