// Never let a Supabase write fail silently. In an RLS app a rejected write can
// look identical to success: an INSERT returns { error } (a 403), but an
// RLS-filtered UPDATE/DELETE returns 0 rows with error === null. A silent
// no-op that looks like success is the worst failure mode — an unauthorized
// action and a successful one are otherwise indistinguishable. These helpers
// make surfacing the failure a one-liner at every mutation call site.
//
// Convention: each returns TRUE when the mutation FAILED (so the caller stops
// or reverts): `if (reportError(error, 'save the finding')) return`.
//
// Uses alert() — the app's existing convention for surfacing mutation failures
// (see the many handled sites that already alert). Swap for a toast later in
// one place if desired.

// Constraint names become sentences here, at the ONE place every mutation
// failure surfaces (E1, 2026-08-22). plainError existed and was wired into a
// single page, so an FK violation on the equipment editor reached the user as
// "violates foreign key constraint equipment_equipment_type_fkey". Wiring it
// at the reporter covers every call site at once, including the ones not
// written yet — a translation that depends on each caller remembering it is a
// translation that will be missing somewhere.
import { plainError } from './plainError'

type PgError = { message: string } | null

/** Surface a mutation error. Returns true if there was one (caller should stop/revert). */
export function reportError(error: PgError, action: string): boolean {
  if (!error) return false
  console.error(`[mutation] ${action} failed:`, error)
  alert(`Couldn't ${action}.\n\n${plainError(error.message)}`)
  return true
}

/**
 * For UPDATE/DELETE issued with `.select()` so `data` reflects affected rows.
 * Returns true (failed) on an error OR the RLS-silent 0-row case — the one that
 * makes "unauthorized" and "success" look identical. Surfaces both.
 */
export function reportWriteBlocked(
  res: { data: unknown[] | null; error: PgError },
  action: string,
): boolean {
  if (res.error) {
    console.error(`[mutation] ${action} failed:`, res.error)
    alert(`Couldn't ${action}.\n\n${plainError(res.error.message)}`)
    return true
  }
  if (!res.data || res.data.length === 0) {
    alert(`Couldn't ${action} — nothing was changed. You may not have permission, or it no longer exists.`)
    return true
  }
  return false
}
