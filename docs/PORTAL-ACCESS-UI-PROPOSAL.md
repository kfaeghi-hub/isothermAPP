# Portal access UI + share-link mode — proposal (2026-07-26)

**Nothing built. No code until each decision below is ruled.**

Two things, one proposal. The first is closing a known gap: Part A shipped the
invite backend with no front door, so the only way to invite anyone today is to
POST to an endpoint by hand. The second is new and **amends the ruled Part A
security model**, so it gets the same table-level rigor Part A got.

---

## 0. The honest framing

Part A's brief said **"No raw share links ever — every view is an identity,
attributable and revocable."** Share-link mode contradicts that sentence. This
document does not pretend otherwise: §6 is a dated amendment, with the rationale
and the guardrails, not a quiet reversal.

The rationale is real: for a read-only external viewer — a GC PM who needs to
look at the issues register once before a site meeting — requiring account
creation is friction that will get the portal not-used. But the tradeoff must be
stated where the decision lives: **a share link is attributable to the LINK, not
to a person.** Anyone holding the URL is that link. That is the whole cost.

---

## 1. The Access-card layout

A **separate card**, beside the internal Access card, owner/lead-visible (9.4a).
Deliberately separate rather than a section inside the existing card: internal
membership and external access are different security boundaries
(`project_members` vs `portal_members`), and the whole point of Part A's schema
ruling was that they never mix. The UI should not blur what the schema separates.

```
┌─ CLIENT / EXTERNAL ACCESS ──────────────────────────── [ View as client ↗ ] ─┐
│                                                                              │
│  People with accounts                                        + Invite person │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Sarah Okonjo            sarah@birdconstruction.com                     [×]  │
│  invited by Tony Faeghi · accepted 2026-07-20                                │
│                                                                              │
│  m.tran@mjma.net                                       PENDING · 5d left [×] │
│  invited by Tony Faeghi · 2026-07-24 · [ Copy invite link ]                  │
│                                                                              │
│  View-only links                                             + Create link   │
│  ──────────────────────────────────────────────────────────────────────────  │
│  For Bird PM                                    1 month · expires 2026-08-26 │
│  created by Tony Faeghi · last opened 2h ago    [ Copy link ]           [×]  │
│                                                                              │
│  Trade coordination                                    NEVER EXPIRES         │
│  created by Peiman · never opened                [ Copy link ]          [×]  │
│                                                                              │
│  Nothing here is internal. Internal membership is the Access card above.     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Notes on the layout:

- **Two labelled groups, one card.** "People with accounts" and "View-only
  links" are different kinds of access and the difference is the security story;
  a merged list would hide it.
- **The pending invite sits in the people list**, not a third group — it is a
  person who will have an account, shown in the state they are in.
- **`View as client` folds in** as the card's header action, replacing the
  standalone tile added in Part B. One place for "who can see this and what do
  they see."
- **Remove/revoke both use the existing confirm pattern** (`confirmRemove` in
  AccessCard). Revocation copy differs by kind: removing a person is
  "Sarah loses access to this project immediately"; revoking a link is "Anyone
  holding this link loses access immediately."
- **`NEVER EXPIRES` is rendered as a mark, not a date** — it should be visually
  louder than an expiry date in the list, because it is the row you want to
  notice on a later audit.
- **Empty state**: "No external access yet. Invite someone to give them an
  account, or create a view-only link." Both actions inline.

**Create-link dialog:** label (optional, free text), expiry preset radio
(1 day · 1 week · **1 month** default · 1 year · Never). Choosing Never swaps
the confirm button to a second step: *"This link works forever until revoked —
anyone who has it can view this project's record."* On create, the raw token is
shown **once**, with Copy, exactly as the invite flow already does.

---

## 2. Invite-with-account — the existing flow, given its UI

No backend change. `api/portal-invite` already returns `{invite_url, expires_at,
mail_attempted, delivery_enabled}`; the card calls it and renders the result.

- **Copy invite link is always offered.** Mail is attempted only when
  `PORTAL_INVITES_LIVE` is true AND a transport is wired — the card reads
  `delivery_enabled`/`mail_attempted` from the response and says which happened,
  so the three states from PORTAL-GOLIVE §1 are visible in the UI rather than
  guessed.
- **Pending invites list** with revoke. Needs one small addition: a
  `portal-invite-revoke` endpoint (or a direct RLS'd UPDATE — staff already have
  `pi_update`, so the card can set `revoked_at` client-side; recommend the direct
  update, no new endpoint).
- The mail-safety posture is untouched: **this card cannot send anything the
  endpoint would not already send.**

---

## 3. Share-link mode — the mechanism (the part to get right)

### 3.1 The requirement that decides it

> *"reusing the exact same whitelists/filters as the DEFINER RPCs — favor
> whichever keeps the column whitelists in ONE place; duplicated whitelists will
> drift."*

Agreed, and I would go further: **the authorization predicate must also live in
one place**, for the same reason. If the API endpoint decides "this token is
valid for project X" and the database simply trusts it, then a bug in one
TypeScript file is a cross-project data leak with nothing behind it. Part A's
whole shape was "the DB is the enforcement, the route is defence in depth."

### 3.2 Options considered

| | Whitelists in one place? | Authorization in the DB? | Verdict |
|---|---|---|---|
| **(a) Endpoint validates, then re-implements the SELECTs in TS** | ✗ duplicated | ✗ | Reject — this is the drift the brief names |
| **(b) Exchange the token for a constrained Supabase session** | ✓ untouched | ✓ | Reject — see below |
| **(c) Add `link_token` as a parameter to the seven existing RPCs** | ✓ | ✓ | Workable; signature churn on ruled functions |
| **(d) Split each RPC into an ungated inner impl + two gated wrappers** | ✓ | ✓ | **Recommended** |

**Why not (b), session exchange.** It is genuinely tempting — the existing RPCs
would work untouched. But it means minting a real `auth.users` row per link (or
per visitor). That gives every anonymous viewer a pseudo-identity in the auth
system, sprawls the user table, drags in the Supabase Auth mailer we have
deliberately not wired, and makes revocation two-step (revoke the link *and* kill
the session). It also quietly re-introduces the thing Part A avoided: rows in
identity tables that do not correspond to a person.

**Why not (c).** It works, and it is the smaller diff. But `create or replace
function` cannot add a parameter — adding `link_token` creates an *overload*, so
`portal_findings(uuid)` and `portal_findings(uuid, text)` would coexist and
PostgREST would resolve between them by argument names. That is a live trap for
the next person. Dropping and recreating instead changes the signature of
functions that Part A ruled, tested and gated. Available as the fallback if (d)
is judged too much machinery.

### 3.3 Recommended — (d), one SELECT list, two named gates

For each of the seven read RPCs, split into:

```
portal_internal.findings_rows(pid uuid)      ← the ONLY place the column list exists
        ↑                          ↑
