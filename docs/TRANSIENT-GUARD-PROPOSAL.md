# The transient guard — proposal

**Status: PROPOSAL, pending ruling. [KEEL] 2026-08-12.**

Three transients in one session wore a defect's face. Patterns get mechanisms;
this is the shape I would build.

---

## 1. The three, and why they are one pattern

| # | Where | What it looked like | What it was |
|---|---|---|---|
| 1 | `pw-finding-register` | `Unexpected token 'A', "An error o"… is not valid JSON` | Vercel's HTML error page — the battery started inside the deploy window |
| 2 | corpus run, model leg | **18% typed**, 14 consecutive files "the drafting service did not respond" | an unretried 429; every call after it died |
| 3 | `pw-finding-register` | `report generation failed (500): socket hang up` | a dropped connection on one request |

Each cost a diagnosis. Each was indistinguishable, at the moment it appeared, from
a real regression — #2 for long enough that I nearly reported an 18% model leg as
a Phase 4b result.

**Two are already fixed at the source** (the deploy-window guard; the transport
retry). #3 is not, and the next one will be a shape none of us predicted. The
guard is for the class, not for the three.

---

## 2. The constraint, and the trap it names

> *Don't build a retry that teaches the battery to shrug.*

That is the whole design problem. A bare retry converts a red run into a green one
and **destroys the evidence that anything happened**. Flakiness then accumulates
silently until a real defect hides inside the noise floor — which is the same
failure as a check that cannot fail, arriving from the other direction.

So the guard must make a retried failure **more visible, not less**.

---

## 3. The shape

### 3.1 A transient is retried ONCE, and only on a known signature

`run-battery` retries a failed suite exactly once, and only when its output matches
a **transient signature** — an enumerated list, not a fuzzy match:

| signature | pattern |
|---|---|
| `deploy-window` | an HTML body where JSON was expected |
| `socket-hangup` | `socket hang up`, `ECONNRESET`, `fetch failed` |
| `rate-limit` | HTTP 429, `overloaded`, HTTP 529 |
| `gateway` | 502 / 503 / 504 |

Anything else is **not retried**. A failing assertion is a failing assertion, and
a suite that fails twice on a transient signature is reported as **FAILED**, not
retried again.

### 3.2 Every retry is recorded — the ledger is the point

A retried suite writes a row to `harness_transients`:

| column | holds |
|---|---|
| `suite` | `pw-finding-register` |
| `signature` | `socket-hangup` |
| `excerpt` | ≤200 chars of the matched line — **shape, not payload** (the log-content law) |
| `outcome` | `passed_on_retry` \| `failed_twice` |
| `commit`, `ran_at` | when, and against what |

The battery's summary line changes from `41/41 passed` to
`41/41 passed (1 after retry: pw-finding-register / socket-hangup)`. **A green run
that needed a retry never looks like a clean one.**

### 3.3 Recurrence is promoted to a defect investigation

This is the half that stops the shrug. On every run the guard reads the ledger:

- **same `suite` + `signature` ≥ 3 times across ≥ 2 distinct sessions** → the
  battery prints a **PROMOTION** block naming the suite, the signature, the dates,
  and stops calling it transient. It is a defect until somebody rules otherwise.
- The threshold and the two-session requirement matter: one bad afternoon on
  someone's network is not a pattern, and three failures inside a single session
  are usually one incident.

A promoted signature is **no longer retried**. The mechanism withdraws its own
leniency once the evidence says the leniency was wrong.

### 3.4 What it will not do

- **It will not retry a whole battery.** One suite, once.
- **It will not retry an assertion failure**, at any signature. The signature must
  match the *transport*, not the verdict.
- **It will not hide a first occurrence.** A brand-new signature is reported in
  full and not retried at all — the guard only ever relaxes for shapes already on
  the list, which someone put there deliberately.
- **It will not write to the ledger from a suite.** The battery owns it, so a suite
  cannot exempt itself.

---

## 4. Cost and risk

Small: a signature matcher, one table, and a summary line. The real cost is the
**risk of the leniency**, and §3.3 is the answer to it — the guard is built to
notice when it is being abused and to switch itself off.

**The honest failure mode:** a genuinely broken suite whose breakage happens to
emit a transient signature would be retried once, and then reported failed. One
extra run, no hidden red. I am comfortable with that trade; it is stated so the
ruling can disagree.

---

## 5. What I would build first

Phase 1 is §3.1 + §3.2 — retry on signature, and the ledger with the summary line.
That alone converts three diagnoses into three logged lines. §3.3's promotion needs
ledger data before its thresholds mean anything, so it follows once there is a
week of runs to tune against.
