import { useEffect, useMemo, useRef, useState } from 'react'

// Searchable grouped select over THIS project's equipment register.
// Grouping mirrors the Equipment tab exactly: "Systems" first (kind='system'),
// then equipment grouped by its category text in alphabetical order; entries
// render "TAG — descriptor". Stores an equipment id ('' = none).

export interface PickerEquipment {
  id: string
  tag: string | null
  descriptor: string | null
  kind: string
  category: string | null
  sort_order: number | null
}

interface Props {
  equipment: PickerEquipment[]
  value: string
  onChange: (id: string) => void
}

const entryLabel = (e: PickerEquipment) =>
  [e.tag, e.descriptor].filter(Boolean).join(' — ') || e.id

export function EquipmentPicker({ equipment, value, onChange }: Props) {
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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (e: PickerEquipment) =>
      !q || entryLabel(e).toLowerCase().includes(q)

    const systems = equipment.filter(e => e.kind === 'system' && match(e))
    const rest    = equipment.filter(e => e.kind !== 'system' && match(e))
    const byCat = new Map<string, PickerEquipment[]>()
    for (const e of rest) {
      const cat = e.category ?? ''
      if (!byCat.has(cat)) byCat.set(cat, [])
      byCat.get(cat)!.push(e)
    }
    const catGroups = [...byCat.keys()].sort().map(cat => ({
      label: cat, items: byCat.get(cat)!,
    }))
    return { systems, catGroups }
  }, [equipment, query])

  const selected = equipment.find(e => e.id === value) ?? null

  const pick = (id: string) => { onChange(id); setOpen(false); setQuery('') }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid="equipment-picker"
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left border border-gray-200 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 truncate ${
          selected ? 'text-gray-800' : 'text-gray-400'
        }`}
      >
        {selected ? entryLabel(selected) : 'None'}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tag or descriptor…"
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            <button
              type="button"
              onClick={() => pick('')}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 ${value === '' ? 'text-teal-700 font-medium' : 'text-gray-500'}`}
            >
              None
            </button>

            {groups.systems.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Systems</div>
                {groups.systems.map(e => (
                  <button key={e.id} type="button" onClick={() => pick(e.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 truncate ${value === e.id ? 'text-teal-700 font-medium' : 'text-gray-700'}`}>
                    {entryLabel(e)}
                  </button>
                ))}
              </>
            )}

            {groups.catGroups.map(g => (
              <div key={g.label || '__none__'}>
                {g.label && (
                  <div className="px-3 pt-2 pb-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">{g.label}</div>
                )}
                {g.items.map(e => (
                  <button key={e.id} type="button" onClick={() => pick(e.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-teal-50 truncate ${value === e.id ? 'text-teal-700 font-medium' : 'text-gray-700'}`}>
                    {entryLabel(e)}
                  </button>
                ))}
              </div>
            ))}

            {groups.systems.length === 0 && groups.catGroups.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
