// intakeExcel — the DETERMINISTIC Excel path. No model is involved, ever.
//
// A typed equipment schedule is a solved problem: it has a title, a header row,
// and data. Sending it to a language model would be paying tokens and latency for
// an answer a parser already knows, and would make a reproducible result
// probabilistic. So: clean Excel never reaches an agent. PDFs and images go to the
// extractor in B2 — this file is the reason most uploads will not need it.
//
// EVERYTHING HERE IS A PURE FUNCTION OVER A CELL GRID. `parseSheet` takes rows and
// returns proposals; it touches no network, no DOM and no clock. That is what lets
// the gate assert real schedules by hand instead of re-implementing the parser and
// checking it agrees with itself.

export type Cell = string | number | boolean | Date | null

// Merge extents are read separately (sheetMerges.ts) because the spreadsheet
// reader discards them. See the note on `forwardFill` below.
import { fillWithinMerges, type MergeRange } from './sheetMerges'
// Re-exported so a harness that bundles the parser gets the merge reader with it —
// two bundles would be two chances to feed the parser a different input than the
// app does, which is the whole thing the benchmark exists to rule out.
export { readSheetMerges } from './sheetMerges'
export type { MergeRange } from './sheetMerges'

export interface TypeVocab { key: string; name: string; aliases?: string[] }

/** How a type was resolved — the picker shows the alias that hit, so a user can
 *  see WHY "UH" became Unit Heater rather than trusting that it did. */
export type MatchVia = 'name' | 'alias' | 'words'
export interface TypeMatch { key: string; via: MatchVia; matched: string }

export interface ParsedRow {
  source_row: number
  tag: string | null
  descriptor: string | null
  location: string | null
  area_served: string | null
  proposed_type: string | null        // a FIRM key, or null — never invented
  observed_type_name: string | null   // what the SOURCE said, always kept
  nameplate: Record<string, string>   // every column we did not map, preserved
  confidence: number
  why: string                         // plain language, shown in review
}

/**
 * Why a sheet looks like it came out of a PDF converter, if it does.
 *
 * A converted schedule is not wrong to upload — it is just the WEAKER path. The
 * original PDF page still has its ruling lines, its column positions and its
 * merges intact; a conversion has already thrown those away and guessed. When the
 * guess is bad the parser can only see the wreckage, never the drawing.
 *
 * So this DESCRIBES rather than blocks: it says what it noticed and lets a human
 * decide. Adam's three files trip none of it — they are clean single-row headers,
 * and saying "your file is damaged" to someone whose file is fine is its own kind
 * of wrong answer.
 */
export interface ConversionArtifact {
  suspected: boolean
  reasons: string[]
  advice: string | null
}

export interface ParsedSheet {
  sheet: string
  title: string | null                // "SUMP PUMP SCHEDULE" — strong category evidence
  proposed_category: string | null
  header_row: number | null
  mapping: Record<string, string>     // our field -> the header text we matched
  unmapped: string[]                  // header texts kept as nameplate
  rows: ParsedRow[]
  skipped: number
  note: string
  /**
   * NAMES, NEVER COUNTS.
   *
   * `note` used to read "3 columns mapped · 13 kept as nameplate", and Adam read
   * that — correctly — as "it only got three things". The thirteen were there, and
   * a count cannot tell you which thirteen, so a partial read wore a full read's
   * face. A reader who cannot see WHICH columns were skipped cannot know whether
   * the important one was among them.
   *
   * These are also exactly the strings BACKBURNER 3f harvests: the unmatched
   * headings of real schedules are the dialect the firm actually receives.
   */
  coverage: {
    mapped: { field: string; header: string }[]
    captured: string[]                // read and kept as nameplate/spec
    ignored: string[]                 // header cells with no data beneath them
  }
  artifact: ConversionArtifact
}

