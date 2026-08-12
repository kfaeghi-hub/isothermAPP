# The Documents tab — the per-project document pool

**Status: RULED 2026-08-12 — build after extraction Phase 6 and after 3b.**
Shelf entry: BACKBURNER **3o**.

*Eight open questions ruled and two review findings folded on 2026-08-12. Each
ruling is recorded **inline in the section it changes** and again in §10; the
review findings are §10.5. Where a ruling amended the proposal, the original
recommendation is kept and the ruling appended — the reasoning is the part worth
keeping, including the reasoning that was corrected.*

*Written in a parallel session (callsign `ATLAS`) while the extraction upgrade's
Phases 2–6 run in another. **Nothing in this document was built.** Every finding
that implies a change to `intake`, the extractor or `api/` is stated here as a
recommendation and nowhere else; no code, schema, migration or package was
touched.*

Companions: Build Spec **§4.4** (the evidence-reference ruling, which governs
this whole design), `docs/EXTRACTION-UPGRADE-PROPOSAL.md` (the arc this waits
behind), `samples/calibration/FIXTURES.md` (the corpus that already gates the
sheet classifier), BACKBURNER **3b · 3h · 3j · 3l · 5**.

---

## 0. The model, in one line

> **Upload by discipline. Organize by sheet. Consume by function.**

Documents do not arrive as the things features want. The mechanical engineer
issues **one 60-sheet PDF** with schedules, plans, details, schematics and
sequences of operation inside it; electrical, fire protection and plumbing do the
same. Every feature on the shelf wants **one sheet** out of that — the extractor
wants the schedule sheets, 3h wants the plan sheets, 5 wants the SOO sheets, 3l
wants the legend sheet *first*.

The pool is the layer that turns the first thing into the second. One upload,
every consumer served.

**And it is a working set, not an archive.** §4.4 stands unchanged and unweakened:
*the app records that work happened and where its evidence lives; it does not
require custody of the evidence.* ShareSync remains the firm's document store.
The pool holds only what an app feature **reads** — that is its entire
definition, and §10 Q6 defends it against the one change that would dissolve it.

---

## 1. What exists today, and what each piece means for this

A recon over the schema, storage, portal, intake and the review UI. Nothing below
is speculation; every row was read.

| Existing thing | Where | What it means here |
|---|---|---|
| `intake_uploads` / `intake_rows` | `migrations/intake-tables-migration.sql` | **Staging, not custody.** An upload proposes; a human disposes; B3 writes. The pool is the record layer this staging layer was always missing — and §3.1 keeps the two separate for exactly the reason the comment in that migration gives. |
| `intake-files` bucket (private) | same | The pool's bucket is a second one, not a rename. §3.4. |
| `documentation_register` (`document_name`, `revision`, `sort_order`, `project_id`) | read by `ISTPage.tsx:157`, snapshotted into `site_reports.doc_register` | **A register of receipt, not a file store.** It answers *did we get it*. The pool answers *can a feature read it*. Different questions; both rows can legitimately exist alone. It gains a link, not a replacement (§3.5). |
| `ist_prerequisites.document_id` → `documentation_register`, plus `evidence_reference` free text, plus constraint `ist_prerequisites_yes_needs_evidence` | `migrations/ist-phase6-evidence-reference.sql` | The **upgrade path §4.4 anticipates**. A free-text reference stays valid forever; when the named document lands in the pool, the app *offers* a real link. §3.5. |
| `equipment_attachments` + `equipment-files` bucket (20 MB, `file_type: shop_drawing\|cut_sheet\|submittal\|startup_report\|om_manual\|other`) | ARCHITECTURE §Storage | **The one genuine overlap.** Three of those six file types are pool categories by the brief's own list. The honest answer is a strangler, not a migration — §3.3, and Q1. |
| `api/get-file-url.ts` — row-anchored signed URLs, `DOC_TABLES` registry, `applyCors → requireUser → requireProjectAccess` | 207 lines | The pool needs **two new rows in a table of five**. No new endpoint. §7. |
| `api/intake.ts` — one action router, 4 actions (`extract`, `approve`, `draft-field-set`, `find-pages`), 783 lines | | The precedent that keeps the pool off the function ceiling — and, read the other way, the argument for doing 3b first. §7. |
| `src/lib/schedulePages.ts` — `scanPdfPages`, `renderPage`, `detectTableRegions`, `SHEET_RE`, `PAGE_CEILING = 400` | | **The sheet-index classifier is a widening of this, not a new machine.** It already reads sheet numbers off title blocks (`SHEET_RE`), already scans per page, already handles rotation, already chunks past a 40-page sort ceiling. §6. |
| `SchedulePageFinder.tsx` (326 lines) + `IntakeReview.tsx` (500) | | The review screen is these two, merged and widened. Same muscle, and §6 keeps it that way deliberately. |
| `portal_members` / `is_portal_member()` / `portal_can_view()` / `portal_documents(pid)` RPC | `migrations/portal-*.sql` | The portal reads **only** through SECURITY DEFINER RPCs; RLS cannot filter columns. Pool visibility is one more RPC beside `portal_documents`, with the filter in SQL — never in the UI. §3.6. |
| `src/lib/capabilities.ts` — 9 named helpers | | Every new permission gets a **named** helper, per the 2026-08-10 law. Q8. |
| `samples/calibration/FIXTURES.md` — 4 fixtures, 93 pages, three consultants | | **A sheet-index corpus already exists.** Clairlea is a real 55-page tender set. The classifier can be gated on day one against numbers already published. §6, §8. |

**Two facts to carry forward:** `api/` is at **12 of 12** Vercel function slots, and
every one of the five app buckets is **private with paths-not-URLs** since the §12
privacy pass. Both constrain this design and neither blocks it.

---

## 2. Schema

Five new tables, one new bucket, four link columns on existing tables. Rule 17
(`org_id` from day one) on every new table; Rule 4 (supersede, never delete) is
structural rather than a habit.

### 2.1 `project_documents` — the pool row

**One table for every document, including single-file ones.** A specification or a
certificate is a set whose index has one row or none. Splitting single-file
documents into a second table would give every consumer two joins for one
question, and would put `client_visible` and the supersede chain in two places
where they can disagree.

```sql
create table project_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  org_id        uuid default '00000000-0000-0000-0000-000000000001'::uuid,   -- rule 17

  category_id   uuid not null references document_categories(id),            -- admin data, §2.3
  discipline_id uuid references document_disciplines(id),                    -- null for non-discipline docs
  equipment_id  uuid references equipment(id) on delete set null,            -- submittals/O&Ms for one unit

  title         text not null,                    -- as the firm names it
  issuance_kind text references document_issuance_kinds(key),                -- IFC · IFT · Addendum · Revision · Record
  issuance_label text,                            -- the set's OWN words: "Addendum 3", "Rev 1"
  issued_date   date,

  -- RULE 4, STRUCTURALLY. One direction only. "Superseded" is DERIVED — a row is
  -- superseded iff another row points at it. Storing both directions creates two
  -- facts about one relationship, and two facts can disagree.
  supersedes_id uuid references project_documents(id) on delete restrict,

  storage_path  text not null,                    -- PATH, never URL (§12)
  content_sha256 text,
  byte_size     bigint not null,
  page_count    int,

  -- Ingest lifecycle ONLY. Deliberately does not carry "superseded": that is a
  -- fact about another row, not about this one's processing.
  status        text not null default 'uploaded'
                check (status in ('uploaded','indexing','index_review','indexed','failed')),
  index_note    text,

  client_visible boolean not null default false,  -- §3.6; whitelist, never blacklist
  uploaded_by   uuid references user_profiles(id),
  uploaded_at   timestamptz not null default now()
);
create index project_documents_project on project_documents(project_id, uploaded_at desc);
create index project_documents_hash    on project_documents(project_id, content_sha256);
create index project_documents_superseded on project_documents(supersedes_id) where supersedes_id is not null;
create unique index project_documents_one_successor on project_documents(supersedes_id) where supersedes_id is not null;
```

