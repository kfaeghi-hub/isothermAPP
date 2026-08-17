// scheduleFieldMatch — map a SCHEDULE'S OWN COLUMN HEADING onto a declared
// nameplate field, or say plainly that it does not map.
//
// WHY THIS EXISTS. Adam's Avondale intake wrote 77 spec values into the register
// and displayed ZERO of them. Nothing was lost and nothing was broken: the values
// were stored under the schedule's own headings — `FLOW [GPM]`, `MAX INPUT
// [MBH]`, `PIPE SIZE (")` — while the nameplate table draws its rows from the
// firm's declared field names — `Flow (L/s)`, `Input Rating (kW)`, `Connection
// Size (NPS)`. Two vocabularies for the same quantity, no bridge between them, and
// no message anywhere saying so. Data present, screen empty.
//
// THE UNIT IS PART OF THE MATCH, NOT A DECORATION. This file will not hand back a
// bare number for a field whose declared unit differs from the source's. That is
// the "225 GPM becomes 225 L/s" defect the field-def editor already refuses to
// commit: relabelling alone changes what a number MEANS while leaving it looking
// untouched. So a heading only matches when the units agree, or when a KNOWN
// conversion exists — and then the number is converted, with the arithmetic
// recorded, never silently reinterpreted.
//
// WHAT IT DELIBERATELY IS NOT. Not a fuzzy matcher. It resolves on exact terms, a
// curated alias list, and all-words containment with most-specific-wins — the same
// discipline as `resolveType`, for the same reason: a near-miss that writes into
// an engineering record is worse than a blank the reviewer fills in. Every
// unresolved heading is RETURNED, by name, so the caller can show it.

import { alternatesFor, convertValue, type Conversion } from './unit-convert.js'

export interface DeclaredField { field_name: string; unit: string | null }

export type MatchKind =
  | 'exact'          // the units agree (or neither declares one) — write the value as-is
  | 'converted'      // a known conversion bridged the units — write the converted value
  | 'compound'       // one part of a compound column (208/3/60 → three fields), verbatim
  | 'unit-mismatch'  // the FIELD matched but the units cannot be bridged — write NOTHING
  | 'unmatched'      // no field claims this heading

export interface FieldMatch {
  header: string                 // the schedule's heading, verbatim
  kind: MatchKind
  field: string | null           // the declared field it lands in
  value: string | null           // what to write — null unless kind is exact/converted
  raw: string                    // the schedule's value, verbatim, always kept
  sourceUnit: string | null
  targetUnit: string | null
  note: string                   // plain language, shown to a human
}

/**
 * Schedule dialect → the firm's field names.
 *
 * CURATED, NOT INFERRED. Each entry is a claim that two names mean the same
 * quantity, and no string-similarity score can make that claim honestly: "MAX
 * INPUT" and "Input Rating" share one word, "PIPE SIZE" and "Connection Size"
 * share one, and "MOTOR SIZE" and "Motor kW" share one — while "MAX OUTPUT" and
 * "MAX INPUT" share two and mean opposite ends of the same boiler.
 *
 * This table is the seed of what BACKBURNER 3f is meant to LEARN. Every entry
 * here was written from a real schedule; the harvest's job is to propose the next
 * ones from accumulated corrections rather than from someone remembering.
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  'Input Rating':      ['max input', 'input', 'heating input', 'burner input', 'rated input'],
  'Output Rating':     ['max output', 'output', 'heating output', 'net output', 'rated output'],
  'Connection Size':   ['pipe size', 'connection', 'pipe conn', 'inlet outlet size', 'nozzle size'],
  'Design Flow Rate':  ['flow', 'design flow', 'flow rate', 'capacity flow'],
  'Flow':              ['flow rate', 'design flow', 'gpm'],
  'Head':              ['total head', 'pump head', 'tdh'],
  'Motor kW':          ['motor size', 'motor power', 'motor rating', 'hp', 'motor hp'],
  'Speed':             ['rpm', 'motor speed', 'pump speed'],
  'Efficiency':        ['eff', 'thermal efficiency', 'afue'],
  'Working Pressure':  ['operating pressure', 'design pressure', 'max working pressure'],
  'Working Temperature': ['operating temp', 'design temp', 'liquid temp', 'fluid temp'],
  'Fluid Type':        ['liquid', 'fluid', 'medium'],
  'Voltage':           ['volts', 'v'],
  'Manufacturer':      ['mfr', 'make', 'manuf'],
  'Model Number':      ['model', 'model no', 'cat no', 'catalogue no'],
}

/**
 * One column, several fields. `MOTOR INPUT [V/Ph/Hz]` holding `208/3/60` is
 * three quantities in one cell — Voltage, Phase, Hz — and the single-field
 * machinery above cannot say that honestly (ruled 2026-08-14, the PMPs
 * incident; a new rule KIND, not a stretched alias).
 *
 * Keyed by the heading's unit-stripped normalized term; the value is the
 * ORDERED list of declared-field terms the parts land in. The value splits on
 * `/`, parts are written VERBATIM (no conversion — the bracket names the
 * per-part units and the declared fields carry the same ones), and the whole
 * column REFUSES when the part count does not equal the field count: a dash on
 * a pump with no VFD is one part against three fields, and writing anything
 * from it would be a guess. Three values, three fields, or nothing writes.
 */
