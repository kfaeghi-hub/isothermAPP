# Back-burner

The parked-features register. Everything the firm has decided to build **but not
yet** — each with enough spec to restart cold, and the condition that wakes it.

This shelf used to live in the owner's chat with the architect. That is why a
session could open with an empty queue while real work sat parked: the register
existed, but only in a conversation. It lives here now.

**Two exits, and only two.** An item leaves this file by being **woken** — moved
into the active queue with its wake condition met — or by being **shipped**, at
which point its entry moves to [RELEASES.md](RELEASES.md). Nothing is deleted
quietly; a parked item that turns out to be wrong is marked **dropped** with the
reason, because the reasoning is the part worth keeping.

**Maintained under the standing docs rule** — updated in the same commit series
as the work that changes it, like every other doc in this repo.

**Status vocabulary:** `IN PROGRESS` · `PARKED` · `GATED` (blocked on a named
decision or fix) · `WAITING` (blocked on evidence or an event) · `DROPPED`.

---

## In progress — tonight's trio

**Scope note (corrected 2026-08-02).** This shelf holds **parked builds only**.
Owner ratification queues are not shelf items — they live in-app and are worked
there, not scheduled here. See the residue note at the bottom.

### 1. Suggestion-as-you-type type picker
**PARKED → starts tonight**

The equipment type field becomes the existing collision-aware Combobox over the
type vocabulary, ranked live by the **shared `resolveType`** (the B1 export —
never a second matcher) against display names plus a new admin-editable alias
list. Selecting a match types the unit on the spot; no match above the bar offers
*"No matching type — propose '⟨typed text⟩'"*, which **saves the unit anyway**
with `observed_type_name` and files a deduped queue entry with a waiting-unit
count. One picker in all three surfaces: Cx Index add form, inline editor, intake
review.

**Wakes when:** now.

### 2. AI-drafted starter field sets on mint
**PARKED → starts after 1**

On ratifying a mint, offer **Draft field set**: a new agent category drafts the
nameplate table in the campaign's exact format (field · unit · spec/shop/
installed), reviewed inline — edit, cut, approve — before any def is seeded.
Contract carries the campaign discipline: field-worthy not exhaustive, identity
via `__base` never duplicated, ruled Ontario unit convention. Proposes, never
writes; mint-with-base-only stays available.

**Wakes when:** after item 1.

### 3. Schedule-page finder
**PARKED → starts after 2**

Intake accepts a whole drawing-set PDF and proposes the candidate schedule pages:
deterministic filter first where the text layer allows (tabular density, schedule
keywords up; plan sheets out), AI classification only where ambiguous or scanned.
A confirmation screen names the sheets; **only confirmed pages extract**. Batch
provenance records source sheet numbers per row; the pre-extracted-pages path is
unchanged.

**Wakes when:** after item 2.

---

## Parked

### 4. Units — approach B, dual display with auto-conversion
**PARKED**

Store canonical, enter in either system, display both: `225 GPM (14.2 L/s)`. A
quantity/dimension model, a unit-aware numeric input, and every nameplate render
plus **every document generator** changes. Approaches C (per-project unit system)
and A (per-field override) shipped in 1.01 and cover the working cases.

**Why deferred, and the reason is stronger than cost:** existing numbers have no
recorded **unit of entry** — only the def's label at the time. Canonical storage
requires asserting that everything already stored is in the def's unit, which is
precisely the assumption the units work exists because it is false. Any migration
is a guess dressed as a conversion. B is the correct destination and the wrong
retrofit.

**Wakes when:** C+A have enough live use to say whether the exception rate
justifies it — and, critically, when enough nameplate values carry a *recorded*
entry unit that a migration is a conversion rather than a guess. Revisit informed
by what C+A actually taught us, not by the original argument.
Full reasoning: [UNITS-METRIC-IMPERIAL-PROPOSAL.md](UNITS-METRIC-IMPERIAL-PROPOSAL.md).

### 5. FPT agent
**WAITING**

The seventh agent contract: functional performance testing. Reads the sequence of
operations and the installed points, proposes test steps and expected results
against the design intent. Sits in the same architecture as the existing six
(`analyst` · `classifier` · `extractor` · `librarian` · `verifier` · `writer`) —
one brain via `ai-common`, tier 1, proposes and never writes.

**Wakes when:** the first project nears functional testing. Building it before
there is a real FPT to check it against would produce a contract validated only
by its own assumptions.

