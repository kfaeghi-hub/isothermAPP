-- CX COLUMN SCOPE — Phase 1 of the Cx Index client-facing build
-- (CX-INDEX-EXPORT-PROPOSAL.md §4, ruled Q4 2026-08-17).
--
-- A column answers one of two kinds of question, and the schema could not
-- tell them apart:
--   'unit'  the work happens per machine (start-up, P2P, insulation) —
--           % = done units / applicable units
--   'type'  the work happens per submittal, which in this firm's practice
--           means per equipment type in the project (shop drawings, SDR,
--           O&Ms) — % = types complete / types in scope, where a type is
--           complete when EVERY applicable unit is done (ruled Q6; partial
--           families count in the denominator only)
--
-- TWO VALUES BY CHECK, NOT A LOOKUP TABLE — 3o Q2's recorded law: a
-- vocabulary consumed by a formula is code; which columns carry which value
-- is policy and stays per-project-editable data like every column property.
--
-- EVERYTHING DEFAULTS 'unit', WHICH IS TODAY'S BEHAVIOUR EXACTLY. This
-- migration changes no number anywhere. The firm-default assignment (which
-- of the 88 go 'type') is a SEPARATE, PAUSED step: the dry-run mapping in
-- docs/CX-INDEX-SCOPE-MAPPING.md awaits the owner's red pen (ruled Q4), and
-- only the post-red-pen seed commit writes any 'type' value. The client-side
-- project initializer copies { label, sort_order } today and gains scope in
-- that same seed commit — sequenced so a project initialized between this
-- migration and the seed still gets a correct (all-'unit') copy.

alter table public.cx_default_columns
  add column if not exists scope text not null default 'unit'
  check (scope in ('unit','type'));

alter table public.project_cx_columns
  add column if not exists scope text not null default 'unit'
  check (scope in ('unit','type'));

comment on column public.cx_default_columns.scope is
  'How the column counts: unit = per-machine work (done units / applicable units); type = per-submittal work (types complete / types in scope, complete = all applicable units done). Ruled Q4/Q6 2026-08-17.';
comment on column public.project_cx_columns.scope is
  'Per-project copy of the counting scope; initialized from cx_default_columns like label/sort_order, editable per project (§4.3 editable defaults).';

select 'cx_default_columns' as t, count(*) as rows, count(*) filter (where scope = 'unit') as unit_scoped from public.cx_default_columns
union all
select 'project_cx_columns', count(*), count(*) filter (where scope = 'unit') from public.project_cx_columns;
