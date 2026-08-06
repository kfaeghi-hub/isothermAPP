-- GUARD PROOF for the mixed-kind targeting trigger. Not a migration: it changes
-- nothing and leaves nothing behind.
--
-- Reading a trigger definition back out of pg_trigger proves somebody typed it.
-- This proves it REFUSES — and, first, that it ACCEPTS the legitimate case,
-- because a guard that rejects everything passes a refusal test for the wrong
-- reason.
--
--   leg 1  ARRIVAL  — two EQUIPMENT targets on one instance commit.
--   leg 2  REFUSAL  — equipment + system on one instance raises.
--   leg 3  ARRIVAL  — two SYSTEM targets commit, so leg 2 refused the MIXING
--                     rather than refusing systems outright.
--
-- Each leg runs in its own subtransaction that is rolled back by a deliberate
-- RAISE, so the tables are untouched whether it passes or fails. The trigger is
-- DEFERRABLE INITIALLY DEFERRED, so each leg forces the check with SET
-- CONSTRAINTS ... IMMEDIATE rather than waiting for a commit that never comes.
--
-- Run: node --env-file=.env apply-migration.mjs migrations/system-attachment-prove.sql

CREATE OR REPLACE FUNCTION pg_temp.prove_kind_guard() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  v_proj uuid := 'e0c427d8-2029-4382-b054-6a84248ad8fe';
  v_inst uuid;
  v_eq1 uuid; v_eq2 uuid; v_sys1 uuid; v_sys2 uuid;
  v_ok  boolean;
BEGIN
  SELECT id INTO v_inst FROM checklist_instances WHERE project_id = v_proj LIMIT 1;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'REFUSE: no ZZ-TEST instance to borrow'; END IF;

  SELECT id INTO v_eq1 FROM equipment WHERE project_id = v_proj AND kind = 'equipment' ORDER BY tag LIMIT 1;
  SELECT id INTO v_eq2 FROM equipment WHERE project_id = v_proj AND kind = 'equipment' AND id <> v_eq1 ORDER BY tag LIMIT 1;
  IF v_eq2 IS NULL THEN RAISE EXCEPTION 'REFUSE: need two equipment rows'; END IF;

  -- Two throwaway system rows, created inside the proof and rolled back with it.
  INSERT INTO equipment (project_id, tag, descriptor, kind)
  VALUES (v_proj, 'ZZ-PROOF-SYS-1', 'guard proof system', 'system') RETURNING id INTO v_sys1;
  INSERT INTO equipment (project_id, tag, descriptor, kind)
  VALUES (v_proj, 'ZZ-PROOF-SYS-2', 'guard proof system', 'system') RETURNING id INTO v_sys2;

  -- ── leg 1: ARRIVAL — two equipment targets are legal ───────────────────────
  v_ok := false;
  BEGIN
    DELETE FROM checklist_instance_targets WHERE instance_id = v_inst;
    INSERT INTO checklist_instance_targets (instance_id, equipment_id, role, sort_order)
    VALUES (v_inst, v_eq1, 'primary', 0), (v_inst, v_eq2, 'tested_unit', 1);
    SET CONSTRAINTS trg_instance_targets_single_kind IMMEDIATE;
    v_ok := true;
    RAISE EXCEPTION 'rollback-leg-1';
  EXCEPTION
    WHEN raise_exception THEN IF SQLERRM <> 'rollback-leg-1' THEN RAISE; END IF;
    WHEN check_violation THEN RAISE EXCEPTION 'LEG 1 FAILED: two equipment targets were REFUSED — the guard rejects the normal case';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'LEG 1 FAILED: the insert did not happen'; END IF;
  RETURN NEXT 'LEG 1 PASS — two EQUIPMENT targets accepted (arrival)';

  -- ── leg 2: REFUSAL — mixing kinds must raise ───────────────────────────────
  v_ok := false;
  BEGIN
    DELETE FROM checklist_instance_targets WHERE instance_id = v_inst;
    INSERT INTO checklist_instance_targets (instance_id, equipment_id, role, sort_order)
    VALUES (v_inst, v_eq1, 'primary', 0), (v_inst, v_sys1, 'tested_unit', 1);
    SET CONSTRAINTS trg_instance_targets_single_kind IMMEDIATE;
    RAISE EXCEPTION 'LEG 2 FAILED: equipment + system was ACCEPTED — the guard does not fire';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'LEG 2 FAILED: no check_violation'; END IF;
  RETURN NEXT 'LEG 2 PASS — equipment + system REFUSED (the guard fires)';

  -- ── leg 3: ARRIVAL — two systems are legal, so leg 2 refused the MIXING ────
  v_ok := false;
  BEGIN
    DELETE FROM checklist_instance_targets WHERE instance_id = v_inst;
    INSERT INTO checklist_instance_targets (instance_id, equipment_id, role, sort_order)
    VALUES (v_inst, v_sys1, 'primary', 0), (v_inst, v_sys2, 'tested_unit', 1);
    SET CONSTRAINTS trg_instance_targets_single_kind IMMEDIATE;
    v_ok := true;
    RAISE EXCEPTION 'rollback-leg-3';
  EXCEPTION
    WHEN raise_exception THEN IF SQLERRM <> 'rollback-leg-3' THEN RAISE; END IF;
    WHEN check_violation THEN RAISE EXCEPTION 'LEG 3 FAILED: two SYSTEM targets were refused — the guard rejects systems, not mixing';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'LEG 3 FAILED: the insert did not happen'; END IF;
  RETURN NEXT 'LEG 3 PASS — two SYSTEM targets accepted (leg 2 refused the MIXING, not systems)';

  RAISE EXCEPTION 'rollback-all';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM <> 'rollback-all' THEN RAISE; END IF;
    RETURN NEXT 'KIND GUARD PROVEN — 3/3, no rows written';
END $$;

SELECT * FROM pg_temp.prove_kind_guard();
