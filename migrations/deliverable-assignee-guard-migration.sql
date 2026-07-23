-- deliverable-assignee-guard-migration.sql
-- Applied 2026-07-22 via the Supabase Management API (apply_migration name
-- `deliverable_assignee_guard`).
--
-- Item 4 (DELIVERABLES-ACCESS-PROPOSAL). project_deliverables has a single
-- policy `acc_all` = is_admin_or_dev() OR is_project_member(project_id) for ALL
-- commands, so any project member could set or change a deliverable's assignee.
-- The desired rule: assigning/reassigning (changing `assigned_to`) is limited to
-- admin/dev, an owner-member, or a lead of the project; plain members may still
-- update other fields (status, dates, notes) but not the assignee.
--
-- Mirrors the C2 status-guard precedent (guard_project_status): a BEFORE trigger
-- that raises when a restricted field changes without authorization, rather than
-- a column-level policy (RLS has none). Decision D4 (2026-07-22): the boundary is
-- the assignee field only — it is NOT coupled to the display-name string (no
-- "members may only touch their own" clause keyed on assigned_to = <my name>).
--
-- assigned_to is free text (the deliverables migration converted it from a uuid
-- FK to text; the name convention is shared with My Items and the rollups).
-- Adding an assignee on INSERT is gated the same way; a null assignee (the normal
-- add/compose path) never trips it, so members can still add unassigned rows.
--
-- The guard only applies to AUTHENTICATED app users (auth.uid() is not null).
-- A null auth.uid() is a trusted server context — service role / the Supabase
-- Management API / migrations — which is not an app user; the anon role is already
-- blocked from writing here by the acc_all RLS (is_project_member needs a uid).
-- Every real app request carries a JWT, so app users are always gated.

CREATE OR REPLACE FUNCTION public.guard_deliverable_assignee()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null
     and ( (TG_OP = 'INSERT' and new.assigned_to is not null)
           or (TG_OP = 'UPDATE' and new.assigned_to is distinct from old.assigned_to) )
     and not (is_admin_or_dev()
              or owner_member(new.project_id)
              or is_project_lead(new.project_id)) then
    raise exception 'Only an owner or project lead can assign a deliverable';
  end if;
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_deliverable_assignee_guard ON public.project_deliverables;
CREATE TRIGGER trg_deliverable_assignee_guard
  BEFORE INSERT OR UPDATE ON public.project_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.guard_deliverable_assignee();
