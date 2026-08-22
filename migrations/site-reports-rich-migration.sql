-- SITE REPORT NARRATIVE RICH COLUMN — Phase 4 of RICH-TEXT-PROPOSAL, the
-- ladder's last rung (ruled 2026-08-20). The F1 shape: progress_narrative_rich
-- jsonb beside the legacy column; progress_narrative becomes the trio's
-- maintained plain projection. NULL-HOSTILE FROM BIRTH — the Phase 1b lesson
-- (a jsonb string's ->>'type' is NULL and a NULL CHECK verdict passes),
-- fourth surface running, never re-learned.

alter table public.site_reports
  add column if not exists progress_narrative_rich jsonb;

alter table public.site_reports add constraint site_reports_rich_is_doc check (
  progress_narrative_rich is null
  or (jsonb_typeof(progress_narrative_rich) = 'object' and progress_narrative_rich->>'type' = 'doc'));

-- DOOR NORMALIZATION: none needed. The Q7 dash audit measured 0 dash-bullet
-- narratives (baseline 0 meetings / 3 findings / 0 elsewhere — site reports
-- are the "elsewhere"), and the counter retired at Phase 3. Legacy rows lift
-- lazily on first edit, at the door, and untouched reports stay byte-identical
-- through the demoted split('\n') fallback branch.
--
-- THE PATCHER NOTE (this family's hard part): the per-finding photo tables are
-- NESTED inside issue cells and deliberately undeclared; the shared patcher's
-- depth walk leaves them exactly as emitted. Rich narrative adds list
-- paragraphs, never tables, so the TOP-LEVEL table count is unchanged — the
-- phase asserts that rather than assuming it.

select count(*) as site_reports, count(progress_narrative_rich) as with_rich
from public.site_reports;
