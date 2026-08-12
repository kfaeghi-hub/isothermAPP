// reconcile — merge two independent readings of one sheet, and KEEP THE ARGUMENT.
//
// [KEEL] Phase 3.
//
// WHY THIS EXISTS AT ALL, stated as the measurement rather than as a hope. On the
// full 298-row corpus denominator:
//
//   rules   209 typed = 70%   — reads everything, identifies less
//   model   203 typed = 68%   — identifies nearly all of what it reads, and read
//                               five files' worth of nothing
//
// **Neither leg dominates.** Had either won outright, this file would be a wrapper
// around the winner. It is a merge because the legs fail in opposite directions,
// and the corpus proved it rather than someone asserting it.
//
// AND THE MODEL LEG IS NOT REPRODUCIBLE RUN TO RUN. Two full corpus runs a few
// hours apart gave 203 typed and then 185, and the set of files that failed
// CHANGED: FanCoils truncated in the first and succeeded in the second; Pumps did
// the reverse; AHU-Coils1 failed, then succeeded, then failed again. The rules leg
// returned 209 both times, to the row.
//
// That is the argument for the tie-break below being deterministic, and it is also
// a caution about every model-leg number in this campaign: a single run is a
// sample, not a measurement. Where a number matters, it needs more than one run.
//
// THREE RULES, BINDING:
//
//   1. THE DENOMINATOR IS 298, PERMANENTLY. A leg may exclude files in its own
//      diagnostics; the climb chart has one denominator or it stops being a climb
//      chart. A file the model could not read appears here as a NAMED HOLE filled
//      by the rules leg — not as an absence that quietly shrinks the divisor.
//
//   2. DISAGREEMENT IS AN OUTPUT, NOT A RESOLUTION. The merge policy is
//      deterministic so the benchmark is reproducible, and every disagreement is
//      RECORDED ON THE ROW. Offer-never-assert at the data layer: the row carries
//      what each leg said, so Phase 5's review screen shows an argument rather
//      than a verdict someone has to trust.
//
//   3. PER-ROW LEG ATTRIBUTION IS MANDATORY. "Which reader said this" is
//      provenance the review UI needs, and it is built once, here.

// SELF-CONTAINED BY DESIGN. This module is imported by THREE runtimes — the
// browser (the orchestrator reconciles client-side), Node (the benchmark), and
// nothing in api/ at all. So it declares the shapes it consumes rather than
// importing them across a runtime boundary that has never been proven to work.
//
// The recon that preceded Phase 5a found ZERO runtime imports crossing api/ into
// src/, and the repo's own convention (explicit .js extensions, Vercel ESM)
// implies per-file transpile — under which src/lib's extensionless imports would
// die exactly as they did in the pw-extractor incident. Living in src/lib and
// importing nothing from api/ removes the bet instead of taking it.

/** The row shape this consumes from a model read. Structurally identical to
 *  `ReadRow` in api/_shared/extract-contract.ts, declared here so neither
 *  runtime has to reach into the other. */
export interface ReadRow {
  tag: string
  descriptor?: string | null
  proposed_category?: string | null
  proposed_type?: string | null
  location?: string | null
  area_served?: string | null
  nameplate: Record<string, string>
  confidence: number
  reasoning?: string
}
export interface Ambiguity { about: string; question: string; where?: string }

/** Which reader produced a value. */
export type Leg = 'rules' | 'model' | 'both'

export interface FieldClaim {
  rules: string | null
  model: string | null
  /** Which leg the merged value came from. `both` means they agreed. */
  from: Leg
  agreed: boolean
}

export type DisagreementKind =
  /** Both legs read the unit; they disagree on a field's value. */
  | 'value'
  /** Both read it; one typed it and the other did not. */
  | 'type-one-sided'
  /** Both typed it, differently. This is the one that matters most. */
  | 'type-conflict'
  /** Only one leg saw this unit at all. */
  | 'unit-one-sided'
  /** A spec heading one leg captured and the other did not. */
  | 'spec-one-sided'

