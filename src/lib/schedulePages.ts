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
  /** Why, in the user's words — shown on the confirmation screen. */
  reason: string
  /** The sheet number/title if the page states one. */
  sheet: string | null
  keywords: string[]
  /** Distinct x-positions that repeat down the page — a table's spine. */
  columnRuns: number
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
        page: n, verdict: 'scanned',
        reason: 'no text layer — needs a look',
        sheet: null, keywords: [], columnRuns: 0, textItems: items.length,
      })
      onProgress?.(n, limit)
      continue
    }

    const keywords = SCHEDULE_WORDS.filter(w => text.includes(w))
    const planHits = PLAN_WORDS.filter(w => text.includes(w))

    // COLUMN RUNS: how many distinct x-positions carry three or more text items.
    // A table has a spine; a plan sheet's text is scattered. This is the single
    // most reliable signal that survives a title we have never seen before.
    const byX = new Map<number, number>()
    for (const i of items) {
      const x = Math.round(i.transform[4] / 4) * 4     // 4pt buckets
      byX.set(x, (byX.get(x) ?? 0) + 1)
    }
    const columnRuns = [...byX.values()].filter(c => c >= 3).length

    const sheet = sheetFrom(items.map(i => i.str).join(' '))
    const titled = /\b[A-Z ]{3,30}SCHEDULE\b/.test(text)

    let verdict: PageVerdict
    let reason: string
    if (titled && columnRuns >= 4) {
      verdict = 'schedule'; reason = 'titled a schedule, and laid out as a table'
    } else if (keywords.length >= 4 && columnRuns >= 6) {
      verdict = 'schedule'; reason = `${keywords.length} schedule terms in ${columnRuns} columns`
    } else if (planHits.length > 0 && !titled && columnRuns < 6) {
      verdict = 'not'; reason = `reads as a drawing (${planHits[0].toLowerCase()})`
    } else if (keywords.length === 0 && columnRuns < 4) {
      verdict = 'not'; reason = 'no schedule terms, no table structure'
    } else {
      // NOT A REJECTION. The filter has an opinion and not enough evidence, so
      // it hands the page to the model rather than deciding quietly.
      verdict = 'ambiguous'
      reason = `${keywords.length} schedule term${keywords.length === 1 ? '' : 's'}, ` +
               `${columnRuns} column${columnRuns === 1 ? '' : 's'} — not clear either way`
    }

    pages.push({ page: n, verdict, reason, sheet, keywords, columnRuns, textItems: items.length })
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
