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
