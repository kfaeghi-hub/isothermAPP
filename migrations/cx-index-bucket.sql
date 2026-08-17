-- CX-INDEX BUCKET — ephemeral home for the generated Cx Index PDF (Phase 2,
-- ruled Q2: the checklists pole — nothing persisted on any row, 10-minute
-- signed URLs in the generate response).
--
-- PRIVATE, per the standing rule (no new public buckets without review; this
-- migration is the review record). No storage policies at all, deliberately:
-- writes are service-role only (generate-report), reads are signed URLs only.
-- A policy here would widen access, not grant it — the checklists bucket is
-- the shape being copied.
--
-- The xlsx never lands here or anywhere: it is built client-side and
-- downloaded from memory (ruled Q3).

insert into storage.buckets (id, name, public)
values ('cx-index', 'cx-index', false)
on conflict (id) do nothing;

select id, public from storage.buckets where id = 'cx-index';