export interface Disagreement {
  tag: string
  kind: DisagreementKind
  field: string
  rules: string | null
  model: string | null
  /** Plain language, for a human reading a review screen. */
  note: string
}

export interface MergedRow {
  tag: string
  /** Where this ROW came from: seen by both readers, or only one. */
  seenBy: Leg
  descriptor: string | null
  location: string | null
  area_served: string | null
  proposed_type: string | null
  /** Which leg supplied the surviving type. */
  typeFrom: Leg | null
  confidence: number
  nameplate: Record<string, string>
  /** Per-field attribution, for the review surface. */
  claims: Record<string, FieldClaim>
  disagreements: Disagreement[]
}

export interface MergeResult {
  rows: MergedRow[]
  disagreements: Disagreement[]
  ambiguities: Ambiguity[]
  /** Named holes: sheets the model could not read, carried by the rules alone. */
  modelReadFailed: boolean
  counts: {
    both: number; rulesOnly: number; modelOnly: number
    typed: number; typedFromRules: number; typedFromModel: number
  }
}

/** Below the review screen's CLEAN_AT (0.85), so a disputed row is never
 *  bulk-acceptable. Stated here as a constant so the coupling is visible rather
 *  than a number someone later "tidies". */
export const CONFLICT_CAP = 0.8

const norm = (s: string | null | undefined) =>
  (s ?? '').toString().trim().toUpperCase().replace(/\s+/g, ' ')

/** A comparable form for values, so `4` and `4.0` and ` 4 ` do not read as a fight. */
const sameValue = (a: string | null, b: string | null): boolean => {
  if (a == null || b == null) return a == null && b == null
  const na = Number(a), nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return norm(a) === norm(b)
}

interface RulesRow {
  tag: string | null
  descriptor: string | null
  location: string | null
  area_served: string | null
  proposed_type: string | null
  nameplate: Record<string, string>
  confidence: number
}

/**
 * Merge one sheet's two readings.
 *
 * THE POLICY, deterministic and stated so a benchmark can reproduce it:
 *
 *   · A unit is the same unit when its TAG matches, case- and space-insensitively.
 *     Tags are the one field both legs are reliably good at.
 *   · TYPE: if exactly one leg typed it, that type survives and the one-sidedness
 *     is recorded. If both typed it and they AGREE, high confidence. If both typed
 *     it and they DISAGREE, the merged row **OFFERS the more specific reading at
 *     capped confidence** and routes to review.
 *
 *     REVERSED 2026-08-12. This read: *"the rules win and the conflict is recorded
 *     loudly — not because the rules are better (they are not; 70% vs 68%) but
 *     because the rules are DETERMINISTIC … nothing is lost by choosing the stable
 *     side."* Something was lost. On the corpus that policy preserved a KNOWN-WRONG
 *     answer 64 times, so "reproducible" meant "reliably wrong" in the largest
 *     conflict class. A conflict between two readers is a review question by
 *     definition, and neither leg gets to win silently.
 *   · SPEC VALUES: union. A heading either leg captured is kept; where both
 *     captured the same heading with different values, the disagreement is
 *     recorded and the RULES value is kept — a VALUE conflict is a transcription
 *     difference rather than a claim about identity, and the deterministic read is
 *     the reproducible one. Both readings are on the row regardless.
 *   · CONFIDENCE: agreement raises it, one-sidedness lowers it.
 */
