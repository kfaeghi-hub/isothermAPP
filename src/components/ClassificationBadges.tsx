// Classification badges for the project list and project header.
// Colors are assigned per DIMENSION (not per option) to keep the palette sane;
// unknown/admin-added dimensions fall back to slate.

import type { ClassificationDimension, ClassificationOption } from '../types/database'
import type { ClassificationSelections } from '../lib/classifications'

const DIMENSION_BADGE: Record<string, string> = {
  'Project Lifecycle':    'bg-blue-50 text-blue-700',
  'Sustainable Programs': 'bg-green-50 text-green-700',
}
const FALLBACK_BADGE = 'bg-slate-100 text-slate-600'

/** Which dimensions render as badges (facility/phases/services live in filters + edit). */
const BADGE_DIMENSIONS = ['Project Lifecycle', 'Sustainable Programs']

export function missingRequiredDimensions(
  dimensions: ClassificationDimension[],
  selections: ClassificationSelections,
): ClassificationDimension[] {
  return dimensions.filter(d => d.active && d.required && (selections[d.id]?.length ?? 0) === 0)
}

export function ClassificationBadges({ dimensions, options, selections, compact = false }: {
  dimensions: ClassificationDimension[]
  options: ClassificationOption[]
  selections: ClassificationSelections
  compact?: boolean
}) {
  const badges: { label: string; cls: string }[] = []
  for (const dimName of BADGE_DIMENSIONS) {
    const dim = dimensions.find(d => d.name === dimName)
    if (!dim) continue
    const selected = new Set(selections[dim.id] ?? [])
    for (const o of options.filter(o => o.dimension_id === dim.id && selected.has(o.id))) {
      badges.push({
        label: o.active ? o.label : `${o.label} (inactive)`,
        cls: DIMENSION_BADGE[dimName] ?? FALLBACK_BADGE,
      })
    }
  }

  const missing = missingRequiredDimensions(dimensions, selections)

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {badges.map(b => (
        <span key={b.label} className={`text-[11px] font-medium rounded px-2 py-0.5 whitespace-nowrap ${b.cls}`}>
          {b.label}
        </span>
      ))}
      {missing.length > 0 && (
        <span
          className="text-[11px] font-medium rounded px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap"
          title={`Missing: ${missing.map(d => d.name).join(', ')}`}
        >
          {compact ? 'Incomplete' : 'Classification incomplete'}
        </span>
      )}
    </span>
  )
}
