# ACCESS-CONTROL-PROPOSAL.md — Project-level access control (RLS rewrite)

**Status: PENDING APPROVAL — no code exists for this. Do not build from this document
until every item in §9 (Decisions Required) carries an explicit verdict from Tony.**

- Date proposed: 2026-07-20
- Proposed by: Claude Code session (inventory taken from live pg_policies + storage.objects)
- Scope: rewrites every project-scoped RLS policy; adds `project_members`; concentrates
  destructive rights; never blocks normal workflow (self-sufficiency guarantee, §2.3)
- Companion registers: MASTER-BRIEF §12 (storage privacy hardening; this proposal adds
  one item there, §6.3)

---

## 1. Model

Global role × project membership. Roles unchanged: `admin`, `developer`, `user`
(display "Employee"), `client`. No new global tiers.

### 1.1 New table

```sql
create table project_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null default '00000000-0000-0000-0000-000000000001',
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references user_profiles(id) on delete cascade,
  is_lead    boolean not null default false,
  added_by   uuid references user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);
```

### 1.2 Helper functions (all SECURITY DEFINER, STABLE — mirror get_my_role())

| Function | Definition (intent) |
|---|---|
| `is_admin_or_dev()` | `get_my_role() in ('admin','developer')` |
| `is_project_member(pid uuid)` | exists row in project_members for (pid, auth.uid()) |
| `is_project_lead(pid uuid)` | same, with `and is_lead` |
| `my_profile_name()` | `select name from user_profiles where id = auth.uid()` — used by draft-ownership DELETE policies |

### 1.3 Visibility

- admin/developer: all projects.
- Employee (`user`): member projects only (RLS-enforced, zero rows elsewhere).
- Client: **unchanged this round.** GROUND TRUTH: the client role currently appears in
  ZERO policies — clients are already fully locked out of all data. Membership is the
  future portal scoping mechanism (spec note only, no client work now).

### 1.4 Creator auto-membership — MUST be a DB trigger

`AFTER INSERT ON projects`: insert `(new.id, auth.uid(), is_lead = true)` when
`auth.uid()` is not null and caller role is internal. Rationale: client-side auto-add
would miss direct API inserts — including test seeds (pw-dashboard inserts its probe
project via PostgREST; without the trigger the creator cannot see their own project).
Service-role inserts (auth.uid() null) skip gracefully.

---

## 2. Capability matrix

### 2.1 Matrix

| Capability | Admin/Dev | Lead (employee) | Member (employee) | Non-member (employee) |
|---|---|---|---|---|
| See project | all | yes | yes | NO (zero rows) |
| Create project | yes | — | **NO** → C1 | no |
| Delete / complete / reopen project | yes | no | no → C2 | no |
| Manage membership | yes (owner-only) | no (deliberate; one-line flip later) | no | no |
| Project settings: dates, classifications, phases, systems-in-scope | yes | yes | no | no |
| All content work: findings, site reports, meetings, checklists, equipment, Cx Index, team seats, distribution, doc generation | yes | yes | yes | no |
| Inline-add to shared vocabularies (companies, contacts, locations, roles, trades) | yes | yes | yes (VERIFIED already true in current RLS) | yes (firm-wide) |
| Edit directory details | yes | yes | yes (already true) | yes |
| Delete / deactivate / merge directory records | yes | no (DELETE already admin-only today; deactivate see C6) | no | no |
| Hard-delete finding / equipment | yes | no → C3 | no | no |
| Delete meeting | any | own DRAFT only | own draft only → C4 | no |
| Delete site report | any | own UNGENERATED only | same → C4 | no |
| Delete checklist instance | any | per AMENDMENT A1 | per A1 | no |
| Reopen checklist | any | own-completed (existing rule stands) | own-completed | no |
| Firm config structure (templates, dimensions/options, meeting types/default topics, tag glossary, Cx defaults) | yes | read + inline-add only | same | same |
| Manage users | admin only (as today) | no | no | no |

### 2.2 Flagged contradictions with current behavior (NOTHING changed silently)

