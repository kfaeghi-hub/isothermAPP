// api/get-file-url — mint short-lived signed URLs for private-bucket files.
// STORAGE PRIVACY PASS (approved 2026-07-24). Row-anchored by design: callers
// name a TABLE ROW, never a raw storage path — the path comes from the row the
// caller is authorized to see, so there is no path-probing surface.
//
//   POST { table: 'site_reports'|'meetings'|'equipment_attachments', id, kind? }
//     → { url }            kind: 'docx' (default) | 'pdf' for the doc tables
//   POST { table: 'finding_photos', id }            → { url }
//   POST { table: 'finding_photos', finding_id }    → { urls: { [photoId]: url } }
//     (batch — one call signs every photo of a finding for inline render)
//
// Auth chain identical to the generate-* endpoints: CORS → requireUser →
// row lookup (404) → requireProjectAccess (403) → sign. Expiries per ruling:
// documents 10 min (click-to-open), photos 60 min (inline render).
// Legacy full-URL values (pre-migration rows) pass through unchanged.
import { createClient } from '@supabase/supabase-js'
import {
  applyCors, requireUser, requireProjectAccess, requirePortalAccess, isStaffRole, AuthError,
} from './_shared/auth-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const DOC_EXPIRY   = 600    // seconds — documents, click-to-open
const PHOTO_EXPIRY = 3600   // seconds — photos, inline render

type DocTable = {
  bucket: string
  columns: Record<string, string>   // kind → column
  expiry: number
}
const DOC_TABLES: Record<string, DocTable> = {
  site_reports:          { bucket: 'site-reports',    columns: { docx: 'storage_url', pdf: 'pdf_url' }, expiry: DOC_EXPIRY },
  meetings:              { bucket: 'meeting-minutes', columns: { docx: 'storage_url', pdf: 'pdf_url' }, expiry: DOC_EXPIRY },
  equipment_attachments: { bucket: 'equipment-files', columns: { docx: 'storage_url', pdf: 'storage_url', file: 'storage_url' }, expiry: DOC_EXPIRY },
}

/**
 * Authorize one file request. Staff take the internal path unchanged. EXTERNAL
 * (portal) callers must hold a portal_members row AND the row must be an ISSUED
 * artifact — the issued test lives here and in the RPCs, never in the UI:
 *   site_reports  issued ⇔ storage_url IS NOT NULL  (the existing convention,
 *                 already the definition used by the sr_delete policy)
 *   meetings      issued ⇔ status = 'issued'
 *   equipment_attachments  NOT a portal surface at all — refused outright
 *   finding_photos  allowed: photos are part of the distributed record
 * `row` is the service-role row; it is never returned to the caller.
 */
/**
 * The EXTERNAL refusals — what an outside viewer may never sign, regardless of
 * how they authenticated. Shared verbatim by the account path and the link path
 * so the issued-only test gains no third copy: it exists in the RPC
 * (portal_internal.document_rows) and here, and nowhere else.
 */
function refuseUnlessIssued(table: string, row: any): void {
  if (table === 'equipment_attachments')
    throw new AuthError(403, 'Not available in the portal')
  if (table === 'site_reports' && !row?.storage_url)
    throw new AuthError(403, 'This document has not been issued')
  if (table === 'meetings' && row?.status !== 'issued')
    throw new AuthError(403, 'This document has not been issued')
}

async function authorizeFile(
  service: any, userId: string, table: string, row: any, projectId: string,
): Promise<void> {
  const { data: profile } = await service
    .from('user_profiles').select('role').eq('id', userId).maybeSingle()
  if (!profile) throw new AuthError(403, 'No access to this project')

  if (isStaffRole(profile.role)) {
    await requireProjectAccess(service, userId, projectId)
    return
  }

  // External caller with an account.
  await requirePortalAccess(service, userId, projectId)
  refuseUnlessIssued(table, row)
}

/**
 * LINK MODE — the caller has no session at all; the token IS the credential.
 * The DB re-derives the project from the token (portal_link_project is the only
 * evaluator of expiry/revocation), so this endpoint never tells the database
 * which project to read. Then the SAME external refusals apply.
 */
