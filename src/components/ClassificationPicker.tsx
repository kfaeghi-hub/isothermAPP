// Dynamic classification picker used by the New Project and Edit Project modals.
// Renders whatever dimensions/options currently exist — no dimension names are
// hardcoded anywhere here; required flags and modes are runtime data.

import type { ClassificationDimension, ClassificationOption } from '../types/database'
import type { ClassificationSelections } from '../lib/classifications'

interface Props {
  dimensions: ClassificationDimension[]
  options: ClassificationOption[]
  value: ClassificationSelections
  onChange: (dimensionId: string, optionIds: string[]) => void
  errors?: Record<string, string>
}

/** Options of one dimension, in [group, options[]] display order (ungrouped first). */
function grouped(options: ClassificationOption[]): [string | null, ClassificationOption[]][] {
  const map = new Map<string | null, ClassificationOption[]>()
  for (const o of options) {
    const k = o.group_label ?? null
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(o)
  }
  return [...map.entries()]
}

export function ClassificationPicker({ dimensions, options, value, onChange, errors = {} }: Props) {
  return (
    <div className="space-y-5">
      {dimensions.filter(d => d.active).map(dim => {
        const selected = value[dim.id] ?? []
        // Active options, plus any inactive option the project already has selected —
        // deactivation soft-hides from NEW picks but never erases existing selections.
        const dimOptions = options.filter(o =>
          o.dimension_id === dim.id && (o.active || selected.includes(o.id)))
        const error = errors[dim.id]

        return (
          <div key={dim.id}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {dim.name}
              {dim.required
                ? <span className="text-red-400 ml-0.5">*</span>
                : <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>}
            </label>

            {dim.selection_mode === 'single' ? (
              <SingleSelect
                dimOptions={dimOptions}
                selectedId={selected[0] ?? ''}
                hasError={!!error}
                onChange={id => onChange(dim.id, id ? [id] : [])}
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dimOptions.map(o => {
                  const on = selected.includes(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      title={o.description ?? undefined}
                      onClick={() => onChange(
                        dim.id,
                        on ? selected.filter(id => id !== o.id) : [...selected, o.id],
                      )}
                      className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                        on
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700'
                      }`}
                    >
                      {o.label}{!o.active && ' (inactive)'}
                    </button>
                  )
                })}
              </div>
            )}

            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
        )
      })}
    </div>
  )
}

function SingleSelect({ dimOptions, selectedId, hasError, onChange }: {
  dimOptions: ClassificationOption[]
  selectedId: string
  hasError: boolean
  onChange: (id: string) => void
}) {
  const groups = grouped(dimOptions)
  const selected = dimOptions.find(o => o.id === selectedId)

  return (
    <>
      <select
        value={selectedId}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
          hasError ? 'border-red-300' : 'border-gray-200'
        }`}
      >
        <option value="">— Select —</option>
        {groups.map(([group, opts]) =>
          group === null
            ? opts.map(o => <option key={o.id} value={o.id}>{o.label}{!o.active ? ' (inactive)' : ''}</option>)
            : (
              <optgroup key={group} label={group}>
                {opts.map(o => <option key={o.id} value={o.id}>{o.label}{!o.active ? ' (inactive)' : ''}</option>)}
              </optgroup>
            ),
        )}
      </select>
      {selected?.description && (
        <p className="text-[11px] text-gray-400 mt-1 leading-snug">{selected.description}</p>
      )}
    </>
  )
}
