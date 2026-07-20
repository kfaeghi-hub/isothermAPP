# OWNER-TIER-PROPOSAL.md — Symmetric owner role (membership-scoped owners)

**Status: PENDING APPROVAL — no code exists for this. Do not build from this document
until every item in §9 (Decisions Required) carries an explicit verdict from Tony.**

- Date proposed: 2026-07-20
- Builds on: `docs/ACCESS-CONTROL-PROPOSAL.md` (as-built 2026-07-20) — the M-pattern
  content layer is UNTOUCHED here; only the admin-concentrated layer splits.
- Premise: three owners (Tony, Peiman, Derek) with separate books of business. Owners
  do NOT see each other's projects. `dev.admin` becomes the sole all-seeing account
  (break-glass + test seed/cleanup). No human's daily login is omniscient.

---

## 1. Role model after

| Role | Visibility | Powers |
|---|---|---|
| `admin` | ALL projects | everything, unchanged — break-glass/super (dev.admin + emergencies) |
| `owner` (NEW) | **member projects only — identical scoping to employees, zero rows elsewhere** | within member projects: everything admin can do today, incl. membership management; plus firm-level rights (§2) |
| `developer` | ALL projects (unchanged) | technical/config — see flag E5 |
| `user` (Employee) | member projects only (unchanged) | content work per the access-control matrix (unchanged) |
| `client` | nothing (unchanged) | future portal |

## 2. Owner capability summary (from the brief, confirmed against the as-built layer)

- **Project-scoped, member projects only:** delete/complete/reopen the project (C2
  trigger admits owner-member) · hard-delete findings/equipment · delete ANY
  checklist instance incl. completed (A1 extends) · delete ANY draft or issued
  report/meeting · manage membership (add/remove employees, set lead flags) —
  membership management moves from admin-only to owner-per-own-projects.
- **Firm-level:** create projects (creator auto-lead trigger covers membership) ·
  manage firm config (templates, classification dimensions/options, meeting types +
  default topics, tag glossary, Cx defaults, deliverable templates) · full directory
  rights incl. delete (deactivate/merge remain UI-surface concentrated per C6).
- **NOT owner:** user/role management (admin-only — owners cannot promote/demote) ·
  org-level (`orgs`) · §12 hardening surfaces.

## 3. Policy delta inventory (current → new; ONLY changed policies listed)

### 3.0 New helpers

```sql
is_owner()  → get_my_role() = 'owner'                          (DEFINER, STABLE)
is_staff()  → get_my_role() in ('admin','developer','owner','user')  (DEFINER, STABLE)
owner_member(pid uuid) → is_owner() and is_project_member(pid)  (composition used below)
```

`is_admin_or_dev()` keeps its name and break-glass meaning.

### 3.1 CRITICAL PLUMBING DELTA (surfaced by this audit): explicit role lists

Every staff-READ and additive-WRITE policy in the current schema uses the inline
list `get_my_role() in ('admin','developer','user')` — **an owner would be locked out
of the directory, templates, firm-config reads, vocab inline-adds, and finding-photo
storage entirely** unless every one of these is updated. Delta: replace the inline
list with `is_staff()` (one definition, future-proof) in:

| Group | Policies |
|---|---|
| Directory reads + additive writes | `dir_read` / `dir_insert` / `dir_update` on companies, contacts, company_roles, company_locations, company_trades, contact_phones, contact_emails (dir_update on company_role_types stays AD→§3.3) |
| Firm-config reads | `tmpl_read` ×5, `cdim_select`, `copt_select`, `dtpl_select`, `odd_select`, `mt_read`, `mtdt_read`, `firm_config_read` ×4, `orgs_select`, `trade_types_read` |
| Vocab additive insert | `trade_types_insert` |
| Storage | `fp_select` / `fp_insert` / `fp_delete` (finding-photos bucket) |

Semantics unchanged for existing roles; owner joins.

### 3.2 Project-destructive layer (AD → AD OR owner-member)

| Policy | Current | New |
|---|---|---|
| `projects.proj_insert` | AD | AD **OR is_owner()** (firm-level create) |
| `projects.proj_update` | AD OR lead | AD OR lead **OR owner_member(id)** |
| `projects.proj_delete` | AD | AD **OR owner_member(id)** |
| `equipment.eq_delete` | AD | AD **OR owner_member(project_id)** |
| `findings.fnd_delete` | AD | AD **OR owner_member(project_id)** |
| `site_reports.sr_delete` | AD OR own-ungenerated | AD OR own-ungenerated **OR owner_member(project_id)** (owner deletes any, incl. generated) |
| `meetings.mtg_delete` | AD OR own-draft | AD OR own-draft **OR owner_member(project_id)** (owner deletes any, incl. issued) |
| `checklist_instances.ci_delete` | AD OR (member AND non-complete) | AD OR (member AND non-complete) **OR owner_member(project_id)** (owner deletes completed too — A1 extension) |