export function reconcileSheet(
  rulesRows: RulesRow[],
  modelRows: ReadRow[] | null,
  modelAmbiguities: Ambiguity[] = [],
): MergeResult {
  const disagreements: Disagreement[] = []
  // A ROW WITHOUT A TAG IS STILL A ROW.
  //
  // The first version keyed both sides on the tag and therefore DROPPED every
  // untagged row on the floor — the merge returned 293 rows against a 298-row
  // denominator, five rows quietly gone. That is the same defect the parser's own
  // row-survival rule exists to prevent ("a row that names only what it serves is
  // still a row"), reintroduced one layer up.
  //
  // Untagged rows cannot be MATCHED across legs — there is nothing to match on —
  // so they are carried through as one-sided rows under a positional key. They
  // survive, they are attributed, and they are visibly unmatched.
  // AND A REPEATED TAG IS TWO ROWS, NOT ONE. Keying on the bare tag let a second
  // occurrence overwrite the first: 7 rows across the Seneca corpus vanished that
  // way, and the merge reported 293 against a 298 denominator. Real schedules DO
  // repeat a tag - a cooling and a heating coil on one unit - and the intake path
  // carries `duplicate_of` precisely because of it. So the key is tag +
  // OCCURRENCE, and the nth occurrence on one leg matches the nth on the other.
  //
  // Twice now this function has lost rows to a key that was not unique. The lesson
  // is not "handle duplicates": it is that a merge keyed on DATA must prove its key
  // is total before it is trusted with a denominator.
  function keyed<T extends { tag: string | null }>(list: T[], side: string): Map<string, T> {
    const m = new Map<string, T>()
    const seen = new Map<string, number>()
    list.forEach((r, i) => {
      if (!r.tag) { m.set(` ${side}:${i}`, r); return }
      const t = norm(r.tag)
      const n = (seen.get(t) ?? 0) + 1
      seen.set(t, n)
      m.set(n === 1 ? t : `${t}#${n}`, r)
    })
    return m
  }
  const byTagRules = keyed<RulesRow>(rulesRows, 'rules')
  const byTagModel = keyed<ReadRow>((modelRows ?? []) as ReadRow[], 'model')

  const tags = [...new Set([...byTagRules.keys(), ...byTagModel.keys()])]
  const rows: MergedRow[] = []
  let both = 0, rulesOnly = 0, modelOnly = 0
  let typed = 0, typedFromRules = 0, typedFromModel = 0

  for (const key of tags) {
    const R = byTagRules.get(key) ?? null
    const M = byTagModel.get(key) ?? null
    // A synthetic positional key must never masquerade as a tag.
    const tag = (R?.tag ?? M?.tag ?? '').toString()
    const seenBy: Leg = R && M ? 'both' : R ? 'rules' : 'model'
    if (seenBy === 'both') both++; else if (seenBy === 'rules') rulesOnly++; else modelOnly++

    const mine: Disagreement[] = []
    let conflictCapped = false
    if (seenBy !== 'both') {
      mine.push({
        tag, kind: 'unit-one-sided', field: 'row',
        rules: R ? 'read' : null, model: M ? 'read' : null,
        note: R ? 'only the rules leg saw this unit' : 'only the model saw this unit',
      })
    }

    const claim = (field: string, rv: string | null, mv: string | null): FieldClaim => {
      const agreed = sameValue(rv, mv)
      if (!agreed && rv != null && mv != null) {
        mine.push({
          tag, kind: field === 'proposed_type' ? 'type-conflict' : 'value', field,
          rules: rv, model: mv,
          note: field === 'proposed_type'
            ? `the readers disagree on what this is — rules say ${rv}, the model says ${mv}`
            : `the readers disagree on ${field}`,
        })
      }
      return { rules: rv, model: mv, from: agreed ? 'both' : (rv != null ? 'rules' : 'model'), agreed }
    }

    const cDesc = claim('descriptor', R?.descriptor ?? null, M?.descriptor ?? null)
    const cLoc  = claim('location', R?.location ?? null, M?.location ?? null)
    const cArea = claim('area_served', R?.area_served ?? null, M?.area_served ?? null)

    // ── type ────────────────────────────────────────────────────────────────
    const rt = R?.proposed_type ?? null
    const mt = M?.proposed_type ?? null
    let type: string | null = null, typeFrom: Leg | null = null
    if (rt && mt) {
      if (rt === mt) { type = rt; typeFrom = 'both' }
      else {
        // NEITHER LEG WINS SILENTLY. Ruled 2026-08-12, replacing "rules win".
        //
        // The first policy kept the deterministic answer for reproducibility. On
        // the corpus that preserved a KNOWN-WRONG answer 64 times — the rules leg
        // typed fan coil units as `fan` through the title path — so "reproducible"
        // meant "reliably wrong" in the largest conflict class.
        //
        // A CONFLICT BETWEEN TWO READERS IS A REVIEW QUESTION BY DEFINITION. So the
        // merged row OFFERS the more specific reading and caps confidence BELOW
        // CLEAN_AT, which routes every type-conflict to a human with both readings
        // named. "More specific" is the offered reading, never the accepted one —
        // offer-never-assert, applied to the merge itself.
        //
        // Reproducibility is not lost: the offer is a deterministic function of the
        // two inputs. What changed is that the merge no longer pretends a conflict
        // was settled.
        const spec = (k: string) => k.split('_').length
        type = spec(mt) > spec(rt) ? mt : spec(rt) > spec(mt) ? rt : rt
        typeFrom = type === mt ? 'model' : 'rules'
        conflictCapped = true
        mine.push({
          tag, kind: 'type-conflict', field: 'proposed_type', rules: rt, model: mt,
          note: `the readers disagree — rules say ${rt}, the model says ${mt}. ` +
                `${type} is OFFERED as the more specific reading, at reduced confidence, ` +
                `so a human rules on it. Neither reader wins silently.`,
        })
      }
    } else if (rt || mt) {
      type = rt ?? mt
      typeFrom = rt ? 'rules' : 'model'
      mine.push({
        tag, kind: 'type-one-sided', field: 'proposed_type', rules: rt, model: mt,
        note: rt ? 'only the rules leg identified this' : 'only the model identified this',
      })
    }
    if (type) { typed++; if (typeFrom === 'model') typedFromModel++; else typedFromRules++ }

    // ── spec values: union, with conflicts recorded ─────────────────────────
    const nameplate: Record<string, string> = { ...(M?.nameplate ?? {}) }
    for (const [k, v] of Object.entries(R?.nameplate ?? {})) {
      if (k in nameplate && !sameValue(nameplate[k], v)) {
        mine.push({
          tag, kind: 'value', field: `spec:${k}`, rules: v, model: nameplate[k],
          note: `both readers captured "${k}" and read it differently`,
        })
      } else if (!(k in nameplate) && M) {
        mine.push({
          tag, kind: 'spec-one-sided', field: `spec:${k}`, rules: v, model: null,
          note: `only the rules leg captured "${k}"`,
        })
      }
      nameplate[k] = v      // rules win on value, for reproducibility
    }
    if (M && R) {
      for (const k of Object.keys(M.nameplate)) {
        if (!(k in (R.nameplate ?? {}))) {
          mine.push({
            tag, kind: 'spec-one-sided', field: `spec:${k}`, rules: null, model: M.nameplate[k],
            note: `only the model captured "${k}" — offered, not asserted`,
          })
        }
      }
    }

    // Agreement is evidence. Two independent readers landing on the same answer is
    // worth more than either alone, and one-sidedness costs.
    const base = Math.max(R?.confidence ?? 0, M?.confidence ?? 0)
    let conf = seenBy === 'both'
      ? Math.min(0.99, base + (typeFrom === 'both' ? 0.05 : 0))
      : Math.max(0.1, base - 0.15)
    // A type-conflict CANNOT be clean. CLEAN_AT is 0.85 in the review screen; this
    // caps below it so a disputed row can never be swept up by "Accept all clean".
    if (conflictCapped) conf = Math.min(conf, CONFLICT_CAP)

    disagreements.push(...mine)
    rows.push({
      tag, seenBy,
      descriptor: cDesc.rules ?? cDesc.model, location: cLoc.rules ?? cLoc.model,
      area_served: cArea.rules ?? cArea.model,
      proposed_type: type, typeFrom,
      confidence: Math.round(conf * 1000) / 1000,
      nameplate,
      claims: { descriptor: cDesc, location: cLoc, area_served: cArea },
      disagreements: mine,
    })
  }

  return {
    rows, disagreements, ambiguities: modelAmbiguities,
    modelReadFailed: modelRows === null,
    counts: { both, rulesOnly, modelOnly, typed, typedFromRules, typedFromModel },
  }
}
