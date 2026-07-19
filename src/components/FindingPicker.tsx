import { useEffect, useMemo, useRef, useState } from 'react'

// Searchable select over this project's findings — display-only linkage
// ("#12 — title"). Never writes to findings.

export interface PickerFinding {
  id: string
  number: string | null
  title: string | null
  status: string
}

interface Props {
  findings: PickerFinding[]
  value: string
  onChange: (id: string) => void
}

const label = (f: PickerFinding) => `#${f.number ?? '—'}${f.title ? ` — ${f.title}` : ''}`

export function FindingPicker({ findings, value, onChange }: Props) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const rootRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return findings.filter(f => !q || label(f).toLowerCase().includes(q))
  }, [findings, query])

  const selected = findings.find(f => f.id === value) ?? null
  const pick = (id: string) => { onChange(id); setOpen(false); setQuery('') }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="finding-picker"
        onClick={() => setOpen(o => !o)}
        title={selected ? label(selected) : 'Link a finding'}
        className={`text-[11px] rounded px-1.5 py-0.5 border max-w-[9rem] truncate block ${
          selected
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-gray-200 text-gray-300 hover:text-gray-500 hover:border-gray-300'
        }`}
      >
        {selected ? `#${selected.number ?? '—'}` : '🔗'}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search # or title…"
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="max-h-52 overflow-auto py-1">
            <button type="button" onClick={() => pick('')}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 ${value === '' ? 'text-teal-700 font-medium' : 'text-gray-500'}`}>
              None
            </button>
            {matches.map(f => (
              <button key={f.id} type="button" onClick={() => pick(f.id)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 truncate ${value === f.id ? 'text-teal-700 font-medium' : 'text-gray-700'}`}>
                {label(f)}{f.status === 'closed' ? ' (closed)' : ''}
              </button>
            ))}
            {matches.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
