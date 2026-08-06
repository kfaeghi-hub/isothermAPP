-- The PRE-START BANNER gets a data home.
--
-- Approved 2026-08-05 with the Phase 0 design: a form-level warning renders as a
-- bold banner above section A, read-before-touching rather than ticked-after.
-- The Liquid Filled Power Transformer master's "Equipment to be isolated from
-- all sources of power" is the first one, and it will not be the last.
--
-- WHY A COLUMN AND NOT A LINE ITEM. A line item is answered; a banner is read.
-- Putting the warning in the items table would make it something a contractor
-- ticks once the work is done, which is precisely the failure the ruling names:
-- "a warning that is ticked is a warning that was read after the fact."
--
-- Snapshotted onto the instance like every other template field, so a checklist
-- issued today keeps the banner it was issued with even if the template changes.

ALTER TABLE checklist_templates  ADD COLUMN IF NOT EXISTS prestart_banner text;
ALTER TABLE checklist_instances  ADD COLUMN IF NOT EXISTS prestart_banner_snapshot text;

COMMENT ON COLUMN checklist_templates.prestart_banner IS
  'Form-level warning rendered as a bold banner above the first section. Read-before-touching, never a tick box.';
COMMENT ON COLUMN checklist_instances.prestart_banner_snapshot IS
  'Banner as it stood when the instance was created. Snapshot, like every other template field.';
