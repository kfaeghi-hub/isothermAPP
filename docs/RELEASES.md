# Releases

The firm's running changelog. Newest first.

Every entry carries two sections:

- **For the team** — plain language, how-to-use. This is the version that goes out
  in update emails to employees and users.
- **Technical record** — the precise as-built summary: mechanisms, rules added,
  what changed underneath. For developers and for future sessions reconstructing
  why something is the way it is.

**Standing rule: every user-visible ship appends its entry here, in the same
commit series as the work.** A release note written later is written from memory;
one written alongside the change is written from the diff.

---

## Update 1.06 — 2026-08-05 · CLOSED 2026-08-06

*Ruled as "1.05" on the night; 1.05 was already spent on the extractor
calibration campaign, so this took the next number. Two rulings: the document
identity went monochrome, and the Start-Up family was built. Both are done.*

### For the team

**There is a fourth kind of checklist now: Start-Up.**

Alongside IVC, PFC and FPT, every piece of equipment can carry a **Start-Up
checklist** — the record of the machine being run for the first time. It has its
own tab, its own counts, and **69 equipment and system types are covered**, from
boilers and chillers down to wall fin and water meters.

**What a start-up checklist is for, and how it differs from the others.** An IVC
says the unit was installed correctly. An FPT says the sequence works. A start-up
says *the machine was brought to life, and here is what it did* — the safeties
were tripped and proved, the readings were taken, and two people signed for it.

**The contractor performs it. You witness it. Both sign.** That is printed on the
form in full, and the wording matters: the contractor certifies the work was
performed; your signature says you **witnessed** it and **does not transfer
responsibility for the work**. Those two sentences are on every start-up
document.

**There is a fourth answer: HOLD.** Y, N, NR — and now **HOLD**, for when the
start-up *cannot proceed*: no permanent power, no water treatment, no gas.
A blocked start-up is not a failed one, and recording it as N would make it read,
a year later, as work done badly rather than work that could not be done yet.

**Some forms open with a warning banner.** Where a form carries a safety
instruction — the transformer's *"Equipment to be isolated from all sources of
power"* — it prints as a **bold banner above the first section**, not as a line
item. You read it before you touch anything, rather than ticking it after.

**Every checklist now has a Safety Device Verification section and a Readings to
Record section.** These are new. The old forms checked that a device was
*installed*; these prove it **trips**, and record the number. Flame failure
closes the valve *and* the closure time gets written down.

**Where a check belongs to a different document, the form says so.** Fire alarm
devices show as *installed and operable* with a note that the alarm response is
proven in integrated testing. The form no longer claims work that belongs to IST
or to acceptance testing.

**And the documents are black and white now**, per the identity change earlier in
this release. The only colour left on a generated document is colour that means
something.

**The start-up list got shorter, and nothing was lost.** The family first shipped
with the same checklist under several names — the pump form appeared thirteen
times, once for each water system whose folder happened to contain it, and the
boiler form three times. **113 start-up templates are now 76.** When you pick a
start-up checklist you see one *Pump Start-Up Checklist*, not a choice between
*DOMESTIC WATER SYSTEMS* and *PURE WATER SYSTEMS* that were the same form. The
system a pump serves is on the equipment record, where it belongs; it was never a
different checklist. Every merged form's source is still recorded on the survivor.

**The boiler form learned steam.** Water column, gauge-glass blowdown, the
two-cutoff low-water behaviour a steam boiler needs and a hot-water one does not,
the safety-valve lift *and reseat*, and the pressure and conductivity readings.
On a hot-water boiler those rows answer **NR** — one form, not two.

**Two forms were filed under the wrong equipment and are now right.** A supply
fan form was sitting under Air Handling Unit, and a fire pump form under Pump.
Both offered the wrong checklist and the wrong nameplate block to whoever picked
them. There is also a new type — **Compressed Air Dryer** — which had been
sharing Air Compressor's file; a dryer is a different machine with a different
duty and a different way of failing.

**And one form turned out to be a different machine entirely.** The checklist
filed as *COMPARTMENT UNIT SYSTEM* is a **built-up air handling unit** — the kind
assembled on site from sections rather than delivered as one packaged box. It has
its own type now, *Built-Up Air Handling Unit*, and the old name *Compartment
Unit* still finds it, so an older specification using that term will resolve.
Its checklist also got its headings back: the form's three sections — general
construction, filters, cooling coil — had been flattened into one long list when
it was first imported, and they read as sections again.

### For the architect

**Two rulings, one release.**

**Document identity → monochrome.** `DOC` moved to a grayscale ramp;
`DOC_SEMANTIC` untouched and now the only colour in a generated document. The
finding that justified the verification design: with every value in `DOC`
monochrome and `grep -r` over `api/` clean, **the Cx Plan still rendered
purple** — its heading identity was Word style definitions inside a committed
binary. Recorded as *identity can live in a binary; source is not the artifact*.
A later render-and-look found a **blue footer** the same grep had passed, which
is the standing limit of a retired-value list: it can only find values somebody
already knew were retired.

