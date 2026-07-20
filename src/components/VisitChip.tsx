import { daysSince, visitBand, type VisitBand } from '../lib/dashboardThresholds'

// THE last-visit chip — dashboard cards, radar legend, and the project Overview
// header all render this one component so the bands can never diverge.

export const BAND_CLS: Record<VisitBand, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-red-50 text-red-700',
  never: 'bg-gray-100 text-gray-500',
}

export const BAND_HEX: Record<VisitBand, string> = {
  green: '#1E8449', amber: '#B7791F', red: '#C0392B', never: '#9AA3AE',
}

export function VisitChip({ lastVisit }: { lastVisit: string | null }) {
  const days = daysSince(lastVisit)
  const band = visitBand(days)
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap ${BAND_CLS[band]}`}
      data-testid="visit-chip">
      {band === 'never' ? 'Never visited' : `Visit ${days}d ago`}
    </span>
  )
}
