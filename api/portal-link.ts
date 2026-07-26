// api/portal-link — the ONLY read path for a share-link visitor.
//
//   POST { token }  →  { project, stats, findings, photos, documents, team }
//   POST { token }  →  403 for invalid / expired / revoked / unknown, one shape
//
// A link visitor has NO Supabase session, no JWT, and no Supabase client in the
// browser at all (src/lib/portalLink.ts talks only to this endpoint and to
// api/get-file-url). That is a structural guarantee that link mode cannot write,
// not a policy one — there is no authenticated channel to write through.
//
// The endpoint does NOT decide what the token grants. It hands the raw token to
// portal_link_bundle(), which calls portal_link_project() — the single evaluator
// of expiry and revocation — and returns the record for whatever project the
// TOKEN resolves to. So a bug in this file cannot widen scope: it has no project
// id to get wrong.
//
// The bundle reads through portal_internal.*, the SAME implementations the
// account-mode RPCs call, so the column whitelists are identical by construction
// rather than by discipline. Nothing here re-declares a column.
import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_shared/auth-common.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // A share link must never be indexed. It will eventually be pasted somewhere
  // crawlable; the route also carries a meta noindex, this is the header half.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')

  const { token } = req.body ?? {}
  if (typeof token !== 'string' || token.length === 0) {
    return res.status(400).json({ error: 'token required' })
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const { data, error } = await service.rpc('portal_link_bundle', { tok: token })
    if (error) {
      console.error('portal-link bundle error:', error)
      return res.status(500).json({ error: 'Could not open this link' })
    }
    // null covers invalid, expired, revoked and unknown alike — deliberately
    // indistinguishable, so this endpoint is not an existence oracle for tokens.
    if (!data) return res.status(403).json({ error: 'This link is not valid' })
    return res.status(200).json(data)
  } catch (err: any) {
    console.error('portal-link error:', err)
    return res.status(500).json({ error: 'Could not open this link' })
  }
}
