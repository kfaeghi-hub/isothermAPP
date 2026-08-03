-- type-aliases-migration.sql — Update 1.02, item 1 (the suggestion-as-you-type picker)
--
-- Three deltas and one guard.
--
--   1. equipment_type_aliases  — shorthand is VOCABULARY DATA, not code. "UH",
--      "FCU", "XT" belong beside the types on the Classifications screen where
--      the owner edits them, not in a constant that needs a deploy to change.
--
--   2. equipment.observed_type_name — the never-blocked save needs somewhere to
--      put the typed text. intake_rows has had this column since the B-series;
--      equipment did NOT (checked against the live register, not recalled).
--      Without it, "no matching type" would have to either block the save or
--      throw the text away, and both are wrong: an unknown type is a vocabulary
--      gap, not a data-entry error.
--
--   3. A partial unique index on the proposals queue. Dedup was app-level only —
--      a Set in api/intake.ts — so two users proposing "Force Flow Heater" in
--      the same minute both got a row. Dedup is now a database fact.
--
--   4. blocked_type_aliases + a trigger. Some shorthand must NEVER become an
--      alias, and the reasons are known and specific. A comment in a doc is not
--      a guard; a future admin adding "RP" from the UI would re-import the
--      original RADIANT-vs-RECEPTACLE collision as a feature. The database
--      refuses it, and it refuses it differently in the two states — which is
--      the only kind of guard this codebase counts.

begin;

-- ── 1. aliases ───────────────────────────────────────────────────────────────

create table if not exists equipment_type_aliases (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid,
  type_key    text not null references equipment_types(key) on update cascade on delete cascade,
  alias       text not null,
  note        text,
  created_by  uuid references user_profiles(id),
  created_at  timestamptz not null default now()
);

-- Aliases resolve by EXACT match only, never all-words: "UH" can never
-- all-words-match "Unit Heater", and treating two-letter shorthand as a word bag
-- is how a tag prefix starts claiming units. Uniqueness is therefore on the
-- normalised alias across the whole vocabulary — one alias, one type, no
-- ambiguity to resolve at match time.
create unique index if not exists eta_alias_uniq
  on equipment_type_aliases (lower(btrim(alias)));
create index if not exists eta_type_idx on equipment_type_aliases (type_key);

alter table equipment_type_aliases enable row level security;
drop policy if exists eta_select on equipment_type_aliases;
drop policy if exists eta_write  on equipment_type_aliases;
drop policy if exists eta_update on equipment_type_aliases;
drop policy if exists eta_delete on equipment_type_aliases;
create policy eta_select on equipment_type_aliases for select using (true);
create policy eta_write  on equipment_type_aliases for insert with check (is_staff());
create policy eta_update on equipment_type_aliases for update using (is_staff());
-- Widened to is_staff() deliberately: a filtered DELETE that matches no policy
-- removes zero rows and returns NO ERROR. The contact-channels incident is the
-- evidence; a delete policy narrower than the insert policy is a silent failure
-- waiting for its first user.
create policy eta_delete on equipment_type_aliases for delete using (is_staff());

-- ── 2. the never-blocked save ────────────────────────────────────────────────

alter table equipment add column if not exists observed_type_name text;

-- The waiting-unit count is DERIVED from this column, never stored. A counter
-- drifts the moment a unit is typed by another path; a count(*) cannot lie.
create index if not exists equipment_observed_type_idx
  on equipment (observed_type_name)
  where observed_type_name is not null and equipment_type is null;

-- ── 3. queue dedup as a database fact ────────────────────────────────────────

-- Existing duplicates would fail the index build, so fold them first: keep the
-- oldest row per observed name and mark the rest superseded. Nothing is deleted
-- — a proposal is evidence of what someone actually typed.
update proposed_equipment_types p
   set status = 'superseded'
 where status = 'proposed'
   and exists (
     select 1 from proposed_equipment_types q
      where q.status = 'proposed'
        and lower(btrim(q.observed_name)) = lower(btrim(p.observed_name))
        and q.org_id is not distinct from p.org_id
        and (q.created_at, q.id) < (p.created_at, p.id)
   );

