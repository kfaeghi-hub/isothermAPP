# Cx Plan Composer + Firm Knowledge Layer — proposal (2026-07-26)

**Status: ✅ AS-BUILT 2026-07-27.** All decisions ruled (D1a, D2, D3b, D4, D5,
D6, D7) and §13 accepted. Shipped across six commits; gate `pw-cx-plan.mjs`
25/25, battery 20/20. As-built detail: ARCHITECTURE "Cx Plan Composer" and
"The Firm Knowledge Layer".

> **Real-call smoke: ✅ PASSED 2026-07-27.** `ANTHROPIC_API_KEY` set; one real
> drafting call plus its verification call, both live against `claude-sonnet-5`.
> Prose returned (260 chars, correct voice and the ruled `Commissioning
> Authority (CxA)`), the adversarial pass returned **2 flags**, and
> `ai_generations` incremented 2 → 4.
>
> **Measured cost per section: ~4.6¢** (draft ~3.8-4.2¢ at ~8.7k input tokens,
> verify ~0.7-0.8¢ at ~0.6-0.8k). Four narrative sections on a standard plan is
> roughly **19¢ per full draft pass**. The draft call dominates because the whole
> corpus is its system prompt — that is the cost of firm knowledge living in
> documents rather than weights, and it is the right trade at this scale.
>
> Two defects were found getting here, both fail-closed and both legible from the
> server log in one look: `temperature` is rejected outright by the current models
> (`400 — deprecated for this model`), and Vercel bakes env vars into a deployment
> at build time, so the key needed a redeploy to take effect.

## As-built notes from the first human calibration run (2026-07-27)

**The two-call design worked on its first outing.** On the Background section the
verification pass flagged *"Isotherm Engineering Ltd."* as **contradicting the
supplied facts** — the ZZ-TEST matrix seats the sister entity *Isotherm
Commissioning Ltd.*, and the drafting model followed the corpus's identity over
the facts it was given. That is exactly the failure the adversarial second call
exists to catch: a claim that is plausible, house-style-correct, and wrong for
this project. It was caught, surfaced beside the facts, and left for the CxA to
rule on. Recorded because it is the design's first real evidence, not a hope.

