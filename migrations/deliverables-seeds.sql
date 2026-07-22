-- Deliverables LEED seed deltas (approved 2026-07-21).
do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_dim uuid;
  v_env_opt uuid;
  v_fund uuid; v_enh uuid; v_mbcx uuid;
  t_id uuid;
begin
  -- Pool rename + description tweak
  update deliverable_templates set name = 'CFR & O&M Plan',
    description = 'Current Facilities Requirements and O&M plan'
    where name = 'CFR Plan';
  update deliverable_templates set
    description = 'Monitoring-based Cx plan: tracked points, acceptable-value limits, corrective action plan, performance evaluation, ongoing monitoring'
    where name = 'MBCx Plan';

  -- New pool templates (envelope set dormant: active=false per sign-off 4)
  insert into deliverable_templates (org_id, name, description, sort_order, active) values
    (v_org, 'Design Review', 'Commissioning design review prior to mid-construction documents', 16, true),
    (v_org, 'Design Review Backcheck', 'CD-stage design review back-check of prior review comments', 17, true),
    (v_org, 'Quarterly Trend Analysis', 'Quarterly monitoring trend analysis against the MBCx plan limits', 18, true),
    (v_org, 'MBCx Report', 'Monitoring-based Cx findings and corrective-action report', 19, true),
    (v_org, 'Envelope OPR & BoD Input', 'Building envelope input to OPR and Basis of Design (BECx, NIBS Guideline 3)', 20, false),
    (v_org, 'Envelope Design Review', 'Building envelope design review (BECx)', 21, false),
    (v_org, 'Envelope Submittal Review', 'Building envelope submittal review (BECx)', 22, false),
    (v_org, 'Envelope Field & Mockup Testing Verification', 'Verification of envelope field and mockup testing (BECx)', 23, false),
    (v_org, 'Envelope Cx Report', 'Building envelope commissioning report (BECx)', 24, false),
    (v_org, 'Envelope 10-Month Review', 'Envelope ten-month post-occupancy review (BECx)', 25, false);

  -- Sustainable Programs: shift sort 4+ up by one, insert Envelope option at 4 (dormant)
  select id into v_dim from classification_dimensions where name = 'Sustainable Programs';
  update classification_options set sort_order = sort_order + 1
    where dimension_id = v_dim and sort_order >= 4;
  insert into classification_options (org_id, dimension_id, label, description, sort_order, active)
  values (v_org, v_dim, 'LEED Envelope Cx (BECx)',
    'Enhanced Cx Option 2 - Building Envelope Commissioning per NIBS Guideline 3. Independently pursuable (does not require systems Enhanced Cx); envelope work subcontracted, deliverables tracked as coordinating CxA. v4/v4.1 share this scope.',
    4, false)
  returning id into v_env_opt;

  -- Option ids
  select id into v_fund from classification_options where dimension_id = v_dim and label = 'LEED Fundamental';
  select id into v_enh  from classification_options where dimension_id = v_dim and label = 'LEED Enhanced';
  select id into v_mbcx from classification_options where dimension_id = v_dim and label = 'MBCx';

  -- New mappings (Enhanced replicates Fundamental per the inherits-by-replication ruling)
  for t_id in select id from deliverable_templates where name in ('Cx Plan','Design Review','Final Cx Report') loop
    insert into option_deliverable_defaults (org_id, option_id, template_id) values (v_org, v_fund, t_id)
      on conflict do nothing;
    insert into option_deliverable_defaults (org_id, option_id, template_id) values (v_org, v_enh, t_id)
      on conflict do nothing;
  end loop;
  insert into option_deliverable_defaults (org_id, option_id, template_id)
    select v_org, v_enh, id from deliverable_templates where name = 'Design Review Backcheck'
    on conflict do nothing;
  insert into option_deliverable_defaults (org_id, option_id, template_id)
    select v_org, v_mbcx, id from deliverable_templates where name in ('Quarterly Trend Analysis','MBCx Report')
    on conflict do nothing;
  insert into option_deliverable_defaults (org_id, option_id, template_id)
    select v_org, v_env_opt, id from deliverable_templates where name like 'Envelope %'
    on conflict do nothing;
end $$;

select co.label, co.sort_order, co.active,
  coalesce(string_agg(dt.name, ' | ' order by dt.sort_order), '(none)') as mapped
from classification_options co
join classification_dimensions cd on cd.id = co.dimension_id and cd.name = 'Sustainable Programs'
left join option_deliverable_defaults odd on odd.option_id = co.id
left join deliverable_templates dt on dt.id = odd.template_id
group by co.label, co.sort_order, co.active
order by co.sort_order;
