// Link-mode data layer — the whole of it.
//
// DELIBERATELY DOES NOT IMPORT `supabase`. A share-link visitor has no session,
// so a Supabase client in this path could only ever act as `anon` — and the way
// to guarantee link mode has no write channel is for the write channel not to
// exist. Two fetches to our own API, nothing else.
//
// The shapes below are the SAME rows the account-mode RPCs return, because the
// bundle and the RPCs call the same portal_internal implementations. The types
// are re-exported from lib/portal rather than redeclared, for the same
// anti-drift reason: one declaration, two callers.
import type {
  PortalProject, PortalFinding, PortalPhoto, PortalDocument, PortalStats, PortalTeamRow,
  PortalCxIndexRow,
} from './portal'

export interface PortalLinkBundle {
  project: PortalProject | null
  stats: PortalStats | null
  findings: PortalFinding[]
  photos: PortalPhoto[]
  documents: PortalDocument[]
  team: PortalTeamRow[]
  cx_index: PortalCxIndexRow[]
}

/** Open a share link. Returns null for invalid / expired / revoked alike — the
 *  server answers one shape for all of them and this preserves that. */
export async function fetchLinkBundle(token: string): Promise<PortalLinkBundle | null> {
  const res = await fetch('/api/portal-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) return null
  const b = await res.json().catch(() => null)
  if (!b) return null
  return {
    project: b.project ?? null,
    stats: b.stats ?? null,
    findings: b.findings ?? [],
    photos: b.photos ?? [],
    documents: b.documents ?? [],
    team: b.team ?? [],
    cx_index: b.cx_index ?? [],
  }
}

/** Open an ISSUED document under link auth. The issued test is server-side —
 *  `refuseUnlessIssued` in get-file-url, shared verbatim with the account path. */
export async function openLinkDocument(
  token: string, doc: PortalDocument, kind: 'docx' | 'pdf',
) {
  const w = window.open('about:blank', '_blank')
  try {
    const table = doc.kind === 'site_report' ? 'site_reports' : 'meetings'
    const res = await fetch('/api/get-file-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_token: token, table, id: doc.row_id, kind }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.url) throw new Error(body.error ?? 'Could not open the document.')
    if (w) w.location.href = body.url; else window.location.href = body.url
  } catch (e: unknown) {
    w?.close()
    alert(`Couldn't open the document.\n\n${e instanceof Error ? e.message : e}`)
  }
}

/** Batch-sign a finding's photos under link auth (60-minute expiry, as always). */
export async function getLinkPhotoUrls(
  token: string, findingId: string,
): Promise<Record<string, string>> {
  const res = await fetch('/api/get-file-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link_token: token, table: 'finding_photos', finding_id: findingId }),
  })
  if (!res.ok) return {}
  return (await res.json().catch(() => ({}))).urls ?? {}
}
