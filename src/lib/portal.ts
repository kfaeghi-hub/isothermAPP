// Portal data layer — the ONLY read path for external users.
// Every call is a SECURITY DEFINER RPC that gates itself on portal membership and
// returns a fixed column whitelist (decision 9.5(a): RLS cannot filter columns).
// No portal surface ever queries a base table.
import { supabase } from './supabase'
import { authedFetch, apiErrorMessage } from './api'

export interface PortalProject {
  project_id: string; name: string; com_number: string | null
  client_name: string | null; status: string
}
export interface PortalFinding {
  finding_id: string; number: string | null; title: string | null; description: string | null
  category: string | null; building_area: string | null; corrective_action: string | null
  status: string; date_raised: string | null; date_closed: string | null
  responsible_company: string | null
}
export interface PortalPhoto {
  photo_id: string; finding_id: string; caption: string | null; uploaded_at: string
}
export interface PortalDocument {
  kind: 'site_report' | 'meeting'; row_id: string; label: string
  doc_date: string | null; has_docx: boolean; has_pdf: boolean
}
export interface PortalStats {
  checklists_total: number; checklists_complete: number
  findings_open: number; findings_closed: number; phases: string[] | null
}
export interface PortalTeamRow {
  company_name: string | null; role_name: string | null
  role_abbr: string | null; contact_name: string | null
}
/** Clause 05 (§8 amendment, 2026-08-17): Cx Index AGGREGATES only — the same
 *  claims-weighted numbers the internal page computes, and nothing row-shaped.
 *  kind: 'project' | 'group' | 'category'. For categories, sort carries the
 *  unit count (display data, not an id). */
export interface PortalCxIndexRow {
  kind: 'project' | 'group' | 'category'
  name: string; num: number; den: number; pct: number | null; sort: number
}

const rows = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T[]> => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { console.error(`[portal] ${fn}:`, error); return [] }
  return (data ?? []) as T[]
}

/** The LIST: projects this account is an external member of. Staff get none —
 *  a staff account holds no portal_members row, which is correct. */
export const getPortalProjects = () => rows<PortalProject>('portal_projects')

/** The HEADER of one project the caller is already permitted to view. Separate
 *  from the list on purpose: this one admits the staff preview (it gates on
 *  portal_can_view), so the hero has a name to render in both worlds. */
export const getPortalProject = async (pid: string): Promise<PortalProject | null> =>
  (await rows<PortalProject>('portal_project', { pid }))[0] ?? null
export const getPortalFindings = (pid: string) => rows<PortalFinding>('portal_findings', { pid })
export const getPortalPhotos   = (pid: string) => rows<PortalPhoto>('portal_finding_photos', { pid })
export const getPortalDocuments = (pid: string) => rows<PortalDocument>('portal_documents', { pid })
export const getPortalTeam     = (pid: string) => rows<PortalTeamRow>('portal_team', { pid })
export const getPortalCxIndex  = (pid: string) => rows<PortalCxIndexRow>('portal_cx_index', { pid })
export const getPortalStats = async (pid: string): Promise<PortalStats | null> =>
  (await rows<PortalStats>('portal_stats', { pid }))[0] ?? null

/** Open an ISSUED document. The issued test lives server-side; a draft returns 403. */
export async function openPortalDocument(doc: PortalDocument, kind: 'docx' | 'pdf') {
  const w = window.open('about:blank', '_blank')
  try {
    const table = doc.kind === 'site_report' ? 'site_reports' : 'meetings'
    const res = await authedFetch('/api/get-file-url', { table, id: doc.row_id, kind })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.url) throw new Error(body.error ?? apiErrorMessage(res.status, body))
    if (w) w.location.href = body.url; else window.location.href = body.url
  } catch (e: any) {
    w?.close()
    alert(`Couldn't open the document.\n\n${e?.message ?? e}`)
  }
}

/** Batch-sign a finding's photos (60-minute expiry, same endpoint as the app). */
export async function getPortalPhotoUrls(findingId: string): Promise<Record<string, string>> {
  const res = await authedFetch('/api/get-file-url', { table: 'finding_photos', finding_id: findingId })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return {}
  return body.urls ?? {}
}