async function authorizeFileByLink(
  service: any, token: string, table: string, row: any, projectId: string,
): Promise<void> {
  const { data: granted, error } = await service.rpc('portal_link_project', { tok: token })
  // A validation FAILURE must fail closed, not open: if the check could not be
  // performed, the caller is not authorized. AuthError only carries 401/403, and
  // 403 is the right answer here anyway — indistinguishable from a bad token,
  // which keeps the one-shape rule intact.
  if (error) {
    console.error('portal_link_project failed:', error)
    throw new AuthError(403, 'This link is not valid')
  }
  // One shape for invalid / expired / revoked / unknown — no existence oracle.
  if (!granted) throw new AuthError(403, 'This link is not valid')
  // The row must belong to the project the TOKEN grants — a valid link for
  // project A must never sign a file on project B.
  if (granted !== projectId) throw new AuthError(403, 'This link is not valid')
  refuseUnlessIssued(table, row)
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const { table, id, kind, finding_id, link_token } = req.body ?? {}

    // Link mode carries no Authorization header at all, so requireUser must not
    // run — it would 401 before the token was ever considered. `authorize` below
    // closes over whichever mode applies; every call site is unchanged.
    const linkMode = typeof link_token === 'string' && link_token.length > 0
    const user = linkMode ? null : await requireUser(req, supabase)
    const authorize = (t: string, row: any, projectId: string) =>
      linkMode
        ? authorizeFileByLink(supabase, link_token, t, row, projectId)
        : authorizeFile(supabase, user!.userId, t, row, projectId)

    // ── finding_photos: single or batch, project via the parent finding ──────
    if (table === 'finding_photos') {
      let photos: Array<{ id: string; storage_url: string; finding_id: string }> = []
      if (finding_id) {
        const { data } = await supabase.from('finding_photos')
          .select('id, storage_url, finding_id').eq('finding_id', finding_id)
        photos = data ?? []
        if (photos.length === 0) return res.status(200).json({ urls: {} })
      } else if (id) {
        const { data } = await supabase.from('finding_photos')
          .select('id, storage_url, finding_id').eq('id', id).single()
        if (!data) return res.status(404).json({ error: 'not found' })
        photos = [data]
      } else {
        return res.status(400).json({ error: 'id or finding_id required' })
      }

      const { data: finding } = await supabase.from('findings')
        .select('project_id').eq('id', photos[0].finding_id).single()
      if (!finding) return res.status(404).json({ error: 'not found' })
      await authorize('finding_photos', null, finding.project_id)

      const urls: Record<string, string> = {}
      for (const p of photos) {
        if (!p.storage_url) continue
        if (p.storage_url.startsWith('http')) { urls[p.id] = p.storage_url; continue }
        const { data: sig, error } = await supabase.storage
          .from('finding-photos').createSignedUrl(p.storage_url, PHOTO_EXPIRY)
        if (error) return res.status(500).json({ error: error.message })
        urls[p.id] = sig.signedUrl
      }
      return res.status(200).json(finding_id ? { urls } : { url: urls[photos[0].id] ?? null })
    }

    // ── document tables: project_id lives on the row ─────────────────────────
    const spec = DOC_TABLES[table as string]
    if (!spec) return res.status(400).json({ error: 'unsupported table' })
    if (!id)   return res.status(400).json({ error: 'id required' })
    const column = spec.columns[(kind as string) ?? 'docx']
    if (!column) return res.status(400).json({ error: 'unsupported kind' })

    // select('*') so the issued test can read status / storage_url regardless of
    // which `kind` was asked for. Service-role row; never returned to the caller.
    const { data: row } = await supabase.from(table).select('*').eq('id', id).single()
    if (!row) return res.status(404).json({ error: 'not found' })
    await authorize(table as string, row, (row as any).project_id)

    const stored = (row as any)[column] as string | null
    if (!stored) return res.status(404).json({ error: 'no file for this row' })
    if (stored.startsWith('http')) return res.status(200).json({ url: stored })  // legacy

    const { data: sig, error } = await supabase.storage
      .from(spec.bucket).createSignedUrl(stored, spec.expiry)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ url: sig.signedUrl })

  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('get-file-url error:', err)
    return res.status(500).json({ error: err.message })
  }
}
