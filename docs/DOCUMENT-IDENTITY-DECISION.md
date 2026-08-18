# Document identity — navy or purple? (decision one-pager, 2026-07-25)

> **SUPERSEDED IN PART — see [Amendment 1 — monochrome (2026-08-05)](#amendment-1--monochrome-2026-08-05)
> at the end of this file.** The decision below is preserved as what was decided
> on 2026-07-25 and is still the record of *why* the generators converged on a
> single palette object. The palette it chose is no longer the live one. Read
> both, in order; do not plan from this section alone.

**Owed from the portal brief. This decides nothing — it is the page you decide from.**
Supersedes the sketch at PORTAL-PROPOSAL §17, which got the test consequence wrong
(see §4).

## 1. Why it is live now

The generated documents render the firm's **navy `#1F3A5F`** letterhead, section
rules and table heads. The app and the external portal render **brand purple
`#443C8F` / vermilion `#E8432D`**. Until this week only the firm saw both. The portal
ends that: an invited PM opens a purple project record and downloads a navy PDF from
it **in the same minute, from the same page**. That is the whole change in situation —
the divergence became client-visible.

## 2. What converging actually touches

Measured, not estimated. Navy hex occurrences by file:

| File | Navy sites | What they drive |
|---|---:|---|
| `api/_shared/doc-common.ts` | 6 | `BASE_CSS` letterhead (`.firm h1`, `.brandrule`), project-header note, `h2.sec` heading + underline, `thead th` fill/border; `FIRM_HEADER_DOCX` inline h1 |
| `api/generate-checklist.ts` | 15 | its **own private copies** of the same constants (it does not import `BASE_CSS`), plus the checklist-specific `.cl-name`, `.lg-hdr` LEGEND header, `.sec-row` band, and the DOCX `TH`/`THL`/`tdSec` inline strings |
| `api/generate-minutes.ts` | 12 | `.doctitle`, the topic `.band` rows, item-number cells, `.asum-group` action-summary rows, DOCX `TH` + inline band strings |
| `api/generate-report.ts` | 9 | issue-number cells, `.cat` category headings, `.fcorr .lbl` corrective-action label, DOCX equivalents |
| **Total** | **42** | |

Three companion colours travel with the navy and must be re-chosen together, or the
result is purple headings on blue-grey bands:

- `#C9D2DD` — project-header and legend borders
- `#DDE3EA` — table body borders; **also the checklist section-band fill**
- `#E8EDF4` / `#F4F7FB` / `#F6F8FB` — action-summary group rows, project-header mid
  cell, zebra striping

**No document *structure* changes.** No template rewrite, no layout work, no
pagination risk. It is a palette substitution across four files — but note
`generate-checklist.ts` duplicates the shared constants rather than importing them,
so "change `doc-common` and you're done" is false. Consolidating that duplication is
optional and separable; doing it in the same pass makes the change smaller forever
and larger once.

## 3. Client-visible surfaces to decide explicitly

These are the ones easy to miss because they are not "the letterhead":

1. **Site-report closed-finding grey band.** Closed findings render on `#E3E3E3` with
   `#777` text — a deliberate "this is settled" convention. It reads as neutral today.
   Against a purple identity it may want the portal's conformance green instead, which
   would be a **semantic** change, not a palette one. Recommend: leave grey. The
   document says *closed*, not *passed*.
2. **Site-report status colours** — `#C0392B` outstanding / `#1E8449` recorded. These
   are conformance semantics, not brand. The app already keeps semantic green separate
   from brand. Recommend: leave, or align to the app's exact green/vermilion so the
   portal and the PDF agree on what "open" looks like.
3. **Checklist LEGEND block** (`.lg-hdr`, `.tl-legend`) — navy header on `#F6F8FB`.
   A contractor reads this on paper in a mechanical room. Whatever is chosen must
   survive **greyscale printing**, which is how these are actually used.
4. **Meeting-minutes topic bands** — solid navy full-width rows, the strongest colour
   block in any Isotherm document. Purple at that size is a much bigger visual change
   than the letterhead is. Look at this one before deciding.
5. **The disclaimers** (site-report and minutes footers) — italic `#888` on white,
   untouched by either option. Flagged only so nobody re-opens them by accident: the
   minutes disclaimer carries a 7-day clock tied to `issued_at`, so its wording is
   contractual, not cosmetic.
6. **Greyscale and toner.** Navy and brand purple have similar luminance, so both
   print acceptably in mono. Vermilion does not — if vermilion is used for anything
   structural (rules, bands) rather than as a small accent, it goes muddy in
   greyscale. Recommend: purple carries structure, vermilion stays an accent, exactly
   as in the app.

## 4. The test consequence — corrected

**PORTAL-PROPOSAL §17 and ARCHITECTURE both say this needs a deliberate byte-clean
baseline reset. That is wrong, and I checked rather than repeating it.**

`pw-report-regen.mjs` does not compare bytes. It extracts `word/document.xml`,
strips every tag, normalises whitespace, and compares **visible text**:

```js
const visibleText = buf => docxXml(buf).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
```

Colours live in style attributes, i.e. *inside* tags, which this strips. So a
colour-only convergence produces **identical** extracted text and the regen gate
passes unchanged — **no baseline reset, no re-baselining commit, no lost regression
cover**. `pw-checklist-docs.mjs` is likewise text-based (real pdf.js extraction).

This materially lowers the cost of the change, and it is the single biggest
correction on this page. Two caveats:

- Neither gate would *catch* a colour mistake either. If we converge, the proof is
  visual — generate one of each document type and look at them, PDF and DOCX both.
- `pw-report-regen` is a manual, argument-taking tool and is deliberately outside the
  battery. Run it explicitly against a real report id.

## 5. Rule 4 — the honest part

Issued files are frozen. Converging does **not** re-render anything already issued.
So a project mid-flight ends up with navy documents issued before the switch and
purple ones after, permanently, visibly, to the client.

- **(i) Accept the mixed era.** Rule 4 is not negotiable and re-issuing history to
  match a palette would be a worse principle than a mixed-looking binder.
- **(ii) Switch at a project boundary** so any one project is single-era. Cleanest
  output, but it means holding the change until a natural start — and there is always
  another project mid-flight.

## 6. The two options

### A — Converge to purple
One identity everywhere the client looks. The portal and the PDF it serves stop
disagreeing. Cost: 42 sites plus companions across four files, a visual proof pass,
and a permanent mixed era on in-flight projects. Risk is low and contained — no
structure changes, and the regen gate keeps working (§4).

### B — Keep navy, deliberately
Not the do-nothing option. The argument: **the app is a tool; the document is a
record.** Navy is the identity on every report Isotherm has ever issued — it is what
a decade of drawings, letterheads and transmittals look like in a client's files.
A commissioning report is a formal deliverable that may be read in a dispute years
later, and looking *continuous with the firm's own history* is worth something that
looking *continuous with this month's web app* is not. Under this option the split is
recorded as intentional in DESIGN.md ("generated documents keep their own print
identity") — which is already what DESIGN.md says — and the portal gets one line of
copy framing the download as the formal record.

Cost: zero. Consequence: the client keeps seeing two identities, and every future
surface has to ask this question again.

## 7. Recommendation

**Option A, with the caveats made explicit**: converge, accept the mixed era (i),
keep the closed-finding grey and the conformance red/green as semantics rather than
brand, keep vermilion as an accent only so greyscale survives, and fold the
`generate-checklist.ts` constant duplication into the same pass. Prove it by
generating one report, one checklist and one minutes document and **looking at all
six files** — no baseline reset is required, and no automated gate will catch a
colour error for you.

If the answer is B, the one thing worth doing anyway is deleting the "activates with
this phase" language from MASTER-BRIEF §10, Build Spec §6B/§12 and ARCHITECTURE
UI-debt 7, so the question stops re-opening itself every time the portal is touched.

**Not decided here. Both options are real.**

---

# AMENDMENT 1 — monochrome (2026-08-05)

**Ruled by Tony, 2026-08-05. Recorded as a dated amendment, not a silent rewrite:
the decision above stands as what was decided on 2026-07-25, and this is what
changed and why.**

## The ruling

**Generated documents go monochrome, effective now.** The purple/vermilion brand
layer is **retired from documents** until the rebrand lands.

**The reason:** the brand layer is going to change. Issuing documents in an
identity that is known to be provisional means a third era of mixed files on
every long project (§5's Rule 4 consequence, incurred a second time for a
palette nobody intends to keep). Monochrome is not a placeholder — it is the
format the firm's current **Site Note** already uses in the field, and it is
correct on its own terms: black ink, gray section bands, light-gray field fills,
white body, plain black-bordered tables.

**Scope boundary, ruled explicitly:** generated documents only. The **app UI,
landing page and portal keep the current palette** pending the rebrand. §3's
question — "should the client-facing surfaces match?" — is therefore answered
*deliberately no, for now*, and it will be re-asked once, at the rebrand, rather
than per-surface.

## The mapping

`DOC` in `api/_shared/doc-common.ts` — every field, by role:

| Field | Role | Was | Now |
|---|---|---|---|
| `INK` | letterhead, headings + underline, numeric cells, labels | `#443C8F` | `#000000` |
| `BAND` | solid fill carrying **white** text | `#443C8F` | `#000000` |
| `BAND_UNIT` | checklist UNIT band (level 2) | `#5D55AF` | `#4D4D4D` |
| `BAND_SUB` | checklist SUB band (level 3) | `#7F78CB` | `#757575` |
| `BAND_TINT` | light fill carrying INK text | `#E3E1F5` | `#D9D9D9` |
| `BORDER` | structural borders | `#CFCCE0` | `#000000` |
| `RULE` | table-body hairline | `#E1DEEB` | `#808080` |
| `ZEBRA` | even-row striping, panel wash | `#F7F6FC` | `#F5F5F5` |

**The band ramp is dark, and the reference's `~ADADAD` has no role.** All three
band levels carry **white** text in the generators; a mid-gray fill would put
white on ~2:1 and fail the same greyscale-print test that fenced vermilion out of
structural roles in §6. The ramp holds 21:1 / 8.9:1 / 4.6:1. The reference's
field-label gray `#D9D9D9` landed on `BAND_TINT`, where the field labels
actually live.

**`DOC_SEMANTIC` untouched, and that is the point.** Pass/fail, outstanding,
recorded, and the meeting item statuses carry *meaning*, not brand. With the
identity monochrome they are now the **only colour in a generated document** —
so every remaining colour says something, and adding one is a semantic claim.
The `BLANK FORM — FOR CONTRACTOR USE` amber banner stays for the same reason.

Eleven cool-cast neutrals hardcoded outside `DOC` went with it — `#8A93A0`
`#9AA3AE` `#E8EBEF` `#F2F5F8` `#FAFBFC` `#eef2f6` `#6B7280` → true grays. The
pale blues named in the ruling, `#D9E2F3` and `#F4F7FB`, were **not present**.

## What the verification found — and why the source grep would have lied

§4 and the note in `doc-common` both say it plainly: **no automated gate catches
colour.** `pw-report-regen` strips every tag and compares visible TEXT, so a
palette change is invisible to it by construction. So this amendment was gated on
a new harness, `doc-palette-sweep.mjs`, which **renders** every document family
and greps the **DOCX WordprocessingML** — the one artifact where colour is
greppable text.

It caught something a source grep never could. After every value in `DOC` was
monochrome and every literal in `api/` was swept clean, **the Cx Plan still came
out purple.** Its heading identity is not in `doc-common` at all — it is Word
**style definitions** baked into the committed binary
`firm-knowledge/skeletons/cx-plan.docx` → `word/styles.xml`: `443C8F` ×4 as a
`w:fill` behind white text, `5D55AF` ×2 as level-2 heading text. Fixed by
`patch-skeleton-palette.mjs`, which asserts every other part comes out
byte-identical; `prove-skeleton.mjs` stayed green afterwards.

**The rule that generalises:** *identity can live in a binary, and source is not
the artifact.* A grep over source proves the author's intent. Only the rendered
output sees stored content, committed binaries, and a dependency's own defaults.

## Evidence

`doc-palette-sweep.mjs` → **SWEEP CLEAN**, 7 documents, 18 retired values each:
site report · meeting minutes · PFC completed + blank · IVC completed + blank ·
Cx Plan. `doc-palette-shots.mjs` rendered page 1 of all 7 in colour and BT.601
greyscale; the pairs are indistinguishable, which is the confirmation that no
colour is carrying structure.

**Named gaps, so a clean report is not read as coverage it does not have:**

- **`fpt` and `startup` have no ZZ-TEST instance** and were not swept. The
  harness prints this by name below the results. `startup` is listed ahead of
  its build on purpose — the fourth checklist type must not arrive unswept.
- **The Cx Plan DOCX was grepped, not looked at.** Rendering a DOCX needs Word
  or LibreOffice, and neither is available to the harness. `styles.xml` is
  proven clean; the *appearance* of its headings in Word is not visually
  confirmed. Open it once by hand.
- **Local PDFs render in Playwright's Chromium, not Lambda's** (`@sparticuz/
  chromium-min` ships a Linux pack and cannot resolve on Windows; aliased in
  `doc-render-local.mjs`). Irrelevant to colour, which lives in the HTML the
  generator built — not irrelevant to pagination or font fallback. Do not reuse
  that shim for either question.

## Rule 4, a second time

Files already **ISSUED** stay exactly as issued. A long project may now hold
navy, then purple, then monochrome documents. That mixed set is intentional and
is not a defect to reconcile — **a document records what it looked like when it
was issued.**

---

# AMENDMENT 2 — colour admitted into the Cx Index export family only (2026-08-17)

**Ruled by the owner with the Phase 2b package, after holding the first Seneca
artifacts. Recorded as a dated amendment, not a silent rewrite. The old text it
modifies, quoted:**

> **Generated documents go monochrome, effective now.** The purple/vermilion
> brand layer is **retired from documents** until the rebrand lands.

— and doc-common's consequence note: *"these are now the ONLY colour in a
generated document … Adding a colour here is now a semantic claim."*

## The ruling

**The screen palette is admitted into the Cx Index export family — and only
there.** Specifically: the matrix's 12-colour stage-group bands, the teal
done / amber in-progress cell fills under the drawn status marks, and a cover
that echoes the app header. Every other generated family remains monochrome
under Amendment 1; the `DOC` palette in doc-common is untouched, and the
export's colours live in the export's own module, never in `DOC`.

**Why this family is different:** the Cx Index export is the *screen's own
matrix* leaving the app — the owner's review found the monochrome print harder
to navigate than the screen it reproduces, and a client who has seen the portal
reads the group bands as wayfinding. The Site Note's monochrome logic (a field
document, printed mono, on site) does not describe a 30-page navigational
matrix.

## The law riding the amendment

**Colour is REDUNDANT ENCODING, never the carrier.** The drawn marks (solid
square, half square, dot, struck square) carry every status on their own; the
fills and bands are wayfinding on top. The grayscale rasterization must still
read complete — battery-asserted, not trusted: the export leg samples the
rendered page and requires the mark/fill contrast to survive BT.601 grayscale.
`print-color-adjust: exact` is set and verified against the real deployment;
xlsx fills ride `styles.xml` patternFills, unzip-asserted plus a real-Excel
open reading the fill back through COM.

Rule 4, a third time: artifacts generated under the monochrome era stay as
generated. Regeneration produces the current form; nothing is re-issued.
