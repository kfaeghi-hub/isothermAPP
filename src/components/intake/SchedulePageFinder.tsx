// SchedulePageFinder.tsx — drag in the whole drawing set (1.02, item 3).
//
// THE SHAPE OF THE PROBLEM. A mechanical set is 200 pages and six of them are
// schedules. Today someone opens the PDF, finds those six, exports them, and
// drags the export in. That works, it is unchanged, and it is still the fastest
// path when you already know the page numbers — so nothing here replaces it.
//
// What this adds is the case where you do not: drop the whole set, and it
// proposes the pages. The proposal is NOT an extraction. Only pages a human
// ticks are read, and the cost of reading them is shown before it is spent.
//
// THREE COSTS, IN INCREASING ORDER, AND THE CHEAPEST ONE RUNS FIRST:
//   1. the text layer, in this browser — free, decides most of the set
//   2. the sorter, on what is left — ~1-2c a page, a handful of pages
//   3. the extractor, on what you confirm — the real cost, never automatic

import { useState } from 'react'
import { authedFetch } from '../../lib/api'
import { scanPdfPages, renderPage, PAGE_CEILING, type PageScan } from '../../lib/schedulePages'

interface Candidate extends PageScan {
  picked: boolean
  title: string | null
  thumb: string | null
  /** Set when the sorter ruled on this page rather than the text filter. */
  sorted?: { is_schedule: boolean; confidence: number; reason?: string }
}

interface Props {
  file: File
  onConfirm: (pages: { page: number; sheet: string | null }[]) => void
  onCancel: () => void
}