That last unique index is the one that makes the chain a chain: **two rows may not
supersede the same predecessor**, or "what is current" stops having an answer.

### 2.2 `document_sheets` — the index

**A new table, not a widening of `intake_rows`, and the reason is the same law the
intake migration is built on.** `intake_rows` is *staging*: its lifecycle ends at
approval (`disposition`, `created_equipment_id`), and its whole safety property is
that it is a **different table from the record**. A sheet index is the opposite —
it is durable, and 3h will pin findings to it years after the upload. Putting a
permanent index in a staging table makes the staging table permanent, which
destroys the property that makes intake safe.

```sql
create table document_sheets (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references project_documents(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,   -- denormalised for RLS, as intake_rows does
  org_id       uuid default '00000000-0000-0000-0000-000000000001'::uuid,

  page_no      int not null,

  -- THE OFFER / THE RULING — the intake_rows split, one level up.
  -- proposed_* is what the machine read. The bare columns are what a human confirmed.
  -- A consumer reads the bare columns and never the proposals; that is offer-never-assert
  -- expressed as a schema rather than as a habit in the UI.
  proposed_kind         text,
  proposed_sheet_number text,
  proposed_title        text,
  confidence            numeric(4,3),

  sheet_kind   text check (sheet_kind in
                 ('schedule','plan','detail','schematic','soo','legend','index','title','other')),
  sheet_number text,
  sheet_title  text,

  disposition  text not null default 'pending'
               check (disposition in ('pending','accepted','edited','rejected')),
  resolved_by  uuid references user_profiles(id),
  resolved_at  timestamptz,

  -- THE EGRESS ANSWER (§5). The single-page derivative a consumer actually opens.
  derivative_path text,
  thumb_path      text,

  -- Revisions map across where identifiable (§2.5).
  supersedes_sheet_id uuid references document_sheets(id) on delete set null,

  created_at   timestamptz not null default now(),
  unique (document_id, page_no)
);
create index document_sheets_kind    on document_sheets(project_id, sheet_kind) where disposition <> 'rejected';
create index document_sheets_number  on document_sheets(project_id, upper(sheet_number));
create index document_sheets_pending on document_sheets(document_id) where disposition = 'pending';
```

`sheet_kind` is a **CHECK, not a lookup table** — deliberately, and against the
grain of §2.3. It is the classifier's alphabet: extraction Phase 1's law is that a
model call must have a **strict, enumerated** output schema that fails loudly at
the boundary, and an enumeration assembled from a user-editable table at
prompt-build time is not an enumeration you can reason about. Categories are
firm policy and stay admin data; sheet kinds are a machine contract. Q2.

### 2.3 `document_categories`, `document_disciplines`, `document_issuance_kinds` — admin data

**§4.3, unchanged: editable defaults, never hardcoded.** Firm-level, not
per-project — a category vocabulary that varies per project makes every
cross-project view meaningless, and the pool's whole promise is that a consumer
can ask one question everywhere.

```sql
create table document_categories (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, label text not null, sort_order int not null default 0,
  sheet_indexed boolean not null default false,   -- drives whether the index screen runs at all
  active boolean not null default true,
  org_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
);
```

Seeded, per the brief's scope ruling — and per **Q1's amendment**, three of them
seeded **inactive** in Build 1:

| key | label | `sheet_indexed` | `active` at Build 1 |
|---|---|---|---|
| `drawing_set` | Discipline drawing set | **true** | true |
| `specification` | Specification (Cx divisions) | false | true |
| `shop_drawing` | Shop drawing | false | **false** → flipped in Build 3 |
| `submittal` | Submittal | false | **false** → flipped in Build 3 |
| `certificate` | Certificate | false | true |
| `test_report` | Test report | false | true |
| `om_manual` | O&M manual | false | **false** → flipped in Build 3 |

> **Why three categories ship switched off.** Those three are the classes
> `equipment_attachments` already holds. Between Build 1 and Build 3 the strangler
> (§3.3) is not yet in place, so offering them in the upload picker would open the
> two-write-path split for two builds — the exact failure §3.3 exists to prevent.
> **The category rows exist from day one; the picker does not offer them until
> there is exactly one write path.** `active = false` is the seeded-dormant pattern
> the Envelope deliverable templates already use: the data is there, activation is
> a flag, and nothing needs a second migration to turn it on.

`document_disciplines` (`key`, `label`, `sort_order`) seeded **from the distinct
`discipline` values already in `equipment_tag_glossary`** — the firm has one
discipline vocabulary and a second one would drift from it inside a month.
`document_issuance_kinds` seeded `IFC · IFT · IFP · Addendum · Revision · Record`.

### 2.4 RLS

Read for any project member; **uploads by any project member**; curation by
owner / lead / admin.

```sql
create policy pd_read   on project_documents for select
  using (is_admin_or_dev() or is_project_member(project_id));
create policy pd_insert on project_documents for insert
  with check (is_admin_or_dev() or is_project_member(project_id));
create policy pd_update on project_documents for update
  using      (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id))
  with check (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));
create policy pd_delete on project_documents for delete
  using (is_admin_or_dev() or owner_member(project_id) or is_project_lead(project_id));
-- document_sheets mirrors, keyed on its own project_id.
```

**The INSERT is deliberately wider than intake's**, which is admin/owner/lead-only.
Named rather than copied: intake writes into the equipment register, so its write
gate is a register gate. An upload writes a file into a pool a human then reviews —
the same class of act as attaching a photo to a finding, which every member may
do. The brief rules uploads-by-members and this is the policy that implements it.

**And a UI capability is never the enforcement** (2026-08-10). The helpers in Q8
decide whether to draw a control; these policies decide whether the write lands.
Both move in the same commit or the widening is a silent no-op.

### 2.5 Revisions — supersede, never delete

A new issuance of the same discipline set is **a new row that points at the old
one**. Nothing is overwritten and nothing is deleted.

Three consequences, all of which have to be built or the model is decoration:

1. **Sheet mapping across revisions.** At index confirmation, if the new set
   supersedes an earlier one, sheets are matched **by `sheet_number`** where both
   sides have one; the match is *shown as a proposal* and confirmed in the same
   pass. Sheets that appear only in one revision are shown as added or dropped,
   named rather than silently absent.
