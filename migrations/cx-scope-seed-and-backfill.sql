-- CX SCOPE SEED + FLEET BACKFILL — the batch record (fleet-repoint precedent).
-- Executed 2026-08-17 via the Management API, after the owner's red pen on
-- docs/CX-INDEX-SCOPE-MAPPING.md. Committed as the record of what ran.
--
-- THE RED PEN: mapping confirmed as proposed with ONE change — Group 1 #7
-- (Elec. Panel Schedules / Single Line) stays 'unit': a panel schedule is a
-- per-panel artifact reviewed per panel; applicability keeps the column off
-- non-electrical rows. FINAL: 12 of 88 defaults go 'type' — the Doc Review
-- Stage minus panel schedules (10), plus Turnover's O&Ms Final and
-- Spare Parts / Consumables.
--
-- THE BACKFILL, ruled at the pause: confirmed scopes flow to ALL live
-- projects' project_cx_columns as this one reviewed write. ZZ-% excluded, as
-- always. Matching is by (stage-group name, column label) — the same
-- name-keying the firm applicability rules use; a renamed column detaches
-- from the default and correctly does not flip.
--
-- DRY RUN, recorded before the write: exactly 12 columns flip on each of 6
-- projects — Alexander Muir, Avondale, Central Tech, Seneca, SJWS, West
-- Humber (72 rows). Magellan, Quinte, Clairlea and Workman hold no
-- initialized Cx Index and were untouched. Post-write assertion returned
-- defaults=12, project=72, ZZ-scoped=0.
--
-- WHAT THIS CHANGES AND DOES NOT: scope changes DENOMINATORS, never storage —
-- zero cell facts moved. On-screen percentages on live projects shift where a
-- document column now counts types instead of units; THAT IS THE POINT, and
-- it is why the write is batch-noted rather than folded into a feature
-- commit. Per §4.3 every project remains free to re-edit its own scopes
-- afterward; this backfill set a starting value, not a law.
--
-- (updated_by was added to cx_cell_values in the same session — migration
-- cx_cell_values_updated_by — so the bulk gesture's writes are attributable
-- from birth, per the ruling.)

begin;
with confirmed(group_name, col_label) as (values
  ('Doc Review Stage','IFC Drawings / Specifications'),
  ('Doc Review Stage','Shop Dwgs'),
  ('Doc Review Stage','Equipment Submittals'),
  ('Doc Review Stage','Controls Submittals (BAS)'),
  ('Doc Review Stage','Sequence of Operation (SOO)'),
  ('Doc Review Stage','Control Wiring Diagrams / Schematics'),
  ('Doc Review Stage','O&M Manuals - Preliminary (ToC)'),
  ('Doc Review Stage','TAB Plan / TAB Pre-Req'),
  ('Doc Review Stage','Short Circuit / Coordination Study'),
  ('Doc Review Stage','Startup Plan'),
  ('Turnover','O&Ms Final'),
  ('Turnover','Spare Parts / Consumables'))
update cx_default_columns dc set scope = 'type'
from cx_default_stage_groups dg, confirmed c
where dg.id = dc.stage_group_id and c.group_name = dg.name and c.col_label = dc.label;

with confirmed(group_name, col_label) as (values
  ('Doc Review Stage','IFC Drawings / Specifications'),
  ('Doc Review Stage','Shop Dwgs'),
  ('Doc Review Stage','Equipment Submittals'),
  ('Doc Review Stage','Controls Submittals (BAS)'),
  ('Doc Review Stage','Sequence of Operation (SOO)'),
  ('Doc Review Stage','Control Wiring Diagrams / Schematics'),
  ('Doc Review Stage','O&M Manuals - Preliminary (ToC)'),
  ('Doc Review Stage','TAB Plan / TAB Pre-Req'),
  ('Doc Review Stage','Short Circuit / Coordination Study'),
  ('Doc Review Stage','Startup Plan'),
  ('Turnover','O&Ms Final'),
  ('Turnover','Spare Parts / Consumables'))
update project_cx_columns pc set scope = 'type'
from project_cx_stage_groups g, projects p, confirmed c
where g.id = pc.stage_group_id and p.id = g.project_id
  and c.group_name = g.name and c.col_label = pc.label
  and pc.scope = 'unit' and p.name not like 'ZZ-%';

select 'defaults type' as what, count(*) from cx_default_columns where scope='type'
union all
select 'project cols type', count(*) from project_cx_columns where scope='type'
union all
select 'zz cols type (must be 0)', count(*) from project_cx_columns pc
  join project_cx_stage_groups g on g.id=pc.stage_group_id
  join projects p on p.id=g.project_id
  where pc.scope='type' and p.name like 'ZZ-%';
commit;
