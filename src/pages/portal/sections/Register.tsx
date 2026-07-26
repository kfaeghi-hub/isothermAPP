// 02 Issues register — the surface that makes an emailed spreadsheet look
// ancient. Paper panel laid on the cover; the document's own table grammar
// (2px ink head rule, hairline row rules, mono data columns, small-cap
// letter-spaced heads, conformance-mark chips).
//
// RESPONSIVE (RC3, the pattern already proven in this codebase): below `lg`
// the table becomes stacked cards. NEVER a horizontally-scrolling table on a
// phone — a GC PM in a site trailer is the primary reader.
//
// Structure borrowed from 21st.dev's filtered data table and then fully
// re-tokened: what survived the port is the ARIA and keyboard contract
// (aria-sort on sortable heads, Enter/Space activation, a colSpan empty row)
// and the labelled filter row above the table. Everything visual — TanStack,
// shadcn primitives, bg-muted, rounded-lg, the indigo/emerald/amber/rose
// intent palette — was dropped. Zero stray scales survive.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ImageIcon } from 'lucide-react'
import type { PortalFinding, PortalPhoto } from '../../../lib/portal'
import { getPortalPhotoUrls } from '../../../lib/portal'
import { Chip } from '../ui/Chip'
import { EmptyState } from '../ui/EmptyState'
import { Lightbox } from '../ui/Lightbox'

type SortKey = 'number' | 'date_raised' | 'status'
type Status = 'all' | 'open' | 'closed'

