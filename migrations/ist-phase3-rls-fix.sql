-- IST — RLS FIX. The phase-1 policies made ist_plans unreadable to every real user.
--
-- WHAT HAPPENED. Phase 1 generated the policies in a loop, deriving each table's
-- project from its plan. For the plan-scoped children that is right. For
-- `ist_plans` ITSELF the generator emitted
--
--     is_project_member((select project_id from ist_plans p where p.id = ist_plans.id))
--
-- — a SELECT on ist_plans inside ist_plans' own policy. Postgres answers that
-- with `infinite recursion detected in policy for relation "ist_plans"`, so the
-- table read as EMPTY to every non-service caller. The screen said "No IST plan
-- yet" while the row sat in the table.
--
-- WHY NOTHING CAUGHT IT. `pw-ist` proved eleven tables, five constraints and six
-- refusals — using the SERVICE ROLE key, which bypasses RLS entirely. A suite
-- that only ever speaks as the service role cannot see an RLS defect, and every
-- check in it was green while the feature was unusable. This is the guard
-- family's own sentence in a new place: **the suite was asserting against a
-- client that could not fail the way real users fail.**
--
-- It was found by the render-and-look gate at phone width — the screenshot said
-- "No IST plan yet" and the database said otherwise. Which is the third time
-- render-and-look has caught what the assertions could not.
--
-- THE FIX, and the discipline that comes with it: `ist_plans` uses its own
-- column. The children keep the join, which is correct for them.

begin;

drop policy if exists ist_plans_read  on ist_plans;
drop policy if exists ist_plans_write on ist_plans;

create policy ist_plans_read on ist_plans for select
  using (is_admin_or_dev() or is_project_member(project_id));

create policy ist_plans_write on ist_plans for all
  using      (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));

commit;