**The Start-Up family.** Full record in
[STARTUP-CAMPAIGN.md](STARTUP-CAMPAIGN.md), flipped to as-built with its
departures table. Headline numbers: 81 masters mined at UNEXPLAINED 0 · 678
placement items ruled · 8 Phase 2 batches · 20 types minted · **113 templates,
3,123 items, 67 of 68 types**.

**Schema:** `startup` on `checklist_type_enum` and `finding_origin_enum`;
`yn_nr_na_hold` as a new `status_type` with the pairing CHECK guard-proven
3/3; `prestart_banner` + its instance snapshot; `kind` on the type register
with a **DEFERRABLE INITIALLY DEFERRED** mixed-kind targeting trigger, also
guard-proven 3/3.

**Four laws recorded in ARCHITECTURE**, each with its incident: *identity can
live in a binary* · *a pattern is verified by executing it, never by reading it*
(a Python `\b` became a literal backspace and survived two greps) · *a new
permission is audited in the batch that introduces it* (four fires, one author) ·
*template content law — universal first, convergence earns the item*.

**Guards added and demonstrated firing**, not merely written: the HOLD pairing
CHECK, the mixed-kind targeting trigger, the convergence assertion, the
firm-practice sole-anchor refusal, the empty-section-needs-a-reason refusal, the
gap-fill-never-creates-a-template refusal, and the collision tripwire that caught
23 of 81 masters being silently overwritten.

**Regression found and fixed at the cause:** re-zipping the Cx Plan skeleton
added four directory entries Word never wrote, and `pw-cx-plan`'s hand-rolled
PK walk then read an empty document and failed five content assertions on correct
content. Fixed by restoring byte-layout parity rather than by patching the
reader; the naive-walk hardening is on the residue list under the touch-policy.

**Template hygiene pass (`hygiene-2026-08-06`)** — diagnosed read-only, ruled,
then executed from a ratified artifact: **113 → 76 startup templates** (77 after
the main pass, 76 after the 7c follow-ups), six true
duplicate clusters merged 30→6 with the **union of provenance** preserved in
`revision_label`, boiler 3→1 *after* twelve steam-conditional rows were seeded
(merging first would have locked in a wash-out), pump 13→1 at 45 items with five
adopted conditional rows and a sixth recorded as already-covered, `air_dryer`
minted, two mis-keyed templates re-keyed. `ivc`/`pfc` untouched. The applier's
unaccounted-row refusal **fired on the first run** (16 rows) and was answered
with an enumerated alias list rather than a looser matcher — a matcher able to
absorb those would also swallow rows that genuinely differ. The one live
instance's five snapshot columns were re-read after the write and are
byte-identical: Rule 4 proven, not asserted. Full record:
[TEMPLATE-HYGIENE-PROPOSAL.md](TEMPLATE-HYGIENE-PROPOSAL.md) § As executed.

**Hygiene 7c — the two follow-ups, ruled and executed the same day.** The
`fire_pump` husk was **deleted** after its mine artifact was read and shown to
have yielded zero checklist rows (its one section-A row carries
`"standing_item": true`); its master path is unioned onto the drafted survivor so
the record that a sprinkler-tree master mined empty survives the template.
**`ahu_builtup` minted** — *Built-Up Air Handling Unit*, alias `Compartment Unit`
seeded exact-match — and `COMPARTMENT UNIT SYSTEM` re-keyed to it, which leaves
`ahu` a single template. **113 → 76**, 69 types.

**The coil repair, and the correction inside it.** The proposal read four
repeated rows as two coil blocks and recommended `HEATING COIL:` / `COOLING COIL:`
prefixes. Reading the raw source refuted both halves: the master has **three**
content tables (general construction, filters, cooling coil) and **no heating
coil at all**; the repetition is a second piping group inside the single cooling
block, and three checks repeat, not four. So the repair got larger and more
accurate — the mine had dropped **every** block heading, and all three are now
restored as prefixes, with the two piping groups distinguished as *first* and
*second* because the source shows two and names neither. The applier reads the
headings out of the source artifact rather than carrying its own table, and a row
it cannot place in a source block is a refusal (50/50 placed, zero refusals).
Recorded in ARCHITECTURE as the phantom-data mirror: **eager dedup deletes real
structure; the cure for apparent duplication is reading the source, not
collapsing the rows** — inventing structure and deleting structure are the same
mistake in opposite directions.

Carried forward as its own act: `fire_pump`'s nameplate defs. The deleted
master's eleven-field table was held out of the deletion and proposed separately
(`proposals/fire-pump-nameplate-additive.json`, **unratified**) — five additive
identity fields, because `fire_pump` carries 37 duty-and-controller defs and **no
identity block at all**: it can say what a fire pump is rated to do and cannot
say which machine it is.

