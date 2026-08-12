// sheet-model-read — the model's reading of a spreadsheet, end to end.
//
// ONE FUNCTION, TWO CALLERS, DELIBERATELY. `api/intake.ts` calls it to stage rows
// and `extraction-bench.mjs` calls it to measure. They must be the same code.
//
// This codebase already paid for the alternative: the 88/88 region-splitting gate
// passed through a harness that "replaced the assembly step with itself", so it
// proved extraction and proved nothing about the part that was broken — 87 rows
// sat in nine uploads nobody opened. A benchmark that re-implements the read is a
// benchmark measuring itself. See ARCHITECTURE, *a gate that runs through a
// harness proves the harness*.
//
// What it does NOT do: write anything. It returns the reading; the caller decides
// what to persist. Law 2 is untouched — this proposes rows, it does not create
// equipment.

import { runAgent, type AgentRun } from './ai-common.js'
import { checkExtraction, type ExtractCheck } from './extract-contract.js'
import { renderSheet, type Cell } from './sheet-render.js'
import type { ExtractorOutput } from './agent-schemas.js'
import type { MergeRange } from '../../src/lib/sheetMerges.js'

export interface SheetReadInput {
  grid: Cell[][]
  sheetName: string
  merges?: MergeRange[]
  /** `key (Name)` strings — the vocabulary the answer must key to. */
  knownTypes: string[]
}

export interface SheetReadResult {
  run: AgentRun<ExtractorOutput>
  /** Present only when the run succeeded AND the payload crossed the boundary. */
  checked: ExtractCheck | null
  rendered: { rows: number; cols: number; filled: number; chars: number }
}

/**
 * THE TASK. Ruling 3(2): the contract hardens "no matter what" — any layout, any
 * naming — and ambiguity is asked about rather than guessed.
 *
 * It is written here rather than in the agent contract because it is the
 * FEATURE's instruction for this call. The agent contract carries what the
 * extractor always is; this carries what this call needs. (`extractor.md` is
 * still sent — it declares slices, so `runAgent` assembles its prose body.)
 */
const TASK = [
  'Read this spreadsheet and return every piece of equipment it lists.',
  '',
  'THE SHEET IS GIVEN AS ITS REAL GRID — every cell at its address, banners and',
  'blank rows intact, and merged ranges declared above it. Read all of it before',
  'answering: a schedule\'s meaning is often two rows above the row you are reading.',
  '',
  'MERGES ARE BOUNDARIES, NOT DECORATION. A group header merged across G2:I2 covers',
  'columns G, H and I and NOT column J. Do not let a group header claim a column',
  'outside its range.',
  '',
  'ANY LAYOUT, ANY NAMING. Multi-tier headers, merged banners, vendor dialects,',
  'schedules embedded in a drawing — read them. Map the sheet\'s own headings onto',
  'meaning yourself: "DUTY" and "SERVES" are usually what a unit serves, not what',
  'it is; "PIPE SZ" is a connection size; "Q" is a flow. RECORD EVERY MAPPING YOU',
  'MAKE in `mappings`, as { heading, meaning, why } — a mapping made silently is a',
  'decision nobody can check.',
  '',
  'WHAT A UNIT SERVES IS NOT WHAT IT IS. A pump on "BOILER B-1 PRIMARY LOOP" is a',
  'pump. Never type a unit from its duty, and never from its tag prefix.',
  '',
  'SPEC VALUES: put every engineering column into `nameplate`, keyed by the',
  'heading AS THE SHEET WROTE IT, including its unit — "FLOW [GPM]", "MAX INPUT',
  '[MBH]". Do not convert units. Do not rename headings.',
  '',
  'AMBIGUITY IS A QUESTION, NEVER A DEFAULT. Where the sheet genuinely does not',
  'say — a bare "MBH" column on a unit that could have an input or an output',
  'rating — extract the value and add to `ambiguities`: { about, question, where }.',
  'A guess arrives wearing a confidence score, which is worse than a blank.',
  '',
  'proposed_type MUST be one of the known_types keys, or null. Null with a low',
  'confidence is the right answer where the sheet does not say — it routes to a',
  'human, which is cheaper than a confident mistake.',
  '',
  'Rows that are notes, legends or totals are NOT equipment. Do not return them.',
  '',
  'A SHEET WITH NO IDENTIFYING COLUMN IS A FRAGMENT, NOT A SCHEDULE. Some sheets',
  'are the right-hand continuation of a wider schedule: they carry only property',
  'columns - coil capacities, filter sizes, electrical data - and no tag, mark or',
  'unit number anywhere, at any width. The units those properties belong to are on',
  'another sheet.',
  '',
  'When that is what you have, return "rows": [] and say so in page_note. Do NOT',
  'invent tags, do not use a value from another column as a tag, and do not return',
  'rows with an empty tag - a property row with no unit to attach it to is not a',
  'register row, and guessing which unit it belongs to would be worse than saying',
  'you cannot tell.',
  '',
  'Return JSON only: { "rows": [...], "mappings": [...], "ambiguities": [...],',
  '"page_note": string }',
].join('\n')