const isClosed = (f: PortalFinding) => f.status === 'closed'
const numOf = (f: PortalFinding) => {
  const n = parseInt(String(f.number ?? '').replace(/\D/g, ''), 10)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

export function Register({ findings, photos, getPhotoUrls = getPortalPhotoUrls }: {
  findings: PortalFinding[]
  photos: PortalPhoto[]
  /** How to mint signed photo URLs. Defaults to account mode; link mode injects
   *  its token-carrying equivalent. ONE component serves both worlds — forking it
   *  is how two registers drift into showing different columns. */
  getPhotoUrls?: (findingId: string) => Promise<Record<string, string>>
}) {
  const [status, setStatus] = useState<Status>('all')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'number', desc: false })
  const [viewer, setViewer] = useState<{ urls: string[]; i: number; caption: string | null } | null>(null)

  const byFinding = useMemo(() => {
    const m = new Map<string, PortalPhoto[]>()
    for (const p of photos) m.set(p.finding_id, [...(m.get(p.finding_id) ?? []), p])
    return m
  }, [photos])

  const categories = useMemo(
    () => Array.from(new Set(findings.map(f => f.category).filter(Boolean) as string[])).sort(),
    [findings],
  )

  const rows = useMemo(() => {
    const out = findings.filter(f =>
      (status === 'all' || (status === 'closed') === isClosed(f)) &&
      (category === 'all' || f.category === category))
    const dir = sort.desc ? -1 : 1
    return out.sort((a, b) => {
      if (sort.key === 'number') return dir * (numOf(a) - numOf(b))
      if (sort.key === 'status') return dir * (Number(isClosed(a)) - Number(isClosed(b)))
      return dir * String(a.date_raised ?? '').localeCompare(String(b.date_raised ?? ''))
    })
  }, [findings, status, category, sort])

  async function openPhotos(f: PortalFinding) {
    const list = byFinding.get(f.finding_id) ?? []
    if (!list.length) return
    const urls = await getPhotoUrls(f.finding_id)
    const ordered = list.map(p => urls[p.photo_id]).filter(Boolean)
    if (ordered.length) setViewer({ urls: ordered, i: 0, caption: list[0].caption })
  }

  const toggle = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'number' }))

  return (
    <section aria-labelledby="pt-issues">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 id="pt-issues" className="font-display text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">
          <span className="font-mono text-vermilion-400 mr-2">02</span>Issues register
        </h2>
        {findings.length > 0 && (
          <p className="font-mono text-[11px] text-slate-400">
            {rows.length === findings.length
              ? `${findings.length} recorded`
              : `${rows.length} of ${findings.length}`}
          </p>
        )}
      </div>

      <div className="pt-panel overflow-hidden">
        {findings.length === 0 ? (
          <EmptyState
            headline="No issues recorded yet"
            line="Deficiencies raised during commissioning appear here as they are logged, with their status and resolution date."
          />
        ) : (
          <>
            {/* ── Filters ─────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 sm:px-5 pt-4 pb-4 border-b border-rule">
              <fieldset>
                <legend className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-1.5">Status</legend>
                <div className="flex">
                  {(['all', 'open', 'closed'] as Status[]).map((s, i) => (
                    <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
                      className={`min-h-[36px] px-3 text-[11px] font-bold uppercase tracking-[0.06em] border border-rule transition-colors duration-150
                        ${i === 0 ? 'rounded-l-sm' : '-ml-px'} ${i === 2 ? 'rounded-r-sm' : ''}
                        ${status === s
                          ? 'bg-brand-600 border-brand-600 text-paper relative z-10'
                          : 'bg-transparent text-gray-500 hover:text-ink hover:bg-brand-50'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>

              {categories.length > 1 && (
                <div>
                  <label htmlFor="pt-cat" className="block font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-1.5">
                    System
                  </label>
                  <select id="pt-cat" value={category} onChange={e => setCategory(e.target.value)}
                    className="min-h-[36px] rounded-sm border border-rule bg-transparent px-2.5 text-[13px] text-ink">
                    <option value="all">All systems</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>

            {rows.length === 0 ? (
              <EmptyState
                headline="Nothing matches this filter"
                line="Clear the status or system filter to see the full register."
              />
            ) : (
              <>
                {/* ── ≥lg: the ruled register ───────────────────────────── */}
                <div className="hidden lg:block px-5 pt-4 pb-1">
                  <table className="pt-register">
                    <caption className="sr-only">Issues register for this project</caption>
                    <thead>
                      <tr>
                        <SortHead label="№" k="number" sort={sort} onSort={toggle} className="w-16" />
                        <th scope="col">Issue</th>
                        <th scope="col" className="w-44">System · Area</th>
                        <th scope="col" className="w-40">Responsible</th>
                        <SortHead label="Raised" k="date_raised" sort={sort} onSort={toggle} className="w-28" />
                        <SortHead label="Status" k="status" sort={sort} onSort={toggle} className="w-28" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(f => {
                        const shots = byFinding.get(f.finding_id) ?? []
                        return (
                          <tr key={f.finding_id}>
                            <td className="font-mono text-[13px] text-gray-500">{f.number ?? '—'}</td>
                            <td>
                              <p className="font-medium text-ink-display">{f.title ?? '(untitled)'}</p>
                              {f.description && <p className="mt-1 text-[13px] text-gray-500 max-w-prose">{f.description}</p>}
                              {f.corrective_action && (
                                <p className="mt-1.5 text-[13px] text-gray-500 max-w-prose">
                                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-500 mr-1.5">Action</span>
                                  {f.corrective_action}
                                </p>
                              )}
                              {shots.length > 0 && <PhotoButton n={shots.length} onClick={() => openPhotos(f)} />}
                            </td>
                            <td className="text-[13px] text-gray-500">
                              {f.category ?? '—'}
                              {f.building_area && <span className="block text-gray-500">{f.building_area}</span>}
                            </td>
                            <td className="text-[13px] text-gray-500">{f.responsible_company ?? '—'}</td>
                            <td className="font-mono text-[12px] text-gray-500">{f.date_raised ?? '—'}</td>
                            <td>
                              <Chip tone={isClosed(f) ? 'closed' : 'open'}>{isClosed(f) ? 'Closed' : 'Open'}</Chip>
                              {isClosed(f) && f.date_closed && (
                                <span className="block mt-1 font-mono text-[11px] text-gray-500">{f.date_closed}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── <lg: stacked cards (RC3) ──────────────────────────── */}
                <ul className="lg:hidden divide-y divide-rule">
                  {rows.map(f => {
                    const shots = byFinding.get(f.finding_id) ?? []
                    return (
                      <li key={f.finding_id} className="pt-row-card px-4 sm:px-5 py-4">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono text-[12px] text-gray-500">{f.number ?? '—'}</span>
                          <Chip tone={isClosed(f) ? 'closed' : 'open'}>{isClosed(f) ? 'Closed' : 'Open'}</Chip>
                        </div>
                        <p className="mt-1.5 font-medium text-ink-display">{f.title ?? '(untitled)'}</p>
                        {f.description && <p className="mt-1 text-[13px] text-gray-500">{f.description}</p>}
                        {f.corrective_action && (
                          <p className="mt-1.5 text-[13px] text-gray-500">
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-500 mr-1.5">Action</span>
                            {f.corrective_action}
                          </p>
                        )}
                        {/* Only fields that HAVE a value. On desktop an empty
                            cell costs nothing; on a phone each "— " burns a
                            whole line, and most findings carry no area or
                            responsible company. Caught by looking at 375px. */}
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                          {([
                            ['System', f.category],
                            ['Area', f.building_area],
                            ['Responsible', f.responsible_company],
                            [isClosed(f) ? 'Resolved' : 'Raised', isClosed(f) ? f.date_closed : f.date_raised],
                          ] as const)
                            .filter(([, v]) => Boolean(v))
                            .map(([label, v]) => <Field key={label} label={label}>{v}</Field>)}
                        </dl>
                        {shots.length > 0 && <PhotoButton n={shots.length} onClick={() => openPhotos(f)} />}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {viewer && (
        <Lightbox
          urls={viewer.urls} index={viewer.i} caption={viewer.caption}
          onClose={() => setViewer(null)}
          onStep={d => setViewer(v => v && ({ ...v, i: (v.i + d + v.urls.length) % v.urls.length }))}
        />
      )}
    </section>
  )
}

function SortHead({ label, k, sort, onSort, className }: {
  label: string; k: SortKey; sort: { key: SortKey; desc: boolean }
  onSort: (k: SortKey) => void; className?: string
}) {
  const active = sort.key === k
  return (
    <th scope="col" className={className}
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="pt-sort" onClick={() => onSort(k)}>
        {label}
        {active
          ? (sort.desc ? <ArrowDown size={12} strokeWidth={2.5} /> : <ArrowUp size={12} strokeWidth={2.5} />)
          : <span className="w-3" aria-hidden="true" />}
      </button>
    </th>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">{label}</dt>
      <dd className="text-gray-600 mt-0.5">{children}</dd>
    </div>
  )
}

function PhotoButton({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 min-h-[44px] lg:min-h-0 lg:py-1 text-[12px] font-medium text-brand-600 hover:text-brand-700">
      <ImageIcon size={14} strokeWidth={1.75} />
      {n === 1 ? 'View photo' : `View ${n} photos`}
    </button>
  )
}
