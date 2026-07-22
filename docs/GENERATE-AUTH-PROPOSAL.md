# GENERATE-AUTH-PROPOSAL.md — Authenticate the generate-* endpoints

**Status: PROPOSED — awaiting Tony's approval. No code written.**

- Date proposed: 2026-07-22
- Trigger: verified during the 2026-07-22 doc-reconciliation pass — all three document
  generators accept an id-only POST, run under the service-role key (RLS bypassed),
  and set CORS `*`. Anyone with a project/report/instance UUID can generate documents
  against the database from anywhere, with no identity check.
- Registers: MASTER-BRIEF §12 + Build Spec §12 ("Unauthenticated generate-* endpoints").
  This is the top pre-client-rollout item alongside storage-bucket privacy.
- Companions: `docs/ACCESS-CONTROL-PROPOSAL.md` (the access model this proposal
  re-applies server-side), `ARCHITECTURE.md` (api/ layer, standing rules).

---

## 1 · Call-path inventory (as-is)

### Browser call sites — three, all POST with no Authorization header

| Call site | Endpoint | Payload |
|---|---|---|
| `src/pages/SiteReportsPage.tsx:160` | `/api/generate-report` | `{ report_id }` |
| `src/pages/ChecklistsPage.tsx:1028` | `/api/generate-checklist` | `{ instance_id, mode, audience? }` |
| `src/pages/MeetingsPage.tsx:449` | `/api/generate-minutes` | `{ meeting_id }` |

All three run inside the authenticated SPA, so the session JWT is available at every
call site (`supabase.auth.getSession()` → `access_token`) — it just isn't sent.
`pw-meetings.mjs` exercises this path through the UI button, so it inherits whatever
the app sends.

### Non-browser callers — six scripts, all currently anonymous direct fetches

| Script | Endpoint | Identity available via `.env` |
|---|---|---|
| `audit-template.mjs:414` (seeding harness, render-verification family 5) | generate-checklist | admin creds (uses Management API for SQL today) |
| `pw-checklist-docs.mjs:72` | generate-checklist | dev.test / dev.admin |
| `pw-blank-audience.mjs:52` | generate-checklist | dev.test / dev.admin |
| `pw-signoff-order.mjs:125` | generate-checklist | dev.test / dev.admin |
| `pw-finding-register.mjs:39` | generate-report | dev.test / dev.admin |
| `pw-report-regen.mjs:44` (the byte-clean gate) | generate-report | creds available; no supabase client in the script today |

Node scripts ignore CORS entirely (browser-enforced), so CORS tightening does not
affect them — only the missing token does.

### What each endpoint does with the service-role key

1. **Cross-table assembly reads** (report: site_reports + projects + distribution +
   findings/diary/photos; minutes: meeting family + team matrix; checklist: the full
   instance-snapshot family + field defs). *Could* run under caller RLS — a member
   sees all of this by the M-pattern.
2. **Storage uploads** via `uploadDocPair` (site-reports / checklists /
   meeting-minutes buckets). **Genuinely needs service role** — those buckets
   deliberately have zero client policies (dev-era policies dropped in the
   access-control pass).
3. **Row writebacks** — `storage_url`/`pdf_url` on the source row;
   `meetings.issued_at` stamped on first issue. Member-updatable under RLS in
   principle, but the issued-meeting frozen-record semantics make the service-role
   write the safer, already-proven path.

**Conclusion:** the pipeline legitimately needs service role for (2), and gains
nothing but risk-surface reduction from converting (1)/(3). The right shape:
**authorize first, then run the existing pipeline unchanged** — which is also what
guarantees the report-regen byte-clean gate passes, since document assembly is
untouched.

---

## 2 · Proposed pattern — verify identity AND authorization

### New shared helper — `api/_shared/auth-common.ts`

Sibling to doc-common; same underscore convention, never deploys as an endpoint.

```
requireProjectAccess(req, projectId) → { userId, role } | throws AuthError(401|403)
```

Logic, in order:

1. **Extract** `Authorization: Bearer <jwt>` — missing/malformed → **401**.
2. **Verify identity:** `serviceClient.auth.getUser(jwt)` — validates signature and
   expiry against Supabase Auth using the service client the endpoints already
   construct. **No new environment variables needed** (`SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` already present in all three). Invalid/expired → **401**.
3. **Resolve role:** read `user_profiles.role` for the verified user id
   (service-role read). No profile row → **403**.
4. **Authorize against the resource** — a server-side mirror of the M-pattern.
   Deliberately the *content* predicate, not lead/destructive, because generation is
   member-open work under the access model:
   - `role ∈ (admin, developer)` → allow (matches `is_admin_or_dev()`);
   - else `EXISTS project_members(project_id, profile_id)` → allow — owners and
     employees both ride membership, exactly as `is_project_member()` has no role
     condition;
   - else → **403**. A valid JWT belonging to a non-member of that project is
     rejected. The `client` role falls out naturally (never a member, not admin/dev).