-- NULLS NOT DISTINCT is load-bearing, not decoration. org_id is NULL on every
-- row today, and a plain unique index treats NULLs as distinct — so the first
-- version of this index existed, looked right, and refused nothing at all.
-- pw-type-picker caught it by asserting the second insert is REFUSED rather
-- than asserting the index is present.
create unique index if not exists pet_open_observed_uniq
  on proposed_equipment_types (org_id, lower(btrim(observed_name)))
  nulls not distinct
  where status = 'proposed';

-- ── 4. the never-alias list, enforced ────────────────────────────────────────

create table if not exists blocked_type_aliases (
  alias   text primary key,
  reason  text not null
);

alter table blocked_type_aliases enable row level security;
drop policy if exists bta_select on blocked_type_aliases;
create policy bta_select on blocked_type_aliases for select using (true);
-- No write policy: the block list is ruled, not edited from the app.

insert into blocked_type_aliases (alias, reason) values
  ('rp',   'RADIANT CEILING PANEL vs RECEPTACLE PANEL — the exact collision the type vocabulary was built around. Seeding RP re-imports the original bug as a feature.'),
  ('ct',   'CT is a current transformer on the electrical side of the same drawing set.'),
  ('ch',   'Two characters; collides with tag prefixes.'),
  ('p',    'One character; collides with tag prefixes.'),
  ('wf',   'Two characters; ambiguous between wall fin and wall fan.'),
  ('rtu',  'Distinct equipment, not shorthand — an RTU carries condensing and gas sections an AHU does not. Arrives through the picker''s propose flow when a real unit surfaces (ruled 2026-08-02).'),
  ('hrv',  'Distinct equipment, not shorthand — HRV is sensible-only where ERV is enthalpy. Arrives through the propose flow (ruled 2026-08-02).'),
  ('vrf',  'Distinct equipment, not shorthand — VRF is a system architecture, not a unit type. Arrives through the propose flow (ruled 2026-08-02).')
on conflict (alias) do update set reason = excluded.reason;

create or replace function block_reserved_type_alias() returns trigger
language plpgsql as $$
declare r text;
begin
  select reason into r from blocked_type_aliases
   where alias = lower(btrim(new.alias));
  if found then
    raise exception 'alias "%" is on the never-alias list: %', btrim(new.alias), r
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists eta_block_reserved on equipment_type_aliases;
create trigger eta_block_reserved
  before insert or update of alias on equipment_type_aliases
  for each row execute function block_reserved_type_alias();

-- ── the seed (ruled 2026-08-02) ──────────────────────────────────────────────
-- Cautious by default: a wrong alias types units SILENTLY, which is the failure
-- mode the whole vocabulary exists to prevent. Everything here is either
-- unambiguous in this domain or three-plus characters.

insert into equipment_type_aliases (type_key, alias, note) values
  ('ahu',            'AHU',        null),
  ('ahu',            'Air Handler', null),
  ('ahu',            'DOAS',       'Ruled with the Seneca mapping — DOAS-1/2 typed ahu under the packaged-AC precedent. Exact-match-only keeps HU-DOAS-* humidifier tags safe.'),
  ('ats',            'ATS',        null),
  ('boiler',         'BLR',        'Common Ontario shorthand; three letters, no electrical collision.'),
  ('chiller',        'CHLR',       null),
  ('convector',      'CONV',       null),
  ('cooling_tower',  'Cooling Twr', null),
  ('erv',            'ERV',        null),
  ('expansion_tank', 'XT',         null),
  ('expansion_tank', 'ET',         null),
  ('expansion_tank', 'Exp Tank',   null),
  ('fan',            'EF',         null),
  ('fan',            'SF',         null),
  ('fan',            'RF',         null),
  ('fcu',            'FCU',        null),
  ('generator',      'GEN',        null),
  ('heat_pump',      'HP',         null),
  ('heat_pump',      'ASHP',       null),
  ('heat_pump',      'WSHP',       null),
  ('humidifier',     'HUM',        null),
  ('panel',          'PNL',        null),
  ('panel',          'Panelboard', null),
  ('pump',           'HWP',        null),
  ('pump',           'CHWP',       null),
  ('pump',           'CWP',        null),
  ('pump',           'Circ Pump',  null),
  ('unit_heater',    'UH',         null),
  ('vav',            'VAV Box',    null),
  ('wall_fin',       'Fin Tube',   null),
  ('wall_fin',       'FTR',        null)
on conflict do nothing;

commit;
