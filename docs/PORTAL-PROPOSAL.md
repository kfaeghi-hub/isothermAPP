# PORTAL-PROPOSAL.md — External Project Portal

**Status: PROPOSED 2026-07-25 — Part A (security) awaiting verdicts; Part B (design)
follows in this document. NO CODE WRITTEN.**

- Proposed by: Claude Code session. Inventory taken from **live `pg_policies`**, a
  **live access probe against ZZ-TEST** (§1.1), and the api/ source.
- Scope: the first surface exposed to users outside the firm. Read-only.
- Companion records: `ACCESS-CONTROL-PROPOSAL.md` (the model this extends),
  `OWNER-TIER-PROPOSAL.md`, `STORAGE-PRIVACY-PROPOSAL.md` (signed URLs),
  MASTER-BRIEF §10 (the reframe) + §12, Build Spec §3.3 / §6B.
- **Numbering correction:** the brief refers to "the Build Spec's §7 access section".
  §7 is *Reminders & notifications*; access control is **§3.3**. Entity model is §3.1–3.2.

---

# PART A — SECURITY MODEL

## 1. The premise that does not hold

### 1.1 Live probe result (this is the whole design constraint)

The brief and both recorded docs state the portal is "`client` role + a
`project_members` row" and that "the existing membership machinery extends
unchanged", resting on Build Spec §3.3: *"Client … appears in ZERO policies."*

**That sentence is true by name and false in effect.** Almost every policy keys on
`is_project_member(pid)`, whose body is:

```sql
select exists (select 1 from project_members
               where project_id = pid and profile_id = auth.uid())
```

**No role condition.** The moment an invite inserts that row, the external account
satisfies every membership policy in the schema — no new policy required.

Probed live (granted dev.client a `project_members` row on ZZ-TEST, measured, revoked):

| As `client` + membership row | Result |
|---|---|
| `projects` | 1 row *(intended)* |
| `findings` | **20 rows, all columns** (not register columns) |
| `site_reports` | **all statuses** — no issued filter |
| `checklist_instances` | **239 rows** |
| `equipment` | **266 rows** |
| **`findings` INSERT** | **ACCEPTED — the client account created a finding** |
| `finding_diary_entries`, `meetings`, `project_deliverables`, `cx_cell_values` | 0 rows — **but ZZ-TEST holds 0 of each at rest** (verified). Same role-free predicates (`is_member_via_finding`, `is_member_via_meeting`); they leak identically with data present. **Not reported as safe.** |

Note the policy pattern is `ALL`, not `SELECT` — hence the accepted INSERT. A
"read-only portal" built on the recorded model would ship a **read-write external
account**.

### 1.2 The same hole server-side

`api/_shared/auth-common.ts:83-98` — after the admin/dev shortcut there is **no role
condition**, just a `project_members` lookup. The brief says to *verify it currently
doesn't admit clients and extend it*; it **already admits them**, and applies no
issued/draft filter. It needs **restricting**, not extending. *(Code-verified;
the live confirmation run is owed — tooling outage mid-session.)*

### 1.3 Two ways to close it — DECISION 9.1

**Option A — make membership mean *staff* membership.** Redefine
`is_project_member` (+ `is_member_via_finding` / `_instance` / `_meeting` /
`_stage_group`) as `is_staff() AND exists(...)`. Every existing policy becomes
internal-only in one migration; client access exists only where written.
*Pro:* one membership table, matching the recorded model.
*Con:* changes the meaning of ~40 policies at once; the change is invisible at each
call site; a mistake is either internal breakage or external over-exposure.

**Option B — a separate `portal_members` table (RECOMMENDED).** External membership
is a different concept (read-only audience, invited, revocable) and gets its own
table. `project_members` never contains a client row.
*Pro:* **zero blast radius** — not one existing policy, predicate, or endpoint
changes meaning. Build Spec §3.3's "Client appears in ZERO policies" stays
**literally true and auditable**. Portal-specific columns (`invited_by`,
`accepted_at`, future `company_id` for per-company filtering) live where they belong.
*Con:* two membership tables; the Access card unions them for display; it **contradicts
the recorded "membership machinery extends unchanged"** — MASTER-BRIEF §10 and Build
Spec §6B need a correction line if this is chosen.