Triggers:
- **C2 status guard** → reject unless `is_admin_or_dev() OR owner_member(NEW.id)`.
- **Creator auto-membership** → role list gains `'owner'` (owner creates → auto-lead).

### 3.3 Firm-config writes (AD → AD OR owner)

`tmpl_write` ×5 · `cdim_write` · `copt_write` · `dtpl_write` · `odd_write` ·
`mt_write` · `mtdt_write` · `firm_config_write` ×4 (cx defaults ×2, tag glossary,
equipment_type_field_defs) · `trade_types_update` / `trade_types_delete` ·
`company_role_types.dir_update` (the C5 tightening admits owner) · directory
`dir_delete` ×7 → all become `is_admin_or_dev() OR is_owner()`.

**Stays AD:** `orgs_write`. **Stays admin-only:** `user_profiles.profiles_admin_all`.

### 3.4 project_members — THE predicate that keeps the walls up

```sql
members_select:  profile_id = auth.uid() OR is_admin_or_dev()
                 OR (is_owner() AND is_project_member(project_id))   -- owner lists own projects' rosters
members_insert:  WITH CHECK ( is_admin_or_dev()
                 OR (is_owner() AND is_project_member(project_id)) )
members_update:  USING + WITH CHECK ( same )
members_delete:  USING ( same )
```

