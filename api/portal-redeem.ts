// api/portal-redeem — redeem a portal invite into a real scoped account.
// EXTERNAL PROJECT PORTAL, Part A (approved 2026-07-25).
//
// Deliberately UNAUTHENTICATED: the token IS the credential. It is compared by
// SHA-256 hash, and invalid / expired / revoked / already-redeemed all fail
// IDENTICALLY — the response never distinguishes them, so the endpoint is not an
// oracle for which tokens exist.
//
// Creates the account with email_confirm: true. That is not cosmetic: it stops
// Supabase Auth from sending its own confirmation email, which is a mail channel
// PORTAL_INVITES_LIVE does not govern (recorded on the go-live checklist).
//
// The account is created as role `client` with a portal_members row and NOTHING
// else — never a project_members row, which is what keeps every internal policy
// unable to match it.
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { applyCors } from './_shared/auth-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const INVALID = 'This invite link is not valid. Ask your Isotherm contact for a new one.'

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const { token, password, name } = req.body ?? {}
    if (!token || !password) return res.status(400).json({ error: 'token and password required' })
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })

    const token_hash = createHash('sha256').update(String(token)).digest('hex')
    const { data: invite } = await supabase.from('portal_invites')
      .select('id, project_id, email, expires_at, redeemed_at, revoked_at')
      .eq('token_hash', token_hash).maybeSingle()

    // One shape of failure for every reason — no oracle.
    if (!invite || invite.revoked_at || invite.redeemed_at || new Date(invite.expires_at) < new Date())
      return res.status(400).json({ error: INVALID })

    // Existing account with this email? (user_profiles carries the email.)
    const { data: existing } = await supabase.from('user_profiles')
      .select('id, role').eq('email', invite.email).maybeSingle()

    let profileId: string
    if (existing) {
      profileId = existing.id
      // An INTERNAL account must never be demoted by redeeming an invite.
      if (existing.role !== 'client')
        return res.status(400).json({ error: 'That address already belongs to an Isotherm account. Sign in instead.' })
    } else {
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email: invite.email,
        password: String(password),
        email_confirm: true,        // suppresses Supabase's own confirmation mail
      })
      if (cErr || !created?.user) return res.status(500).json({ error: cErr?.message ?? 'Could not create the account.' })
      profileId = created.user.id
      const { error: pErr } = await supabase.from('user_profiles').insert({
        id: profileId, email: invite.email, name: (name ?? invite.email).toString().trim(), role: 'client',
      })
      if (pErr) return res.status(500).json({ error: pErr.message })
    }

    const { error: mErr } = await supabase.from('portal_members').upsert({
      project_id: invite.project_id, profile_id: profileId,
      invited_by: null, accepted_at: new Date().toISOString(),
    }, { onConflict: 'project_id,profile_id' })
    if (mErr) return res.status(500).json({ error: mErr.message })

    // Single-use: stamp AFTER the membership lands, so a mid-flight failure
    // leaves the invite redeemable rather than burning it.
    await supabase.from('portal_invites').update({ redeemed_at: new Date().toISOString() }).eq('id', invite.id)

    return res.status(200).json({ ok: true, email: invite.email, project_id: invite.project_id })
  } catch (err: any) {
    console.error('portal-redeem error:', err)
    return res.status(500).json({ error: err.message })
  }
}
