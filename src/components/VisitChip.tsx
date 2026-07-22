import { daysSince, visitBand, type VisitBand } from '../lib/dashboardThresholds'

// THE last-visit chip — dashboard cards, radar legend, and the project Overview
// header all render this one component so the bands can never diverge.

// Conformance-mark palette (DESIGN.md): tinted field + same-hue text.
export const BAND_CLS: Record<VisitBand, string> = {
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-red-50 text-red-700',
  never: 'bg-gray-100 text-gray-500',
}

export const BAND_HEX: Record<VisitBand, string> = {
  green: '#1E7A4E', amber: '#8A5400', red: '#C2371F', never: '#7B7A85',
}

export function VisitChip({ lastVisit }: { lastVisit: string | null }) {
  const days = daysSince(lastVisit)
  const band = visitBand(days)
  return (
    <span className={`font-mono text-[10px] font-semibold rounded-sm px-1.5 py-0.5 whitespace-nowrap tracking-tight ${BAND_CLS[band]}`}
      data-testid="visit-chip">
      {band === 'never' ? 'Never visited' : `Visit ${days}d ago`}
    </span>
  )
}