portal_findings(pid)        portal_link_findings(pid, tok)
  gate: portal_can_view(pid)   gate: portal_link_grants(pid, tok)
```

- **The inner function holds the whitelist and nothing else** — no gate, no
  auth. It lives in a dedicated schema, `portal_internal`, with
  `revoke all on schema portal_internal from public, anon, authenticated`. Schema
  isolation rather than function-level revokes, because a later mistaken
  `grant execute` still gets nowhere without schema `USAGE` — and we already
  learned this year that a `revoke ... from anon` alone is not a lock.
- **The account wrapper keeps its exact current signature and behaviour.** Its
  body becomes `select * from portal_internal.findings_rows(pid) where
  portal_can_view(pid)`. pw-portal's existing legs re-prove it.
- **The link path is ONE function, not seven wrappers:**
  `portal_link_bundle(tok text)` validates once and returns the whole record as
  a single JSON payload (project, stats, findings, photos, documents, team) by
  calling the same inner functions. One round trip for a link visitor, and one
  gate evaluation instead of seven.

**The single validation function** — the only place expiry and revocation are
ever evaluated:

```sql
create or replace function public.portal_link_project(tok text) returns uuid
  language sql stable security definer set search_path to 'public'
as $function$
  select project_id from portal_share_links
   where token_hash = encode(digest(tok, 'sha256'), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > now())   -- NULL = never