2. **Nothing silently points at history.** A finding pinned to `M-301` in Rev 0
   keeps pointing at the Rev 0 sheet — that is Rule 4 and it is correct. What the
   UI must do is **say so**: *"pinned to M-301 (Rev 0 — superseded by Rev 1)"*,
   with a one-click jump to the successor sheet where the mapping exists. A link
   that quietly resolves to the newest revision would rewrite history, which is
   rule 12.
3. **A superseded set stays whole.** Its per-sheet derivatives are dropped once the
   successor's index is confirmed (Q4) — the derivatives are a cache, the set PDF
   is the record.

   **RULED 2026-08-12: re-split-on-demand is deferred, not built.** The proposal
   originally offered to regenerate a superseded sheet's derivative on request. It
   does not. **A user who opens a superseded sheet pays one full-set download** —
   a rare path at an accepted price. *Reason: the split then lives in exactly one
   place — index confirmation — and one code path that runs on every set beats two
   where the second runs almost never and is therefore almost never right.*

---

## 3. Re-homing — what moves, what does not, and the migration

### 3.1 Intake uploads — re-home the file, keep the staging table

Intake keeps `intake_uploads` / `intake_rows` exactly as they are. What changes is
**where the file lives**: a new intake references a pool document instead of
holding its own path.

```sql
alter table intake_uploads
  add column pool_document_id uuid references project_documents(id) on delete restrict,
  alter column storage_path drop not null,
  add constraint intake_uploads_one_source check (
    (storage_path is not null and pool_document_id is null) or
    (storage_path is null and pool_document_id is not null));
```

- **`ON DELETE RESTRICT`**, matching `import_batch_id`'s reasoning exactly: the
  file is provenance for real equipment rows, so it cannot be deleted out from
  under the record it explains.
- **No file moves and no bucket is deleted.** Existing rows keep their
  `intake-files` path; `intake-files` becomes legacy-read-only. Copying files
  between buckets is egress spent on tidiness, and the old rows are provenance for
  live equipment.
- **The flow gets simpler, not just relocated.** Today intake scans a PDF and
  proposes schedule pages. With the pool, the index already says which sheets are
  schedules — intake's page-finding step becomes *"pick from the index"*. The
  `find-pages` action does not disappear (it still serves an ad-hoc upload that
  never joins the pool), but on the pool path it is a query, not a model call. That
  is a cost reduction in the extraction arc's own currency.

**This is the collision surface with the extraction arc, and it is the decisive
sequencing argument.** Extraction Phase 5 ships *"a migration for the columns none
of this has"* on `intake_rows`. If the pool shipped first, that migration would be
aimed at a table whose upload side had just moved underneath it. §9.

### 3.2 The sheet index replaces nothing that exists

`schedulePages.ts` stays where it is and keeps its exports. The classifier that
writes `document_sheets.proposed_*` is the same scan with a wider verdict
vocabulary (§6). No existing caller changes.

### 3.3 `equipment_attachments` — a strangler, not a migration

Three of its six `file_type` values (`shop_drawing`, `submittal`, `om_manual`) are
pool categories by the brief's own list. Leaving both as write paths gives the firm
**two places to put a submittal and two places to look for one**, which is the
actual failure — worse than either table alone.

**Recommendation (Q1):** on the day the pool ships, the Equipment tab's attachment
control **writes to the pool** (with `equipment_id` set) and **reads a union** of
pool rows plus legacy `equipment_attachments` rows, with legacy rows read-only.

- One write path from day one, so the split never opens.
- No data migration, no file copying, no `equipment-files` deletion.
- The backfill becomes optional cleanup, done or not done on its own merits.

The cost, stated: this touches a live surface (`EquipmentPage`), and the union read
is a real complexity the code will carry until the backfill happens. That is the
price of not opening the split, and it is the cheaper of the two.

> **RULED 2026-08-12 — strangler ratified, with an amendment that fixes a
> contradiction in the proposal as written.**
>
> **The defect:** this section said the write path switches *"on the day the pool
> ships"*, while §8 scheduled the strangler in **Build 3**. Both cannot be true, and
> the gap between them is not cosmetic — it leaves the two-write-path split **open
> across Builds 1 and 2**, which is precisely the state this section exists to
> prevent. The proposal argued the right principle and then scheduled against it.
>
> **The amendment, which resolves it without moving the strangler earlier:**
> `shop_drawing`, `submittal` and `om_manual` seed **`active = false` in Build 1**
> (§2.3) and are **flipped active in the strangler commit in Build 3**. The category
> rows exist from day one — nothing needs a second migration — but the upload picker
> does not offer them until there is exactly one write path. Until the flip, a
> submittal has exactly one home: `equipment_attachments`, unchanged and unambiguous.
>
> **"On the day the pool ships" is therefore withdrawn and replaced by: on the day
> those three categories become selectable.** Which is the same sentence, said
> about the thing that actually opens the split.
>
> **Backfill remains never-or-later**, on its own merits, as proposed.

### 3.4 Storage — a sixth bucket, `project-documents`

Private, per the standing rule for new buckets. Path layout:

```
{project_id}/{document_id}/source.pdf
{project_id}/{document_id}/sheets/{page_no}.pdf     ← the derivative (§5)
{project_id}/{document_id}/thumbs/{page_no}.jpg
```

**Two implementation facts that change the build, both verified against Supabase's
docs rather than assumed:**

- Standard uploads carry up to 5 GB, but **above 6 MB the resumable (TUS) path is
  the reliable one** — and every discipline set and every O&M manual is above 6 MB.
  The app's four existing upload call sites (`photos.ts:49`,
  `IntakeUpload.tsx:70/137/367`) all use standard `.upload()`, which is correct for
  what they carry and **insufficient here**. The pool needs `tus-js-client` against
  the direct storage hostname, with progress events — which is also the only way a
  60 MB upload over a site connection is honest about what it is doing rather than
  appearing hung.
- The **global** storage file-size limit takes precedence over any bucket limit, so
  raising the pool's bucket ceiling requires the project-level global to be raised
  first. Recommended: bucket limit **200 MB**, global raised to match.

### 3.5 The IST prerequisite link — an upgrade, never a requirement

The §4.4 ruling is not weakened by one character. `evidence_reference` free text
stays valid forever. What the pool adds is a **third satisfier** and an offer.

```sql
alter table ist_prerequisites
  add column pool_document_id uuid references project_documents(id) on delete set null;

alter table ist_prerequisites drop constraint ist_prerequisites_yes_needs_evidence;
alter table ist_prerequisites add constraint ist_prerequisites_yes_needs_evidence
  check (state <> 'yes'
         or document_id is not null
         or pool_document_id is not null
         or (evidence_reference is not null and length(btrim(evidence_reference)) > 0));

alter table documentation_register
  add column pool_document_id uuid references project_documents(id) on delete set null;
```

- **`ON DELETE SET NULL`, not RESTRICT** — the opposite of `import_batch_id`, and
  the reason is different. A register row and a prerequisite ruling are durable
  records that *survive* their working copy; the working copy is a convenience.
  Blocking a pool cleanup because an old prerequisite links to it would make the
  pool un-prunable, and the claim it supports does not evaporate when the copy
  does — the free-text reference and the register row both remain.
