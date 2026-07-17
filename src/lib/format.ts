// Shared formatting helpers. (formatDate previously lived in projectTypes.ts,
// which was deleted with the project_type removal pass.)

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA')
}

/** "Jan 2026" — month-level display for project date ranges. */
export function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  // Parse as a plain date (not UTC) so "2026-01-01" doesn't shift a month in EST.
  const [y, m] = iso.split('-').map(Number)
  if (!y || !m) return null
  return new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
}

/** "Jan 2026 → Dec 2027", "Jan 2026 → —", or null when neither date is set. */
export function formatDateRange(start: string | null | undefined, finish: string | null | undefined): string | null {
  const s = formatMonthYear(start)
  const f = formatMonthYear(finish)
  if (!s && !f) return null
  return `${s ?? '—'} → ${f ?? '—'}`
}
