# Agent Architecture + Cx Index Upgrade — PROPOSAL

**Status: RULED 2026-07-27 — all seven decisions taken. Build in progress.**

| Step | State |
|---|---|
| **0a** registry + runtime + composer refactor | **COMPLETE** — `pw-cx-plan` 30/30 incl. real-AI |
| 0b ledger · 0c librarian | not started |
| A1-A4 · B1-B3 | not started |

Rulings: **D1** orthogonal overlay, `na` deprecated in place, taken now ·
**D2** `ai_generations` absorbs, BAS-SPEC struck with a dated note ·
**D3** `firm_corrections` = librarian proposals, `agent_feedback` = ledger ·
**D4** front-mattered `.md` · **D5** the feature contract stays above the agent
split — features compose agents, reference never duplicate · **D6** on-demand
harvest, revisit trigger recorded (≥2 agents actively feeding) · **D7(b)**
classifier proposes fire-integration from the register cold.

Formalises the AI layer as **one brain, many agents, one keeper**, then implements
applicability/filtering/search (Part A) and mass intake (Part B) as the first
agents under it.

---

## 0 · Three findings that change the design before it starts

### F1 — `na` already exists as a cell STATUS, and that blocks A5

`cx_cell_values.status` is CHECK-constrained to `('done','in_progress','na')`, and
Build Spec §4.0 documents exactly those four states (`na` plus blank).

**Applicability cannot be a status value.** A5 requires that marking a cell
not-applicable *never deletes a done cell* — but `status` holds one value, so
writing `na` over `done` destroys it. The two are different questions:

| Question | Axis |
|---|---|
| *Has this been done?* | `status` — blank / in_progress / done |
| *Does this apply to this unit at all?* | **applicability — a separate axis** |

**Proposal: applicability becomes an orthogonal sparse overlay** (§A-1), and the
existing `na` status is **deprecated in place** — kept readable, no longer
writable, with a one-time migration offering each existing `na` cell as a proposed
not-applicable overlay for ratification. There are currently **zero `na` cells in
production**, so the migration is free today and expensive later. This is the
cheapest moment it will ever be.

### F2 — two AI telemetry tables are specced; only one is built

| Table | State | Origin |
|---|---|---|
| `ai_generations` | **built**, 4 rows, feature/model/tokens/cost | composer |
| `ai_analysis_runs` + `ai_candidate_findings` | **specced, unbuilt** | BAS-SPEC §3.7-3.8 |

Two logs for the same fact is the drift this architecture exists to prevent.
**Proposal: `ai_generations` wins and becomes the agent-run log** (it exists, it
carries real cost data, and every call already goes through one call site). It
gains `agent_key`, `run_id`, `input_ref`, `outcome`. `ai_analysis_runs` is
**superseded and struck from BAS-SPEC** with a dated note; `ai_candidate_findings`
survives as the *analyst's* ratification queue — one queue among several, not the
general mechanism.

### F3 — `firm_corrections` exists, empty, and is the ledger's ancestor

Shape: `scope · proposed · evidence jsonb · status · ratified_at · ratified_by`.
That is already the harvest-proposal shape. **Proposal: `firm_corrections` becomes
the Librarian's *proposal* table** (its intended job), and a new
`agent_feedback` table becomes the *ledger* that feeds it. The composer's §1.4
pipeline — specced, never built — is implemented as this ledger's first client
rather than as a separate mechanism.

---

## PART 0 — THE AGENT ARCHITECTURE

### 0.1 The registry — `firm-knowledge/agents/<key>.md`

One contract file per agent. Front-matter is machine-read by the runtime; the
prose below it is written for a human and is never sent to a model.

```yaml
---
key: classifier
purpose: Propose applicability rules and per-unit exceptions for a Cx Index.
slices: [identity, terminology, domain-rules]      # corpus slices, ai-common §Slice
budget_class: reasoning                            # reasoning | prose | extraction
input_schema: ClassifierInput                      # typed, validated before the call
output_schema: ClassifierProposal                  # typed, validated after — fail-closed
review_surface: cx_applicability_proposals         # where its output lands for a human
verifier: none                                     # or an agent key; see law 5
cost_expectation: "~12-18c per project register (one call per ~80 units)"
---
```

