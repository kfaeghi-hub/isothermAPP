-- SYSTEM ATTACHMENT — ruled 2026-08-06 from docs/SYSTEM-ATTACHMENT-PROPOSAL.md.
--
-- The Cx Index already models systems: `equipment.kind` is 'equipment' | 'system'
-- and has been since the index was built. There were ZERO system rows in 935
-- equipment records. The model was ruled, built, and never populated. This does
-- not invent a mechanism; it finishes one.

-- ── 1. kind on the TYPE register ─────────────────────────────────────────────
-- Systems become type rows. A template attaches to a type exactly as it does
-- today, so nothing about checklist_templates.equipment_type changes. Adding a
-- parallel attachment path would create two ways to express one relationship —
-- the shape that produced the deliverable_templates / checklist_templates
-- confusion the Build Spec still has to warn about.
ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'equipment';

ALTER TABLE equipment_types DROP CONSTRAINT IF EXISTS equipment_types_kind_check;
ALTER TABLE equipment_types ADD  CONSTRAINT equipment_types_kind_check
  CHECK (kind = ANY (ARRAY['equipment'::text, 'system'::text]));

COMMENT ON COLUMN equipment_types.kind IS
  'equipment | system. A system row is a thing in the Cx Index that a checklist can target, with no nameplate. Mirrors equipment.kind.';

-- ── 2. THE MIXED-KIND TARGETING GUARD ────────────────────────────────────────
-- A checklist whose targets mix kinds would render two incompatible nameplate
-- column sets in one document: the unit grid wants Specified / Shop Drawing /
-- Installed per unit, and a system has no nameplate at all. The failure is
-- quiet — the document generates, it just says something untrue about half its
-- targets.
--
-- DB-SIDE ON PURPOSE. The app has three paths that create targets and a fourth
-- will exist by the time anyone remembers this rule. A trigger is the only place
-- that catches all of them, which is the same reasoning that moved the dedup
-- rule into the database after a call-site check missed it.
CREATE OR REPLACE FUNCTION assert_instance_targets_single_kind() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_kinds int; v_inst uuid;
BEGIN
  v_inst := COALESCE(NEW.instance_id, OLD.instance_id);
  SELECT count(DISTINCT e.kind) INTO v_kinds
    FROM checklist_instance_targets t
    JOIN equipment e ON e.id = t.equipment_id
   WHERE t.instance_id = v_inst;
  IF v_kinds > 1 THEN
    RAISE EXCEPTION
      'checklist instance % targets both equipment and system rows; a checklist targets one kind (nameplate columns are incompatible)', v_inst
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_instance_targets_single_kind ON checklist_instance_targets;
CREATE CONSTRAINT TRIGGER trg_instance_targets_single_kind
  AFTER INSERT OR UPDATE ON checklist_instance_targets
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_instance_targets_single_kind();

-- DEFERRABLE INITIALLY DEFERRED matters: targets are inserted as a set, and a
-- row-by-row check would fire on the first row of a legitimate multi-target
-- insert before its siblings exist. Deferring to commit checks the finished set,
-- which is the thing the rule is actually about.