**The naming law** comes out of that pass and is now standing for every family:
`<Type display name> — <qualifier>`, display name from the **register** and never
from the source document, qualifier only to distinguish siblings.
*A qualifier that does not change the checklist does not belong in the
checklist's name.* Enforced mechanically — the applier refuses a name that does
not open with its type's register name.

**Closing gates:** sweep CLEAN at 20 retired values across all families including
both startup modes · battery 31/31 · tree clean.
## Update 1.05 — 2026-08-04 · field-tested 2026-08-05

*Field test **passed**: the full flow walked on Clairlea and Workman — upload,
find pages, confirm, extract, review. Battery 31/31. The extractor calibration
campaign is closed; its record is
[EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md).*

### For the team

**Dragging a big drawing set in shows you everything it found.** A sheet with
four schedules on it becomes four tables, and the app now tells you *"2 pages
split into 10 tables — 95 rows in total"* before opening the first. Previously it
opened one and said nothing about the rest, which made a page that read perfectly
look like it had barely read at all.

**Nothing gets pre-ticked on a guess.** If the page-sorter can't run — it happens
on sets with a lot of scanned sheets — pages are still offered to you, just none
of them pre-selected, and the app says so. A page only arrives ticked when there
is real evidence for it.

**Typed equipment always gets its full nameplate.** Units created by intake used
to show only Manufacturer / Model / Serial. Every typed unit now renders its
type's whole field set, empty and ready, on every project. **You fill nameplates;
you never have to build them.** 323 fields were backfilled across existing
projects.

### Technical record

**F3 — def seeding is structural.** `api/intake.ts` mentioned
`project_equipment_field_defs` zero times; `ensureFieldDefs` lived in
`EquipmentPage.tsx` as a client-side UI event handler. So intake typed units
correctly and never seeded the template the nameplate reads — the
retroactive-typing lesson recurring through a different door. Fixed with a
**database trigger**, not another call site: intake approval, picker,
retroactive ratification, manual assignment and every path not yet written.
*Calling one function from N call sites is a rule the N+1th call site breaks.*
Census: 9 (project, type) pairs, 323 def rows; zero pairs remain missing;
mechanism proven in both states. Product rule in the Build Spec.

**F2 — assembly, not extraction.** The ledger showed production had run the
splitter and the amended budget class and returned **88/88 on p17 through the
real endpoint**. `onStaged(staged[0])` showed one of ten uploads. Fixed by
stating the total before the review opens.

**F1a — the pre-tick violation.** `picked` still read `p.titled` after the
verdict logic stopped trusting it; with the sorter down that was the only signal
left. Now `headerSignature || sorted-confirmed`. Three new `pw-schedule-finder`
legs including the arrival check.

**Not a parity defect:** the deployed filter is the calibrated one; 23 candidates
is by design.

**One row per physical unit** — ruled into the extractor's contract. Comma /
ampersand / slash tag lists expand (`B-1,2` → two boilers) carrying the line's
spec values; **ranges are not expanded** (a range states a count without stating
tags, and inventing tags is inventing data). Gate hand-counts are now
physical-unit counts. p16 re-gated: **11/11**, deterministic where it used to
vary between 7 and 11.

**Sort renders at 0.22** — the budget-class law applied to pixels; the sorter is
a classifier, not a reader. Clairlea's payload 2,026 KB → 527 KB with **zero
verdict changes**. Extraction still renders at 2.0. *Limit on record:* the sample
held no scanned schedule, so it proves no false positives, not preserved true
positives.

**A field report describes the SCREEN, not the system** — reconcile against the
ledger before diagnosing the pipeline.

**Correction recorded:** p16's regions are not clipping — the boxes are correct
and the 7-vs-11 difference is multi-unit row expansion (`B-1,2` as one row or
two), which needs a ruling in the extractor's contract rather than a fix.

**New standing rule.** *A gate that runs through a harness proves the harness.*
The gate is the field flow; harnesses are callers of production modules, never
siblings — the one-matcher rule applied to a pipeline.

**Parked:** BACKBURNER 3f, the extraction-rules harvest — the librarian's next
client, waking when a few real sets have been extracted and reviewed.

---

## Update 1.04 — 2026-08-04

### For the team

**Dragging a drawing set in now actually works.** It did not. If you dropped a
PDF, picked the schedule pages and hit extract, **every page failed** — silently
enough that the only way anyone found out was by trying it on a real job and
telling us. That is fixed, and it was our bug, not the drawings'.

**It finds the right pages now.** On a real 55-page tender set it used to offer
you 24 pages; it now offers **4** — and they are the four that actually carry
schedules. The rest are still one click away if you want them; they just are not
pre-ticked any more.

