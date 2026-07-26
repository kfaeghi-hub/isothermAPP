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
the firm's namesake) — appears ONLY on **cover surfaces** and empty states, as a
watermark at ≤8% opacity. Everywhere else the world stays austere.

> **Amended 2026-07-25 (deliberately, ruling 9.9), with the external project
> portal.** The rule previously said "the login cover". There are now three
> cover surfaces — login, the public landing, and the portal hero — and the mark
> is the firm's namesake, so it belongs on all of them rather than on whichever
> one happened to exist when the rule was written. The constraint that actually
> matters is unchanged and still binding: **≤8% opacity, `aria-hidden`,
> `pointer-events-none`, never on a paper surface except an empty state.** Paper
> stays austere. Widening this rule again needs the same deliberate amendment,
> not a precedent argument from this one.

**Responsive:** below lg the cover collapses: a document-header top bar
(cover green, wordmark, section title, menu button) with a slide-over contents
drawer. Content is never narrower than the viewport minus 32px gutters.

## Application rules

- Operate mode: expression never obscures task, state, or affordance. Density
  serves scanning; registers (findings, checklists, deliverables) are ruled
  tables or ruled row lists.
- Playwright contract: roles, text labels, and data-testids are load-bearing —
  restyle around them.
- Generated documents (PDF/DOCX) **share this world's identity** as of
  2026-07-26 (ruling: `docs/DOCUMENT-IDENTITY-DECISION.md`). They were navy
  `#1F3A5F`; the external portal made the split client-visible — an invited PM
  opened a purple record and downloaded a navy PDF in the same minute — so the
  documents converged to brand purple. The palette lives in ONE place,
  `DOC` in `api/_shared/doc-common.ts`; never hardcode a document colour again.
  Three constraints came with the ruling and are binding:
  - **Conformance colour is not brand.** `DOC_SEMANTIC` keeps the closed-record
    grey band, outstanding/recorded, and the meeting-item statuses out of the
    identity. The closed band says CLOSED, not PASSED.
  - **Vermilion is structural-never in documents** — accent only, never a band
    fill or a rule. BT.601 luma 113.8 vs purple's 71.9: it does not survive the
    greyscale printing these get on site.
  - **Issued files are frozen (rule 4).** Projects mid-flight hold both eras
    permanently. That is intended, not a defect to clean up.
- Icons: lucide-react, 16–18px, stroke 1.75–2, currentColor. Never emoji.
