# TYPING-TRIO-PROPOSAL.md — Update 1.02

**Status: PROPOSED 2026-08-02.** Three items, built and gated separately in order.
Flip to as-built with a departures table when the third ships.

The through-line: **typing a unit should cost one keystroke sequence, and never
block a save.** 1.01 made the vocabulary a learning system on the *import* path;
this makes it a learning system on the *typing* path, then teaches it to draft its
own field sets, then lets it find its own schedule pages.

---

## The constraint that shapes all three: the 12-function ceiling

`api/` holds **exactly 12 serverless functions today — the Vercel ceiling.** A
13th builds cleanly and then fails at "Deploying outputs" (ARCHITECTURE records
the incident). Items 2 and 3 both need an agent call.

**Proposed: neither adds a function.** Both route through `api/intake.ts`, which
already owns the extractor call and the equipment-intelligence domain, via its
existing action router:

| New call | Route |
|---|---|
| Schedule-page finder (item 3) | `api/intake.ts?action=find-pages` |
| Field-set drafter (item 2) | `api/intake.ts?action=draft-field-set` |

The drafter is a mild semantic stretch — it serves the type vocabulary, not an
upload. It is still the right call: the ceiling is physical, and the alternative
tonight is a refactor of the four live portal endpoints.

**The clean long-term fix goes to BACKBURNER, not tonight:** fold
`portal-invite` / `portal-link` / `portal-redeem` / `portal-share-link` into one
`api/portal.ts` action router, freeing three slots. That touches live
security-sensitive paths and deserves its own session with its own gates.

---

## Item 1 — Suggestion-as-you-type type picker

### Schema deltas

| Delta | Why |
|---|---|
| **`equipment_type_aliases`** — new table: `id · org_id · type_key → equipment_types(key) on delete cascade · alias text · created_at`, unique on `lower(alias)` | Aliases are **vocabulary data, not code**. Admin-editable beside the types on the Classifications screen, so shorthand can be added without a deploy. |
| **`equipment.observed_type_name text`** — new column | The never-blocked save needs somewhere to put the typed text. `intake_rows` has this column already; `equipment` does **not** — verified against the live register, not recalled. |
| **Partial unique index** on `proposed_equipment_types (org_id, lower(observed_name)) where status = 'proposed'` | Dedup is app-level only today (a `Set` in `api/intake.ts`). Two users proposing "Force Flow Heater" in the same minute both get a row. The index makes dedup a database fact. |

**No waiting-unit counter column.** The count is derived —
`count(equipment) where observed_type_name = q.observed_name and equipment_type
is null`. A stored counter drifts the moment a unit is typed by another path; a
derived one cannot lie.

### The matcher — one, not two

`resolveType` (exported from `src/lib/intakeExcel.ts`, the B1 path) stays the
single matcher. It gains **alias resolution as a new highest-priority tier**:

1. exact match on `alias` (normalized) → that key, confidence 1.0
2. exact match on `name` or `key` → that key, confidence 1.0
3. all-words, most-specific-wins → existing behaviour, existing confidence
4. no match → `null`

Aliases resolve by **exact match only, never all-words** — "UH" can never
all-words-match "Unit Heater", and treating shorthand as a word-bag is how a
two-letter string starts claiming units.

`TypeVocab` widens to `{ key, name, aliases?: string[] }`. The intake path passes
aliases too, so the import and typing paths cannot diverge.

### The alias seed list

Proposed. **Cautious by default — a wrong alias types units silently, which is
the failure mode this whole vocabulary exists to prevent.**

| Type | Seed aliases |
|---|---|
| `ahu` | AHU, Air Handler |
| `ats` | ATS |
| `chiller` | CHLR |
| `convector` | CONV |
| `cooling_tower` | Cooling Twr |
| `erv` | ERV |
| `expansion_tank` | XT, ET, Exp Tank |
| `fan` | EF, SF, RF |
| `fcu` | FCU |
| `generator` | GEN |
| `heat_pump` | HP, ASHP, WSHP |
| `humidifier` | HUM |
| `panel` | PNL, Panelboard |
| `pump` | HWP, CHWP, CWP, Circ Pump |
| `unit_heater` | UH |
| `vav` | VAV Box |
| `wall_fin` | Fin Tube, FTR |
| `boiler`, `radiant_panel` | *(none — see below)* |

**Deliberately NOT seeded, each for a stated reason:**

- **`RP` → `radiant_panel`. Never.** This is the exact collision the vocabulary
  was built around — RADIANT CEILING PANEL vs RECEPTACLE PANEL. Seeding `RP`
  would re-import the original bug as a feature.
- **`CT` → `cooling_tower`** — `CT` is *current transformer* on the electrical
  side of the same drawing set.
- **`CH`, `P`, `WF`** — one or two characters that collide with tag prefixes.
- **`RTU` → `ahu`**, **`HRV` → `erv`**, **`VRF` → `heat_pump`** — these are
  arguably *distinct equipment*, not shorthand. They belong in the mint queue for
  a ruling, not in an alias list that decides silently. **Held for your ruling.**

### UX shape

One component, `TypePicker`, wrapping the existing collision-aware `Combobox`
(`src/components/ui/Combobox.tsx`), used in **all three surfaces**: the Cx Index
add form, the inline editor, and the intake review screen.

