# Isotherm Cx System — Architecture

> **Standing principle (§9B):** Clear separation of data / logic / UI. Consistent structure. External integrations behind adapter boundaries. Strong typing. Tests on critical flows. Clarity and modularity over cleverness, without over-abstracting for hypothetical needs.

---

## Overview

A React SPA for managing building commissioning (Cx) projects. Used daily by field engineers at Isotherm Engineering. The system tracks projects through their full lifecycle: directory of companies and contacts, issues found on site (findings log with diary and photos), Cx Index checklists, site reports, and deliverables. Future phases will add auth, template management, and potentially external API integrations (construction PM tools, BAS systems).

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI framework | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (utility-first, no config file) |
| Build | Vite 6 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) — ca-central-1 |
| DB access | `@supabase/supabase-js` v2 (PostgREST + Realtime client) |
| Font | IBM Plex Sans (UI) + IBM Plex Mono (identifiers, dates) via Google Fonts |
| Tests | Playwright (browser-driven, key user flows) |

---

## Folder Structure

```
src/
├── lib/
│   ├── supabase.ts        # Supabase client singleton (data layer boundary)
│   └── projectTypes.ts    # Project-type labels/badges + shared formatDate()
│
├── types/
│   └── database.ts        # TypeScript interfaces mirroring DB schema exactly
│                          # Includes joined types used in UI queries (e.g. ProjectWithClient)
│
├── components/
│   └── ui/
│       └── Modal.tsx      # Reusable overlay modal (title, onClose, maxWidth)
│
├── pages/
│   ├── ProjectsPage.tsx   # Project list (active/completed tabs, search, filters, CRUD)
│   ├── ProjectDetailPage.tsx  # Single-project view with tab nav (Overview, Issues Log, …)
│   ├── DirectoryPage.tsx  # Company + contact management (two-panel)
│   └── IssuesLogPage.tsx  # Findings log (two-panel list/detail, diary, photos)
│
└── App.tsx                # Root: sidebar nav, top bar, page routing
```

---

## Layers

### Data Layer — `src/lib/supabase.ts` + `src/types/database.ts`

All Supabase access goes through the single `supabase` client exported from `src/lib/supabase.ts`. No page or component imports from `@supabase/supabase-js` directly — they import from this module. This is the **integration seam**: if the backend changes (e.g. a REST API replaces direct DB access, or RLS policies tighten in Phase 7), only this file changes.

`src/types/database.ts` is the schema mirror. Every table has a matching TypeScript interface. Joined/augmented shapes (e.g. `ProjectWithClient`, `ContactWithCompany`) extend the base types and are used in query results. **Rule:** when the DB schema changes, update this file first.

Key enums: `ProjectType`, `FindingStatus`, `FindingOrigin`, `CxProgress`, `DeliverableType`, etc.

### Business Logic

