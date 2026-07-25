// api/portal-invite — create a portal invite for an external user.
// EXTERNAL PROJECT PORTAL, Part A (approved 2026-07-25, decision 9.3(a)).
//
// Custom tokens, NOT the Supabase admin invite API. Three reasons, all load-bearing:
//   1. Revocation before redemption is a row we own (revoked_at). The admin invite
//      API has no first-class revoke.
//   2. The service key never leaves the server.
//   3. It works with delivery switched OFF. The admin API sends mail as a SIDE
//      EFFECT of creating the invite — it could deliver while our flag is false.
//
// EMAIL SAFETY IS STRUCTURAL. `PORTAL_INVITES_LIVE` is read in exactly ONE place:
// deliverInvite() below. Token creation, storage, revocation and redemption never
// consult it, so the whole flow is testable with delivery impossible. The response
// carries mail_attempted so the suite can assert zero mail, every time.
//
// The raw token is returned ONCE, here, to the inviting staff member (for the
// permanent "Copy invite link" action). Only its SHA-256 hash is stored — a
// database reader cannot mint a working link.
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'
import { applyCors, requireUser, AuthError } from './_shared/auth-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** The ONLY place the delivery flag is read. Nothing else in the flow consults it. */
async function deliverInvite(email: string, url: string): Promise<{ attempted: boolean }> {
  if (process.env.PORTAL_INVITES_LIVE !== 'true') {
    // Suppressed: the invite exists and is redeemable via the copied link.
    console.log(`[portal-invite] delivery suppressed (PORTAL_INVITES_LIVE not true) → ${email}`)
    return { attempted: false }
  }
  // GO-LIVE: wire the transport here, then flip the flag. Deliberately not
  // implemented in this build — see the go-live checklist. Until a transport
  // exists, a flipped flag still sends nothing rather than failing the invite.
  console.warn(`[portal-invite] PORTAL_INVITES_LIVE is true but no transport is wired → ${email} ${url}`)
  return { attempted: false }
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, supabase)
    const { project_id, email } = req.body ?? {}
    if (!project_id || !email) return res.status(400).json({ error: 'project_id and email required' })
    const addr = String(email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return res.status(400).json({ error: 'invalid email' })

    const { data: project } = await supabase.from('projects').select('id').eq('id', project_id).maybeSingle()
    if (!project) return res.status(404).json({ error: 'not found' })

    // 9.4(a): admin/dev, an owner who is a member, or a lead of THIS project.
    // Enforced in code because the service-role client bypasses the RLS policy.
    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.userId).maybeSingle()
    if (!profile) throw new AuthError(403, 'No access to this project')
    let permitted = profile.role === 'admin' || profile.role === 'developer'
    if (!permitted) {
      const { data: member } = await supabase.from('project_members')
        .select('is_lead').eq('project_id', project_id).eq('profile_id', user.userId).maybeSingle()
      permitted = !!member && (profile.role === 'owner' || member.is_lead === true)
    }
    if (!permitted) throw new AuthError(403, 'Only an owner or project lead can invite')

    const token = randomBytes(32).toString('base64url')
    const token_hash = createHash('sha256').update(token).digest('hex')

    const { data: invite, error } = await supabase.from('portal_invites').insert({
      project_id, email: addr, token_hash, invited_by: user.userId,
    }).select('id, expires_at').single()
    if (error) return res.status(500).json({ error: error.message })

    const origin = req.headers?.origin ?? 'https://cx.isothermengineering.com'
    const invite_url = `${origin}/portal/accept?token=${token}`
    const delivery = await deliverInvite(addr, invite_url)

    return res.status(200).json({
      invite_id: invite.id,
      invite_url,                       // shown for copy-paste; the ONLY time the raw token exists
      expires_at: invite.expires_at,
      mail_attempted: delivery.attempted,
      delivery_enabled: process.env.PORTAL_INVITES_LIVE === 'true',
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('portal-invite error:', err)
    return res.status(500).json({ error: err.message })
  }
}
