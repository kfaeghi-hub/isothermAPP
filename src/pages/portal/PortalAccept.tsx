// PortalAccept — the invite redemption surface (/portal/accept?token=…).
//
// Reached BEFORE the router and before any auth gate (the same pre-router bypass
// pattern as /reset-password): the invitee has no account yet, so nothing that
// assumes a session may run first.
//
// The token never leaves this page except in the POST body; the server compares
// its SHA-256 hash and answers identically for invalid / expired / revoked /
// already-redeemed, so this page cannot be used to probe which tokens exist.
import { useState, FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

export function PortalAccept() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [name, setName]         = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm)  { setError('Passwords do not match.'); return }
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/portal-redeem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not complete setup.'); setLoading(false); return }
      // Sign in with the credentials just set, then land in the portal.
      const { error: sErr } = await supabase.auth.signInWithPassword({ email: body.email, password })
      if (sErr) { window.location.href = '/login'; return }
      window.location.href = '/portal'
    } catch (err: any) {
      setError(err?.message ?? 'Could not complete setup.'); setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--color-cover)] text-slate-100 flex items-center justify-center p-4">
        <p className="text-sm text-slate-400">This invite link is incomplete.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-cover)] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400 text-center">
          Isotherm Engineering
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-center mt-1">
          Set up your access
        </h1>
        <p className="text-sm text-slate-400 text-center mt-2 mb-6">
          Choose a password to open your project record.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-transparent border border-slate-700 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-slate-500" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              className="w-full bg-transparent border border-slate-700 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-slate-500" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8}
              className="w-full bg-transparent border border-slate-700 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-slate-500" />
          </div>
          {error && <p className="text-sm text-vermilion-400">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-white text-slate-900 rounded-sm py-2.5 text-sm font-semibold disabled:opacity-60 min-h-[44px]">
            {loading ? 'Setting up…' : 'Open my project record'}
          </button>
        </form>
      </div>
    </div>
  )
}