// ── normalisation ───────────────────────────────────────────────────────────
const txt = (c: Cell): string => {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  return String(c).replace(/\s+/g, ' ').trim()
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Column synonyms. ORDER MATTERS INSIDE EACH LIST — earlier entries are stronger
 * evidence, and a header is claimed by the first field that matches it, so
 * "equipment tag" resolves to `tag` rather than to `descriptor`.
 *
 * These are the labels actually seen across the 33 Seneca schedules plus the
 * ordinary synonyms. Anything unrecognised is NOT discarded — it becomes
 * nameplate, because a column nobody anticipated is still something the engineer
 * wrote down on purpose.
 */
const FIELDS: Record<string, string[]> = {
  tag: ['tag', 'mark', 'unit tag', 'equipment tag', 'unit no', 'unit number',
        'equipment no', 'designation', 'unit id', 'item no', 'unit', 'item', 'id'],
  descriptor: ['description', 'equipment description', 'item description',
               'equipment', 'equipment name', 'type', 'equipment type',
               'name', 'system'],
  location: ['location', 'room', 'room no', 'mechanical room', 'level', 'floor',
             'located in', 'installed location'],
  // SERVICE LIVES HERE, NOT IN `descriptor`. See the law below — it was moved on
  // 2026-08-11 after a pump schedule typed two pumps as boilers.
  area_served: ['area served', 'serves', 'service', 'space served', 'room served',
                'zone', 'area', 'served'],
}

/*
 * WHAT A UNIT SERVES IS NOT WHAT IT IS.
 *
 * FROM A REAL PROJECT, 2026-08-11 (Avondale). A pump schedule's only prose column
 * was SERVICE, `service` sat in the `descriptor` list, and so the DUTY became the
 * description the type matcher read:
 *
 *   BP-1  SERVICE "BOILER B-1 PRIMARY LOOP"        → typed `boiler`
 *   P-1   SERVICE "SCHOOL FACILITY SECONDARY LOOP" → typed nothing
 *
 * Four pumps, none correctly typed, two of them sitting in a live register as
 * boilers. A pump on the boiler's primary loop is not a boiler.
 *
 * This is the RP radiant-panel/receptacle-panel law one step further out. There
 * the tag was not allowed to say what a thing is; here the DUTY is not allowed to
 * either. What a unit serves names something ELSE in the building — usually the
 * very equipment it is attached to, which is exactly the wrong answer and reads
 * like a very right one.
 *
 * So `service` is `area_served`, and typing reads `descriptor` then the schedule
 * TITLE and nothing else. `area_served` never reaches `resolveType` — see
 * parseSheet, where `observed` is deliberately `descriptor || title`.
 *
 * The cost is honest: a schedule whose only prose column is SERVICE now types
 * from its title, or not at all. Untyped is quarantine, which this build prefers
 * to a confident wrong answer (R16).
 */

// A tag looks like PREFIX-NUMBER. This is used ONLY to score whether a column is
// the tag column — never to decide what a thing IS. Law 8: on one project `RP`
// was a radiant panel on the mechanical drawings and a receptacle panel on the
// electrical, so a tag pattern may locate a column and may never type a unit.
const TAGGISH = /^[A-Z]{1,6}[- ]?\d{1,4}([-.][A-Z0-9]{1,4})?$/i

/**
 * Merged header cells leave blanks to the right of the value. Carry it across —
 * BUT ONLY AS FAR AS THE MERGE ACTUALLY GOES.
 *
 * The original carried the last value across every following blank, which is
 * right inside a merged span and wrong the moment the span ends. The benchmark's
 * hostile fixture caught it: `MOTOR` spans G2:I2, `MBH` is column J, and the fold
 * produced `MOTOR MBH` — a quantity that does not exist.
 *
 * The merge extents are not in the grid: `read-excel-file` returns a merged cell
 * as value-plus-nulls and never reports its width, so no rule over the grid alone
 * can recover this. `sheetMerges.ts` reads them from the worksheet XML and they
 * are passed in. Without them this behaves exactly as it always did, because a
 * workbook whose spans could not be read is still better served by an imperfect
 * fold than by none.
 */
function forwardFill(row: Cell[], rowIndex = 0, merges?: MergeRange[]): string[] {
  return fillWithinMerges(row, rowIndex, merges, txt)
}

/**
 * Compose the header labels for a candidate row, folding in a SUB-HEADER when the
 * row above it is a merged span.
 *
 * "AIRFLOW" merged across two columns forward-fills to AIRFLOW, AIRFLOW — two
 * columns with one name. Every value written under the second overwrites the
 * first, so MIN CFM silently disappears into MAX CFM and the parser reports
 * success. The row beneath holds the real names, so the label is the pair:
 * "AIRFLOW MIN CFM", "AIRFLOW MAX CFM".
 *
 * The final de-duplication is a backstop rather than a nicety: as long as two
 * columns can share a key, a nameplate value can be lost without anyone seeing a
 * failure, and that is the exact class of defect this build keeps paying for.
 */
function composeHeader(grid: Cell[][], r: number, merges?: MergeRange[]): { labels: string[]; dataStart: number } {
  const base = forwardFill(grid[r] ?? [], r, merges)
  const raw  = (grid[r] ?? []).map(txt)
  const next = (grid[r + 1] ?? []).map(txt)

  // A column is SPANNED when forward-fill gave it a value its own cell did not.
  const spanned = base.map((v, i) => !!v && !raw[i])
  const subHeader = spanned.some((sp, i) => sp && next[i])

  const labels = subHeader
    ? base.map((v, i) => (next[i] ? `${v} ${next[i]}`.trim() : v))
    : base

  const seen = new Map<string, number>()
  const unique = labels.map((l, i) => {
    if (!l) return l
    const n = seen.get(l)
    seen.set(l, (n ?? 0) + 1)
    return n === undefined ? l : `${l} (col ${i + 1})`
  })

  return { labels: unique, dataStart: subHeader ? r + 2 : r + 1 }
}

/**
 * Find the header row by SCORING every candidate, not by assuming row 1.
 *
 * Real schedules open with a title, sometimes a revision block, sometimes a blank
 * row, and sometimes a two-deep merged header. Assuming a fixed offset is how a
 * parser silently reads the title as data — it produces rows, so it looks like it
 * worked.
 */
function findHeader(grid: Cell[][], merges?: MergeRange[]): { row: number; labels: string[]; score: number; dataStart: number } | null {
  let best: { row: number; labels: string[]; score: number; dataStart: number } | null = null

  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const { labels, dataStart } = composeHeader(grid, r, merges)
    const filled = labels.filter(Boolean)
    if (filled.length < 2) continue

    let score = 0
    const seen = new Set<string>()
    for (const key of Object.keys(FIELDS)) {
      for (const label of labels) {
        const n = norm(label)
        if (!n || seen.has(n)) continue
        if (FIELDS[key].some(s => n === s)) { score += 3; seen.add(n); break }
        // A LOOSE MATCH ONLY COUNTS ON A SHORT LABEL. Column names are one or two
        // words; "air handling unit" contains "unit" and is a VALUE, not a name.
        // Without this the parser elects a data row as the header — and then
        // happily returns rows, so it looks like it worked.
        const words = n.split(' ').length
        if (words <= 2 && FIELDS[key].some(s => n.includes(s))) { score += 2; seen.add(n); break }
      }
    }
    // Headers are short words, not sentences or numbers.
    const shortText = filled.filter(l => l.length <= 28 && !/^\d+(\.\d+)?$/.test(l))
    score += Math.min(3, Math.floor((shortText.length / filled.length) * 3))

    // A header is followed by data. If the next row is empty or looks like more
    // heading, this is probably a title block.
    const next = (grid[r + 1] ?? []).map(txt).filter(Boolean)
    if (next.length >= 2) score += 2

    if (!best || score > best.score) best = { row: r, labels, score, dataStart }
  }
  return best && best.score >= 5 ? best : null
}

