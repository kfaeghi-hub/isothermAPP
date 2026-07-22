-- check_table render mode (gate verdict 2026-07-21): template-level flag,
-- sole user = VAV Air Terminal Unit (All Types) PFC until proven.
alter table checklist_templates add column if not exists render_mode text;
update checklist_templates set render_mode = 'check_table'
  where id = '70c3db84-0311-4949-a75c-9b7be493d519';
select id, name, render_mode from checklist_templates where render_mode is not null;
