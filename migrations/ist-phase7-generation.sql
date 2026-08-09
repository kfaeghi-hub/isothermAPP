-- IST PHASE 7 — generation history, and Rule 4 revisions.
--
-- RULE 4: an issued artifact is a frozen point-in-time record. So generating a
-- document from an ISSUED plan revision must not overwrite it — the correction
-- is the NEXT revision. Scarborough is REV2 because a determination arrived
-- after REV1 was issued; the rev on the cover is load-bearing, and a system that
-- silently regenerated over REV1 would have destroyed the only evidence that the
-- determination changed anything.

begin;

-- ── generation history ───────────────────────────────────────────────────────
-- Site reports keep only the latest URLs on the row. That is fine for a document
-- with one mode; an IST plan has TWO, and "which mode, when, by whom" is the
-- question a year later when an AHJ asks what was issued before the test.
create table if not exists ist_generations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid,
  plan_id       uuid not null references ist_plans(id) on delete cascade,
  mode          text not null check (mode in ('plan', 'report')),
  storage_url   text,
  pdf_url       text,
  generated_by  uuid references user_profiles(id),
  generated_at  timestamptz not null default now()
);
create index if not exists ist_generations_plan on ist_generations(plan_id);

alter table ist_generations enable row level security;
drop policy if exists ist_generations_read on ist_generations;
create policy ist_generations_read on ist_generations for select
  using (is_admin_or_dev() or is_project_member((select project_id from ist_plans p where p.id = ist_generations.plan_id)));
drop policy if exists ist_generations_write on ist_generations;
create policy ist_generations_write on ist_generations for all
  using      (is_admin_or_dev() or owner_member((select project_id from ist_plans p where p.id = ist_generations.plan_id))
              or is_project_lead((select project_id from ist_plans p where p.id = ist_generations.plan_id)))
  with check (is_admin_or_dev() or owner_member((select project_id from ist_plans p where p.id = ist_generations.plan_id))
              or is_project_lead((select project_id from ist_plans p where p.id = ist_generations.plan_id)));

-- ── the next revision, content and all ───────────────────────────────────────
-- A revision is a FULL copy, because that is what a revision of this document
-- is: REV2 of Scarborough contains everything REV1 contained plus the change.
-- Copying with id remapping is the only way the new revision can be edited
-- without reaching back into the frozen one.
--
-- Sessions, results and sign-offs COME ALONG. The test happened; a new revision
-- of the report does not un-happen it, and REV1 and REV2 of Scarborough both
-- carry the same test results.
create or replace function ist_create_revision(p_plan_id uuid, p_label text, p_description text)
returns uuid language plpgsql as $$
declare
  v_new uuid;
  v_sys jsonb := '{}'::jsonb;
  v_int jsonb := '{}'::jsonb;
  v_pro jsonb := '{}'::jsonb;
  v_ses jsonb := '{}'::jsonb;
  v_res jsonb := '{}'::jsonb;
  r record; v_id uuid;
begin
  insert into ist_plans (project_id, revision_label, revision_date, description, status)
  select project_id, p_label, current_date, p_description, 'draft' from ist_plans where id = p_plan_id
  returning id into v_new;

  for r in select * from ist_systems where plan_id = p_plan_id order by sort_order loop
    insert into ist_systems (plan_id, label, equipment_type_key, equipment_id, overview_description, integrations_objectives, sort_order)
    values (v_new, r.label, r.equipment_type_key, r.equipment_id, r.overview_description, r.integrations_objectives, r.sort_order)
    returning id into v_id;
    v_sys := v_sys || jsonb_build_object(r.id::text, v_id::text);
  end loop;

  for r in select * from ist_integrations where plan_id = p_plan_id order by sort_order loop
    insert into ist_integrations (plan_id, system_a_id, system_b_id, integration_type, normal_mode_behavior, offnormal_mode_behavior, attachment_label, sort_order)
    values (v_new, (v_sys->>r.system_a_id::text)::uuid, (v_sys->>r.system_b_id::text)::uuid,
            r.integration_type, r.normal_mode_behavior, r.offnormal_mode_behavior, r.attachment_label, r.sort_order)
    returning id into v_id;
    v_int := v_int || jsonb_build_object(r.id::text, v_id::text);
  end loop;

  for r in select p.* from ist_protocols p join ist_integrations i on i.id = p.integration_id
            where i.plan_id = p_plan_id order by p.sort_order loop
    insert into ist_protocols (integration_id, subject_kind, subject_label, condition_type, equip_type_code,
                               equipment_id, normal_mode_steps, fire_mode_steps, expected_result, sort_order)
    values ((v_int->>r.integration_id::text)::uuid, r.subject_kind, r.subject_label, r.condition_type, r.equip_type_code,
            r.equipment_id, r.normal_mode_steps, r.fire_mode_steps, r.expected_result, r.sort_order)
    returning id into v_id;
    v_pro := v_pro || jsonb_build_object(r.id::text, v_id::text);
  end loop;

  insert into ist_prerequisites (plan_id, item_no, category, description, state, document_id, evidence_reference, received_on)
  select v_new, item_no, category, description, state, document_id, evidence_reference, received_on
    from ist_prerequisites where plan_id = p_plan_id;

  insert into ist_precompleted (plan_id, integration_id, subject_text, integration_type, documentation_ref, comments)
  select v_new, (v_int->>integration_id::text)::uuid, subject_text, integration_type, documentation_ref, comments
    from ist_precompleted where plan_id = p_plan_id;

  for r in select * from ist_sessions where plan_id = p_plan_id order by test_date loop
    insert into ist_sessions (plan_id, test_date, test_type, description, records_ref)
    values (v_new, r.test_date, r.test_type, r.description, r.records_ref) returning id into v_id;
    v_ses := v_ses || jsonb_build_object(r.id::text, v_id::text);

    insert into ist_session_participants (session_id, role_label, company_id, contact_id, name_text, sort_order)
    select v_id, role_label, company_id, contact_id, name_text, sort_order
      from ist_session_participants where session_id = r.id;

    insert into ist_signoffs (session_id, attachment_label, company_text, name_text, signed_on)
    select v_id, attachment_label, company_text, name_text, signed_on
      from ist_signoffs where session_id = r.id;
  end loop;

  for r in select res.* from ist_results res join ist_sessions s on s.id = res.session_id
            where s.plan_id = p_plan_id loop
    insert into ist_results (session_id, protocol_id, normal_verdict, fire_verdict, observed_text, numeric_value, numeric_unit, tested_on)
    values ((v_ses->>r.session_id::text)::uuid, (v_pro->>r.protocol_id::text)::uuid,
            r.normal_verdict, r.fire_verdict, r.observed_text, r.numeric_value, r.numeric_unit, r.tested_on)
    returning id into v_id;
    v_res := v_res || jsonb_build_object(r.id::text, v_id::text);
  end loop;

  insert into ist_notes (plan_id, scope, integration_id, result_id, body, author_label, received_on, sort_order)
  select v_new, scope,
         case when integration_id is null then null else (v_int->>integration_id::text)::uuid end,
         case when result_id is null then null else (v_res->>result_id::text)::uuid end,
         body, author_label, received_on, sort_order
    from ist_notes where plan_id = p_plan_id;

  return v_new;
end $$;

commit;