/**
 * The PDF→Excel conversion fingerprint.
 *
 * Three things a converter does that an engineer writing a spreadsheet does not:
 * it leaves a large fraction of cells empty because it preserved geometry rather
 * than structure; it splits one heading across stacked rows; and it produces rows
 * far wider than the data they carry. Any one alone is ordinary. Together they
 * are the shape of a page that was drawn, not tabulated.
 */
function detectArtifact(grid: Cell[][], headerRow: number | null, dataStart: number): ConversionArtifact {
  const reasons: string[] = []
  const body = grid.slice(dataStart)
  const width = Math.max(...grid.map(r => r?.length ?? 0), 0)

  if (headerRow === null && grid.length > 3) {
    reasons.push('no row in the first 25 looks like a header')
  }

  if (width > 0 && body.length > 0) {
    const cells = body.reduce((n, r) => n + (r?.length ?? 0), 0)
    const filled = body.reduce((n, r) => n + (r ?? []).filter(c => txt(c)).length, 0)
    const density = cells ? filled / cells : 1
    if (density < 0.35) reasons.push(`only ${Math.round(density * 100)}% of data cells hold a value`)
  }

  // Stacked fragments: consecutive rows above the data that each carry a couple
  // of short labels. A converter breaks "MOTOR INPUT [V/Ph/Hz]" into two rows.
  if (headerRow !== null && headerRow >= 2) {
    let stacked = 0
    for (let r = 0; r < headerRow; r++) {
      const f = (grid[r] ?? []).map(txt).filter(Boolean)
      if (f.length >= 2 && f.every(c => c.length <= 14)) stacked++
    }
    if (stacked >= 2) reasons.push(`${stacked} stacked partial header rows above the data`)
  }

  // Rows far wider than their content — geometry preserved, structure lost.
  if (width >= 6 && body.length >= 3) {
    const ragged = body.filter(r => {
      const f = (r ?? []).filter(c => txt(c)).length
      return f > 0 && f <= Math.max(1, Math.floor(width * 0.25))
    }).length
    if (ragged / body.length > 0.4) reasons.push(`${ragged} of ${body.length} rows use a quarter or less of the sheet's width`)
  }

  const suspected = reasons.length >= 2
  return {
    suspected, reasons,
    advice: suspected
      ? 'This sheet looks like a PDF that was converted to Excel. The conversion has '
        + 'already thrown away the column positions and merges the original page still '
        + 'has, so uploading the ORIGINAL PDF pages will usually read better than this file.'
      : null,
  }
}

