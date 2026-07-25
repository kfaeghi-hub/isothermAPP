-- portal_project(pid) — the single-project header read (2026-07-25, Part B).
--
-- Found by LOOKING at the rendered hero: the project name was a white bar.
-- That bar was the em-dash fallback at display scale, because portal_projects()
-- is strictly membership-driven (`where pm.profile_id = auth.uid()`) and a STAFF
-- previewer holds no portal_members row. The register, documents, stats and team
-- all rendered — they gate on portal_can_view(), which admits staff — so only
-- the header was starved, and only in the preview path.
--
-- The fix is a separate function, not a widened portal_projects(). They answer
-- different questions and must keep different gates:
--   portal_projects()   "which projects am I an external member of?"  → the LIST
--                       and the switcher. Staff correctly get zero.
--   portal_project(pid) "what is this project called?"                → the HEADER
--                       of a project I am already permitted to view.
-- Widening the list instead would have put a roster of internal projects into
-- the external world for every staff account — a worse answer that happened to
-- fix the symptom.
create or replace function public.portal_project(pid uuid)
  returns table(project_id uuid, name text, com_number text, client_name text, status text)
  language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.name, p.com_number, c.name, p.status
    from projects p
    left join companies c on c.id = p.client_company_id
   where p.id = pid and portal_can_view(pid)
$function$;

-- Same grant posture as the rest of the portal surface: PUBLIC (which anon
-- inherits) revoked, authenticated granted. See portal-rpc-grants-migration.sql
-- for why `revoke ... from anon` alone is not a lock.
revoke all on function public.portal_project(uuid) from public, anon;
grant execute on function public.portal_project(uuid) to authenticated, service_role;
