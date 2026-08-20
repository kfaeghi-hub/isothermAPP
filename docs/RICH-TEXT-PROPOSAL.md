# Platform rich text — TipTap, adopted for the narrative surfaces

**Status: RULED 2026-08-20 — all eight questions ruled; PHASE 1 GREENLIT on
this fold.** Rulings appended to each question in §3 per the 3o precedent.
Q6 is a **departure from the recommendation, owner-vetoable** — the veto path
is recorded in place. One gate addition rides the greenlight: the
two-paragraph-plus-bulleted-section pin runs **against the deployed build**
per the content-string pattern — the U+2713 family's lesson is that local
belief cannot see serverless rendering.

*Written by `ATLAS`. The owner's frame is already ruled and this proposal
designs inside it: TipTap, MIT core only, version-pinned; the locked platform
schema (paragraph · bold · italic · bulletList · orderedList; headings reserved
to the Cx Plan tier); no tables, no images, no colors — images wait on the 3o
pool by standing ruling; TipTap JSON beside legacy text, supersede-never-delete
(the F1 shape); the renderer trio in `api/_shared`; the adoption ladder Cx Plan
→ Issues → Meetings → Site reports; the ruled exclusions. KEEL's F1/F2
measurements (RELEASES 1.22) are this audit's priors, extended here.*

---

## 0. The one-sentence architecture

> **One stored truth (TipTap JSON, whitelisted at the door), one shared trio of
> renderers beside the docx patcher, every consumer reading through the trio —
> so the day a Procore-class API wants an observation body, `toPlainText()` is
> already battery-proven instead of invented under deadline.**

---

## 1. The audit — measured against production

### 1.1 What the narrative surfaces actually hold today

Read-only REST counts, 2026-08-20 (the F2 method, extended to all four
ladder surfaces):

| Surface · column | Rows | Carry `\n` | Blank-line paragraphs | Dash-bullet lines |
|---|---|---|---|---|
| `cx_plan_sections` · `final_text \|\| drafted_text` | 4 | 1 | 1 | 0 |
| `meeting_items` · `discussion` | 32 | 10 (KEEL's F2 number, unchanged) | — | **0** |
| `findings` · `description` | 264 | **122** | — | 3 |
| `site_reports` · `progress_narrative` | 7 | 4 | — | 0 |

Two findings ride the numbers:

- **The Cx Plan family has its own F2-class flattener, both formats.**
  `cx-plan-assembly` pushes a whole narrative section as **one `para` block**;
  `docx-skeleton.p()` puts the block's text into a single `<w:t>` (a `\n`
  inside `w:t` renders as nothing in Word), and `blocksToHtml` escapes it into
  one `<p>` (default `white-space` swallows the `\n` in the PDF). The one
  production section with blank-line paragraphs is printing as one paragraph
  in both formats today. Phase 1 fixes this class *by construction* — JSON
  paragraphs become separate blocks — rather than by another `\n` patch.
- **The "dash-counter" retires against a near-zero baseline.** Zero meeting
  discussions and zero plan sections use `- ` pseudo-bullets; three finding
  descriptions do. The convention never took hold — the baseline to note in
  the Phase 3 fold is: *dash-lines in production at retirement: 0 meetings /
  3 findings / 0 elsewhere* (the three findings normalize to real
  `bulletList` at their Phase 2 door, counted in the migration note).

### 1.2 The Cx Plan pipeline (Phase 1's flagship), as-built

- **Storage**: `cx_plan_sections` rows keyed `(plan_id, section_key)` with
  `drafted_text` (the writer's prose), `final_text` (the CxA's edit),
  `accepted`, `flags`, and a disposition ledger (accepted verbatim vs after
  editing). Generate reads `final_text || drafted_text`. Issue snapshots
  answers + sections + corpus SHA into `cx_plan_snapshots` (rule 4).
- **The AI drafting flow**: `cx-plan-draft` is **two calls** — the writer
  emits `parsed.prose` (a plain string per section) plus claims citing fact
  keys; the **verifier**'s flags each carry a **`span: string`** quoted from
  that prose (`agent-schemas.ts:48,60`). A redraft un-accepts.
- **Assembly**: `buildDeterministic(facts, narrative: Record<string,string>)`
  merges narrative into the Block stream. **The Block vocabulary already
  contains `bullet`** (`STYLE_FOR.bullet`, a skeleton style) and `heading`
  levels 1–3 — the JSON→docx landing pads largely exist. `table` exists but is
  deterministic-engine-only (and the platform schema excludes tables anyway).