/** The sheet title — the strongest category evidence a schedule carries. */
function findTitle(grid: Cell[][], headerRow: number): string | null {
  for (let r = 0; r < headerRow; r++) {
    const cells = (grid[r] ?? []).map(txt).filter(Boolean)
    if (cells.length === 0) continue
    const candidate = cells[0]
    if (/schedule|list|register/i.test(candidate)) return candidate
  }
  // No word "schedule" anywhere — fall back to the banner line above the header.
  //
  // THIS USED TO REQUIRE EXACTLY ONE NON-EMPTY CELL, and that guard threw away the
  // strongest category evidence a file had. Avondale's pump schedule opens:
  //
  //   row 1 │ PUMPS │ · │ · │ · │ · │ · │ · │ · │ · │ · │ ELECTRICAL │ · │ · │ · │
  //   row 2 │ TAG   │ MANUFACTURER │ … │ RPM │ MOTOR INPUT │ MOTOR SIZE │ VFD │ …
  //
  // Two non-empty cells, so "PUMPS" was refused — and with the title gone, the
  // rows typed from their SERVICE column instead and two pumps became boilers.
  // The second cell was never a rival title; it is a SECOND-TIER GROUP HEADER
  // spanning the electrical columns beneath it.
  //
  // The guard was defending against a real thing — calling a DATA row a title —
  // but it measured the wrong property. A data row is not distinguished by having
  // more than one value; it is distinguished by being FULL. So the test is now
  // sparseness, plus the two things a banner always does:
  //
  //   · it starts at the left edge (a title is cell A, not something mid-row);
  //   · it holds short text, never numbers.
  //
  // A row above the header that is nearly empty and starts with a short word is a
  // banner. A row above the header carrying a value in most of its columns is
  // data that the header search already declined, and it is still refused here.
  const width = Math.max(...(grid.slice(0, headerRow + 1).map(r => r?.length ?? 0)), 0)
  for (let r = headerRow - 1; r >= 0; r--) {
    const row = (grid[r] ?? []).map(txt)
    const filled = row.filter(Boolean)
    if (filled.length === 0) continue
    if (row[0] !== filled[0]) continue                       // must start at column A
    if (filled.some(c => c.length > 80 || /^\d+([.,]\d+)?$/.test(c))) continue
    const sparse = filled.length <= Math.max(1, Math.floor(width * 0.35))
    if (sparse) return filled[0]
  }
  return null
}

