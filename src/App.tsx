import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid, FolderKanban, BookUser, FileStack, Tags, ShieldCheck, ClipboardList,
  LogOut, Menu, X,
} from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailRoute } from './routes/ProjectDetailRoute'
import { DirectoryPage } from './pages/DirectoryPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { ClassificationsPage } from './pages/ClassificationsPage'
import { UsersPage } from './pages/UsersPage'

// The contents rail: the standard's table of contents. Clause numbers are the
// document's wayfinding (reference grammar, not decoration). `to` routes are
// real URLs; muted entries are not yet built.
const NAV_ITEMS = [
  { clause: '1', label: 'Dashboard',       icon: LayoutGrid,    to: '/',                group: 'Operations' },
  { clause: '2', label: 'Projects',        icon: FolderKanban,  to: '/projects',        group: 'Operations' },
  { clause: '3', label: 'Directory',       icon: BookUser,      to: '/directory',       group: 'Operations' },
  { clause: '4', label: 'Templates',       icon: FileStack,     to: '/templates',       group: 'Library' },
  // configOnly = firm-config surfaces (admin/dev/OWNER); superOnly = admin only (E6)
  { clause: '5', label: 'Classifications', icon: Tags,          to: '/classifications', group: 'Library', configOnly: true },
  { clause: '6', label: 'Users',           icon: ShieldCheck,   to: '/users',           group: 'Administration', superOnly: true },
  { clause: '7', label: 'Action Summary',  icon: ClipboardList, to: null,               group: 'Administration' },
]

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/projects/, 'Projects'],
  [/^\/directory/, 'Directory'],
  [/^\/templates/, 'Templates'],
  [/^\/classifications/, 'Classifications'],
  [/^\/users/, 'Users'],
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

  // Firm-config surfaces: admin/dev + owner. Super surfaces (user management): admin only (E6).
  const canConfig = ['admin', 'developer', 'owner'].includes(profile.role)
  const isSuper   = profile.role === 'admin'
  const isClient  = profile.role === 'client'

  return (
    <BrowserRouter>
      <Shell profileName={profile.name} profileRole={profile.role}
        canConfig={canConfig} isSuper={isSuper} signOut={signOut}>
        <Routes>
          {/* The dashboard is the firm's home; the client role never reaches it. */}
          <Route path="/" element={isClient ? <Navigate to="/projects" replace /> : <DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailRoute />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/classifications" element={canConfig ? <ClassificationsPage /> : <Navigate to="/" replace />} />
          <Route path="/users" element={isSuper ? <UsersPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}

function Shell({ profileName, profileRole, canConfig, isSuper, signOut, children }: {
  profileName: string
  profileRole: string
  canConfig: boolean
  isSuper: boolean
  signOut: () => void
  children: React.ReactNode
}) {
  const location = useLocation()
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'Dashboard'
  const [drawerOpen, setDrawerOpen] = useState(false)

  const visible = NAV_ITEMS.filter(i =>
    (!(i as any).configOnly || canConfig) && (!(i as any).superOnly || isSuper))
  const groups = ['Operations', 'Library', 'Administration']
    .map(g => ({ label: g, items: visible.filter(i => i.group === g) }))
    .filter(g => g.items.length > 0)

  const cover = (
    <>
      {/* The cover's masthead */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-800">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 mb-1.5">
          Isotherm Engineering
        </p>
        <h1 className="font-display text-[17px] font-bold text-white leading-tight">
          <span className="font-mono font-medium text-teal-400">Cx</span> System
        </h1>
      </div>

      {/* Contents */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-5">
        {groups.map(g => <NavSection key={g.label} label={g.label} items={g.items} onNavigate={() => setDrawerOpen(false)} />)}
      </nav>

      <div className="border-t border-slate-800 px-5 py-3.5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{profileName}</p>
          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">{profileRole}</p>
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          className="flex-shrink-0 text-slate-400 hover:text-white transition-colors p-1.5 rounded-sm"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen flex-col lg:flex-row bg-slate-50 text-gray-900">
      {/* Cover rail — the standard's cover (desktop) */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 bg-slate-900 text-slate-100 flex-col">
        {cover}
      </aside>

      {/* Document-header bar (mobile) */}
      <header className="lg:hidden flex items-center gap-3 bg-slate-900 text-white px-4 h-13 py-3 flex-shrink-0">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open navigation"
          className="p-1 -ml-1 text-slate-300 hover:text-white">
          <Menu className="w-5 h-5" strokeWidth={1.75} />
        </button>
        <h1 className="font-display text-sm font-bold leading-none">
          <span className="font-mono font-medium text-teal-400">Cx</span> System
        </h1>
        <span className="ml-auto text-[11px] uppercase tracking-[0.1em] text-slate-400">{title}</span>
      </header>

      {/* Contents drawer (mobile) */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 text-slate-100 flex flex-col shadow-xl
            animate-[drawer_150ms_ease-out]">
            <button onClick={() => setDrawerOpen(false)} aria-label="Close navigation"
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
            {cover}
          </aside>
        </div>
      )}

      {/* Inside pages */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        <header className="hidden lg:flex h-12 border-b border-gray-200 bg-white items-center px-6 flex-shrink-0">
          <h2 className="font-display text-[13px] font-bold text-gray-900 uppercase tracking-[0.06em]">{title}</h2>
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

function NavSection({ label, items, onNavigate }: {
  label: string
  items: typeof NAV_ITEMS
  onNavigate: () => void
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 px-5 mb-1.5">{label}</p>
      {items.map(item => {
        const Icon = item.icon
        return (
          <div key={item.label}>
            {!item.to ? (
              <div className="flex items-center gap-3 pl-5 pr-4 py-2 text-[13px] text-slate-500 cursor-default">
                <span className="font-mono text-[11px] w-4 text-right opacity-50">{item.clause}</span>
                <Icon className="w-4 h-4 opacity-40" strokeWidth={1.75} />
                <span>{item.label}</span>
                <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-slate-500">soon</span>
              </div>
            ) : (
              <NavLink
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 pl-5 pr-4 py-2 text-[13px] transition-colors relative
                  ${isActive ? 'text-white bg-slate-700/60 font-semibold' : 'hover:bg-slate-700/30 text-slate-300'}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <div className="absolute left-0 inset-y-0 w-[3px] bg-teal-400" />}
                    <span className={`font-mono text-[11px] w-4 text-right ${isActive ? 'text-teal-400' : 'text-slate-400'}`}>
                      {item.clause}
                    </span>
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            )}
          </div>
        )
      })}
    </div>
  )
}
