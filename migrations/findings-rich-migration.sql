-- FINDINGS RICH COLUMNS — Phase 2 of RICH-TEXT-PROPOSAL (ruled 2026-08-20,
-- Phase 2 GO). The F1 shape: description_rich / corrective_action_rich jsonb
-- beside the legacy pair; legacy columns become the trio's maintained plain
-- projection. The tripwire ships in its NULL-HOSTILE form from birth — the
-- Phase 1b lesson (a jsonb string's ->>'type' is NULL and a NULL CHECK
-- verdict passes) is not re-learned here.

alter table public.findings
  add column if not exists description_rich jsonb,
  add column if not exists corrective_action_rich jsonb;

alter table public.findings add constraint findings_rich_is_doc check (
  (description_rich is null or (jsonb_typeof(description_rich) = 'object' and description_rich->>'type' = 'doc')) and
  (corrective_action_rich is null or (jsonb_typeof(corrective_action_rich) = 'object' and corrective_action_rich->>'type' = 'doc')));

-- THE DOOR NORMALIZATION, counted against the Q7 baseline (0 meetings /
-- 3 findings / 0 elsewhere): exactly THREE production findings carried
-- dash-bullet pseudo-lists, all on Seneca — DR-2.12, DR-2.14, DR-2.24.
-- Each lifted through liftOrRefuse (round-trip-asserted), description
-- rewritten as the projection: 3/3 lifted, 2026-08-20. Every other row
-- (263) is untouched legacy, NULL rich, byte-identical everywhere.
--
-- PORTAL POSTURE (ruled Q6, the recorded departure): description stays the
-- whitelisted column — now trio-maintained, never stale. description_rich
-- joins NOTHING portal-facing; its absence from both modes is a named
-- battery pin, not a hope.

select count(*) as findings, count(description_rich) as with_rich
from public.findings;