| ID | Finding | Disposition |
|---|---|---|
| **C1** | Project creation is currently open to every employee ("+ New Project"). The matrix concentrates it to admin/dev. Largest workflow narrowing in the feature. | NEEDS EXPLICIT CONFIRMATION (§9.1) |
| **C2** | Employees can currently complete/reopen projects (list buttons). Becomes admin-only. RLS cannot express column-level conditions, so a BEFORE UPDATE trigger guards the `status` column (leads may edit dates but never flip status). | Implement as matrix; trigger noted |
| **C3** | Issues Log and Equipment delete buttons currently work for employees. RLS DELETE → admin/dev; UI hides buttons for role `user`. Finding PHOTOS remain member-deletable (evidence cleanup inside an open finding = content work, not record destruction). | Implement; photo reading flagged for review |
| **C4** | Draft-ownership matching uses name-text (`prepared_by` / `authored_by` vs `my_profile_name()`). RLS-enforceable but soft (rename/duplicate names break it). Acceptable at 3-user scale; ties to MASTER-BRIEF §12 "My Items user-id normalization". | Implement with flag |
| **C5** | `company_role_types` UPDATE is currently staff-wide (looser than trade_types). Tightens to admin/dev per "structural beyond inline-add". No employee UI path exists anyway (Classifications is admin-gated) — API-only narrowing. | Implement |
| **C6** | "Deactivate/merge" cannot be RLS-separated from legitimate UPDATE on tables where employees keep edit rights. Enforcement: DELETE via RLS (already admin-only); deactivate/merge concentrated via admin-gated UI surfaces only. Honest soft edge (§9A right-sizing). | Accept as soft edge |
| **C7** | Self-sufficiency audit result: EVERY inline-add path in the subcontractor scenario is already additive-writable under current RLS (verified row-by-row against live policies). No workflow path narrows except C1/C2/C3, which are the feature's stated purpose. | No action — guarantee holds |
| **A1** | AMENDMENT REQUESTED: matrix's "own unissued drafts" names meetings/reports only, but employees currently delete checklist instances freely, the field workflow needs abandoning mis-created instances, and pw-copy relies on it. Proposal: members delete NON-COMPLETED instances on member projects; completed instances (frozen records) admin-only. | NEEDS VERDICT (§9.2) |

### 2.3 Self-sufficiency guarantee (design principle — tested explicitly, §7)

The boundary is visibility and destruction, never workflow. An employee on a member
project completes every normal Cx task with zero owner involvement: inline company/
contact/location creation from any picker (Team, responsible party, attendees,
distribution), "+ Add role", inline trades/systems, equipment, Cx Index rows,
findings, reports, meetings, checklist instances, document generation.

---

## 3. Policy inventory — every table, current → proposed

Pattern key:
- **M**  = `is_admin_or_dev() OR is_project_member(<resolved project_id>)`
- **L**  = `is_admin_or_dev() OR is_project_lead(...)`
- **AD** = `is_admin_or_dev()` only
- *(via X)* = table has no project_id; policy resolves through parent X with EXISTS/IN subquery

Current state (from live pg_policies): every project-scoped table has ONE `ALL` policy
for role in (admin, developer, user) — named `project_staff_all`, `inst_access`,
`team_all`, or `pclass_all`. Firm/directory tables have split policies as noted.

### 3.1 Project-scoped tables

| Table | Current | Proposed |
|---|---|---|
| projects | staff ALL | SELECT **M** · INSERT **AD** (+ §1.4 trigger) · UPDATE **L** (+ status-guard trigger, C2) · DELETE **AD**. Client-side `last_visited_at` write REMOVED (see §6.2) |
| project_members (new) | — | SELECT own rows OR **AD** · INSERT/UPDATE/DELETE **AD** |
| project_phases | staff ALL | SELECT **M** · write **L** (settings) |
| project_trades | staff ALL | SELECT **M** · write **L** (settings — systems-in-scope) |
| project_classifications | staff ALL (`pclass_all`) | SELECT **M** · write **L** (settings) |
| project_distribution | staff ALL | ALL **M** |
| project_deliverables | staff ALL | ALL **M** |
| project_cx_stage_groups | staff ALL | ALL **M** |
| project_cx_columns | staff ALL | ALL **M** *(via project_cx_stage_groups)* |
| project_equipment_field_defs | staff ALL | ALL **M** |
| project_team_assignments | staff ALL (`team_all`) | ALL **M** (content work — seat assignment is a member task) |
| documentation_register | staff ALL | ALL **M** |
| file_attachments | staff ALL | ALL **M** |
| equipment | staff ALL | SELECT/INSERT/UPDATE **M** · DELETE **AD** (C3) |
| equipment_attachments | staff ALL | ALL **M** |
| cx_cell_values | staff ALL | ALL **M** *(via equipment)* |
| findings | staff ALL | SELECT/INSERT/UPDATE **M** · DELETE **AD** (C3) |
| finding_diary_entries | staff ALL | ALL **M** *(via findings)* |
| finding_photos | staff ALL | ALL **M** *(via findings; member delete kept, C3 note)* |
| site_reports | staff ALL | SELECT/INSERT/UPDATE **M** · DELETE **AD** OR (**M** AND `storage_url IS NULL` AND `authored_by = my_profile_name()`) |
| meetings | staff ALL | SELECT/INSERT/UPDATE **M** · DELETE **AD** OR (**M** AND `status='draft'` AND `prepared_by = my_profile_name()`) |
| meeting_topics / meeting_attendees / meeting_items | staff ALL | ALL **M** *(via meetings)* |
| checklist_instances | staff ALL (`inst_access`) | SELECT/INSERT/UPDATE **M** · DELETE **AD** OR (**M** AND `status <> 'complete'`) — pending A1 |
| checklist_instance_sections/_items/_grids/_signoffs/_targets | staff ALL | ALL **M** *(via checklist_instances)* |
| checklist_responses / checklist_grid_responses / checklist_finding_links | staff ALL | ALL **M** *(via checklist_instances)* |