- **The upgrade UI:** where a prerequisite carries free text and the pool contains
  a document whose title matches, the app *offers* — *"link 10-Fire Alarm System
  Verification Report- Rev1?"* — and never asserts. Declining leaves the free text
  untouched and the prerequisite just as satisfied as before. This is exactly
  §4.4's *"App-side upload is always offered, never required"* extended to linking.

> **DEFECT FOUND AND FIXED IN THE RULING PASS, 2026-08-12 — §10.5 Finding 1.**
>
> **`ON DELETE SET NULL` and the widened CHECK collide.** The CHECK accepts
> `pool_document_id` as a **sole** satisfier of `yes`. So a prerequisite whose only
> evidence is a pool link is a row the CHECK holds up by that column alone —
> and deleting the linked document fires the `SET NULL`, which fires the CHECK,
> which **fails the delete**. That is `RESTRICT` behaviour arrived at by accident,
> reported as a constraint violation on `ist_prerequisites` while the user is
> deleting a row in `project_documents` — a refusal two tables away from the
> action, which is the class of error §4.4's plain-error rule exists to prevent.
>
> Worse than the error is what it does to the model: a pool document that cannot be
> removed because an IST ruling points at it makes the pool un-prunable, which is
> the exact outcome the `SET NULL` choice above was reasoned toward avoiding. The
> schema said one thing and the constraint enforced the opposite.
>
> **The fix is in the upgrade flow, not the schema.** The FK stays `SET NULL`; the
> CHECK stays as written. What changes is that **the free-text satisfier always
> survives**:
>
> - **Accepting a link never clears `evidence_reference`.** A link is an *addition*
>   to the claim, never a replacement for it — which is what §4.4 said in the first
>   place: *a claim must NAME its evidence*, and the name is the free text.
> - **A link created where there was no prior free text auto-populates
>   `evidence_reference` with the document's title at link time.** The claim gets its
>   name from the thing it is naming.
>
> `pool_document_id` is then never a sole satisfier in practice, the `SET NULL`
> lands cleanly, and the prerequisite is exactly as satisfied after the deletion as
> before — by the reference it always had. **Fixing this in the schema would have
> meant a CHECK that refuses the link column, which would have made the link
> decorative.** Applies at Build 3; its gate is in §8.

### 3.6 Portal visibility

One new SECURITY DEFINER RPC beside `portal_documents(pid)`, in the same file and
the same shape:

```sql
create or replace function public.portal_pool_documents(pid uuid)
  returns table (document_id uuid, title text, category_label text, discipline_label text,
                 issuance_label text, issued_date date, page_count int)
  language sql stable security definer set search_path to 'public'
as $function$
  select d.id, d.title, c.label, dis.label, d.issuance_label, d.issued_date, d.page_count
    from project_documents d
    join document_categories c on c.id = d.category_id
    left join document_disciplines dis on dis.id = d.discipline_id
   where d.project_id = pid
     and d.client_visible                       -- THE FILTER LIVES HERE, IN SQL
     and not exists (select 1 from project_documents s where s.supersedes_id = d.id)
     and portal_can_view(pid)
$function$;
revoke all on function public.portal_pool_documents(uuid) from anon;
```

Three properties carried over from Part A deliberately: the filter is in SQL and
never in the UI; **no client policy is added to any base table** — clients read only
through the RPC, so Build Spec §3.3's *"Client … appears in ZERO policies"* stays
literally true; and superseded documents are excluded, because a client browsing
last month's drawings is a coordination failure the portal should not manufacture.

File access for a portal user runs through the existing `get-file-url` link-token
leg with a `refuseUnlessIssued`-equivalent gate: **`client_visible` is tested twice,
independently** — once in the RPC that lists, once in the endpoint that signs. The
portal's existing design already does exactly this for `site_reports` and
`meetings`, and the reason it does is that one test is one place to get it wrong.

> **RULED 2026-08-12 (Q5), with one precision that is load-bearing: a
> category-level default applies at UPLOAD TIME ONLY, never retroactively.**
> Changing a category's default visibility changes what the *next* upload starts
> as, and moves **no existing document's flag**. A default that reached backwards
> would mean one admin toggle silently publishing a project's back-catalogue to a
> client — a whole-project disclosure produced by a settings change, with no upload
> event, no audit line and nobody in the room. `client_visible` is a per-document
> fact that a human set; the category default is only ever its starting value.

### 3.7 Audit

Everything the pool's consumers do lands in the existing audit shapes. Uploads
carry `uploaded_by` / `uploaded_at`; index confirmations carry
`resolved_by` / `resolved_at` (the `intake_rows` shape); the supersede chain is
itself an audit trail — *who issued what, when, and what it replaced* is readable
off the table with no separate log.

---

## 4. Which shelf entries gain their dependency, and what each consumes

| Entry | Consumes | What it looks like without the pool |
|---|---|---|
| **3h — drawing-pin findings** | `document_sheets` where `sheet_kind in ('plan','schematic')`, plus `derivative_path` for the canvas, plus a stable `sheet_id` to pin to. Adds `findings.sheet_id` + `(x, y)`. | 3h has to invent set upload, sheet identification, sheet storage and revision handling **before it can pin anything**. Its own entry already names the cost as *"a real interactive sub-system"* and points at `schedulePages.ts` as the neighbourhood. The pool is roughly the first half of that build, done once for four features instead of once for one. |
| **3j — spec / document Q&A** | The `specification` category, carved to Cx divisions 21–28, with a stable document id and page anchor for the citation. | 3j's entry says *"an agent over the project's uploaded specifications"* — **there is no place to upload a specification.** The feature's subject does not exist. A citation also needs a durable id to cite; free-text ShareSync references cannot be cited in a deliverable a client can check. |
| **3l — document-set context** | The sheet index itself, directly and completely. | **3l is not merely dependent — the index is its precondition, and all three of its capabilities are stated in terms of it.** *"Read the legend and abbreviations page FIRST"* requires knowing which page that is → `sheet_kind = 'legend'`. *"Cross-reference units across pages"* requires sheet-level addressing → `document_sheets.id`. *"Validate against the drawing index"* requires the drawing index → `sheet_kind = 'index'`, and the pool's own row count to check it against. Built without the pool, 3l would build a private throwaway index and then throw it away. |
| **5 — FPT agent** | `sheet_kind = 'soo'` sheets and the specification. An FPT script is written **against the sequence of operations**, and the SOO lives on a sheet inside a discipline set — findable only through the index. | The FPT agent's entry says it *"reads the sequence of operations and the installed points."* Installed points exist. The sequence of operations, today, is a page inside a PDF nobody has uploaded. |
| *(3m — full-document intelligence)* | Same ingestion machinery as 3j and 5; its own entry says building any of the three builds two thirds of the others. | Named for completeness: 3m is downstream of the same foundation, and its *"disagreement between two documents is a finding"* premise requires both documents to be **in one place with stable ids**. |

**Two entries that do *not* gain a dependency**, said so the map is honest: **3i**
(nameplate-photo OCR) reads a photograph of a plate, not a document, and is
unaffected. **3f** (extraction-rules harvest) gains not a dependency but a *second
correction surface* to capture from — every sheet-kind correction a human makes is
the same class of signal as an extraction correction, and should feed the same
capture rather than grow its own.

