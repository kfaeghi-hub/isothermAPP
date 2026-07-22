-- Deliverables tab migration (approved 2026-07-21).
-- 1. Status enum swap — full replacement with formal mapping (sign-off 1).
create type deliverable_status as enum ('not_started','in_progress','submitted','accepted');
alter table project_deliverables alter column status drop default;
alter table project_deliverables alter column status type deliverable_status
  using (case status::text
    when 'received' then 'submitted'
    when 'complete' then 'accepted'
    when 'na' then 'not_started'
    else status::text end)::deliverable_status;
alter table project_deliverables alter column status set default 'not_started';
drop type deliverable_status_enum;

-- 2. assigned_to: uuid FK -> profile-name text (§12 convention; all rows null today).
alter table project_deliverables drop constraint project_deliverables_assigned_to_fkey;
alter table project_deliverables alter column assigned_to type text using null;

-- 3. Additive columns + one-of CHECK (rule 17 org_id).
alter table project_deliverables
  add column name text,
  add column sort_order integer not null default 0,
  add column date_submitted date,
  add column date_accepted date,
  add column org_id uuid default '00000000-0000-0000-0000-000000000001' references orgs(id);
alter table project_deliverables add constraint project_deliverables_pool_or_adhoc check
  ((template_id is not null and name is null) or (template_id is null and name is not null));

-- 4. Backfill sort_order on existing rows from the pool order.
update project_deliverables pd set sort_order = dt.sort_order
from deliverable_templates dt where dt.id = pd.template_id;

select column_name, data_type, is_nullable from information_schema.columns
where table_name='project_deliverables' order by ordinal_position;
