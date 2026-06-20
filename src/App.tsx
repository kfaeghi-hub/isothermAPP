import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

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
    connected: 'Supabase connected',
    error: 'Connection error',
  }
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${styles[status]}`}>
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
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Isotherm Engineering</p>
          <h1 className="text-lg font-bold leading-tight">Cx System</h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          <NavSection label="Phase 1" items={phase1} active={activeItem} onSelect={setActiveItem} />
          <NavSection label="Phase 2" items={phase2} active={activeItem} onSelect={setActiveItem} muted />
          <NavSection label="Phase 3" items={phase3} active={activeItem} onSelect={setActiveItem} muted />
        </nav>

        {/* Connection status */}
        <div className="px-4 py-4 border-t border-slate-700">
          <StatusBadge status={status} />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-3 flex-shrink-0">
          <h2 className="text-base font-semibold">{activeItem}</h2>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">Phase 1 — skeleton</span>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-8">
          <Placeholder name={activeItem} />
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
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-2 mb-1">{label}</p>
      {items.map(item => (
        <button
          key={item.label}
          onClick={() => !muted && onSelect(item.label)}
          className={`w-full text-left flex items-center gap-2.5 px-2 py-2 rounded-md text-sm transition-colors
            ${active === item.label ? 'bg-slate-700 text-white' : ''}
            ${muted ? 'text-slate-600 cursor-default' : 'hover:bg-slate-800 text-slate-300'}`}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
          {muted && (
            <span className="ml-auto text-xs text-slate-600">soon</span>
          )}
        </button>
      ))}
    </div>
  )
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="max-w-2xl">
      <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
        <p className="text-3xl mb-4">🚧</p>
        <h3 className="text-xl font-semibold text-gray-700 mb-2">{name}</h3>
        <p className="text-sm text-gray-400">
          This module will be built in an upcoming session.
          <br />
          The Supabase connection, routing, and shell are ready.
        </p>
      </div>
    </div>
  )
}
