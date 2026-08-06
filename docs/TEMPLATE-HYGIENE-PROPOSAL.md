# Template hygiene — census, classification, proposal

*Diagnosed 2026-08-06. **Ruled and executed the same day** — see
[As executed](#as-executed) at the foot of this document, which is the record of
what actually happened and supersedes the recommendations where they differ.*
Data: `out/template-census.json` and `out/template-hygiene-proposal.json`,
produced by `template-census.mjs` and `template-hygiene-proposal.mjs` — both
read-only. The applier is `apply-template-hygiene.mjs`, which executes
`proposals/template-hygiene-ruled.json` and nothing else.

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

---

# As executed

**Ruled 2026-08-06 — all six items approved. Batch `hygiene-2026-08-06`.**
Applied by `apply-template-hygiene.mjs --write` from the ratified artifact
`proposals/template-hygiene-ruled.json`. `ivc` and `pfc` untouched, as ruled.

## Order of operations, and why it was that order

**The steam rows were seeded BEFORE the boiler merge, not after.** Merging first
would have collapsed three templates into one and *then* asked what was missing —
which locks the wash-out in and calls it done. Twelve steam-conditional rows
(water column, gauge-glass blowdown, two-cutoff LWCO behaviour proven by lowering
the actual level, safety-valve lift-and-reseat, the four pressure readings)
were drafted against CSA B51 / TSSA / CSA B149.1, ratified, and seeded to all
three boiler templates. Only then did the three become one — identical now
*because each carries the full conditional set*, which is the correct end state
rather than the accidental one.

`air_dryer` was minted before the re-key for the same reason: the applier refuses
a target type that is not in the register.

## What the numbers actually were

| | Proposed | Executed |
|---|---:|---:|
| `startup` templates | 113 → **86** | 113 → **77** |
| Types covered | 67 | **68** (`air_dryer` minted; `fire_pump` gained a template) |
| Templates deleted | — | 36 |
| Clusters still >1 | — | 8, all pre-existing and genuinely distinct |

**The 86 was my arithmetic, and it was wrong.** The ruled *actions* were executed
exactly as ruled; 77 is what those actions produce (21 true duplicates + 2 boiler
+ 12 pump + 1 air dryer = 36 removed). Recorded rather than quietly corrected,
because the owner ruled against a figure I supplied.

## The six-row claim, checked before it was acted on

The proposal said the pump content sets "differ by six rows out of forty". The
raw label diff is **19 and 13**. The surplus is *wording*, not checks: `&` vs
`and`, a trailing period, and the boilerplate tail *"as per Drawings and
Specifications"*. After reconciling those, **exactly six genuinely distinct
checks remain** — so the figure was right, but the method that produced it was
luckier than it looked.

Five were adopted into the survivor, worded with their conditionals:

- Isolation / check valves installed per drawings and specifications
- Flow control valves … **where fitted**
- Essential / emergency power supply … **where the pump is so served**
- Flexible connectors installed **where fitted**
- Strainers cleaned after flushing

The sixth — *"Manufacturer's Operation and Maintenance Requirements and Data
Received"* — was **not** adopted: the survivor's first row already reads
*"Manufacturer's IOM start-up steps reviewed, completed & attached"*, and
*attached* is the stronger claim. Adopting it would have re-introduced the
duplicate this pass exists to remove. The decision is recorded in the artifact's
`covered_by` block rather than left implicit.

Survivor: **45 items** (40 + 5), one template where there were thirteen.

## What the applier refuses

Ratification binds to an artifact: `template-hygiene-proposal.mjs` cannot write
and `apply-template-hygiene.mjs` cannot draft. Four refusals stand between the
plan and a silent loss:

1. **A record is never absorbed.** Any template being *deleted* that carries a
   live instance stops the run. A survivor may carry instances; an absorbed one
   may not.
2. **Unaccounted rows stop the run.** Every item on every absorbed template must
   match a survivor row after reconciliation, or be named in `adopt`, or be named
   in `covered_by`. **This fired on the first run** — 16 rows across the pump
   cluster, because the 35-row variant carries *terser* labels ("Pressure
   Gauges") than the 34-row one ("Pressure Gauges Installed as per Drawings and
   Specifications"). Each was ruled explicitly in the artifact. **The fix was an
   enumerated alias list, not a fuzzier matcher** — a matcher loose enough to
   absorb those would be loose enough to swallow a row that genuinely differs,
   and that is the failure the guard exists to prevent.
3. **The naming law is mechanical.** A surviving name that does not open with its
   type's **register** display name is a refusal, not a warning.
4. **Frozen records are proven, not asserted.** Rule 4 permits the *template*
   correction; the *snapshot* is the record. The applier reads all five snapshot
   columns before the write and re-reads them after, and a single changed byte
   aborts the run.

## The one live instance

`AIR HANDLING UNIT Start-Up Checklist` (the ZZ-TEST fixture from Gap 1) was
renamed to **`Air Handling Unit Start-Up Checklist`**. Its instance's five
snapshot columns — name, type, revision label, nameplate, prestart banner — were
**re-read from the database after the write and are byte-identical.** Confirmed,
not assumed.

## Two findings the pass surfaced

**1. The `fire_pump` re-key produced a husk, and this is mine to own.** The
proposal said `fire_pump` "gains its first mined template". It gained a template
with **one** mined row. `03 Pumps/S02 Pumps- CSP.doc` yielded almost nothing; the
other twelve rows on it are the *pump* type's Phase 2 fill — motor overload, seal
chamber pressure, impeller rotation. It is a pump checklist wearing a fire pump
name, and it sat beside the batch-8 drafted `FIRE PUMP` template, which is a real
fire-pump checklist (churn pressure, automatic start on pressure drop, alternate
power transfer, controller alarms).

The re-key was still right — that template did not belong in the `pump` cluster.
But it left two templates whose names differed only by capitalisation, which is
precisely the fault this pass removes. **Named honestly rather than deleted
unruled:** the complete drafted one takes `Fire Pump Start-Up Checklist`; the
husk is `Fire Pump — Sprinkler Tree Source Start-Up Checklist`.
**Open for ruling: the husk should almost certainly be absorbed into the drafted
template — its single mined row already exists there verbatim.**

**2. `startup/ahu` still holds `COMPARTMENT UNIT SYSTEM Start-Up Checklist`** (48
items, genuinely distinct content, correctly keyed). Badly named under the new
law but not covered by this ruling, so not touched. Residue.

## Provenance

No merge flattened a source. Every survivor's `revision_label` carries the union:

```
Phase 1 mine · hygiene merge 2026-08-06 (13→1)
  · merged from: 01 Pumps/S02-Pump P- CSP.doc; 02 Pumps/S02-Pump P- CSP.doc;
                 09 Pumps/S02-Pump P- CSP.doc; Pumps/S02-Pump P- CSP.doc
  · source: 07 Pumps/S02-Pump P- CSP.doc
```

`source:` stays **last** so the census's existing provenance parser still reads a
primary. That six folders independently found the same checklist is itself a fact
about the firm's corpus, and it is now recorded rather than deleted.
