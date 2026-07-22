# LANDING-PAGE-PROPOSAL.md — Animated public landing page

**Status: PROPOSED — awaiting Tony's approval. No code written.**

- Date proposed: 2026-07-22
- Brief: replace the bare login form for unauthenticated visitors with a real
  landing page — first impression for staff, later clients and recruits.
  Restrained animation ("precision, not bounce"). Companion authority:
  ARCHITECTURE.md "UI & Design System".

---

## 0 · One discrepancy to resolve at approval

The brief says "navy/steel/gold brand values," but the documented design system
it points to (ARCHITECTURE.md UI & Design System, as-built 2026-07-22) is the
**logo-pinned purple `#443C8F` + vermilion `#E8432D` on paper white**, with navy
`#1F3A5F` recorded as *legacy debt to be removed*. This proposal builds the
landing page in the documented purple/vermilion world — the landing page is the
brand's front door and should match the logo and the app it opens into. If
navy/steel/gold was intentional, say so and I'll re-propose the palette section.

## 1 · Routing shape

**Proposed: explicit `/login` route; landing owns `/` for visitors; login-in-place
preserved for deep links.**

| State | Path | Renders |
|---|---|---|
| Unauthenticated | `/` | **LandingPage** (new) |
| Unauthenticated | `/login` | LoginPage (moved to a real route) |
| Unauthenticated | any other path | LoginPage **in place** — URL untouched, so after sign-in the requested route mounts (current deep-link-through-login behavior, unchanged) |
| Authenticated | `/` | DashboardPage — straight to work, no interstitial; `client` role → `/projects` redirect unchanged |
| Authenticated | `/login` | `<Navigate to="/">` |
| Any | `/reset-password` | unchanged (pre-router bypass preserved) |

Why this shape: moving login to `/login` gives the landing CTA a real
destination and a stable URL for tests/bookmarks, while keeping the in-place
login for deep links means **zero deep-link breakage** — a dashboard email link
to `/projects/:id?tab=issues` behaves exactly as today. The auth gate moves
inside the router (one conditional per route group), not around it.

**Known test impact (planned, not incidental):** `pw-config.mjs login()`
navigates to `/` and fills the form — under the new shape `/` shows the landing
page. One-line fix in the shared helper (`goto ${BASE_URL}/login`), which every
suite inherits. The full battery re-runs as the gate, same as the original
router landing.

## 2 · 21st.dev usage + token mapping

Catalog searched (heroes, feature grids, reveal patterns). Candidates:

| 21st.dev component | Use as | Notes |
|---|---|---|
| `Hero Minimalism` (lyanchouss) or `Minimal Hero section` (larsen66) | Hero structure/layout reference | closest to restrained; both still carry SaaS styling to strip |
| `Grid Feature Cards` (sshahaider) | Capability-blocks structure | minimal grid, maps cleanly onto our card-tile |
| `Stagger Reveal Grid` (pulkitxm) | Scroll-reveal pattern reference | wave-stagger on scroll — re-expressed via our `.rise` + IntersectionObserver |

**How they're used — structure, not skin or dependency tree.** Retrieval happens
on approval (paid per component); the code is adapted into our files with:

- **Token mapping (theirs → ours):** any indigo/violet/emerald/zinc scale →
  `brand-*`/`standard-*` purple, accent → `vermilion-*`, grays → our remapped
  `gray-*` ink ramp, backgrounds → `--color-paper` / `--color-cover #181536`;
  their font stacks → **Archivo (`.font-display`) + Spline Sans Mono** (no new
  font families); their rounded-2xl/shadow-xl → our print-sharp radii and flat
  paper shadows; buttons → our standard-600 button grammar with the global
  press response; feature cards → `.card-tile` + our chip conventions
  (tinted field + same-hue text). Zero stray scales survive the port.
- **Motion mapping:** their framer-motion/GSAP entrances → our CSS motion system
  (`.rise` staggered entrance, 200ms interruptible transitions), driven by a
  small `useReveal` IntersectionObserver hook for scroll-triggered reveals.
  Existing `prefers-reduced-motion` guards apply automatically.

## 3 · Dependency list

**No new runtime dependencies.**

| Considered | Size | Verdict |
|---|---|---|
| framer-motion | ~32 KB gz + tree | **Rejected** — our CSS motion system already encodes the restrained grammar, is reduced-motion-guarded, and adds 0 KB |
| GSAP (some hero candidates) | ~25–70 KB gz | **Rejected** — same reason; candidates using it get their motion re-expressed in CSS |
| IntersectionObserver | 0 (native) | Used for scroll reveal |

If a retrieved component turns out to genuinely need a library to keep its
value, I stop and flag it rather than adopting silently. Whatever ships is
recorded in ARCHITECTURE.md.

## 4 · Containment & component plan

New tree only — **no existing app component modified**:

```
src/pages/landing/
├── LandingPage.tsx            # composition + lazy-loaded route chunk
├── useReveal.ts               # IntersectionObserver → .rise stagger; reduced-motion renders visible
├── landing.css                # landing-scoped styles (contour animation, hero field)
└── sections/
    ├── LandingHero.tsx
    ├── LandingCapabilities.tsx
    ├── LandingVisual.tsx
    └── LandingFooter.tsx
```

- `LandingPage` is `React.lazy`-loaded so the authenticated app path pays ~0 KB.
- Reused as-is (no modification): `LogoMark`/`LogoLockup` from
  `components/Logo.tsx` — note `LogoLockup` is currently the orphaned export on
  the UI-debt list; the landing page becomes its first real consumer, retiring
  that debt item without touching the file.
- App.tsx changes are confined to the route table (the §1 shape).
- Shared-primitive changes needed: **none identified**; anything discovered
  mid-build gets flagged for the UI punch-list session instead.

## 5 · Section layout & content (copy = draft for revision)

1. **Hero** — cover-purple field (`#181536`) with the **animated isotherm
   contour lines** (see §6): `LogoLockup`, H1 "Commissioning management, built
   by commissioning agents", one supporting line ("One connected record from
   IVC to final report — the issues log is the backbone."), primary CTA
   **Sign in → /login** (real link, keyboard-focusable), quiet secondary
   anchor ("What it does ↓"). Motion: single orchestrated `.rise` stagger on
   load; contour drift is slow and continuous; no bounce anywhere.
2. **What it does** — four card-tile capability blocks, all real:
   - **Field checklists** — 238-template IVC/PFC library, multi-unit fill,
     works offline in mechanical rooms.
   - **Issues log & site reports** — ASHRAE-202 findings register with photo
     diary; issued reports generated as PDF + DOCX.
   - **Meeting minutes** — typed agendas, carry-forward action items,
     generated minutes with an action summary by responsible party.
   - **Dashboard & deliverables** — attention queue, LEED deliverable
     tracking, portfolio at a glance.
   Clause-numbered section head (the app's own document grammar), lucide icons,
   scroll-staggered reveal.
3. **Visual** — proposal: **framed ZZ-TEST dashboard screenshot** in a
   document-plate treatment (ruled border, mono caption), `loading="lazy"`,
   fixed `aspect-ratio` box so zero layout shift. ZZ-TEST data only, never a
   real project. (Alternative if preferred: extend the abstract contour
   animation as the section visual and skip screenshots entirely — zero
   staleness. Default recommendation: the screenshot; it sells the tool.)
4. **Footer** — firm identity (LogoMark), 95 Mural Street Suite 600, Richmond
   Hill ON, phone, info@isothermengineering.com, © Isotherm Engineering Ltd.

## 6 · The signature: animated isotherm contours

The hero background animates the brand's own mark: 3–4 SVG isotherm curves
(the logo's contour language) drifting via `stroke-dashoffset`/transform at
~60–90 s periods, vermilion at low opacity over cover purple. CSS-only,
GPU-composited (transform/opacity), fully static under
`prefers-reduced-motion`. This is the "animated but restrained" centerpiece —
an engineering instrument warming up, not a startup splash.

## 7 · Quality bars (acceptance, not aspiration)

- Responsive to 360 px; sections stack single-column; CTA thumb-reachable.
- `prefers-reduced-motion`: all entrances render visible immediately, contour
  static — verified in the suite, not just guarded.
- No layout shift: aspect-ratio reserved for the screenshot, fonts already
  `display=swap`, no late-loading hero media.
- Fast paint: landing chunk lazy-split; hero is CSS/SVG (no hero image
  download); screenshot lazy below the fold. Target: first paint comparable to
  the login form it replaces.
- Accessible: single H1, real H2 section headings, alt text on the screenshot,
  CTAs are real links with visible focus, contrast per the token layer.

## 8 · Test + verify plan

**New `pw-landing.mjs`:**
1. Unauthenticated `/` → landing renders (H1 + CTA visible, **no** password input)
2. CTA click → `/login` shows the login form
3. Sign in from `/login` → lands authenticated; then visiting `/` → Dashboard
   (stat chips visible, no landing hero) — the no-interstitial guarantee
4. `client` role at `/` → `/projects` redirect intact
5. `page.emulateMedia({ reducedMotion: 'reduce' })` → landing content fully
   visible with entrances suppressed
6. `/reset-password` renders
7. Unauthenticated deep link `/projects` → login form in place, URL preserved

**Regression:** `pw-config.login()` updated to `/login` (the one planned test
change), then the **full battery** green — the routing change is the risk
surface, same class as the original router landing. Pre-push `npm run build`
per the standing rule; after deploy, served-bundle marker verification before
any gate run.

**ARCHITECTURE.md updates on completion:** routing table (+`/login`, landing
row), landing tree in Folder Structure, UI section notes (landing motion +
contour signature, LogoLockup no longer orphaned), dependency record (none
added), 21st.dev structural-reference provenance.