**Recommendation: B.** For the highest-stakes boundary in the system, the option that
changes nothing about the working internal model is worth a second table. A is
defensible but its correctness rests on one predicate edit rippling correctly through
forty policies.

### 1.4 How the portal READS — no client table policies at all

Independently of 9.1: the portal does **not** read tables directly. Every portal
surface is a **`SECURITY DEFINER` RPC** that (a) verifies portal membership for the
requested project internally, (b) returns only whitelisted columns, (c) applies the
issued-only filter in SQL.

Why this and not client SELECT policies: **RLS cannot filter columns.** A client
`SELECT` policy on `findings` would let a caller request `identified_by` — an internal
staffer's name — or any future column, straight through PostgREST. A DEFINER RPC
makes the column list, the status filter, and the row scope one auditable function per
surface, and keeps `client` out of `pg_policies` entirely.

| RPC | Returns | Filters inside |
|---|---|---|
| `portal_projects()` | id, name, client name, phase, status | caller's portal memberships only |
| `portal_findings(pid)` | number, date_raised, date_closed, building_area, category, title, description, corrective_action, status, responsible company name | portal member of pid; **no `identified_by`, no `origin`, no `id`-joins to internal tables** |
| `portal_finding_photos(pid)` | photo id + storage path, per finding | portal member; feeds signed-URL minting |
| `portal_documents(pid)` | issued site reports + issued meeting minutes: title, number, date, kind, row id | **issued only** (§2.2) |
| `portal_stats(pid)` | checklist % complete, findings open/closed counts, phase | aggregates only — never rows |
| `portal_team(pid)` | company name, role abbreviation, contact name | team matrix display only |

## 2. Two schema facts the visibility rule depends on

### 2.1 `list_internal_profiles()` excludes client rows
The Access card's picker is fed by an RPC that deliberately returns internal profiles
only. **The invite UI cannot reuse it** — it invites by typed email, and the portal
member list is rendered from `portal_members`, not that picker. Recorded so the build
doesn't discover it late.

### 2.2 `site_reports` has no `issued_at` — but it does have an issued test
MASTER-BRIEF §12 records `site_reports.issued_at` as a future addition, so "issued site
reports only" appears to have no column to key on. It does have the established one:
**`storage_url IS NOT NULL`** — already the definition of "issued" in the live
`sr_delete` policy (a member may delete their own report only while
`storage_url IS NULL`). `meetings` has a real `status = 'issued'`.

Proposal: portal document visibility =
`site_reports.storage_url IS NOT NULL` · `meetings.status = 'issued'`, with the §12
`issued_at` addition left scheduled (it improves display, not enforcement).
**DECISION 9.2** if you'd rather add `issued_at` first.

## 3. Policy / access inventory — current → proposed

Under **Option B**, the "proposed" column of every existing table is **UNCHANGED** —
that is the point of the recommendation. The portal adds one table and a set of RPCs.

### 3.1 Existing project-scoped tables — ALL UNCHANGED (Option B)
`projects · findings · finding_diary_entries · finding_photos · site_reports ·
meetings · meeting_* · checklist_* · equipment · equipment_attachments · cx_* ·
project_deliverables · project_distribution · project_team_assignments ·
project_phases · project_trades · project_classifications · documentation_register ·
file_attachments` — no policy changes. Clients never hold a `project_members` row, so
no membership predicate can match them.