---

## 5. Storage and egress arithmetic

### 5.1 Per project

Sizes are from the calibration corpus, which is real client drawings from three
consultants: Workman **8.9 MB / 18 pp** (0.49 MB/sheet), Clairlea **17.9 MB /
55 pp** (0.33), West Humber **9.0 MB / 19 pp** (0.47). Call it **0.4 MB per
sheet**. The rest is practice, and is labelled as estimate.

| Class | Count | Each | Subtotal |
|---|---|---|---|
| Discipline sets — M / E / FP / P, first issuance | ~150 sheets | 0.4 MB *(measured)* | 60 MB |
| Two further issuances (addenda / revisions) | ~150 sheets each | 0.4 MB | 120 MB |
| Sheet derivatives — current issuance only (§5.3) | ~150 | 0.4 MB | 60 MB |
| Specification — Cx divisions 21–28 only *(carved; §5.4)* | 1 | 25 MB *(est.)* | 25 MB |
| Shop drawings & submittals — scheduled equipment | ~40 | 5 MB *(est.)* | 200 MB |
| Certificates & test reports | ~30 | 2 MB *(est.)* | 60 MB |
| O&M manuals — major equipment only, at closeout | ~15 | 30 MB *(est.)* | 450 MB |
| **Pre-closeout total** | | | **≈ 525 MB** |
| **At-closeout total** | | | **≈ 975 MB ≈ 1.0 GB** |

### 5.2 Firm-wide, against Supabase Pro

Pro includes **100 GB storage** (then $0.021/GB-month), **8 GB database per
project**, and **250 GB uncached + 250 GB cached egress** (then $0.09 / $0.03 per
GB).

| Scenario | Pool storage | Over the 100 GB quota | Monthly overage |
|---|---|---|---|
| Today — 4 real projects + 2 test | ~4 GB | — | **$0** |
| 20 active + 30 closed | ~50 GB | — | **$0** |
| 100 projects | ~100 GB | 0 | **$0** |
| 200 projects | ~200 GB | 100 GB | **$2.10** |

> **Storage is not the constraint, and will not become one.** At two hundred
> projects the overage is under three dollars a month. The per-project usage
> readout the brief asks for is therefore worth building **as a hygiene tool, not
> as a cost control** — it catches the 400 MB spec somebody uploaded whole, which
> is a *tidiness* problem, and it is honest to say so rather than dress it as
> budget management.

Database growth is nil by comparison: `document_sheets` at ~150 rows per project
× 100 projects is 15,000 rows against an 8 GB disk.

### 5.3 Egress is the number that matters, and the derivative is the whole answer

The trap is simple. If a consumer opens **the set** to look at **one sheet**, every
sheet view costs a full-set download.

| | per sheet view | views inside the 250 GB quota |
|---|---|---|
| Read the whole set (60-sheet mechanical PDF, ~24 MB) | 24 MB | **~10,600 / month** |
| Read the sheet derivative | 0.4 MB | **~640,000 / month** |

**A 60× reduction, bought with roughly 1× extra storage that costs nothing.** Ten
thousand set-opens a month sounds like plenty until the portal is on and clients
browse drawings, and until every extraction run, every 3h pin and every 3l
cross-reference is also pulling pages.

**This must be in the first commit, not added later.** Retrofitting derivatives
means re-splitting every set already in the pool — reading each one back out, at
full egress cost, to fix an egress problem.

**Where the split happens: client-side, at index confirmation.** The file is
already in the browser (it was just uploaded and rendered for review), so splitting
there costs no download. `schedulePages.ts` already does per-page work at this
scale with `PAGE_CEILING = 400`. Server-side splitting would need a function slot
and would fight `maxDuration` on a 60-page set — see §7.

**One honest gap.** Whether the Smart CDN serves a 10-minute signed URL as *cached*
egress ($0.03) or *uncached* ($0.09) is not established here. Every number above
assumes uncached, which is the conservative direction. It is one measurement
against the first real set and should be taken rather than argued.

### 5.4 The carve at the door

A full project specification runs 100–400 MB; Cx divisions 21–28 are on the order
of 10–15% of it. **The carve should happen client-side, before upload — so the bulk
is never stored, never transferred, and never has to be deleted.** Uploading 400 MB
in order to discard 360 MB spends the egress and the storage anyway and turns the
discard into a *deletion*, which is a thing that can fail or be forgotten. Carved
at the door, the bulk is a never-was. Q3.

> **RULED 2026-08-12 (Q3): client-side carve, conditional on the measurement — and
> the failure branch is decided now rather than left to whoever hits it.**
>
> The open cost was always whether a browser on real field hardware can page-extract
> a 400 MB PDF. That measurement still has to be taken, but the branch no longer
> waits on it:
>
> | measurement | what ships |
> |---|---|
> | the browser carves a representative 400 MB spec on representative field hardware | **automatic client-side carve** — the finder proposes division boundaries from the spec's own table of contents, the user confirms, only the carve uploads |
> | it does not | **manual carve by the user before upload** — the app states the divisions it needs and accepts only the carved file; the user produces it with the tools they already have |
>
> **Whole-upload-then-delete is not a fallback and is not available in either
> branch.** It spends the egress and the storage in full to reach the same place,
> and converts a never-was into a deletion — a step that can fail, be interrupted,
> or be forgotten, leaving 400 MB of out-of-scope specification sitting in a bucket
> that §4.4 says should never have held it.
>
> **Server-side carving stays off the table** for the two reasons already named: it
> would want a function slot against a 12-of-12 ceiling, and a 400 MB page
> extraction is not a job to run inside a `maxDuration` window.
>
> The degraded branch is a worse product and an honest one: **the scope rule is
> enforced either way**, and only the convenience differs.

---

## 6. The one new screen — sheet-index review

**It should feel like the intake review, because it is the same muscle**, and the
build should reach for the existing components rather than a new idiom.

```
┌── Sheet index — Mechanical · IFC · 2026-08-14 ──────────── 60 sheets ──┐
│  Reading sheets…  ████████████████░░░░  47 / 60                        │
│                                                                        │
│  ⚠ 3 sheets have no readable sheet number — named below, not skipped   │
│                                                                        │
│  ── Schedules (4) ────────────────────────────── accept all above 0.8 ─│
│  ┌────────┐  M-501   MECHANICAL SCHEDULES          schedule ▾    0.94  │
│  │ thumb  │  ☑ confirm                                                 │
│  └────────┘                                                            │
│  ┌────────┐  M-502   PUMP & BOILER SCHEDULES       schedule ▾    0.91  │
│  ...                                                                   │
│  ── Needs a look (6) ──── lowest confidence first ─────────────────────│
│  ┌────────┐  (no number)  scanned — no text layer   ??? ▾        0.31  │
│  │ thumb  │  ☐ confirm    ← the machine could not read this one        │
│  └────────┘                                                            │
│  ── Plans (38) · Details (9) · Schematics (2) · SOO (1) ───── collapsed│
│                                                                        │
│  This looks like a revision of  Mechanical · IFT · 2026-06-02.         │
│  Map 57 of 60 sheets by sheet number?   [ Review the mapping ]         │
│                                                                        │
│                              [ Confirm index ]   [ Cancel ]            │
└────────────────────────────────────────────────────────────────────────┘
```

