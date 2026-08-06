-- Start-Up campaign — the GUARD PROOF for HOLD. Not a migration: it changes
-- nothing and leaves nothing behind. Run it after steps 1 and 2.
--
-- "A check that cannot fail is not a check." Reading the constraint definition
-- back out of pg_constraint proves only that somebody typed it. This proves the
-- database REFUSES the combination it is supposed to refuse — and, first, that
-- it ACCEPTS the one it is supposed to accept, because a refusal test that
-- refuses everything (a bad column, a missing FK) passes for the wrong reason.
--
-- Three legs, in this order, and the order is the point:
--   1. ARRIVAL   — hold on a yn_nr_na_hold item INSERTS. Without this the rest
--                  is vacuous.
--   2. REFUSAL   — hold on a plain yn_nr_na item RAISES check_violation.
--   3. REFUSAL   — pass on a yn_nr_na_hold item RAISES too, so leg 1 did not
--                  simply widen the constraint to accept anything.
--
-- It UPDATES an existing response rather than inserting: (instance, item,
-- target) is uniquely keyed, so an INSERT collides on the unique index and
-- fails for a reason that has nothing to do with the constraint under test.
-- Every write happens inside a subtransaction that is rolled back by a
-- deliberate RAISE, so the table is untouched whether it passes or fails.
--
-- IT RETURNS A RESULT SET, NOT NOTICES. The first version used RAISE NOTICE and
-- the runner printed a bare "APPLIED." — the notices never crossed the
-- management API. A failing leg would still have surfaced (it raises, the query
-- 400s), but a PASS was indistinguishable from a proof that never ran. A check
-- whose success signal is invisible is half a check.
--
-- Run: node --env-file=.env apply-migration.mjs migrations/startup-type-3-prove-hold.sql

CREATE OR REPLACE FUNCTION pg_temp.prove_hold() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE
  v_resp uuid;
  v_ok   boolean;
BEGIN
  SELECT r.id INTO v_resp FROM checklist_responses r LIMIT 1;

  IF v_resp IS NULL THEN
    RAISE EXCEPTION 'REFUSE: no checklist_responses row to borrow — cannot prove anything';
  END IF;

  -- ── leg 1: ARRIVAL ─────────────────────────────────────────────────────────
  v_ok := false;
  BEGIN
    UPDATE checklist_responses SET status_type = 'yn_nr_na_hold', status = 'hold' WHERE id = v_resp;
    v_ok := true;
    RAISE EXCEPTION 'rollback-leg-1';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'rollback-leg-1' THEN RAISE; END IF;
    WHEN check_violation THEN
      RAISE EXCEPTION 'LEG 1 FAILED: hold was REFUSED on a yn_nr_na_hold item — the state is unusable';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'LEG 1 FAILED: the update did not happen'; END IF;
  RETURN NEXT 'LEG 1 PASS — hold ACCEPTED on yn_nr_na_hold (arrival)';

  -- ── leg 2: REFUSAL — hold must not be legal on an IVC/PFC item ────────────
  v_ok := false;
  BEGIN
    UPDATE checklist_responses SET status_type = 'yn_nr_na', status = 'hold' WHERE id = v_resp;
    RAISE EXCEPTION 'LEG 2 FAILED: hold was ACCEPTED on a plain yn_nr_na item — HOLD is not fenced to start-up';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'LEG 2 FAILED: no check_violation'; END IF;
  RETURN NEXT 'LEG 2 PASS — hold REFUSED on yn_nr_na (fenced to start-up)';

  -- ── leg 3: REFUSAL — the new type did not become a free-for-all ───────────
  v_ok := false;
  BEGIN
    UPDATE checklist_responses SET status_type = 'yn_nr_na_hold', status = 'pass' WHERE id = v_resp;
    RAISE EXCEPTION 'LEG 3 FAILED: pass was ACCEPTED on a yn_nr_na_hold item — the pairing is not enforced';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'LEG 3 FAILED: no check_violation'; END IF;
  RETURN NEXT 'LEG 3 PASS — pass REFUSED on yn_nr_na_hold (pairing holds)';

  RETURN NEXT 'HOLD GUARD PROVEN — 3/3, no rows written';
END $$;

SELECT * FROM pg_temp.prove_hold();
