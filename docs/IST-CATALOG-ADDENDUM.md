# IST-CATALOG-ADDENDUM.md — the responding side of an integrated systems test

**Status: PROPOSED 2026-08-03. No writes. No mints.** Phase 1 of the same
two-phase treatment as the main catalog.

---

## The finding that decides most of the table

**CAN/ULC-S1001 tests the INTERCONNECTIONS between two or more fire protection
and life safety systems — and explicitly does NOT test those individual systems.**

That single sentence from the standard's scope resolves six of the seven
candidate groups below, because it means an integrated test **exercises** the
responding devices without being a verification *of* them. A damper closing
during an IST is evidence that the interconnection works; the damper's own
verification is its PFC/IVC, and its annual is CAN/ULC-S524 or the mechanical
scope.

So the question for each candidate is not *"does an IST make this move?"* — nearly
everything moves. It is: **does this thing carry a nameplate a CxA records, and
is its verification scope its own?**

Ontario context: S1001 has been mandatory under **OBC 3.2.10.1 since 2020** for
new construction where fire protection or life safety systems are installed, and
for existing buildings when those systems are modified. Systems the standard
names as participating: fire alarm, suppression, **smoke control**, **door
release**, **HVAC interlocks**, emergency communications, **elevator recall**, and
access control door unlocking.

**One correction to the brief:** `elevator` is not at LEARN — it was in the ruled
26 and is minted, on the CSA Z320 grounds that vertical transportation is its own
system class. The recall question below is therefore about scope, not existence.

---

## The ruling table

| Key | Display name | Aliases | Rec | Reasoning |
|---|---|---|---|---|
| `smoke_control_fan` | Smoke Control Fan | *(none — see collisions)* | **MINT NOW** | **Crosses the RTU-vs-AHU bar.** See the argument below. |
| `smoke_control_panel` | Firefighters' Smoke Control Station | FSCS | **MINT NOW** | The single point from which smoke control is commanded and observed. It carries a graphics complement, a control/override complement and a location, it is verified as a unit, and an IST centres on it. Distinct from `fire_alarm_panel` in exactly the way a control station is distinct from a detection panel. |
| Door hold-open / release devices | — | — | **NOT A TYPE** | The `emergency_lighting` precedent, and stronger. Hundreds per building, no nameplate a CxA records per device, verified in bulk. What the IST verifies is the **release interconnection**, which is an applicability column on the fire-integration stage group — not a row per magnet. |
| Magnetic locks on egress doors | — | — | **NOT A TYPE** | Same, with a caveat recorded: mag-lock release is code-mandated and sometimes scheduled. If a project ever schedules them with marks, the picker's propose flow catches it and this ruling gets revisited with real units in hand — which is the mechanism working, not a gap. |
| Elevator recall interface | — | — | **NOT A TYPE — scope on `elevator`** | Recall is a *function* of the elevator plus its fire-alarm interconnection, not a separate machine. It belongs as IST-column applicability on `elevator`. Minting `elevator_recall` would create a type with no nameplate. |
| Load-bank connection point | — | — | **NOT A TYPE — a field on `generator`** | A connection provision, not a commissioned unit. Proposed as an enrichment field (`Load Bank Connection Provided`) when `generator` reaches the drafter. |
| Transfer timing (generator/ATS) | — | — | **NOT A FIELD — repeating measurement** | Time-to-transfer, time-to-restore, and the load steps are readings, one per test event. **BACKBURNER 3d** is exactly this shape; per-tap TTR is its founding case and this is its second. Recording a single "transfer time" field would flatten a test into a nameplate. |
| `annunciator` | Remote Annunciator | *(none)* | LEARN | Part of the fire alarm system, usually one or two per building, and its nameplate content is thin. If projects start carrying several with marks, the propose flow surfaces it. |
| Voice evacuation / emergency comms panel | — | — | LEARN | Usually integrated into the FACP in this market. Mint only if a project carries a separate one. |
| Access control panel | — | — | LEARN | Security scope, touching IST only at the door-unlock interconnection. |
| Sprinkler flow switches · tamper switches · PIVs | — | — | **NOT UNITS — points** | Stated explicitly so the boundary is recorded rather than assumed: these are **devices on a system**, addressed as points, verified in the sprinkler and fire alarm scopes (NFPA 25, CAN/ULC-S536). A flow switch has no nameplate a CxA records and no independent verification event. They are what the IST *uses* to prove an interconnection, not what it verifies. Modelling them as equipment would put hundreds of rows in a register to hold two facts each. |

### Law 8 collision check, per proposed row

| Descriptor | Would resolve to | Mechanism |
|---|---|---|
| `SMOKE EXHAUST FAN` | **`fan`** ✗ → `smoke_control_fan` needs care | "Smoke Control Fan" (3 tokens) does **not** match "SMOKE EXHAUST FAN" — the word *control* is absent, so all-words fails and it falls to `fan` at 1 token. **This is the RECEPTACLE PANEL problem again.** See the mitigation below. |
| `STAIR PRESSURIZATION FAN` | `fan` ✗ | Same. |
| `FSCS` | `smoke_control_panel` ✓ | Exact alias. No collision — four characters, no competing meaning. |
| `SMOKE CONTROL PANEL` | `smoke_control_panel` ✓ | 3 tokens, beats `panel` at 1. |
| — | — | **`SCF` and `SEF` are NOT proposed as aliases** — three characters but pure tag prefixes (`SEF-1` is how these are tagged), and the never-alias discipline excludes exactly this. |

