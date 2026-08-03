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
               'service', 'equipment', 'equipment name', 'type', 'equipment type',
               'name', 'system'],
  location: ['location', 'room', 'room no', 'mechanical room', 'level', 'floor',
             'located in', 'installed location'],
  area_served: ['area served', 'serves', 'space served', 'room served', 'zone',
                'area', 'served'],
}

// A tag looks like PREFIX-NUMBER. This is used ONLY to score whether a column is
// the tag column — never to decide what a thing IS. Law 8: on one project `RP`
// was a radiant panel on the mechanical drawings and a receptacle panel on the
// electrical, so a tag pattern may locate a column and may never type a unit.
const TAGGISH = /^[A-Z]{1,6}[- ]?\d{1,4}([-.][A-Z0-9]{1,4})?$/i

/** Merged header cells leave blanks to the right of the value. Carry it across. */
function forwardFill(row: Cell[]): string[] {
  const out: string[] = []
  let last = ''
  for (const c of row) {
    const v = txt(c)
    if (v) last = v
    out.push(v || last)
  }
  return out
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
function composeHeader(grid: Cell[][], r: number): { labels: string[]; dataStart: number } {
  const base = forwardFill(grid[r] ?? [])
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
function findHeader(grid: Cell[][]): { row: number; labels: string[]; score: number; dataStart: number } | null {
  let best: { row: number; labels: string[]; score: number; dataStart: number } | null = null

  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const { labels, dataStart } = composeHeader(grid, r)
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

/** The sheet title — the strongest category evidence a schedule carries. */
function findTitle(grid: Cell[][], headerRow: number): string | null {
  for (let r = 0; r < headerRow; r++) {
    const cells = (grid[r] ?? []).map(txt).filter(Boolean)
    if (cells.length === 0) continue
    const candidate = cells[0]
    if (/schedule|list|register/i.test(candidate)) return candidate
  }
  // No word "schedule" anywhere — fall back to the first non-empty line above the
  // header, but only if it is a single cell. Two or more cells is a data-ish row
  // and calling it a title would be a guess.
  for (let r = headerRow - 1; r >= 0; r--) {
    const cells = (grid[r] ?? []).map(txt).filter(Boolean)
    if (cells.length === 1 && cells[0].length <= 80) return cells[0]
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

  let best: { key: string; specificity: number; matched: string } | null = null
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
    }
  }
  return best ? { key: best.key, via: 'words', matched: best.matched } : null
}

/** Strip the trailing SCHEDULE/LIST so "SUMP PUMP SCHEDULE" reads as a category. */
function categoryFromTitle(title: string | null): string | null {
  if (!title) return null
  const c = title.replace(/\b(schedule|list|register)\b/gi, '').replace(/\s+/g, ' ').trim()
  return c.length >= 3 ? c.toUpperCase() : null
}

export function parseSheet(grid: Cell[][], sheetName: string, vocab: TypeVocab[]): ParsedSheet {
  const head = findHeader(grid)
  if (!head) {
    return {
      sheet: sheetName, title: null, proposed_category: null, header_row: null,
      mapping: {}, unmapped: [], rows: [], skipped: grid.length,
      // SAY WHY, not "0 rows". A parser that reports nothing found without saying
      // what it looked for is indistinguishable from a parser that is broken.
      note: 'No header row found. Looked for a row naming a tag/mark column plus ' +
            'at least one description, location or service column in the first 25 rows.',
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

    // A row with neither a tag nor a description is a note, a legend, or a
    // spacer. Counting it as equipment is how a 200-row schedule becomes 214.
    if (!tag && !descriptor) { skipped++; continue }

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
      area_served: colFor.area_served !== undefined ? cells[colFor.area_served] || null : null,
      proposed_type,
      observed_type_name: proposed_type ? null : observed,
      nameplate,
      confidence: Math.max(0.1, Math.round(confidence * 1000) / 1000),
      why: why.join('; ') || 'clean row: named columns, description resolved to a known type',
    })
  }

  return {
    sheet: sheetName, title, proposed_category: category, header_row: head.row + 1,
    mapping, unmapped, rows, skipped,
    note: `header on row ${head.row + 1} (score ${head.score}) · ` +
          `${Object.keys(mapping).length} columns mapped · ${unmapped.length} kept as nameplate · ` +
          `${rows.length} rows, ${skipped} skipped`,
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
export async function readWorkbook(file: File | Blob): Promise<{ name: string; grid: Cell[][] }[]> {
  const readXlsxFile = (await import('read-excel-file/browser')).default
  const sheets = await readXlsxFile(file as File, { trim: true })
  return sheets.map(s => ({ name: s.sheet, grid: s.data as Cell[][] }))
}

/** SHA-256 of the file, for B3's "re-upload proposes zero rows" guarantee. */
export async function fileHash(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