export async function readSheetWithModel(input: SheetReadInput): Promise<SheetReadResult> {
  const rendered = renderSheet(input.grid, input.sheetName, input.merges ?? [])

  const run = await runAgent<ExtractorOutput>('extractor', {
    source_kind: 'pdf' as const,   // the contract's enum; `content` is what matters here
    page: 1,
    // THE GRID IS TEXT, NOT AN IMAGE. A spreadsheet has no pixels worth reading,
    // and `ExtractorInput` requires text OR an image — this is the text branch,
    // which the PDF path has never used.
    content: rendered.text,
    known_types: input.knownTypes,
  }, { task: TASK })

  const checked = run.ok && run.value
    ? checkExtraction(run.value, { knownTypes: input.knownTypes })
    : null

  return {
    run, checked,
    rendered: { rows: rendered.rows, cols: rendered.cols, filled: rendered.filled, chars: rendered.text.length },
  }
}

/** Cost of one reading, in cents, from the run's own usage. */
export function costCents(run: { usage?: { inputTokens?: number; outputTokens?: number } | null }): number {
  const i = run.usage?.inputTokens ?? 0
  const o = run.usage?.outputTokens ?? 0
  // Sonnet-class list pricing, $3/MTok in and $15/MTok out. Stated as an estimate
  // rather than billed truth: the invoice is the authority, this is what a caller
  // reports next to a result so an accuracy gain carries its price tag.
  return (i * 3 + o * 15) / 10_000
}

// ── CHUNKED READING, for sheets whose answer does not fit ───────────────────
//
// `FanCoils.xlsx` is 199 rows x 52 columns. Its answer ran past 16,000 output
// tokens and came back cut off mid-object — not a shape failure and not fixable by
// retrying, because the answer does not fit. Across three corpus runs the pair of
// FanCoils files failed on two of them, which is most of the model leg's variance.
//
// THE PRECEDENT IS THE PDF PATH'S REGION SPLITTING, and it brought two lessons
// this must carry rather than relearn:
//
//   1. CHUNKING MULTIPLIES CALLS. A sheet read in four bands costs four reads. The
//      multiplier is reported per sheet, not folded into an average that hides it.
//   2. ASSEMBLY IS WHAT BROKE LAST TIME, not extraction. The 88/88 region gate
//      passed while 87 rows sat in uploads nobody opened. So the tripwire lives
//      here: no tag may appear in two bands, and the assembled count is asserted
//      against the sheet, never against "no error".

/** Every band gets the sheet's header rows, so each read sees column meanings. */
export interface ChunkPlan { headerRows: number; bandSize: number; bands: number }

/** Rough output-token cost of a grid. Deliberately crude: the decision is only
 *  "does this fit", and a precise estimate of an unpredictable number is a
 *  false comfort. */
