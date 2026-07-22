# MOBILE-AUDIT.md — Full mobile audit + fix wave plan

**Status: PLAN APPROVED — WAVE 1 SHIPPED (2026-07-22). Waves 2–3 pending.**

## Wave 1 exit report

Shipped as `1cb9940` (RC4 alone, per ruling — battery isolated it clean) then
`7bdb2c8` (RC1/RC2/RC5/RC7 + Overview). Gates: five-width screenshot review
(two defects caught and fixed in review: the fill-header action cluster
crushing the title, and Overview's fixed col-spans forcing phantom grid
tracks at one column) · full battery green · `npm run build` pre-push ·
served-bundle verified.

**Exit criteria:**
- ✔ Create a finding (full-screen sheet modal, sticky Create button) at 375.
- ✔ Fill checklist responses one-handed at 375 — stacked rows, inline unit
  tags, 44 px targets.
- ✔ **Offline path verified at 375 on production**: network disabled →
  response queues → "Offline — 1 queued" banner fully on-screen and legible →
  second entry queues → reconnect → "All changes saved". Evidence:
  `out/w1/375-offline-banner.png`.
- ✔ Equipment lookup and project Overview single-column.
- ⚠ **Photo capture: HUMAN VERIFICATION OWED** — emulation cannot exercise
  the camera. Tony tests finding-with-photo on a real phone before Wave 2
  starts. Not claimed as passed.

**Incidental finds during the battery gate:** ZZ-TEST team-matrix fixture
carried leftovers from an older interrupted pw-team run (CxA + Architect
assignments, a ZZT test role) — cleaned, suite green; pw-team is not
re-entrant after a mid-run crash (fixture note, not a code defect).
`pw-directory` had been broken since the router landed (sidebar buttons →
NavLinks) — locators fixed, green.

- Date: 2026-07-22
- Method: Playwright device-emulation sweep of every surface at 375 (iPhone SE),
  393 (iPhone 14 Pro), 412 (Android mid), 768 (tablet), 1440 (desktop baseline);
  ~115 screenshots under `out/mobile-audit/{width}/`, ALL inspected as images
  (render-and-look rule), dev.test for member surfaces + dev.admin for
  admin-gated surfaces; ZZ-TEST data only. ZZ-TEST's Cx Index was initialized
  (test fixture, designed default structure) to make that surface auditable.

---

## 1 · Findings by surface and severity (375 unless noted; 412 similar unless noted)

### BROKEN — unusable on a phone

| Surface | Finding |
|---|---|
| **Checklists tab + fill view** | THE worst surface. Two-panel layout does not collapse: the fill view gets ~170 px — title wraps one word per line, **Reopen button clipped off-screen, the response matrix is not reachable at all**. Filter chips + "+ New Checklist" also clipped. The single most important field surface is unusable. |
| **Project tab strip (all 9 tabs)** | Only 4 of 9 tabs visible at 375; strip ends clean at the viewport edge with **no scroll affordance and no partial tab** — Equipment/Site Reports/Meetings/Checklists/Deliverables are undiscoverable, and on those pages the ACTIVE tab isn't visible anywhere. |
| **Directory (list + selected company)** | Two-panel layout does not collapse. Contacts table shows the NAME column only — COMPANY/TITLE/EMAIL/PHONE and the row Edit/Delete actions are entirely off-screen; search input clipped mid-word. Company detail heading truncated. The core phone task (look up a contact) fails. |
| **Projects list** | Fixed table overflows: CREATED/LAST OPENED columns fully off-screen, classification chips clipped, search input clipped, the four filter/sort controls not visible. Project name column squeezes to one word per line. |
| **Site Reports tab** | Reports table clipped: STATUS truncated, and the FILES column with the **.docx/PDF download links — the row's primary actions — is entirely off-screen** with no affordance. |
| **Templates** | Template titles render single-line with no wrap/ellipsis and clip at the viewport edge — for the Architectural series the clipped suffix is exactly the distinguishing part, so rows become indistinguishable. |
| **New Finding modal** | Modal exceeds the viewport; footer (Cancel / Create Finding) off-screen in capture — submit reachability depends on undiscoverable internal scroll. (The 1440 baseline ALSO clips the footer — this is a modal-height defect at every size.) Desktop two-column field grid squeezes labels/placeholders at phone widths. |
| **Users** | Role chips clipped at the right edge; Memberships/Leads columns fully off-screen. |

### DEGRADED — readable but cramped

| Surface | Finding |
|---|---|
| **Project Overview** | Two-column card grid squeezes Project Team/Phases into ~180 px columns — company names truncate mid-word, "View Team →" wraps vertically. Stat header (2×2) is fine. |
| **Project header block** | Consumes ~480 px of a 667 px viewport before any tab content (taller still as admin — Mark as Completed adds a row). Not broken, but it pushes every tab's content below the fold. |
| **Dashboard sticky header** | `.chrome-material` translucency produces text-on-text as content scrolls under the title band (visible at 1440 too; worst at 375 where the header is tallest). |
| **Cx Index matrix** | Renders with rotated headers; the 88 columns run off-screen (scrollable but no affordance, tag column not frozen). The spec (§6C) already records that the matrix needs a simplified mobile view as roadmap — this audit treats "scrollable + affordance" as the owed fix, the simplified view stays roadmap. |
| **Classifications** | Right-edge columns/actions clipped; dimension-name inputs truncate ("Project L", "Sustaina"). Viewable, marginal for editing. |
| **Issue create modal (412)** | Two-column squeeze as above; footer at the frame edge. |

