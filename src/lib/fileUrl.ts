// Signed-URL access to private-bucket files (storage privacy pass, 2026-07-24).
// The DB stores bucket-relative PATHS; every open/render mints a short-lived
// signed URL through api/get-file-url (row-anchored — we never send raw paths).
// Legacy full-URL values (pre-migration rows) pass through unchanged.
import { authedFetch, apiErrorMessage } from './api'

export type FileRef =
  | { table: 'site_reports' | 'meetings'; id: string; kind: 'docx' | 'pdf' }
  | { table: 'equipment_attachments'; id: string; kind?: 'file' }

/** Resolve a stored value (path or legacy URL) to an openable URL. */
export async function resolveFileUrl(stored: string | null, ref: FileRef): Promise<string> {
  if (stored && stored.startsWith('http')) return stored   // legacy pre-migration row
  const res = await authedFetch('/api/get-file-url', ref)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.url) throw new Error(body.error ?? apiErrorMessage(res.status, body))
  return body.url
}

/** Open a stored file in a new tab, popup-blocker-safely (window opened inside
 *  the user gesture, navigated after the async signing round-trip). */
export async function openStoredFile(stored: string | null, ref: FileRef): Promise<void> {
  const w = window.open('about:blank', '_blank')
  try {
    const url = await resolveFileUrl(stored, ref)
    if (w) w.location.href = url
    else window.location.href = url   // popup denied — same-tab fallback
  } catch (e: any) {
    w?.close()
    alert(`Couldn't open the file.\n\n${e?.message ?? e}`)
  }
}

/** Batch-sign every photo of a finding (one round trip; 60-minute expiry). */
export async function getFindingPhotoUrls(findingId: string): Promise<Record<string, string>> {
  const res = await authedFetch('/api/get-file-url', { table: 'finding_photos', finding_id: findingId })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? apiErrorMessage(res.status, body))
  return body.urls ?? {}
}
