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
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'

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

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, supabase)
    const { table, id, kind, finding_id } = req.body ?? {}

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
      await requireProjectAccess(supabase, user.id, finding.project_id)

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

    const { data: row } = await supabase.from(table)
      .select(`project_id, ${column}`).eq('id', id).single()
    if (!row) return res.status(404).json({ error: 'not found' })
    await requireProjectAccess(supabase, user.id, (row as any).project_id)

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
