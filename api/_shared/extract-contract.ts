// extract-contract — the BOUNDARY a model's read must cross before it becomes
// register rows.
//
// PHASE 1 of the model-first extraction upgrade, and the reason it is phase one:
// every later phase writes model output into an engineering register. Without a
// boundary that fails loudly, a malformed read lands as a PLAUSIBLE WRONG ROW —
// a tag that is really a sentence, a confidence of 4, a nameplate value that is
// an object — and a plausible wrong row is the failure this whole campaign
// exists to prevent. A shortfall is visible; a well-formed lie is not.
//
// TWO SEVERITIES, AND THE SPLIT IS THE DESIGN.
//
//   fatal — the payload is not a usable extraction. Nothing is written; the
//           endpoint refuses and NAMES what was wrong. Reserved for damage that
//           makes the whole read untrustworthy.
//   flag  — the read is usable and something in it deserves a human's eye. It is
//           recorded and surfaced, never silently dropped.
//
// WHAT IS DELIBERATELY *NOT* FATAL, because a prior ruling says so: a
// `proposed_type` outside the firm vocabulary. `api/intake.ts` already degrades
// that to "unknown", on the stated reasoning that an invented type must not
// "throw away nineteen good rows alongside the bad one". That ruling stands.
// The boundary's job here is to make it VISIBLE rather than silent — the old path
// degraded it with no record that anything had been degraded.
//
// It does not talk to a model, a database, or the network. It is a pure function
// over a parsed payload, which is what lets the gate feed it damage by hand.

export type Severity = 'fatal' | 'flag'

export interface ExtractProblem {
  severity: Severity
  where: string    // 'rows[3].confidence' — addressable, not "a row"
  what: string     // the offending value, truncated
  why: string      // a plain sentence a human can act on
}

export interface CheckedRow {
  source_row?: number
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

export interface Mapping { heading: string; meaning: string; why?: string }
export interface Ambiguity { about: string; question: string; where?: string }

export interface ExtractCheck {
  ok: boolean
  rows: CheckedRow[]
  problems: ExtractProblem[]
  /** What the reader took each source heading to mean. */
  mappings: Mapping[]
  /** Questions the source does not answer. Never resolved here — carried. */
  ambiguities: Ambiguity[]
}

/** Units the firm's schedules and def sets actually use.
 *
 *  A unit OUTSIDE this list is flagged, never refused. Real drawings write units
 *  nobody anticipated, and a boundary that rejects `[ ' w.c.]` would refuse a
 *  perfectly good Avondale boiler schedule. The list exists so an unrecognised
 *  unit is SEEN — it is the raw material BACKBURNER 3f harvests into the next
 *  alias — not so the read can be failed on one.
 *
 *  Conversion pairs live in `src/lib/unitConvert.ts`; this is only the accepted
 *  vocabulary, and the two are allowed to differ: a unit can be legitimate and
 *  have no counterpart to convert to. */
export const KNOWN_UNITS = new Set([
  'l/s', 'gpm', 'usgpm', 'cfm', 'm3/h', 'cfh',
  'kpa', 'ft', 'psi', 'in w.c.', 'w.c.', 'ft wg', 'bar',
  'kw', 'hp', 'bhp', 'mbh', 'btu/h', 'btuh', 'tons', 'ton', 'kbtu/h',
  'c', '°c', 'f', '°f', 'k',
  'mm', 'in', '"', 'nps', 'm', 'ft²', 'sf',
  'v', 'a', 'hz', 'ø', 'ph', 'v/ph/hz', 'rpm', 'kva', 'ka',
  '%', 'db', 'kg', 'lb', 'lbs', 'kg/h', 'lb/h', 'rpm/min',
])

const MAX_TAG = 64
const MAX_KEY = 120
const MAX_VALUE = 500

const trunc = (v: unknown, n = 80): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s === undefined ? String(v) : (s.length > n ? `${s.slice(0, n)}…` : s)
}

/** The unit a heading declares in brackets, lowercased. `FLOW [GPM]` → `gpm`. */
export function declaredUnit(heading: string): string | null {
  const m = heading.match(/[[(]([^\])]{1,20})[\])]\s*$/)
  return m ? m[1].trim().toLowerCase() : null
}

