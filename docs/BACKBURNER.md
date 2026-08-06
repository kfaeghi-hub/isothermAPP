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

## Shipped — the 1.02 trio and the catalog campaign

*The trio and the 19→47 catalog campaign are both complete and recorded in
[RELEASES.md](RELEASES.md) Update 1.03. These entries come off the shelf at the
next edit; kept one cycle so the set reads whole.*

**Scope note (corrected 2026-08-02).** This shelf holds **parked builds only**.
Owner ratification queues are not shelf items — they live in-app and are worked
there, not scheduled here. See the residue note at the bottom.

### 1. Suggestion-as-you-type type picker
**SHIPPED 2026-08-03 — entry moved to [RELEASES.md](RELEASES.md) Update 1.02**

*Kept here until the trio closes so the shelf reads as a set; removed when 1.02
is complete.*

The equipment type field becomes the existing collision-aware Combobox over the
type vocabulary, ranked live by the **shared `resolveType`** (the B1 export —
never a second matcher) against display names plus a new admin-editable alias
list. Selecting a match types the unit on the spot; no match above the bar offers
*"No matching type — propose '⟨typed text⟩'"*, which **saves the unit anyway**
with `observed_type_name` and files a deduped queue entry with a waiting-unit
count. One picker in all three surfaces: Cx Index add form, inline editor, intake
review.

**Woken and shipped.**

### 2. AI-drafted starter field sets on mint
**SHIPPED 2026-08-03 — entry moved to [RELEASES.md](RELEASES.md) Update 1.02**

On ratifying a mint, offer **Draft field set**: a new agent category drafts the
nameplate table in the campaign's exact format (field · unit · spec/shop/
installed), reviewed inline — edit, cut, approve — before any def is seeded.
Contract carries the campaign discipline: field-worthy not exhaustive, identity
via `__base` never duplicated, ruled Ontario unit convention. Proposes, never
writes; mint-with-base-only stays available.

**Woken and shipped.**

### 3. Schedule-page finder
**SHIPPED 2026-08-03 — entry moved to [RELEASES.md](RELEASES.md) Update 1.02**

Intake accepts a whole drawing-set PDF and proposes the candidate schedule pages:
deterministic filter first where the text layer allows (tabular density, schedule
keywords up; plan sheets out), AI classification only where ambiguous or scanned.
A confirmation screen names the sheets; **only confirmed pages extract**. Batch
provenance records source sheet numbers per row; the pre-extracted-pages path is
unchanged.

**Woken and shipped.**

---

## Parked

### 3b. Portal endpoint consolidation
**PARKED — born 2026-08-03**

Fold `portal-invite` / `portal-link` / `portal-redeem` / `portal-share-link` into
one `api/portal.ts` action router, freeing three of Vercel's twelve function
slots. `api/` is currently at 12 of 12, which is why both of 1.02's agent calls
route through `api/intake.ts` instead of taking a function each.

**Wakes when:** the next feature needs a function slot — or sooner, deliberately.
**Never as a side effect of a feature:** these are live security endpoints and
they get their own session with their own gates.

### 3e. The IST module — integrated systems testing, parked whole
**PARKED — born 2026-08-03, from the catalog campaign's IST addendum**

A project-level surface holding **scenario-based integration test records**: an
**initiating event × responding equipment matrix**, expected vs. observed per
cell, witnessed and dated, with deficiencies filing into the **existing findings
register** rather than a parallel one.

IST is a core firm service — Seneca carries an IST plan at rev 10 — and OBC
3.2.10.1 has made CAN/ULC-S1001 mandatory on new construction since 2020.

**Design notes, carried so the thinking is not re-derived:**

- **The Cx Index's fire-integration column stays the per-unit readiness tracker.**
  It is not superseded by this module and does not become part of it. That
  division is the standard's own line: **S1001 verifies the interconnections
  between two or more systems and explicitly does not verify the individual
  systems**, whose own verification is the prerequisite. Per-unit readiness is
  the Cx Index's job; the scenario matrix is this module's.
