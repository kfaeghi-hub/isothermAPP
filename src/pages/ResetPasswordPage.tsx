import { useState, useEffect, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { updatePassword } from '../lib/auth'

export function ResetPasswordPage() {
  const [ready, setReady]         = useState(false)
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)

  useEffect(() => {
    // Supabase auto-processes the hash fragment (access_token) on page load.
    // PASSWORD_RECOVERY fires once the recovery session is established.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    // Also catch the case where we arrive with an already-live session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm)  { setError('Passwords do not match.'); return }
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError('')
    const { error } = await updatePassword(password)
    if (error) { setError(error.message); setLoading(false); return }
    setDone(true)
    await supabase.auth.signOut()
    setTimeout(() => { window.location.href = '/' }, 2000)
  }

  // Token-layer adoption (UI-debt punch list, 2026-07-24): the page previously
  // carried ~20 inline navy/old-teal hex values from before the brand repin.
  // Classes now mirror LoginPage's vocabulary (standard-* actions, gray-* ink,
  // red-* errors, teal-400 wordmark) — structure and copy unchanged.
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          <div className="h-[3px] bg-standard-600" />

          <div className="pt-9 pb-7 px-8 text-center">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-gray-500">
              Isotherm Engineering
            </p>
            <p className="text-[22px] font-bold tracking-tight mt-0.5 text-gray-900">
              <span className="font-mono text-teal-400">Cx</span>{' '}System
            </p>
            <p className="text-sm mt-3 text-gray-500">Set a new password</p>
            <div className="mt-5 border-t border-slate-100" />
          </div>

          <div className="px-8 pb-8">
            {done ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto bg-standard-50">
                  <svg className="w-5 h-5 text-standard-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900">Password updated</p>
                <p className="text-xs text-gray-500">Redirecting to sign in…</p>
              </div>

            ) : !ready ? (
              <div className="text-center py-4">
                <div className="w-6 h-6 border-2 border-standard-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Verifying reset link…</p>
              </div>

            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordField label="New password" value={password}
                               onChange={setPassword} autoFocus />
                <PasswordField label="Confirm password" value={confirm}
                               onChange={setConfirm} />
                {error && (
                  <div className="text-sm px-3.5 py-2.5 rounded-md border border-red-200 bg-red-50 text-red-700">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-md bg-standard-600 hover:bg-standard-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] mt-4 text-gray-400">
          Internal system &middot; Authorized users only
        </p>
      </div>
    </div>
  )
}

function PasswordField({
  label, value, onChange, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold tracking-wide uppercase mb-1.5 text-gray-500">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
        minLength={8}
        className="w-full px-3.5 py-2.5 text-sm rounded-md border border-gray-300 bg-white text-gray-900 outline-none transition-colors focus:border-standard-600"
      />
    </div>
  )
}