5. Only after this returns does the handler proceed with the existing service-role
   pipeline.

### Per-endpoint flow

Each handler first resolves its id to a project (`site_reports.project_id` /
`meetings.project_id` / `checklist_instances.project_id` — one service-role lookup
the handlers substantially already perform), returning **404 for an unknown id** —
but only *after* step 2, so an unauthenticated caller can never probe id existence.
Then `requireProjectAccess`.

Response codes: **401** no/invalid/expired token · **403** valid token, no access ·
**404** authenticated, id unknown.

**Drift-safety:** the helper queries the same `project_members` table the RLS
helpers do, so membership changes propagate automatically. The one duplicated
predicate is the role list; auth-common carries a comment naming
`is_admin_or_dev()` / `is_project_member()` as the definitions of record.

### CORS — exact allowlist

Replace the wildcard with an origin check that echoes the request Origin only when
allowed, else omits the ACAO header entirely (browser blocks; non-browser callers
unaffected):

- `https://isotherm-app.vercel.app` (production)
- `https://isotherm-app-isotherm.vercel.app` and
  `https://isotherm-app-git-master-isotherm.vercel.app` (standing Vercel aliases)
- Preview deployments by pattern:
  `^https://isotherm-app-[a-z0-9]+-isotherm\.vercel\.app$` — Vercel's generated
  preview hostnames for this project/team, covered by regex so each preview needs no
  config change
- `http://localhost:5173` (Vite dev)

`Access-Control-Allow-Headers` gains `Authorization`; OPTIONS preflight returns 204
with those headers for allowed origins, and no ACAO for foreign ones. Note the
production browser path is same-origin (`/api/...` from the same host), so CORS is
belt-and-braces for previews/dev — the JWT is the defense.

---

## 3 · Client + tooling changes

- **App:** attach `Authorization: Bearer ${session.access_token}` to the three
  fetches (or a small shared `authedFetch` in `src/lib/`). No other app change.
- **Scripts:** all six anonymous callers get a sign-in + token. Cleanest: extend
  `pw-config.mjs` with an `apiToken(email, password)` helper (signs in with
  supabase-js, returns the access token) — every script already loads `.env`.
  Per the §6.1 credential split: pw suites use their existing dev.test/dev.admin
  identities; `audit-template.mjs` uses dev.admin (seeding tooling).
  `pw-report-regen.mjs` gains its first supabase client — **fix the script, not the
  endpoint.**

---

## 4 · Test plan (API-layer, pw-access style)

### New suite `pw-generate-auth.mjs` (self-cleaning, ZZ-TEST only)

Setup: as dev.admin, create `ZZ-TEST-AUTH-<ts>` with one report/instance/meeting
seeded, deliberately **without** dev.test membership (a guaranteed non-member case).
Then, against all three endpoints where applicable:

1. Anonymous POST → **401**
2. Malformed token (`Bearer garbage`) → **401**
3. Valid dev.test token, resource in the non-member project → **403**
4. Valid dev.test token, resource in ZZ-TEST (member) → **200** with document URLs
5. dev.admin token against any project → **200**
6. Authenticated POST with a random UUID → **404**
7. OPTIONS with `Origin: https://evil.example` → **no** ACAO header;
   OPTIONS with the production origin → ACAO echoes it
8. Teardown: delete the seeded project (admin); verify zero residue

### Regression battery

Full standing suites green after the change — most critically
**`pw-report-regen.mjs` before/after BYTE-CLEAN** (authorization runs before
assembly; document output must be bit-identical), plus `pw-checklist-docs`,
`pw-blank-audience`, `pw-signoff-order`, `pw-finding-register`, `pw-meetings`
(UI path), `pw-dashboard`, `pw-deliverables`, `pw-access`. Deploy verification by
bundle-content marker per the standing rule.

---

## 5 · §12 disposition on completion

Mark **"Unauthenticated generate-* endpoints" RESOLVED** with the date and pattern
("JWT verification + server-side membership authorization via
`api/_shared/auth-common.ts`; CORS allowlisted") in both registers (Build Spec §12,
MASTER-BRIEF §12).

**Storage-bucket privacy stays open as the next hardening item** — and gets easier:
with `requireProjectAccess` in place, the natural follow-on is generating **signed
URLs from within the already-authorized endpoints** (plus a small authorized
URL-refresh endpoint for stored documents), so bucket privatization becomes mostly
a storage-config + link-plumbing pass rather than a new auth design.

**Scope note:** the endpoints will still *return* public URLs this pass — an
attacker who already possesses a document URL can still fetch that file until the
storage pass lands. This change closes generation/overwrite abuse and
database-driven document access, not raw file-URL access.
