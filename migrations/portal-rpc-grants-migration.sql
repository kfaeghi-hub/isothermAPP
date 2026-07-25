-- Portal RPC grants — make the anon lockout REAL (2026-07-25, Part A follow-up).
--
-- portal-rpcs-migration.sql ended each function with `revoke all ... from anon`.
-- That line does not do what it reads like. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and `anon` inherits it: revoking anon's own
-- grant leaves the PUBLIC grant (`=X/postgres` in proacl) untouched. Verified
-- live — an anonymous client could still INVOKE all six SECURITY DEFINER RPCs.
--
-- Nothing leaked: portal_can_view() fails closed on a null auth.uid(), so every
-- anonymous call returned zero rows. But "returns zero" was doing the work that
-- the revoke was supposed to be doing, and a control that is not a control is
-- worse than no control — it gets trusted. (Exactly the shape of the
-- is_project_member() finding that reshaped this whole build.)
--
-- These are the only functions in the schema locked this way. The pre-existing
-- helpers (is_project_member, is_staff, …) keep the Supabase default and their
-- own fail-closed behaviour; widening this to them is a separate, riskier sweep
-- and is deliberately NOT bundled here.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.portal_projects()',
    'public.portal_findings(uuid)',
    'public.portal_finding_photos(uuid)',
    'public.portal_documents(uuid)',
    'public.portal_stats(uuid)',
    'public.portal_team(uuid)',
    'public.portal_can_view(uuid)',
    'public.is_portal_member(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