/**
 * Resolve a type key from the source's own words.
 *
 * ALL OF THE TERM'S WORDS MUST APPEAR, AND THE MOST SPECIFIC TERM WINS. Substring
 * matching cannot do this job, and the failure is not hypothetical:
 *
 *   "FAN COIL UNIT"        contains "fan"     → 113 Seneca units typed as fans
 *   "RADIANT CEILING PANEL" contains "panel"  → a heating element typed as
 *                                               electrical distribution gear
 *
 * Requiring every word of the vocabulary term separates them without any
 * hand-written special case: "radiant panel" needs both `radiant` and `panel`, so
 * "RADIANT CEILING PANEL" matches it (2 words) and plain "Panel" (1 word) loses
 * on specificity — while "RECEPTACLE PANEL" fails `radiant` entirely and lands on
 * "Panel". Same tag prefix RP on both drawings, two different answers, and the
 * tag played no part in either. That is law 8 working.
 *
 * A parenthesised qualifier is a disambiguator for humans, not part of the term:
 * "Panel (Electrical Distribution)" matches on "panel".
 *
 * Returns null rather than a near-miss — quarantine, never guess (R16).
 */
// EXPORTED because the type-assignment sweep runs the SAME matcher over existing
// units' descriptors. Two matchers would be two sets of rules that drift, and the
// law-8 separation of RADIANT CEILING PANEL from RECEPTACLE PANEL is the kind of
// thing you only get right once.
export function resolveType(text: string, vocab: TypeVocab[]): string | null {
  return resolveTypeDetailed(text, vocab)?.key ?? null
}

/** The matcher itself. `resolveType` is a thin wrapper so every existing caller
 *  keeps its signature and there is still exactly ONE set of rules.
 *
 *  Precedence, and each tier is there for a reason:
 *
 *    1. exact display name or key — the canonical term always wins. An alias can
 *       therefore never shadow a real type's name, whatever an admin types in.
 *    2. exact ALIAS — and exact only, never all-words. "UH" could not all-words
 *       match "Unit Heater" in a hundred years, and treating two-letter shorthand
 *       as a word bag is precisely how a tag prefix starts claiming units. The
 *       never-alias list (blocked_type_aliases) refuses the known landmines at
 *       the database, RP first among them.
 *    3. all-words, most-specific-wins — the law-8 matcher, unchanged.
 */
