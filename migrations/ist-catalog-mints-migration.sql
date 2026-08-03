-- ist-catalog-mints-migration.sql — the IST addendum's two mints, ruled 2026-08-03.
--
-- Base-only, like every catalog mint: __base identity and nothing else until the
-- drafter's tables are ratified through the artifact path.
--
-- WITH ONE DELIBERATE EXCEPTION, RULED IN THIS SITTING: these two types carry
-- their fire-integration applicability AT MINT TIME. The exception's edge is
-- written into ARCHITECTURE and is deliberately narrow:
--
--     IST-minted types only · the fire-integration stage group only ·
--     ruled in the same sitting as the mint.
--
-- The reasoning: the no-speculative-rules boundary exists to stop an unread
-- ratification QUEUE, and a rule the owner rules never enters the queue. An
-- applicability rule is keyed to (type x stage group), so a project carrying no
-- smoke control fans never renders the row — the rule is invisible until a unit
-- exists, at which point it is exactly right and arrived without a sitting.
-- For a type whose entire reason to exist is IST scope, that applicability is
-- not a prediction about a project; it is a property of the equipment class.

begin;

insert into equipment_types (key, name, sort_order, active) values
  ('smoke_control_fan',   'Smoke Control Fan',                    170, true),
  ('smoke_control_panel', 'Firefighters'' Smoke Control Station', 171, true)
on conflict (key) do nothing;

-- ── the Law 8 mitigation, and it is the point of these rows ─────────────────
--
-- "Smoke Control Fan" is three tokens. It does NOT all-words-match "SMOKE
-- EXHAUST FAN" — `control` is absent — so without these aliases that descriptor
-- falls through to `fan` at one token. That is the RECEPTACLE PANEL problem
-- arriving in a new discipline, and a smoke exhaust fan typed `fan` is a
-- life-safety unit filed as a comfort one.
--
-- Exact match only, so `SEF-1` still resolves to nothing. SCF and SEF are
-- deliberately NOT aliases: three characters, but pure tag prefixes.
insert into equipment_type_aliases (type_key, alias, note) values
  ('smoke_control_fan',   'Smoke Exhaust Fan',
     'Law 8 mitigation: "Smoke Control Fan" does not all-words-match this descriptor, which would fall to `fan`. Ruled 2026-08-03.'),
  ('smoke_control_fan',   'Stair Pressurization Fan',   null),
  ('smoke_control_fan',   'Smoke Evacuation Fan',       null),
  ('smoke_control_fan',   'Stairwell Pressurization Fan', null),
  ('smoke_control_panel', 'FSCS',                       null),
  ('smoke_control_panel', 'Smoke Control Panel',        null)
on conflict do nothing;

-- ── the ruled exception: fire-integration applicability at mint time ────────

insert into cx_applicability_rules
  (equipment_type, stage_group_name, column_label, applicable, rationale, active, ratified_at)
values
  ('smoke_control_fan', 'IST (Integrated Systems Testing)', null, true,
   'A smoke control fan is in the integrated systems test on every building that has one — CAN/ULC-S1001 names smoke control among the systems whose interconnections it verifies. Ruled at mint time under the recorded IST exception (2026-08-03): this is a property of the equipment class, not a prediction about a project.',
   true, now()),
  ('smoke_control_panel', 'IST (Integrated Systems Testing)', null, true,
   'The Firefighters Smoke Control Station is the point from which smoke control is commanded and observed during an integrated test; an IST centres on it. Ruled at mint time under the recorded IST exception (2026-08-03).',
   true, now())
on conflict (equipment_type, stage_group_name, column_label) do nothing;

commit;
