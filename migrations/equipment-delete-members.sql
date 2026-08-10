-- EQUIPMENT HARD-DELETE — widened from governors to PROJECT MEMBERS.
-- Ruled 2026-08-10.
--
-- THE PROTECTION MOVES FROM ROLE TO REFERENCES. It was never really the role
-- that made a delete safe: a governor deleting a referenced unit does the same
-- damage as an employee doing it. What makes it safe is what the unit is
-- attached to, and every one of those attachments already has a guard:
--
--   findings            → the app hard-blocks and NAMES them (signed record)
--   checklist targets   → a FOREIGN KEY refuses, for everyone, at every role
--   Cx Index cells      → counted and named in the confirm
--   attachments         → counted and named in the confirm
--
-- So a clean unit — no findings, no checklist work, no recorded progress — is a
-- typo, and a typo should not need an owner.
--
-- THE FK'S LINE IS THE LINE. `checklist_instance_targets.equipment_id` is ON
-- DELETE RESTRICT, and that stays exactly as it is. It is more protective than a
-- status-based rule ("completed instances only") and, unlike a status rule, it
-- cannot be bypassed by the app forgetting to check. What changes above it is
-- only the SENTENCE the user reads before the attempt.
--
-- AND THE REFUSAL IS LOUD. The old policy simply omitted DELETE for non-
-- governors, so an employee's delete returned `0 rows` with NO error — the write
-- silently did nothing and any caller that did not count rows would have
-- reported success. The app now asserts the departure (see EquipmentPage), and
-- this migration keeps the policy's shape explicit rather than implicit.

begin;

-- Named for what it now permits. Dropped by every prior name so a database that
-- has drifted lands in the same place.
drop policy if exists equipment_delete on equipment;
drop policy if exists equipment_delete_governors on equipment;
drop policy if exists eq_delete on equipment;

create policy equipment_delete on equipment for delete
  using (is_admin_or_dev() or is_project_member(project_id));

comment on policy equipment_delete on equipment is
  'Project members may hard-delete equipment on their own projects. The protection is references, not role: findings hard-block in the app, checklist targets are refused by a foreign key, and Cx Index progress and attachments are named in the confirm. Ruled 2026-08-10.';

commit;