export function SchedulePageFinder({ file, onConfirm, onCancel }: Props) {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'sorting' | 'ready' | 'error'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [total, setTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // CHUNKED CONTINUATION, not a raised ceiling. Clairlea's 55-page set leaves 51
  // undecided pages against a 40-per-pass guard. The guard exists so a 300-page
  // set can never quietly spend a fortune, and it stays — but a dead-end refusal
  // turned a cost guard into a wall. The user proceeds chunk by chunk instead,
  // with the cost of each chunk shown before it is spent.
  const [pending, setPending] = useState<PageScan[]>([])
  const [file2, setFile2] = useState<File | null>(null)
  const [chunkBusy, setChunkBusy] = useState(false)

  async function run() {
    setPhase('scanning'); setError(null); setNote(null)
    try {
      const { pages, total: n, truncated: cut } = await scanPdfPages(
        file, (done, t) => setProgress({ done, total: t }))
      setTotal(n); setTruncated(cut)

      const undecided = pages.filter(p => p.verdict === 'ambiguous' || p.verdict === 'scanned')
      let sorted: Record<number, Candidate['sorted']> = {}

      // Only the first CHUNK is sorted now; the rest wait behind a button that
      // says what the next chunk will cost.
      const CHUNK = 40
      const thisPass = undecided.slice(0, CHUNK)
      const rest = undecided.slice(CHUNK)
      setPending(rest)
      setFile2(file)

      if (thisPass.length) {
        setPhase('sorting')
        // Only the scanned pages need an image. Rendering the ambiguous ones
        // too would double the cost to answer a question their text already
        // frames.
        const payload = await Promise.all(thisPass.map(async p => ({
          page: p.page,
          text_excerpt: p.verdict === 'ambiguous'
            ? `sheet ${p.sheet ?? '?'} · terms: ${p.keywords.join(', ') || 'none'} · ` +
              `${p.columnRuns} column runs · ${p.textItems} text items`
            : undefined,
          image_base64: p.verdict === 'scanned' ? await renderPage(file, p.page) : undefined,
        })))

        const res = await authedFetch('/api/intake', { action: 'find-pages', pages: payload })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          // The ceiling message and every other refusal is shown, not swallowed.
          // The user still gets the deterministic verdicts below it.
          setNote(body.error ?? `The sort could not run (${res.status}).`)
        } else {
          if (body.note) setNote(body.note)
          for (const r of body.sorted ?? []) {
            sorted[r.page] = { is_schedule: r.is_schedule, confidence: r.confidence, reason: r.reason }
            if (r.title) {
              const hit = pages.find(p => p.page === r.page)
              if (hit) (hit as Candidate).title = r.title
            }
          }
        }
      }

      // WHAT GETS SHOWN. Everything the filter called a schedule, everything the
      // sorter called a schedule, and everything nobody could call — shown
      // unticked. A page the machine could not judge is a page the human should
      // see, not one that disappears.
      const shortlist = pages.filter(p =>
        p.verdict === 'schedule' ||
        sorted[p.page]?.is_schedule === true ||
        (p.verdict !== 'not' && !sorted[p.page]))

      const withThumbs: Candidate[] = []
      for (const p of shortlist) {
        withThumbs.push({
          ...p,
          title: (p as Candidate).title ?? null,
          sorted: sorted[p.page],
          // PRE-TICKED ONLY ON REAL EVIDENCE: a page that says it is a schedule,
          // or one the sorter confirmed. The keyword-count route offers a page
          // without claiming it — render-and-look on a completed CHECKLIST had
          // two of its three pages ticked, because a checklist is also a dense
          // table with TAG and MODEL headings.
          picked: p.titled || sorted[p.page]?.is_schedule === true,
          thumb: await renderPage(file, p.page, 0.28).catch(() => null),
        })
      }
      setCandidates(withThumbs)
      setPhase('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }


  /** Sort the next chunk of undecided pages. The guard's PURPOSE — no silent
   *  bulk spend — is served by showing the cost and requiring a click, not by
   *  refusing to continue. */
  async function sortNextChunk() {
    if (!file2 || !pending.length) return
    setChunkBusy(true); setError(null)
    try {
      const CHUNK = 40
      const thisPass = pending.slice(0, CHUNK)
      const payload = await Promise.all(thisPass.map(async p => ({
        page: p.page,
        text_excerpt: p.verdict === 'ambiguous'
          ? `sheet ${p.sheet ?? '?'} · terms: ${p.keywords.join(', ') || 'none'} · ` +
            `${p.columnRuns} column runs · ${p.textItems} text items`
          : undefined,
        image_base64: p.verdict === 'scanned' ? await renderPage(file2, p.page) : undefined,
      })))
      const res = await authedFetch('/api/intake', { action: 'find-pages', pages: payload })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setNote(body.error ?? `The sort could not run (${res.status}).`); return }

      const fresh: Record<number, Candidate['sorted']> = {}
      for (const r of body.sorted ?? []) {
        fresh[r.page] = { is_schedule: r.is_schedule, confidence: r.confidence, reason: r.reason }
      }

      // Newly confirmed pages join the list, pre-ticked, with their thumbnails.
      const added: Candidate[] = []
      for (const p of thisPass) {
        const v = fresh[p.page]
        if (!v?.is_schedule) continue
        added.push({
          ...p, title: null, sorted: v, picked: true,
          thumb: await renderPage(file2, p.page, 0.28).catch(() => null),
        })
      }
      setCandidates(cs => [...cs, ...added].sort((a, b) => a.page - b.page))
      setPending(pending.slice(CHUNK))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setChunkBusy(false) }
  }

  const picked = candidates.filter(c => c.picked)

  if (phase === 'idle') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
        <p className="text-xs text-gray-700">
          <strong>{file.name}</strong> looks like a drawing set. Find the schedule
          pages in it?
        </p>
        <p className="text-[11px] text-gray-500 mt-1">
          The text layer is read here, for free. Only pages it cannot call are sent
          to be looked at, and <strong>only pages you confirm are extracted</strong>.
        </p>
        <div className="flex gap-2 mt-2">
          <button onClick={() => void run()}
            className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">
            Find schedule pages
          </button>
          <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'scanning' || phase === 'sorting') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-600">
        {phase === 'scanning'
          ? `Reading the text layer — page ${progress.done} of ${progress.total}…`
          : 'Looking at the pages the text layer could not call…'}
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="text-xs text-red-700">{error}</p>
        <button onClick={onCancel} className="text-xs text-gray-600 mt-2 hover:text-gray-800">Close</button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3">
      <h5 className="text-xs font-semibold text-gray-700">
        {candidates.length === 0
          ? `No schedule pages found in ${total} pages`
          : `${picked.length} of ${candidates.length} candidate page${candidates.length === 1 ? '' : 's'} selected — ${total} pages read`}
      </h5>
      <p className="text-[11px] text-gray-600 mt-0.5">
        Tick what you want read. Each ticked page is one extraction call.
      </p>
      {truncated && (
        <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 mt-1">
          This set has {total} pages and the first {PAGE_CEILING} were read.
          Pages after {PAGE_CEILING} were <strong>not looked at</strong> — split the
          set, or extract those pages yourself and drag them in.
        </p>
      )}
      {note && <p className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 mt-1">{note}</p>}

      {/* BOUNDED, because the thumbnails are tall. Unconstrained, the candidate
          grid ran off the panel and over the equipment list behind it. */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[26rem] overflow-y-auto pr-1">
        {candidates.map(c => (
          <label key={c.page}
            className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${
              c.picked ? 'border-teal-400 bg-white' : 'border-gray-200 bg-white/60'}`}>
            <input type="checkbox" checked={c.picked}
              aria-label={`Page ${c.page}${c.sheet ? ` (sheet ${c.sheet})` : ''}`}
              onChange={() => setCandidates(list => list.map(x =>
                x.page === c.page ? { ...x, picked: !x.picked } : x))}
              className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-gray-800 truncate">
                Page {c.page}{c.sheet ? ` · ${c.sheet}` : ''}
              </p>
              {c.title && <p className="text-[10px] text-gray-700 truncate">{c.title}</p>}
              <p className="text-[10px] text-gray-500">
                {c.sorted
                  ? `looked at — ${c.sorted.reason ?? (c.sorted.is_schedule ? 'reads as a schedule' : 'not a schedule')}`
                  : c.reason}
              </p>
              {c.thumb && (
                <img src={c.thumb} alt={`Page ${c.page}`}
                  className="mt-1 w-full max-h-40 object-cover object-top rounded border border-gray-200" />
              )}
            </div>
          </label>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="mt-2 rounded border border-gray-200 bg-white/70 p-2">
          <p className="text-[11px] text-gray-700">
            <strong>{pending.length}</strong> more page{pending.length === 1 ? '' : 's'} could not be
            called by the text layer. Sorting the next {Math.min(40, pending.length)} costs roughly{' '}
            <strong>{Math.min(40, pending.length) * 1.5 >= 100
              ? `$${(Math.min(40, pending.length) * 1.5 / 100).toFixed(2)}`
              : `${Math.round(Math.min(40, pending.length) * 1.5)}¢`}</strong>.
          </p>
          <button onClick={() => void sortNextChunk()} disabled={chunkBusy}
            className="mt-1 text-xs bg-white border border-teal-600 text-teal-700 rounded px-2.5 py-1
                       hover:bg-teal-50 disabled:opacity-50">
            {chunkBusy ? 'Sorting…' : `Sort next ${Math.min(40, pending.length)}`}
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onConfirm(picked.map(c => ({ page: c.page, sheet: c.sheet })))}
          disabled={picked.length === 0}
          className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800 disabled:opacity-50">
          Extract {picked.length} page{picked.length === 1 ? '' : 's'}
        </button>
        <button onClick={onCancel} className="text-xs text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </div>
  )
}