**Roles and Responsibilities failed to draft** — truncation, diagnosed from
`ai_generations` alone: two draft calls at exactly 1200 output tokens (the flat
ceiling) with no verification call after either, because the JSON was cut off
mid-object. Fixed as a class rather than an instance: per-section token budgets
(Roles is the only section whose length scales with the team matrix, and the
claims array roughly doubles every section's output), truncation raised as its
own error distinct from a parse failure, one automatic retry for the parse cases
only, the raw response always logged server-side, and an inline retryable error
in the UI instead of an alert with an OK button.

---

Calibrated against the three real plans, copied out of ShareSync into gitignored
`samples/cx-plans/` and analysed locally (`extract.mjs`): **Humber** and
**Mulock** (standard tier, both .docx) and **Seneca** (tender tier, PDF). No
client content reaches this repo; what follows is structure, conventions and our
own firm boilerplate rendered as merge fields.

---

## 0. What the three documents actually proved

The audit hypothesis in the brief holds, and the evidence sharpens it.

**One shared master, drifting.** Humber and Mulock share paragraph-for-paragraph
boilerplate — but not identically. The Roles-and-Responsibilities preamble says
the same thing in two different word orders:

> *Humber:* "The Specifications and contract document describe and explain the roles and responsibilities of those participating in the commissioning process."
> *Mulock:* "Descriptions and explanations of the roles and responsibilities of those participating in the commissioning process are described in the specifications."

Two copies of one paragraph, edited independently. **That drift is the argument
for the composer** — not efficiency, correctness. Today every new plan starts as
a copy of the last one and inherits whatever the last one happened to say.

**The role designation is genuinely unsettled — settle it before migrating.**
Across our own three plans:

| Document | Text |
|---|---|
| Mulock | "the independent Commissioning **Agent (CxA)**" |
| Seneca | "the Commissioning **Authority (CxA)**" (×8) |
| Humber | "the independent Commissioning **Provider (CxP)**" |

**`CxA` expands to two different words in our own documents.** This is not a
schema question yet — it is a firm-vocabulary question, and §5 asks the wrong
thing until it is answered. See **D1**.

**Seneca already has manual merge fields.** Page 4 carries a literal
`[Insert GFA]` placeholder in an issued-for-tender document. The composer is
formalising something already being done by hand, badly.

**The appendix menu is almost entirely our own live records.** Seneca's twelve
appendices map like this:

| Appendix | What it is today | In the app |
|---|---|---|
| A Commissioning Index | Cx Index matrix | **live** |
| B OPR & LEED Boundary | uploaded document | reference |
| C Basis of Design | uploaded document | reference |
| D Project Specifications | uploaded document | reference |
| E Commissioned Systems | equipment/systems register | **live** |
| F Cx Document Reviews | — | reference |
| G Cx Submittal Review | — | reference |
| **H Commissioning Issues Log** | the Issues Log | **live** |
| I Construction Checklists | checklist engine | **live** |
| J Functional Testing Procedures | FPT | future |
| K Cx Meeting Minutes | meetings module | **live** |
| L Owner Training | training records | reference |

Six of twelve are records this system already maintains. That is why the brief's
"titled references to the living records, never embedded stale" is right, and it
is worth stating as a principle: **the plan points at the register; it does not
photograph it.**

**Seneca says the plan is a living document** — "It will be revised and reissued
at key milestones—including pre-construction, mid-construction…". The revision
model in §7 is not an invention; it is written into the document already.

---

## 1. The Firm Knowledge Layer

### 1.1 Shape

```
firm-knowledge/                     ← versioned in the repo, reviewable in PRs
  identity.md                       firm facts: since 1975, services, how we run projects
  style-card.md                     the writing rules (see §1.3)
  terminology.md                    rulings + controlled vocabulary
  domain-rules.md                   seeded from EXTRACTION-PLAYBOOK's applicable rules
  procedures/                       procedure-bullet library, keyed by system
    _index.json                     system key → bullet ids, admin-editable
    hvac-ahu.md · hydronic.md · electrical.md · life-safety.md · tab.md …
  exemplars/
    cx-plan-standard.md             skeleton + our boilerplate, merge-fielded
    cx-plan-tender.md               the extended chapters
  contracts/
    cx-plan.md                      per-feature contract (see §6)
    fpt.md · polish.md · summarize.md   (stubs — future features)
```

`api/_shared/ai-common.ts` — **the doc-common of AI**:

```ts
buildContext({ feature, project, slices })   // assembles the context payload
callModel({ system, messages, maxTokens })   // the ONE Anthropic call site
logGeneration({ feature, projectId, tokens, costCents, model })
```

**Two rules recorded in ARCHITECTURE as the standing AI architecture:**

1. **Firm knowledge lives in documents, never in weights.** No fine-tuning, ever.
   Everything the model knows about Isotherm arrives as context it can be shown,
   audited, corrected, and diffed in a PR.
2. **Every AI feature reads `ai-common`. No feature carries a private prompt that
   duplicates corpus content.** The moment two features each hold their own copy
   of the style rules, they drift — the same argument that put the portal column
   whitelists in `portal_internal` and the document palette in `DOC`. This
   codebase has now made that mistake's inverse three times; the pattern is
   established.

### 1.2 Why files and not a table

The corpus is *edited by us, reviewed like code, and versioned with the app that
consumes it*. A migration to change a style rule would be absurd; a PR is exactly
right. Two exceptions become DB rows because a non-developer must edit them
between deploys: **procedure bullets** (admin-editable per §0) and **ratified
corrections** awaiting merge. Both are read by `ai-common` and merged over the
file corpus at assembly time, with the file as the base.

### 1.3 The extracted style card

Derived from the three plans. Every rule below is a pattern I can point at in the
source, not a preference:

```
PERSON & VOICE
  - Third person throughout. The firm is named, never "we": "Isotherm Engineering
    Ltd. (Isotherm), as the independent Commissioning …, has been retained by …".
  - First mention of the firm is the full legal name with the short form in
    parentheses; thereafter "Isotherm".
  - The client is "(the Client)" on first mention, then by name or "the Client".

MODAL DISCIPLINE  (this is the one that matters most)
  - "shall" = a contractual obligation on another party.
      "Appendices shall contain acquired sequence documentation, logs, …"
  - "will" = what Isotherm intends to do.
      "Isotherm will develop commissioning protocols for approval by the Client"
  - "is/are" = statements of fact about the project or the document.
  - Never "should", never "must", never "may" for obligations.

SENTENCE DISCIPLINE
  - One idea per sentence. Median sentence in the samples is 22-28 words.
  - No sentence opens with a conjunction.
  - Lists carry the actor in parentheses when responsibility shifts:
      "Pipe flushing and cleaning (by the contractors)"
      "Functional Performance Testing (FPT) by Isotherm"
    This convention is load-bearing — it is how the document assigns work.

SPELLING & FORM
  - Canadian: -our (behaviour, colour), -re (centre), -ise/-ize per Oxford (-ize).
  - Dates ISO: 2025-02-24. Never "Feb 24, 2025".
  - Abbreviations defined on first use with the full term first:
      "Functional Performance Testing (FPT)", "Owner's Project Requirements (OPR)".
  - "Cx" is never expanded mid-document after the title block.

STRUCTURE
  - Every H1 opens with a prose paragraph before any list. No orphan headings.
  - Tables are introduced by a sentence that names them:
      "The commissioning team is detailed in the table below:"
  - Bullets are noun phrases or imperative fragments, not sentences; no terminal
    period unless the bullet is a full sentence.

NEVER
  - Marketing language. No "cutting-edge", "world-class", "seamless" as a claim.
    (Note: the samples DO contain "state-of-the-art" and "seamless operation" —
    these are the drift the style card exists to stop, not precedent to follow.)
  - Claims about performance the commissioning has not yet verified.
  - Any number, date, name or quantity not present in the supplied facts.
```

That last NEVER is the seam between the style card and §2's verification pass.

### 1.4 The corrections pipeline

Review-screen edits are captured as `{section, before, after, project}`. A
periodic job clusters them; a cluster of ≥3 similar edits becomes a **proposed
corpus addition** in an admin screen with the evidence attached. **Tony ratifies;
nothing self-modifies.** Ratified additions land as a PR to `firm-knowledge/`.
This is the EXTRACTION-PLAYBOOK loop generalised — that document grew to 26 rules
exactly this way.

---

## 2. Section inventory — B / D / N tagged

**B** = boilerplate (parameterised, deterministic) · **D** = data (from the DB) ·
**N** = narrative (AI-drafted from questionnaire facts)

### Standard tier — the shared Humber/Mulock master

| § | Section | Tag | Source |
|---|---|---|---|
| — | Cover: title, project, doc number, Rev, date, developed-by | **D** | project + document row |
| — | Contents | **B** | Word TOC field, self-updating |
| 1 | Executive Summary | **B+N** | boilerplate frame; scope clause is N |
| 2 | Project Overview | | |
| 2.1 | Background | **N** | questionnaire: what / where / why |
| 2.2 | Commissioning Plan | **B** | verbatim boilerplate + the 5-bullet list |
| 3 | Commissioning Team | **B+D** | preamble B (verbatim in both samples); **table = team matrix verbatim** |
| 4 | Roles and Responsibilities | **B+N** | frame B; per-party lines N from the matrix |
| 5 | Commissioning Process Overview | **N** | questionnaire: kickoff, approvals, meetings |
| 6 | Installation and (Startup) Testing Procedures | **B+D** | **procedure library**, pre-selected by system |
| 7 | Operational Testing | **N+D** | narrative + FPT/training lines |
| 8 | *Training for O&M Staff* | **B** | **optional** — Mulock only |
| 9 | *Project Coordination* | **B** | **optional** — Mulock only |
| 10 | Documentation and Deliverables | **B+D** | boilerplate + submittals register (D) |
| 11 | Conclusion | **B** | boilerplate |
| 12 | Appendix | **D** | appendix menu → titled references |

*Heading drift to resolve:* Humber says "Installation and Testing Procedures",
Mulock says "Installation and Startup Testing Procedures". **Pick one.** (D2)

### Tender tier — Seneca's additional chapters

| § | Section | Tag | Notes |
|---|---|---|---|
| 1 | Introduction (1.1 description · 1.2 purpose · 1.3 · 1.4) | **N+B** | replaces Executive Summary; richer |
| 4 | Commissioning Process and Roles & Responsibilities | **B+N** | merged chapter, ASHRAE Guideline 0 framing |
| **5** | **Commissioning Execution Procedures** | **B+D** | tender-only |
| **6** | **Integrated Life Safety Systems Testing** | **B+N** | tender-only |
| **7** | **Testing, Adjusting and Balancing** | **B+N** | tender-only |
| **8** | **Commissioning Schedule** | **N+D** | tender-only |
| 9 | Documentation and Reporting | **B+D** | extended |
| **10** | **Quality Assurance** | **B** | tender-only |
| 11 | Appendix (A–L) | **D** | twelve, six of them live records |

**The tender tier is the standard tier plus five chapters**, not a different
document. That is what makes one section library workable.

---

## 3. Template-injection assessment (§4) — recommend **(b)**, and it is viable

I opened the .docx skeletons. The evidence is decisive:

| Skeleton asset | Humber | Consequence |
|---|---|---|
| Real Word styles | **157 style IDs** incl. `Heading1–9`, `TOC1–9`, `Title`, `Bullet1-ABC`, `CellHeading-ABC` | Rebuilding these in HTML→docx is a large, lossy project |
| `numbering.xml` | **present** | Multi-level list numbering already defined |
| Headers/footers | **4 headers, 4 footers** (section-varying) | Cover vs body vs appendix chrome |
| **TOC field** | **present** (`fldChar`) | A genuine field that self-updates on open |

**Option (a) — rebuild in the HTML→docx generator: reject.** `html-to-docx`
produces its own minimal styles. Reproducing 157 styles, multi-level numbering,
four header/footer pairs and a real TOC field through an HTML intermediate is a
project in itself, and the result would be an approximation forever.

**Option (b) — inject into a real .docx skeleton: recommend.** The insight that
makes it cheap: **we do not need to generate Word XML, only paragraphs that
reference styles the skeleton already defines.** The skeleton is ours, authored
once in Word:

1. Open the skeleton (it is a zip).
2. Leave `styles.xml`, `numbering.xml`, `header*.xml`, `footer*.xml`,
   `settings.xml` **untouched**.
3. Replace the body region of `word/document.xml` between two sentinel
   paragraphs with generated `<w:p w:pStyle="Heading1">…` runs.
4. Rezip.

The TOC field survives untouched and updates on open. Output is native because it
*is* native.

**Cost:** a `docx-skeleton.ts` module — zip read/write plus XML escaping and a
small paragraph builder (~200 lines). No new dependency beyond a zip writer.
**Risk:** content control. Generated text must be XML-escaped and style IDs must
exist in the skeleton — both assertable in tests.

**Consequence to accept:** this is a **second** docx mechanism alongside
`html-to-docx` (reports/minutes/checklists). Justified: those are generated
tables; this is a long-form styled document with a TOC. They are different
problems. Recorded so nobody later "unifies" them.

**PDF:** renders from the same assembly through the established Puppeteer stack
with the converged purple identity (`DOC`), so the two outputs cannot diverge in
content.

---

## 4. Schema delta

```sql
-- Project-level, reusable beyond the composer
alter table projects
  add column cx_role_designation text,          -- see D1 before migrating
  add column background_description text;       -- portal hero + Final Report reuse

create table cx_plans (                          -- one per project, revisable
  id uuid pk, project_id uuid not null,
  tier text not null check (tier in ('standard','tender')),
  revision_index int not null default 0,         -- 0,1,2 → "Rev 0","Rev 1"
  revision_label text,                           -- "Issued for Tender"
  status text not null default 'draft'
    check (status in ('draft','approved','issued')),
  approved_at timestamptz, approved_by uuid,
  issued_at timestamptz, storage_url text, pdf_url text,
  deliverable_id uuid,                           -- links the composed "Cx Plan" row
  org_id uuid default '…0001',                   -- rule 17
  created_at, updated_at
);

create table cx_plan_answers (                   -- questionnaire, persists per project
  id uuid pk, project_id uuid not null,
  document_type text not null default 'cx_plan', -- reusable by FPT/Final Report
  question_key text not null, answer jsonb not null,
  updated_at, updated_by, org_id,
  unique (project_id, document_type, question_key)
);

create table cx_plan_sections (                  -- the per-section working state
  id uuid pk, plan_id uuid not null,
  section_key text not null, ordinal int not null,
  kind text not null check (kind in ('boilerplate','data','narrative')),
  drafted_text text,        -- what the model produced
  final_text text,          -- what the CxA approved (edits land here)
  accepted boolean not null default false,
  flags jsonb,              -- verification-pass output
  regenerate_note text,     -- the per-section steering note
  org_id, unique (plan_id, section_key)
);

create table cx_plan_snapshots (                 -- rule 4: what was represented, when
  id uuid pk, plan_id uuid not null, revision_index int not null,
  answers jsonb not null, sections jsonb not null,
  knowledge_version text not null,               -- corpus git SHA
  model text, taken_at timestamptz, org_id
);

create table ai_generations (                    -- cost + audit, all features
  id uuid pk, feature text not null, project_id uuid,
  model text, input_tokens int, output_tokens int, cost_cents numeric,
  created_by uuid, created_at, org_id
);
```

`cx_plan_answers` is keyed by `document_type` deliberately: FPT generation and
the Final Report will ask overlapping questions, and the CxA should answer
"what/where/why" **once per project**.

---

## 5. The wizard, screen by screen

| # | Screen | Content |
|---|---|---|
| 1 | **Tier** | Standard / Tender, **suggested from classification** (tender when the project carries a tender/spec classification), overridable with the reason shown |
| 2 | **Background facts** | Three one-liners: *what is being built · where · why now*. Pre-filled from `projects.background_description` and the classification. Structured fields, never "write a paragraph" |
| 3 | **Systems & procedures** | Systems pre-checked from project trades + equipment register. Under each, procedure-library bullets **pre-selected per system**, individually toggleable. Add-your-own writes to the correction queue |
| 4 | **Options** | Training · Project Coordination · Schedule chapter · (tender) ILS testing · TAB · QA. Each maps to an optional section from §2 |
| 5 | **Appendix menu** | The twelve, pre-ticked by what the project actually has. Each renders as a **titled reference to the living record**, not an embed |
| 6 | **Draft + verification** | Progress per section; verification flags appear inline as they land |
| 7 | **Review** | See §7 |
| 8 | **Approve → Generate** | Explicit. Disabled until every section is accepted |

No screen asks for prose. Every question is a fact, a toggle, or a choice.

---

## 6. The AI contract

**Two calls, both server-side** (`api/ai-draft-section`, staff-only via
`requireUser` + role gate, key in Vercel env, every call logged to
`ai_generations`).

### Call 1 — draft

```
SYSTEM = firm-knowledge/identity.md
       + firm-knowledge/style-card.md
       + firm-knowledge/terminology.md
       + contracts/cx-plan.md
       + the exemplar section (same section, from the tier's exemplar)

USER   = { section_key, section_intent,
           facts: { …questionnaire answers, project data, systems, team… },
           constraints: [
             "Use ONLY the facts provided. If a fact is absent, omit the claim —
              never estimate, never generalise, never write a placeholder.",
             "Do not restate the team table; it is rendered deterministically.",
             "N sentences, M words max." ] }

RETURN = { prose: string, claims: [ { text, supported_by: fact_key } ] }
```

The model is **required to enumerate its own claims and cite the fact key for
each**. That is what makes call 2 cheap and precise.

### Call 2 — adversarial verification (a separate call, different framing)

```
SYSTEM = "You are verifying a commissioning document for factual support.
          You did not write this text. Assume it contains errors."
USER   = { prose, facts }
RETURN = { flags: [ { span, claim, severity: 'unsupported'|'contradicted'|'vague',
                      why } ] }
```

Deliberately a **second call with no memory of drafting** — a model asked to
check its own output in the same context agrees with itself. Flags render as
highlights (§7). **Flags do not block**; the CxA rules on each.

**The deterministic layer never appears in either call.** The team table, systems
list, deliverables and header are assembled from the DB and injected after the
prose returns. The model is never in a position to invent a name, a date or a
company — it is not given the opportunity, which is stronger than instructing it
not to.

---

## 7. The review screen

```
┌─ 2.1 Background ──────────────────────── [Accept] [Regenerate ▾] ─┐
│                                                                    │
│  FACTS USED                    │  DRAFT                            │
│  ───────────────────           │  ──────                           │
│  what   New central plant      │  The commissioning project        │
│         mechanical room        │  entails installing new HVAC and  │
│  where  Humber College,        │  mechanical systems to replace    │
│         North campus           │  and enhance the existing         │
│  why    Replace end-of-life    │  infrastructure in ⟨the central   │
│         boilers                │  plant⟩. Systems served include   │
│  systems  boilers, pumps,      │  ⟨cooling coil, condensing unit,  │
│         expansion tank, HX     │  heat exchanger, pumps⟩.          │
│                                │                                   │
│  ⚠ 1 flag                      │  ⟨⟩ = flagged span                │
│  "end-of-life" — not in facts  │                                   │
│  [dismiss] [edit]              │                                   │
└────────────────────────────────────────────────────────────────────┘
                                  [ Regenerate with a note… ]
                                  ┌──────────────────────────────┐
                                  │ mention the glycol loop      │
                                  │            [Cancel] [Redraft]│
                                  └──────────────────────────────┘
```

- **Facts beside prose, always.** The reviewer checks the text against what it was
  given, not against memory.
- **Per-section** accept / edit / regenerate-with-note. A note redrafts **only
  that section**; nothing else moves.
- **Edits are captured** for the corrections pipeline (§1.4).
- **Approve is explicit and disabled until every section is accepted.** There is
  no auto-approval path — not a setting, not a flag. `cx_plans.status` must be
  `approved` before generation, asserted server-side, and tested.

---

## 8. Revision model (§7)

From the samples' own conventions: `Rev 0` → `Rev 1` → `Rev 2`, with an optional
label such as **"Issued for Tender"** (Seneca's filename and cover both carry it).

- One `cx_plans` row per project, `revision_index` incrementing.
- `draft` → `approved` → `issued`. **Issued is frozen** (rule 4): the file, plus
  a `cx_plan_snapshots` row holding the answers, the AI drafts, the human edits
  and **the knowledge-corpus git SHA**.
- Revising creates `revision_index + 1` seeded from the previous answers. **Rev 1
  diffs against what Rev 0 actually said** — including which corpus version
  produced it. A dispute years later shows what was represented and when.
- The composed deliverable row "Cx Plan" **links to the document**; it does not
  track status in parallel.

**Placement:** own tab, **"Cx Plan"**, after Deliverables. Not inside
Deliverables — a deliverable is a tracked obligation, this is a document with a
wizard and a review workflow. The deliverable row links to it.

---

## 9. Decisions required

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | **Role designation vocabulary.** Our three plans say Agent(CxA), Authority(CxA) and Provider(CxP) — `CxA` has two expansions | (a) `CxA = Commissioning Authority` + `CxP = Commissioning Provider`, retire "Agent" · (b) keep all three · (c) something else | **(a)**, and record "Agent" as retired in terminology.md. But this is **your call on firm vocabulary**, and I will not migrate a column until it is made |
| **D2** | §6 heading | "Installation and Testing Procedures" (Humber) vs "…and Startup Testing…" (Mulock) | **Mulock's** — startup is a distinct activity and the longer heading says so |
| **D3** | Template injection | (a) rebuild in HTML→docx · **(b) inject into a real skeleton** | **(b)** — assessed viable in §3; you accept a second docx mechanism |
| **D4** | Corpus location | repo files · DB rows · hybrid | **Hybrid**: files as base, DB for procedure bullets + pending corrections |
| **D5** | Standard-tier optional sections | Always include Training + Coordination · offer as toggles | **Toggles** (screen 4) — Humber omitted both deliberately |
| **D6** | Who may compose/approve | owner+lead · any member · owner only | **Owner+lead** to approve; any member may draft |
| **D7** | Exemplars in the corpus | full text of the three plans · merge-fielded skeletons only | **Skeletons only.** Full client documents in a repo-tracked corpus would breach the ShareSync rule; the merge-fielded version is our own content |

---

## 10. Not building (§8, confirmed)

Freeform chat inside the pipeline · vector/RAG infrastructure (the corpus slices
deterministically at three-exemplar scale — §9A) · auto-approval paths ·
fine-tuning of any kind · a second parallel status tracker for the deliverable.

---

## 11. Test plan (§9)

ZZ-TEST fixture through the full flow, mocked AI by default with one real-call
manual smoke:

- wizard with fixture answers → mocked draft → **verification flags render** →
  per-section regenerate changes only that section → approve → generate → issue →
  revise, with the **snapshot diff asserted**
- **deterministic sections asserted EXACTLY against fixture state** — the team
  table compared field-by-field against the matrix, the way pw-portal compares
  account vs link columns
- **unapproved drafts cannot generate** — asserted server-side by status code
- endpoint **unreachable by client/portal roles**, asserted by **error code**
- `ai_generations` row written per call, with cost
- full battery green

---

## 12. Docs on completion (§10, per the standing rule)

ARCHITECTURE: the Firm Knowledge Layer as the standing AI architecture + the
composer as-built · Build Spec §1A/§3: new entities and the module · MASTER-BRIEF
§4/§10 · **this document flipped to as-built**.

---

## 13. One thing I would push back on

The brief says the questionnaire holds "facts that exist only in the CxA's
head". Screen 2's three one-liners are right, but **`background_description`
should be a project field the CxA maintains anyway** — the portal hero wants it,
the Final Report will want it, and asking for it inside a document wizard buries
it in a document. Proposed: the wizard *edits the project field* rather than
storing a plan-local copy, and the field is also editable from project settings.
Same data, one home. Flagged rather than assumed, since it slightly widens §5.