export function resolveTypeDetailed(text: string, vocab: TypeVocab[]): TypeMatch | null {
  const n = norm(text)
  if (!n) return null
  const words = new Set(n.split(' '))

  for (const t of vocab) {
    if (n === norm(t.name) || n === norm(t.key)) return { key: t.key, via: 'name', matched: t.name }
  }
  for (const t of vocab) {
    for (const a of t.aliases ?? []) {
      if (a && n === norm(a)) return { key: t.key, via: 'alias', matched: a }
    }
  }

  // AMBIGUITY IS NOT A TIE TO BE BROKEN, IT IS A REFUSAL.
  //
  // This used to keep the first match at a given specificity, because the test
  // was `>` rather than `>=`. Two single-token terms both matching therefore
  // resolved to whichever type happened to sort first — and "Pump - Boiler 1"
  // came back `boiler`, on a real project, because boiler sorts at 3 and pump at
  // 11. The tag played no part; the SORT ORDER decided the type.
  //
  // Found by the catalog campaign's re-check census, which is what a census is
  // for. Note the shape: this function's own doc comment above says "quarantine,
  // never guess (R16)" — and the tie-break was guessing. A rule stated in a
  // comment is not a rule the code follows.
  //
  // Now: equal-specificity matches on DIFFERENT keys mean the words do not
  // decide, so nothing is returned and a human does. One key matching twice is
  // not ambiguity.
  let best: { key: string; specificity: number; matched: string } | null = null
  let tiedKeys = new Set<string>()
  for (const t of vocab) {
    const core = norm(t.name.replace(/\(.*?\)/g, ''))             // drop the qualifier
    if (!core) continue
    const tokens = core.split(' ').filter(Boolean)
    // A SOURCE HEADER IS OFTEN PLURAL. "UNIT HEATERS" is the schedule's title for
    // a set of Unit Heaters, and refusing it on the 's' would send eight real
    // matches to the unknown queue. Relaxed in ONE DIRECTION only — a singular
    // vocabulary word may match a plural source word, never the reverse — so
    // this cannot invent a match that the words do not support.
    const has = (w: string) => words.has(w) || words.has(`${w}s`) || words.has(`${w}es`)
    if (!tokens.length || !tokens.every(has)) continue
    if (!best || tokens.length > best.specificity) {
      best = { key: t.key, specificity: tokens.length, matched: t.name }
      tiedKeys = new Set([t.key])
    } else if (tokens.length === best.specificity) {
      tiedKeys.add(t.key)
    }
  }
  if (best && tiedKeys.size > 1) return null
  return best ? { key: best.key, via: 'words', matched: best.matched } : null
}

/** Strip the trailing SCHEDULE/LIST so "SUMP PUMP SCHEDULE" reads as a category. */
function categoryFromTitle(title: string | null): string | null {
  if (!title) return null
  const c = title.replace(/\b(schedule|list|register)\b/gi, '').replace(/\s+/g, ' ').trim()
  return c.length >= 3 ? c.toUpperCase() : null
}