/**
 * Check a model's extraction payload before a single row reaches the register.
 *
 * `knownTypes` are the vocabulary strings the agent was given (`key (Name)`), so
 * the check compares against exactly what was asked for rather than a second
 * reading of the database.
 */
export function checkExtraction(
  value: unknown, ctx: { knownTypes: string[] },
): ExtractCheck {
  const problems: ExtractProblem[] = []
  const fatal = (where: string, what: unknown, why: string) =>
    problems.push({ severity: 'fatal', where, what: trunc(what), why })
  const flag = (where: string, what: unknown, why: string) =>
    problems.push({ severity: 'flag', where, what: trunc(what), why })

  const mappings: Mapping[] = []
  const ambiguities: Ambiguity[] = []

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fatal('$', value, 'the extraction is not an object')
    return { ok: false, rows: [], problems, mappings, ambiguities }
  }
  const obj = value as Record<string, unknown>

  if (!Array.isArray(obj.rows)) {
    fatal('$.rows', obj.rows, 'the extraction has no `rows` array — nothing was read, or it was not returned in the agreed shape')
    return { ok: false, rows: [], problems, mappings, ambiguities }
  }

  // MAPPINGS AND AMBIGUITIES ARE CARRIED, NEVER RESOLVED HERE. A malformed one is
  // dropped with a flag: losing a question is bad, but inventing one is worse.
  for (const m of Array.isArray(obj.mappings) ? obj.mappings : []) {
    const r = m as Record<string, unknown>
    if (typeof r?.heading === 'string' && typeof r?.meaning === 'string' && r.heading.trim()) {
      mappings.push({ heading: r.heading.trim(), meaning: r.meaning.trim(),
        why: typeof r.why === 'string' ? r.why : undefined })
    } else flag('$.mappings[]', m, 'a mapping was not { heading, meaning } and was dropped')
  }
  for (const a of Array.isArray(obj.ambiguities) ? obj.ambiguities : []) {
    const r = a as Record<string, unknown>
    if (typeof r?.about === 'string' && typeof r?.question === 'string' && r.question.trim()) {
      ambiguities.push({ about: r.about.trim(), question: r.question.trim(),
        where: typeof r.where === 'string' ? r.where : undefined })
    } else flag('$.ambiguities[]', a, 'an ambiguity was not { about, question } and was dropped')
  }
  if (obj.page_note !== undefined && typeof obj.page_note !== 'string') {
    flag('$.page_note', obj.page_note, 'page_note is present but is not text; it was dropped')
  }
  for (const k of Object.keys(obj)) {
    if (!['rows', 'page_note', 'mappings', 'ambiguities'].includes(k)) {
      flag(`$.${k}`, obj[k], 'an unexpected top-level key — kept out of the register')
    }
  }

  // The vocabulary, as keys. `known_types` arrives as "pump (Pump)".
  const typeKeys = new Set(ctx.knownTypes.map(t => t.split(' ')[0]))

  const ROW_KEYS = new Set([
    'source_row', 'tag', 'descriptor', 'proposed_category', 'proposed_type',
    'location', 'area_served', 'nameplate', 'confidence', 'reasoning',
  ])

  const rows: CheckedRow[] = []
  ;(obj.rows as unknown[]).forEach((raw, i) => {
    const at = `rows[${i}]`
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      fatal(at, raw, 'this row is not an object')
      return
    }
    const r = raw as Record<string, unknown>

    // ── tag ────────────────────────────────────────────────────────────────
    // A TAG THAT IS A SENTENCE IS THE CLASSIC PLAUSIBLE WRONG ROW. It inserts, it
    // renders, and it sits in the register looking like equipment.
    const tag = typeof r.tag === 'string' ? r.tag.trim() : ''
    const hasDescriptor = typeof r.descriptor === 'string' && r.descriptor.trim() !== ''
    if (!tag && !hasDescriptor) {
      fatal(`${at}.tag`, r.tag, 'the row has neither a tag nor a description — there is nothing here to review')
      return
    }
    if (tag.length > MAX_TAG) {
      fatal(`${at}.tag`, tag, `a tag of ${tag.length} characters is prose, not a tag (limit ${MAX_TAG})`)
      return
    }
    if (/[\r\n]/.test(tag)) {
      fatal(`${at}.tag`, tag, 'the tag contains a line break, so it is more than one thing')
      return
    }

    // ── confidence ─────────────────────────────────────────────────────────
    // Out of range is fatal for the ROW: everything downstream — the clean/needs-
    // a-look split, the ordering, the bulk-accept — reads this number, and a 4
    // would bulk-accept a guess.
    const conf = r.confidence
    if (typeof conf !== 'number' || !Number.isFinite(conf) || conf < 0 || conf > 1) {
      fatal(`${at}.confidence`, conf, 'confidence must be a number between 0 and 1')
      return
    }

    // ── type — flagged, never fatal (prior ruling preserved) ───────────────
    let proposed: string | null = null
    if (typeof r.proposed_type === 'string' && r.proposed_type.trim()) {
      const t = r.proposed_type.trim()
      if (typeKeys.has(t)) proposed = t
      else {
        flag(`${at}.proposed_type`, t,
          'not a key in the firm vocabulary; kept as the observed name and routed to review as unknown')
      }
    }

    // ── nameplate ──────────────────────────────────────────────────────────
    const nameplate: Record<string, string> = {}
    if (r.nameplate !== undefined && r.nameplate !== null) {
      if (typeof r.nameplate !== 'object' || Array.isArray(r.nameplate)) {
        flag(`${at}.nameplate`, r.nameplate, 'nameplate is not an object; no spec values were kept from this row')
      } else {
        for (const [k, v] of Object.entries(r.nameplate as Record<string, unknown>)) {
          const key = String(k).trim()
          if (!key) { flag(`${at}.nameplate`, k, 'a spec heading with no name was dropped'); continue }
          if (key.length > MAX_KEY) { flag(`${at}.nameplate["${trunc(key, 30)}"]`, key, `a spec heading of ${key.length} characters is prose, not a column name`); continue }
          if (v === null || v === undefined || v === '') continue
          if (typeof v === 'object') {
            flag(`${at}.nameplate["${key}"]`, v, 'a spec value came back as a structure rather than a value; dropped')
            continue
          }
          const s = String(v).trim()
          if (s.length > MAX_VALUE) {
            flag(`${at}.nameplate["${key}"]`, s, `a spec value of ${s.length} characters is prose, not a reading; dropped`)
            continue
          }
          // UNITS ARE VALIDATED, NOT ENFORCED. An unrecognised unit is a finding
          // about the firm's vocabulary, not a reason to refuse a real schedule.
          const u = declaredUnit(key)
          if (u && !KNOWN_UNITS.has(u)) {
            flag(`${at}.nameplate["${key}"]`, u, `"${u}" is not a unit this system knows; the value was kept as written`)
          }
          nameplate[key] = s
        }
      }
    }

    for (const k of Object.keys(r)) {
      if (!ROW_KEYS.has(k)) flag(`${at}.${k}`, r[k], 'an unexpected row key — kept out of the register')
    }

    const str = (x: unknown): string | null =>
      typeof x === 'string' && x.trim() ? x.trim() : null

    rows.push({
      source_row: typeof r.source_row === 'number' && Number.isInteger(r.source_row) && r.source_row > 0
        ? r.source_row : undefined,
      tag, descriptor: str(r.descriptor), proposed_category: str(r.proposed_category),
      proposed_type: proposed, location: str(r.location), area_served: str(r.area_served),
      nameplate, confidence: conf, reasoning: str(r.reasoning) ?? undefined,
    })
  })

  // A read that produced rows and lost EVERY ONE of them to fatal problems is
  // not a partial success. Saying "0 rows" there would repeat the intake defect
  // this codebase already fixed once: a failure wearing an empty result's face.
  const anyFatal = problems.some(p => p.severity === 'fatal')
  const allLost = (obj.rows as unknown[]).length > 0 && rows.length === 0

  return { ok: !anyFatal && !allLost, rows, problems, mappings, ambiguities }
}

/** One sentence naming what went wrong, for a human who is not reading logs. */
export function describeProblems(problems: ExtractProblem[]): string {
  const f = problems.filter(p => p.severity === 'fatal')
  const shown = (f.length ? f : problems).slice(0, 4)
  return shown.map(p => `${p.where}: ${p.why}`).join(' · ')
    + (shown.length < (f.length || problems.length) ? ` (+${(f.length || problems.length) - shown.length} more)` : '')
}