**Big schedule sheets read properly.** A sheet with four schedules on it — wall
fins, forced flow heaters, convectors, eighty-eight units between them — used to
fail outright. The app now finds each table on the sheet and reads them one at a
time.

**Scanned drawings work.** Old sheets with no text layer — the scanned ones on
every retrofit job — go through the picture path and come back with rows.

**Unit Ventilator** joined the equipment library, found by the app reading a real
Clairlea schedule and telling us it did not recognise it.

**One thing to expect:** on a big set you may see *"Sort next 40"*. That is the
cost guard — it reads 40 undecided pages at a time so a 300-page set can never
quietly spend a fortune. Click it again for the next 40.

### Technical record

**The seam, and it is the whole field report.** `api/intake.ts` derived the media
type from `intake_uploads.filename` via `split('.').pop()`. The schedule-page
finder names uploads `"…-IFT.pdf — page 7 (M-301)"`, so that returned
`"pdf — page 7 (m-301)"`, matched nothing, and 400'd — **for every confirmed page,
on every set, from the day the feature shipped**, while a valid PNG sat in
storage that nothing looked at. **R18 — filenames lie — is the firm's own rule,
and our code broke it.** Fixed: `intake_uploads.media_type` recorded at creation
from the object's leading bytes; the endpoint re-sniffs the stored object and its
reading is authoritative; the extension→media map is deleted; refusals now carry
the evidence. Swept for the pattern: one real violation, two benign.

**Diagnosis before fixes, on four real TDSB sets (93 pages).** The taxonomy and
both before/after tables are in
[EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md).

**Finder: 47 pages proposed → 9.** Density cannot separate a schedule from a plan
— Clairlea p4 is a *plan* with 142 column runs, p17 a real schedule with 147.
What separates them is a **header row**: an identity column with two or more
descriptive columns beside it, within a short run of text items. Title alone no
longer claims a page either (a TDSB title sheet carries a drawing list; plan
sheets say "as per schedule" in notes). Everything else drops to *ambiguous* and
is offered, not claimed.

**Rotation: fixed and inert, stated plainly.** Column detection now buckets along
the page's true horizontal per `/Rotate`. It changed the measurement on exactly
the 10 rotated pages and flipped zero verdicts, because the threshold was the
binding constraint. Right fix, no effect on this corpus.

**Table-region splitting (2b) — SHIPPED, GATE PASSED.** Clairlea M-601's 88 units read exactly: 32/8/30/18 against the hand counts, 59.3¢, cross-region tag tripwire silent. Two earlier runs are kept in the record because the sequence is the argument — 40 rows truncating, then 136 with 48 phantom, then 88.

**Superseded note:** Region detection is correct
(Clairlea p17 → its four real tables, p16 → its six) and the budget-class fix is
proven, but the gate fails at 136 rows against 88: on a multi-column sheet two
crops read the same column, so it is **not yet safe to trust there**. Details in
[EXTRACTOR-CALIBRATION-PROPOSAL.md](EXTRACTOR-CALIBRATION-PROPOSAL.md).

**Budget classes gained a thinking posture (Law 4).** `extraction` sends
`thinking: { type: 'disabled' }` — reasoning classes buy thinking, extraction
classes buy output, and a class that lets thinking eat the output budget fails on
exactly its densest, highest-value inputs. Measured: 0 thinking tokens against
581 / 1,177 / 5,396 / 4,267 before; both previously-truncating regions now
complete; cost 165.1¢ → 77.7¢.

**Original 2b note.** Clairlea M-601 carries 88 units in four tables;
sent whole it logged `outcome: truncated` at 16,000 output tokens having spent
**10,684 thinking**, and cost 27¢ for nothing. Row ceilings were rejected — a
mechanism that fails on the highest-value page is backwards. The **first attempt
also failed and is recorded**: spatial gap-clustering fragmented that page into
318 pieces. What works is segmenting on header rows **in reading order**, because
these PDFs emit text table by table. A page with one table returns no regions and
is read whole.

**Sort ceiling: chunked continuation, not a raise.** The 40-page guard and its
cost visibility stay; the dead-end refusal becomes *"Sort next 40"*.

**`unit_ventilator` minted** — surfaced by the extractor reading Clairlea p16
correctly and returning it unresolved at 0.55. The learning loop end to end: real
page → honest abstention → propose flow → ratified mint.

**Fixture library (Phase 3).** `samples/calibration/FIXTURES.md` is committed;
the drawings are not and never will be. The manifest records what each fixture
contains, what each page exercises, and **what the corpus does not contain** —
no scanned page carrying a schedule, no two-page continuation, no non-TDSB
consultant — so absence is never mistaken for coverage. Suites skip loudly by
name.

**New standing rule.** *A test boundary chosen for safety creates a known-untested
seam — name it.* The finder's render-and-look gate stopped at the confirm screen
deliberately and correctly; that is exactly where the break was. Every gate report
now names the legs it did not walk.