**Budget classes** — the generation-budget lesson generalised. `max_tokens` is a
*total generation budget including reasoning*, and the right ceiling is a property
of the task shape, not a number a caller invents:

| Class | Ceiling | Shape |
|---|---|---|
| `reasoning` | 16k | Compares many things against many rules. Classifier, verifier, analyst, librarian. |
| `prose` | 10k | Writes a few hundred words under a style card. Writer. |
| `extraction` | 8k / page | Transcribes structure. Extractor. Scales per page, not per document. |

**Seed set** (six files):

| Agent | Purpose | Class | Review surface |
|---|---|---|---|
| `writer` | Composer narrative — **refactor of the existing `cx-plan.md`** | prose | Cx Plan review screen |
| `verifier` | The adversarial pass; isolation stated as registry law | reasoning | flags on the review screen |
| `classifier` | Part A — applicability rules + exceptions | reasoning | `cx_applicability_proposals` |
| `extractor` | Part B — schedules/diagrams → rows (**`equipment-extract.md` stub already exists**) | extraction | intake review screen |
| `analyst` | **stub** — BAS-2 candidate findings | reasoning | `ai_candidate_findings` |
| `librarian` | §0.3 — corpus keeper | reasoning | `firm_corrections` |

The existing `cx-plan.md` contract **splits**: the drafting half becomes
`writer.md`, the verification half becomes `verifier.md`. Its §"What the model
NEVER sees" survives verbatim in `writer.md` — that clause is the strongest
guarantee in the system and does not get rewritten.

### 0.2 `ai-common` becomes the agent runtime

```ts
runAgent(agentKey, input, ctx) → { ok, value?, failure?, usage }
```

1. Resolve the contract (cached at cold start, like the corpus).
2. **Validate `input` against `input_schema` — fail before spending a token.**
3. Assemble context from the declared slices only. An agent cannot read a slice it
   did not declare.
4. Apply the budget class ceiling.
5. Call through the single existing call site.
6. **Validate output against `output_schema`; fail closed on shape mismatch**, with
   the raw response logged server-side (the verification lesson: a check that
   cannot fail is not a check).
7. Log to `ai_generations` with `agent_key` — **cost reads per specialist**.

**No feature calls the model outside `runAgent`.** Enforced by test: a repo scan
asserting `callModel` has exactly one caller (`runAgent`).

### 0.3 The Librarian

Faces the agents, not the projects.

**The ledger — `agent_feedback`.** Every review surface writes here when a human
touches an agent's output:

| Agent | Signal captured |
|---|---|
| writer | draft accepted verbatim vs edited (before/after) |
| verifier | flag confirmed vs dismissed |
| extractor | row accepted vs edited vs rejected |
| classifier | rule ratified vs adjusted vs rejected; exception overridden |
| any | ratification-queue outcome |

**The harvest.** On demand or scheduled, the librarian reads the ledger, clusters
by `(agent_key, scope)`, and where **≥3 similar corrections** exist drafts a
proposed corpus change with its evidence attached — style-card rule, terminology
entry, procedure bullet, applicability refinement, extraction heuristic.
Proposals land in `firm_corrections` for ratification. On approval:

- **file-side** changes (style card, terminology, contracts) → a **versioned,
  attributed PR to `firm-knowledge/`**
- **DB-side** changes (procedure bullets, applicability rules) → a row write

**The librarian proposes; it never writes to the brain.** It is itself an agent
under the same laws — including law 6.

**The health view** (admin surface): corpus version · pending proposals ·
**per-agent correction rate over time** (a falling edit-rate is the system
learning, and it is the only honest measure of it) · per-agent cost.

### 0.4 Universal laws — ARCHITECTURE, written once

1. Every agent reads the brain through `ai-common`; no private prompts.
2. **Every agent proposes; none writes.** All output lands in a human
   ratification or review surface.
