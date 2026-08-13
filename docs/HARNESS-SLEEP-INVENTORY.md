# Harness sleep inventory

*[KEEL] 2026-08-12, under ruling 2. Bounded inventory, not a blind sweep.*

Regenerate with `node harness-convert-sleeps.mjs --census`.

The classification lives IN THE TOOL, not in this file. This document is the
**ledger**; `harness-convert-sleeps.mjs` is the **mechanism**. A sleep added next
year is classified and refused by the tool whether or not anyone reads this page.

## Why this exists

Two guards fired for the wrong reason in one day — `pw-meetings`' 25s sleep and
`openTestProject`'s 1800ms wait — and both were a **clock standing in for a
state**. The law is in `ARCHITECTURE.md` under *The second audit*. This is the
question that follows it: how many more are there, and where.

Flushing them out one battery red at a time is the expensive way. It has already
cost four diagnoses, and each one sent the investigation somewhere the bug was
not.

## The classification

Every `waitForTimeout` in the harness, classified by **what its expiry costs**:

- **GUARD** — a read that feeds a `check()`, a `throw`, or an `exit(1)` happens
  before the next sleep. If the sleep is too short, the run goes red or refuses,
  and the message blames the feature. **A latent false alarm.**
- **CONVENIENCE** — pacing between actions, animation settle, screenshot timing.
  Its expiry costs time and nothing else.

```
TOTAL         224 sites across 35 harness files
  GUARD        89   (78 of them inside the 41-suite battery)
  GUARD-weak   25   (an assertion nearby, no obvious read — treated as convenience)
  CONVENIENCE 110
```

**23 of the 41 battery suites carry at least one.** The shortest guard sleep in
the battery is 200ms.

## Why it is not one sweep

`waitUntil()` needs a **predicate**, and the predicate differs at every site.
That is precisely why these have surfaced one diagnosis at a time. But in most
cases the predicate is **already written on the next line** — it is the check's
own condition:

```js
await page.waitForTimeout(600)
check(await modal.getByText('is required.').count() >= 3, 'validation: ...')
```

becomes a bounded poll on that same condition, with **the check untouched**:

```js
await waitUntil(async () => await modal.getByText('is required.').count() >= 3,
  { timeout: 15000, what: 'the validation messages' })
check(await modal.getByText('is required.').count() >= 3, 'validation: ...')
```

The check still goes red if the condition never holds. Nothing is weakened; the
wait stops being a bet on the machine's speed, and green runs stop paying for it.

## THE HAZARD — 11 sites that must NOT be auto-converted

**A negative assertion cannot be bound-waited.**

```js
await page.waitForTimeout(600)
check(await page.getByText(NAME).count() === 0, 'project NOT created')
```

Polling until *that* becomes true returns **on the first tick**, because it is
already true before the thing has had any chance to appear. The wait is not
shortened — it is **deleted**, and the check becomes one that cannot fail. That
is *a check that cannot fail is not a check*, arriving through a repair.

The correct shape is to wait for a **positive anchor** proving the operation
completed, and only then assert the absence. That anchor is a human judgement
about what "done" looks like at that site. It cannot be derived from the check.

> The detector errs toward flagging: it matches "not"/"never" in the message text
> as well as the predicate, so at least one entry below is really positive. **Over-
> flagging sends a site to human review; under-flagging ships a dead check.**

## The list

