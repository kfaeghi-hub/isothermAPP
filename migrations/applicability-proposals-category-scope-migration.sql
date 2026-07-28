-- Applied 2026-07-28 as `applicability_proposals_category_scope`.
--
-- An exception was keyed by TAG, but the classifier is never shown tags — its
-- declared input carries (equipment_type, category, n, sample) and nothing else.
-- It answered at the grain it had: the CATEGORY. All ten exceptions from the
-- first Seneca run carried a category name in `tag`, resolved to no equipment_id,
-- and would have been marked ratified while writing zero cells.
--
-- The model was not wrong; the question was unanswerable as posed. The rule this
-- makes concrete: NEVER ASK AN AGENT FOR A KEY ITS DECLARED INPUT CANNOT SUPPLY.
--
-- The category grain is also the useful one. Within equipment_type 'pump', the
-- SUMP PUMP category is float-switch controlled and unlike the circulation pumps
-- beside it; within 'fan', a CEILING FAN is unlike the exhaust and return fans.
-- Finer than a type rule, coarser than a per-unit override, and it settles every
-- unit in the category in one ruling.

alter table cx_applicability_proposals
  add column if not exists equipment_category text;

comment on column cx_applicability_proposals.equipment_category is
  'Scopes a proposal to one source category within an equipment_type. Set when the '
  'classifier distinguishes a sub-group (SUMP PUMP within pump) that its type rule '
  'does not cover. Applies to every unit in the category on this project.';

-- Migrate the ten in place. Their rationales are sound and cost real money; only
-- the key was wrong, and re-asking would buy the same answer twice.
update cx_applicability_proposals
   set equipment_category = tag, tag = null
 where kind = 'exception' and status = 'proposed'
   and tag is not null and equipment_id is null
   and exists (select 1 from equipment e
                where e.project_id = cx_applicability_proposals.project_id
                  and upper(e.category) = upper(cx_applicability_proposals.tag));

-- Now they can carry an honest unit count, same as the type rules.
update cx_applicability_proposals p
   set units_affected = c.n
  from (select project_id, category, count(*) n from equipment group by project_id, category) c
 where p.equipment_category is not null and p.status = 'proposed'
   and c.project_id = p.project_id and upper(c.category) = upper(p.equipment_category);

-- Also applied at the same time: units_affected on TYPE rules was read from the
-- first matching (type, category) group rather than summed across all of them,
-- so a type spanning several categories was understated — `fan` read 1 when the
-- register holds 12. That number is what a reviewer weighs when deciding whether
-- a rule is consequential, so an understatement is not cosmetic.
update cx_applicability_proposals p
   set units_affected = c.n
  from (select project_id, equipment_type, count(*) n from equipment
         group by project_id, equipment_type) c
 where p.status = 'proposed' and p.kind = 'rule'
   and c.project_id = p.project_id and c.equipment_type = p.equipment_type;

-- ── Applied immediately after, as `applicability_proposals_rehome_untyped_rules`
-- Six "rules" carried a CATEGORY name in equipment_type — AIR SEPARATOR, BUFFER
-- TANK SCHEDULE, EXPANSION TANK SCHEDULE, HEAT EXCHANGER, HYDRAULIC SEPARATOR,
-- LOUVRED PENTHOUSE. Every unit in those categories has equipment_type NULL, so
-- when the classifier was asked for a type it used the only label it had. Same
-- defect as the tag-keyed exceptions, second surface.
--
-- Ratifying one would have upserted into cx_applicability_rules — the FIRM-level
-- table — under a key matching no equipment anywhere. Inert, and permanently so,
-- while reporting success.
--
-- They cannot become firm rules: that table keys on equipment_type because a rule
-- outlives the project that taught it, and a category is a per-project source
-- header off Seneca's own schedule. So they become project-scoped exceptions.
-- The real remedy is upstream and already queued — mint types for these families
-- through proposed_equipment_types and a genuine firm rule becomes possible.
update cx_applicability_proposals p
   set kind = 'exception', category = 'applicability-exception',
       equipment_category = p.equipment_type, equipment_type = null,
       units_affected = (select count(*) from equipment e
                          where e.project_id = p.project_id
                            and upper(e.category) = upper(p.equipment_type))
 where p.status = 'proposed' and p.kind = 'rule' and p.equipment_type is not null
   and not exists (select 1 from equipment e
                    where e.project_id = p.project_id and e.equipment_type = p.equipment_type)
   and exists (select 1 from equipment e
                where e.project_id = p.project_id
                  and upper(e.category) = upper(p.equipment_type));

-- A category exception reads better naming the type it sits inside: "SUMP PUMP in
-- pump" says the type rule above it does not cover this sub-group. Backfilled
-- ONLY where every unit in the category shares one non-null type; where they do
-- not, or are untyped, blank is the honest answer.
update cx_applicability_proposals p
   set equipment_type = t.only_type
  from (select project_id, upper(category) as cat, min(equipment_type) as only_type
          from equipment where equipment_type is not null
         group by project_id, upper(category)
        having count(distinct equipment_type) = 1) t
 where p.equipment_category is not null and p.equipment_type is null
   and p.status = 'proposed'
   and t.project_id = p.project_id and t.cat = upper(p.equipment_category);
