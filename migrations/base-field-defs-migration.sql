-- UNIVERSAL BASE FIELDS — approach (c), ruled 2026-08-02.
--
-- A def set keyed `__base` that the resolver always prepends: seeded for untyped
-- units, prepended for typed ones, and visible in the field-structure editor as
-- an ordinary group a project may customise.
--
-- WHY A KEY AND NOT A CODE PATH. Rendering these three rows from a hardcoded
-- list in the UI would make them invisible to the field-structure editor — a
-- second, privileged idea of what a nameplate is, that no project could reorder
-- or drop. As data they behave like every other def.
--
-- `__base` is safe as a key: neither def table has an FK to equipment_types, so
-- it never appears in the type picker and never becomes assignable to a unit.
--
-- THE APPLICABILITIES ARE THE ARGUED ONES. A specification does not name a
-- manufacturer — it states performance and lets the market answer. The shop
-- drawing proposes a make and model; the nameplate confirms them and adds the
-- serial, which exists only on the physical unit. The spec column stays empty on
-- identity fields so nobody records a design intent the design never expressed.
--
-- Negative sort_order so the identity group leads whatever the type's own
-- numbering happens to be — no renumbering of the twelve existing sets.

insert into equipment_type_field_defs (equipment_type, section, field_name, unit, sort_order)
values
  ('__base', 'shop_drawing', 'Manufacturer',  null, -30),
  ('__base', 'shop_drawing', 'Model Number',  null, -29),
  ('__base', 'installed',    'Manufacturer',  null, -30),
  ('__base', 'installed',    'Model Number',  null, -29),
  ('__base', 'installed',    'Serial Number', null, -28)
on conflict do nothing;

-- ── NOTHING IS STRANDED ─────────────────────────────────────────────────────
-- 191 units already record identity in the LEGACY equipment columns
-- (163 untyped + 28 typed), written by the old hardcoded fallback. Those
-- columns are the same shape as contacts.email/phone: a single-value ancestor
-- of a general mechanism, kept and mirrored until a removal pass.
--
-- If the base defs read nameplate_extra and nobody copied these across, 191
-- units would open tomorrow showing an empty Manufacturer beside a database row
-- that has held one for months. That is the register telling a lie about itself.
--
-- Copied into the INSTALLED section specifically: these values were entered
-- against a field labelled "Nameplate Data", which is the installed reading, not
-- what a shop drawing proposed.
update equipment e
   set nameplate_extra = jsonb_strip_nulls(
         coalesce(e.nameplate_extra, '{}'::jsonb)
         || jsonb_build_object('installed',
              coalesce(e.nameplate_extra->'installed', '{}'::jsonb)
              || jsonb_strip_nulls(jsonb_build_object(
                   'Manufacturer',  e.manufacturer,
                   'Model Number',  e.model,
                   'Serial Number', e.serial_number))))
 where (e.manufacturer is not null or e.model is not null or e.serial_number is not null)
   and coalesce(e.nameplate_extra->'installed'->>'Manufacturer',
                e.nameplate_extra->'installed'->>'Model Number',
                e.nameplate_extra->'installed'->>'Serial Number') is null;

select (select count(*) from equipment_type_field_defs where equipment_type='__base') as base_defs,
       (select count(*) from equipment
         where nameplate_extra->'installed'->>'Manufacturer' is not null) as units_with_mfr_visible;