- **Rendering**: docx via `injectIntoSkeleton` (styles/numbering/TOC pass
  through; `substituteOrThrow`; missing-style refusal); PDF via
  `blocksToHtml → toPdf`. Both consume the same Block stream — **the trio's
  JSON→docx output is Blocks, not XML**, and inherits every skeleton
  protection for free.
- **Refusals** (all server-side, all keep working unchanged): generate demands
  approved + every-section-accepted; approve/issue owner+lead; issued frozen.

### 1.3 KEEL's F2 priors, applied

The one-renderer law (`discussionHtml` fixes both formats), the measured
html-to-docx fact (1.8.0 **does** emit `<w:br>` for `<br>` — the flattener was
`\n→space` upstream), the `w:br`-pinned-in-raw-XML gate idiom, and the
expand-editor pattern (one draft state, two views) are the priors Phase 3
builds on. The 1.22 record's *"rich-text decision is a separate stop-and-show
(options priced in the audit report)"* is the banked (b) this arc supersedes:
**Phase 3 folds it** — the meetings editor becomes the TipTap subset, and
`discussionHtml` becomes a legacy-fallback branch of the shared JSON→HTML.

### 1.4 The five-consumer map, per ladder surface

| Surface | Screen | Generator(s) | Portal | Dashboards/summaries | Carry/copy |
|---|---|---|---|---|---|
| Cx Plan sections | `CxPlanPage` (textarea → `acceptSection`) | `cx-plan-generate` docx+PDF via Blocks | **not exposed** (ruled) | none | `cx_plan_snapshots` (rule 4 — snapshots the JSON column verbatim once it exists) |
| Findings description | `IssuesLogPage` | `generate-report` issues table (both formats) | **`portal_findings` whitelists `description` + `corrective_action`** — both modes, anti-drift-compared | Follow-up radar/action summary render truncated text | — |
| Meeting discussion | `MeetingsPage` inline + expand modal | `generate-minutes` via `discussionHtml` | not exposed | dashboard open-items + Action Summary (whitespace-collapsed truncation, 1.22) | **carry-forward copies the item** — the JSON column must copy with it |
| Site report narrative | `SiteReportsPage` | `generate-report` (`split('\n')` → per-line `<p>` — newlines honored here already) | not exposed | — | — |

**`ilike` audit: clean.** No narrative column is read by any `ilike` or
pattern query (verified across `src/` and `api/`; the matches are all
tag/name/email fields). The extraction/`ilike` exclusion in the ruled frame
has no live collisions.

**The portal is the sleeper consumer.** `description` crossing as JSON means
the portal Register needs the JSON→HTML renderer at Phase 2 — through the
`src/lib` shim of the shared module (the strict-side rule), not a copy — and
`pw-portal`'s anti-drift/whitelist legs must keep passing with the new column
**excluded** from the whitelist (the portal renders from the same rows it
gets today; the JSON column joins the whitelist deliberately at Phase 2, both
modes in the same migration, or not at all — Q6).

### 1.5 Version-pin mechanics

The model-pin precedent is *pin-as-assertion* (the alias resolves to itself,
so the pin asserts the response). npm is better-behaved: real versions exist.
The pin is therefore two-layered:

- **Exact versions in `package.json`** (no `^`): `@tiptap/core`,
  `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/html`, `@tiptap/markdown`
  at **3.30.2** (current at writing; the ruling pins whatever is current at
  build). All MIT core; no cloud add-ons.
- **The render-twin assertion**: a committed fixture JSON document rendered
  through the trio at battery time, output compared to committed expected
  HTML/plaintext byte-for-byte. An upgrade is a deliberate step: bump the
  pins, re-run, diff the twins, commit the delta *as the record of what the
  upgrade changed* — the calibration-corpus discipline applied to a
  dependency.

### 1.6 Touch-policy trigger, noted

`pw-cx-plan` is one of the zip readers that walks local headers (the residue
note). Phase 1 touches that suite, so **its reader converts to
central-directory enumeration in the same phase** — the standing policy firing
on schedule, priced into Phase 1 rather than discovered mid-build.

---

## 2. The design

### 2.1 The whitelist is an extension list, not StarterKit

`StarterKit` ships nodes the platform schema forbids (blockquote, codeBlock,
horizontalRule, heading everywhere…). The shared schema module declares the
**exact extension list**: `Document, Paragraph, Text, Bold, Italic,
BulletList, OrderedList, ListItem` — plus `Heading` **only** in the Cx Plan
tier's editor configuration. One declaration, exported to the editor (client),
the normalizer, and all three renderers; the client reaches it through a
`src/lib` shim per the strict-side rule.

