// The standard's COVER — the only pre-auth surface. Deep cover green, the
// isotherm contour mark as a fine watermark, a document title block, and the
// sign-in form as the first inside page. (DESIGN.md: The Living Standard.)

import { useState, FormEvent } from 'react'
import { signIn, sendPasswordReset } from '../lib/auth'

type Mode = 'login' | 'forgot'

export function LoginPage() {
  const [mode, setMode]           = useState<Mode>('login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [resetSent, setResetSent] = useState(false)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError('Invalid email or password.')
    setLoading(false)
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await sendPasswordReset(email)
    if (error) setError(error.message)
    else setResetSent(true)
    setLoading(false)
  }

  function goToForgot() { setMode('forgot'); setError('') }
  function goToLogin()  { setMode('login');  setError(''); setResetSent(false) }

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm rounded-sm border border-gray-300 bg-white text-gray-900 ' +
    'outline-none transition-colors focus:border-standard-600'

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* The firm's namesake, as a watermark on the cover */}
      <div className="contour-mark absolute -right-24 -bottom-24 w-[520px] h-[520px] opacity-[0.07] pointer-events-none" />
      <div className="contour-mark absolute -left-40 -top-40 w-[420px] h-[420px] opacity-[0.05] pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Title block */}
        <div className="mb-6 border-l-[3px] border-teal-400 pl-4">
          <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-400">
            Isotherm Engineering Ltd.
          </p>
          <h1 className="font-display text-[26px] font-bold text-white leading-tight mt-1">
            <span className="font-mono font-medium text-teal-400">Cx</span> System
          </h1>
          <p className="font-mono text-[11px] text-slate-400 mt-1.5">
            Commissioning record · authorized personnel
          </p>
        </div>

        {/* The first inside page */}
        <div className="bg-white rounded-md shadow-xl overflow-hidden">
          <div className="h-[2px] bg-standard-600" />
          <div className="px-8 py-8">
            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5 text-gray-500">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="you@isothermengineering.com"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5 text-gray-500">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={inputCls}
                  />
                </div>

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-sm bg-standard-600 hover:bg-standard-700
                    transition-colors mt-1 disabled:opacity-60"
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <div className="text-center pt-0.5">
                  <button type="button" onClick={goToForgot}
                          className="text-xs text-gray-500 hover:text-standard-700 transition-colors">
                    Forgot password?
                  </button>
                </div>
              </form>

            ) : resetSent ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-11 h-11 rounded-full bg-standard-50 flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 text-standard-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Check your email</p>
                  <p className="text-xs mt-1 text-gray-500">
                    A reset link was sent to <span className="font-medium">{email}</span>.
                  </p>
                </div>
                <button onClick={goToLogin} className="text-xs text-standard-600 hover:text-standard-700">
                  ← Back to sign in
                </button>
              </div>

            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-sm mb-1 text-gray-600">
                  Enter your email and we'll send a reset link.
                </p>
                <div>
                  <label className="block text-[11px] font-semibold tracking-[0.08em] uppercase mb-1.5 text-gray-500">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    className={inputCls}
                  />
                </div>
                {error && <ErrorBanner>{error}</ErrorBanner>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-sm bg-standard-600 hover:bg-standard-700
                    transition-colors disabled:opacity-60"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <div className="text-center">
                  <button type="button" onClick={goToLogin}
                          className="text-xs text-gray-500 hover:text-standard-700 transition-colors">
                    ← Back to sign in
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center font-mono text-[10px] mt-4 text-slate-400 tracking-wide">
          Internal system · Authorized users only
        </p>
      </div>
    </div>
  )
}

function ErrorBanner({ children }: { children: string }) {
  return (
    <div className="text-sm px-3.5 py-2.5 rounded-sm border border-red-200 bg-red-50 text-red-700">
      {children}
    </div>
  )
}