### 6. Final Cx Report composer
**WAITING**

Assembles the closeout deliverable from the record the system already holds:
checklist completion, the findings register with resolution state, issued
documents, signoffs. Prose sections drafted by the `writer` agent against the
firm's voice; everything factual comes from the deterministic layer, never the
model — the Cx Plan composer's split.

**Wakes when:** the first project reaches closeout. Same reason as the FPT agent:
the first real one is the specification.

### 7. Start-Up campaign
**GATED**

Extraction and seeding of the Start-Up master forms, the last of the three
seeding campaigns. Roadmap position: MASTER-BRIEF §10, item 1.

**Two gates, both must clear before anything is extracted:**
- **(a)** the Word COM conversion fix for the remaining `.doc` source masters —
  a build task, mine.
- **(b)** the **startup-type decision** — `ChecklistType` is `ivc|pfc|fpt` today.
  Per EXTRACTION-PLAYBOOK R10/R11, start-up content embedded on a Static
  Verification sheet stays `ivc`. Decide whether Start-Up masters seed as a
  fourth type or fold into the existing rule. Owner's call, and it must be made
  *before* extraction, not discovered during it.

### 8. Per-type field-def enrichment
**WAITING**

The nameplate campaign seeded `panel` / `humidifier` / `radiant_panel` /
`unit_heater` tables and made surgical additions (`boiler` +Fluid Type, `pump`
+VFD, `fan` +MBH; `heat_pump` trimmed 25→14). The remaining types carry thinner
sets than field use will eventually want.

**Wakes when:** usage demands it — a specific type, named by a specific engineer,
with the field they could not record. Enriching speculatively is how `heat_pump`
got to 25 fields and needed trimming back to 14.

### 9. BAS / MBCx
**WAITING**

Point-list ingestion, normalization, and monitoring-based commissioning per
[BAS-SPEC.md](BAS-SPEC.md). Build order is BAS-SPEC §11; §10 names the seams
already deferred inside it. The largest parked item by far — a track, not a
feature.

**Wakes when:** the OCx season, or an awarded project that needs it. Not before
the checklist track's remaining campaigns land.

### 10. Graduated-autonomy promotions
**WAITING**

Every agent contract declares `autonomy_tier`; **every category is fixed at tier 1
(individually ratified), no other tier is implemented, and the runtime refuses a
contract claiming one.** Promotion of a category beyond individual ratification
requires a demonstrated acceptance track record in the health view, is ruled by
the owner, and is revoked by the same instrument if the rate slips.

**Categories touching the signed record are never promoted** — findings, issued
documents, the issues log, life-safety scope. Permanent exclusion, not a
threshold.

**Wakes when:** roughly 100 ratifications of health-view evidence exist for a
given category — enough that an acceptance rate means something. The evidence
base (the ledger, keyed by category) is built and accumulating; only the dial is
parked. Note the ledger-provenance rule: deterministic sweeps and owner rulings
do **not** feed `agent_feedback`, precisely so this track record stays honest.

---

## 11. The residue

Small, real, and deliberately not a backlog. Each is governed by a policy rather
than a queue position.

**Harness — ~150 instantaneous reads.** Reads not yet converted to bounded waits.
Governed by the standing touch-policy, ruled 2026-08-02: *instantaneous reads are
converted when their suite is next touched; new assertions use the wait helpers
from birth.* The four that actually cost battery runs, plus the delete-side
cousins, are already done. **Not a backlog item — do not schedule a sweep.**

**Portal email plumbing.** Steps 1–4 of [PORTAL-GOLIVE.md](PORTAL-GOLIVE.md) —
the mailer, template capture, and rendered-appearance verification. §0A of that
runbook goes live on **share links alone with no mailer**, which is a legitimate
and arguably better first outing for a read-only viewer. *Wakes when:* the first
external user needs an attributable account rather than a link.

**Owner queues live in-app, not here** — proposed types and applicability
proposals are ratification surfaces the owner works in the product. They are
never shelf entries; a queue with a screen does not need a register.

**Gray-on-color punch items.** UI instances that render gray text on a tinted
field, against the standing rule (tinted field + same-hue text, e.g.
`bg-green-50 text-green-700`, never gray-on-color — ARCHITECTURE §UI). Collected
on the UI punch-list; fixed as their screens are next touched, same policy shape
as the harness reads.
