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

// ── table regions ───────────────────────────────────────────────────────────
//
// WHY A PAGE IS NOT ALWAYS THE UNIT OF WORK.
//
// Clairlea sheet M-601 carries FOUR schedules — two WALL FINS tables, FORCED
// FLOW HEATERS, and CONVECTORS — 88 units between them. Sent whole, the
// extractor logged `outcome: truncated` at max_tokens 16000, having spent
// 10,684 of them thinking, leaving about 5,300 for 88 rows of JSON. 27 cents
// for nothing. It is the richest page in the corpus and it was the one page
// that could not be read.
//
// Row ceilings were rejected and rightly: a mechanism that fails on the
// highest-value page is backwards. So the PAGE is split into the tables it
// actually contains, and each table is a bounded extraction well inside budget.
//
// The split is deterministic and free — it reads the text layer that is already
// in the browser. No model is asked where the tables are.

export interface TableRegion {
  /** PDF-space bounding box, y measured from the bottom as pdfjs reports it. */
  x0: number; y0: number; x1: number; y1: number
  /** Text items inside it — the row-count estimate a reviewer sees. */
  items: number
  /** The header row that made this a table rather than a blob of text. */
  header: string
}

const ID_COL_RE = /^(TAG|MARK|UNIT|UNIT NO|EQUIPMENT ID|ITEM|NO)\.?$/
const DESC_COL_RE = /^(LOCATION|MANUFACTURER|MODEL|QTY|SERVICE|SERVES|REMARKS|DESCRIPTION|CAPACITY|TYPE|FLOOR|FLOOR LEVEL|AREA SERVED|ROOM)\.?$/

/**
 * Find the table regions on a page by clustering its text, then keeping only
 * the clusters that carry a header row.
 *
 * Deliberately conservative: a page with ONE region returns one, and the caller
 * treats that as "extract the page whole" — splitting a single table into
 * itself buys nothing and costs a render.
 */
export async function detectTableRegions(file: File, pageNo: number): Promise<TableRegion[]> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(pageNo)
  const content = await page.getTextContent()
  const items = (content.items as { str: string; transform: number[]; width: number; height: number }[])
    .filter(i => i.str.trim())
  if (items.length < 20) return []

  // SEGMENT ON HEADERS, IN READING ORDER.
  //
  // The first attempt clustered text spatially and fragmented Clairlea M-601
  // into 318 pieces — its largest table is ~416 items and the biggest cluster
  // was 143. Gap-based clustering is the wrong tool for a CAD sheet, where
  // ruled borders are graphics and the gutters between columns are as wide as
  // the gutters between tables.
  //
  // These PDFs emit text TABLE BY TABLE. So each header row starts a table and
  // the next header ends it — a segmentation that needs no thresholds and
  // matches how the file was actually authored.
  const words = items.map(i => i.str.trim().toUpperCase())
  const headerAt: { i: number; label: string }[] = []
  for (let a = 0; a < words.length; a++) {
    if (!ID_COL_RE.test(words[a])) continue
    const near = words.slice(a + 1, a + 12).filter(w => DESC_COL_RE.test(w))
    if (near.length < 2) continue
    // The table's NAME sits just before its header row ("WALL FINS", "TAG", …).
    const title = words.slice(Math.max(0, a - 2), a).filter(w => w.length > 2).pop() ?? ''
    headerAt.push({ i: a, label: [title, words[a], ...near].filter(Boolean).slice(0, 5).join(' ') })
  }
  if (headerAt.length < 2) return []          // one table is the page; do not split

  const regions: TableRegion[] = []
  for (let h = 0; h < headerAt.length; h++) {
    // Start two items early so the table's own title is inside the crop.
    const from = Math.max(0, headerAt[h].i - 2)
    const to = h + 1 < headerAt.length ? headerAt[h + 1].i - 2 : items.length
    const slice = items.slice(from, to)
    if (slice.length < 12) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const it of slice) {
      const x = it.transform[4], y = it.transform[5]
      x0 = Math.min(x0, x); y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + (it.width ?? 0)); y1 = Math.max(y1, y + (it.height ?? 10))
    }
    regions.push({ x0, y0, x1, y1, items: slice.length, header: headerAt[h].label })
  }
  return regions
}

/** Render one region to a PNG data URL, with a margin so the table's ruled
 *  border and title are inside the crop rather than shaved off it. */
export async function renderRegion(
  file: File, pageNo: number, r: TableRegion, scale = 2.0, margin = 24,
): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(pageNo)
  const viewport = page.getViewport({ scale })

  const full = document.createElement('canvas')
  full.width = Math.ceil(viewport.width)
  full.height = Math.ceil(viewport.height)
  const fctx = full.getContext('2d')!
  await page.render({ canvas: full, canvasContext: fctx, viewport }).promise

  // pdfjs viewport maps PDF space to canvas space including rotation; convert
  // the region's corners rather than assuming an orientation.
  const [ax, ay] = viewport.convertToViewportPoint(r.x0 - margin, r.y0 - margin)
  const [bx, by] = viewport.convertToViewportPoint(r.x1 + margin, r.y1 + margin)
  const left = Math.max(0, Math.min(ax, bx))
  const top = Math.max(0, Math.min(ay, by))
  const w = Math.min(full.width - left, Math.abs(bx - ax))
  const h = Math.min(full.height - top, Math.abs(by - ay))
  if (w < 40 || h < 40) return full.toDataURL('image/png')

  const crop = document.createElement('canvas')
  crop.width = Math.ceil(w); crop.height = Math.ceil(h)
  crop.getContext('2d')!.drawImage(full, left, top, w, h, 0, 0, w, h)
  return crop.toDataURL('image/png')
}
