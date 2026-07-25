# Document identity — navy or purple? (decision one-pager, 2026-07-25)

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