Every property below is carried from a surface that already exists, not invented:

- **Deterministic first, model only where ambiguous** — `scanPdfPages` already
  splits `schedule / not / ambiguous / scanned`; only the last two reach a model
  call. Widening the verdict vocabulary does not change that split.
- **Thumbnails from `renderPage`**, exactly as `SchedulePageFinder` renders them
  today, at the ruled downscale.
- **Lowest confidence first**, and the low-confidence group is the one that is
  *open* by default. The confident groups collapse. A review screen that shows 60
  rows equally is a review screen nobody reads.
- **Offer, never assert.** Nothing serves a consumer until `disposition <>
  'pending'`. A sheet the machine could not read is shown **as unread**, by name —
  never quietly typed `other`. This is the finder's own ruling, already in its
  copy: *"a confident wrong yes costs an extraction and a page of…"*.
- **Bulk accept above a threshold, then hand-fix the rest** — the one interaction
  that makes a 60-sheet review take two minutes instead of twenty.
- **The revision mapping is offered with its arithmetic shown** (57 of 60), and the
  three unmatched sheets are named. Never applied silently.
- **Chunked continuation past the page ceiling**, as the sorter already does for
  Clairlea's 51 undecided pages — a 200-sheet architectural-scale set must not hit
  a wall, it must continue.

**Calibration corpus: it already exists.** `FIXTURES.md` has three consultants' sets
with per-page ground truth already published — Clairlea p16/17/21/22 schedules,
p3–13 plans, p30–55 scanned; Workman p7/11/12; West Humber p7/12. So the gate is
available on day one with no acquisition. **And it doubles as a regression guard:**
the classifier is a *widening* of the finder, so the gate must assert the existing
`schedule` verdicts are **unchanged** (Workman 3, Clairlea 4, West Humber 2) while
the new kinds are measured fresh. A widened prompt that improves plan detection by
moving a schedule verdict has not improved anything.

> **HARDENED 2026-08-12 — §10.5 Finding 2.** That regression requirement is **a
> named assertion inside `pw-sheet-index.mjs`**, not a number a reviewer is trusted
> to check by eye. *A rule enforced by memory is enforced by nothing* — and this
> particular rule is enforced at exactly the moment nobody is looking, because a
> prompt change that moves a schedule verdict arrives inside a commit that is
> improving something else.

**Tab placement.** Eleven tabs today; Documents makes twelve. Recommended position:
**last, after IST** — it is a foundation surface rather than a step in a workflow,
and re-ordering existing tabs is a change nobody asked for. (Alternative, if the
owner prefers adjacency to where intake lives today: immediately after Equipment.)
Worth one line to whoever builds it: `MOBILE-AUDIT.md` exists, and a twelfth tab
is a horizontal-scroll question on a phone before it is anything else.

---

## 7. The endpoint / slot question, stated honestly

**`api/` is at 12 of 12.** The status is unchanged since 3b was written.

**The pool needs zero new function slots.** Each need lands on an existing surface,
and in every case it is the surface that already exists *for that purpose*:

| Need | Where it lands | Slots |
|---|---|---|
| Sheet classification (model call for ambiguous/scanned pages) | a fifth action on `api/intake.ts` — the precedent that already carries `find-pages` and `draft-field-set` for exactly this reason | **0** |
| Signed URLs for pool documents and sheet derivatives | two new entries in `get-file-url`'s `DOC_TABLES` — the row-anchored pattern working as designed | **0** |
| Portal document list | a SECURITY DEFINER RPC beside `portal_documents` — the portal reads through RPCs, never endpoints | **0** |
| Splitting a set into per-sheet derivatives | **client-side**, at index confirmation (§5.3) | **0** |

**And the counterweight, because "zero slots" is only half the truth.**
`api/intake.ts` is 783 lines serving four unrelated actions, and a fifth makes it
definitively *the file where things live because there was nowhere else*. That is
**3b's pressure seen from the other side**: 3b frees three slots, but its more
valuable output is that the action-router pattern gets **ratified as a design**
rather than tolerated as a workaround. If 3b runs first, the sheet classifier can
take a clean slot or ride a router that was designed to be one.

3b's own entry says it wakes *"when the next feature needs a function slot — or
sooner, deliberately."* This proposal is not that trigger — the pool does not need
a slot. It is an argument for the *"or sooner."*

---

## 8. Build shape and gates

Four phases, separately gated, in the house pattern.

| # | Ships | Gate |
|---|---|---|
| **1** | Schema, bucket, categories/disciplines/issuances as admin data — **`shop_drawing` · `submittal` · `om_manual` seeded `active = false` (Q1 amendment, §2.3)** — resumable upload, the Documents tab listing with per-project usage. No index yet — upload, categorise, supersede, download. | A set uploads at 60 MB over TUS with visible progress; supersede chain proven on ZZ-TEST including the two-successors refusal; RLS proven **as a member and as a lead**, not as the service role. **And the dormant three are asserted absent from the upload picker** — a category that ships switched off is only switched off if something checks; an inactive row that the picker renders anyway is the split opening silently, which is the failure Q1's amendment exists to prevent. |
| **2** | Sheet index: classifier (widened `scanPdfPages`), the review screen, client-side derivative split. | **The FIXTURES corpus.** New kinds measured and the numbers printed; an unreadable sheet reaches the human **as unread**; derivatives exist for every confirmed sheet. **And the regression is a NAMED ASSERTION in `pw-sheet-index.mjs` (§10.5 Finding 2): existing `schedule` verdicts unchanged at Workman 3 / Clairlea 4 / West Humber 2, failing by name and per fixture** — not a number checked by eye at review time. |
| **3** | Consumers: intake re-home (§3.1), IST link offer (§3.5), `equipment_attachments` strangler **including the `active = true` flip on the three dormant categories** (§3.3), revision sheet-mapping. | An intake runs end-to-end from a pool document; a submittal written from the Equipment tab lands in the pool and the union read shows both eras; the three categories are selectable **only after** the flip, asserted across the boundary. **The prerequisite leg is now two claims, not one:** *refusing the offer leaves it just as satisfied* — and its sibling, **deleting the linked document leaves it just as satisfied** (§10.5 Finding 1). The second is the one that fails today: it must delete cleanly, leave the prerequisite `yes`, and leave `evidence_reference` naming the document. |
| **4** | Portal visibility + the spec carve-at-the-door. | `client_visible` tested twice independently, asserted by error code at both walls; **a category-default change moves no existing document's flag** (§3.6, Q5) — asserted by re-reading the rows, not by trusting the write path; a superseded document is invisible to the portal; a 400 MB spec is carved to ~25 MB **and the bulk never reaches the bucket** — asserted by bucket byte count, not by inspection. **The carve measurement (§5.4, Q3) is taken here and its branch recorded**; if the automatic path fails on field hardware, the manual-carve branch ships and the gate stands unchanged, because the gate is about what reaches the bucket and not about who did the carving. |