| Suite | mechanical | by hand | shortest sleep |
|---|---|---|---|
| `pw-meetings.mjs` | 9 | 0 | 300ms |
| `pw-copy.mjs` | 8 | 0 | 400ms |
| `pw-team.mjs` | 5 | 3 | 400ms |
| `pw-classification.mjs` | 2 | 3 | 200ms |
| `pw-directory.mjs` | 2 | 3 | 400ms |
| `pw-pfc-verify.mjs` | 4 | 1 | 600ms |
| `pw-checklist-offline.mjs` | 4 | 0 | 1200ms |
| `pw-dashboard.mjs` | 3 | 1 | 400ms |
| `pw-dates.mjs` | 3 | 1 | 400ms |
| `pw-intake.mjs` | 4 | 0 | 1500ms |
| `pw-deliverables.mjs` | 2 | 1 | 1200ms |
| `pw-contact-modal.mjs` | 1 | 1 | 900ms |
| `pw-deliverable-access.mjs` | 2 | 0 | 2500ms |
| `pw-finding-register.mjs` | 1 | 1 | 800ms |
| `pw-photo-capture.mjs` | 2 | 0 | 600ms |
| `pw-base-fields.mjs` | 1 | 1 | 1200ms |
| `pw-ist-evidence.mjs` | 0 | 2 | 1200ms |
| `pw-equipment-delete.mjs` | 0 | 2 | 1500ms |
| `pw-project-delete.mjs` | 1 | 0 | 1500ms |
| `pw-storage-privacy.mjs` | 1 | 0 | 2000ms |
| `pw-portal.mjs` | 1 | 0 | 4000ms |
| `pw-ist-generate.mjs` | 0 | 1 | 1500ms |
| `pw-ist-team.mjs` | 0 | 1 | 2500ms |

**Totals — 56 mechanical, 22 by hand, 78 guard sites in the battery.**

### The 11 negative predicates — each would become a check that cannot fail

| Site | The assertion |
|---|---|
| `pw-classification.mjs:68` | `check(await modal.getByText('finding categories will be limited to INFO').count() === 0,` |
| `pw-classification.mjs:76` | `check(await page.locator('.fixed').getByRole('button', { name: 'Create Project' }).count() === ` |
| `pw-contact-modal.mjs:68` | `check(/Add Contact/.test(body), 'it opens the full contact modal, not an inline field')` |
| `pw-dates.mjs:40` | `check(await page.locator('.fixed').getByRole('button', { name: 'Save Changes' }).count() === 0,` |
| `pw-directory.mjs:65` | `check(await page.locator('.fixed').getByRole('button', { name: 'Add Company' }).count() === 0, ` |
| `pw-directory.mjs:97` | `check(await page.locator('.fixed').getByRole('button', { name: 'Add Contact' }).count() === 0, ` |
| `pw-directory.mjs:136` | `check(await page.locator('aside').getByText(CO).count() === 0, 'trade filter (Building Envelope` |
| `pw-ist-evidence.mjs:113` | `check(s19.state !== 'yes' && !s19.evidence_reference,` |
| `pw-pfc-verify.mjs:65` | `check(await page.getByText(TMPL_NAME).count() === 0, 'IVC filter does NOT list it')` |
| `pw-team.mjs:79` | `check(await page.locator('.fixed').count() === 0, 'assign modal closed (saved)')` |
| `pw-team.mjs:102` | `check(await page.getByText('Assign company →').count() === 0, 'hide-unassigned removes dashed c` |

### The 11 with no derivable predicate

- `pw-base-fields.mjs:107` (1200ms)
- `pw-classification.mjs:54` (200ms)
- `pw-dashboard.mjs:172` (400ms)
- `pw-deliverables.mjs:71` (1200ms)
- `pw-equipment-delete.mjs:71` (1500ms)
- `pw-equipment-delete.mjs:97` (2000ms)
- `pw-finding-register.mjs:70` (800ms)
- `pw-ist-evidence.mjs:59` (2000ms)
- `pw-ist-generate.mjs:138` (1500ms)
- `pw-ist-team.mjs:66` (2500ms)
- `pw-team.mjs:66` (700ms)

## Standing position

- **Guard class** — convert. Gated on ruling 2's show-before-converting, since 78
  is large.
- **Convenience class (110)** — on-touch only, per the standing adoption
  principle. Never a blind pass.
- **`GUARD-weak` (25)** — an assertion in the window but no obvious read. Treated
  as convenience until something proves otherwise; listed in
  `out/sleep-inventory.json` for the next audit.
