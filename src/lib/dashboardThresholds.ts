// Dashboard thresholds — the ONLY place these numbers live. Queue queries and
// chip colors both import from here so the wording and the math cannot diverge.

/** Last-visit chip turns amber at this many days since the latest site report. */
export const VISIT_AMBER_DAYS = 14
/** Last-visit chip turns red at this many days. */
export const VISIT_RED_DAYS = 30
/** An open finding enters the Attention Queue at this age (days since raised). */
export const FINDING_AGED_DAYS = 30
/** A draft meeting / ungenerated report enters the queue after this many days. */
export const DRAFT_STALE_DAYS = 7
/** An in-progress checklist untouched for this many days enters the queue. */
export const CHECKLIST_STALE_DAYS = 14
/** A deliverable is overdue this many days after its due date (0 = the day after). */
export const DELIVERABLE_OVERDUE_GRACE_DAYS = 0

/** Days since a date-only or timestamp string; null input → null. */
export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null
  const then = new Date(date.length === 10 ? `${date}T12:00:00` : date).getTime()
  return Math.floor((Date.now() - then) / 86_400_000)
}

/** ISO date string n days ago (date-only, local). */
export function isoDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type VisitBand = 'green' | 'amber' | 'red' | 'never'

export function visitBand(days: number | null): VisitBand {
  if (days === null) return 'never'
  if (days > VISIT_RED_DAYS) return 'red'
  if (days >= VISIT_AMBER_DAYS) return 'amber'
  return 'green'
}