### FINE at phone widths (evidence of what already works)

Landing (V5) · Login · Dashboard top (chips 2×2, queue, portfolio cards stack) ·
Issues Log LIST (rows stack cleanly) · Equipment LIST (clean stacked rows) ·
Team tab (best surface audited — single-column role cards, full parity) ·
Meetings tab (empty state) · Deliverables tab (one cosmetic wrap) · Users/
Classifications page shells · top app bar everywhere.

### Cosmetic

Dashboard date/eyebrow wraps at 375 · Deliverables "0 tracked" counter wrap ·
Site-report REPORT # cell wraps to 4 lines · landing "SCROLL" hint offset.

### Honestly unaudited (capture gaps — verified inside their fix wave, not skipped)

- **Dashboard charts region** (Follow-up Radar, trend, by-system): the "mid"
  scroll step never scrolled (md5-identical to top shot) — charts unaudited at
  mobile widths. Recharts ResponsiveContainer likely reflows, but that gets
  VERIFIED in Wave 2, not assumed.
- **Issue detail panel open at phone width** (same two-panel pattern as
  Checklists — expected same failure), **Equipment detail/nameplate view**,
  **Meetings with data + its modals**, **Directory child-row editors**
  (phones/emails/locations), **site-report create modal**, **Access card
  interactions**. Each is captured before-and-after inside its wave.

## 2 · Systemic root causes (7 of them account for nearly everything)

1. **RC1 — Project tab strip**: fixed row, no wrap/scroll affordance → 5 tabs
   unreachable. One component fix in ProjectDetailPage.
2. **RC2 — Two-panel master/detail never collapses** (`flex h-full` with fixed
   side panels): Checklists (list+fill), Directory (companies+contacts), Issues
   (list+detail), Equipment (list+detail). One responsive pattern: below `lg`,
   single-pane stacked navigation (list → full-width detail with a back
   affordance), desktop unchanged.
3. **RC3 — Wide data tables with no responsive treatment**: Projects, Site
   Reports, Directory contacts, Users, Classifications, Templates (no
   truncation). Per-case: stacked cards (Projects, Site Reports, contacts,
   Users) or overflow-x-with-affordance + sticky first column (Cx Index,
   Classifications); Templates needs title truncation + wrap.
4. **RC4 — Modal**: one shared component (`ui/Modal`) → full-screen sheet below
   `sm` with sticky header/footer (actions always reachable), internal scroll,
   and consumers' two-column field grids collapsing to one column. Fixes every
   modal in the app at once, including the desktop footer-clip defect.
5. **RC5 — Project header block**: too tall on phones → compact variant
   (title row + collapsible meta) below `lg`.
6. **RC6 — chrome-material translucency**: sticky header text-on-text → raise
   surface opacity/blur (or solid below `lg`); also fixes the 1440 bleed.
7. **RC7 — Checklist fill internals** (beyond RC2): the response matrix needs a
   phone layout — per-item stacked rows, ≥44 px status tap targets, reachable
   comment/photo/outbox affordances, grids scrollable per-grid. This is the one
   surface that earns bespoke work beyond the shared primitives.

## 3 · Proposed fix waves (ordered by field reality)

**Wave 1 — the field path** (what gets used standing up in a mechanical room):
RC1 tab strip · RC4 Modal sheet (shared — every consumer benefits, incl. the
finding-with-photo flow) · RC2 collapse for Checklists, Issues, Equipment ·
RC7 checklist fill phone layout · RC5 compact project header · Overview card
grid single-column. Exit criteria: create a finding with photo, fill a
checklist response with comment, look up equipment, read overview — all
one-handed at 375 px.

**Wave 2 — the office-on-a-phone path**: Directory RC2 collapse + contacts as
cards (child-row editors verified in-wave) · Site Reports table → stacked cards
with FILES links prominent · Projects list → cards below `lg` (filters in a
disclosure) · RC6 chrome opacity + dashboard charts verified at phone widths
(the unaudited gap) · Meetings verified with data · Deliverables cosmetic wrap.

**Wave 3 — make-it-not-broken (admin)**: Templates title truncation/wrap ·
Classifications overflow treatment + editor spacing · Users → stacked cards ·
Access card verified · Cx Index scroll affordance + sticky tag column
(simplified mobile matrix stays §6C roadmap, explicitly not owed this pass).

**Principles for all waves** (per the brief): fix shared primitives over
per-screen patches; tap targets ≥44 px; desktop appearance preserved exactly —
additive responsive work, not a redesign; wide tables become cards or
scroll-with-frozen-column per content.

**Gates per wave**: screenshot sweep at all five widths reviewed as images
before shipping · full Playwright battery green (desktop must not regress) ·
`npm run build` pre-push · served-bundle verification.