**ShareSync: zero writes**, verified by a pre/post integrity sweep over sizes,
mtimes and sha256 of every file in all three folders — identical.

---

## Update 1.03 — 2026-08-03

### For the team

**Typing equipment now suggests as you go.** Start typing in the Equipment Type
box: `UH` finds Unit Heater, `FCU` finds Fan Coil Unit, `BLR` finds Boiler, `XFMR`
finds Transformer. Pick it and the unit is typed on the spot — nameplate fields
appear immediately. The suggestion tells you *why* it matched, so you never have
to wonder whether it guessed.

**If nothing matches, you're still not stuck.** The last row in the list offers
*"No matching type — propose '⟨what you typed⟩'"*. Choosing it **saves the unit**
with the name you wrote and sends the name to Tony for the firm library. Once it's
approved, every matching unit picks it up. Same box in the Cx Index add form, the
equipment editor, and the intake review screen.

**The app drafts nameplate tables now.** When a new equipment type is added, it
proposes the fields — field, unit, imperial unit, and which of the three columns
each belongs in — for Tony to edit and approve. Nothing is saved until he does.

**Drop a whole drawing set into equipment intake.** Instead of finding the
schedule pages and exporting them yourself, drag the whole PDF in. It reads the
pages, shows you the ones that look like schedules — sheet number, title, and a
thumbnail — and **only the pages you tick get read**. Your existing habit still
works and is still fastest when you already know the page numbers.

**The equipment library went from 19 types to 47.** It now covers the whole
commissioning world you actually work in, not just the mechanical core:

- **Mechanical** — rooftop units, make-up air, HRV, VRF, dehumidifiers, duct
  heaters, heat exchangers, air separators
- **Electrical** — transformers, switchgear, switchboards, motor control centres,
  lighting panels, VFDs, UPS
- **Plumbing** — domestic hot water heaters, water softeners, backflow
  preventers, air compressors, sump pumps
- **Fire and life safety** — fire pumps, jockey pumps, fire alarm panels, fire
  smoke dampers, and the smoke-control side: smoke control fans and the
  firefighters' smoke control station
- **Conveying and envelope** — elevators, louvers

**Every one of those 47 types has proper nameplate fields**, built against the
standard that governs it — NETA for the electrical gear, NFPA 20/25 for the fire
pumps, CSA B64 for backflow preventers, AHRI for the air-side equipment, ASME
markings on the vessels, ASME A17.1/CSA B44 for elevators. Not a generic list:
what an acceptance record is actually expected to hold.

**Shorthand is yours to edit.** Classifications → Equipment Types has an Aliases
column. Add the shorthand your projects actually use and it works everywhere
immediately.

**A fixed crash:** the Classifications screen had been going blank on open. It's
back — that's where proposed types are approved.

**One habit, unchanged and worth repeating:** when a project has a mechanical
schedule, don't type equipment by hand. Extract the schedule pages and drag them
into equipment intake — or now, drag the whole set and let it find them.

### Technical record

**The 1.02 trio** (shipped this arc, folded here): the suggestion-as-you-type
picker on three surfaces with the shared `resolveType` gaining an exact-only
alias tier; AI-drafted starter field sets via the `drafter` agent; and the
schedule-page finder — deterministic text-layer filter in the browser, the
`sorter` agent only on what the filter cannot call, the extractor only on what a
human ticks.

**The catalog campaign: 19 → 47 types.** Researched against CSA Z320, ANSI/NETA
ATS, OmniClass/UniFormat and the ASTM E2813/E2947 BECx framework rather than
free-associated. Six mints came from *demand evidence* — untyped units already
sitting on live projects (18 Transformers, 7 Lighting Panels, 7 Heat Exchangers,
2 Switchboards, 2 Electric DHW Tanks). All minted **base-only**; every table
arrived afterwards through ratification.

**The census matcher fix.** The retroactive re-check proposed 7 moves and **four
were wrong**: `Pump - Boiler 1` and `Heating Boiler B-2 Circulating Pump`
resolved to `boiler`. Both are pumps. `pump` and `boiler` are each one token, both
matched, and the tie-break was `tokens.length > best.specificity` — *strictly
greater* — so the first type in **sort order** silently won. The sort order was
deciding the type, on a live project. Fixed: equal-specificity matches on
different keys **return null** — the words name two types, so the words do not
decide and a human does. A more specific term still wins outright. One test
asserts **sort order cannot change the answer** by running the same descriptor
against a reversed vocabulary. Census after the fix: 3 moves, all correct,
batch-tagged, read back.