$function$;
```

`NULL means never` is a footgun — someone will eventually write
`expires_at < now()` and silently invalidate every never-expiring link, or worse
write `expires_at > now()` and silently *validate* nothing. Making this function
the only evaluator is the mitigation, and it should be commented as such.

**Server-side everything.** The endpoint (`api/portal-link`) takes the raw token,
passes it to the DB, and the DB re-derives the project. The endpoint never tells
the database which project to read. Expiry is enforced inside
`portal_link_project`, i.e. at validation, never in the UI.

### 3.4 Files under link mode

`api/get-file-url` gains a link branch. It accepts `{link_token, table, id, kind}`
with **no** Authorization header, resolves the project via
`portal_link_project`, checks the row belongs to that project, and then runs
**the existing `authorizeFile` refusals unchanged** — `equipment_attachments`
refused outright, `site_reports` refused when `storage_url IS NULL`, `meetings`
refused when `status <> 'issued'`. Same expiries (10 min docs / 60 min photos).

The issued-only test therefore still exists in exactly two places (the RPC and
the signing endpoint) and gains no third copy.

### 3.5 No write path — asserted, not assumed

In link mode the browser holds **no Supabase session at all**. Recommendation:
**link mode does not construct a Supabase client** — a new `src/lib/portalLink.ts`
talks only to `/api/portal-link` and `/api/get-file-url`. That is a structural
guarantee rather than a policy one.

Behind it, three independent walls already stand: anon has no policy on any
portal table; anon has no EXECUTE on any portal function (the `portal_rpc_grants`
migration); and `portal_link_bundle` is `stable`, so it cannot write even if
called. §7 asserts all three rather than trusting them.

### 3.6 Route and exposure

`/portal/link/:token`, matched **before** the auth gate like `/portal/accept`.

Two things a tokenized URL needs that an account route does not:

- **`<meta name="referrer" content="no-referrer">`** on this route, so the token
  never rides a Referer header off-site.
- **`noindex`** — a share link will eventually be pasted somewhere crawlable.
  Meta tag plus `X-Robots-Tag: noindex` on the endpoint response.

Neither is optional in my view; both are one line.

---

## 4. Schema delta — a separate table

**Recommend `portal_share_links`, not an extension of `portal_invites`.**

The argument is the one that already won at 9.1(a): an invite is a **single-use
secret that becomes an account** (`redeemed_at`, `email` NOT NULL, 7-day
default); a share link is a **standing credential used many times, forever if
asked** (no email, no redemption, nullable expiry). Putting a one-shot secret and
a long-lived credential in one table means every policy and every query must
remember which kind it is holding — and `email NOT NULL` alone forces a fake
value on every link row. Separate tables keep `portal_invites`' existing policies
meaning exactly what they mean today, which is the same zero-blast-radius
argument that produced `portal_members`.

```sql
create table public.portal_share_links (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  label          text,                                  -- "For Bird PM"
  token_hash     text not null unique,                  -- sha256, never the raw token
  expires_at     timestamptz,                           -- NULL = never (see 3.3)
  revoked_at     timestamptz,
  created_by     uuid references user_profiles(id),
  created_at     timestamptz not null default now(),
  last_viewed_at timestamptz,                           -- see D5
  view_count     integer not null default 0,
  org_id         uuid default '00000000-...0001'        -- rule 17, day one
);
```

RLS mirrors `portal_invites` exactly: `select/insert/update` for
`is_admin_or_dev() OR owner_member(project_id) OR is_project_lead(project_id)`;
**no client policy, no anon policy.** A link holder can never read the link table
— they reach data only through the DEFINER bundle.

**Expiry presets are computed server-side.** The endpoint accepts
`expires: '1d' | '1w' | '1m' | '1y' | 'never'` and derives the timestamp itself.
It must not accept a client-supplied `expires_at`, or a crafted request sets
year 9999 and the "Never requires confirmation" rule is bypassed silently.

---

## 5. Decisions required

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Token mechanism | (a) TS re-implementation · (b) session exchange · (c) parameter on existing RPCs · **(d) inner impl + two gates + link bundle** | **(d)** — one whitelist, one expiry evaluator, account signatures untouched |
| **D2** | Schema | extend `portal_invites` · **separate `portal_share_links`** | **Separate** — same argument as 9.1(a) |
| **D3** | Team card in link mode | identical to account mode · company-only, no contact names | **Identical** per your brief — but flagging it: the team card carries named contacts, and a link is held by whoever has the URL. Company-only is the tighter option if that reads wrong to you |
| **D4** | Referrer + noindex on the link route | yes · no | **Yes**, both |
| **D5** | View telemetry (`last_viewed_at`, `view_count`) | yes · no | **Yes** — a link is not attributable to a person, so making it attributable to *itself* is the only accountability available, and it makes stale links obvious in the card |
| **D6** | Who may create/revoke links | owner+lead · owner only | **Owner+lead**, consistent with 9.4a for invites |
| **D7** | Link expiry default | 1 month | **1 month**, per your spec |

---

## 6. The amendment text (to apply on approval, not before)

To be inserted in `docs/PORTAL-PROPOSAL.md` beneath the "no raw share links"
statement:

> **⚠ AMENDED 2026-07-26 — share links are now permitted, deliberately.**
> The original text read *"Explicitly NOT raw tokenized share links: every view is
> an identity, attributable and revocable by removing the membership row."* That
> was the right default and remains the default: **invite-with-account is still
> the primary mode**, and anyone who needs to be on the record gets an account.
>
> **What changed.** For a read-only external viewer — a GC PM who needs to read
> the issues register once before a site meeting — requiring account creation is
> friction that gets the portal not-used. A second, lighter mode is worth the
> tradeoff, provided the tradeoff is stated rather than glossed.
>
> **The tradeoff, stated:** a share link is attributable to the LINK, not to a
> person. Anyone holding the URL is that link. It can be forwarded, pasted into a
> group chat, or screenshotted, and we will not know who looked. That is the cost,
> and it is the reason share links are the secondary mode and not the default.
>
> **The guardrails, all mandatory:**
> - **Individually revocable** (`revoked_at`), same pattern as invites. Revocation
>   is immediate and total.
> - **Server-enforced expiry**, evaluated inside `portal_link_project()` — the one
>   function that may ever evaluate it — never in the UI. Presets only; the
>   client cannot supply a timestamp.
> - **"Never" requires a distinct confirmation** and renders as a mark in the
>   access card, not as a date, so it is visible on any later audit.
> - **Identical whitelists.** A link visitor reads through the same column lists
>   as an account, because they are literally the same SQL — one inner function,
>   two gates. Every NEVER exclusion holds identically: no finding diaries, no
>   drafts, no deliverables, no equipment, no Directory, nothing cross-project.
> - **No write path exists**, and it is asserted rather than assumed (pw-portal).
> - **Link creation sends nothing.** It is inherently copy-paste, so the mail
>   safety posture is untouched and link mode can go live with no mailer at all.

`ARCHITECTURE.md`'s portal security model gains a **Link mode** subsection
(the table above, the validation function, the file path, the three walls behind
"no writes"). `MASTER-BRIEF §12` records the decision with its date and the
one-line rationale. `PORTAL-GOLIVE.md` gains a short **"Going live with links
only"** path — it needs no mailer, so it can precede §1 entirely.

---

## 7. Test plan — `pw-portal` extensions

Every negative paired with the positive that proves the mechanism is live
(ARCHITECTURE's named rule). ZZ-TEST only; self-cleaning; the suite creates and
deletes its own links.

| Leg | Assertion |
|---|---|
| **Positive** | Valid link → bundle returns the whitelisted shapes; **column sets compared field-by-field against the account-mode RPC output** — not "it returned something". This is the anti-drift test, and it fails the moment the two paths diverge |
| **Expired** | Link with `expires_at` in the past → rejected. Paired with the same link pre-expiry succeeding, so the rejection proves expiry and not a broken token |
| **Revoked** | `revoked_at` set → rejected; paired with the same link before revocation |
| **Never** | `expires_at IS NULL` → honored. Guards the NULL footgun directly |
| **Cross-project** | Link for A cannot read B — assert on B's *known-present* data being absent, and confirm B has data, so the negative is not vacuous |
| **No writes** | Three walls, each asserted: anon PostgREST insert on `findings` → denied; anon `rpc('portal_findings')` → **42501** (error code, not row count); `POST /api/generate-report` with only a link token → 401/403 |
| **Files** | Signed URL through link auth: **issued** document → 200 and fetches; **draft** → 403 with the issued-only message; `equipment_attachments` → refused |
| **Link table opacity** | A link holder cannot read `portal_share_links` (no anon policy) — paired with staff reading it successfully |
| **Account mode unaffected** | All existing pw-portal legs green, unchanged. The refactor in D1(d) moves RPC bodies, so this is the regression gate for the ruled Part A path |
| **Garbage/short tokens** | Rejected identically to expired/revoked — one shape, no oracle |

Plus the standing gate: full battery green.

---

## 8. Not building

- No per-link scoping below project level (no "links that show only documents").
  Not asked for, and it would fork the whitelist.
- No password-protected links, no email-gated links. Either the link is the
  credential or an account is — a half-step is worse than both.
- No link analytics beyond `last_viewed_at`/`view_count` (D5).
- No bulk link management screen. The access card is the management surface.