export function estimateRowCost(grid: Cell[][]): number {
  const width = Math.max(0, ...grid.map(r => r?.length ?? 0))
  return Math.max(1, Math.round(width * 12))   // ~12 output tokens per populated cell
}

/** The last row holding anything. A spreadsheet's declared height is not its
 *  content: FanCoils is 199 rows and its data ends at 74, so a naive plan bought
 *  eleven bands of blank cells at ~5c each — 50c to read nothing. */
export function lastPopulatedRow(grid: Cell[][]): number {
  for (let r = grid.length - 1; r >= 0; r--) {
    if ((grid[r] ?? []).some(c => c !== null && c !== undefined && String(c).trim() !== '')) return r
  }
  return -1
}

export function planChunks(
  grid: Cell[][], dataStart: number, ceiling = 7000,
): ChunkPlan {
  const end = lastPopulatedRow(grid)
  const dataRows = Math.max(0, Math.min(grid.length, end + 1) - dataStart)
  const perRow = estimateRowCost(grid)
  const bandSize = Math.max(8, Math.floor(ceiling / perRow))
  return { headerRows: dataStart, bandSize, bands: Math.max(1, Math.ceil(dataRows / bandSize)) }
}

export interface ChunkedReadResult {
  rows: import('./extract-contract.js').CheckedRow[]
  /** One per band, so a partial failure is visible rather than averaged away. */
  bands: { index: number; rows: number; ok: boolean; failure?: string; cost: number }[]
  cost: number
  calls: number
  /** A tag appearing in two bands means the split overlapped. Loud, not silent. */
  overlaps: string[]
  ambiguities: import('./extract-contract.js').Ambiguity[]
}

/**
 * Read a sheet too large for one answer, in bands that share its header.
 *
 * `dataStart` comes from the deterministic parser's header detection — GEOMETRY
 * ONLY. The rules leg is the oracle for where the data begins; it is not consulted
 * about what any of it means.
 */
export async function readSheetChunked(
  input: SheetReadInput & { dataStart: number }, ceiling = 7000,
): Promise<ChunkedReadResult> {
  const plan = planChunks(input.grid, input.dataStart, ceiling)
  const header = input.grid.slice(0, plan.headerRows)
  // Trailing blank rows are not data and are not paid for.
  const body = input.grid.slice(plan.headerRows, lastPopulatedRow(input.grid) + 1)

  const bands: ChunkedReadResult['bands'] = []
  const rows: import('./extract-contract.js').CheckedRow[] = []
  const ambiguities: import('./extract-contract.js').Ambiguity[] = []
  const seen = new Map<string, number>()
  const overlaps: string[] = []
  let cost = 0, calls = 0

  for (let b = 0; b < plan.bands; b++) {
    const slice = body.slice(b * plan.bandSize, (b + 1) * plan.bandSize)
    if (!slice.length) continue
    const r = await readSheetWithModel({
      ...input,
      // The header travels with every band. A band read without it is a wall of
      // numbers whose columns mean nothing.
      grid: [...header, ...slice],
      sheetName: `${input.sheetName} (rows ${plan.headerRows + b * plan.bandSize + 1}-${plan.headerRows + b * plan.bandSize + slice.length})`,
    })
    calls++; cost += costCents(r.run)
    const ok = r.run.ok && !!r.checked?.ok
    bands.push({ index: b + 1, rows: r.checked?.rows.length ?? 0, ok, failure: r.run.failure, cost: costCents(r.run) })
    if (!ok) continue
    for (const row of r.checked!.rows) {
      const key = (row.tag ?? '').trim().toUpperCase()
      if (key) {
        const at = seen.get(key)
        if (at !== undefined && at !== b) overlaps.push(`${row.tag} in bands ${at + 1} and ${b + 1}`)
        seen.set(key, b)
      }
      rows.push(row)
    }
    ambiguities.push(...(r.checked!.ambiguities ?? []))
  }

  return { rows, bands, cost, calls, overlaps, ambiguities }
}
