// Authenticated fetch for the api/ serverless endpoints (generate-*).
// Resolves the token AT CALL TIME via getSession() — supabase-js refreshes an
// expiring session on this call, so we never cache a stale JWT. Maps the auth
// failures to human messages; no silent failures on Generate buttons.

import { supabase } from './supabase'

export async function authedFetch(path: string, body: unknown): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

/** Human message for a failed generate-* response; falls back to the server error. */
export function apiErrorMessage(status: number, serverError?: string): string {
  if (status === 401) return 'Session expired — please refresh and try again.'
  if (status === 403) return "You don't have access to this project."
  return serverError ?? `Generation failed (${status})`
}