**The mitigation, and it needs your ruling.** A type named "Smoke Control Fan"
will not catch the descriptors the drawings actually use. Two options:

- **(a) Aliases carry it:** seed `Smoke Exhaust Fan`, `Stair Pressurization Fan`,
  `Smoke Evacuation Fan` as exact aliases of `smoke_control_fan`. Exact-match
  only, so `SEF-1` still resolves to nothing and no tag prefix is captured. This
  is what aliases are for and it costs nothing.
- **(b) Name the type after the common case** — "Smoke Exhaust Fan" — and alias
  the others. Cheaper matching, worse display name for a stair pressurization
  fan.

**Recommend (a).**

---

## Smoke-control fans: which side of the RTU-vs-AHU bar?

The variant rule says *discriminator field unless verification scope genuinely
diverges*. Applied honestly:

**It diverges, and by more than the RTU/AHU pair does.**

| | An ordinary `fan` | A smoke control fan |
|---|---|---|
| Verification | mechanical PFC/IVC; airflow, rotation, vibration | the above **plus** a dedicated life-safety FPT |
| Performance criteria | design CFM and ESP | **NFPA 92** — pressure differentials across barriers, door-opening force, exhaust rate vs. design fire |
| Integrated test | not in scope | **the reason S1001 exists**; it converts and runs on command |
| Power | normal | **emergency/standby**, with transfer proven |
| Annual | mechanical maintenance | **CAN/ULC-S1001 re-verification** when systems are modified |
| Failure consequence | comfort | life safety |

An RTU differs from an AHU by *carrying more sections*. A smoke control fan
differs from a fan by **being verified against a different standard, on a
different power source, in a different test, with a different consequence of
failure**. If the bar means anything, this clears it.

**Within** smoke control, however, the variants do *not* diverge: a stair
pressurization fan and a smoke exhaust fan are verified the same way against the
same standard. So the variant rule applies one level down — **one type, with a
`Smoke Control Duty` discriminator field** (stair pressurization · smoke exhaust ·
makeup air · zone exhaust).

That is the variant principle applied twice at two levels, and it is the shape
I would defend: **split where the standard changes, discriminate where it
doesn't.**

---

## The applicability exception — proposed, with the argument both ways

**The standing boundary:** no speculative applicability rules; the classifier
proposes per type only when a project first carries real units.

**Proposed exception: ruled IST mints carry their fire-integration applicability
at mint time.**

**For it — and I think this is decisive.** The original boundary exists to stop
an unread ratification queue: 26 types of speculative *proposals* in front of a
CxA who has never seen most of them. But a rule you **rule** is not a proposal —
it never enters the queue. And an applicability rule is keyed to *(type × stage
group)*, so **a project carrying no smoke control fans never renders that row.**
The rule is invisible until a unit of that type exists, at which point it is
exactly right and arrived without a sitting.

For a type whose *entire reason to exist* is IST scope, the fire-integration
applicability is not a prediction about a project — **it is a property of the
equipment class.** A smoke control fan is in the integrated test on every building
that has one. Withholding that until first units means the first project to carry
one gets a proposal queue for a fact that was never in doubt.

**Against it.** It is a precedent, and precedents widen. Today it is "types whose
reason to exist is IST scope"; the same argument stretches to "types whose scope
is obvious", and obvious is where speculation hides. There is also a real
asymmetry: a wrong ruled rule is *silently* wrong on every future project,
whereas a wrong proposal is read once and rejected.

**Recommendation: adopt it, narrowly and with the narrowness written down.**

> The exception applies **only** to types minted specifically for integrated
> systems testing, **only** for the fire-integration stage group, and **only**
> where the owner rules the applicability in the same sitting as the mint. It
> does not extend to any other stage group, and it is not a precedent for
> "obvious" applicability anywhere else.

If that boundary is not written into ARCHITECTURE alongside the exception, my
recommendation flips to **against** — an exception without a stated edge is just
the rule being weaker than it says.

---

## Sources

- [CAN/ULC-S1001 — Integrated Systems Testing of Fire Protection and Life Safety Systems: scope and OBC 3.2.10.1 requirement](https://www.rotaflow.ca/journal/can-ulc-s1001-integrated-testing-guide/)
- [S1001 scope — interconnections between two or more systems, not the individual systems](https://hhangus.com/testing-integrated-fire-protection-and-life-safety-systems/)
- [Testing Integrated Fire Systems — Canadian Consulting Engineer](https://www.canadianconsultingengineer.com/features/testing-integrated-fire-systems/)
- [Considerations for the Integrated Systems Testing of Fire Protection and Life Safety Systems — EGBC](https://tools.egbc.ca/practice-resources/individual-practice/guidelines-advisories/document/01525amw7fixwip5aukzejg3j5ffbn5qgf/considerations%20for%20the%20integrated%20systems%20testing%20of%20fire%20protection%20and%20life%20safety%20systems)
- [CAN/ULC-S1001-11 presentation, Manitoba Building Officials Association](https://mboa.mb.ca/uploads/files/ULC%20S1001%20Presentation%20-%20Bill%20Fremis.pdf)