3. Corrections feed the corpus through the ledger — never by hand-editing a
   prompt.
4. Budgets are per class; parse failures fail closed with the raw logged.
5. **The verifier never shares context with what it verifies.**
6. **No agent self-modifies — the librarian included.**
7. Nothing autonomous touches the record. Findings, cells, documents and corpus
   changes all carry a human approval.
8. *(added)* **Tag strings never decide type or applicability** — the `RP` lesson
   promoted from equipment to a universal law: on one project `RP` was a radiant
   panel on the mechanical drawings and a receptacle panel on the electrical.

---

## PART A — APPLICABILITY, FILTERING, SEARCH

### A-1 · Schema — a sparse overlay, orthogonal to status

```sql
create table cx_cell_applicability (
  id uuid primary key,
  project_id uuid not null,
  equipment_id uuid not null,
  column_id uuid not null,
  applicable boolean not null default false,   -- rows exist ONLY to say "not applicable"
  source text not null check (source in ('rule','manual')),
  rule_id uuid references cx_applicability_rules(id),
  note text,
  set_by uuid, set_at timestamptz,
  import_batch_id uuid,
  unique (equipment_id, column_id)
);
```

**Only deviations are stored.** Absent row = applicable. A 367-unit × 88-column
index is 32,296 logical cells; Seneca's overlay will hold a few thousand rows at
most.

```sql
create table cx_applicability_rules (
  id uuid primary key, org_id uuid,
  equipment_type text references equipment_types(key),  -- firm-level, keyed to the vocabulary
  stage_group_name text not null,        -- by NAME, not id: rules are firm-level, groups are per-project
  column_label text,                     -- null = the whole stage group; set = a per-column exception
  applicable boolean not null,
  rationale text,
  active boolean default true,
  ratified_by uuid, ratified_at timestamptz
);
```

**Rules key on `equipment_type` + stage-group *name*.** Groups are per-project
rows; names are the firm's stable vocabulary. Keying on name is what lets Seneca
teach a rule that Humber inherits.

### A-2 · Precedence — stated explicitly, in order

```
1. manual override      (source='manual')   — always wins, never auto-cleared
2. ratified column exception  (rule with column_label set)
3. ratified stage-group rule  (rule with column_label null)
4. default: applicable
```

**Re-applying rules only ever touches `source='rule'` rows.** A manual override is
immune to rule changes — that is the whole point of it, and it is enforced by the
`source` column rather than by care.

### A-3 · Progress math — honest denominators

```
denominator = applicable cells in scope
            = (units × columns in scope) − not-applicable overlay rows in scope
numerator   = cells with status='done' AND applicable
```

**Done-on-later-N/A'd** (A5): a `done` cell whose applicability is revoked is
**excluded from both numerator and denominator** — otherwise the ratio can exceed
100% — but the cell **still renders**, struck-through with a "was completed, now
not applicable" marker. Never deleted. This is the one state the UI must show that
the arithmetic ignores.

### A-4 · The classifier's proposal flow — rules first

Input: the register (tag, category, type, descriptor) + the project's stage
groups/columns. **Never the tag string alone** (law 8).

Output:

```ts
{ rules: [ { equipment_type, stage_group, column?, applicable,
             rationale, confidence, units_affected } ],
  exceptions: [ { tag, column, applicable, rationale, confidence } ] }
```

**Fire-integration is explicitly separated.** Its believed life-safety-connected
set — fire/smoke dampers, fire pump, stair pressurization, generator/ATS,
smoke-control fans — is proposed as the **IST-applicable list** and rendered as its
own review block, because a wrong answer there is a life-safety scope error, not a
tidiness error.

**Ratification UX** — the burden scales with *types*, never units:

```
┌─ Proposed applicability — Seneca (367 units, 22 types) ─────────────┐
│  RULES (11)                                     ratify all │ review │
│  ─────────────────────────────────────────────────────────────────  │
│  ▸ fcu          IST                    not applicable    113 units  │
│                 Electrical Testing     not applicable    113 units  │
│    "Fan coils carry no life-safety interlock and are not…"  ✓ ratify│
│  ▸ panel        Mechanical Static      not applicable     26 units  │
│  ▸ ats          IST                    APPLICABLE          5 units  │
│    ⚠ LIFE-SAFETY SCOPE — read this one                              │
│  ─────────────────────────────────────────────────────────────────  │
│  EXCEPTIONS (7)                        confidence-sorted, low first │
│  ▸ AHU-3   Plumbing/Domestic   n/a   0.62  "no domestic water conn" │
└─────────────────────────────────────────────────────────────────────┘
```

**Target: all 367 Seneca units settled in one sub-15-minute session.** 11 rule
clicks + 7 exception judgements.

### A-5 · Search + filtering — pure UI, ships first

Independent of every agent, so it lands before anything AI touches the index:

- **find-by-tag** with jump-and-highlight
- **filters**: type · category · stage-group state (*"shop drawings outstanding"*)
  · applicability
- **the per-unit panel** — click a unit, see its applicable stages and their
  states in one column: *"what's still needed"*
- mobile per the Wave 3 patterns (cards below `lg`, no horizontal page scroll)

### A-6 · Integrity

Applicability is **member-visible, owner/lead-editable**, batch-tagged when set by
a ratified proposal. Manual overrides win. Rule re-application preserves them.
N/A never deletes.

---

## PART B — MASS INTAKE

### B-1 · Schema

```sql
create table intake_uploads (
  id uuid primary key, project_id uuid not null,
  filename text not null, storage_url text not null,   -- private bucket, signed reads
  kind text check (kind in ('excel','pdf','image')),
  pages int, status text default 'uploaded',
  uploaded_by uuid, uploaded_at timestamptz,
  import_batch_id uuid
);

create table intake_rows (
  id uuid primary key, upload_id uuid not null,
  source_page int, source_row int,
  tag text, descriptor text,
  proposed_category text, proposed_type text references equipment_types(key),
  location text, area_served text, nameplate jsonb,
  confidence numeric(4,3),
  disposition text default 'pending'
    check (disposition in ('pending','accepted','edited','rejected')),
  match_equipment_id uuid references equipment(id),   -- set ⇒ this is an ENRICH proposal
  edited jsonb,                                        -- the human's version, if edited
  resolved_by uuid, resolved_at timestamptz
);
```

### B-2 · Extraction — deterministic first

**Clean Excel never reaches a model.** Header detection + column mapping is the
same parser class already proven against 33 Seneca schedules. PDFs and images go
to the `extractor` agent, one call per page (`extraction` budget class).

**Confidence bands, and the honest posture (B-5):**

| Source | Expected accuracy | Review effort |
|---|---|---|
| Typed Excel schedule | deterministic — no model | spot-check |
| Typed PDF schedule | **high** (~0.85-0.95) | bulk-accept the body |
| Scanned/photographed page | **medium** (~0.6-0.8) | row-by-row |
| Single-line diagram | **lowest** (~0.4-0.6) | every row read |

Single-lines extract the gear they show — panels, transformers, ATS, switchgear,
disconnects — **at low confidence by construction**, because a single-line is a
topology drawing, not a schedule.

**Law 8 is the extractor's first constraint**: the schedule's own descriptor and
column context drive the type proposal. A tag string alone never does. Ambiguity
lands low-confidence; it is never guessed. (EXTRACTION-PLAYBOOK R16 — *quarantine,
never guess* — already firm law; this inherits it.)

### B-3 · The intake review screen — nothing writes before it

