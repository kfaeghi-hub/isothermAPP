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

*In progress — item 1 of three shipped. Items 2 (AI-drafted starter field sets)
and 3 (schedule-page finder) append to this entry as they land.*

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

`pw-type-picker.mjs` — 20 legs, in the battery. Wait helpers from birth.

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
