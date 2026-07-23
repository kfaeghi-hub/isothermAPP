-- members-self-edit-guard-migration.sql
-- Applied 2026-07-22 via the Supabase Management API (apply_migration name
-- `project_members_self_edit_guard`).
--
-- SECURITY (privilege escalation). A user with the global 'owner' role who was a
-- (non-lead) member of a project could promote THEMSELVES to lead. The
-- project_members UPDATE policy was:
--   members_update USING/WITH CHECK:  is_admin_or_dev() OR owner_member(project_id)
-- where owner_member(pid) = is_owner() AND is_project_member(pid), and is_owner()
-- is the GLOBAL 'owner' role. So an owner-member satisfied the predicate for every
-- row in a project they belonged to — including their own membership row — and
-- AccessCard renders the LEAD/MEMBER toggle on every row, so it was a one-click
-- self-promotion. (Plain 'user' members were already blocked by RLS; the live
-- vector was owner-role members.)
--
-- FIX: add a self-exclusion so NO ONE may modify their own membership row, and
-- keep the owner-tier wall otherwise intact. Lead status can now only be changed
-- BY an admin/dev, or by an owner who is already a member of that project, and
-- only ON someone else's row. Decision D1 (2026-07-22): the self-exclusion is
-- universal — it applies to admins too (an admin is made lead by another
-- governor), which is the tightest form of "a user may never modify their own
-- membership row (is_lead or otherwise)."
--
-- SCOPE: only members_update changes. INSERT is unaffected (an owner cannot
-- self-add to a foreign project — is_project_member precondition + the unique
-- (project_id, profile_id) constraint), and DELETE (self-removal from a project)
-- is not privilege escalation, so it keeps the existing wall. Project-creation
-- "creator becomes lead" is a SECURITY DEFINER trigger (auto_add_project_creator),
-- not a self-UPDATE, so it is unaffected.

ALTER POLICY members_update ON project_members
  USING      ((is_admin_or_dev() OR owner_member(project_id)) AND profile_id <> auth.uid())
  WITH CHECK ((is_admin_or_dev() OR owner_member(project_id)) AND profile_id <> auth.uid());