- **The scenario cell ties to [3d](#3d-repeating-measurement-test-structures).**
  Expected-vs-observed per cell, per test event, is the same repeating-measurement
  shape as per-tap TTR and NFPA 25 flow curves. One structure should serve all of
  them; building a bespoke cell store here would be the third copy.
- **Scenario drafting from the fire-alarm matrix is a future FPT-agent
  capability** — see [5](#5-fpt-agent). The initiating events and their expected
  responses are already stated in the fire alarm input/output matrix; deriving the
  scenario list from that document is agent work, and it waits for the same
  trigger the FPT agent does.
- **Foundation:** the S1001 research and the full ruling table live in
  [IST-CATALOG-ADDENDUM.md](IST-CATALOG-ADDENDUM.md), including the boundary
  rulings this module inherits — door holders, mag locks, elevator recall,
  load-bank connections and sprinkler supervisory devices are **not equipment
  rows**, and the reasoning for each is recorded there rather than left to be
  re-argued.

**Wakes when:** the first project schedules an IST — most likely Seneca. **No
code now.**

### 3f. Extraction-rules harvest — the librarian's next client
**WAITING — born 2026-08-04, from the extractor calibration campaign**

Self-training on the firm's own uploads. Review dispositions from real intake use
— accept / edit / reject per row, **already ledger-fed** — get clustered by the
**librarian** into proposed extraction rules. A recurring correction pattern
("this consultant's schedules put capacity in the description column", "this
office writes TAG as QTY NO.") becomes a corpus rule the **extractor** reads.

**Ratified by the owner, never auto-applied.** The librarian proposes; the corpus
changes only through the ratification queue, exactly as it does for terminology.
Nothing here weakens Law 2 or Law 6.

**Design notes, carried so the thinking is not re-derived:**

- **The data already exists.** Every intake review writes a disposition per row.
  What is missing is the harvest, not the instrumentation — the same shape as the
  corrections pipeline that produced the terminology proposals.
- **At volume, few-shot exemplars per drawing family.** The Cx Plan composer's
  exemplar pattern applied to schedules: our own *ratified* extractions become the
  examples a future extraction is shown, keyed by consultant or drawing family.
  This is the higher-value half and it needs volume first.
- **It closes a loop this campaign opened.** `unit_ventilator` was minted because
  the extractor read a real schedule and honestly said it did not recognise
  something. That is one correction becoming vocabulary by hand; this entry is
  the same motion, at pattern scale, for extraction itself.
- **The `QTY NO.` header variant is the founding case.** Workman p7 heads its
  identity column `QTY`/`NO.` rather than `TAG`/`MARK`; one instance did not
  justify widening the identity pattern by hand. A harvest that has seen the same
  shape across several sets is precisely what should justify it.

**Wakes when:** a few real project sets have been extracted *and reviewed*.

**The condition is now TICKING (2026-08-05).** The field test walked Clairlea and
Workman end to end, so ratified extractions and per-row dispositions exist for
real drawing sets as of today — the first genuine training data this entry was
waiting on. It is no longer waiting on *a kind of data*; it is waiting on
**enough of it**. Two or three more sets and the clusters become worth reading.

**No code now.**

### 3d. Repeating-measurement test structures
**PARKED — born 2026-08-03, from the catalog campaign's transformer table**

A structure for measurements that repeat **within one unit** — one row per tap,
per winding, per flow point — which a nameplate field cannot hold. The nameplate
answers "what is this machine"; these answer "what did it read, at each of N
settings", and forcing the second into the first corrupts the structure to
capture the standard.

**Founding case: per-tap turns ratio.** ANSI/NETA ATS requires a turns-ratio test
at *every* tap position, within 0.5% of nameplate. The drafter declined to emit
it as a field and was right: it is a table within the nameplate. `transformer`
records `Number of Taps` and `Tap Position (as set)` instead, and the per-tap
readings wait for this.

**Named siblings — one structure serves all of them:**
- per-winding insulation-resistance readings (NETA ATS)
- BECx sample test locations — see [3c](#3c-becx-assemblies-model), which is the
  same shape at building scale: "test location 3 of 8 passed"
- NFPA 25 fire-pump flow-test curves (churn, rated, 150% points)
- TAB readings per terminal, if the balancing track ever lands here

**Wakes when:** a project needs one of them for a real deliverable — most likely
the first electrical acceptance package or the first fire-pump annual. Building
it speculatively would produce a structure validated only by its own assumptions,
which is the same reasoning that parks the FPT agent.

### 3c. BECx assemblies model
**PARKED — born 2026-08-03, from the catalog campaign's research**

A register keyed by **assembly and test location**, not by tagged unit. The BECx
standards draw this line themselves: ASTM E1105/E783 test *installed windows,
doors and curtain walls* individually, but BECx tests a **sample** of openings —
the record wanted is "test location 3 of 8 passed", which an equipment row cannot
express. ASTM E1186 and ASHRAE's own air-barrier definition ("interconnected
materials, assemblies, and sealed joints and components") describe something
continuous. CSA Z320 lists architectural as its own system class.

**Do not force assemblies into equipment rows.** One envelope type is proposed
for the equipment table — `louver`, which is scheduled with marks on the
mechanical drawings and is genuinely a unit. Everything else waits for this.

**Wakes when:** an awarded project carries a real BECx scope. Envelope BECx is
already dormant in the deliverable model, so nothing is blocked by waiting.
Full reasoning: [EQUIPMENT-CATALOG-PROPOSAL.md](EQUIPMENT-CATALOG-PROPOSAL.md) Part D.

---

## Market-informed backlog

*Born 2026-08-05 from the competitive audit
([COMPETITIVE-AUDIT-2026-08.md](COMPETITIVE-AUDIT-2026-08.md), as-of 5 August
2026 — a snapshot, and snapshots rot; read its Caveats before acting on any
figure).*

**Each of these four is shipped by at least one incumbent** — 3g by Facility Grid
(Schedule Sync), Bluerithm (Gantt) and CxPlanner (MS Project import); 3h by
CxPlanner (issue markup on drawings) and Bluerithm 2.0 (issue pins + PDF markups);
3i by CxPlanner (photo/nameplate recognition) and CxAlloy (camera label-scanning);
3j by CxPlanner ("ask your specs"). That is what makes them backlog rather than
research: the shape is known, only the fit is ours to decide.

**Selected on fit, not parity.** The Build Spec's §6C framing survived the audit
and governs this section: *Isotherm's edge is fit — tailored to its exact forms
and workflow — not feature-parity with enterprise tools.* Each entry below is a
gap a real Isotherm workflow would feel, not a checkbox a comparison table would
want.

### 3g. Schedule sync + Gantt
**PARKED**

Import a construction schedule (Primavera P6 / MS Project) and place **Cx
activities against construction milestones** — so "boiler PFC" sits against
"boiler energization" rather than floating in a list. **Slippage surfaces on the
dashboard**: a Cx activity whose predecessor moved is the thing a CxA needs to
see without asking.

**Wakes when:** the checklist canon completes — **or immediately, if a GC hands
us a real schedule and asks.** The second trigger outranks the first: a real
schedule from a real GC is a specification, and building against it beats
building against an idea of it.

### 3h. Drawing-pin findings
**PARKED — absorbs Build Spec §6C's drawing-markup entry**

Pin a finding to a location on a floor plan or schematic: open the drawing, tap
the spot, create a finding linked to those coordinates; render the markups.

**This entry supersedes §6C's version** — the Build Spec keeps its roadmap note,
but the live spec lives here. §6C already named the cost honestly and it still
holds: *a real interactive sub-system* — large drawing PDFs, zoom/pan canvas, pin
coordinates stored against findings, markup rendering. **A focused build on its
own, not a feature bolted to the findings register.**

*Note the adjacency:* the drawing-handling machinery from the extractor campaign
(pdfjs rendering, page scans, region geometry in
[`src/lib/schedulePages.ts`](../src/lib/schedulePages.ts)) is the same neighbourhood.
Whoever builds this should read that first rather than starting from zero.

**Wakes when:** the checklist canon completes, or the first field request.

### 3i. Nameplate-photo OCR
**PARKED**

The extractor's **vision leg aimed at the plate on the machine**. A CxA
photographs a nameplate; the agent proposes **Installed-column values** — make,
model, serial, electrical data — for confirmation. It proposes; the CxA confirms.
Law 2 unchanged.

**It closes a loop the product already opened.** `__base` gives every unit
Manufacturer / Model / Serial in the Installed column, and F3's trigger now
guarantees the full template renders. This fills those fields from the thing
itself instead of from typing.

**Wakes when:** the extractor's field-hardening settles. Deliberately *after* —
the same vision path is still carrying one named unproven leg (reading a table
off a scan), and aiming it at a new target before that closes would confound two
questions.

### 3j. Spec / document Q&A
**PARKED**

An agent over the project's uploaded specifications: *"what does the spec require
for boiler startup?"*, answered with the citation. Read-only over project
documents.

**Wakes when:** the FPT campaign — same machinery neighbourhood. FPT scripts are
written against the sequence of operations and the specification, so an agent
that can find and cite spec language is a component of that work rather than a
detour from it. Building it separately would mean building it twice.

---

### Not backlogged, and the reason is the point

**Tier-3 enterprise items — SOC 2 / ISO 27001, SSO, public API, BIM/IFC,
multi-language — are deliberately absent from this shelf.**

They are **gated on a commercialization decision**, not on engineering readiness,
and that decision gets **its own sitting after the plan closes**. The shelf holds
work that has been *decided and deferred*; these have not been decided.

**Building them speculatively is cost without benefit.** Each is expensive, each
is only valuable if the product is sold outside the firm, and each would be built
against guesses about a buyer nobody has met. Putting them here would imply a
commitment that does not exist — and this file's whole purpose is that a parked
item means something.

**MBCx is also not here, and that is not a downgrade.** It stays exactly where
BAS-SPEC put it: a **commercial trigger** that **jumps everything** when it
fires. It is not sequenced behind the current plan and this audit did not
re-evaluate it. See [entry 9](#9-bas--mbcx).

---

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
**ACTIVE — both gates cleared 2026-08-05**

Extraction and seeding of the Start-Up master forms, the last of the three
seeding campaigns. Roadmap position: MASTER-BRIEF §10, item 1. Live plan and
progress: [STARTUP-CAMPAIGN.md](STARTUP-CAMPAIGN.md) and
[RELEASES 1.06](RELEASES.md).

**Gate (a) — Word COM. CLEARED.** Tony fixed the environment; re-verified
independently by `probe-word-com.ps1` on 2026-08-05, **2/2 converted**, including
`ats_checklist.doc` — the exact file whose `Documents.Open` hung machine-wide on
2026-07-21 and forced Batch F onto PDF render twins. The probe runs only against
working copies already in gitignored `samples/`, never ShareSync: Word writes an
owner-lock file next to whatever it opens, so a "read-only" probe against the
firm tree would still be a write to it.

**Gate (b) — the startup-type decision. RULED: a first-class fourth type.**
Start-Up is not folded into `ivc`. It gets its own tab, its own counts in every
dashboard / index / deliverables surface, and its own template family alongside
IVC/PFC/FPT. R10/R11 are unchanged and still govern start-up content *embedded
on a Static Verification sheet* — that stays `ivc`. What changes is that a
Start-Up **master form** now has somewhere of its own to land.

*Why it is not a fold:* start-up has a different signature from IVC —
**the contractor performs and the CxA witnesses, and both sign.** A type whose
sign-off structure differs is not a variant of another type; that is the same
bar the RTU-vs-AHU mint ruling set.

### 7a. System attributes — the design-basis block
**DEFERRED BY NAME 2026-08-06, with the system-attachment build**

A system has no nameplate. The generator now OMITS the nameplate grid entirely
for a `kind=system` target, because *an empty grid is worse than an absent one* —
and that is the whole of the first cut, by ruling.

What belongs there eventually is a **design-basis block**: design density and
area of operation, hazard classification, water supply and its test date, zone
and riser counts, standpipe class. Structurally it can reuse the field-def
machinery; semantically it is a different claim — the nameplate answers *what was
specified, drawn and installed for this unit*, the design basis answers *what is
this system designed to do*. Single-value by default, with the three-column form
available per attribute where it earns it (the Heating Medium precedent: the
shape is data, not a fork).

**Wakes when:** the first real project needs a system design basis recorded —
most likely a fire-protection sprinkler acceptance. **Designed against that
project, not speculated now.**

### 7b. Acceptance Testing — the FIFTH checklist family
**PARKED — born 2026-08-06 out of the Start-Up campaign's residue**

**Code-required acceptance tests**, and a family in its own right. It is not
Start-Up and it is not FPT, and the distinction is the reason it exists:

| Family | Who, and what is being proven |
|---|---|
| **Start-Up** | the contractor performs a first run; the CxA witnesses |
| **FPT** | the sequence of operations is verified against the spec |
| **Acceptance Testing** | a **code-required test** is performed and its result recorded against a **published criterion** |

**Founding content, already in hand.** The Start-Up mine held out four items that
turned out to belong here rather than nowhere:

- **Accelerator** and **Flooding (Deluge) Valve** — ruled 2026-08-06 as **out of
  start-up scope entirely**. Both are proven by NFPA 13 trip tests on the system;
  nothing on a start-up sheet exercises them, and *a form that pretends otherwise
  records theater.*
- **Standpipe's 11 items**, orphaned when the standpipe mint was refused.

Scope, as ruled:

- **NFPA 13** sprinkler acceptance — dry-pipe trip tests with the **40 psi /
  24 h / 1.5 psi** criteria, deluge and preaction trips, hydrostatic, flow tests
- **NFPA 20** fire pump acceptance
- **TSSA / CSA B44** elevator acceptance interface
- **Life-safety generator load tests**, where acceptance-shaped
- **General system acceptance** adjoining the IST / CAN-ULC-S1001 world —
  *the firm performs IST, so system-level acceptance is real firm scope*

**Three design notes, recorded now so the build does not rediscover them:**

**(a) It is predominantly SYSTEM-shaped.** Acceptance tests are performed on
systems, not units. **This family depends on the `kind='system'` attachment
mechanism** — see [SYSTEM-ATTACHMENT-PROPOSAL.md](SYSTEM-ATTACHMENT-PROPOSAL.md).
It cannot start before that is ruled and built.

**(b) It shares DNA with two parked entries.** [3d](#3d) — repeating-measurement
structures: flow curves and trip timings are literally its cell types.
[3e](#3e) — the IST module: same standards neighbourhood, same witnesses.
Whoever builds this should read both first rather than starting from zero.

**(c) THE FIRM HAS NO EXISTING TEMPLATES FOR THIS FAMILY.** Unlike Start-Up,
which had 81 masters to mine, **there is nothing to mine.** The family is born
entirely from the Phase 2 methodology — standards research, triangulation,
convergence-classed items, ratification batches — anchored on NFPA 13/20/25,
CAN-ULC-S1001, and CSA/TSSA. That is a different and slower shape of work than
either seeding campaign, and pretending otherwise would under-scope it badly.

**Wakes when:** the first project schedules formal acceptance testing through the
app — most likely fire protection on a new-construction job.

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

**Harness zip readers walk local headers, not the central directory.** Several
harnesses here (pw-cx-plan, doc-palette-sweep, audit-template, mine-startup)
enumerate a .docx by scanning for PK signatures. That is the fragile
way: the central directory is the authoritative index, and a valid zip whose
local-header layout differs walks wrong. It bit once on 2026-08-05 — a re-zipped
skeleton made pw-cx-plan read an empty document and fail five content assertions
on correct content. Fixed at the cause that day; the readers were left as they
are. *Governed by the touch-policy: convert a reader when its suite is next
touched. Not a backlog item — do not schedule a sweep.*

**Portal email plumbing.** Steps 1–4 of [PORTAL-GOLIVE.md](PORTAL-GOLIVE.md) —
the mailer, template capture, and rendered-appearance verification. §0A of that
runbook goes live on **share links alone with no mailer**, which is a legitimate
and arguably better first outing for a read-only viewer. *Wakes when:* the first
external user needs an attributable account rather than a link.

**Owner queues live in-app, not here** — proposed types and applicability
proposals are ratification surfaces the owner works in the product. They are
never shelf entries; a queue with a screen does not need a register.

**Classifier exception ratification — no moved-target check.** Ratifying a
category-scoped applicability exception re-queries the equipment table at apply
time to expand the category into units. The re-derivation is deterministic (a
database read, not a model call), so it is not the failure the ratification law
exists to prevent — but the unit count written can differ from the count the
human read. The screen refuses on *zero* units; it does not notice a *changed*
count. Fix: a count check at ratify time, matching `apply-ratified.mjs`'s
moved-target refusal. *Found by the 2026-08-03 audit of every ratification
surface; recorded, not fixed that night.*

**Gray-on-color punch items.** UI instances that render gray text on a tinted
field, against the standing rule (tinted field + same-hue text, e.g.
`bg-green-50 text-green-700`, never gray-on-color — ARCHITECTURE §UI). Collected
on the UI punch-list; fixed as their screens are next touched, same policy shape
as the harness reads.
