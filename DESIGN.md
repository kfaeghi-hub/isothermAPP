# DESIGN.md — The Living Standard

Visual world for the Isotherm Cx System, committed 2026-07-21 (impeccable new-work,
seed 84078ac6, grounded direction: CSA/ASHRAE normative-document typography).
Replaces the previous generic-admin look (dark slate sidebar / teal actions),
which is anti-reference. PRODUCT.md owns product truth.

## Thesis

The app is the firm's own living standard. Commissioning engineers spend their
working lives inside CSA/ASHRAE documents — clause numbers, ruled tables,
conformance language. The tool that verifies conformance looks and behaves like
the normative document it produces: cover, contents, inside pages, marks.

## World

**Structure metaphor:** the sidebar is the standard's COVER (deep institutional
green, white lettering, contents list). Content areas are INSIDE PAGES (warm
paper white, ink text, hairline rules). Print on screen: sharp corners, ruled
tables, no decorative shadows or glass.

**Palette** (tokens in src/index.css @theme; Tailwind stock scales are REMAPPED
so legacy utilities inherit the world):

- Cover green 950 `#062A1D` (sidebar/login field) through standard-600
  `#176844` (primary actions) to 50 `#F2F7F4` (tint fills). Replaces teal.
- Paper `#FBFAF7` app ground; surface white `#FFFFFF`; ink `#1C2420` body,
  `#0F1713` display.
- Rules: hairline `#DCE2DC`; heavy head-rule ink.
- Conformance semantics: conforms/closed = standard green; pending/attention =
  document amber `#8A5400` on `#FBF3E1`; deviation/overdue = mark red `#B3261E`
  on `#FBEAE8`; informational = steel `#33546B` on `#EDF2F6`.
- Never gray secondary text on green surfaces — tint from the green.

**Type:**
- `Archivo` (variable, width axis) — UI and headings. Headings use the
  semi-expanded cut (`font-stretch:110%`, utility `.font-display`), weight 600–700,
  tracking-tight. Body 13–14px regular.
- `Spline Sans Mono` — every reading, tag, COM number, date, count, clause
  number. Mono is measurement, never costume.
- Loaded via Google Fonts in index.html. No other faces.

**Grammar:**
- Clause numbers structure navigation and major page sections (contents rail
  entries, dashboard section heads). They are reference information — a
  standards document's wayfinding — not decoration; do not number minor cards.
- Tables: heavy 2px ink head rule, hairline row rules, generous row height
  (36–40px), mono for data columns, small-cap letter-spaced column heads.
- Status chips are conformance MARKS: rectangular (2px radius), letter-spaced
  700-weight 10px caps, tinted field + tinted text (same hue).
- Buttons: primary = solid standard-600 rectangle (4px radius), white 600 text;
  secondary = hairline outline, ink text; destructive = mark red. Focus-visible
  = 2px offset ring in standard-600.
- Radii: global sharpening via --radius-* (sm 1px, DEFAULT 2px, md 3px, lg 6px,
  xl 8px). rounded-full survives for avatars only.
- Motion: paper-flat and fast — 120–150ms ease-out fades/translations; one
  authored moment per surface (e.g. drawer slide); nothing springy.

**Signature:** the isotherm contour mark — fine concentric contour lines (SVG,
the firm's namesake) — appears ONLY on the login cover and empty states, as a
watermark at ≤8% opacity. Everywhere else the world stays austere.

**Responsive:** below lg the cover collapses: a document-header top bar
(cover green, wordmark, section title, menu button) with a slide-over contents
drawer. Content is never narrower than the viewport minus 32px gutters.

## Application rules

- Operate mode: expression never obscures task, state, or affordance. Density
  serves scanning; registers (findings, checklists, deliverables) are ruled
  tables or ruled row lists.
- Playwright contract: roles, text labels, and data-testids are load-bearing —
  restyle around them.
- Generated documents (PDF/DOCX) keep their own print identity (navy firm
  header) — out of scope for this world until Tony asks.
- Icons: lucide-react, 16–18px, stroke 1.75–2, currentColor. Never emoji.
