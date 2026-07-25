# Storage Privacy Pass — Proposal (§12, the last hardening item before client data)

Status: PROPOSED 2026-07-24 — awaiting approval. No changes made.
Grounded in a full consumer inventory (every `getPublicUrl`, every persisted URL,
every upload site, every render/download consumer — table at bottom).

## Current state (verified)

All five buckets — `site-reports`, `meeting-minutes`, `checklists`,
`finding-photos`, `equipment-files` — are **public**; secrecy of the URL is the
only protection. `createSignedUrl` is used **nowhere**. Four DB columns persist
**full public URLs** (`site_reports.storage_url/pdf_url`, `meetings.storage_url/
pdf_url`, `finding_photos.storage_url`, `equipment_attachments.storage_url`);
`checklists` outputs are ephemeral (URLs returned in the generate response only,
never stored). Two delete paths reverse-engineer storage paths by string-slicing
stored URLs. `generate-report` fetches finding photos **from their public URLs**
during document generation and embeds them as base64 data URIs (no live URLs
inside any issued document — verified for all three generators).

## Proposed design

### 1 · Buckets → private (all five)
Files stay in place; the flip kills anonymous reads immediately.

### 2 · Store PATHS, not URLs (the load-bearing change)
Signed URLs expire, so persisting them is wrong by construction. One-time
migration rewrites the four URL columns to bucket-relative paths (strip the
known `/storage/v1/object/public/<bucket>/` prefix + cache-buster). Upside:
the two delete-path slicing sites (IssuesLogPage ×2, EquipmentPage ×1) get
simpler — they use the stored path directly. Dashboard truthiness checks on
`storage_url` keep working (path is still truthy).

### 3 · Signed-URL issuance — where each link gets its URL
One new endpoint, `api/get-file-url.ts`, single contract `{ table, id, kind }`
(row-anchored, never a caller-supplied raw path):
`applyCors → requireUser → resolve row → derive project_id → requireProjectAccess
→ createSignedUrl(bucket, path, expiry) → { url }`.
Project derivation per bucket: site-reports/meetings/checklists rows carry
`project_id`; `equipment_attachments` rows carry `project_id`; `finding_photos`
resolves `finding_id → findings.project_id`.

| Consumer | Today | After |
|---|---|---|
| SiteReportsPage .docx/PDF links (mobile + table) | `<a href={stored URL}>` | onClick → `get-file-url` → open; anchor styling unchanged |
| MeetingsPage PDF/DOCX links | same | same treatment |
| ChecklistsPage generated docs | `window.open(response url)` | **no client change** — generate-checklist mints signed URLs directly in its response (nothing persisted) |
| Generate endpoints' own responses (report/minutes) | public URL JSON | signed URL JSON (fresh post-generate open keeps working); DB write becomes the path |
| IssuesLogPage photo `<img>`/`<a>` | stored public URL | batch `createSignedUrls` for the finding's photos at detail-open (one round trip per finding) |
| EquipmentPage attachment links | stored public URL | onClick → `get-file-url` |
| generate-report photo embedding | `fetch(publicUrl)` server-side | `service.storage.from('finding-photos').download(path)` — service role reads private storage natively |

### 4 · Expiry policy
- **Documents (click-to-open):** 10 minutes — ample for download managers, useless to a leaked link.
- **Photos (inline render):** 60 minutes, batch-signed per finding view.
- **Generate-response URLs:** 10 minutes (they're opened immediately).

### 5 · Uploads under private buckets
Documents upload service-role inside endpoints — unaffected. But
`finding-photos` (src/lib/photos.ts — the OFFLINE OUTBOX path) and
`equipment-files` (EquipmentPage) upload **client-side with the anon key**.
Private buckets need storage RLS INSERT policies for authenticated internal
roles on exactly these two buckets (no SELECT policy — reads happen only via
signed URLs; service role bypasses). Moving these uploads server-side would
break the offline outbox — not proposed.

### 6 · Transition plan for existing files and links
- Files: untouched (flip doesn't move objects).
- Stored links: the URL→path migration converts them in one pass; app renders
  never touch a raw URL again.
- **Issued documents: nothing breaks** — verified that no generated .docx/.pdf
  embeds a live storage URL (photos are baked in as base64).
- Previously shared raw public URLs (e.g., pasted into email) die at the flip.
  That is the point of the pass; regeneration is not required since in-app
  access re-signs on every click.

### 7 · pw coverage (new `pw-storage-privacy.mjs`, ZZ-TEST only)
1. Authorized: dev.test opens a ZZ-TEST report via the app path → signed URL → HTTP 200.
2. Anonymous: the raw `object/public/...` form of the same file → 400/403.
3. Anonymous: `get-file-url` without a JWT → 401.
4. Non-member: dev.owner (0 memberships state) requests a ZZ-TEST file → 403.
5. Photo render: finding detail shows `<img>` with a `token=` signed src.

### 8 · Sequencing (one batched pass, per the §12 note)
DB URL→path migration → code consumers + endpoint + policies → bucket flip →
deploy → new suite + full battery as the gate. The flip is the last step so the
old build never points at a dead URL for more than one deploy window.

## Decisions requested
1. Expiry values (10 min docs / 60 min photos) — confirm or adjust.
2. Client-side uploads stay (INSERT-only storage policies) vs move behind
   endpoints — **recommend stay** (offline outbox depends on it).
3. One generic `get-file-url` endpoint (row-anchored) vs per-type endpoints —
   **recommend the single row-anchored endpoint** (no raw-path signing, ever).

## Inventory (evidence)
- Uploads: photos.ts:49 (`findings/{findingId}/…`), EquipmentPage:293 (`{equipId}/…`),
  doc-common.ts:165/169 (`{projectId}/…`), generate-checklist.ts:1282/1286 (`{projectId}/{instanceId}/…`).
- getPublicUrl: photos.ts:52 · EquipmentPage:297 · doc-common.ts:179-181 · generate-checklist.ts:1291/1295.
- Persisted URLs: finding_photos.storage_url · equipment_attachments.storage_url ·
  site_reports.storage_url/pdf_url · meetings.storage_url/pdf_url.
- Renders: SiteReportsPage:272-278/344-359 · MeetingsPage:564-566 · IssuesLogPage:748/754 ·
  EquipmentPage:663-670 · ChecklistsPage:1055-1056.
- URL-slice deletes: IssuesLogPage:291-294/361-365 · EquipmentPage:315-319.
- Server-side public fetch: generate-report.ts:426.
- Side note: ARCHITECTURE.md:509 calls equipment-files "access-controlled" — code says public; corrected by this pass.
