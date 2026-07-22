// Shared auth/authz layer for the generate-* endpoints (GENERATE-AUTH-PROPOSAL.md,
// approved 2026-07-22). Files under api/_shared are not deployed as endpoints.
//
// Contract (order matters — 404 only after token verification, so ids can't be probed):
//   1. applyCors(req,res)              — allowlisted origins only; foreign origins get
//                                        NO Access-Control-Allow-Origin header at all.
//   2. requireUser(req, service)       — verifies the Bearer JWT → 401 on missing/
//                                        invalid/expired.
//   3. (handler resolves its id → project_id; unknown id → 404)
//   4. requireProjectAccess(...)       — server-side mirror of the RLS M-pattern →
//                                        403 for a valid token without access.
// Only after 4 does the service-role pipeline run (storage upload needs it; the
// buckets deliberately have zero client policies).
//
// The authorization predicate mirrors the CONTENT layer, not lead/destructive:
// generation is member-open work. Definitions of record are the DB helpers
// is_admin_or_dev() and is_project_member() (docs/ACCESS-CONTROL-PROPOSAL.md §1.2)
// — is_project_member has NO role condition, so owners and employees both ride
// membership, and the `client` role falls out naturally (never a member, not
// admin/dev). Keep this file in sync with those definitions.

import type { SupabaseClient } from '@supabase/supabase-js'

export class AuthError extends Error {
  status: 401 | 403
  constructor(status: 401 | 403, message: string) {
    super(message)
    this.status = status
  }
}

const ORIGIN_ALLOWLIST = [
  'https://isotherm-app.vercel.app',                    // production
  'https://isotherm-app-isotherm.vercel.app',           // standing alias
  'https://isotherm-app-git-master-isotherm.vercel.app',// branch alias
  'http://localhost:5173',                              // Vite dev
]
// Vercel preview deployments for this project/team, e.g.
// https://isotherm-app-edk5sjgro-isotherm.vercel.app
const PREVIEW_ORIGIN_RE = /^https:\/\/isotherm-app-[a-z0-9]+-isotherm\.vercel\.app$/

/**
 * CORS for the generate-* endpoints. Echoes the Origin only when allowlisted —
 * a foreign origin receives no ACAO header (the browser blocks the response).
 * Non-browser callers are unaffected (CORS is browser-enforced); the JWT is the
 * actual defense. Returns true when the request was a preflight and is finished.
 */
export function applyCors(req: any, res: any): boolean {
  const origin: string | undefined = req.headers?.origin
  if (origin && (ORIGIN_ALLOWLIST.includes(origin) || PREVIEW_ORIGIN_RE.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return true
  }
  return false
}

/**
 * Step 2 — identity. Verifies the caller's Supabase JWT (signature + expiry) via
 * the service client's auth.getUser(). Throws AuthError(401) on any failure.
 * Runs BEFORE any resource lookup so unauthenticated callers can't probe ids.
 */
export async function requireUser(req: any, service: SupabaseClient): Promise<{ userId: string }> {
  const m = /^Bearer\s+(.+)$/.exec(req.headers?.authorization ?? '')
  if (!m) throw new AuthError(401, 'Authentication required')
  const { data, error } = await service.auth.getUser(m[1])
  if (error || !data?.user) throw new AuthError(401, 'Invalid or expired session')
  return { userId: data.user.id }
}

/**
 * Step 4 — authorization. admin/developer pass everywhere (is_admin_or_dev());
 * everyone else must hold a project_members row for THIS project
 * (is_project_member — no role condition, so owners ride membership too).
 * Throws AuthError(403) otherwise.
 */
export async function requireProjectAccess(
  service: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<{ userId: string; role: string }> {
  const { data: profile } = await service
    .from('user_profiles').select('role').eq('id', userId).maybeSingle()
  if (!profile) throw new AuthError(403, 'No access to this project')
  if (profile.role === 'admin' || profile.role === 'developer')
    return { userId, role: profile.role }
  const { data: member } = await service
    .from('project_members').select('id')
    .eq('project_id', projectId).eq('profile_id', userId).maybeSingle()
  if (!member) throw new AuthError(403, 'No access to this project')
  return { userId, role: profile.role }
}
