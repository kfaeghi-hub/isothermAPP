// schedulePages.ts — the deterministic half of the schedule-page finder (1.02).
//
// WHY THE FILTER RUNS IN THE BROWSER. The drawing set is already here, in the
// user's hands, before a single byte is uploaded. Reading its text layer costs
// nothing, needs no round trip, and does not push a 300-page PDF through a
// serverless function's memory. The model is only asked about the pages this
// cannot decide — which on a real set is a handful, not the whole book.
//
// THE FILTER IS DELIBERATELY ASYMMETRIC. It is confident about what a schedule
// IS and shy about ruling one out. A missed schedule page costs a human a
// scroll; a wrongly-included plan sheet costs an extraction call and a page of
// nonsense rows in the review screen. So a page needs real evidence to be
// proposed, and only obvious plan-sheet markers to be set aside — everything
// else goes to `ambiguous`, which is the model's job, not a silent rejection.

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Above this, we stop reading and say so rather than truncating quietly. */
export const PAGE_CEILING = 400

export type PageVerdict = 'schedule' | 'not' | 'ambiguous' | 'scanned'

export interface PageScan {
  page: number
  verdict: PageVerdict
  /** True only for a page TITLED a schedule. The keyword-count route can reach
   *  `verdict: 'schedule'` on any dense tagged table — a completed checklist
   *  scored "8 schedule terms in 30 columns" — so the confirmation screen
   *  pre-ticks on this, not on the verdict. Being offered is cheap; being
   *  ticked by default is a claim. */
  titled: boolean
  /** Why, in the user's words — shown on the confirmation screen. */
  reason: string
  /** The sheet number/title if the page states one. */
  sheet: string | null
  keywords: string[]
  /** Distinct positions along the page's TRUE horizontal that repeat — a
   *  table's spine. Rotation-aware since 2026-08-04. */
  columnRuns: number
  /** An identity column with descriptive columns beside it: a header row.
   *  This, not density, is what separates a schedule from a plan sheet. */
  headerSignature: boolean
  textItems: number
}

// Words that appear on equipment schedules and essentially nowhere else on a
// drawing set. Deliberately domain words, not generic table words.
const SCHEDULE_WORDS = [
  'SCHEDULE', 'MARK', 'TAG', 'CFM', 'MBH', 'GPM', 'L/S', 'BHP', 'RPM',
  'MANUFACTURER', 'MODEL', 'SERVES', 'REMARKS', 'CAPACITY', 'ESP', 'EWT', 'LWT',
]
// Markers that a sheet is a drawing, not a table.
const PLAN_WORDS = [
  'FLOOR PLAN', 'ROOF PLAN', 'SITE PLAN', 'SECTION', 'DETAIL', 'ELEVATION',
  'RISER DIAGRAM', 'KEY PLAN', 'LEGEND', 'SPECIFICATION',
]

/** Sheet numbers as Ontario drawing sets write them: M-101, E2.03, MP1.1. */
const SHEET_RE = /\b([A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,2})?)\b/

function sheetFrom(text: string): string | null {
  // The sheet number lives in the title block, which is the END of the page's
  // text order far more often than the start.
  const tail = text.slice(-400)
  return tail.match(SHEET_RE)?.[1] ?? text.match(SHEET_RE)?.[1] ?? null
}

/**
 * Read the text layer and rule on each page.
 *
 * `onProgress` exists because a 200-page set takes a few seconds and a frozen
 * button reads as a broken one.
 */