export function parseSheet(
  grid: Cell[][], sheetName: string, vocab: TypeVocab[],
  opts?: { merges?: MergeRange[] },
): ParsedSheet {
  const head = findHeader(grid, opts?.merges)
  if (!head) {
    const artifact = detectArtifact(grid, null, 0)
    return {
      sheet: sheetName, title: null, proposed_category: null, header_row: null,
      mapping: {}, unmapped: [], rows: [], skipped: grid.length,
      coverage: { mapped: [], captured: [], ignored: [] },
      artifact,
      // SAY WHY, not "0 rows". A parser that reports nothing found without saying
      // what it looked for is indistinguishable from a parser that is broken.
      note: 'No header row found. Looked for a row naming a tag/mark column plus ' +
            'at least one description, location or service column in the first 25 rows.' +
            (artifact.advice ? ` ${artifact.advice}` : ''),
    }
  }

  // ── map columns ───────────────────────────────────────────────────────────
  const mapping: Record<string, string> = {}
  const colFor: Record<string, number> = {}
  const claimed = new Set<number>()

  for (const field of Object.keys(FIELDS)) {
    let bestCol = -1, bestRank = Infinity
    head.labels.forEach((label, i) => {
      if (claimed.has(i) || !label) return
      const n = norm(label)
      const rank = FIELDS[field].findIndex(s => n === s)
      const loose = FIELDS[field].findIndex(s => n.includes(s))
      const r = rank >= 0 ? rank : (loose >= 0 ? loose + 100 : -1)
      if (r >= 0 && r < bestRank) { bestRank = r; bestCol = i }
    })
    if (bestCol >= 0) { colFor[field] = bestCol; claimed.add(bestCol); mapping[field] = head.labels[bestCol] }
  }

  // NO TAG COLUMN BY NAME? Find one by SHAPE — the column whose values look most
  // like equipment tags. This is locating a column, not typing a unit.
  let tagInferred = false
  if (colFor.tag === undefined) {
    const body = grid.slice(head.dataStart)
    let bestCol = -1, bestHits = 0
    const width = Math.max(...body.slice(0, 40).map(r => r?.length ?? 0), 0)
    for (let c = 0; c < width; c++) {
      if (claimed.has(c)) continue
      const hits = body.slice(0, 40).filter(r => TAGGISH.test(txt(r?.[c] ?? null))).length
      if (hits > bestHits) { bestHits = hits; bestCol = c }
    }
    if (bestCol >= 0 && bestHits >= 3) {
      colFor.tag = bestCol; claimed.add(bestCol); tagInferred = true
      mapping.tag = `${head.labels[bestCol] || `column ${bestCol + 1}`} (inferred by shape)`
    }
  }

  const unmapped: string[] = []
  head.labels.forEach((label, i) => { if (label && !claimed.has(i)) unmapped.push(label) })

  const title = findTitle(grid, head.row)
  const category = categoryFromTitle(title)
  const titleType = title ? resolveType(title, vocab) : null

  // ── rows ──────────────────────────────────────────────────────────────────
  const rows: ParsedRow[] = []
  let skipped = 0

  for (let r = head.dataStart; r < grid.length; r++) {
    const raw = grid[r] ?? []
    const cells = raw.map(txt)
    if (cells.every(c => !c)) { skipped++; continue }

    const tag = colFor.tag !== undefined ? cells[colFor.tag] || null : null
    const descriptor = colFor.descriptor !== undefined ? cells[colFor.descriptor] || null : null

    // A row with neither a tag, a description, NOR AN AREA SERVED is a note, a
    // legend, or a spacer. Counting it as equipment is how a 200-row schedule
    // becomes 214.
    //
    // `area_served` joined this test when `service` moved into it (see the
    // served-vs-is law above). Without it, a schedule with no tag column whose
    // only prose is SERVICE would have gone from "rows, badly typed" to NO ROWS
    // AT ALL — a silent regression from a wrong answer to a missing one, which is
    // the worse of the two. A row that names what it serves is still a row. It
    // still may not be TYPED by that value; surviving and being identified are
    // different questions.
    const areaServed = colFor.area_served !== undefined ? cells[colFor.area_served] || null : null
    if (!tag && !descriptor && !areaServed) { skipped++; continue }

    // PROSE IN THE TAG COLUMN IS STILL PROSE. "NOTES: PROVIDE DUPLEX CONTROLLER"
    // sits in column A under the tag header and has no description beside it.
    // Only skip when it reads as a sentence — a short odd tag like SP01A has no
    // space and stays, because dropping a real unit is worse than keeping a note.
    if (!descriptor && tag && !TAGGISH.test(tag) && (/ /.test(tag) || tag.length > 24)) {
      skipped++; continue
    }

    // A repeat of the header (schedules that restate it per page) is not data.
    if (tag && norm(tag) === norm(head.labels[colFor.tag ?? 0] ?? '')) { skipped++; continue }

    const nameplate: Record<string, string> = {}
    head.labels.forEach((label, i) => {
      if (!label || claimed.has(i)) return
      const v = cells[i]
      if (v) nameplate[label] = v
    })

    // TYPE COMES FROM THE DESCRIPTION FIRST, THE SCHEDULE TITLE SECOND, AND THE
    // TAG NEVER. A schedule titled "PUMP SCHEDULE" is good evidence for every row
    // in it; the row's own description is better where it exists.
    const fromDesc = descriptor ? resolveType(descriptor, vocab) : null
    const proposed_type = fromDesc ?? titleType
    const observed = descriptor || title || null

    let confidence = 0.95
    const why: string[] = []
    if (tagInferred) { confidence -= 0.15; why.push('tag column inferred by shape, not named') }
    if (!tag) { confidence -= 0.25; why.push('no tag in this row') }
    if (!descriptor) { confidence -= 0.10; why.push('no description in this row') }
    if (!proposed_type) { confidence -= 0.15; why.push(`type not in the firm vocabulary${observed ? ` ("${observed}")` : ''}`) }
    else if (!fromDesc) { confidence -= 0.05; why.push(`type from the schedule title, not the row`) }
    if (head.score < 8) { confidence -= 0.05; why.push('header match was partial') }

    rows.push({
      source_row: r + 1,                                  // 1-based, as Excel shows it
      tag, descriptor,
      location: colFor.location !== undefined ? cells[colFor.location] || null : null,
      area_served: areaServed,
      proposed_type,
      observed_type_name: proposed_type ? null : observed,
      nameplate,
      confidence: Math.max(0.1, Math.round(confidence * 1000) / 1000),
      why: why.join('; ') || 'clean row: named columns, description resolved to a known type',
    })
  }

  // A header cell with nothing beneath it on any row was READ and had nothing to
  // give. That is a different fact from "captured", and lumping them together
  // inflates what the import claims to have found.
  const everHadValue = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r.nameplate)) everHadValue.add(k)
  const captured = unmapped.filter(u => everHadValue.has(u))
  const ignored  = unmapped.filter(u => !everHadValue.has(u))

  const coverage = {
    mapped: Object.entries(mapping).map(([field, header]) => ({ field, header })),
    captured, ignored,
  }
  const artifact = detectArtifact(grid, head.row, head.dataStart)

  // NAMES, NEVER COUNTS. The old note said "3 columns mapped · 13 kept as
  // nameplate" and a real user read it, correctly, as "it only got three things".
  // A count cannot say WHICH, and which is the only part that tells you whether
  // the column you needed survived.
  const named = [
    `header on row ${head.row + 1} (score ${head.score})`,
    `Mapped: ${coverage.mapped.map(m => `${m.header} → ${m.field}`).join(', ') || 'nothing'}`,
    `Captured as spec: ${captured.join(', ') || 'nothing'}`,
    ignored.length ? `Read but empty: ${ignored.join(', ')}` : null,
    `${rows.length} rows, ${skipped} skipped`,
    artifact.advice,
  ].filter(Boolean).join(' · ')

  return {
    sheet: sheetName, title, proposed_category: category, header_row: head.row + 1,
    mapping, unmapped, rows, skipped, coverage, artifact,
    note: named,
  }
}

