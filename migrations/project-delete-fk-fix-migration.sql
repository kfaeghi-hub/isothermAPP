-- project-delete-fk-fix-migration.sql
-- Applied 2026-07-22 via the Supabase Management API (apply_migration).
--
-- BUG: dev.admin (and owners) could not delete a project whenever the project
-- had any equipment that a checklist instance targeted. The delete aborted with
--   SQLSTATE 23503 (foreign_key_violation)
--   "update or delete on table \"equipment\" violates foreign key constraint
--    \"checklist_instance_targets_equipment_id_fkey\" on table \"checklist_instance_targets\""
-- The app (ProjectsPage.confirmDelete) discarded the error, so the UI showed
-- nothing and the project silently persisted. Full diagnosis: chat 2026-07-22.
--
-- ROOT CAUSE: checklist_instance_targets.equipment_id -> equipment was
-- ON DELETE RESTRICT — the lone non-CASCADE/SET-NULL edge among equipment's
-- inbound FKs. equipment and checklist_instance_targets sit on SEPARATE cascade
-- branches from projects:
--   projects -> equipment                                   (CASCADE)
--   projects -> checklist_instances -> checklist_instance_targets (CASCADE, CASCADE)
-- RESTRICT is non-deferrable and is checked the instant an equipment row is
-- deleted; Postgres does not order sibling cascade branches, so the equipment
-- branch runs while its targets still exist -> abort.
--
-- WHY NOT plain NO ACTION: NO ACTION differs from RESTRICT ONLY in that it CAN be
-- deferred. A non-deferrable NO ACTION is checked at the same point and still
-- aborts here (verified in a rolled-back probe). CASCADE would work but would let
-- a standalone equipment delete silently remove a COMPLETED checklist's target
-- rows — corrupting a frozen record (rule 4). So neither is right.
--
-- FIX: make the check DEFERRABLE INITIALLY DEFERRED. The check now runs at COMMIT,
-- after every cascade action completes, by which point the targets are already
-- gone (cascade-deleted via their own instance_id -> checklist_instances edge) —
-- so a whole-project delete succeeds. A STANDALONE equipment delete that would
-- orphan a target still fails at commit, preserving the original RESTRICT's
-- protective intent. Verified end-to-end in a rolled-back transaction (project
-- delete reached end-of-statement with 0 rows remaining) and confirmed there are
-- 0 cross-project targets, so this resolves every project's delete.
--
-- SCOPE: this is the ONLY genuinely-blocking landmine. A full-schema sweep for
-- RESTRICT / immediate-NO-ACTION FKs whose parent and child both sit inside a
-- delete-root's cascade closure found 6 other candidates (composite NO ACTION FKs
-- in the checklist-snapshot family) — all proven harmless: they share the
-- checklist_instances cascade parent and self-resolve (a rolled-back delete of an
-- instance with 146 responses / 24 targets succeeded with no FK error).

ALTER TABLE checklist_instance_targets
  DROP CONSTRAINT checklist_instance_targets_equipment_id_fkey,
  ADD CONSTRAINT checklist_instance_targets_equipment_id_fkey
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
