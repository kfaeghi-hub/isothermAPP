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

> **THE START-UP / IST BOUNDARY, in one line** (from the Start-Up campaign,
> 2026-08-06): *a start-up hands the integrated test a known-good starting
> position. It does not duplicate the integrated test, and it does not leave it
> to discover installation faults.*
>
> The Start-Up family now enforces its side of that boundary — every alarm and
> interlock row is *installed and operable* with the response proven in IST, and
> smoke management proves each fan and damper individually from its own control.
> **When this module is built, it inherits a corpus that has already stopped
> claiming IST's work.** See
> [STARTUP-CAMPAIGN.md](STARTUP-CAMPAIGN.md) § the known-good handoff.

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

> **SHIPPED 2026-08-09 — all five phases.** Schema (12 tables), five
> guards each proven refusing, the 8 new role seats, the tabular matrix with
> status chips, §9.1's prerequisites as firm data wired to the documentation
> register, and **session field mode** — phone-first, offline through the
> existing checklist outbox on `ist_results`' natural key. `pw-ist` at 38 checks,
> now including **RLS asserted as a real employee**, added after a policy
> recursion made the whole tab read empty while a service-role suite stayed
> green. **Phase 4 shipped:** one skeleton two modes, hosted in
> `generate-report.ts` behind an explicit `document` allow-list (the 12-function
> ceiling is physical), gated by `ist-regen-gate` — 15 structural checks against
> the issued Scarborough report, now a battery suite.
>
> **Phase 5 shipped as PRESENT-rather-than-INSERT.** The Team tab surfaces a
> **Needed for IST** group on scope-classified projects — the seats with no
> company assigned, each one tap from an assignment, each disappearing as filled.
> No phantom rows: `project_team_assignments.company_id` is NOT NULL and the
> matrix groups by (role_type_id, company_id), so it is **company-first** and an
> unfilled seat is an absence to show, not a row to fabricate. The first attempt
> tried to insert and could not; the proposal had called seats "role rows
> awaiting contacts" and the schema said otherwise — same shape as the
> `origin='ist'` claim. `pw-ist-team` is sighted from birth.
>
> **One correction this entry owes:** it said IST deficiencies would file with
> `origin = 'ist'` because that value was *already in the origin set*. It was
> not. The migration's own assertion caught it before a field deficiency did.
>
> **WOKEN 2026-08-08 by owner ruling — proposal stage.** Two sources combined: the
> firm's own issued report (`Scarborough Gardens Arena_IST_REV2`, Peiman-authored,
> ITC held by Isotherm) and fresh CAN/ULC-S1001 research. Full proposal:
> **[IST-MODULE-PROPOSAL.md](IST-MODULE-PROPOSAL.md)** — awaiting ruling, no code.
>
> Two findings from that work worth surfacing here, because they change the
> entry's own assumptions:
>
> 1. **The firm's document IS S1001 Appendix C**, section for section — not a
>    house style. The generator's target is therefore a standard-defined structure
>    that Ontario AHJs already read, which makes a faithful regeneration a real
>    gate rather than a resemblance test.
> 2. **O. Reg. 87/25 took effect 2026-01-01** and made the obligation retroactive
>    for buildings whose systems were installed or modified on or after 2020-01-01.
>    With the initial → 1-year → 5-year cycle, this is a recurring code-mandated
>    service line, not a per-project one-off. §11's ongoing-testing table stops
>    being a footnote.
>
> The entry's design notes survive intact: per-unit readiness stays the Cx Index's,
> measurement structures stay [3d](#3d-repeating-measurement-test-structures),
> scenario drafting stays [5](#5-fpt-agent).

### 3k. Internal onboarding — the half-onboarded account trap
**PROPOSED 2026-08-10, from a real incident. No code.**

**THE TRAP, documented so it is not rediscovered.** Creating an auth account is
**one third** of onboarding here. A person needs three rows and nothing creates
them together:

| Row | Without it |
|---|---|
| `auth.users` | cannot sign in |
| `user_profiles` | signs in to a **dead end** — see below |
| `contacts` | invisible to every **team-assignment picker**, so no lead can add them to a project |

`j.atherton@isothermengineering.com` was created in Supabase on 2026-08-10 and had
**neither** of the other two. He would have signed in to *"Account setup
incomplete — your account exists but has no profile. Contact your administrator."*
and been unable to do anything else. Both rows were created by hand.

**The second gap is the quieter one.** A profile alone still leaves the person
unassignable, because the team matrix lists **contacts**, not accounts. Someone
fixing the visible dead end would very reasonably create the profile, watch the
app work, and ship a person nobody can put on a project.

**Nothing warns the admin who created the account.** The only signal is a screen
that appears to the *one person who cannot act on it*, at a moment the admin is
not present. That is the shape this codebase keeps naming: **a failure whose only
witness is the party without the power to fix it.**

---

#### (a) Make the dead end name what is missing — cheap, do first

The current copy tells the user to contact an administrator and tells the
administrator nothing. Proposed: keep the plain sentence and add the two rows an
admin must create, plus the account id, in a copyable block — so the user's
screenshot to their admin *is* the work order.

**One tension worth ruling on rather than assuming.** That screen renders for
anyone with an auth account and no profile — which could include an external
person created by mistake. Naming internal table names to them is mild schema
disclosure. Two ways out, both fine:

- print the **account id and a plain checklist** ("this account needs a staff
  profile and a directory contact") without table names — enough for an admin,
  meaningless to anyone else; **recommended**;
- or gate the detail behind a query param the admin sends, which is more
  machinery than the problem deserves.

#### (a2) Show the gap where an admin already looks — the cheapest durable fix

The Users screen lists `user_profiles`. It cannot show a person who has **no**
profile, which is precisely the broken state. Proposed: one strip at the top —
**"2 accounts have no profile"** — from a server-side comparison of `auth.users`
against `user_profiles`, each with a one-tap fix.

This is the guard family's own move: **make the absence visible to the person who
can act on it.** It catches the trap permanently and is far smaller than (b).
*Note the instrument problem:* listing auth users needs the service role, so this
cannot be a browser query — it needs a server endpoint, which is the constraint
below.

#### (b) An admin "Add team member" flow — one act instead of three

**The pattern already exists, inward-facing.** `api/portal-invite.ts` +
`api/portal-redeem.ts` already do this for clients: issue a token, then create the
auth user, the profile and the membership together — including a guard that
refuses to demote an existing internal account. The internal case is the same
shape **minus the token, plus a contact row**. This is a port, not an invention.

**Two constraints to design against, both real:**

1. **`api/` is at the 12-function ceiling.** A new endpoint does not exist to be
   had. It rides an existing function's action allow-list (the `intake.ts` and
   `generate-report.ts` precedent) or it waits for
   [3b](#3b-portal-endpoint-consolidation) — whose slot pressure this entry
   increases again.
2. **Auth and the database are not one transaction.** `auth.admin.createUser`
   cannot be rolled back by a failed `insert`. So "atomic" here means
   **idempotent and repairable**, not transactional: create in a fixed order,
   make each step a no-op when it already exists, and let (a2) be the net that
   catches whatever still lands half-done. Designing for a rollback that cannot
   exist is how the half-state becomes invisible instead of impossible.

**Recommended order: (a) now, (a2) next, (b) when 3b frees a slot or a real
onboarding batch makes it worth an allow-list entry.**

**Wakes when:** the next person is hired, or 3b runs.

### 3f. Extraction-rules harvest — the librarian's next client
**WOKEN 2026-08-11 · PROPOSAL PENDING RULING — `docs/EXTRACTION-HARVEST-PROPOSAL.md`**

*Born 2026-08-04, from the extractor calibration campaign. The wake condition —
real correction data — fired with the Avondale incident, which produced a worked
example of all three rule kinds this harvest is meant to learn: a column dialect
(SERVICE is a duty, not a description), a title convention (a banner beside a
group header), and a field alias (`MAX INPUT [MBH]` is `Input Rating (kW)`). All
three were worked out by hand this week; the proposal's Phase 2 gate is that the
harvest can rediscover the first of them from the recorded corrections alone.*

*Scoped to column-mapping and type-resolution in v1. Value-level learning is
explicitly excluded until an incident asks for it — every defect this campaign
produced was structural, and a wrong value rule changes an engineering number
silently, which is a different kind of blast radius.*

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

### 3l. Document-set context — the set corroborates itself
**DESIGNED 2026-08-11, not built. Wakes on the first full tender set uploaded after the extraction upgrade ships.**

*Numbered 3l, not 3k. `3k` is the half-onboarded account trap (2026-08-10) and is
occupied; the ruling that asked for these two entries named 3k/3l before that was
checked. Renumbered rather than overwritten — nothing cross-references 3k, but an
id that silently changes meaning is worse than a gap.*

**Extraction today is per-page, and a tender set is self-corroborating.** Every
page is read alone, against nothing, as if it arrived by itself. The set it came
from already contains the answers to most of what a single page leaves ambiguous.

Three capabilities, in the order they pay:

- **Read the legend and abbreviations page FIRST, and apply it everywhere.** A set
  defines its own dialect on one sheet — `EWT`, `TDH`, `NPS`, the tag prefixes,
  the drawing-number grammar — and then uses it for two hundred pages. Reading
  that sheet first turns a per-page guess into a set-wide fact. This is the
  cheapest of the three and probably the largest single accuracy gain available.
- **Cross-reference units across pages.** `P-1` on the pump schedule and `P-1` on
  the heating piping diagram are the same unit, and each page carries what the
  other omits — the schedule has the duty and the electrical data, the diagram has
  what it connects to. Agreement across two independent pages is **corroboration**
  in the dual-path sense: a wrong reading would have to be wrong identically on
  both.
- **Validate against the drawing index.** The set says what it contains. A read
  that produced nothing from `M-501` when the index calls `M-501` the mechanical
  schedule sheet is a finding, not a quiet zero.

**Why it waits.** It needs a real set to be worth anything, and the review screen
on that first set is the evidence: every correction a human makes that the set
already answered is a measurement of what set-context would have caught. Building
it before that means guessing at which corroborations matter.

**Wakes when:** the first full tender set is uploaded after the extraction upgrade
ships. The wake is not a date — it is the moment there is a review to read.

**Competitive note, stated honestly.** The 2026-08 audit records **no competitor
doing this**, and it also records no competitor being *asked* about it: every
capability in that matrix is per-artifact — P&ID tag extraction, nameplate OCR,
single-document spec Q&A. So this is an unoccupied position rather than a proven
one, and the audit cannot be cited as evidence that the position is valuable. It
is evidence that nobody is standing there.

---

### 3m. Full-document intelligence — import becomes design review
**DESIGNED 2026-08-11, not built. Wakes with the FPT campaign.**

**Specifications, sequences of operation, and IOMs ingest alongside the schedules
and cross-check each other.** The schedule says `B-1` is 1000 MBH; spec section
23 52 00 says 1200 MBH. Today nobody notices until somebody reads both. The point
is not that the app stores more documents — it is that **disagreement between two
documents about the same equipment is a finding**, and findings are the backbone.

That changes what import *is*. Data entry is a cost the firm absorbs; **automated
design review is billable work**, and it is produced as a by-product of an import
the firm was going to do anyway.

**Shares ingestion machinery with 3j (spec/document Q&A) and the FPT agent.** All
three need the same thing: project documents parsed, chunked, cited, and
answerable. Building any of them alone builds two thirds of the others.

*Recon note: 3j's own entry does not claim this shared machinery — it names only
the FPT campaign. The overlap is asserted here as a design judgement, not quoted
from 3j, and should be re-checked when either is built.*

**Boundaries, so this does not become "AI reviews the design":**

- It **flags disagreements between documents**; it does not adjudicate them. The
  spec and the schedule disagreeing is a fact; which one is right is an engineering
  judgement and stays with the CxA.
- Every flag carries **both readings and both citations**. A flag a human cannot
  check against the source is not usable in a deliverable.
- It creates **candidate findings**, never issues. Law 2, unchanged.

**Wakes with:** the FPT campaign.

---

### 3o. The Documents tab — the per-project document pool
**RULED 2026-08-12 — build after extraction Phase 6 and after 3b. Not built. Full
design and the eight rulings: [DOCUMENTS-TAB-PROPOSAL.md](DOCUMENTS-TAB-PROPOSAL.md).**

*Numbered 3o at the owner's instruction, leaving `3n` unused. Recorded rather than
quietly closed up: nothing cross-references 3n, and a gap costs less than an id
that silently changes meaning — the same call the 3k/3l renumbering made.*

**The shared foundation that four shelf entries quietly assume, and that none of
them owns.** 3h needs plan sheets to pin findings to; 3j needs a specification to
be an agent over; 3l needs a sheet index for all three of its capabilities; 5
needs the sequence of operations, which lives on a sheet inside a drawing set
nobody has uploaded. Each would build a private version of the same thing.

**The model, in one line: upload by discipline, organize by sheet, consume by
function.** Documents do not arrive as the things features want. The mechanical
engineer issues one 60-sheet PDF with schedules, plans, details, schematics and
SOOs inside it; electrical, fire protection and plumbing do the same. The pool
takes the whole set, runs the existing finder/sorter machinery over it to
**propose a sheet index** — page-level kind, sheet numbers read off title blocks —
confirmed in one review pass, offer-never-assert. Every consumer then reads at the
sheet level.

**Revisions are first-class.** A new issuance is a new row pointing at the old one
(rule 4, supersede-not-delete); sheets map across revisions by sheet number where
identifiable; anything referencing a superseded sheet **says so** rather than
quietly resolving to the newest revision, which would be rule 12.

**Scope is defined by consumption — a document belongs if a feature reads it or a
workflow references it.** Drawing sets (sheet-indexed) · specifications, Cx
divisions 21–28 only, carved client-side *before* upload so the bulk is a
never-was · shop drawings and submittals for scheduled equipment · certificates
and test reports · O&Ms at closeout, major equipment only. **Out: architectural
and structural sets, contracts, coordination models, full-set reference dumps.**
Build Spec §4.4 stands and is the reason: the pool is the working set, ShareSync
is the archive, and a claim names its evidence without having to own it.

**Three findings from the recon worth having on the shelf even before a ruling:**

- **Egress, not storage, is the constraint — by 60×.** At realistic scale the pool
  costs ~1 GB per project and under $3/month past 200 projects; storage is
  effectively free. But a consumer that opens the *whole set* to read *one sheet*
  spends 24 MB per view — ~10,600 views inside Pro's 250 GB quota. Per-sheet
  derivatives cut that to 0.4 MB. **They must be in the first commit**: retrofitting
  means re-splitting every stored set, at full egress cost, to fix an egress
  problem.
- **Zero new function slots.** `api/` stays at 12 of 12: the classifier rides
  `api/intake.ts` (the `find-pages` precedent), signed URLs are two rows in
  `get-file-url`'s `DOC_TABLES`, the portal list is an RPC. **3b's pressure is not
  increased — but it is argued from the other side:** a fifth action on a 783-line
  file is 3b's "or sooner."
- **The calibration corpus already gates the sheet classifier.** `FIXTURES.md`
  carries three consultants' sets with per-page ground truth published. The
  classifier is a *widening* of the existing finder, so the gate must hold the
  existing `schedule` verdicts fixed (3 / 4 / 2) while the new kinds are measured
  fresh — no acquisition needed.

**Sequencing — RULED: after the extraction arc's Phase 6, and after 3b, not folded
into an extraction phase.** The decisive reason is a collision, not a preference —
extraction Phase 5 migrates `intake_rows` while this re-homes `intake_uploads`, and
an arc gated on measured accuracy must not have its upload side move underneath it.
The build-1-early option was **declined** on the proposal's own reason: a pool with
no index is a folder, and the firm has one.

**The eight questions are ruled** (proposal §10): strangler over migration for
`equipment_attachments`, with an amendment; `sheet_kind` as a CHECK, under the
recorded law that *a vocabulary consumed by a model contract is code and a
vocabulary consumed by humans is policy*; client-side spec carve with a manual-carve
fallback and whole-upload-then-delete refused in both branches; superseded
derivatives dropped with **no re-split on demand**; portal visibility false by
default and category defaults that **never apply retroactively**; **no pointer rows,
now the standing answer to any future "add a ShareSync link field" request**; three
named capability helpers. Two review findings folded (§10.5): an
`ON DELETE SET NULL` that collides with the widened IST evidence CHECK, fixed in the
upgrade flow rather than the schema; and the classifier regression promoted from a
review-time habit to a named assertion in `pw-sheet-index.mjs`.

**Q1's amendment, captured here because it shapes Build 1's seed data:**
`shop_drawing`, `submittal` and `om_manual` seed **`active = false`** and are
flipped active in the strangler commit at Build 3. The proposal originally said the
Equipment tab's write path switches *"on the day the pool ships"* while scheduling
the strangler at Build 3 — which would have left two write paths open across Builds
1 and 2. The category rows exist from day one; the upload picker does not offer them
until there is exactly one write path. Backfill remains never-or-later.

**Wakes when:** **extraction Phase 6 is complete AND 3b is complete.** Both, not
either — Phase 6 clears the `intake_uploads` collision and the review-idiom
duplication; 3b ratifies the action-router before `api/intake.ts` takes a fifth
action.

---

### 3p. Cross-file fragment assembly — the data that is dropped by design
**BANKED 2026-08-12 from a measurement. Wakes after the Documents pool's sheet index exists (3o).**

*Numbered 3p; 3o is the Documents tab. Named here rather than left as an invisible
known-issue, because it is real data loss and it is currently invisible.*

**Four files in the Seneca corpus carry no equipment tag at any width.** They are
horizontal continuations of wider schedules — the unit tags live in a different
file, and these carry only the right-hand property columns:

| file | grid | what it holds |
|---|---|---|
| `AHU-Coils1.xlsx` | 10 × 31 | a **cooling coil block** — fluid type, rows, FPI, total/sensible capacity, air-side and fluid-side temperatures, flows, pressure drops |
| `DOAS-1.xlsx` | 7 × 25 | **exhaust filters** + blender/economizer flags, humidification, energy recovery, electrical, dimensions, operating weight |
| `DOAS-3.xlsx` | 7 × 35 | **afterfilters** — the same shape |
| `DOAS-coil1.xlsx` | 17 × 41 | a **coil fluid-side block** — flow, EWT, LWT, velocity, pressure drop |

**Today the read returns `rows: []` and says why, and that is correct.** A property
row with no unit to attach it to is not a register row; inventing a tag, or
borrowing one from a neighbouring column, would be worse than saying "I cannot
tell". The alternative — writing rows with empty tags — is what the boundary was
already refusing, correctly, and the fix went into the read rather than loosening
the contract.

**What it costs, stated so it is not forgotten:** real engineering data — coil
capacities, filter sizes, entering and leaving water temperatures — is read,
understood, and then dropped, because nothing can say which unit it belongs to.

**What would close it:** fragment-to-parent matching. Given a document set with a
sheet index, a fragment's parent is findable — same drawing number, adjacent sheet,
matching column geometry, matching row count. That is **document-set context**, and
it is 3l's problem wearing a narrower hat.

**Wakes when:** the Documents pool's sheet index exists (3o). Before that there is
no set to search, and fragment-to-parent matching over a flat pile of uploads would
be guessing with extra steps.

---

### 3q. Cheaper-tier band reads — a hypothesis with its test written first
**BANKED 2026-08-12, not built. Wakes after the extraction arc, as its own measured step.**

**The hypothesis:** a band read is TRANSCRIPTION, not judgment. The band already
arrives with its header attached, its columns already mapped by the sheet itself,
and the reader's whole job is to turn rows of cells into rows of JSON. The hard
part of extraction — deciding what a unit IS, spotting that a duty column is not a
description, noticing an ambiguity nobody wrote down — happens once per sheet, not
once per band.

If that is true, bands could run on a cheaper tier and the expensive tier could be
reserved for the sheet-level questions. On the 199×52 fixture that is 18 of the 19
calls for that sheet.

**It is a hypothesis, and it is banked with the test it has to pass:**

| | |
|---|---|
| corpus | the same 37 files, the same 298 denominator |
| accuracy | typed count must HOLD — measured, not felt, and against the fixed divisor |
| cost | the delta reported as its own line, both per sheet read and per usable sheet |
| labelling | model figures `[SAMPLE]`, and more than one run before the number is believed |

**Why it is not built now.** The arc has just spent four phases learning that a
change measured in the same window as another change cannot be attributed. Cheaper
band reads would land while parallelism, the fragment rule and chunking are all
still fresh in the corpus numbers — and a movement nobody can attribute is not a
result.

**The risk to watch,** stated so the test is not designed to pass: a cheaper tier
may transcribe fine and lose exactly the things this arc added — the mappings
record, the ambiguity questions, the refusal to invent a tag on a fragment sheet.
Those are judgment, and they are asked for on every call including band calls. If
accuracy holds but questions stop being raised, the number will look fine and the
capability will be gone.

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
**CLOSED 2026-08-06 — the family exists**

113 templates, 3,123 items, 67 of the register's 68 types. As-built record with
its departures table: [STARTUP-CAMPAIGN.md](STARTUP-CAMPAIGN.md). Release:
[RELEASES 1.06](RELEASES.md).

*Original entry below, kept as the record of what was gated and why.*

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

### 7c. CLOSED — the two hygiene follow-ups, ruled and executed 2026-08-06

Both proposed with evidence, ruled as proposed, executed the same day. **The
hygiene pass closes with no residue and no holds.**

#### (1) `Fire Pump — Sprinkler Tree Source` — DELETED

The mine artifact for `03 Pumps/S02 Pumps- CSP.doc` was read before the deletion,
not after: section A held one item carrying `"standing_item": true`, and
B/C/D/E/F were **empty arrays**. The master yielded zero checklist rows. The
husk's other twelve rows were the `pump` type's Phase 2 fill, which landed on it
because it was keyed `pump` at the time.

Deleted; its master path unioned onto the drafted survivor's `revision_label`, so
the corpus record that **a sprinkler-tree pump master was mined and found empty**
survives the template that carried it. The standing IOM row needed no fold — it
is on the survivor by the same rule that put it on the husk.

*The applier printed the twelve rows it was about to remove and named them as
type-level fill rather than deleting them silently.* A deletion that does not
show its work is indistinguishable from one that was wrong.

#### (2) `ahu_builtup` — MINTED, template re-keyed

`Built-Up Air Handling Unit`, Mechanical, base-only defs; the drafter field table
rides the next batch per the `air_dryer` precedent. Alias seeded
**`Compartment Unit`**, exact-match, so the next old specification resolves —
and nothing shorter: `CU` collides with condensing unit, and *Compartment* alone
is not a machine.

`COMPARTMENT UNIT SYSTEM Start-Up Checklist` → `Built-Up Air Handling Unit
Start-Up Checklist`, re-keyed `ahu` → `ahu_builtup`. `ahu` is now a single
template, as it should always have been.

#### The coil repair — and the correction inside it

**Approved as *qualify, never dedupe*. Executed differently from how it was
proposed, because reading the source changed the answer.**

The proposal said the repeated rows were two coil blocks, heating and cooling,
and that the fix was `HEATING COIL:` / `COOLING COIL:` prefixes. The raw source
artifact shows the master has **three** content tables —
`COMPARTMENT UNIT GENERAL CONSTRUCTION` (10), `FILTERS` (6), `COOLING COIL` (34)
— and **no heating coil anywhere in the document.** The repetition is a second
piping group *inside* the single cooling-coil block.

So the repair got **larger and more accurate**: the mine had dropped **every**
block heading, not just a coil one, which is why fifty rows arrived as one
undifferentiated section. All three headings are restored as prefixes. The two
piping groups are distinguished as *first* and *second* — **the source shows two
and gives no heading naming them, so the count is stated and the distinction is
not invented.**

Three checks repeat, six rows total — not the four the proposal claimed.
(`Balancing Valves` and `Isolating/Balancing/Valves` are different labels, not a
collision.)

**The applier reads the headings out of the source artifact rather than carrying
a table of its own, and a row it cannot place in a source block is a refusal.**
Fifty of fifty placed; zero refusals. The mirror case is recorded in
ARCHITECTURE's phantom-data section: *eager dedup deletes real structure; the
cure for apparent duplication is reading the source, not collapsing the rows.*

#### Carried forward as its own act — not part of the above

**`fire_pump` nameplate defs.** The deleted master's eleven-field nameplate table
was held out of the deletion, as ruled. Proposed separately in
`proposals/fire-pump-nameplate-additive.json`, **unratified**: five additive
fields (Manufacturer, Model or Size, Serial Number, Impeller Size, Seal Type),
ten def rows, 37 → 47. Six of the master's eleven fields were **not** proposed
because existing defs already cover them, and `Power (kW)` was not proposed
because `Motor Horsepower (HP)` exists and the table has a `unit_imperial`
column — that is a unit question on an existing field, not a new field.

*The gap it exposes is the reason it is worth doing:* `fire_pump` carries 37
duty-and-controller defs and **no identity block at all.** It can say what a fire
pump is rated to do and cannot say which machine it is.


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

### 3r. saveAliases erases provenance — fix BEFORE harvest Phase 1 builds
**BANKED 2026-08-13. HARD WAKE CONDITION: this is fixed before harvest Phase 1
construction starts. Not a suggestion — harvest's own evidence depends on it.**

**The mechanism, found the expensive way.** `ClassificationsPage.saveAliases`
saves a type's alias list as DELETE-ALL-THEN-REINSERT: every alias row for the
type is destroyed and recreated on every ordinary edit. `created_by`, `created_at`,
and `note` — the ruling trail — are wiped for EVERY alias on the type, including
the ones the edit did not touch. Found when the owner's own DOAS edit
(2026-08-12, a deliberate, correct vocabulary call) silently destroyed the
Seneca-precedent ruling note on the way through. The note survived only because
the seed migration is in git; an alias added through the UI and re-ruled later
would leave no trace at all.

**Why the wake condition is harvest Phase 1 and not "someday":** harvest mines
the CORRECTION TRAIL — who moved a mapping, when, away from what, and why. Phase
2's gate is REDISCOVERING a known mapping from that trail alone. A UI whose every
save erases authorship, dates, and reasons is destroying the exact evidence
harvest exists to mine; building harvest on top of it is building on a surface
that self-wipes.

**Suggested shape for the fix (not built now, not binding):** either a
diff-based upsert — delete only removed aliases, insert only added ones, leave
surviving rows untouched — or provenance carried to a history table the UI
cannot reach, written by trigger. The first is smaller; the second also captures
the DELETIONS, which are themselves corrections and therefore harvest evidence.

**Until then:** a ruled alias's justification lives in the reversal record
(ARCHITECTURE.md, aliases section) and is re-attached to the row by hand when a
save eats it — done once already for DOAS→mau.

**Gray-on-color punch items.** UI instances that render gray text on a tinted
field, against the standing rule (tinted field + same-hue text, e.g.
`bg-green-50 text-green-700`, never gray-on-color — ARCHITECTURE §UI). Collected
on the UI punch-list; fixed as their screens are next touched, same policy shape
as the harness reads.
