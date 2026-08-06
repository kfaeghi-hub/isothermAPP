-- Start-Up campaign — step 1 of 2: the enum values.
--
-- Ruled 2026-08-05: `startup` is a first-class fourth ChecklistType, not a fold
-- into `ivc`. Its sign-off structure is what makes it a type — the contractor
-- performs, the CxA witnesses, and both sign.
--
-- SPLIT INTO TWO MIGRATIONS ON PURPOSE. `ALTER TYPE ... ADD VALUE` cannot be
-- used by other statements in the same transaction. Step 2 (the status_type
-- CHECKs) does not depend on these values, but a future step that does would
-- fail confusingly if bundled here. Two files, applied in order.
--
-- IF NOT EXISTS makes this idempotent: re-running is a no-op, not an error.

ALTER TYPE checklist_type_enum  ADD VALUE IF NOT EXISTS 'startup';

-- A finding raised DURING a start-up must be able to say so. Without this,
-- start-up findings would be recorded as ivc findings and the origin column
-- would quietly stop meaning what it says.
ALTER TYPE finding_origin_enum  ADD VALUE IF NOT EXISTS 'startup';