**Ratification binds to an ARTIFACT — recorded as a law.** The batch runner's
`--apply` flag re-ran the drafter and wrote whatever came back; the model is not
deterministic, so **a field was applied that was never ratified**. 185 def rows
and 10 ledger rows written un-ratified, reversed by insertion timestamp. The law
now reads: *what is applied is the stored, reviewed content — byte-identical to
what the human read; draft tools cannot write, apply tools cannot draft, and the
applier refuses when the target has moved since ratification.* Mechanism:
`proposals/batch-N-ratified.json` + `apply-ratified.mjs`, which makes no model
call, refuses on a moved target, and reads back every field it claims to write.

**Every ratification surface audited against it**, rather than assumed: drafter
(fixed), librarian (complies — inserts `status='proposed'` and says so), mint
queue (complies), classifier rule ratification (complies), classifier *exception*
ratification (**partial** — re-queries equipment at apply time; deterministic, so
not this law's failure, but no moved-target check. On BACKBURNER with the fix
named).

**Four drafting batches, standards-anchored, delivered for ratification.** 45
tables, 993 def rows written this arc, ledger fed per type with the anchor as
evidence. The discipline held in the direction that is hard to get: the drafter
argued *against* additions on the types with the most live units (*"a fin and a
casing don't need much more"*), separated standard from convention unprompted,
declined to draft medical-air fields under a standard it was not given, and
refused per-tap turns ratio as *"a table within the nameplate"* — which was
correct and became BACKBURNER 3d.

**The IST addendum.** Anchored on CAN/ULC-S1001, whose scope decides most of the
question: it verifies the **interconnections** between two or more fire
protection and life safety systems and **explicitly not those systems
themselves**. Two mints — `smoke_control_fan` (clearing the RTU-vs-AHU bar on a
different standard, power source, test and consequence of failure, with a
`Smoke Control Duty` discriminator inside it) and `smoke_control_panel`.
Everything else argued *not* to be a type with the reasoning recorded: door
holders, mag locks, elevator recall (scope on `elevator`), load-bank connections
(a field on `generator`), and sprinkler supervisory devices (**points on a
system**).

**The applicability exception, with its edge as a condition of adopting it:**
*IST-minted types only, the fire-integration stage group only, ruled in the same
sitting as the mint.* Written down because the argument generalises badly, and
because **a wrong ruled rule is silently wrong on every future project while a
wrong proposal is read once and rejected.**

**Variants are DATA** — types are equipment classes, variants are values, and
splitting is a mint ruling at the RTU-vs-AHU bar, never a drafter decision.
Precedents both ways: `booster_pump` and `unit_heater_gas` declined;
`fire_pump`/`jockey_pump`/`sump_pump` minted.

**Coverage closed.** All 47 types carry a nameplate table — **zero without**.
Four sit below the 10-field bar with their arguments recorded rather than padded:
`convector` and `wall_fin` at 8 (passive emitters, restraint endorsed),
`jockey_pump` at 8 (the amendment's own arithmetic), `ats` at 10 (standing).

**Parked this arc** — [BACKBURNER](BACKBURNER.md): portal endpoint consolidation
(frees 3 of Vercel's 12 function slots; never as a side effect of a feature),
repeating-measurement test structures (per-tap TTR as founding case, with NETA,
BECx and NFPA 25 siblings), and the IST module (scenario matrix, deficiencies
filing into the existing findings register, waking at the first scheduled IST).

**Harness:** `pw-type-picker` 20 · `pw-drafter` 10 bare / 18 with `--real-ai` ·
`pw-schedule-finder` 13 bare / 17 with `--real-ai`. Battery 31/31.

---

## Update 1.02 — 2026-08-03

*All three items shipped. Folded into 1.03's team note; kept here as the as-built record of the trio itself.*

### For the team

**Typing a piece of equipment now takes three letters.** Start typing in the
Equipment Type box and it suggests as you go: `UH` finds Unit Heater, `FCU` finds
Fan Coil Unit, `BLR` finds Boiler, `XT` finds Expansion Tank. Pick it and the
unit is typed on the spot — nameplate fields and checklist applicability appear
immediately, no save-and-reload.

**The suggestion tells you why it matched.** Under "Unit Heater" you'll see
*matched "UH"*. You never have to wonder whether it guessed.

**Unknown equipment still never stops you.** If nothing matches, the last row in
the list offers *"No matching type — propose '⟨what you typed⟩'"*. Choosing it
**saves the unit** with the name you wrote and sends the name to Tony for the
firm library. The unit is never blocked, and once the type is approved every
matching unit picks it up.

**Same box in all three places** — the Cx Index add form, the equipment editor,
and the equipment intake review screen. One behaviour to learn, not three.

**Shorthand is editable, not baked in.** Classifications → Equipment Types now
has an Aliases column. Add the shorthand your projects actually use and it works
everywhere immediately.

**New types can draft their own nameplate table.** Mint a type in
Classifications and, while it has no fields yet, a **draft fields** link appears
beside it. It proposes a table — field, unit, imperial unit, and which of the
three columns each belongs in — and you edit it, cut rows, and approve. **Nothing
is saved until you approve**, and minting with identity fields only is still a
perfectly good outcome.

It is deliberately conservative: for a convector it proposed ten fields and said
in its note that it left out control-valve details because those usually belong
to a valve record rather than the convector nameplate — and asked you to flag it
if the firm's convention differs.

**You can drop a whole drawing set into equipment intake now.** Instead of
opening the PDF, finding the schedule pages and exporting them yourself, drag the
whole set in. It reads the pages, shows you the ones that look like schedules —
sheet number, title, and a thumbnail of each — and **only the pages you tick are
read**. Each ticked page is one extraction, and it says so before you spend it.

Pages it is sure about arrive ticked; pages it is only offering arrive unticked,
so a glance is enough. If it can't read a page at all it still shows it rather
than dropping it.

**Your existing habit still works and is still the fastest** when you already
know the page numbers: export those pages and drag them in. Nothing about that
path changed.

**A fixed crash:** the Classifications screen had been going blank on open. It's
back — that's where proposed types are approved.

### Technical record

**Alias tier on the shared matcher.** `resolveType` gains
`resolveTypeDetailed`, which resolves in three tiers — canonical name/key →
**exact alias** → all-words most-specific-wins — and reports which tier hit so
the UI can show `matched "UH"`. `resolveType` is now a thin wrapper: still
exactly one matcher, still shared with the intake path.

**Aliases match exactly and never as words.** `UH` → Unit Heater; `UH-3 PUMP
ROOM` → nothing. Ranking for *display* is deliberately looser than matching —
loosening the ranker cannot type a unit, loosening the matcher could type a
hundred.

**`equipment_type_aliases`** — vocabulary data, admin-edited beside the types,
`unique(lower(btrim(alias)))`. Seeded with 31 ruled entries including DOAS→ahu
and BLR→boiler.

**`blocked_type_aliases` + BEFORE INSERT trigger.** The never-alias list with the
reason attached: `rp` (the RADIANT/RECEPTACLE collision), `ct` (current
transformer), `ch`/`p`/`wf` (tag-prefix collisions), and `rtu`/`hrv`/`vrf` —
ruled **distinct equipment**, which arrive through the propose flow. Enforced at
the database, not in the UI.

**The never-blocked save.** `equipment.observed_type_name` (new column) plus a
deduped `proposed_equipment_types` entry; the waiting-unit count is **derived,
never stored**. `api/intake.ts` now carries the observed name onto created units
so an approved unknown row and its later ratification can find each other.

**Three self-catches, all instances of rules already in ARCHITECTURE:**

1. The queue dedup index was a **no-op** — `org_id` is NULL on every row and a
   plain unique index treats NULLs as distinct, so both duplicate inserts
   succeeded while the index existed and read correctly. Fixed with `NULLS NOT
   DISTINCT`; caught because the pw leg asserts the second insert is **refused**
   rather than asserting the index is present.
2. `pw-type-picker`'s surface-1 check was `check(true, …)` after a bounded wait —
   passing while the wait timed out. A check that answers the same in both
   states, written the same evening as the rule against them.
3. **The Classifications page had been crashing to a blank screen since
   2026-07-27** — `useState`/`useEffect` below an `if (loading) return`, a
   hooks-order violation. Every structural assertion stayed green because the
   data behind the screen was correct. Found by taking a screenshot.

**The drafter — a seventh agent.** `firm-knowledge/agents/drafter.md`,
`budget_class: prose` with the reasoning stated in the contract itself (the
classifier's zero-text incident is why a bounded question does not get a
`reasoning` budget). Measured after, per the ruling; the class moves narrower
before wider.

**Law 9 at the shape.** `FieldSetDraftInput` requires a non-empty
`base_field_names` — the contract forbids duplicating the universal identity set,
so that set is a required input rather than something the model must know. Base
collisions are also dropped at the endpoint: a rule living only in prose is one
the next model version may not follow.

**No 13th serverless function.** `api/` is at Vercel's ceiling of 12, so the
drafter routes through `api/intake.ts?action=draft-field-set`. Refusals before
any spend: not staff · unknown type · **a type that already has a table** (409,
count named). The portal-endpoint consolidation that would free three slots is
parked with its own gates.

**Two more self-catches on the first real call:** the contract had **no Return
shape section**, so the model was never told the JSON — every call failed
`contract-output`. And `pw-drafter` asserted field properties with `.every()`,
which passes vacuously on an empty array: four checks went green on zero fields
when the draft failed. Arrival is proven first now.

**The schedule-page finder — three costs, cheapest first.** The deterministic
text-layer filter runs in the **browser** (free, every page); the new `sorter`
agent sees only what the filter could not call (~1–2¢/page); the extractor sees
only what a human ticked. `sorter` takes `slices: [terminology]` alone — identity
and style cannot change whether a page is a table.

A failed sort **fails open into the human's hands**: pages come back undecided to
the confirmation screen, never dropped and never guessed in. The page ceiling
refuses with the alternative named rather than truncating quietly. One upload per
confirmed page, because the extraction budget is per page — so a set where page
44 fails still yields 41 and 42, and failures are named rather than counted.
`intake_rows.source_sheet` / `source_page` already existed and are now populated;
`intake_uploads.selected_pages` is the only schema delta.

**Render-and-look caught a real behavioural defect.** Run against a completed
*checklist* PDF, two of its three pages arrived **pre-ticked** — a checklist is
also a dense tagged table with MODEL and MANUFACTURER headings and scored "8
schedule terms in 30 columns". Being offered is cheap; being ticked by default is
a claim. Only a page **titled** a schedule, or one the sorter confirmed, is
pre-ticked now. The candidate grid also overflowed its panel; bounded and
scrolling.

`pw-type-picker.mjs` — 20 legs. `pw-drafter.mjs` — 10 bare, 18 with `--real-ai`.
`pw-schedule-finder.mjs` — 13 bare, 17 with `--real-ai` (the real sort called the
pump schedule a schedule and refused the **door** schedule as "a real schedule,
wrong discipline"). All three in the battery; the two agent suites run bare
there, like the extractor, because a battery that bills on every commit gets run
less often. Wait helpers from birth. **Battery 30/30.**

**Named gap, not covered by any suite:** the deterministic filter's accuracy on a
real multi-page drawing set. There is no ZZ-TEST fixture set, and a synthetic PDF
would test the synthesiser. That leg is a manual render-and-look, and the suite
header says so rather than letting its absence read as coverage.

---

## Update 1.01 — 2026-08-02

### For the team

**Adding contacts from a project's Team tab now captures everything.** Before, it
only saved a name — no phone or email, invisible to distribution lists. Now it
opens the full contact form (the same one the Directory uses) with the company
pre-filled. People are complete from the start. *(Adam's suggestion.)*

**Click any team member's name** to jump to their full contact card.

**Distribution lists: "Add from team"** pulls the whole project team in with one
click.

**Equipment can be copied.** Ten identical pumps: enter one, copy, change the tag.
Specs copy; serial numbers and verification work never do — those belong to each
physical machine.

**Equipment can be deleted — safely.** Mistaken units delete cleanly; units with
linked findings are blocked, and the app shows exactly which findings.

**Unknown equipment doesn't stall you.** Add it anyway — it saves immediately with
manufacturer/model/serial, the name goes to Tony for the firm library, and once
approved, every matching unit updates automatically on every project. *(Clairlea
went from 93% blank nameplates to nearly all working this way.)*

**Every unit now shows Manufacturer, Model, Serial** — even untyped. Boilers
gained fluid type, pumps a VFD yes/no, unit heaters MBH. *(Adam's and Mahan's
requests.)*

**Small fixes:** the second-email save error is fixed · dashboard text overlap
fixed · location fields suggest the project's existing spellings · units (L/s,
GPM) now show beside the input box.

**One habit:** when a project has a mechanical schedule, don't type equipment by
hand — extract the schedule pages from the PDF and drag them into equipment
intake. The app reads them, proposes the list, you review and accept. **Pages, not
screenshots** — keep the text layer.

*Everything above except two items came directly from team feedback — keep it
coming.*

### Technical record

**Contacts.** Shared `ContactModal` extracted; Directory and the Team tab now sit
on one save path via `replace_contact_channels` — the four-request silent-failure
path is retired. Team-name click-through to the Directory contact.
Contact primary-constraint write-order fix.

**Distribution.** Add-from-team on project distributions (copy, not sync).

**Equipment.** Copy-equipment (template only — never serial or verification state,
tag cleared). Reference-aware delete: findings **named**, not counted.
Location Combobox suggestions. Unit-beside-input.

**Nameplates.** `__base` universal identity set, applied by resolver-prepend so
untyped units record identity too. Campaign seeded: `panel` / `humidifier` /
`radiant_panel` / `unit_heater` tables; `boiler` +Fluid Type, `pump` +VFD,
`fan` +MBH; `heat_pump` trimmed 25 → 14.

**Type vocabulary as a learning system.** Four mints this cycle — `unit_heater`,
`wall_fin`, `convector`, `expansion_tank` — with name variants *mapped* rather
than minted separately. 118 units retroactively typed and def-backfilled,
batch-tagged.

**Dashboard.** Radar axis and clipping fixes.

**Harness.** Read-after-write sweep: bounded waits, absence-assertions-prove-
arrival-first; ~150 remaining reads governed by the touch-policy rather than a
backlog.

**ARCHITECTURE.** Six rules added this cycle, each with its incident evidence.
