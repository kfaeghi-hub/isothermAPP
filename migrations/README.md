# migrations/ — PARTIAL RECORD, read this first

This folder is **not** a complete migration history. Most schema changes across the
build — the Phase 1 schema, the checklist engine's 14 tables, the classification
framework, access control (`project_members`, all RLS policies, helper functions,
triggers), and the owner tier — were applied directly to the live database via the
**Supabase Management API / MCP** and are not represented here.

Only three DDL/seed files exist on disk (rescued from the gitignored `out/` during
the 2026-07-22 cleanup):

| File | What it did |
|---|---|
| `deliverables-migration.sql` | Deliverables tab reshape: `deliverable_status` four-state enum swap (formal mapping), `name`/`sort_order`/`date_submitted`/`date_accepted`/`org_id` columns, the `pool_or_adhoc` CHECK |
| `deliverables-seeds.sql` | LEED deliverable model seeds: pool template additions/renames, the dormant Envelope BECx option + 6 templates (`active=false`), option→template mappings |
| `render-mode-migration.sql` | `checklist_templates.render_mode` column (check_table transposed fleet mode) |

**Sources of truth:**
- The **live database** is the schema authority (`pg_policies`, `pg_proc`,
  `pg_trigger`, `pg_constraint` for verbatim bodies).
- `src/types/database.ts` is the column-exact TypeScript mirror (update FIRST on any
  schema change).
- `ARCHITECTURE.md` is the schema reference document; the as-built proposal docs
  (`docs/ACCESS-CONTROL-PROPOSAL.md`, `docs/OWNER-TIER-PROPOSAL.md`,
  `docs/DELIVERABLES-TAB-PROPOSAL.md`) record policy/trigger intent.

**Before any environment duplication** (staging, a second org, disaster recovery),
generate a full schema dump from the live project as the baseline — do not attempt
to reconstruct the schema from this folder. (Open-items register: MASTER-BRIEF §12.)
