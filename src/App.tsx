import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailRoute } from './routes/ProjectDetailRoute'
import { DirectoryPage } from './pages/DirectoryPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { ClassificationsPage } from './pages/ClassificationsPage'

// Sidebar navigation. `to` routes are real URLs — the dashboard is home, the
// Projects list lives at /projects, and project detail deep-links as
// /projects/:id?tab=…  Muted items are not yet built.
const NAV_ITEMS = [
  { label: 'Dashboard',       icon: '📊', to: '/',                phase: 1 },
  { label: 'Projects',        icon: '📋', to: '/projects',        phase: 1 },
  { label: 'Directory',       icon: '👥', to: '/directory',       phase: 1 },
  { label: 'Templates',       icon: '🗂️', to: '/templates',       phase: 2 },
  { label: 'Classifications', icon: '🏷️', to: '/classifications', phase: 2, adminOnly: true },
  { label: 'Action Summary',  icon: '📌', to: null,               phase: 3 },
]

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/projects/, 'Projects'],
  [/^\/directory/, 'Directory'],
  [/^\/templates/, 'Templates'],
  [/^\/classifications/, 'Classifications'],
]

export default function App() {
  const { session, profile, loading, signOut } = useAuth()

  // Password-reset link always resolves here regardless of auth state
  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage />
  }

  if (loading) return <LoadingScreen />
  if (!session) return <LoginPage />

  // Logged in but profile row missing — user created in Supabase without a profile row
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: 'linear-gradient(160deg, #eef2f7 0%, #dce6f0 100%)' }}>
        <div className="text-center bg-white rounded-xl shadow-lg px-10 py-8 max-w-sm">
          <p className="text-sm font-semibold mb-2" style={{ color: '#1F3A5F' }}>
            Account setup incomplete
          </p>
          <p className="text-xs mb-5" style={{ color: '#6B7A8F' }}>
            Your account exists but has no profile. Contact your administrator.
          </p>
          <button onClick={signOut}
                  className="text-xs px-4 py-2 rounded text-white"
                  style={{ background: '#1F3A5F' }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const isAdmin  = ['admin', 'developer'].includes(profile.role)
  const isClient = profile.role === 'client'

  return (
    <BrowserRouter>
      <Shell profileName={profile.name} profileRole={profile.role} isAdmin={isAdmin} signOut={signOut}>
        <Routes>
          {/* The dashboard is the firm's home; the client role never reaches it. */}
          <Route path="/" element={isClient ? <Navigate to="/projects" replace /> : <DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailRoute />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/classifications" element={isAdmin ? <ClassificationsPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}

function Shell({ profileName, profileRole, isAdmin, signOut, children }: {
  profileName: string
  profileRole: string
  isAdmin: boolean
  signOut: () => void
  children: React.ReactNode
}) {
  const location = useLocation()
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'Dashboard'

  const visible = NAV_ITEMS.filter(i => !i.adminOnly || isAdmin)
  const phase1 = visible.filter(i => i.phase === 1)
  const phase2 = visible.filter(i => i.phase === 2)
  const phase3 = visible.filter(i => i.phase === 3)

  return (
    <div className="flex h-screen bg-slate-50 text-gray-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500 mb-1">
            Isotherm Engineering
          </p>
          <h1 className="text-[15px] font-semibold text-white leading-tight tracking-tight">
            <span className="font-mono text-teal-400">Cx</span>{' '}System
          </h1>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          <NavSection label="Phase 1" items={phase1} />
          <NavSection label="Phase 2" items={phase2} />
          <NavSection label="Phase 3" items={phase3} muted />
        </nav>

        <div className="border-t border-slate-800 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profileName}</p>
            <p className="text-[10px] text-slate-400 capitalize">{profileRole}</p>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="flex-shrink-0 text-slate-500 hover:text-slate-200 transition-colors p-1 rounded"
          >
            <LogoutIcon />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 border-b border-gray-200 bg-white flex items-center px-5 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        </header>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center"
         style={{ background: 'linear-gradient(160deg, #eef2f7 0%, #dce6f0 100%)' }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
             style={{ borderColor: '#1F3A5F', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#6B7A8F' }}>Loading…</p>
      </div>
    </div>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

function NavSection({ label, items, muted = false }: {
  label: string
  items: typeof NAV_ITEMS
  muted?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 px-3 mb-1">{label}</p>
      {items.map(item => (
        <div key={item.label} className="relative">
          {muted || !item.to ? (
            <button
              className="w-full text-left flex items-center gap-2.5 pl-3 pr-2 py-1.5 text-sm text-slate-600 cursor-default"
            >
              <span className="opacity-40">{item.icon}</span>
              <span>{item.label}</span>
              <span className="ml-auto text-[10px] text-slate-600 font-medium">soon</span>
            </button>
          ) : (
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `w-full text-left flex items-center gap-2.5 pl-3 pr-2 py-1.5 text-sm transition-colors relative
                ${isActive ? 'text-white bg-white/[0.07]' : 'hover:bg-white/[0.05] text-slate-400'}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute left-0 inset-y-0 w-0.5 bg-teal-400 rounded-r" />}
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )}
        </div>
      ))}
    </div>
  )
}