### 3.2 Directory tables — UNCHANGED (already match the matrix; verified)

companies, contacts, company_roles, company_locations, company_trades, contact_phones,
contact_emails: SELECT/INSERT/UPDATE staff-wide, DELETE admin/dev — exactly the
additive model. **Exception:** company_role_types UPDATE tightens staff→AD (C5).
trade_types already has the exact additive split (INSERT staff, UPDATE/DELETE AD).

### 3.3 Firm-config tables — UNCHANGED

checklist_templates + 4 children, classification_dimensions/options,
deliverable_templates, option_deliverable_defaults, meeting_types,
meeting_type_default_topics, cx_default_stage_groups/columns, equipment_tag_glossary,
orgs: read staff / write AD, as today.

### 3.4 user_profiles — UNCHANGED

own-row SELECT + admin ALL. The Access UI and Users view are admin-only, so profile
listing works under the existing admin-all policy. `added_by` names render in admin
surfaces only (employees cannot read others' profiles — acceptable).

### 3.5 dashboard_checklist_coverage view — NO CHANGE NEEDED

security_invoker=true + the new checklist_instances policies = automatic membership
scoping. Asserted explicitly in pw-access (§7.1).

### 3.6 storage.objects

| Bucket | Current | Proposed |
|---|---|---|
| site-reports | 4 dev-era policies with NO role check (any authenticated user can read/write/delete any path) | DROP all client policies — nothing client-side touches this bucket (generator uses service role, downloads use public URLs) |
| finding-photos | 3 dev-era policies, NO role check | Require internal staff role (`get_my_role() in (admin,developer,user)`) on INSERT/SELECT/DELETE |
| checklists, meeting-minutes, equipment-files | no client policies (service-role writes / public read) | unchanged |

Path-level membership scoping of storage is DEFERRED to the MASTER-BRIEF §12 storage
privacy hardening pass (one batched change, not two).

---

## 4. Backfill (behavior-preserving) + fixtures

One migration, in order:
1. Insert every internal profile (roles admin/developer/user) as a member of every
   existing project. Admins → `is_lead = true`. `added_by = NULL` (backfill marker).
2. **dev.test explicitly becomes a LEAD on "ZZ-TEST — Do Not Use"** — required or
   pw-dates (project-dates editing) and future settings suites break.
3. Day-one result: nobody loses sight of anything; owners trim deliberately via the
   Access UI afterwards.

New projects: creator auto-added as lead via the §1.4 trigger.

---

## 5. UI

| Surface | Change |
|---|---|
| **Access card** (new) | Project **Overview tab**, right column beside Project Team; admin-only render. Member rows (name, lead toggle, remove-with-confirm), "+ Add member" from profiles. Placement rationale: owners already live on Overview; membership sits next to the team matrix it mirrors. ALTERNATIVE (needs pick, §9.4): a project settings area. |
| Projects list / dashboard / pickers | Auto-scope via RLS — audited: no client code assumes seeing all projects (name lookups degrade to '?'; counts recompute). ONE code change: remove the `last_visited_at` write in `openProject` (§6.2). |
| Button gating (role `user`) | Hide: + New Project (C1), project Delete/Complete (C2), finding Delete, equipment Delete (C3). Render meeting/report Delete only on own drafts. Edit-project modal gated to lead (membership fetched once in ProjectDetailPage). |
| **Users view** (new) | Admin-only nav item: profiles + role + membership counts. NO user creation (Supabase dashboard remains the path; noted as future work). |
| Employee empty state | Zero memberships → dashboard + projects list: "No projects assigned yet — ask an owner." |

---

## 6. Consequences and additions surfaced by this proposal

### 6.1 Test credentials — dev.admin account (TONY ACTION, ~2 min)
Concentrating destruction breaks suite seed/cleanup steps that dev.test (an employee)
performs today: creating/deleting probe projects (pw-dashboard, pw-classification),
deleting issued meetings (pw-meetings, pw-dashboard), deleting findings in cleanup
(pw-finding-register, pw-copy). Fix: create `dev.admin@isothermengineering.com`
(role admin) in the Supabase dashboard; `.env` gains `admin_email`/`admin_password`.
Suites keep verifying CONTENT as dev.test; privileged seed/cleanup moves to dev.admin.
**Honest restatement of the gate:** "battery passes unchanged" cannot literally hold —
what holds is: every suite's verification content unchanged; only credentials on
seed/cleanup steps move.

### 6.2 last_visited_at write removal
`openProject` writes `projects.last_visited_at` for every employee — the one write
forcing projects UPDATE wide open. Already a §12 cleanup candidate; the dashboard
derives visits from site-report dates. This build removes the write so UPDATE can be
lead-gated cleanly.

### 6.3 New §12 entry (record with this build)
The `/api/generate-report|checklist|minutes` endpoints accept UNAUTHENTICATED POSTs
(service-role inside; unguessable ids are the only guard). Fold an auth/membership
check into the same §12 storage privacy hardening pass.

---

## 7. Test plan (heaviest gate in the playbook)

### 7.1 pw-access.mjs (NEW — API layer, raw authenticated PostgREST, not UI)
Setup: as dev.admin, create probe project `ZZ-TEST-ACCESS` withOUT dev.test membership.
- **Negative (dev.test):** zero rows reading probe findings / site_reports / meetings /
  checklist_instances / equipment / team assignments; INSERT and UPDATE against the
  probe rejected; delete of dev.admin's draft meeting rejected; findings DELETE and
  equipment DELETE rejected on ZZ-TEST; template / classification-dimension /
  meeting-type INSERT rejected; projects INSERT rejected; coverage view returns no
  probe row (view scoping, §3.5).
- **Positive (dev.test on ZZ-TEST):** content CRUD succeeds across the same tables;
  own-draft meeting delete succeeds; lead settings write (dates/classification)
  succeeds (dev.test is lead there per §4.2).
- **Lead both ways with one account:** dev.admin adds dev.test to the probe as
  member-NOT-lead → content write succeeds, settings write rejected.
- **Subcontractor scenario end-to-end in the UI as dev.test:** inline new company +
  contact from the Team tab → seat assignment → finding with them as responsible →
  meeting item attributed → generate minutes. Zero permission errors.
- Self-clean: probe project deleted as dev.admin; ZZ-TEST membership restored.

### 7.2 Full battery re-run
Green, with the §6.1 credential pass. That is the behavior-preservation proof for all
content flows.

### 7.3 Dashboard trim
As dev.admin remove dev.test from ZZ-TEST → dev.test dashboard/projects show the empty
state and zero ZZ-TEST rows anywhere → restore membership (guaranteed in cleanup).

---

## 8. NOT building (§9A)

Per-tool granular permissions · permission templates · custom roles · per-capability
checkbox matrices (the ShareSync model — right for file shares, wrong here) · audit
logging beyond `added_by` · user provisioning UI · lead-managed membership (owner-only;
one-line policy flip later if practice demands) · storage path-level scoping (goes with
the §12 pass) · endpoint auth (same §12 pass, §6.3).

---

## 9. DECISIONS REQUIRED (approve each explicitly before build)

| # | Decision | Options |
|---|---|---|
| 9.1 | **C1 — project creation admin/dev-only?** Today every employee can create projects; the matrix as written concentrates it. | (a) confirm admin/dev-only · (b) employees may create (creator becomes lead) |
| 9.2 | **A1 — checklist instance deletes.** | (a) members delete non-completed instances, completed = admin-only (recommended) · (b) admin-only for all instance deletes |
| 9.3 | **dev.admin test account** — create in Supabase dashboard, provide credentials for `.env`. | required for the test gates |
| 9.4 | **Access card placement** | (a) Overview tab card (recommended) · (b) separate settings area |
| 9.5 | Photo-delete reading (C3 note): member-deletable photos inside open findings? | (a) keep member-deletable (recommended) · (b) admin-only like the finding itself |

*End of proposal. Build only after §9 verdicts land in a Tony message.*
