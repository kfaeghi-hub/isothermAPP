// PortalAccept — the invite redemption surface (/portal/accept?token=…).
//
// The external world's FIRST impression, so it is a cover surface in full: the
// contour, the lockup, the document's voice. It is also the only page in the
// app an invitee sees before they have an account.
//
// Reached BEFORE the router and before any auth gate (the same pre-router
// bypass pattern as /reset-password): the invitee has no account yet, so
// nothing that assumes a session may run first.
//
// The token never leaves this page except in the POST body; the server compares
// its SHA-256 hash and answers identically for invalid / expired / revoked /
// already-redeemed, so this page cannot be used to probe which tokens exist.
import './portal.css'
import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { LogoMark } from '../../components/Logo'
import { PortalContour } from './ui/PortalContour'

export function PortalAccept() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Those passwords do not match.'); return }
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/portal-redeem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not complete setup.'); setLoading(false); return }
      const { error: sErr } = await supabase.auth.signInWithPassword({ email: body.email, password })
      if (sErr) { window.location.href = '/login'; return }
      window.location.href = '/portal'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not complete setup.')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen pt-cover flex items-center justify-center p-5 overflow-hidden">
      <PortalContour />
      <div className="relative w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <LogoMark variant="reverse" className="h-8 w-auto" />
          <span className="font-display text-sm font-bold tracking-tight text-paper">
            Isotherm <span className="font-mono text-vermilion-400">Cx</span>
          </span>
        </div>

        {!token ? (
          <div className="pt-panel px-6 py-8 text-center">
            <p className="font-display text-base font-bold text-ink-display">This link is incomplete</p>
            <p className="mt-1.5 text-sm text-gray-500">
              Ask your Isotherm contact to send the invitation again.
            </p>
          </div>
        ) : (
          <div className="pt-panel px-6 py-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gray-400">Project access</p>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-display mt-1.5">
              Set up your account
            </h1>
            <p className="text-sm text-gray-500 mt-2 mb-6">
              Choose a password to open your project record.
            </p>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Your name">
                <input value={name} onChange={e => setName(e.target.value)} required autoComplete="name"
                  className="w-full min-h-[44px] rounded-sm border border-rule bg-transparent px-3 text-sm text-ink
                             transition-colors duration-150 focus:border-brand-600" />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required minLength={8} autoComplete="new-password"
                  className="w-full min-h-[44px] rounded-sm border border-rule bg-transparent px-3 text-sm text-ink
                             transition-colors duration-150 focus:border-brand-600" />
              </Field>
              <Field label="Confirm password">
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required minLength={8} autoComplete="new-password"
                  className="w-full min-h-[44px] rounded-sm border border-rule bg-transparent px-3 text-sm text-ink
                             transition-colors duration-150 focus:border-brand-600" />
              </Field>

              {error && (
                <p role="alert" className="text-sm text-vermilion-700 bg-vermilion-50 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading}
                className="w-full min-h-[44px] rounded-sm bg-brand-600 text-paper text-sm font-semibold
                           transition-colors duration-150 hover:bg-brand-700 disabled:opacity-60">
                {loading ? 'Setting up…' : 'Open my project record'}
              </button>
            </form>
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-slate-400">
          Isotherm Engineering — commissioning record
        </p>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400 mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block mt-1 text-[11px] text-gray-400">{hint}</span>}
    </label>
  )
}