export const COMPOUND_ALIASES: Record<string, string[]> = {
  'motor input': ['Voltage', 'Phase', 'Hz'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Split a heading into its term and its unit.
 *
 * Schedules write the unit in brackets of every shape — `FLOW [GPM]`, `HEAD
 * [ft]`, `PIPE SIZE (")`, `DRY WEIGHT (LBS)` — and the firm's field names use
 * round brackets — `Flow (L/s)`. Both are the same idea and both are parsed here,
 * because a term compared WITH its unit attached never matches anything.
 */
export function splitUnit(label: string): { term: string; unit: string | null } {
  const m = label.match(/^(.*?)[\s]*[[(]([^\])]*)[\])]\s*$/)
  if (!m) return { term: label.trim(), unit: null }
  const unit = m[2].trim()
  return { term: m[1].trim(), unit: unit || null }
}

/**
 * Drawing-practice unit variants → canonical, WHITELIST POSTURE (ruled
 * 2026-08-17). Matched EXACTLY, case-sensitively — never blanket case-folding,
 * and the reason is the SI prefix hazard: mW and MW differ by nine orders of
 * magnitude, and a case-fold that "tidies" one invents megawatts out of a
 * standby-power column. A pinned test keeps that refusal refusing.
 *
 * Each entry is a VOCABULARY FACT with its own test, grounded in the fleet
 * survey of from_schedule readings (2026-08-17: 110 units): L/S ×31 and
 * Lit/S ×58 — the Central Tech refusals, 30 readings unbridgeable solely on
 * case; KW ×89; MM ×132; Kg ×55 / KG ×3. Variants with no declared-field
 * target to normalize INTO (BTU/HR, FT.W.G) are deliberately absent — a
 * normalization that lands nowhere is a mapping nobody can verify.
 */
const UNIT_NORMALIZATION: Record<string, string> = {
  'L/S': 'L/s',
  'Lit/S': 'L/s',
  'KW': 'kW',
  'MM': 'mm',
  'Kg': 'kg',
  'KG': 'kg',
}

/** Two unit strings that mean the same thing written differently.
 *
 *  LEGACY MECHANISM, grandfathered: the lookup lowercases its input, which is
 *  exactly the blanket case-folding the whitelist above forbids — safe only
 *  because none of these entries has a case-sensitive sibling (no watts, no
 *  prefixed SI units). NEW variants go in UNIT_NORMALIZATION, exact-keyed,
 *  never here. */
const UNIT_SYNONYMS: Record<string, string> = {
  '"': 'in', 'inch': 'in', 'inches': 'in', 'nps': 'in',
  'lbs': 'lb', 'pounds': 'lb',
  'ft': 'ft', 'feet': 'ft', 'f t': 'ft',
  'v/ph/hz': 'v/ph/hz',
  'rpm': 'RPM', 'r p m': 'RPM',
  'deg f': '°F', 'f': '°F', 'deg c': '°C', 'c': '°C',
}
const canonUnit = (u: string | null): string | null => {
  if (!u) return null
  const k = u.trim()
  // whitelist first — an exact drawing-practice variant beats every other rule
  const norm = UNIT_NORMALIZATION[k]
  if (norm) return norm
  return UNIT_SYNONYMS[k.toLowerCase()] ?? k
}

/** Does this heading name this declared field? Most-specific alias wins. */
function fieldFor(headerTerm: string, declared: DeclaredField[]): DeclaredField | null {
  const n = norm(headerTerm)
  if (!n) return null

  // 1 · the declared name itself, exactly.
  for (const d of declared) if (norm(splitUnit(d.field_name).term) === n) return d

  // 2 · a curated alias, exactly. Exact only — an alias is a short domain term and
  //     letting it match loosely is how "input" claims "Gas Input" and "Input
  //     Rating" at once.
  for (const d of declared) {
    const target = splitUnit(d.field_name).term
    for (const a of FIELD_ALIASES[target] ?? []) if (norm(a) === n) return d
  }

  // 3 · THERE IS NO TIER 3, AND THAT IS THE POINT.
  //
  // `resolveType` matches on all-words containment because extra words there are
  // QUALIFIERS: "RADIANT CEILING PANEL" is still a radiant panel. Field names do
  // not behave that way — an extra word usually names a DIFFERENT QUANTITY on the
  // same equipment:
  //
  //   "VFD"                names whether a drive is fitted        → YES
  //   "VFD INPUT [V/Ph/Hz]" names that drive's supply             → 208/1/60
  //   "INPUT"  vs "MAX INPUT"  vs "GAS INPUT"
  //
  // Containment was in this file for one draft. On the Avondale dry run it matched
  // `VFD INPUT [V/Ph/Hz]` to the `VFD` field, and because that heading sorts after
  // the real `VFD` column it OVERWROTE "YES" with "208/1/60" — a value lost with
  // no error, under a label that now means something else. Caught in the dry run,
  // which is what a dry run is for.
  //
  // So a field is claimed by its exact name or a curated alias, or not at all. An
  // unclaimed heading is not a loss: it is returned, surfaced, and is exactly the
  // material BACKBURNER 3f harvests into the next alias.
  return null
}