Testing follows the standing rules: **prove the mechanism, never the silence**;
every suite runs against **ZZ-TEST only**; a suite that cannot find its fixture
**skips loudly by name**. Suggested batteries: `pw-documents.mjs` (pool CRUD,
supersede, RLS, storage usage), `pw-sheet-index.mjs` (classification against the
corpus, review confirmation, derivatives), extending `pw-intake.mjs`,
`pw-ist-evidence.mjs` and `pw-portal.mjs` rather than duplicating them.

**One premise to assert rather than assume** (the 2026-08-04 law): `byte_size` is
what the app *recorded* at upload. A storage-side orphan — upload succeeded, row
insert failed — is invisible to the usage readout, which would then report a number
that is confidently wrong. A reconcile sweep is out of scope for build 1; it is
named here so the readout is understood as *the app's claim about itself*, not as a
measurement of the bucket.

---

## 9. Sequencing recommendation

> **After the extraction arc completes (Phase 6), and after 3b. Not folded into an
> extraction phase.**

Four reasons, in order of weight:

1. **The arc would get a moving target.** Extraction Phase 5 ships a migration
   adding review columns to `intake_rows`. §3.1 re-homes `intake_uploads`. Landing
   the pool mid-arc means the upload side moves underneath a phase whose gate is a
   measured accuracy number — and a benchmark that moves for a schema reason is a
   benchmark that has stopped measuring the thing it was built to measure.
2. **The review idiom should be built once.** Phase 5 builds per-row questions,
   disagreement rendering, per-field provenance and confidence. The sheet-index
   review is the same muscle (§6). Building it first means building the idiom twice
   and, realistically, differently.
3. **Phase 6 is the capture surface.** 3f's harvest captures corrections. Sheet-kind
   corrections are the same class of signal and should feed the same capture rather
   than grow a parallel one three months later.
4. **3b before, not after.** Not because the pool needs a slot — it does not (§7) —
   but because 3b is where the action-router stops being a workaround. Doing it
   after means `api/intake.ts` picks up a fifth action first and 3b then has to
   unpick a bigger file.

**Against folding it into a later extraction phase**, which the brief invites me to
consider: the arc's phases are all gated on **accuracy against a benchmark, with
cost-per-sheet reported at every boundary**. The pool's gates are storage,
permissions and revision semantics. A phase whose gate is two unrelated claims is a
phase that can pass while half of it is broken, and it would blur the cost number
the arc exists to keep honest.

**One piece could reasonably move earlier** if the owner wants value sooner: build
**1** alone (upload, categorise, supersede, download — no index, no consumers) is
independent of everything the arc touches and would give the firm somewhere to put
a specification today. It is a real option; it is not my recommendation, because a
pool with no index is a folder, and a folder is what ShareSync already is.

> **RULED 2026-08-12 (Q7): §9 stands as written. The Build-1-early option is
> DECLINED**, on the proposal's own closing reason — a pool with no index is a
> folder, and the firm has one. Build order is 1 → 2 → 3 → 4, entered after
> extraction Phase 6 and after 3b, not folded into an extraction phase.

---

## 10. The eight questions — recommendations, and the rulings

**All eight ruled 2026-08-12.** Each question keeps its original recommendation and
reason as written; the ruling is appended. Two were amended, one was narrowed, five
were ratified as proposed.

**Q1 · Does `equipment_attachments` fold into the pool?**
→ **Yes eventually; strangler now, migration never-or-later.** Ship the pool with
`equipment_id` on its rows, switch the Equipment tab's *write* path to the pool on
day one, read a union with legacy rows read-only. *Reason:* two write paths for one
concept is the failure mode, and it opens the moment the pool ships. A strangler
closes it with no data migration; the backfill then stands on its own merits
instead of being forced.

> **RULED — strangler, WITH AMENDMENT.** The recommendation was internally
> inconsistent: *"on the day the pool ships"* here against a Build 3 strangler in
> §8, which leaves the split open across Builds 1–2. **Amendment:** seed
> `shop_drawing` · `submittal` · `om_manual` **`active = false` in Build 1**, flip
> them active in the strangler commit in **Build 3**. Category rows exist from day
> one; the picker does not offer them until there is exactly one write path.
> Backfill remains never-or-later. Folded into §2.3, §3.3 and the §8 Build 1 / Build
> 3 gate rows.

**Q2 · Is `sheet_kind` a CHECK or an admin table?**
→ **CHECK.** *Reason:* it is the classifier's alphabet, and extraction Phase 1's law
requires a strict enumerated output schema that fails at the boundary. An
enumeration assembled from a user-editable table at prompt-build time cannot be
reasoned about, and a user who adds a kind gets a vocabulary the model was never
told about. Document *categories* stay admin data — they are firm policy, and
policy is exactly what §4.3 says must be editable.

> **RULED — CHECK, as proposed. And the general law is recorded, because this
> question will be asked again about the next vocabulary:**
>
> > **A vocabulary consumed by a model contract is CODE. A vocabulary consumed by
> > humans is POLICY.** Code ships in a constraint and changes in a commit; policy
> > ships in a table and changes in the admin UI.
>
> That is why `sheet_kind` and `document_categories` land on opposite sides of §4.3
> without §4.3 being weakened: they are not two instances of one kind of thing.

**Q3 · Where does the specification carve happen?**
→ **Client-side, before upload.** The finder proposes division boundaries from the
spec's own table of contents; the user confirms the range; only the carve is
uploaded. *Reason:* uploading 400 MB to keep 25 MB spends the egress and the
storage anyway, and makes the discard a *deletion* — a thing that can fail, be
forgotten, or be half-done. Carved at the door it is a never-was. The cost is that
a browser has to page-extract a 400 MB PDF, which needs measuring on a real spec
before the gate is set.

> **RULED — client-side carve, conditional on the measurement, with the failure
> branch decided now:** if page-extracting a 400 MB PDF fails on representative
> field hardware, the fallback is **manual carve by the user before upload** — the
> app names the divisions it needs and accepts only the carved file.
> **Whole-upload-then-delete is not available in either branch.** Server-side
> carving stays off the table (function slot + `maxDuration`). Folded into §5.4 and
> the §8 Build 4 gate.

**Q4 · What happens to a superseded set's derivatives?**
→ **Drop the derivatives once the successor's index is confirmed; keep the set PDF
forever.** *Reason:* the derivatives are a cache, the set is the record. Rule 4 is
about the record. This roughly halves the long-tail storage without deleting one
byte of evidence — and a superseded sheet that someone does open can be re-split on
demand from the set that is still there.

> **RULED — drop the derivatives, keep the set. The re-split-on-demand clause is
> struck.** A user opening a superseded sheet pays **one full-set download**; a rare
> path at an accepted price. *Reason:* the split then lives in exactly one place —
> index confirmation. A second split path that runs almost never is a path that is
> almost never right, and it would be discovered wrong by the one person a year who
> needs it. Folded into §2.5(3).

**Q5 · Portal visibility default.**
→ **`false` for everything, set per document at upload, with a category-level
default an admin can change.** *Reason:* the portal's entire design is
whitelist-not-blacklist — a separate membership table, column whitelists, filters in
SQL. A document class that defaults visible is the one that leaks, and the leak is
discovered by a client rather than by us.

