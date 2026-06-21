import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ProjectsPage } from './pages/ProjectsPage'
import { DirectoryPage } from './pages/DirectoryPage'

type ConnectionStatus = 'checking' | 'connected' | 'error'

const NAV_ITEMS = [
  { label: 'Projects', icon: '📋', phase: 1 },
  { label: 'Directory', icon: '👥', phase: 1 },
  { label: 'Issues Log', icon: '⚠️', phase: 1 },
  { label: 'Cx Index', icon: '📊', phase: 1 },
  { label: 'Site Reports', icon: '📄', phase: 1 },
  { label: 'Checklists', icon: '✅', phase: 2 },
  { label: 'Templates', icon: '🗂️', phase: 2 },
  { label: 'Action Summary', icon: '📌', phase: 3 },
]

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const styles: Record<ConnectionStatus, string> = {
    checking: 'bg-yellow-100 text-yellow-800',
    connected: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
  }
  const labels: Record<ConnectionStatus, string> = {
    checking: 'Checking…',
    connected: 'DB connected',
    error: 'Connection error',
  }
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [activeItem, setActiveItem] = useState('Projects')

  useEffect(() => {
    supabase.auth.getSession()
      .then(() => setStatus('connected'))
      .catch(() => setStatus('error'))
  }, [])

  const phase1 = NAV_ITEMS.filter(i => i.phase === 1)
  const phase2 = NAV_ITEMS.filter(i => i.phase === 2)
  const phase3 = NAV_ITEMS.filter(i => i.phase === 3)

  return (
    <div className="flex h-screen bg-slate-50 text-gray-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500 mb-1">Isotherm Engineering</p>
          <h1 className="text-[15px] font-semibold text-white leading-tight tracking-tight">
            <span className="font-mono text-teal-400">Cx</span>{' '}System
          </h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          <NavSection label="Phase 1" items={phase1} active={activeItem} onSelect={setActiveItem} />
          <NavSection label="Phase 2" items={phase2} active={activeItem} onSelect={setActiveItem} muted />
          <NavSection label="Phase 3" items={phase3} active={activeItem} onSelect={setActiveItem} muted />
        </nav>

        {/* Connection status */}
        <div className="px-5 py-3 border-t border-slate-800">
          <StatusBadge status={status} />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 border-b border-gray-200 bg-white flex items-center px-5 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">{activeItem}</h2>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {activeItem === 'Projects' ? (
            <ProjectsPage />
          ) : activeItem === 'Directory' ? (
            <DirectoryPage />
          ) : (
            <div className="p-8">
              <Placeholder name={activeItem} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function NavSection({
  label,
  items,
  active,
  onSelect,
  muted = false,
}: {
  label: string
  items: typeof NAV_ITEMS
  active: string
  onSelect: (s: string) => void
  muted?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 px-3 mb-1">{label}</p>
      {items.map(item => {
        const isActive = active === item.label && !muted
        return (
          <div key={item.label} className="relative">
            {isActive && (
              <div className="absolute left-0 inset-y-0 w-0.5 bg-teal-400 rounded-r" />
            )}
            <button
              onClick={() => !muted && onSelect(item.label)}
              className={`w-full text-left flex items-center gap-2.5 pl-3 pr-2 py-1.5 text-sm transition-colors
                ${isActive ? 'text-white bg-white/[0.07]' : ''}
                ${muted ? 'text-slate-600 cursor-default' : 'hover:bg-white/[0.05] text-slate-400'}`}
            >
              <span className={muted ? 'opacity-40' : ''}>{item.icon}</span>
              <span>{item.label}</span>
              {muted && (
                <span className="ml-auto text-[10px] text-slate-600 font-medium">soon</span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white p-12 text-center">
        <p className="text-3xl mb-4">🚧</p>
        <h3 className="text-base font-semibold text-gray-700 mb-2">{name}</h3>
        <p className="text-sm text-gray-400">
          This module will be built in an upcoming session.
        </p>
      </div>
    </div>
  )
}