/**
 * Match one schedule heading + value against a unit's declared fields.
 *
 * Returns a verdict for EVERY heading, including the ones that do not land. A
 * caller that only receives its successes cannot tell a full read from a partial
 * one, which is the defect this whole file exists to end.
 */
export function matchScheduleField(
  header: string, raw: string, declared: DeclaredField[],
): FieldMatch {
  const src = splitUnit(header)
  const base: Omit<FieldMatch, 'kind' | 'field' | 'value' | 'targetUnit' | 'note'> = {
    header, raw, sourceUnit: src.unit,
  }

  const d = fieldFor(src.term, declared)
  if (!d) {
    return { ...base, kind: 'unmatched', field: null, value: null, targetUnit: null,
      note: 'no declared field claims this column' }
  }

  const tgtUnit = splitUnit(d.field_name).unit ?? d.unit ?? null
  const su = canonUnit(src.unit), tu = canonUnit(tgtUnit)

  if (!su || !tu || su === tu) {
    return { ...base, kind: 'exact', field: d.field_name, value: raw, targetUnit: tgtUnit,
      note: su && tu ? `units agree (${tu})` : 'no unit conversion needed' }
  }

  const conv: Conversion | undefined = alternatesFor(su).find(c => canonUnit(c.to) === tu)
  if (conv) {
    const out = convertValue(raw, conv)
    if (out !== null) {
      return { ...base, kind: 'converted', field: d.field_name, value: out, targetUnit: tgtUnit,
        note: `${raw} ${src.unit} → ${out} ${tgtUnit} (${conv.label})` }
    }
  }

  // THE FIELD MATCHED AND THE VALUE STILL MUST NOT BE WRITTEN. This is the branch
  // that keeps a live register honest: a number under a label that means something
  // else is worse than a blank, because it renders, it prints, and it is only
  // wrong once somebody computes with it.
  return { ...base, kind: 'unit-mismatch', field: d.field_name, value: null, targetUnit: tgtUnit,
    note: `"${d.field_name}" expects ${tgtUnit} and the schedule gives ${src.unit} — no known conversion, so nothing was written` }
}

/**
 * Match a whole stored spec object. Every key comes back, matched or not.
 *
 * AND NO TWO HEADINGS MAY CLAIM ONE FIELD. If they do, the later write silently
 * destroys the earlier one — the same shape as two forward-filled columns sharing
 * a nameplate key, which is a defect this codebase has already paid for once.
 *
 * When two headings collide, BOTH are refused and surfaced. Keeping "the first
 * one" would be a tie-break, and a tie-break is a guess: the columns disagree
 * about what the field means, and a human settles that, not sort order.
 */
export function matchScheduleSpec(
  spec: Record<string, string>, declared: DeclaredField[],
): FieldMatch[] {
  const first = Object.entries(spec).flatMap(([k, v]) => {
    const single = matchScheduleField(k, String(v), declared)
    if (single.kind !== 'unmatched') return [single]

    // ── compound: one heading, several declared fields ──────────────────────
    const src = splitUnit(k)
    const targets = COMPOUND_ALIASES[norm(src.term)]
    if (!targets) return [single]
    const fields = targets.map(t => declared.find(d => norm(splitUnit(d.field_name).term) === norm(t)))
    if (fields.some(f => !f)) return [single]  // a target field this type does not declare

    const parts = String(v).split('/').map(p => p.trim()).filter(Boolean)
    if (parts.length !== targets.length) {
      // REFUSE WHOLE. A dash (or a two-part value) against three fields is not
      // a partial answer — which field would the parts belong to? Nothing
      // writes, and the refusal says why, by count.
      return [{ ...single, kind: 'unmatched' as MatchKind,
        note: `compound column (${targets.join('/')}) holds ${parts.length} part(s) against ${targets.length} fields — nothing was written` }]
    }
    return parts.map((part, i) => ({
      header: k, kind: 'compound' as MatchKind, field: fields[i]!.field_name,
      value: part, raw: String(v), sourceUnit: src.unit,
      targetUnit: splitUnit(fields[i]!.field_name).unit ?? fields[i]!.unit ?? null,
      note: `part ${i + 1} of ${k} — verbatim`,
    }))
  })

  const claims = new Map<string, number>()
  for (const m of first) {
    if (m.field && (m.kind === 'exact' || m.kind === 'converted' || m.kind === 'compound')) {
      claims.set(m.field, (claims.get(m.field) ?? 0) + 1)
    }
  }

  return first.map(m => {
    if (!m.field || (claims.get(m.field) ?? 0) < 2) return m
    const rivals = first.filter(x => x.field === m.field && x !== m).map(x => x.header)
    return {
      ...m, kind: 'unmatched' as MatchKind, value: null,
      note: `two columns claim "${m.field}" — this one and ${rivals.join(', ')}. `
          + 'Neither was written; a tie-break would silently destroy one of them.',
    }
  })
}