*(Under Option A, every one of these rows would instead read "predicate narrowed to
`is_staff() AND member`" and require battery proof of no internal regression.)*

### 3.2 New table — `portal_members`

| | |
|---|---|
| Columns | `id` · `project_id` FK CASCADE · `profile_id` FK CASCADE · `invited_by` · `invited_at` · `accepted_at` · `company_id` *(nullable — the hook for future per-company filtering)* · **`org_id uuid` nullable, defaulted, indexed (rule 17)** · UNIQUE(project_id, profile_id) |
| SELECT | own rows (`profile_id = auth.uid()`) OR `is_admin_or_dev()` OR `owner_member(project_id)` |
| INSERT / UPDATE / DELETE | `is_admin_or_dev()` OR `owner_member(project_id)` OR `is_project_lead(project_id)` — owners **and leads** invite/revoke (a lead runs the project's external roster, consistent with the deliverables-assign ruling) |
| Self-exclusion | mirrors `members_update`: `profile_id <> auth.uid()` — nobody edits their own portal membership |

### 3.3 New table — `portal_invites`

| | |
|---|---|
| Columns | `id` · `project_id` FK · `email` (citext) · `token_hash` (**hash only — never the raw token**) · `role_hint` · `invited_by` · `created_at` · `expires_at` (default now()+7d) · `redeemed_at` · `revoked_at` · **`org_id` (rule 17)** |
| SELECT / INSERT / UPDATE | `is_admin_or_dev()` OR `owner_member(project_id)` OR `is_project_lead(project_id)`. **No client policy. No anon policy.** |
| Redemption | never a direct table write from the browser — only via the endpoint in §4 |

### 3.4 `storage.objects` — UNCHANGED
Buckets are private (§12 pass, closed 2026-07-24). Portal downloads mint signed URLs
service-side; no storage policy grants clients anything. The `is_staff()`-gated INSERT
policies already exclude clients from uploading.

### 3.5 `api/_shared/auth-common.ts` — CHANGED (both options)
`requireProjectAccess` gains an explicit **staff** requirement (defense in depth: even
if a client row ever reached `project_members`, endpoints refuse). A separate
`requirePortalAccess(service, userId, projectId)` serves portal endpoints: portal
membership + **issued-only** row check before signing. Existing generate-* endpoints
keep `requireProjectAccess` unchanged in meaning for staff.

## 4. Invite flow, `PORTAL_INVITES_LIVE`, and revocation

> **⚠ AMENDED 2026-07-26 — share links are now permitted, deliberately.**
> The "no raw tokenized share links" rule above was the right default and remains
> the default: **invite-with-account is still the primary mode**, and anyone who
> needs to be on the record gets an account.
>
> **What changed.** For a read-only external viewer — a GC PM who needs to read the
> issues register once before a site meeting — requiring account creation is
> friction that gets the portal not-used. A second, lighter mode is worth the
> tradeoff, provided the tradeoff is stated rather than glossed.
>
> **The tradeoff, stated:** a share link is attributable to the LINK, not to a
> person. Anyone holding the URL is that link. It can be forwarded, pasted into a
> group chat, or screenshotted, and we will not know who looked. That is the cost,
> and it is why share links are the secondary mode and not the default.
>
> **The guardrails, all mandatory and all shipped:**
> - **Individually revocable** (`revoked_at`), same pattern as invites. Revocation
>   is immediate and total.
> - **Server-enforced expiry**, evaluated inside `portal_link_project()` — the one
>   function that may ever evaluate it — never in the UI. Presets only
>   (`1d|1w|1m|1y|never`, default 1 month); the client cannot supply a timestamp,
>   or a crafted request would set year 9999 and bypass the Never confirmation.
> - **"Never" requires a distinct confirmation** and renders as a MARK, not a date,
>   in the access card, so it is visible on any later audit.
> - **Identical whitelists.** A link visitor reads through the same column lists as
>   an account because they are literally the same SQL — one inner function in
>   `portal_internal`, two named gates. Every NEVER exclusion holds identically: no
>   finding diaries, no drafts, no deliverables, no equipment, no Directory,
>   nothing cross-project. `pw-portal` compares the two paths field-by-field.
> - **The team card is identical to account mode** (ruling D3). Team composition is
>   already part of the distributed record — minutes attendees, distribution lists
>   — so withholding it from a link would be a difference without a security
>   rationale, and forking the whitelist to achieve it is exactly the drift the
>   single-implementation design exists to prevent.
> - **No write path exists**, asserted rather than assumed: anon PostgREST insert
>   denied, anon RPC 42501, generate-* refusing a link token, and no Supabase
>   client on the link page at all.
> - **Link creation sends nothing.** It is inherently copy-paste, so the mail
>   posture is untouched and link mode can go live with no mailer at all.



**Mechanism — DECISION 9.3.** Recommend a **custom token table + endpoint** over the
Supabase admin invite API:
- revocation before redemption is a row update we own (`revoked_at`); the admin invite
  API has no first-class revoke;
- the service key never leaves the server (`api/portal-invite`, `api/portal-redeem`);
- **it works with delivery switched off** — the whole point of the flag. The admin API
  sends mail as a side effect of creating the invite; a custom token cannot leak mail
  by construction.

**Lifecycle.** owner/lead invites by email from the project's Access card → server
generates a 32-byte token, stores **only its SHA-256 hash** + 7-day expiry →
`PORTAL_INVITES_LIVE=false` (the entire build) so **nothing is sent**; the UI shows
the link for copy-paste → recipient opens `/portal/accept?token=…` → server verifies
hash/expiry/not-revoked/not-redeemed → creates the auth user (or links an existing
one), sets `client` role, inserts `portal_members`, stamps `redeemed_at` → lands in
the portal.

**Email safety is structural, not procedural:**
- `PORTAL_INVITES_LIVE` is read **only** inside the send path. Token creation, storage,
  revocation, redemption never consult it — so the flow is fully testable with delivery
  impossible.
- "Copy invite link" is a **permanent** first-class action beside "Send email", not a
  dev affordance.
- `pw-portal` asserts **zero mail attempts** (the send path increments a counter /
  logs a marker the suite reads; with the flag false it must be zero).
- Go-live is a recorded checklist item — flip the flag, send exactly one invite to
  Tony's personal address — **not performed in this build**.
- The directory's 261 real contacts are never enumerable by the invite UI: it takes a
  **typed email**, and `list_internal_profiles()` (which excludes clients anyway) is
  not wired to it.

**Revocation — the full story.** Before redemption: `revoked_at` set → the token fails
verification. After redemption: delete the `portal_members` row → every RPC stops
returning that project, and signed-URL minting refuses (membership checked per call).
Signed URLs already minted stay valid until expiry (10 min docs / 60 min photos) —
**stated, not hidden**; an immediate cutoff would need bucket-key rotation, which is
out of scope. Whole-account: admin deactivates the auth user. Multi-project externals
lose one project at a time; the last removal leaves an account that can log in and see
an empty portal (an explicit "no projects" state, not an error).

## 5. Route separation

- **Client role gets `/portal/...` only.** Any internal path → redirect to `/portal`.
  Today `client` at `/` redirects to `/projects` and, per the verified baseline, sees
  the full internal shell with empty data — **that ends**: no sidebar, no internal
  nav, no internal chrome.
- **Internal roles may open `/portal/...`** — plus an explicit **"View as client"**
  preview from the project (owner/lead), so you see exactly what an invitee sees
  before inviting one. Preview renders the portal with the *viewer's* identity and a
  standing banner; it never mints a client session.
- Route guard is UX; **the RPCs are the enforcement.**

## 6. Consequences surfaced by this proposal

1. **The recorded model changes if 9.1 = B.** MASTER-BRIEF §10 and Build Spec §6B both
   say `project_members`; they get a correction line, not a silent rewrite.
2. **`finding_photos` was in neither the in- nor out-scope list** of the recorded
   reframe — your brief now resolves it (**in**, as part of the distributed record).
   Recorded here so the doc gap closes.
3. **Break-glass vs test-admin split** (§12) is gated on "before real client data
   lands". External accounts are arguably that trigger — flagged, not bundled.
4. **`identified_by` is deliberately excluded** from the external register: it names an
   internal staffer. The brief's column list doesn't include it; stating it so the
   omission is a decision, not an oversight.
5. **Progress stats can't come from `dashboard_checklist_coverage`** — it's
   `security_invoker`, so it returns nothing to a client. Hence `portal_stats()`.

## 7. Test plan — `pw-portal.mjs` (API layer, as dev.client)

Setup is **gated**: the suite creates dev.client's `portal_members` row on **ZZ-TEST
only** and removes it at the end. It never touches a real project. Every negative leg
is paired with the positive that proves the mechanism works — no vacuous passes.

**Positive:** issued report read → 200 · issued minutes → 200 · register RPC returns
rows with **exactly** the whitelisted columns · signed-URL fetch of an issued document
→ 200 · progress stats return numbers.
**Negative:** draft report → zero rows · diary RPC → does not exist / zero rows ·
`finding_diary_entries` direct query → zero rows · another project → zero rows · any
write (findings INSERT, report UPDATE) → rejected · signed-URL request for a **draft**
→ 403 · direct `findings` table query → zero rows (proves §1.4: no client policy) ·
internal route → redirected.
**Invite:** creates and redeems its **own throwaway invite for a ZZ-TEST address** —
never dev.client's account, never a directory contact · revoked token → rejected ·
expired token → rejected · **mail attempts asserted == 0**.
**Regression:** full battery green — the internal model must be provably untouched
(under Option B this is the strongest claim available: nothing internal changed).

## 8. NOT building (§9A right-sizing)

Per-company filtering (recorded as the future option; `portal_members.company_id`
exists as the hook) · portal comment/reply threads · client-side uploads · any write
path whatsoever · notifications/digests · SSO · custom domains per client · portal
audit-log UI (server logs only) · cross-project "my projects across firms" rollups ·
`issued_at` backfill · deliverables/Cx-Index/equipment exposure in any form.

## 9. DECISIONS REQUIRED (approve each explicitly before build)

| # | Decision | Options |
|---|---|---|
| 9.1 | **Membership shape** — the load-bearing one | (a) **`portal_members` separate table (recommended)** — zero blast radius, "client in zero policies" stays literally true · (b) narrow `is_project_member` to staff and reuse `project_members` — one table, ~40 policies change meaning |
| 9.2 | **"Issued" test for site reports** | (a) **`storage_url IS NOT NULL` (recommended)** — the existing convention, already in `sr_delete` · (b) add `site_reports.issued_at` first and key on it |
| 9.3 | **Invite mechanism** | (a) **custom token table + endpoints (recommended)** — revocable, no client-side service key, works with delivery off · (b) Supabase admin invite API |
| 9.4 | **Who may invite/revoke** | (a) **owner + lead (recommended)** — consistent with lead-assigns-deliverables · (b) owner/admin only |
| 9.5 | **Portal reads via DEFINER RPCs (§1.4)** | (a) **confirm (recommended)** — the only way to filter columns · (b) client SELECT policies instead (exposes all columns of any table granted) |
| 9.6 | **Signed URLs outlive revocation** by up to 10 min (docs) / 60 min (photos) | (a) **accept and document (recommended)** · (b) shorten portal expiry to 2 min |

---

# PART B — DESIGN CONCEPT

**The bar: better-looking than our own dashboard.** GC PMs, TDSB and Seneca judge the
firm by this surface. It lives in the **landing page's world** — the dark cover of the
firm's standard — not the internal tool's paper world.

## 10. Which world, precisely

The codebase has two established visual worlds. The portal is the **third surface of
the cover world** (login and landing being the first two), not a re-skin of the app.

| | Landing (cover) | Internal app (paper) | **Portal (proposed)** |
|---|---|---|---|
| Ground | `slate-950/900` → cover purple | paper `#fbfaf8` + white panels | **cover purple ground, paper "record" panels** |
| Radii | `rounded-sm` (2px) | `rounded-xl` cards | **2px — print-sharp** |
| Elevation | none | `.card-tile` lift + shadows | **none on cover; hairline rules only** |
| Motion | GSAP/Lenis, 1–2.4s, scrub/pin | CSS `.rise` 420ms, 120–150ms transitions | **GSAP for two moments; CSS elsewhere** |
| CTA | `bg-white text-slate-900` inverse | `bg-standard-600` | **inverse white on cover** |

The register table itself sits on **paper** inside the cover frame — a document laid on
the cover. That contrast *is* the concept: the portal is the firm's standard, opened to
one project.

## 11. Anatomy

1. **Project hero** — cover ground, contour texture, project name in `.font-display`
   at display scale, client + phase as mono eyebrow, and the **progress instrument**:
   checklist completion + findings open/closed as one calm figure group. Stat counters
   animate once on entry (`tabular-nums`, no layout shift). Mono clause numbering
   (`01 Progress · 02 Issues · 03 Documents · 04 Team`) carries the landing's grammar.
2. **Issues register** — the surface that makes emailed spreadsheets look ancient.
   Paper panel, ruled rows, status chips in the existing semantic colors, filter by
   status/system, photo thumbnails opening a lightbox. **Below `lg` it becomes stacked
   cards** (RC3 pattern, already proven in this codebase) — never a horizontal-scroll
   table on a phone.
3. **Documents library** — issued reports and minutes as clean cards: number, date,
   kind chip, one obvious download action per row (signed URL minted on click).
4. **Team card** — company · role abbreviation · name, from the matrix. Display only.
5. **Designed empty states** — "No issues recorded yet", "No issued documents yet",
   each with the contour watermark and a calm line of copy. Not defaults.
6. **Project switcher** — only rendered when the account holds ≥2 portal memberships
   (per the multi-project requirement); a single-project invitee never sees chrome
   they don't need.

## 12. Motion budget — DECISION 9.7

The landing's dependencies are ~182 KB gz, justified there by a ruling that
"performance is explicitly not a constraint on this page". **The portal has the
opposite constraint: a GC PM on a phone in a site trailer.** Proposed split:

- **Three.js: NO.** `BuildingSection` is viewport-locked (`setSize(window.innerWidth,
  window.innerHeight)`, opaque `#100e26` background, full-screen camera keyframes) and
  ~120 KB. It cannot become a header band without a rewrite, and shouldn't.
- **Lenis: NO (recommended).** Smooth-scroll hijacking is the single most likely thing
  to feel broken on a low-end Android on site data. Native scroll is the right call for
  a working document.
- **GSAP + ScrollTrigger: YES, for exactly two moments** — the hero progress reveal and
  the stat counters. Everything else uses the app's existing CSS motion (`.rise`,
  150ms transitions).
- **Contour texture: `CssContour` / `.contour-mark`** — pure SVG, zero JS, already
  `aria-hidden` + `pointer-events-none`, `preserveAspectRatio="slice"` crops correctly
  into a short header band.

Inherited wholesale: the **parameter-ref pattern** (GSAP tweens a plain object ref;
the renderer reads it per frame; React never re-renders) — the most reusable idea in
the landing code, and it applies to the progress instrument.

## 13. Fallbacks — the landing standard, inherited verbatim

Three independent gates, matching `LandingPage.tsx` / `BuildingSection.tsx`:

1. **`prefers-reduced-motion` → decided once at mount**, two first-class paths, no
   `change` listener (never re-mount a pinned timeline mid-session). Reduced path:
   counters render final values immediately, no scroll-driven reveal, contour static.
2. **Any canvas/animation failure → the static composition**, try/caught. "A phone
   that shows something simple beats a phone that shows nothing."
3. **`(pointer: coarse)` → reduce, never drop.** Fewer animated elements, no hover
   affordances; the record itself is never withheld.

Plus the quality bars from the landing proposal: single H1, real section headings,
visible focus, all text in the DOM regardless of animation state, no layout shift,
responsive to 360 px, tap targets ≥44 px (MOBILE-AUDIT standard).

## 14. Containment — the landing precedent, followed exactly

- New tree only: `src/pages/portal/**` + `portal.css`. **No existing app component
  modified.** (`LANDING-PAGE-PROPOSAL` §4: "Shared-primitive changes needed: none
  identified; anything discovered mid-build gets flagged for the UI punch-list.")
- One `lazy()` import so the internal app pays zero bytes, and the portal pays nothing
  for the internal shell.
- **Escaping `Shell` is the one structural change.** `Shell` currently wraps *all*
  authenticated routes (`App.tsx:100-115`), which is exactly why a client sees the
  sidebar today. Proposed: an early return above the internal router —
  `if (isClient) return <PortalRouter/>` — making the role switch explicit at
  `App.tsx:96` rather than a redirect at `:105`. Internal roles reach `/portal/...`
  through a normal route + the "View as client" entry.
- `src/pages/portal/ui/` for portal-native primitives. `ui/Modal` and `ui/Combobox` are
  paper-world (white, `rounded-md`, `shadow-xl`, gray borders) and would read as foreign
  objects on cover; `ui/EmptyState` is a pure wrapper and is reusable with a variant
  swapping `contour-mark-ink` → `contour-mark`.
- **21st.dev MCP** used at build time for component *structure* only (table/card/
  lightbox/stat patterns), then fully re-tokened per the landing's mapping rule: their
  scales → `brand-*`/`vermilion-*`, their fonts → Archivo + Spline Sans Mono, their
  `rounded-2xl`/`shadow-xl` → our print-sharp radii and flat shadows. **Zero stray
  scales survive the port.**

## 15. Two design rulings needed

- **9.8 — token vocabulary.** The landing reaches the world through *remapped* stock
  scales (`bg-slate-900` = cover purple) and never uses `bg-cover`/`text-paper`. New
  code is supposed to prefer the semantic names. Recommend the portal use **semantic
  names** (`cover`, `paper`, `brand-*`, `vermilion-*`) — more correct, though it means
  the portal's class list won't literally match the landing's.
- **9.9 — the contour watermark rule.** `DESIGN.md` states the isotherm mark appears
  **ONLY** on the login cover and empty states, ≤8% opacity. The portal hero would be a
  third cover surface. Recommend extending the rule to "cover surfaces (login, landing,
  portal) + empty states" — flagged rather than silently violated.

## 16. The invite email — brand surface, rendered but never sent

Mocked in this build (it renders nothing until `PORTAL_INVITES_LIVE` flips): cover-purple
header with the logo lockup, one sentence of context (who invited them, which project),
one unmistakable button, the expiry stated in words, and a plain-text fallback. Reviewed
as an image like any other surface.

---

# ALSO IN SCOPE

## 17. (a) Navy → purple documents — the one-pager

**Decision:** do the generated documents adopt the purple/vermilion identity?
Recorded in three places as *activating with this phase* (MASTER-BRIEF §10 + §12, Build
Spec §6B + §12, ARCHITECTURE UI-debt item 7).

- **Why now:** an external user opens the purple portal and downloads a navy PDF in the
  same session. Today only the firm sees both identities; the portal makes the split
  client-visible.
- **Scope:** `api/_shared/doc-common.ts` letterhead + CSS constants, plus
  `generate-checklist.ts`'s private copies of the same constants. Contained — no
  document *structure* changes.
- **Rule 4 consequence — the honest part:** issued files stay exactly as issued. So a
  project mid-flight ends up with **navy documents already issued and purple ones
  issued after the switch**. That mixed set is permanent and visible to clients.
  Options: (i) accept the mixed era (recommended — rule 4 is not negotiable),
  (ii) delay the switch to a project boundary so any one project is single-era.
- **Test consequence:** ~~`pw-report-regen` compares regenerated output byte-for-byte
  against a stored baseline. The switch **intentionally** changes output, so it needs a
  deliberate baseline reset recorded as such — not a silent re-baseline.~~
  > **⚠ CORRECTED 2026-07-26. The struck text is wrong and was never checked.**
  > `pw-report-regen` does **not** compare bytes. It extracts `word/document.xml`,
  > strips every tag (`.replace(/<[^>]+>/g, ' ')`) and compares **visible text**.
  > Colours live in style attributes — inside tags — so a colour-only change is
  > invisible to it. **No baseline reset was needed and none was performed.**
  > The flip side is the part that matters going forward: that gate would not have
  > caught a colour *mistake* either. Nothing automated does. The palette is
  > therefore proven visually, and `DOC` in `doc-common` carries that warning.
- **Recommendation:** converge to purple, accept the mixed era, ~~reset the regen
  baseline in the same commit,~~ record the date in §12.
  > **RULED 2026-07-26: converge (Option A).** Shipped in `cf83ed1` with the
  > palette consolidation folded in. Full record:
  > `docs/DOCUMENT-IDENTITY-DECISION.md`.

## 18. (b) Abuse posture — authenticated but untrusted

Assume a portal account is hostile and knows its own JWT.

- **Every reachable path is read-or-sign.** The portal RPCs are `SECURITY DEFINER` and
  contain no write statements. There is no portal write endpoint of any kind.
- **`generate-*` must refuse clients outright.** Regeneration is a write (it overwrites
  storage objects and stamps DB rows). With `requireProjectAccess` gaining an explicit
  staff requirement (§3.5), clients are refused there by construction — and `pw-portal`
  asserts it.
- **No enumeration surface.** RPCs take a `project_id` and verify membership before
  returning anything; a non-member id returns empty, not an error that distinguishes
  "exists" from "not yours". Invite tokens are compared by **hash**; an invalid,
  expired, revoked and already-redeemed token all fail identically.
- **Signed URLs are row-anchored** (existing design): a caller names a table row, never
  a path, so no path traversal or bucket enumeration is reachable.
- **Not built, flagged:** per-account rate limiting on the RPCs and on invite
  redemption. Vercel's platform limits are the current backstop; a real limiter belongs
  with the first real external traffic, not speculatively.

## 19. (c) Session / password posture for externals

- **Reset works, unchanged.** `/reset-password` is a pre-router bypass and entirely
  role-agnostic — client accounts use the same flow. Verified in `App.tsx:48-51`.
- **Internal user surfaces are unreachable:** `/users` is `isSuper` only,
  `/classifications` is `canConfig` only, and under the proposed route separation a
  client never reaches the internal tree at all.
- **⚠️ A second mail channel exists that the flag does NOT cover.** `PORTAL_INVITES_LIVE`
  guards *our* invite send path. **Supabase Auth's own mailer** (password reset, and the
  admin invite API) is a separate channel we don't gate. Two consequences:
  (i) it is a further argument for **9.3(a) custom tokens** — the admin invite API sends
  mail as a side effect of creating an invite, so it could deliver mail while our flag
  is false; (ii) while the flag is false no external account exists, so no external
  reset mail can be triggered — the exposure is structurally zero until go-live, and
  becomes real the moment it flips. Recorded so the go-live checklist owns it.
- **Session semantics** are stock Supabase for all roles; no separate portal session
  store, nothing to desynchronise.

---

## 20. Sequencing

Part A verdicts → policies/tables/invite flow/route separation built and gated
(`pw-portal` green at the API layer, full battery green) → Part B built on top,
iterated with render-and-look at 375/393/412/768/1440 like the landing rounds.

**Documentation lands with each gate, not after:** ARCHITECTURE gains the portal
security model as-built after Part A (policy set, invite/revocation lifecycle, flag
semantics, route separation, dev.client scope) and the portal design language after
Part B; Build Spec §3.1/§3.3 extend for the new tables and client membership semantics;
MASTER-BRIEF §4/§10 at close, with the go-live flag flip recorded as a pending
checklist item and the navy-vs-purple ruling dated.

*End of proposal. Build only after Part A verdicts (§9.1–9.6) and Part B rulings
(§9.7–9.9) land in a Tony message.*
