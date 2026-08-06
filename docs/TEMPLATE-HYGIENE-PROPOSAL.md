# Template hygiene — census, classification, proposal

*Diagnosed 2026-08-06. **Nothing merged, renamed or deleted. Every row below is a
recommendation awaiting a ruling.*** Data: `out/template-census.json` and
`out/template-hygiene-proposal.json`, produced by `template-census.mjs` and
`template-hygiene-proposal.mjs` — both read-only.

## Method, and one thing it caught about itself

Similarity is **Jaccard over normalised item-label sets**, not over names or
counts. Two templates with the same item count can be different checklists; two
with different counts can be the same checklist plus three rows.

The first census run reported **0 items on every template** — PostgREST caps a
select at 1000 rows and truncates silently. It was absurd enough to notice; a
subtler cap would not have been. Both scripts now paginate and print their read
counts (1,358 sections · 9,116 items · 247 instances) so the input is visible
before any conclusion rests on it.

---

## The census

**27 multi-template clusters across three families.**

| Family | Clusters | Templates | With live instances |
|---|---:|---:|---:|
| `startup` | 16 | 62 | **1** |
| `ivc` | 7 | 20 | 7 |
| `pfc` | 4 | 13 | 4 |

**The pattern is not startup-only, but the CAUSE is.** Every `ivc` and `pfc`
cluster is genuinely distinct content from the BCA/CSA masters — real equipment
variants that predate this campaign, all carrying live instances. **They are not
a mess and this proposal does not touch them.**

The `startup` duplication has a single mechanical cause.

---

## THE ROOT CAUSE

**Phase 1 seeded one template per master FILE, and the corpus repeats masters
across system folders.**

`S02-Pump P- CSP.doc` exists in twelve folders — `07 Pumps` under Domestic Water,
`Pumps` under Pure Water, under Treated Water, under Distilled, and so on. The
mine dumped each occurrence correctly (the filename-collision tripwire made sure
of that), and then the seeder created a template for each.

Their **names** came from the master's `SUBJECT:` row, which on plumbing masters
names the **system**, not the equipment. So the same pump checklist shipped as
*DOMESTIC WATER SYSTEMS Start-Up Checklist*, *PURE WATER SYSTEMS…*, *TREATED
WATER SYSTEMS…* — six names, one checklist.

**This is the same subject-vs-folder ambiguity that the type resolver already
handles.** The resolver reads the folder for the equipment; the namer read the
subject for the name. One of them was right.

---

## Classification and recommendations

### (a) TRUE DUPLICATES — 7 clusters, 30 templates → 7

Identical item sets (Jaccard 1.0), same master, **zero live instances.**

| Cluster | n → | Names to collapse |
|---|---|---|
| `startup/plumbing_fixture` | 6 → 1 | Demineralized / Distilled / Pure / Treated / Domestic / Nonpotable "WATER SYSTEMS" |
| `startup/water_tank` | 5 → 1 | same five system names |
| `startup/water_meter` | 5 → 1 | same five system names |
| `startup/dhw_heater` | 4 → 1 | four system names |
| `startup/mixing_valve` | 4 → 1 | four system names |
| `startup/glycol_tank` | 3 → 1 | one name, three copies |

**Recommend: merge, keeping the union of provenance.** The surviving template's
`revision_label` lists every source master it was mined from. **The mined
provenance is the firm's knowledge trail and is never flattened away** — six
folders found the same checklist, and that fact is itself worth recording.

### (a′) `startup/boiler` — 3 → 1, but NOT for the reason the number suggests

`FORCED DRAFT WATER BOILER` · `NATURAL DRAFT BOILER` · `STEAM BOILER` measure as
100% identical — **and they should not be.**

They are identical because the mined content was thin and the Phase 2 D/E fill
was written at the TYPE level, so it landed on all three and washed out the real
differences. **A steam boiler genuinely differs from a hot-water boiler**: water
column and gauge glass, different low-water-cutoff behaviour, blowdown.

> **Recommend: merge to one `boiler` template with conditional rows (the Heating
> Medium pattern) — AND open a Phase 2 follow-up for the steam-specific rows that
> are currently missing from all three.** Merging without that follow-up would
> lock in the wash-out rather than fix it.

This is the one cluster where the metric and the engineering disagree, and the
engineering wins.

### (b) DUPLICATES + VARIANTS — 2 clusters

**`startup/pump` — 14 templates, 4 content sets.** Tested against the
variants-are-data law:

