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

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(160deg, #eef2f7 0%, #dce6f0 100%)' }}>

      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-xl shadow-[0_8px_40px_rgba(31,58,95,0.13)] overflow-hidden">

          {/* Navy top bar */}
          <div className="h-[3px]" style={{ background: '#1F3A5F' }} />

          {/* Brand header */}
          <div className="pt-9 pb-7 px-8 text-center">
            {/* Isotherm wordmark */}
            <div className="flex items-center justify-center gap-2.5 mb-1">
              <IsoIcon />
              <div className="text-left">
                <p className="text-[11px] font-semibold tracking-[0.18em] uppercase"
                   style={{ color: '#6B7A8F' }}>
                  Isotherm Engineering
                </p>
                <p className="text-[22px] font-bold leading-none tracking-tight"
                   style={{ color: '#1F3A5F' }}>
                  <span className="font-mono" style={{ color: '#0EA5AE' }}>Cx</span>
                  {' '}System
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100" />
          </div>

          {/* Forms */}
          <div className="px-8 pb-8">
            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold tracking-wide uppercase mb-1.5"
                         style={{ color: '#6B7A8F' }}>
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
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border outline-none transition-all"
                    style={{
                      borderColor: '#D1DBE8',
                      color: '#1a2535',
                    }}
                    onFocus={e => e.target.style.borderColor = '#1F3A5F'}
                    onBlur={e  => e.target.style.borderColor = '#D1DBE8'}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold tracking-wide uppercase mb-1.5"
                         style={{ color: '#6B7A8F' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border outline-none transition-all"
                    style={{ borderColor: '#D1DBE8', color: '#1a2535' }}
                    onFocus={e => e.target.style.borderColor = '#1F3A5F'}
                    onBlur={e  => e.target.style.borderColor = '#D1DBE8'}
                  />
                </div>

                {error && <ErrorBanner>{error}</ErrorBanner>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-md transition-opacity mt-1"
                  style={{ background: '#1F3A5F', opacity: loading ? 0.65 : 1 }}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <div className="text-center pt-0.5">
                  <button type="button" onClick={goToForgot}
                          className="text-xs transition-colors"
                          style={{ color: '#8A99AE' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#1F3A5F')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#8A99AE')}>
                    Forgot password?
                  </button>
                </div>
              </form>

            ) : resetSent ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto"
                     style={{ background: '#E6F7F7' }}>
                  <svg className="w-5 h-5" fill="none" stroke="#0EA5AE" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#1F3A5F' }}>Check your email</p>
                  <p className="text-xs mt-1" style={{ color: '#6B7A8F' }}>
                    A reset link was sent to <span className="font-medium">{email}</span>.
                  </p>
                </div>
                <button onClick={goToLogin} className="text-xs" style={{ color: '#0EA5AE' }}>
                  ← Back to sign in
                </button>
              </div>

            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-sm mb-1" style={{ color: '#4A5568' }}>
                  Enter your email and we'll send a reset link.
                </p>
                <div>
                  <label className="block text-[11px] font-semibold tracking-wide uppercase mb-1.5"
                         style={{ color: '#6B7A8F' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border outline-none transition-all"
                    style={{ borderColor: '#D1DBE8', color: '#1a2535' }}
                    onFocus={e => e.target.style.borderColor = '#1F3A5F'}
                    onBlur={e  => e.target.style.borderColor = '#D1DBE8'}
                  />
                </div>
                {error && <ErrorBanner>{error}</ErrorBanner>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-md transition-opacity"
                  style={{ background: '#1F3A5F', opacity: loading ? 0.65 : 1 }}
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <div className="text-center">
                  <button type="button" onClick={goToLogin}
                          className="text-xs" style={{ color: '#8A99AE' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#1F3A5F')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#8A99AE')}>
                    ← Back to sign in
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] mt-4" style={{ color: '#9AAAB8' }}>
          Internal system &middot; Authorized users only
        </p>
      </div>
    </div>
  )
}

function IsoIcon() {
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
         style={{ background: '#1F3A5F' }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        {/* Stylized snowflake / temperature element representing Isotherm */}
        <line x1="9" y1="2" x2="9" y2="16" stroke="#0EA5AE" strokeWidth="2" strokeLinecap="round"/>
        <line x1="2" y1="9" x2="16" y2="9" stroke="#0EA5AE" strokeWidth="2" strokeLinecap="round"/>
        <line x1="4" y1="4" x2="14" y2="14" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/>
        <line x1="14" y1="4" x2="4" y2="14" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/>
        <circle cx="9" cy="9" r="2" fill="white"/>
      </svg>
    </div>
  )
}

function ErrorBanner({ children }: { children: string }) {
  return (
    <div className="text-sm px-3.5 py-2.5 rounded-md border"
         style={{ color: '#C0392B', background: '#FEF5F5', borderColor: '#F5C6C2' }}>
      {children}
    </div>
  )
}
