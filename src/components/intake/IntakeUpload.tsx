// Intake upload — the deterministic Excel path, B1.
//
// THE PARSE HAPPENS BEFORE ANYTHING IS WRITTEN, AND THE USER SEES IT FIRST.
// A schedule is parsed in the browser, the column mapping and the counts are
// shown, and only then does a click stage it. An importer that writes first and
// reports afterwards asks someone to audit 200 rows they have already committed
// to; this one asks a single question — "did it read your schedule correctly?" —
// while the answer is still free.
//
// NOTHING HERE TOUCHES `equipment`. Rows land in intake_rows for B2's review and
// B3's approval. Law 2.
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { authedFetch } from '../../lib/api'
import { readWorkbook, parseSheet, fileHash, type ParsedSheet, type TypeVocab } from '../../lib/intakeExcel'
import { SchedulePageFinder } from './SchedulePageFinder'
import { renderPage, detectTableRegions, renderRegion } from '../../lib/schedulePages'
import { sniffBlobMediaType } from '../../lib/mediaType'

interface Staged extends ParsedSheet {
  enrich: number       // rows whose tag already exists on this project
  dupes: number        // rows whose tag repeats inside this upload
}

export function IntakeUpload({ projectId, onStaged }: {
  projectId: string
  onStaged: (uploadId: string) => void
}) {
  const [file, setFile]   = useState<File | null>(null)
  const [sheets, setSheets] = useState<Staged[] | null>(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<Map<string, string>>(new Map())
  // A multi-page PDF goes to the finder first. A single page or an image is
  // already the page someone meant, and asking about it would be ceremony.
  const [findingIn, setFindingIn] = useState<File | null>(null)
  const [pageProgress, setPageProgress] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  /** Anything that is not a spreadsheet is a PAGE for the extractor. */
  const isPage = (f: File) => /\.(png|jpe?g|webp|pdf)$/i.test(f.name)

  /**
   * A PAGE, NOT A SPREADSHEET — upload it and let the extractor read it.
   *
   * There is no client-side preview for this path, and that is honest rather
   * than lazy: the mapping a spreadsheet preview shows is derived from a header
   * row this file does not have. The review screen is where an extracted page
   * gets checked, row by row, which is what its confidence deserves.
   */
  async function extractPage(f: File) {
    setError(null); setSheets(null); setFile(f); setBusy(true)
    try {
      const hash = await fileHash(f)
      const { data: prior } = await supabase.from('intake_uploads')
        .select('id, filename, uploaded_at, status')
        .eq('project_id', projectId).eq('content_sha256', hash)
        .order('uploaded_at', { ascending: false }).limit(1)
      if (prior?.length) {
        const p0 = prior[0]
        setError(`This exact page was already uploaded as "${p0.filename}" on ` +
          `${new Date(p0.uploaded_at).toLocaleDateString()} (status: ${p0.status}). ` +
          `Open that upload rather than paying for a second reading of the same image.`)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_')
      const path = `${projectId}/${Date.now()}_${safe}`
      const up = await supabase.storage.from('intake-files').upload(path, f)
      if (up.error) throw new Error(`storage: ${up.error.message}`)

      const { data: upload, error: uErr } = await supabase.from('intake_uploads').insert({
        project_id: projectId, filename: f.name, storage_path: path,
        kind: (await sniffBlobMediaType(f)) === 'application/pdf' ? 'pdf' : 'image',
        media_type: await sniffBlobMediaType(f),
        content_sha256: hash, status: 'uploaded',
        uploaded_by: user?.id ?? null,
      }).select('id').single()
      if (uErr) throw new Error(uErr.message)

      const res = await authedFetch('/api/intake', { upload_id: upload.id, action: 'extract' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        // The upload row survives a failed reading on purpose: the file is
        // stored, the failure is logged against it, and a retry costs one call
        // rather than another upload.
        throw new Error(body?.error ?? `extraction failed (${res.status})`)
      }

      onStaged(upload.id)
      setFile(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }


  /**
   * Upload and extract exactly the pages the human ticked — one call each.
   *
   * ONE UPLOAD PER PAGE, deliberately. The extraction budget is per page (the
   * extractor's contract says so), so a page is the unit of work, the unit of
   * cost, and the unit of provenance. It also means a set where page 44 fails
   * still gives you 41 and 42, rather than losing all three.
   *
   * The page is rendered here rather than the whole PDF being sent: the set may
   * be 300 pages and 90MB, and the six that matter are a few hundred KB.
   */
  /** One page? Extract it, as before. Many? Ask which ones. */
  async function openFinder(f: File) {
    setError(null); setBusy(true)
    try {
      const { getDocument } = await import('pdfjs-dist')
      const doc = await getDocument({ data: await f.arrayBuffer() }).promise
      if (doc.numPages <= 1) { setBusy(false); void extractPage(f); return }
      setFile(f); setFindingIn(f)
    } catch (e) {
      // A PDF we cannot even count the pages of still deserves the old path
      // rather than a dead end.
      setError(e instanceof Error ? e.message : String(e))
      void extractPage(f)
    } finally { setBusy(false) }
  }


  /** Stage ONE rendered image — a whole page, or one table region of it. */
  async function stageOne(
    f: File, p: { page: number; sheet: string | null }, dataUrl: string,
    userId: string | null, regionNo: number | null, regionLabel: string | null,
    staged: string[],
  ) {
    const blob = await (await fetch(dataUrl)).blob()
    const safe = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_')
    const suffix = regionNo ? `_r${regionNo}` : ''
    const path = `${projectId}/${Date.now()}_${safe}_p${p.page}${suffix}.png`
    const up = await supabase.storage.from('intake-files').upload(path, blob)
    if (up.error) throw new Error(`storage: ${up.error.message}`)

    const { data: upload, error: uErr } = await supabase.from('intake_uploads').insert({
      project_id: projectId,
      filename: `${f.name} — page ${p.page}${p.sheet ? ` (${p.sheet})` : ''}` +
                (regionLabel ? ` · ${regionLabel}` : ''),
      storage_path: path, kind: 'image',
      media_type: await sniffBlobMediaType(blob),
      content_sha256: await fileHash(new File([blob], path)),
      status: 'uploaded', pages: 1, selected_pages: [p.page],
      uploaded_by: userId,
    }).select('id').single()
    if (uErr) throw new Error(uErr.message)

    const res = await authedFetch('/api/intake', {
      upload_id: upload.id, action: 'extract', page: p.page, sheet: p.sheet,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      // The KIND of failure travels with the message. "We could not fetch your
      // page" and "your page held nothing" are different facts about a
      // document, and a summary that conflates them teaches the user the wrong
      // thing about their own file.
      const err = new Error(body?.error ?? `extraction failed (${res.status})`) as Error & {
        failure?: string; attempts?: number
      }
      if (body?.failure) err.failure = body.failure
      if (body?.attempts) err.attempts = body.attempts
      throw err
    }
    staged.push(upload.id)
  }

  async function extractConfirmed(f: File, pages: { page: number; sheet: string | null }[]) {
    setFindingIn(null); setBusy(true); setError(null)
    const staged: string[] = []
    const failed: string[] = []
    const fetchFailures: { page: number; attempts?: number }[] = []
    try {
      const { data: { user } } = await supabase.auth.getUser()
      for (const [i, p] of pages.entries()) {
        setPageProgress(`Reading page ${p.page}${p.sheet ? ` (${p.sheet})` : ''} — ${i + 1} of ${pages.length}…`)
        try {
          // A PAGE IS NOT ALWAYS THE UNIT OF WORK. Clairlea M-601 carries four
          // schedules and 88 units; sent whole it truncated at 16,000 output
          // tokens having spent 10,684 of them thinking, and cost 27c for
          // nothing. Split deterministically, each table is a bounded read.
          const regions = await detectTableRegions(f, p.page).catch(() => [])
          const shots = regions.length
            ? await Promise.all(regions.map(r => renderRegion(f, p.page, r, 2.0)))
            : [await renderPage(f, p.page, 2.0)]
          for (const [ri, dataUrl] of shots.entries()) {
            const label = regions.length ? ` [${ri + 1}/${shots.length}] ${regions[ri].header}` : ''
            if (regions.length) {
              setPageProgress(`Reading page ${p.page}${label} — ${i + 1} of ${pages.length}…`)
            }
            await stageOne(f, p, dataUrl, user?.id ?? null, regions.length ? ri + 1 : null,
                           regions.length ? regions[ri].header : null, staged)
          }
          continue
        } catch (e) {
          // ONE BAD PAGE DOES NOT LOSE THE OTHERS, and it is NAMED rather than
          // counted. "2 pages failed" sends someone hunting; "page 44 failed"
          // sends them to page 44.
          const fe = e as Error & { failure?: string; attempts?: number }
          if (fe?.failure === 'fetch') fetchFailures.push({ page: p.page, attempts: fe.attempts })
          failed.push(`page ${p.page}: ${e instanceof Error ? e.message : String(e)}`)
          continue
        }
      }

      // ── THE ASSEMBLY TRIPWIRE ────────────────────────────────────────────
      //
      // If two regions of the same page returned the SAME TAG, the geometry is
      // wrong and the register is about to gain phantom units. This flags it
      // LOUDLY and never dedups.
      //
      // Silently deduping would be the worse bug: it would mask exactly the
      // geometry defect this check exists to catch, converting a detectable
      // failure back into invisible almost-correctness. Tonight's evidence —
      // a page of 88 units returned 136, because two crops read the same column,
      // and a total of 136 tells you nothing about WHICH rows are doubled.
      //
      // It also catches the legitimate rare case: a genuinely repeated tag on
      // a source sheet. The Seneca import handled that by suffixing, VISIBLY.
      // Both roads lead to the same place — a human looking at it.
      if (staged.length > 1) {
        const { data: allRows } = await supabase.from('intake_rows')
          .select('upload_id, tag').in('upload_id', staged).not('tag', 'is', null)
        const byTag = new Map<string, Set<string>>()
        for (const r of allRows ?? []) {
          const k = String(r.tag).trim().toUpperCase()
          if (!k) continue
          if (!byTag.has(k)) byTag.set(k, new Set())
          byTag.get(k)!.add(r.upload_id)
        }
        const collisions = [...byTag.entries()].filter(([, ids]) => ids.size > 1)
        if (collisions.length) {
          const { data: ups } = await supabase.from('intake_uploads')
            .select('id, filename').in('id', staged)
          const nameOf = (id: string) =>
            (ups ?? []).find(u => u.id === id)?.filename?.split('·').pop()?.trim() ?? id.slice(0, 8)
          const detail = collisions.slice(0, 8).map(([tag, ids]) =>
            `  ${tag} — in ${[...ids].map(nameOf).join(' AND ')}`).join('\n')
          setError(
            `STOP — ${collisions.length} tag(s) came back from more than one part of ` +
            `page ${pages[0]?.page ?? '?'}, which means two regions read the same table.\n` +
            `These rows are NOT clean data and have not been deduplicated:\n${detail}` +
            (collisions.length > 8 ? `\n  …and ${collisions.length - 8} more` : '') +
            `\n\nReview the staged rows before approving any of them. If the sheet ` +
            `genuinely repeats a tag, keep both and suffix them; if it does not, the ` +
            `page split is wrong and the extraction should be redone whole.`)
        }
      }

      if (failed.length) {
        // NEVER FETCHED IS NOT "READ AND EMPTY". "0 page(s) read" describes the
        // outcome and misattributes the cause: it reads as *your document had
        // nothing in it*, when the truth was that we could not pull the file.
        // A message that blames the wrong thing sends someone to re-scan a
        // drawing that was fine.
        const allFetch = fetchFailures.length === failed.length
        if (staged.length === 0 && allFetch) {
          const a = fetchFailures[0]?.attempts
          const pageList = fetchFailures.map(f => f.page).join(', ')
          setError(
            `Could not fetch page ${pageList}${a ? ` after ${a} attempt${a === 1 ? '' : 's'}` : ''} — ` +
            `nothing was read from your drawing, and nothing is wrong with it. ` +
            `This is a storage problem on our side. Retry the extract.`)
        } else {
          setError(
            `${staged.length} page(s) read. These did not:\n` + failed.join('\n') +
            (fetchFailures.length
              ? `\n\n${fetchFailures.length === failed.length ? 'All of those' : 'Some of those'} ` +
                `could not be FETCHED — those pages were never read, so this says ` +
                `nothing about their contents. Retry the extract.`
              : ''))
        }
      }
      // ONE PAGE'S ROWS ARE ONE THING TO REVIEW.
      //
      // Region splitting turns one page into N uploads. This used to open
      // staged[0] and stop — so a Clairlea field run that extracted 88 rows
      // across four regions showed a review screen with ONE row on it, and 87
      // rows sat in `parsed` uploads nobody was shown. The extraction was
      // perfect; the presentation lost it.
      //
      // The count is stated before the review opens, so a page that split is
      // never mistaken for a page that returned almost nothing.
      if (staged.length) {
        if (staged.length > 1) {
          const { count } = await supabase.from('intake_rows')
            .select('id', { count: 'exact', head: true }).in('upload_id', staged)
          setPageProgress(null)
          setNote(`${pages.length} page(s) split into ${staged.length} tables — ` +
                  `${count ?? 0} rows in total. Each table is listed below and ` +
                  `reviewed separately; the first is open.`)
        }
        onStaged(staged[0])
      }
      if (!staged.length && !failed.length) setError('Nothing was extracted.')
    } finally {
      setPageProgress(null); setBusy(false)
    }
  }

  async function choose(f: File) {
    setError(null); setSheets(null); setFile(f); setBusy(true)
    try {
      // The firm vocabulary, read fresh — a type minted since the page loaded is
      // one the parser should be able to resolve.
      const { data: types } = await supabase.from('equipment_types')
        .select('key, name').eq('active', true)
      const vocab = (types ?? []) as TypeVocab[]

      // Existing tags on this project, for enrich detection.
      const { data: existing } = await supabase.from('equipment')
        .select('id, tag').eq('project_id', projectId)
      const byTag = new Map((existing ?? []).map(e => [e.tag.toUpperCase(), e.id]))
      setMatches(byTag)

      const workbook = await readWorkbook(f)
      const parsed = workbook.map(w => {
        const sheet = parseSheet(w.grid, w.name, vocab)
        const seen = new Set<string>()
        let enrich = 0, dupes = 0
        for (const r of sheet.rows) {
          const key = (r.tag ?? '').toUpperCase()
          if (!key) continue
          if (seen.has(key)) dupes++; else seen.add(key)
          if (byTag.has(key)) enrich++
        }
        return { ...sheet, enrich, dupes }
      })
      setSheets(parsed)
    } catch (e) {
      // SAY WHAT FAILED. "Could not read the file" sends someone to re-export a
      // file that was never the problem.
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function stage() {
    if (!file || !sheets) return
    setBusy(true); setError(null)
    try {
      const hash = await fileHash(file)

      // IDEMPOTENCY IS CHECKED HERE, NOT AFTER THE ROWS LAND. Re-uploading the
      // same bytes to the same project is almost always someone unsure whether
      // the first one worked — the answer is to show them, not to double it.
      const { data: prior } = await supabase.from('intake_uploads')
        .select('id, filename, uploaded_at, status')
        .eq('project_id', projectId).eq('content_sha256', hash)
        .order('uploaded_at', { ascending: false }).limit(1)
      if (prior?.length) {
        const p = prior[0]
        setError(`This exact file was already uploaded as "${p.filename}" on ` +
          `${new Date(p.uploaded_at).toLocaleDateString()} (status: ${p.status}). ` +
          `Open that upload rather than staging a second copy of the same rows.`)
        setBusy(false); return
      }

      const { data: { user } } = await supabase.auth.getUser()
      // Storage keys reject # and parentheses, and report it as an RLS violation,
      // which sends you looking in entirely the wrong place. Sanitise up front.
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_')
      const path = `${projectId}/${Date.now()}_${safe}`

      const up = await supabase.storage.from('intake-files').upload(path, file)
      if (up.error) throw new Error(`storage: ${up.error.message}`)

      const total = sheets.reduce((n, s) => n + s.rows.length, 0)
      const { data: upload, error: uErr } = await supabase.from('intake_uploads').insert({
        project_id: projectId, filename: file.name, storage_path: path,
        kind: 'excel', media_type: await sniffBlobMediaType(file),
        content_sha256: hash, row_count: total,
        status: total > 0 ? 'parsed' : 'failed',
        parse_note: sheets.map(s => `[${s.sheet}] ${s.note}`).join(' · '),
        uploaded_by: user?.id ?? null,
      }).select('id').single()
      if (uErr) throw new Error(`upload row: ${uErr.message}`)

      const rows = sheets.flatMap(s => {
        const seen = new Map<string, number>()
        return s.rows.map((r, i) => {
          const key = (r.tag ?? '').toUpperCase()
          const firstIdx = key ? seen.get(key) : undefined
          if (key && firstIdx === undefined) seen.set(key, i)
          return {
            upload_id: upload.id, project_id: projectId,
            source_sheet: s.sheet, source_row: r.source_row,
            tag: r.tag, descriptor: r.descriptor,
            proposed_category: s.proposed_category,
            proposed_type: r.proposed_type,
            observed_type_name: r.observed_type_name,
            location: r.location, area_served: r.area_served,
            nameplate: Object.keys(r.nameplate).length ? r.nameplate : null,
            confidence: r.confidence,
            match_equipment_id: key ? matches.get(key) ?? null : null,
            _dupe: key && firstIdx !== undefined,
          }
        })
      })

      // `duplicate_of` needs the inserted ids, so the flag is resolved in a
      // second pass. Marked, never dropped: a repeated tag inside one workbook is
      // usually two real units the schedule tagged alike, and deciding that is a
      // human's job.
      const payload = rows.map(({ _dupe, ...r }) => r)
      const { data: inserted, error: rErr } = await supabase.from('intake_rows')
        .insert(payload).select('id, tag, source_sheet, source_row')
      if (rErr) throw new Error(`rows: ${rErr.message}`)

      const firstByTag = new Map<string, string>()
      const dupeUpdates: { id: string; duplicate_of: string }[] = []
      for (const row of inserted ?? []) {
        const key = (row.tag ?? '').toUpperCase()
        if (!key) continue
        const first = firstByTag.get(key)
        if (first) dupeUpdates.push({ id: row.id, duplicate_of: first })
        else firstByTag.set(key, row.id)
      }
      for (const d of dupeUpdates) {
        await supabase.from('intake_rows').update({ duplicate_of: d.duplicate_of }).eq('id', d.id)
      }

      onStaged(upload.id)
      setFile(null); setSheets(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const total   = sheets?.reduce((n, s) => n + s.rows.length, 0) ?? 0
  const enrich  = sheets?.reduce((n, s) => n + s.enrich, 0) ?? 0
  const dupes   = sheets?.reduce((n, s) => n + s.dupes, 0) ?? 0
  const unknown = sheets?.reduce((n, s) => n + s.rows.filter(r => !r.proposed_type).length, 0) ?? 0

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <label className="text-xs border border-gray-200 rounded px-3 py-1.5 cursor-pointer hover:border-teal-400 hover:text-teal-700">
          Choose a schedule
          <input type="file" accept=".xlsx,.png,.jpg,.jpeg,.webp,.pdf" className="hidden" disabled={busy}
            onChange={e => {
              const f = e.target.files?.[0]
              // A MULTI-PAGE PDF GOES TO THE FINDER. A single page, or an
              // image, is already the page someone meant — asking about it
              // would be ceremony. The pre-extracted-pages path is therefore
              // untouched by everything item 3 added.
              if (!f) return
              if (/\.pdf$/i.test(f.name)) { void openFinder(f); return }
              void (isPage(f) ? extractPage(f) : choose(f))
            }} />
        </label>
        {file && <span className="text-[11px] text-gray-500 font-mono truncate">{file.name}</span>}
        {busy && <span className="text-[11px] text-gray-400">{pageProgress ?? 'working…'}</span>}
      </div>

      {note && (
        <p className="mt-2 text-[11px] text-teal-900 bg-teal-50 border border-teal-200 rounded px-2 py-1">
          {note}
        </p>
      )}

      {findingIn && (
        <div className="mt-2">
          <SchedulePageFinder
            file={findingIn}
            onConfirm={pages => void extractConfirmed(findingIn, pages)}
            onCancel={() => { setFindingIn(null); setFile(null) }} />
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-1.5">
        <span className="font-mono">.xlsx</span> is read directly — no AI, no cost, and the
        same file always reads the same way, so you check the column mapping once.
        {' '}<span className="font-mono">.png .jpg .webp</span> pages are read by the
        extractor, one call each, and every row is checked in the review.
      </p>

      {error && (
        <div className="mt-3 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {sheets && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] mb-2">
            <span className="font-semibold text-gray-700">{total} rows</span>
            {enrich > 0 && <span className="text-teal-800 bg-teal-50 rounded px-1.5 py-0.5">{enrich} match existing equipment</span>}
            {dupes > 0 && <span className="text-amber-800 bg-amber-50 rounded px-1.5 py-0.5">{dupes} repeated tag{dupes === 1 ? '' : 's'}</span>}
            {unknown > 0 && <span className="text-gray-700 bg-gray-100 rounded px-1.5 py-0.5">{unknown} unknown type{unknown === 1 ? '' : 's'}</span>}
            <button onClick={stage} disabled={busy || total === 0}
              className="ml-auto text-[11px] bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800 disabled:opacity-40">
              Stage {total} rows for review
            </button>
          </div>

          {/* THE MAPPING IS THE THING TO CHECK, AND IT IS CHECKED ONCE PER SHEET
              RATHER THAN ONCE PER ROW. If the columns are right, 200 rows are
              right; if they are wrong, reading 200 rows will not save you. */}
          {sheets.map(s => (
            <div key={s.sheet} className="border-b border-gray-100 py-2">
              <div className="text-xs text-gray-800">
                <span className="font-mono text-gray-600">{s.sheet}</span>
                {s.title && <span className="text-gray-400"> · {s.title}</span>}
                <span className="ml-2 text-[10px] text-gray-500">
                  {s.rows.length} row{s.rows.length === 1 ? '' : 's'}
                  {s.skipped > 0 && <span className="text-gray-400"> · {s.skipped} skipped</span>}
                </span>
              </div>

              {s.header_row === null ? (
                <p className="text-[11px] text-gray-500 mt-0.5">{s.note}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px]">
                    {Object.entries(s.mapping).map(([field, label]) => (
                      <span key={field} className="text-gray-600">
                        <span className="text-gray-400">{field}</span> ← {label}
                      </span>
                    ))}
                  </div>
                  {s.unmapped.length > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      kept as nameplate: {s.unmapped.join(', ')}
                    </p>
                  )}
                  {s.rows[0] && (
                    <p className="text-[10px] text-gray-400 mt-0.5 font-mono truncate">
                      first row: {s.rows[0].tag ?? '—'} · {s.rows[0].descriptor ?? '—'}
                      {' · '}{s.rows[0].proposed_type ?? `? ${s.rows[0].observed_type_name ?? ''}`}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