export async function scanPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: PageScan[]; total: number; truncated: boolean }> {
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const total = doc.numPages
  const limit = Math.min(total, PAGE_CEILING)
  const pages: PageScan[] = []

  for (let n = 1; n <= limit; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items = content.items as { str: string; transform: number[] }[]
    const text = items.map(i => i.str).join(' ').toUpperCase()

    // A page with (almost) no text layer is SCANNED, not empty. The difference
    // matters: an empty page should be skipped, a scanned schedule must still be
    // found, and only a model can tell them apart.
    if (items.length < 12) {
      pages.push({
        page: n, verdict: 'scanned', titled: false, headerSignature: false,
        reason: 'no text layer — needs a look',
        sheet: null, keywords: [], columnRuns: 0, textItems: items.length,
      })
      onProgress?.(n, limit)
      continue
    }

    const keywords = SCHEDULE_WORDS.filter(w => text.includes(w))
    const planHits = PLAN_WORDS.filter(w => text.includes(w))

    // COLUMN RUNS: how many distinct positions along the page's TRUE HORIZONTAL
    // carry three or more text items. A table has a spine; a plan sheet's text
    // is scattered.
    //
    // ROTATION MATTERS AND USED TO BE IGNORED. This bucketed transform[4] — the
    // PDF-space x — on every page. On a 270-rotated sheet that axis runs down
    // the page as the reader sees it, so column detection was measuring the
    // wrong direction entirely. Ten of Workman's eighteen sheets are
    // /Rotate 270 with essentially every glyph rotated (517 of 571 items on one
    // page), so this was not an edge case in this corpus — it was the corpus.
    const rot = ((page.rotate % 360) + 360) % 360
    const acrossIsX = rot === 0 || rot === 180
    const byPos = new Map<number, number>()
    for (const i of items) {
      const raw = acrossIsX ? i.transform[4] : i.transform[5]
      const pos = Math.round(raw / 4) * 4              // 4pt buckets
      byPos.set(pos, (byPos.get(pos) ?? 0) + 1)
    }
    const columnRuns = [...byPos.values()].filter(c => c >= 3).length

    const sheet = sheetFrom(items.map(i => i.str).join(' '))
    const titled = /\b[A-Z ]{3,30}SCHEDULE\b/.test(text)

    // THE HEADER SIGNATURE — what actually separates a schedule from a plan.
    //
    // Density does not. Calibrated against four real TDSB sets: Clairlea p4 is
    // a PLAN with 142 column runs; Clairlea p17 is a real WALL FINS schedule
    // with 147. Indistinguishable by shape — and the old rule (4 keywords + 6
    // column runs) called 24 of Clairlea's 55 pages schedules when about five
    // of them are.
    //
    // A schedule has a HEADER ROW; a plan does not. The real ones in this
    // corpus read "BOILERS TAG QTY. LOCATION MANUFACTURER MODEL FLUID INPUT"
    // and "WALL FINS TAG FLOOR LEVEL LOCATION MANUFACTURER MODEL AWT". The
    // tell is an identity column (TAG / MARK / UNIT / EQUIPMENT ID) with two or
    // more descriptive columns beside it WITHIN A SHORT RUN of text items —
    // because a header row is contiguous in reading order and a plan's stray
    // words are not.
    const ID_COL = /^(TAG|MARK|UNIT|UNIT NO|EQUIPMENT ID|ITEM|NO)\.?$/
    const DESC_COL = /^(LOCATION|MANUFACTURER|MODEL|QTY|SERVICE|SERVES|REMARKS|DESCRIPTION|CAPACITY|TYPE|FLOOR|FLOOR LEVEL|AREA SERVED|ROOM)\.?$/
    const cellWords = items.map(i => i.str.trim().toUpperCase()).filter(Boolean)
    let headerSignature = false
    for (let a = 0; a < cellWords.length && !headerSignature; a++) {
      if (!ID_COL.test(cellWords[a])) continue
      let descs = 0
      for (let b = a + 1; b < Math.min(a + 12, cellWords.length); b++) {
        if (DESC_COL.test(cellWords[b])) descs++
      }
      if (descs >= 2) headerSignature = true
    }

    let verdict: PageVerdict
    let reason: string
    if (headerSignature) {
      // The strongest evidence available without a model.
      verdict = 'schedule'
      reason = titled ? 'titled a schedule, with a table header row'
                      : 'has a table header row — a tag/mark column with named columns beside it'
    } else if (titled && columnRuns >= 4) {
      // TITLE ALONE NO LONGER CLAIMS A PAGE. A TDSB title sheet carries a
      // DRAWING LIST, and half the plan sheets say "AS PER SCHEDULE" in a note
      // — both match the title regex. Without a header row this is a question,
      // not an answer, so it goes to the sorter with what we saw.
      verdict = 'ambiguous'
      reason = 'says "schedule" and is laid out as a table, but has no header row'
    } else if (planHits.length > 0 && !titled && columnRuns < 6) {
      verdict = 'not'; reason = `reads as a drawing (${planHits[0].toLowerCase()})`
    } else if (keywords.length === 0 && columnRuns < 4) {
      verdict = 'not'; reason = 'no schedule terms, no table structure'
    } else {
      // NOT A REJECTION. The filter has an opinion and not enough evidence, so
      // it hands the page to the model rather than deciding quietly.
      // The old keyword-density route CLAIMED these pages. Density can now
      // only raise a question, never answer one.
      verdict = 'ambiguous'
      reason = `${keywords.length} schedule term${keywords.length === 1 ? '' : 's'}, ` +
               `${columnRuns} column${columnRuns === 1 ? '' : 's'} — not clear either way`
    }

    pages.push({ page: n, verdict, reason, sheet, keywords, columnRuns, titled,
                 headerSignature, textItems: items.length })
    onProgress?.(n, limit)
  }

  return { pages, total, truncated: total > limit }
}

/** Render one page to a PNG data URL — used for the thumbnail AND for the model
 *  call on the pages the text layer could not decide. Only the pages that need
 *  it are rendered; rendering 200 pages to ask about 6 is the cost this whole
 *  pre-pass exists to avoid. */
export async function renderPage(file: File, pageNo: number, scale = 0.6): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(pageNo)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}