> **RULED — as proposed, with one precision: a category-default change applies at
> UPLOAD TIME ONLY and never retroactively.** Existing documents' flags never move
> when a category default changes. *Reason:* a retroactive default would let one
> admin toggle publish a project's back-catalogue with no upload event and nobody in
> the room. Folded into §3.6, with its assertion in the §8 Build 4 gate.

**Q6 · Does the pool hold pointer-only rows for out-of-scope documents (a
ShareSync path with no file)?**
→ **No.** *Reason:* §4.4 already provides free-text references, and a pointer with
no file **is** a register row — `documentation_register` is that table and already
models it. Admitting pointer rows would make *"is it in the pool"* stop meaning
*"can a feature read it,"* and that equivalence is the pool's only definition.
Losing it turns the pool back into a folder.

> **RULED — no pointer rows, ratified as written. And this is now THE STANDING
> ANSWER to any future "add a ShareSync link field to the pool" request**, which
> will arrive, and will arrive sounding reasonable and small. It is refused for the
> reason above and not re-litigated: the pool's only definition is *a document a
> feature can read*, and a row with no file cannot be read. Where a pointer is what
> is wanted, `documentation_register` and §4.4's free-text reference are the two
> mechanisms that already exist for it.

**Q7 · Sequencing.**
→ **After extraction Phase 6, after 3b, not folded in.** Reasons in §9. This is the
one I would most like ruled explicitly, because the intake re-homing (§3.1) is a
real collision and the arc is in flight right now.

> **RULED — after extraction Phase 6, after 3b, not folded into an extraction
> phase.** The Build-1-early option is **declined**, on the proposal's own closing
> reason: a pool with no index is a folder. §9 stands as written.

**Q8 · Who can do what, and under which named helpers?**
→ Three new helpers, because these are three questions and the 2026-08-10 law says
a predicate that answers more than one question is not one policy:

| helper | who | governs |
|---|---|---|
| `canUploadProjectDocument` | any project member | adding a document to the pool |
| `canCurateDocumentPool` | owner / lead / admin | category, discipline, issuance, supersede, delete |
| `canSetDocumentClientVisibility` | owner / lead / admin | the portal flag |

*Reason:* the third answers the same as the second **today**, and gets its own name
anyway — client visibility is the one that will be widened or narrowed on its own
someday, and a widening that has to find itself inside a shared predicate is the
eleven-copies problem being recreated on purpose. And the helpers draw controls;
the RLS in §2.4 decides whether writes land. Both move in one commit.

> **RULED — three named helpers, as proposed. Helpers draw controls; RLS decides
> writes; both move in one commit**, because a widened button over an unchanged
> policy is a silent no-op, which is worse than a hidden button.

---

## 10.5 Review findings (2026-08-12 ruling pass)

Two findings from the review of this document. Both are folded into their sections
above; they are collected here so the ruling pass leaves a record of what it caught
and not only of what it decided.

### Finding 1 — DEFECT. `ON DELETE SET NULL` collides with the widened CHECK

**Applies at Build 3. Fix specified; folded into §3.5 and the §8 Build 3 gate.**

§3.5 gives `ist_prerequisites.pool_document_id` an `ON DELETE SET NULL` and, in the
same breath, rewrites `ist_prerequisites_yes_needs_evidence` to accept that column
as a **sole** satisfier of `yes`. The two cannot both hold. Deleting a pool document
that solely satisfies a `yes` prerequisite fires the `SET NULL` update, which fails
the CHECK, which fails the delete.

**Three things are wrong with that, in increasing order of seriousness:**

1. It is `RESTRICT` behaviour arrived at by **accident** — the schema chose
   `SET NULL` deliberately and got the opposite.
2. The refusal surfaces **two tables away from the action**: a constraint violation
   on `ist_prerequisites` while the user is deleting a row in `project_documents`.
   That is the class of error `src/lib/plainError.ts` exists to translate, and it is
   better not to generate it.
3. It makes the pool **un-prunable** — the exact outcome the `SET NULL` reasoning
   was aimed at avoiding.

**The fix is in the upgrade flow, not the schema.** The FK stays `SET NULL`; the
CHECK stays as written. What changes is that the free-text satisfier always
survives: **accepting a link never clears `evidence_reference`**, and **a link
created where there was no prior free text auto-populates `evidence_reference` with
the document's title at link time.** `pool_document_id` is then never a sole
satisfier in practice.

**Why not fix it in the schema.** The two schema-side options are both worse. A
CHECK that refuses to count `pool_document_id` makes the link decorative — it would
satisfy nothing, and a link that satisfies nothing is not the upgrade §4.4
promised. `ON DELETE RESTRICT` makes the collision deliberate instead of accidental,
which is honest but leaves the pool un-prunable and the refusal still two tables
away.

**And the flow-side fix is the more faithful reading of §4.4 anyway.** *A claim must
NAME its evidence.* The name is the free text. The link is an **addition** to the
claim, never a replacement for it — which is what a link should always have been.

**Gate:** *"refusing the offer leaves it just as satisfied"* gains its sibling —
**"deleting the linked document leaves it just as satisfied."** The delete must
succeed, the prerequisite must remain `yes`, and `evidence_reference` must still
name the document.

### Finding 2 — GATE HARDENING. The regression must be an assertion, not a habit

**Applies at Build 2. Folded into §6 and the §8 Build 2 gate.**

§6 requires that the widened classifier leave the existing `schedule` verdicts
unchanged — Workman 3, Clairlea 4, West Humber 2 — while the new kinds are measured
fresh. As written that is a **review-time habit**: a number a person is trusted to
check when they happen to look.

*A rule enforced by memory is enforced by nothing*, and this rule is enforced at
exactly the moment nobody is looking. A prompt change that moves a schedule verdict
does not arrive announcing itself; it arrives inside a commit that is legitimately
improving plan or detail detection, and the schedule regression rides along as a
rounding error in a table of numbers that all moved.

**It is therefore a named assertion in `pw-sheet-index.mjs`, failing by name and per
fixture** — so a regression reports *"Clairlea: schedule verdicts 3, expected 4"*
rather than passing quietly inside an otherwise-improved run.

---

## 11. What this proposal will not do

- **It will not move the firm's document store.** §4.4 stands. The pool is the
  working set; ShareSync is the archive. Architectural sets, structural sets,
  contracts, coordination models and full-set reference dumps are out, by the
  brief's ruling and by §4.4's reasoning — a control expensive to satisfy honestly
  gets satisfied dishonestly.
- **It will not require a link where a reference already serves.** Every
  free-text evidence reference in the system stays valid forever. The pool adds an
  offer and never a requirement.
- **It will not delete a superseded document.** Rule 4. Supersede is a new row
  pointing at the old one; the only thing ever dropped is a derivative cache (Q4).
- **It will not assert a sheet index.** Every classification is a proposal until a
  human confirms it, and an unreadable sheet is reported **as unreadable** rather
  than typed `other` and forgotten.
- **It will not resolve a reference to the newest revision behind the user's back.**
  A finding pinned to a superseded sheet keeps pointing there and says so. Quietly
  re-pointing is rule 12.
- **It will not build 3h, 3j, 3l or 5.** It builds the thing all four assume, and
  stops.