| Set | Items | n | What it is |
|---|---:|---:|---|
| 1 | 40 | 7 | `PUMP Start-Up Checklist` — seven exact copies |
| 2 | 34 | 5 | the same checklist minus 6 rows, named after five water systems |
| 3 | 35 | 1 | as set 2, plus one row |
| 4 | 13 | 1 | **`SPRINKLER SYSTEMS` — a FIRE PUMP master, mis-keyed** (see (d)) |

Sets 1–3 differ by **six rows out of forty**. That is well inside the Heating
Medium pattern and nowhere near the RTU-vs-AHU bar.
**Recommend: one `pump` template, the six differing rows conditional. 13 → 1**
(set 4 leaves the cluster entirely).

**`startup/air_compressor` — 3 templates, 2 sets.** `AIR DRYERS` (18 items, ×2)
and `AIR COMPRESSOR` (28 items, ×1) are genuinely different machines sharing a
key. **Recommend: merge the two AIR DRYERS copies; then rule whether `air_dryer`
deserves its own mint** — a dryer is not a compressor, and the current mapping
was a batch-time convenience.

### (c) DISTINCT-BUT-BADLY-NAMED — the renames

Every survivor above is currently named after a *system* or carries a bare type
name. **Recommend the convention in the next section**, applied to all of them.

### (d) MIS-KEYED — 2 templates, not duplicates at all

Two templates sit in clusters they do not belong to, which is why those clusters
measured as "genuinely distinct" at 0–31% similarity:

| Template | Currently | Source | Should be |
|---|---|---|---|
| `AIR HANDLING UNIT Start-Up Checklist` (24 items) | `ahu` | `18 Supply Fan/S02-Supply Fan SF- CSP.doc` | **`fan`** |
| `SPRINKLER SYSTEMS Start-Up Checklist` (13 items) | `pump` | `03 Pumps/S02 Pumps- CSP.doc` (sprinkler tree) | **`fire_pump`** |

**Recommend: re-key, then rename.** A mis-keyed template is worse than a
duplicate — it renders the wrong nameplate block and offers the wrong checklist
to whoever picks it.

### Frozen records — 12 clusters flagged

**One startup template carries a live instance** (`AIR HANDLING UNIT`, 1) — the
ZZ-TEST fixture from Gap 1. All 11 other instance-bearing clusters are `ivc` and
`pfc`, which this proposal does not touch.

**No merge or rename touches a template with live instances without frozen-record
treatment**: the instance's snapshot columns already hold the name and revision
as issued, so a rename does not alter an issued document — but the template row
itself is superseded rather than edited, per Rule 4.

---

## THE NAMING LAW that comes out of this

Proposed as standing, for every family and every future campaign:

> ### `<Type display name> — <qualifier>`
>
> **The type's display name comes from the register, not from the source
> document.** A source names what the author was looking at; the register names
> what the thing is.
>
> **The qualifier is added only to distinguish siblings**, and states the
> distinction: *service*, *medium*, *fuel*, *configuration*. Never a system
> context that the equipment does not depend on, and never a number.

| Instead of | Use |
|---|---|
| `DOMESTIC WATER SYSTEMS Start-Up Checklist` | `Pump Start-Up Checklist` |
| `SPRINKLER SYSTEMS Start-Up Checklist` (a fire pump) | `Fire Pump Start-Up Checklist` |
| `Pumps (2)` | `Pump — Fire Service Start-Up Checklist` |
| `AIR HANDLING UNIT` (a supply fan) | `Fan — Supply Start-Up Checklist` |
| `FORCED DRAFT WATER BOILER` / `STEAM BOILER` | `Boiler Start-Up Checklist`, medium conditional |

**Why a system context is the wrong qualifier:** a pump serving domestic water
and a pump serving a heating loop get started the same way. The system it feeds
belongs on the *equipment record*, where it already lives, not in the template
name. **A qualifier that does not change the checklist does not belong in the
checklist's name.**

---

## Net effect, if ruled as recommended

| | Before | After |
|---|---:|---:|
| `startup` templates | 113 | **86** |
| Types covered | 67 | 67 (+ `fire_pump` gains a mined template) |
| Item rows | 3,123 | unchanged in substance; ~700 duplicate rows removed |
| Provenance records | one master per template | **unioned — every source master retained** |

`ivc` and `pfc` untouched.

## What needs a ruling

1. **The six true-duplicate merges** (30 → 6) — mechanical, no live instances.
2. **`startup/boiler`** — merge with conditional rows *plus* the Phase 2 steam
   follow-up, or leave separate until the steam rows exist?
3. **`startup/pump`** — 13 → 1 with six conditional rows.
4. **`air_dryer`** — mint as its own type, or keep mapped to `air_compressor`?
5. **The two re-keys** — Supply Fan → `fan`, Sprinkler Pumps → `fire_pump`.
6. **The naming law** — as stated, or amended.