**Why this cannot be used to defeat the walls:** the WITH CHECK on INSERT evaluates
`is_project_member(project_id)` for the ACTING owner against the row being inserted —
an owner inserting themselves into a foreign project is not yet a member of it, so the
predicate is false and the insert is rejected. UPDATE carries both USING (old row's
project must be theirs) and WITH CHECK (new row's project must be theirs), so a row
cannot be re-pointed at a foreign project. The only self-referential action an owner
can take is REMOVING their own row (self-eviction) — flagged as E1.

### 3.5 user_profiles — the Add-member picker (safe extension)

`profiles_admin_all` and `profiles_read_own` are UNCHANGED (role management stays
admin-only; employees/clients never list profiles). New SECURITY DEFINER RPC:

```sql
create function list_internal_profiles()
returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as
$$ select id, name, role from user_profiles
   where role in ('admin','developer','owner','user')
     and get_my_role() in ('admin','developer','owner')   -- caller gate INSIDE the definer
$$;  -- returns ZERO rows for employees/clients; never exposes email or client rows
```

AccessCard switches from its direct `user_profiles` select to this RPC (the direct
select silently returns only the caller's own row for owners — a bug-in-waiting the
RPC removes). Admin UI keeps direct table access.

### 3.6 Confirmed UNCHANGED

All M-pattern content policies (owners ride membership — `is_project_member()` has no
role condition) · coverage view (invoker) · storage buckets other than the §3.1
finding-photos role-list · directory deactivate/merge C6 posture · client (still in
zero policies) · `get_my_role()` itself.

## 4. UI gate inventory (file-by-file, every current role check)

| File · line | Current gate | New |
|---|---|---|
| App.tsx `isAdmin` | a/d → nav Classifications + Users, /classifications, /users | **split:** `canConfig` = a/d/**owner** → Classifications nav + route; **Users nav + route tightens to `admin` only** (matches RLS reality — a developer sees only their own profile row there anyway; flag E6) |
| ProjectsPage `isOwner` | a/d → +New Project, complete/reopen, delete rows | rename `canGovern` = a/d/**owner**. Safe because an owner's list is already RLS-scoped to member projects — buttons only ever appear on their own rows |
| ProjectDetailPage `isOwner` | a/d → complete/reopen, AccessCard render | `canGovern` = a/d/**owner** (page unreachable for non-member owners via RLS) |
| ProjectDetailPage `isLead` | lead → Edit Project | lead OR canGovern |
| IssuesLogPage :538 | a/d → finding Delete | + owner |
| EquipmentPage :515 | a/d → equipment Delete | + owner |
| SiteReportsPage `canDelete` | a/d OR own-ungenerated | + owner (any) |
| MeetingsPage :563 | a/d OR own-draft | + owner (any) |
| ChecklistsPage :1202 | a/d OR non-complete → Delete | + owner (any incl. completed) |
| ChecklistsPage `canReopen` :342 | `admin` OR own-completed | + owner (reopen any on member projects) — flag E7: current gate omits developer; adding owner + developer aligns it with "everything admin can do" |
| TemplatesPage `canEdit` :193 | a/d | + owner |
| AccessCard profiles fetch | direct user_profiles select | → `list_internal_profiles()` RPC |
| DashboardPage empty state | `role === 'user'` | + `'owner'` (an owner with zero memberships sees "No projects assigned yet" until they create/join — per brief §5) |
| UsersPage ROLE_LABEL | — | + `owner: 'Owner'` badge styling |

TS: `UserRole` union gains `'owner'` (types/database.ts + AuthContext.tsx duplicate).

## 5. Migration

1. **Role vocabulary:** `user_profiles.role` is text; a CHECK constraint may or may
   not exist (DDL was applied via MCP, constraint shape unverified while the DB
   connector is down). The migration handles both: a DO block inspects
   `pg_constraint` for a check on `user_profiles.role`; if present, drop + recreate
   including `'owner'`; if absent, nothing needed. `get_my_role()` reads text —
   unchanged. **Confirmed role value for account creation: `owner` (lowercase).**
2. Helpers (§3.0), policy alters (§3.1–3.4), RPC (§3.5), trigger updates (§3.2).
3. **NO account role changes in the migration** — Tony promotes via dashboard after:
   Tony → owner, Peiman → owner, Derek created as owner; dev.admin stays admin;
   dev.test stays user.
4. **NO new backfill** — owners ride existing membership rows (all current profiles
   were backfilled as members of all projects; admins-as-leads from the first pass
   carries Tony's rows). Tony's trimming session with Peiman and Derek IS the
   visibility configuration.

## 6. Test plan

- **Credential set:** `dev.owner@isothermengineering.com`, role **`owner`** (Tony
  creates; `.env` gains `owner_email` / `owner_password`). Membership: dev.owner is
  added to ZZ-TEST as member by the test itself (owner leg needs a member project).
- **pw-access owner leg (extends the existing suite):**
  - *Negative:* dev.owner reads of the non-member probe project → zero rows across
    projects/findings/reports/meetings/instances/equipment (the tier's entire
    point); `project_members` INSERT into the probe (incl. self-add) rejected;
    `user_profiles` role-change UPDATE rejected; `orgs` write rejected.
  - *Positive (member probe):* finding hard-delete succeeds · completed-instance
    delete succeeds (A1 extension) · issued-meeting delete succeeds · project
    complete via status trigger succeeds · membership management: add dev.test,
    flip lead, remove — all succeed · then project delete succeeds.
  - *Firm-level:* template INSERT/DELETE succeeds · classification option write
    succeeds · directory company delete succeeds · project INSERT succeeds AND the
    creator trigger made dev.owner a lead member (asserted).
  - *Picker:* `list_internal_profiles()` returns internal rows for dev.owner,
    ZERO rows for dev.test.
  - **Existing employee + admin legs re-run byte-for-byte unchanged** — employee
    containment must not drift (the suite's existing assertions are the proof).
- **Dashboard as dev.owner** (browser): shows ZZ-TEST after membership add, and no
  other real project (scoping visual).
- **Full battery green** under the credential set (no changes expected — suites run
  as dev.test/dev.admin; owner is additive).

## 7. §12 record (ships with this build)

> **Break-glass vs test admin split.** Split break-glass admin (human-held, vaulted
> credentials, used rarely) from test admin (scriptable, .env) before the firm
> scales beyond the three owners or real client data lands — today dev.admin serves
> both purposes; that dual role is accepted at current scale only.

## 8. NOT building

Owner-to-owner delegation · portfolio grouping/labels · per-owner branding · audit
logs · the Tier-1 "My projects" filter (superseded by real scoping).

## E. Edge flags (accept or direct)

- **E1 — owner self-eviction:** an owner can delete their own membership row; re-entry
  then requires another member-owner or admin. Accepted as symmetric behavior?
- **E2 — zero-membership owner** sees the employee empty state (per brief; noted).
- **E3 — co-owned projects:** two owners sharing a project can each remove the other
  (symmetric by design; last-one-standing keeps the project; admin can always fix).
- **E4 — Classifications becomes visible to owners** (nav + route) — implied by firm
  config rights; listed for completeness.
- **E5 — developer role remains all-seeing** ("developer unchanged" per brief). No
  human holds it today; if a human developer is ever hired, that login is omniscient —
  recorded here so the exception is a decision, not an accident.
- **E6 — Users surface tightens to admin-only** (from admin+dev) to match the
  admin-only RLS on profiles; developers saw a one-row table there anyway.
- **E7 — canReopen currently omits developer** (admin-or-completer only); adding
  owner+developer aligns the UI with the capability matrix. Flagged since it changes
  an existing gate's membership beyond the owner addition.

---

## 9. DECISIONS REQUIRED (approve each explicitly before build)

| # | Decision | Options |
|---|---|---|
| 9.1 | Role value `owner` (lowercase) — confirm for the dev.owner account + promotions | confirm / other |
| 9.2 | E1 self-eviction accepted? | (a) accept (recommended — symmetric, admin can fix) · (b) block deleting own row |
| 9.3 | E6 Users surface admin-only? | (a) yes (recommended) · (b) keep admin+dev |
| 9.4 | E7 reopen gate: owner + developer join admin/completer? | (a) yes (recommended) · (b) owner only |
| 9.5 | dev.owner account — create with role `owner`, creds to `.env` as `owner_email`/`owner_password` | required for the owner test leg |

*End of proposal. Build only after §9 verdicts land in a Tony message.*