**Enforcement at the data layer**: the door function
`normalizeRichText(input) → { doc, dropped[] }` runs on every write path
(paste included, via the editor's paste pipeline; AI lift; any import):
unknown nodes/marks are **converted where meaning survives** (heading→bold
paragraph outside the Cx Plan tier) **or dropped and counted** — and a write
whose normalization drops content it cannot represent **refuses with the
count named** (the patcher's count-mismatch law at the door). What is stored
is only ever the subset.

### 2.2 The trio — `api/_shared/rich-text.ts`

| Renderer | Output | Consumers | Refusal |
|---|---|---|---|
| `richToHtml(doc)` | HTML span/p/ul/ol/li/strong/em only | screen read views, PDF paths (`discussionHtml`'s successor; `blocksToHtml` para expansion), portal | unknown node → **throw by node name** |
| `richToBlocks(doc)` | docx-skeleton `Block[]` (`para`/`bullet`/`heading`, runs with bold/italic `rPr`) for the Cx Plan; `<p>/<ul>` HTML for the html-to-docx family (which then rides the fixed-grid patcher unchanged) | both docx lineages | same |
| `toPlainText(doc)` | bullets → `- ` lines, paragraphs → line breaks, emphasis dropped | **the verifier (Phase 1 — see 2.3)**, summaries/truncations, dashboards, *the future Procore payload* | same |

All three built and battery-asserted in Phase 1. `p()` in docx-skeleton gains
run support (bold/italic inside a paragraph) — an additive change to the
injection module, gated by the existing skeleton assertions plus new
fixture-twin legs. **Ordered lists in the Cx Plan docx need a numbering-style
check**: `STYLE_FOR.bullet` exists; whether the skeleton's `numbering.xml`
carries a decimal list style is a build-time question — if absent, the
skeleton regenerates via `build-skeleton.mjs` (its no-client-strings assertion
re-run), a deliberate skeleton edit, flagged now (Q3).

### 2.3 The AI-drafting answer (the measured recommendation)

**The writer keeps emitting text; the boundary lifts it.** Concretely: the
writer's contract gains a *markdown-lite subset* (paragraphs, `- ` bullets,
`1.` ordered, `**bold**`, `*italic*` — nothing else), and the draft endpoint
lifts it deterministically (`@tiptap/markdown`'s parse, constrained to the
whitelist, unknown syntax left as literal text) into the stored JSON.

*Why not JSON-direct from the model:*

- **The verifier's span mechanism is string-quoting against prose**
  (`flags[].span: string`). JSON-direct would break it or force span-paths.
  Under text+lift, **the verifier verifies `toPlainText(lifted)`** — which
  makes the trio's third renderer *load-bearing in Phase 1*, not speculative:
  the pre-answered Procore question is answered by the verifier needing the
  same projection today.
- **The extraction Phase-1 law** (strict schema, fail loud at the boundary)
  would demand a full ProseMirror-JSON grammar in the tool schema; a model
  writing raw ProseMirror invites unknown-node refusals at exactly the moment
  a CxA is waiting for a draft. A five-token markdown subset is the smaller,
  checkable contract.
- **The cross-check is cheap and mechanical**: assert
  `toPlainText(lift(text)) ≈ text` (whitespace-normalized) at the boundary —
  a lift that loses content refuses before anything is stored.

### 2.4 Storage and migration — the F1 shape, per surface

Each adopted surface gains one column: `*_rich jsonb` (null = legacy row)
beside the untouched text column. Readers go JSON-first with legacy fallback;
**untouched rows render byte-identically** (the F1 gate, asserted per phase).
Writes from the new editor fill **both**: the JSON, and the legacy column via
`toPlainText` — so every raw reader anywhere, present or future, keeps
working, and the legacy column stops being "old data" and becomes *the plain
projection, maintained by the trio*. (This is the five-consumer problem's
general answer: consumers that cannot speak JSON read a projection that is
never stale.) No backfill: legacy rows lift lazily on first edit, at the
door, counted.

### 2.5 The ladder, phased and gated

| Phase | Surface | Ships | Gate |
|---|---|---|---|
| **1** | Cx Plan | The trio + schema module + pins + render-twins; `cx_plan_sections.rich jsonb` (drafted + final); editor in `CxPlanPage`; writer contract markdown-lite + lift; verifier on `toPlainText`; assembly expands JSON → Blocks (paragraphs finally separate; bullets real); snapshots carry the JSON; zip-reader touch-policy conversion in `pw-cx-plan` | Render-twins byte-stable; the F2-class flattener dead (a two-paragraph + bulleted section prints as such in docx AND PDF, pinned in raw XML per the `w:br` idiom); untouched plans byte-identical; lift round-trip asserted; battery green |
| **2** | Issues log | `findings.description_rich` (+ `corrective_action_rich`); editor **+ expand shell** (shipped without the shell — the gap Amendment 1 names; retrofit rides Phase 3); the three dash-bullet rows normalize at door; `generate-report` issues table via `richToHtml`; portal decision executed (Q6) | Legacy findings byte-identical in reports; portal anti-drift green in whichever shape Q6 rules; `toPlainText` asserted as the summary/truncation source |
| **3** | Meetings | `meeting_items.discussion_rich`; the expand modal becomes the TipTap editor (same one-draft-two-views shape), **expand control visible at rest** (the W1 door law — measured hover-gated on the deployed build 2026-08-20); `discussionHtml` demoted to legacy fallback; carry copies the JSON; dash-counter retired with the §1.1 baseline noted; **+ the Amendment 1 retrofit: expand shell onto both Issues-log editors** (description + corrective, create + edit) | KEEL's F2 legs stay green (the `w:br` pin now proves the fallback); a bulleted discussion prints bulleted in both formats; Action Summary truncates the plain projection; both Issues-log editors expand/collapse without losing a draft; meetings expand visible-at-rest asserted (bounding box rendered, not hover-conjured) |
| **4** | Site reports | `progress_narrative_rich`; the `split('\n')` renderer demoted to fallback; **editor + expand shell as one package** (Amendment 1) | Same shape as 3 |

**Amendment 1 (owner, 2026-08-20, on field evidence from the Issues log).**
The expand shell and the rich editor are **one package** — every surface that
adopts rich text gets both: compact inline + ⤢ expand-to-full-size, one draft
state, two views. The ladder's per-phase "editor" deliverable reads "editor +
expand shell" from this date. Phase 2 shipped the Issues-log editors without
the shell — a CxA writing a long deficiency description with bullets is
exactly the user the full-size editor exists for — and that gap is the reason
this amendment exists; the retrofit rides Phase 3. Companion field finding,
measured on the deployed build before the Phase 3 build began: the meetings ⤢
was **present-but-hidden** (rendered 16×11, `opacity: 0` at rest, revealed
only by hovering the discussion cell itself — not even the row), birth-form
since KEEL's F2, not a regression. The W1 door law applies: a control must
look like a control — expand controls render visibly at rest on every
rich-text surface.

**Exclusions restated as ruled**: IST content (S1001 bytes untouchable),
checklist template items, tags/descriptors/labels, anything extraction or
`ilike` reads, §4.4 evidence strings. Equipment notes plain until asked twice.

---

## 3. The eight questions — recommendations, and the rulings

**All eight ruled 2026-08-20.** Original text kept; rulings appended. Q6 is a
departure, owner-vetoable, veto path banked in place.

**Q1 · AI emission: markdown-lite + deterministic lift (recommended), or
JSON-direct from the model?**
→ **Text + lift.** Reasons measured in §2.3: the verifier's string spans
survive, the tool contract stays small and refusable, the round-trip is
mechanically assertable, and the trio's `toPlainText` becomes load-bearing on
day one. *JSON-direct's honest case:* no lift layer to maintain — but it buys
that by putting a ProseMirror grammar inside an AI contract, which is the
larger surface.

> **RULED — text + lift, as recommended.** The verifier's string-span
> mechanism is decisive. The writer's contract gains the five-token
> markdown-lite subset; the lift is deterministic, whitelist-constrained,
> unknown syntax left literal; **the round-trip assertion
> (toPlainText(lift(text)) ≈ text, whitespace-normalized) is a boundary
> REFUSAL, not a log line** — a lift that loses content refuses before
> storage.

**Q2 · Where is the whitelist enforced — boundary only, or also a DB
constraint?**
→ **Boundary normalization + battery, no DB trigger.** A jsonb CHECK deep
enough to validate a node tree is a stored procedure pretending to be a
constraint; the door function is one auditable body, and the trio's
unknown-node refusals catch anything that somehow lands. *The compromise
available if ruled:* a shallow CHECK (`doc.type = 'doc'`) as a tripwire.

> **RULED — boundary + battery, PLUS the shallow tripwire ships:** the
> doc.type = 'doc' CHECK validates nothing deep — it exists so a
> catastrophically wrong write (a string, an array, someone's HTML) dies at
> the table instead of at the first render. The door function remains the
> real whitelist; the trio's unknown-node refusals remain the net.

**Q3 · Ordered lists in the Cx Plan docx — if the skeleton lacks a decimal
numbering style, do we regenerate the skeleton?**
→ **Yes, as its own commit** via `build-skeleton.mjs` with its
no-client-strings assertion, before Phase 1's renderer lands. Rule 4 note:
issued plans keep their bytes; the skeleton edit affects future generates
only.

> **RULED — yes.** Skeleton regenerates if the decimal numbering style is
> absent: own commit, build-skeleton.mjs with its no-client-strings assertion
> re-run, before the renderer lands. Rule 4 stands — issued plans keep their
> bytes; the edit reaches future generates only.

**Q4 · The editor chrome** — which controls render?
→ **Exactly the schema**: B, I, bullets, ordered; Cx Plan tier adds H2/H3.
No color pickers, no tables, nothing the door would strip — a control that
inserts what storage refuses is a lie in button form.

> **RULED — chrome = schema exactly; the Cx Plan tier adds H2/H3. Promoted
> to the pattern record verbatim:** *a control that inserts what storage
> refuses is a lie in button form.*

**Q5 · The upgrade gate for the pins?**
→ **Render-twin fixtures** (§1.5): bump-pins commits must show the twin diff
or byte-stability. A pin bump that changes no twin is still its own commit
(the deliberate-step ruling), just a boring one.

> **RULED — render-twin upgrade gate as designed.** A pin bump that changes
> no twin is still its own commit; a boring diff is still the record.

**Q6 · Does `description_rich` join the portal whitelist at Phase 2?**
→ **Yes, both modes in one migration, rendered through the shared
`richToHtml`** — the client already receives the full description text, so
structure adds no information, only fidelity; the anti-drift leg extends to
the new column. *The alternative:* the portal keeps receiving only the plain
projection (`description` stays the whitelisted column, now
trio-maintained) — zero portal changes, slightly stale-looking bullets. If
the owner prefers zero portal motion this arc, the alternative is safe and
reversible.

> **RULED — DEPARTURE, owner-vetoable: the portal keeps the plain projection
> this arc.** description stays the whitelisted column, now trio-maintained
> and never stale; description_rich does NOT join the whitelist at Phase 2.
> Zero portal-RLS motion; anti-drift legs unchanged. **The banked reversal
> path:** one migration + richToHtml through the strict-side shim, its own
> future ruling on evidence (a client legibility ask, or the owner's word).
> **If the owner strikes this ruling, the recommendation executes instead** —
> both modes, one migration, anti-drift extended.

**Q7 · Phase 3's fold of the banked (b): confirm the dash-counter's
retirement baseline as measured** (0 meetings / 3 findings / 0 elsewhere),
with the three findings normalizing at their own phase's door?
→ **Yes as stated.** Nothing else to retire — production never adopted the
convention.

> **RULED — confirmed as measured.** The dash-counter retires at baseline
> **0 / 3 / 0**; the three findings normalize at Phase 2's door, counted in
> the migration note; the banked (b) entry folds at Phase 3 with this
> baseline cited.

**Q8 · Sequencing.**
→ **Strictly 1→2→3→4; the trio and pins land only inside Phase 1; each phase
is its own battery-gated commit series** under the tree-hash guard. No
cross-arc collisions: the ladder touches none of the extraction, portal-RLS,
or Cx-Index-export files except the two generators, whose changes ride the
per-phase gates. Stop-and-show stands for anything that would touch ratified
document content — nothing in this design does; snapshots and issued
artifacts keep their bytes everywhere.

> **RULED — strict 1→2→3→4; trio and pins inside Phase 1 only; per-phase
> battery-gated series under the tree-hash guard; stop-and-show on anything
> nearing ratified bytes — which, per §4, nothing does.**

---

## 4. What this proposal will not do

- **It will not store HTML.** JSON in, trio out; HTML is always derived.
- **It will not let paste smuggle the web in.** The door normalizes to the
  subset or refuses with the drop count named.
- **It will not touch a ratified byte**: snapshots, issued plans, issued
  minutes, S1001 content — untouched rows and artifacts render identically,
  asserted per phase.
- **It will not build the Procore integration.** It builds the projection
  that integration will consume, and proves it in the battery from Phase 1.
- **It will not float versions.** Exact pins, deliberate bumps, twin-diffed.