/**
 * Read every sheet of an .xlsx into cell grids.
 *
 * The import is DYNAMIC and points at `/browser`: the package publishes no root
 * export, and naming the entry explicitly is better than a bundler alias that
 * silently picks the Node build and fails only in production. Loading on demand
 * keeps it out of the bundle for anyone who never opens an intake screen.
 *
 * v9's default export returns EVERY sheet in one call — a workbook of 33
 * schedules is one read, not 33.
 */
export async function readWorkbook(
  file: File | Blob,
): Promise<{ name: string; grid: Cell[][]; merges: MergeRange[] }[]> {
  const readXlsxFile = (await import('read-excel-file/browser')).default
  const sheets = await readXlsxFile(file as File, { trim: true })
  // The reader drops merge extents, so they are read a second time from the same
  // bytes. Two passes over one file is cheap; a header fold that cannot tell where
  // a group header ends is not (see forwardFill).
  const { readSheetMerges } = await import('./sheetMerges')
  const merges = await readSheetMerges(await file.arrayBuffer())
  return sheets.map(s => ({
    name: s.sheet, grid: s.data as Cell[][], merges: merges[s.sheet] ?? [],
  }))
}

/** SHA-256 of the file, for B3's "re-upload proposes zero rows" guarantee. */
export async function fileHash(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
