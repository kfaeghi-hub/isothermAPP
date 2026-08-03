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

## Update 1.02 — 2026-08-03

*All three items shipped.*

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
