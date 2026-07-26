// api/portal-share-link — create a view-only share link.
//
//   POST { project_id, label?, expires: '1d'|'1w'|'1m'|'1y'|'never' }
//     → { link_id, link_url, expires_at, label }
//
// The raw token is returned ONCE, here, to the staff member creating it. Only
// its SHA-256 hash is stored, so a database reader cannot mint a working link.
//
// THIS ENDPOINT SENDS NOTHING. A share link is inherently copy-paste, which is
// why link mode can go live with no mailer wired at all — the PORTAL_INVITES_LIVE
// posture is untouched and this file never reads it.
//
// EXPIRY IS DERIVED SERVER-SIDE from a preset. It deliberately does NOT accept a
// client-supplied timestamp: a crafted request would otherwise set year 9999 and
// silently bypass the "Never requires a distinct confirmation" rule, which is a
// UI control and therefore not a control at all on its own.
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, AuthError } from './_shared/auth-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const PRESETS: Record<string, string | null> = {
  '1d': '1 day', '1w': '7 days', '1m': '1 mon', '1y': '1 year', 'never': null,
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)
    const { project_id, label, expires } = req.body ?? {}
    if (!project_id) return res.status(400).json({ error: 'project_id required' })
    if (!(expires in PRESETS)) {
      return res.status(400).json({ error: 'expires must be one of 1d, 1w, 1m, 1y, never' })
    }

    // Owner+lead of THIS project (D6 / 9.4a). Enforced in code because the
    // service role bypasses RLS — the same reason portal-invite enforces it here.
    const { data: profile } = await service
      .from('user_profiles').select('role').eq('id', user.userId).maybeSingle()
    if (!profile) throw new AuthError(403, 'No access to this project')
    const governor = profile.role === 'admin' || profile.role === 'developer'
    if (!governor) {
      const { data: member } = await service.from('project_members')
        .select('is_lead').eq('project_id', project_id).eq('profile_id', user.userId).maybeSingle()
      const isOwner = profile.role === 'owner' && !!member
      if (!isOwner && !member?.is_lead) {
        throw new AuthError(403, 'Only an owner or lead of this project can create a share link')
      }
    }

    const { randomBytes, createHash } = await import('node:crypto')
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')

    const interval = PRESETS[expires]
    const { data: created, error } = await service.rpc('portal_share_link_create', {
      p_project_id: project_id,
      p_label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : null,
      p_token_hash: tokenHash,
      p_interval: interval,
      p_created_by: user.userId,
    })
    if (error) {
      console.error('portal-share-link create:', error)
      return res.status(500).json({ error: 'Could not create the link' })
    }

    const origin = process.env.PUBLIC_BASE_URL ?? `https://${req.headers.host}`
    return res.status(200).json({
      link_id: created.id,
      link_url: `${origin}/portal/link/${token}`,   // the ONLY time the raw token exists
      expires_at: created.expires_at,
      label: created.label,
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('portal-share-link error:', err)
    return res.status(500).json({ error: err.message })
  }
}