- Ranked live as you type: alias hits first, then exact, then all-words, each row
  showing the display name and — where it matched by alias — the alias that hit.
- Selecting a match **types the unit immediately**: defs resolve and applicability
  applies on the spot, no save round-trip.
- No match → a final dropdown row: **"No matching type — propose '⟨typed text⟩'"**.
  Choosing it **saves the unit** with `observed_type_name` set and
  `equipment_type` null, and files a deduped `proposed_equipment_types` entry
  carrying the waiting-unit count. **The save is never blocked** — an unknown
  type is a vocabulary gap, not a data-entry error.
- Ledger-fed **from birth**: dispositions post to `agent_feedback` under a new
  category. Per the ledger-provenance rule, only agent-originated proposals feed
  it — a human picking from the list is not a proposal.
- The librarian may later propose **alias additions** from observed-name patterns
  (an existing `proposal_categories` extension, not new machinery).

---

## Item 2 — AI-drafted starter field sets on mint

### The new agent contract

`firm-knowledge/agents/drafter.md`:

```yaml
key: drafter
purpose: Draft a starter nameplate field set for a newly minted equipment type.
slices: [identity, terminology, domain-rules]
budget_class: prose
max_tokens: 10000
input_schema: FieldSetDraftInput
output_schema: FieldSetDraftOutput
review_surface: equipment_type_field_defs
verifier: none
autonomy_tier: 1
proposal_categories: [field-def-set]
cost_expectation: "~2-4c per mint; one call, one type"
```

**`prose`, not `reasoning` — this is the latency lesson applied.** The classifier
burned 16,000 thinking tokens and returned zero text when asked an unbounded
question. "Draft 10–15 nameplate fields for one named type" has a natural floor,
so it gets the class sized for a bounded write. If measurement says otherwise the
class moves — but it is chosen from the shape of the question, per Law 4, never
from a caller.

**Law 9 pre-applied:** `FieldSetDraftInput` carries the type key, its display
name, the `__base` field names (so the drafter can *exclude* rather than
rediscover them), the ruled unit convention, and a sample of sibling type tables.
A draft that must not duplicate `__base` cannot be asked for without being told
what `__base` holds.

### Contract discipline (in the contract body, not just the prompt)

- **Field-worthy, not exhaustive.** Target 10–15; fewer for passive emitters —
  a convector is not a chiller.
- **Identity comes from `__base` and is never duplicated** — no Manufacturer,
  Model, or Serial in a drafted table.
- **Ruled Ontario unit convention:** CFM / MBH / NPS beside metric temperatures
  and lengths. Both `unit` and `unit_imperial` are drafted.
- Output is the campaign's exact format: **field · unit · spec/shop/installed**.

### UX shape

On ratifying a mint in Classifications, a **Draft field set** button appears
beside the existing mint action. It drafts into an inline review table — **edit a
row, cut a row, approve** — and only on approve are `equipment_type_field_defs`
rows written. **Proposes, never writes.** Mint-with-base-only stays exactly where
it is; the drafter is an offer, not a step.

**No schema delta.** `equipment_type_field_defs` already carries `unit_imperial`.

---

## Item 3 — Schedule-page finder

### Schema deltas

| Delta | Why |
|---|---|
| **`intake_uploads.selected_pages int[]`** — new column | Records which pages the human confirmed. Without it, "we extracted 3 of 78 pages" is unreconstructable a month later. |
| *(none for row provenance)* | **`intake_rows` already has `source_sheet` and `source_page`** — verified live. Item 3 populates them properly rather than adding anything. |

### The pre-pass — deterministic first, AI only where it must be

1. **Text-layer filter, free.** Per page: tabular density (aligned numeric runs,
   repeated column geometry), schedule keywords up (`SCHEDULE`, `MARK`, `CFM`,
   `MBH`, `GPM`, `TAG`), plan-sheet markers down (`PLAN`, `SECTION`, `DETAIL`,
   large vector-to-text ratio). Confident on both sides of the line → decided,
   no model call.
2. **AI classification only for the ambiguous or scanned remainder** — pages the
   filter can't decide, and pages with no text layer at all. `extraction` budget
   class, per page, cost logged like every other call.
3. A **page-count ceiling** with a clear message rather than a silent truncation
   — *"This set has 340 pages; the finder scans the first N. Split the set or
   pre-extract the schedule pages."*

### UX shape

Confirmation screen: **"Sheets 41, 42, 44 look like schedules"** — sheet number,
title, and a thumbnail per candidate, each toggleable, plus a way to add a page
the finder missed. **Only confirmed pages extract.** Per-set cost is visible
before the extract runs, not after.

The existing pre-extracted-pages path is **unchanged** — drag in schedule pages
and nothing about tonight touches you.

---

## Gates (per item, all three)

Battery green · **render-and-look** (the picker on all three surfaces; the
finder's confirm screen) · `pw` legs — picker match **and** propose *including
the never-blocked save*; draft approve / edit / decline; finder
confirm-subset-extracts-only-subset · **wait helpers from birth** · the full
paper-trail surface per the standing rule · `docs/RELEASES.md` Update 1.02 in
both voices, same commit series.

---

## Held for your ruling

1. **`RTU` / `HRV` / `VRF`** — alias, or distinct types for the mint queue?
2. The rest of the seed list as tabled.
3. **The drafter's budget class** — `prose` on the reasoning above; say if you
   want it measured before it ships rather than after.
