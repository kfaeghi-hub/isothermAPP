-- PORTAL CX INDEX — AGGREGATES ONLY (clause 05 · Commissioning progress).
-- PORTAL-PROPOSAL §8 AMENDMENT, 2026-08-17: one carve-out from the
-- "deliverables/Cx-Index/equipment exposure in any form" exclusion — counts
-- and percentages, computed here, never rows. Everything else in the
-- exclusion stands; pw-portal keeps asserting it in both modes.
--
-- THE ONE-DEFINITION LAW: these numbers are the SAME claims-weighted formulas
-- the internal page and the PDF compute through api/_shared/cx-counting.ts
-- (Phase 1, ruled Q4/Q6):
--   unit column  → num = done units,        den = applicable units
--   type column  → num = complete types,    den = types in scope
--                  (complete = every applicable unit done; untyped units are
--                   excluded from type claims, never silently counted)
--   applicable   → no cx_cell_applicability row and status <> 'na'
--   rollup       → Σ num / Σ den, never a mean of percentages
-- The battery asserts page↔portal parity on the project number rather than
-- trusting this comment.
--
-- Shape rules, all inherited from the shipped portal design:
--   · the inner function lives in portal_internal — THE ONLY PLACE the
--     column list exists; computed inline, never through a security_invoker
--     view (the dashboard_checklist_coverage lesson);
--   · the public wrapper is a thin gate on portal_can_view;
--   · link mode reads the SAME inner function via portal_link_bundle;
--   · aggregates only — kind/name/num/den/pct rows, no ids, no tags.

create or replace function portal_internal.cx_index_stats(pid uuid)
  returns table(kind text, name text, num bigint, den bigint, pct int, sort int)
  language sql stable security definer set search_path to 'public'
as $function$
  with cols as (
    select pc.id, pc.scope, g.name as gname, g.sort_order as gsort
    from project_cx_columns pc
    join project_cx_stage_groups g on g.id = pc.stage_group_id
    where g.project_id = pid
  ),
  cellstate as (
    select c.id as col_id, c.scope, c.gname, c.gsort,
           coalesce(e.equipment_type, '') as etype,
           coalesce(e.category, 'Uncategorized') as cat,
           v.status,
           ((a.id is not null) or coalesce(v.status = 'na', false)) as is_na
    from cols c
    cross join equipment e
    left join cx_cell_values v on v.equipment_id = e.id and v.column_id = c.id
    left join cx_cell_applicability a on a.equipment_id = e.id and a.column_id = c.id
    where e.project_id = pid
  ),
  unitstats as (
    select col_id, scope, gname, gsort,
           count(*) filter (where not is_na) as u_app,
           count(*) filter (where not is_na and status = 'done') as u_done
    from cellstate group by col_id, scope, gname, gsort
  ),
  typestats as (
    select col_id,
           count(*) filter (where t_app > 0) as t_scope,
           count(*) filter (where t_app > 0 and t_done = t_app) as t_complete
    from (select col_id, etype,
                 count(*) filter (where not is_na) as t_app,
                 count(*) filter (where not is_na and status = 'done') as t_done
          from cellstate where etype <> '' group by col_id, etype) x
    group by col_id
  ),
  claims as (
    select u.gname, u.gsort,
           case when u.scope = 'type' then coalesce(t.t_complete, 0) else u.u_done end as num,
           case when u.scope = 'type' then coalesce(t.t_scope, 0) else u.u_app end as den
    from unitstats u left join typestats t on t.col_id = u.col_id
  ),
  -- Per-category: unit-grain across every column — items of that category,
  -- done cells / applicable cells. Labelled 'category' so the UI can say
  -- "by unit" honestly; type claims span categories and are not sliced here.
  catstats as (
    select cat,
           count(*) filter (where not is_na) as c_app,
           count(*) filter (where not is_na and status = 'done') as c_done
    from cellstate group by cat
  ),
  catunits as (
    select coalesce(category, 'Uncategorized') as cat, count(*) as units
    from equipment where project_id = pid group by 1
  )
  select 'project', 'Project', sum(num), sum(den),
         case when sum(den) = 0 then null else round(100.0 * sum(num) / sum(den))::int end, 0
  from claims
  union all
  select 'group', gname, sum(num), sum(den),
         case when sum(den) = 0 then null else round(100.0 * sum(num) / sum(den))::int end,
         min(gsort)
  from claims group by gname
  union all
  select 'category', cs.cat, cs.c_done, cs.c_app,
         case when cs.c_app = 0 then null else round(100.0 * cs.c_done / cs.c_app)::int end,
         coalesce(cu.units, 0)::int
  from catstats cs left join catunits cu on cu.cat = cs.cat
  order by 1, 6, 2
$function$;

-- The gated wrapper — beside the eight, same gate, same grant discipline.
create or replace function public.portal_cx_index(pid uuid)
  returns table(kind text, name text, num bigint, den bigint, pct int, sort int)
  language sql stable security definer set search_path to 'public'
as $function$
  select * from portal_internal.cx_index_stats(pid)
  where portal_can_view(pid)
$function$;

revoke all on function public.portal_cx_index(uuid) from public;
revoke all on function public.portal_cx_index(uuid) from anon;
grant execute on function public.portal_cx_index(uuid) to authenticated;

-- Link mode reads the SAME inner function: the bundle gains one key. The
-- body is the shipped one with 'cx_index' added — a full replace, because a
-- function body cannot be patched in place.
create or replace function public.portal_link_bundle(tok text)
  returns jsonb
  language plpgsql security definer set search_path to 'public'
as $function$
declare
  pid uuid;
  out jsonb;
begin
  -- The one and only gate. Expiry/revocation live in portal_link_project.
  pid := portal_link_project(tok);
  if pid is null then
    return null;                              -- one shape for every failure mode
  end if;

  select jsonb_build_object(
    'project',   (select to_jsonb(r) from portal_internal.project_rows(array[pid]) r),
    'stats',     (select to_jsonb(r) from portal_internal.stats_rows(pid) r),
    'cx_index',  coalesce((select jsonb_agg(to_jsonb(r)) from portal_internal.cx_index_stats(pid) r), '[]'::jsonb),
    'findings',  coalesce((select jsonb_agg(to_jsonb(r)) from portal_internal.findings_rows(pid) r), '[]'::jsonb),
    'photos',    coalesce((select jsonb_agg(to_jsonb(r)) from portal_internal.finding_photo_rows(pid) r), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(r)) from portal_internal.document_rows(pid) r), '[]'::jsonb),
    'team',      coalesce((select jsonb_agg(to_jsonb(r)) from portal_internal.team_rows(pid) r), '[]'::jsonb)
  ) into out;

  -- D5 telemetry: a link is not attributable to a person, so make it
  -- attributable to itself. This is why the function is volatile, not stable.
  update portal_share_links
     set last_viewed_at = now(), view_count = view_count + 1
   where token_hash = encode(extensions.digest(coalesce(tok, ''), 'sha256'), 'hex');

  return out;
end
$function$;

select 'portal_cx_index rows on ZZ (staff view)' as probe, count(*)
from public.portal_cx_index((select id from projects where name like 'ZZ-TEST %'));
