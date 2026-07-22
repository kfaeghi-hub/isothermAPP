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

**Palette** — **BRAND-PINNED 2026-07-22** to the firm's actual logo (purple
`#443C8F` wordmark + vermilion `#E8432D` mark; the earlier green rendition is
retired). Tokens in src/index.css @theme; Tailwind stock scales REMAPPED so
legacy utilities inherit the world:

- Cover purple 950 `#181536` (sidebar/login field) through brand/standard-600
  `#443C8F` (primary actions, the wordmark purple) to 50 `#F1F0FA`.
- Vermilion is the heat: on-cover accent `#F2704F` (the `Cx` mark pairing),
  deviation/overdue `#C2371F` on `#FCEBE7`. Brand red and semantic red are
  unified on the vermilion family.
- Paper `#FBFAF8`; surface white; ink `#23222C` body, `#16151F` display.
- Rules: hairline `#E0DFE6`; heavy head-rule ink.
- Conformance semantics: success/closed stays SEMANTIC green `#1E7A4E`
  (status meaning, not brand); pending amber `#8A5400` on `#FBF3E1`;
  informational steel `#375672`.
- Never gray secondary text on purple surfaces — violet-tint it (`#8F8DA6`).

**Logo**: `src/components/Logo.tsx` — vector recreation (I-beam + two
vermilion isotherm curves). `color` variant on paper, `reverse` on the cover.
Lives in the sidebar masthead, mobile bar, and login lockup. Replace the
paths with the official SVG artwork when the source file is provided.

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
