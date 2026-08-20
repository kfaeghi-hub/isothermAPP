-- CX PLAN RICH COLUMNS — Phase 1 of RICH-TEXT-PROPOSAL (ruled 2026-08-20).
--
-- THE F1 SHAPE: TipTap JSON beside the legacy text, supersede-never-delete.
-- `drafted_text` / `final_text` remain, readable forever — and from this
-- phase on they are MAINTAINED as the trio's plain projection, so every raw
-- reader keeps working and never goes stale. NULL rich = legacy row; readers
-- go JSON-first with fallback; untouched rows render byte-identically (the
-- Phase 1 gate asserts it).
--
-- THE TRIPWIRE (ruled Q2): the shallow CHECK validates nothing deep — it
-- exists so a catastrophically wrong write (a string, an array, someone's
-- HTML) dies at the table instead of at the first render. The door function
-- (liftOrRefuse / validateRich) is the real whitelist; the trio's
-- unknown-node refusals are the net.

alter table public.cx_plan_sections
  add column if not exists drafted_rich jsonb,
  add column if not exists final_rich jsonb;

-- NULL-HOSTILE, learned by probe before shipping: the first cut wrote
-- `drafted_rich->>'type' = 'doc'` — but a jsonb STRING's ->>'type' is NULL,
-- a NULL CHECK verdict PASSES in Postgres, and the tripwire waved through
-- exactly the catastrophes it exists for. jsonb_typeof never returns NULL
-- for a non-null value, so the guard now answers differently in its two
-- states (string/array → 23514; a doc object → pass; both probed live in a
-- rolled-back transaction before this record was committed).
alter table public.cx_plan_sections
  add constraint cx_plan_sections_rich_is_doc check (
    (drafted_rich is null or (jsonb_typeof(drafted_rich) = 'object' and drafted_rich->>'type' = 'doc')) and
    (final_rich  is null or (jsonb_typeof(final_rich)  = 'object' and final_rich->>'type'  = 'doc')));

comment on column public.cx_plan_sections.drafted_rich is
  'TipTap JSON (platform schema, cxplan tier) lifted from the writer''s markdown-lite prose. NULL = legacy row. drafted_text holds toPlainText() of this — the maintained projection, never stale.';
comment on column public.cx_plan_sections.final_rich is
  'TipTap JSON as accepted/edited by the CxA. NULL = legacy row. final_text holds its plain projection.';

select count(*) as sections, count(drafted_rich) as with_rich
from public.cx_plan_sections;
