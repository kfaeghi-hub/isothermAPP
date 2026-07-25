import { useEffect, useMemo, useRef, useState } from 'react'

// A styled combobox: a free-text input with our own filtered suggestion list.
// Replaces the native <datalist>, which browsers render as an unstyleable popup
// that looks nothing like the app. Free text is ALWAYS allowed (a typed value
// that isn't in `options` is kept) — suggestions are a convenience, not a
// constraint. Matches the app's picker dropdowns (EquipmentPicker / FindingPicker):
// same rounded-lg shadow-lg panel, hover:bg-teal-50 rows, teal highlight.
//
// Persistence is the caller's choice:
//   onChange  — fires on every keystroke and on pick (controlled value).
//   onCommit  — fires on pick and on blur, for callers that persist on blur
//               (e.g. the deliverable assignee patch); omit to persist on save.
//   onEnter   — fires on Enter when no suggestion is highlighted, for callers
//               whose Enter has its own meaning (e.g. "add phase").

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  onCommit?: (v: string) => void
  onEnter?: () => void
  placeholder?: string
  className?: string          // applied to the <input>
  wrapperClassName?: string   // extra classes on the root (e.g. 'flex-1' in a flex row)
  title?: string
  ariaLabel?: string
  disabled?: boolean
}

export function Combobox({
  value, onChange, options, onCommit, onEnter,
  placeholder, className, wrapperClassName, title, ariaLabel, disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    const seen = new Set<string>()
    const list: string[] = []
    for (const o of options) {
      if (!o || seen.has(o)) continue
      if (q && !o.toLowerCase().includes(q)) continue
      seen.add(o); list.push(o)
      if (list.length >= 50) break
    }
    return list
  }, [options, value])

  const pick = (v: string) => { onChange(v); onCommit?.(v); setOpen(false); setHighlight(-1) }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHighlight(h => Math.max(h - 1, -1))
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && matches[highlight]) { e.preventDefault(); pick(matches[highlight]) }
      else if (onEnter) { e.preventDefault(); setOpen(false); onEnter() }
    } else if (e.key === 'Escape') {
      setOpen(false); setHighlight(-1)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${wrapperClassName ?? ''}`}>
      <input
        type="text"
        value={value}
        title={title}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => onCommit?.(value)}
        onKeyDown={onKeyDown}
        className={className ?? 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500'}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 z-30 mt-1 w-full min-w-[10rem] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          role="listbox">
          <div className="max-h-52 overflow-auto py-1">
            {matches.map((o, i) => (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={o === value}
                // preventDefault so clicking a suggestion doesn't blur the input
                // first (which would fire onCommit with the pre-pick value).
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(o)}
                className={`w-full text-left px-3 py-1.5 text-xs truncate ${
                  i === highlight ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-teal-50'
                } ${o === value ? 'font-medium' : ''}`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