Currently co-located with pages (inside the component's functions). At this stage the app is primarily CRUD, so heavy extraction would be premature. The natural seam for extraction: if a piece of logic needs to be shared across two pages, or if it becomes complex enough to need independent testing, move it to a `src/lib/` module.

**Examples of where logic should eventually live in `src/lib/`:**
- Finding number generation / validation
- Report generation (Phase 6)
- Cx Index scoring

### UI Layer — `src/pages/` + `src/components/`

Pages own their own data fetching, local state, and layout. Shared UI primitives (Modal, future: Button, Badge, etc.) live in `src/components/ui/`. No page imports from another page's internals.

**Two-panel pattern** (list narrows to sidebar when an item is selected): used in DirectoryPage and IssuesLogPage. The active item drives both panels; closing the detail resets to full-width list.

---

## Database Schema (key tables)

```
projects              → the top-level entity; status: active | completed
project_phases        → ordered phases per project (FK → projects CASCADE)
project_trades        → which trade_types are in scope per project (junction)
trade_types           → firm-wide master list of disciplines
project_distribution  → contact list per project (FK → projects, contacts)

companies             → firms (clients, contractors, vendors)
company_roles         → what roles a company plays (many per company)
contacts              → people at companies

findings              → issues log entries per project
finding_diary_entries → append-only diary per finding (oldest-first)
finding_photos        → photo records per finding; storage_url = full public URL

project_cx_groups     → Cx Index stage groups per project
project_cx_columns    → individual sub-columns per stage group
cx_index_defaults     → firm-level default Cx Index templates
```

All project-referencing FKs use `ON DELETE CASCADE`. Phase 1 uses dev-permissive RLS (`USING (true) WITH CHECK (true)`) — replaced with real auth policies in Phase 7.

---

## Storage

Supabase Storage bucket: **`finding-photos`** (public, 10 MB file limit).

Upload flow: browser canvas → JPEG (1400px max, 0.82 quality) → `supabase.storage.from('finding-photos').upload(path, blob)` → store the full public URL in `finding_photos.storage_url`.

Delete flow: remove DB record first (preserves UI consistency), then remove from Storage (best-effort).

Path convention: `findings/{finding_id}/{timestamp}.jpg`

---

## Routing

No router library. `App.tsx` holds a `activeItem` string mapped to `<Page />` components. `ProjectsPage` manages its own "selected project" state, rendering `<ProjectDetailPage>` in place when a project is open (replaces the list, not a new route). This is fine for Phase 1; a URL router (e.g. TanStack Router) is the natural Phase 7 addition alongside auth.

---

## Design Tokens

| Token | Value | Use |
|---|---|---|
| Primary action | Teal-700 `#0F766E` | Buttons, active states, underlines |
| Sidebar bg | Slate-900 | |
| Content bg | White / Slate-50 | |
| Mono font | IBM Plex Mono | COM#, dates, finding numbers |
| UI font | IBM Plex Sans | Everything else |

---

## Naming Conventions

- **Files:** PascalCase for components/pages (`ProjectsPage.tsx`), camelCase for lib modules (`supabase.ts`)
- **DB columns → TS fields:** snake_case in DB, camelCase only in joined/computed properties; raw DB rows use snake_case as-is
- **State:** plain descriptive names (`findings`, `allContacts`, `selectedId`); boolean flags use `is-` only when truly ambiguous
- **Async functions:** named for what they do (`fetchFindings`, `saveEdit`, `deletePhoto`) not for network verbs (`get`, `post`)
- **Modals:** `xyzOpen: boolean` + `xyzForm: FormType` pairs

---

## Integration Seams

These are the points where external services connect. Each is a single-file boundary:

| Seam | Location | Notes |
|---|---|---|
| Supabase DB | `src/lib/supabase.ts` | All table queries go through this client |
| Supabase Storage | `src/lib/supabase.ts` (same client) | `supabase.storage.from(bucket)` |
| Future: construction PM API | `src/lib/pmAdapter.ts` (not yet built) | Will wrap project create/sync |
| Future: BAS API | `src/lib/basAdapter.ts` (not yet built) | Will wrap point import for Cx Index |

**Rule:** when a new external integration is needed, create a new adapter module in `src/lib/`. Pages and components must not call external APIs directly.

---

## How to Add a New Feature

1. **DB change** → write a Supabase migration, update `src/types/database.ts`
2. **New page** → add `src/pages/NewPage.tsx`, wire into `App.tsx` routing
3. **New shared component** → `src/components/ui/` (only if used in ≥2 places)
4. **New external integration** → `src/lib/newAdapter.ts`, never inline in a page
5. **Update this file** if the structure changes materially

---

## Testing

Playwright scripts in the repo root (`pw-*.mjs`) cover key flows:
- Finding creation → diary entry → photo upload
- Trade selection in project setup → category propagation to Issues Log
- Project status lifecycle (active → completed → reopen)

Future: move to a `tests/` directory with named spec files as coverage grows.

---

*Last updated: 2026-06-21 — reflects Phase 1 build (Projects, Directory, Issues Log, Trades).*
