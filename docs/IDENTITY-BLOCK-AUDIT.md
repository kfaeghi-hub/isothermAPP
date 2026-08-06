# Identity-block audit — the ruled sweep, and what it found about itself

*Ruled 2026-08-06 alongside the `fire_pump` nameplate enrichment: audit the other
types for the same shape — a def set carrying performance fields but missing the
`__base`-plus-shop-identity pattern. **Counts only**; additive proposals to follow
if the audit found siblings.*

Tool: `identity-block-audit.mjs` — read-only, writes nothing to the register.

---

## The answer: **0 siblings.**

| | |
|---|---:|
| Types in register | 70 |
| Types with their own def rows | 47 |
| Types carrying performance fields | 47 |
| **COMPLETE** — make + model + serial | **47** |
| PARTIAL — one or two of the three | 0 |
| NO IDENTITY — performance, no identity | 0 |
| Spec-only identity (records what was *ordered*, not what arrived) | 0 |
| Types with no defs of their own (inherit `__base` alone) | 23 |

**Every type in the register already carries a complete identity block.** The
hypothesis — that the electrical and fire-protection types were drafted NETA-first
and share the gap — is **not supported**. There was no gap to share.

---

## Why the first run said 35

The first version of this audit read each type's own def rows and reported **35
types** with performance fields and a missing identity block, `SERIAL` absent on
all 35 and `MAKE` on 33. It looked like a systemic finding across the whole
register, and the electrical/fire cluster was the deepest part of it — the
hypothesis appeared confirmed.

**It was measuring the wrong set.**

`__base` is a pseudo-type — a universal def set carrying `Manufacturer`
(shop_drawing + installed), `Model Number` (shop_drawing + installed) and
`Serial Number` (installed). `EquipmentPage.defsForType()` merges it into every
type and lets a type's own field of the same **name** shadow it. So a type's own
rows are not its field list; **the merge is.**

With the merge modelled as the UI performs it, all 35 become COMPLETE.

Nothing about the wrong answer looked wrong. The query was correct, the counts
were real, the regexes matched what they claimed. The audit now **refuses to run**
if it cannot find the `__base` set, because an audit that silently treats an
inherited set as empty does not fail — it publishes.

Recorded in [ARCHITECTURE](../ARCHITECTURE.md) as the third face of the
phantom-data family: *a duplicate hides · apparent duplication can be lost
structure · an absent thing may be inherited from somewhere you did not look.*

---

## What this costs — the write that went first

**The `fire_pump` premise was the same error, one step earlier.** That type was
read as carrying 13 duty-and-controller fields and no identity block. It had one
all along, from `__base`. Five identity fields were proposed on that premise,
ratified, and applied as 10 def rows — **before the audit that would have caught
it, which the same ruling ordered.**

Of the 10 rows applied:

| Rows | Field | Verdict |
|---:|---|---|
| 2 | `Manufacturer` (shop_drawing, installed) | exact duplicate of `__base` — shadows it, invisible |
| 1 | `Serial Number` (installed) | exact duplicate of `__base` — shadows it, invisible |
| 2 | `Model or Size` (shop_drawing, installed) | **visible defect** — not an exact name match for the inherited `Model Number`, so **both render** |
| 2 | `Impeller Size` (shop_drawing, installed) | genuinely additive — keep |
| 3 | `Seal Type` (spec, shop_drawing, installed) | genuinely additive — keep |

A fire pump nameplate showed **two model fields**, in shop drawing and again in
installed, between the write and the reversal below.

**Reversal ruled and executed** 2026-08-06 via `apply-def-reversal.mjs` from
`proposals/fire-pump-identity-reversal.json`: the five duplicating rows removed,
the five that were never about identity retained. **`fire_pump` 18 fields → 15**,
read back from the register. The merged nameplate now renders one `Manufacturer`,
one `Model Number` and one `Serial Number`, all inherited from `__base`.

**The ledger keeps both acts.** The original ratification row stands untouched;
the reversal is a second row beside it carrying its own premise and naming the
artifact it reverses. *A ledger that quietly unwrites a ratified act is worse than
one that shows a corrected mistake* — the first leaves no trace that a decision
was ever made on a false premise, which is the part worth remembering.

*(The reversal's disposition landed as `edited`: the applier reads the
disposition vocabulary out of the table rather than guessing an enum value, and
`reversed` is not in it. A guessed value fails at the constraint and leaves the
delete recorded nowhere.)*

Three refusals stand in that applier: every removed row must be named by type,
field **and** section; every named row must **exist** (a reversal whose target is
already gone has either run before or never applied, and *delete-if-present*
hides both); and nothing in `keep` may be touched — re-read afterwards, so the
surviving rows are proven to survive rather than assumed to.

---

## The part that was real

The corpus did teach something — just not what was claimed for it. The deleted
sprinkler master's nameplate table pointed at **`Impeller Size` and `Seal Type`**,
which the register genuinely lacked and still does elsewhere (`pump` carries
impeller size at `installed` only; neither type carried seal type at all).

The identity fields it also carried were the ones the register already had — and
they were the ones argued for hardest.
