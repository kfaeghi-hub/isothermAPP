# Attaching a checklist to a SYSTEM, not a unit — proposal

*Requested 2026-08-06. **Proposal only — nothing builds until this is ruled.***

## Why it is being asked now

Twelve of the 81 Start-Up templates have no `equipment_type` and correctly never
will. They are systems and assemblies: sprinkler piping, preaction valve
stations, standpipe, smoke management, egress, fire and smoke separations, the
three BAS control masters, gas-fluid distribution, and the heating-system
start-up procedure.

The catalog already ruled on this and the ruling stands: *"Sprinkler and
standpipe are systems, and the Cx Index already models that: `equipment.kind` is
`equipment | system`. Minting them would put the same thing in two places."*
The **standpipe mint was refused on 2026-08-06 for exactly that reason** — a
template wanting a home is a template-attachment question, not a taxonomy one.

**The load-bearing fact: `equipment.kind` exists in the schema and in the TS
union, and there are ZERO `kind='system'` rows in 935 equipment records.** The
model was ruled, built, and never populated. Nothing needs inventing; something
needs finishing.

---

## The five questions, and a proposed answer to each

### 1. What does a template attach to?

**Proposal: nothing changes structurally.** `checklist_templates.equipment_type`
stays the FK to the type register. Systems get **type register rows whose kind is
`system`**, and the register gains the same `kind` column the equipment table
already has.

**Why not a separate `system_type` column or table:** a template targets *a thing
in the Cx Index*. Equipment and systems are both things in the Cx Index — they
already share one table and are distinguished by one column. Adding a parallel
attachment path would create two ways to express the same relationship, which is
the shape that produced the `deliverable_templates` / `checklist_templates`
confusion the Build Spec still has to warn about.

**Consequence to accept:** `equipment_types` becomes `catalog_types` in meaning
if not in name. Recommend keeping the table name and adding `kind`, because a
rename touches every import and buys nothing.

### 2. Instance targeting

**Proposal: unchanged.** `checklist_instance_targets.equipment_id` already points
at an `equipment` row, and a system IS an equipment row with `kind='system'`. A
sprinkler start-up instance targets `SPR-1`, a system row, the same way an AHU
instance targets `AHU-1`.

**One rule worth ruling explicitly: a checklist must not mix kinds in its
targets.** A fleet checkout across three AHUs is coherent; a checklist targeting
one AHU and one sprinkler system is not, and would render a nameplate grid with
two incompatible column sets. Proposed as a DB CHECK or a trigger — the same
structural-enforcement choice the `NULLS NOT DISTINCT` fix taught.

### 3. The Cx Index's system rows — who creates them?

**Proposal: the same three paths equipment already has** — intake extraction,
manual add, and the classification composer — with `kind` set from the type
chosen. No new mechanism.

**The intake question that follows:** a schedule extraction returns equipment. It
does not return "the sprinkler system". System rows will in practice be created
by hand or by the classification composer, and the composer is the interesting
option: a project classified as having a sprinkler system could compose the
system row the way it already composes deliverables. **Recommend deferring the
composer path** and starting with manual add — one row per project, created once.

### 4. The nameplate-snapshot equivalent

This is the real design question, and the honest answer is that **a system has no
nameplate.** There is no plate on a sprinkler system.

**Proposal: `system attributes`, structurally identical to nameplate field
definitions and semantically different.** The nameplate grid answers *"what was
specified / drawn / installed"* for one unit. A system's equivalent answers
*"what is this system's design basis"*: design density and area of operation,
hazard classification, water supply and its test date, number of zones, riser
count, standpipe class.

**Reuse the field-def machinery, not the field-def table's meaning.** Same
three-column Specified / Shop Drawing / Installed structure works for design
density; it does not work for "hazard classification", which has one value.
**Recommend: system attribute rows are single-value by default, with the
three-column form available per attribute** — the Heating Medium precedent,
where the shape is data rather than a fork.

**If that is too much for a first cut:** ship systems with NO attribute block at
all. A sprinkler start-up checklist with no nameplate grid is still a useful
document, and an empty grid is worse than an absent one.

### 5. What the masthead reports

The Start-Up masthead currently reads the descriptor and tags of its targets:
`Air Handling Unit · AHU-1, AHU-2`.

**Proposal: unchanged mechanism, and it already works.** A system row has a tag
and a descriptor, so it renders `Wet Sprinkler System · SPR-1`. The masthead
reports its targets and does not care what kind they are.

**One wording ruling to make:** the band currently says EQUIPMENT START-UP
CHECKLIST. For a system target that word is wrong. **Recommend the band reads
from the target kind** — `SYSTEM START-UP CHECKLIST` — rather than adding a
per-template override, because the document should describe what it is pointed
at, not what someone typed.

---

## What this unblocks

- The **twelve untyped Start-Up templates**, which is the immediate cost.
- The **held-out sprinkler trio and standpipe's 11 items**, deferred with this as
  their destination.
- **BACKBURNER: the Acceptance Testing family**, which is predominantly
  system-shaped and depends on this mechanism existing.

## What it does NOT need

No new tables. No change to instance targeting. No change to the masthead
mechanism. The additions are: `kind` on the type register, a mixed-kind
targeting guard, and a decision about system attributes — of which the cheapest
defensible answer is *none, for now*.

## Recommended first cut, if ruled

1. `kind` column on the type register, default `'equipment'`.
2. Mint the system rows the Start-Up corpus needs: sprinkler, standpipe,
   preaction valve station, smoke management, egress, communication, gas-fluid
   distribution, and the three BAS control systems.
3. Re-key the twelve templates.
4. Mixed-kind targeting guard, DB-side.
5. Masthead wording from target kind.
6. **No system attributes in the first cut.** Add them when a real project needs
   a design density recorded, and let that project say which attributes matter.
