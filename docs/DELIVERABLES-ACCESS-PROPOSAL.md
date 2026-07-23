# Deliverables Access & Visibility — Proposal (as approved)

Status: approved 2026-07-22. Four items from real owner use. Item 1 (security) ships
first, alone, with its own migration + API-layer test. Items 2–4 follow in one pass.
All UI is additive and reuses the existing design system (card-tile / ClauseHead /
STATUS_META chips / rose overdue / RespRow rollup) — no new visual language.

Grounded in the live schema/RLS (Supabase project `isztyeczqndploybdtcn`) and the
as-built components. Helper predicates referenced below, verified live:
- `is_admin_or_dev()` → role in ('admin','developer')
- `is_owner()` → global role = 'owner'
- `is_project_member(pid)` / `is_project_lead(pid)` → membership / lead-membership of pid
- `owner_member(pid)` → `is_owner() AND is_project_member(pid)` — the owner-tier wall

---

## Item 1 — SECURITY: no self-promotion to lead *(ships first, alone)*

**Root cause (verified).** `project_members` UPDATE policy was
`is_admin_or_dev() OR owner_member(project_id)` with no self-exclusion. Since
`is_owner()` is the global role, an owner-role user who is a non-lead member of a
project satisfies the predicate for *every* row in that project — including their
own — and can set their own `is_lead`. AccessCard renders the LEAD/MEMBER toggle on
every row including the viewer's own, so it is a one-click escalation. (Plain
`'user'` members are already blocked by RLS.)

**RLS fix — the wall predicate.** `members_update` USING and WITH CHECK become:

```
(is_admin_or_dev() OR owner_member(project_id)) AND profile_id <> auth.uid()
```

Actor must be admin/dev, or an owner already a member of the project whose
membership they're editing — and may never target their own membership row.
Migration: `migrations/members-self-edit-guard-migration.sql`
(applied as `project_members_self_edit_guard`). INSERT/DELETE unchanged
(self-add is blocked by the membership precondition + unique constraint;
self-removal is not escalation). `auto_add_project_creator` (SECURITY DEFINER)
still sets creator-as-lead at project creation.

**Decision D1 (approved): universal self-exclusion** — applies to admins too; an
admin is made lead by another governor. Tightest form of "no one edits their own
membership row."

**UI fix.** AccessCard is already governor-only (`{isOwner && <AccessCard/>}`).
On the viewer's own row (`m.profile_id === profile.id`), render the LEAD/MEMBER
control as a **static badge, not a button** — mirrors the RLS so the toggle is
never offered where the DB would reject it. Other members' rows keep the toggle.

**API-layer test (pw-access additions), in the owner leg:**
- owner (non-lead member of the probe) PATCHes their own `is_lead` → rejected (0 rows)
- owner flips another member's `is_lead` → allowed (existing membership-management case)
- admin PATCHes their own membership row → rejected (D1)
- existing owner-wall cases still green

Own migration + AccessCard change + test, one commit, before anything else.

---

## Item 2 — Assignee picker reads project membership

**Why empty (verified).** The assignee field is a `<datalist>` whose options come
from a direct `supabase.from('user_profiles').select('name')`. `user_profiles` RLS
is not widened, so a direct read returns only the caller's own row (or zero) → the
list is empty. It is also not scoped to the project.

**Fix.** Populate from `supabase.rpc('list_internal_profiles')` (the SECURITY
DEFINER RPC AccessCard uses) intersected with `project_members` for this project,
resolved to display names. `assigned_to` stays free-text **name** — the deliverables
migration deliberately converted it from a uuid FK to text and My Items matches by
name; no schema change, no new column.

**Decision D2 (approved): members dropdown + keep the free-text fallback** — some
deliverables are owed by external parties; the datalist just makes members one-click.

Verify on the four real (backfilled-membership) projects.

---

## Item 3 — Three visibility views

Reused building blocks (nothing new visually): card shell
`card-tile bg-white rounded-xl border border-gray-200` + `ClauseHead`; status chips
from `STATUS_META` (`src/lib/deliverables.ts`); overdue = `bg-rose-50 text-rose-700`
with `daysSince(due_date) > DELIVERABLE_OVERDUE_GRACE_DAYS`
(`src/lib/dashboardThresholds.ts`); deep-link `<Link to={/projects/:id?tab=deliverables}>`;
rollup look modeled on `RespRow` (`src/pages/DashboardPage.tsx`).

**(a) Per-project widget** — a compact "by assignee" strip at the **top of the
Deliverables tab** (over Overview, which is already dense). Each assignee → total,
overdue count, status split. Project-scoped: explicit `.eq('project_id', projectId)`.

**(b) Firm-dashboard widget — governors only** — "Outstanding Deliverables,"
cross-project, grouped by project then assignee: assignee, status, due date, notes,
overdue rose, deep-link. Leans on RLS (owner sees only their projects). New section
on DashboardPage gated to `['admin','developer','owner']` — introduces the
owner/admin-vs-employee branch the dashboard doesn't have today. The owner's "who
owes me what."

**(c) Reciprocal employee view — "My Deliverables."** Same fields filtered to the
current user. **Decision D3 (approved):** a dedicated **"My Deliverables"** sibling
widget in section D with the richer columns, and the deliverable rows are **removed
from generic My Items** — one coherent "my deliverables" surface; My Items returns
to findings/meetings/reports/checklists. Shown to everyone; governors additionally
get (b).

Scoping is automatic via RLS: (b)/(c) add no project filter and inherit membership
scoping; (a) filters to the one project. Each view verified to show exactly the
viewer's permitted set.

---

## Item 4 — Leads can assign; members can't

**Current state (verified).** `project_deliverables` has one policy, `acc_all` =
`is_admin_or_dev() OR is_project_member(project_id)` for ALL commands, and
DeliverablesPage has zero UI gating — any member can reassign anything.

**Model.** Changing `assigned_to` = admin/dev OR owner-member OR lead-of-this-project.
Members may write other fields (status) but not the assignee.

**DB enforcement — mirror the C2 status-guard trigger** (`guard_project_status`).
New trigger `guard_deliverable_assignee` BEFORE INSERT OR UPDATE on
`project_deliverables`:

```
if new.assigned_to is distinct from old.assigned_to
   and not (is_admin_or_dev() or owner_member(new.project_id) or is_project_lead(new.project_id)) then
  raise exception 'Only an owner or project lead can assign a deliverable';
end if;
```

**Decision D4 (approved): assignee-field only** — the security boundary stays on
role/membership predicates; we do NOT couple RLS to the display-name string (no
"members only their own" clause keyed on `assigned_to = <my name>`). "Assigned to
them" is UI emphasis, not an RLS rule.

**UI gating.** Thread the parent's already-computed `isOwner` + `isLead`
(`ProjectDetailPage.tsx`) into DeliverablesPage; enable the assignee picker only for
admin/owner/lead; members see the assignee read-only but keep the status control.

---

## Sequence
1. **#1 alone** — migration + AccessCard self-row + pw-access additions → own commit,
   verified, pushed.
2. **#2 + #3 + #4 in one pass** — assignee-source fix, the `guard_deliverable_assignee`
   trigger + UI gating, the three widgets, the My-Items reconciliation → build,
   battery + a new deliverable-permission test, commit.
