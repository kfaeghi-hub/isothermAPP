-- ZZ-TEST fixture repair: the Start Up stage group had NO columns.
--
-- A Start-Up campaign leftover — the group was created, its columns never were.
-- It sat FIRST by sort order for eight days, so `pw-applicability-rules`, which
-- takes `.limit(1)` on stage groups, asserted against an empty group and failed
-- the moment anything looked. A first-position empty group is a fixture defect
-- whatever a suite does with it.
--
-- THE COLUMN SET comes from the Start-Up family's own section structure, mapped
-- the way every other group maps to its checklist type: one column per section
-- that produces evidence, named as a deliverable rather than as an activity —
-- "Manufacturer Start-Up Report", "Pressure Test Report" is the house style.
--
-- Section F (Sign-Off) gets no column: the two-party signature is ON the form,
-- and a column asserting a signature exists separately from the signed form is
-- the duplicate-record shape this project keeps refusing.
insert into project_cx_columns (stage_group_id, label, sort_order)
select g.id, v.label, v.ord
  from project_cx_stage_groups g
  join projects p on p.id = g.project_id
  cross join (values
    ('Start-Up Checklist Issued',        10),   -- the form exists for the unit
    ('Pre-Start Verification Complete',  20),   -- section A
    ('Energization / First-Start Done',  30),   -- section B
    ('Running Checks Complete',          40),   -- section C
    ('Safety Devices Proven',            50),   -- section D
    ('Readings Recorded',                60),   -- section E
    ('Start-Up Report Received',         70)    -- the contractor's own document
  ) as v(label, ord)
 where p.name = 'ZZ-TEST — Do Not Use'
   and g.name = 'Start Up'
   and not exists (
     select 1 from project_cx_columns c
      where c.stage_group_id = g.id and c.label = v.label);
