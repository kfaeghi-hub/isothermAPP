-- Start-Up campaign — step 2 of 2: HOLD enters the response model.
--
-- Ruled 2026-08-05, on the Phase 0 design review: "HOLD stands as the fourth
-- response state — a blocked start-up is not a failed one … carry HOLD into the
-- app's response model for the startup type, not just the paper."
--
-- WHY A NEW status_type RATHER THAN A NEW STATUS. Adding 'hold' to the existing
-- 'yn_nr_na' set would make it legal on every IVC and PFC item ever written.
-- HOLD means "the start-up could not proceed" and there is no such state in an
-- installation verification. The status_type column already IS the fence — the
-- pairing CHECK below is what makes a status legal only alongside its type — so
-- the new state gets its own type and inherits that enforcement instead of
-- relying on the UI to offer the right buttons.
--
-- The database is the enforcement. The TypeScript union is a convenience.

ALTER TABLE checklist_template_items  DROP CONSTRAINT IF EXISTS checklist_template_items_status_type_check;
ALTER TABLE checklist_template_items  ADD  CONSTRAINT checklist_template_items_status_type_check
  CHECK (status_type = ANY (ARRAY['yn_nr_na'::text, 'pass_yn'::text, 'yn_nr_na_hold'::text]));

ALTER TABLE checklist_instance_items  DROP CONSTRAINT IF EXISTS checklist_instance_items_status_type_check;
ALTER TABLE checklist_instance_items  ADD  CONSTRAINT checklist_instance_items_status_type_check
  CHECK (status_type = ANY (ARRAY['yn_nr_na'::text, 'pass_yn'::text, 'yn_nr_na_hold'::text]));

ALTER TABLE checklist_responses       DROP CONSTRAINT IF EXISTS checklist_responses_status_type_check;
ALTER TABLE checklist_responses       ADD  CONSTRAINT checklist_responses_status_type_check
  CHECK (status_type = ANY (ARRAY['yn_nr_na'::text, 'pass_yn'::text, 'yn_nr_na_hold'::text]));

-- The pairing constraint — the one that actually fences HOLD to start-up items.
-- Rewritten in full rather than extended, so the whole rule reads in one place.
ALTER TABLE checklist_responses       DROP CONSTRAINT IF EXISTS checklist_responses_check;
ALTER TABLE checklist_responses       ADD  CONSTRAINT checklist_responses_check
  CHECK (
       (status_type = 'yn_nr_na'      AND status = ANY (ARRAY['y'::text, 'n'::text, 'nr'::text, 'na'::text]))
    OR (status_type = 'pass_yn'       AND status = ANY (ARRAY['pass'::text, 'fail'::text]))
    OR (status_type = 'yn_nr_na_hold' AND status = ANY (ARRAY['y'::text, 'n'::text, 'nr'::text, 'na'::text, 'hold'::text]))
    OR (status IS NULL)
  );
