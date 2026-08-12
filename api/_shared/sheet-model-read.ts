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