```
┌─ Intake — Seneca · "BP6 Mechanical Schedules.pdf" · 214 rows ───────┐
│  ⚠ 12 low-confidence   ✎ 31 enrich   ⧉ 2 duplicate   ✓ 169 clean   │
│  [ accept all ≥0.85 (169) ]                    sort: confidence ▲   │
│  ─────────────────────────────────────────────────────────────────  │
│  0.42  p7 r12  │ tag SWBD-?   │ desc "SWITCHBOARD"  │ type ?        │
│                 └ unknown type → proposed-types queue   ✎ ✓ ✗      │
│  0.61  p3 r44  │ AHU-6        │ "AIR HANDLING UNIT" │ ahu           │
│  ─── ENRICH ───────────────────────────────────────────────────────  │
│  0.94  p2 r08  │ AHU-1  EXISTS │ location: — → "L2 MPH"   [diff] ✓  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Three dispositions**: accept · edit-then-accept · reject.
- **Unknown types route to the existing `proposed_equipment_types` queue** — never
  silent minting (the FK already makes that structural).
- **Existing tags become enrich proposals with a diff shown; never overwrite** —
  the directory-import standard.
- **In-upload duplicate tags flagged** before approval, not after.
- **Bulk-accept the high-confidence body**: a clean 200-row schedule is a
  two-minute review.

### B-4 · On approval

Batch-tagged writes (`import_batches`, `file_attachments` included — now the tenth
provenance table) through the **API path with the resolve-and-refuse guard**.
Equipment rows and index presence are created, and **Part A's ratified rules apply
automatically**, so intake lands with honest denominators and a live *"what's still
needed"* — only genuinely new types and exceptions surfacing for a human.

**Idempotent: re-uploading the same schedule proposes zero rows.**

---

## Schemas — summary

| Table | Part | Purpose |
|---|---|---|
| `cx_cell_applicability` | A | sparse not-applicable overlay |
| `cx_applicability_rules` | A | firm-level type × stage-group rules |
| `cx_applicability_proposals` | A | classifier ratification queue |
| `intake_uploads` · `intake_rows` | B | mass intake |
| `agent_feedback` | 0 | the ledger |
| `ai_generations` **+ agent_key, run_id, outcome** | 0 | one agent-run log |
| `firm_corrections` *(exists, empty)* | 0 | librarian proposals |

---

## Build split

| Step | Contents | Gate |
|---|---|---|
| **0a** | Registry + `runAgent` + contract validation; **composer refactored onto it** | `pw-cx-plan` green **before anything new exists** — the refactor proves itself |
| **0b** | `agent_feedback` ledger + writes from the composer review screen | ledger writes from ≥2 surfaces |
| **0c** | Librarian skeleton + `firm_corrections` queue + health view | one harvest on seeded feedback → a proposal |
| **A1** | **Search + filter + per-unit panel (pure UI, no AI)** | ships first, useful immediately |
| **A2** | Applicability schema + manual override + progress math | fixture arithmetic on ZZ-TEST |
| **A3** | Rules + admin editor + precedence | rule-change-preserves-override |
| **A4** | Classifier + ratification UX | mocked + one real-AI smoke |
| **B1** | Upload + deterministic Excel path | no model involved |
| **B2** | Extractor + intake review screen | fixture xlsx **and an image render of it** |
| **B3** | Approval writes + rule application + idempotency | re-upload proposes zero |

**A1 before A2 deliberately**: search and filtering are the highest-value,
lowest-risk work in this brief and depend on nothing.

---

## Decisions needed

| # | Decision |
|---|---|
| **D1** | **F1** — applicability as an orthogonal overlay, `na` status deprecated in place? (Recommended; free today, expensive later.) |
| **D2** | **F2** — `ai_generations` absorbs `ai_analysis_runs`; BAS-SPEC struck with a dated note? |
| **D3** | **F3** — `firm_corrections` becomes the librarian's proposal table; new `agent_feedback` is the ledger? |
| **D4** | Registry as front-mattered `.md` in `firm-knowledge/agents/`, or a TS module with the prose in `.md` beside it? (Recommend `.md` — the corpus is reviewable in a PR, and that is rule 1.) |
| **D5** | Does the `writer`/`verifier` split retire `contracts/cx-plan.md`, or does it stay as a feature-level contract *above* the two agent contracts? |
| **D6** | Librarian harvest: on-demand only, or scheduled (weekly) with a digest? |
| **D7** | Fire-integration list — ratify my proposed set as the seed, or start empty and let the classifier propose from the register? |
