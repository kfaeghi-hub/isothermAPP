// PortalApp — the external world's router and surfaces.
//
// PART A (this build) is the SECURITY boundary: route separation, membership
// scoping, issued-only documents. The presentation here is deliberately plain —
// PART B replaces it with the landing-world design (cover ground, contour
// texture, progress instrument, register cards). Nothing in Part B changes what
// this can read: the RPCs are the contract.
//
// Contained per the landing precedent: everything under src/pages/portal/, one
// lazy import, no existing app component modified. NEVER rendered inside Shell —
// the internal chrome must not exist in this world.
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { signOut } from '../../lib/auth'
import {
  getPortalProjects, getPortalFindings, getPortalDocuments, getPortalStats, getPortalTeam,
  openPortalDocument,
  type PortalProject, type PortalFinding, type PortalDocument, type PortalStats, type PortalTeamRow,
} from '../../lib/portal'

function PortalFrame({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  return (
    <div className="min-h-screen bg-[var(--color-cover)] text-slate-100">
      <header className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <Link to="/portal" className="font-display text-sm font-bold tracking-tight">
            Isotherm <span className="font-mono text-teal-400">Cx</span> — Project Record
          </Link>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="truncate max-w-[12rem]">{profile?.name}</span>
            <button onClick={() => signOut()} className="hover:text-slate-100">Sign out</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-5 py-8">{children}</main>
    </div>
  )
}

function ProjectList() {
  const [projects, setProjects] = useState<PortalProject[] | null>(null)
  useEffect(() => { getPortalProjects().then(setProjects) }, [])
  if (!projects) return <p className="text-sm text-slate-400">Loading…</p>
  if (projects.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-lg mb-1">No projects yet</p>
        <p className="text-sm text-slate-400">
          When Isotherm adds you to a project, it appears here.
        </p>
      </div>
    )
  }
  if (projects.length === 1) return <Navigate to={`/portal/${projects[0].project_id}`} replace />
  return (
    <div className="space-y-2">
      <h1 className="font-display text-2xl font-bold mb-4">Your projects</h1>
      {projects.map(p => (
        <Link key={p.project_id} to={`/portal/${p.project_id}`}
          className="block border border-slate-800 rounded-sm px-4 py-3 hover:border-slate-700">
          <p className="font-display font-bold">{p.name}</p>
          <p className="text-[11px] text-slate-400 font-mono">
            {p.client_name ?? '—'}{p.com_number ? ` · ${p.com_number}` : ''}
          </p>
        </Link>
      ))}
    </div>
  )
}

function ProjectView() {
  const { projectId = '' } = useParams()
  const [project, setProject]   = useState<PortalProject | null>(null)
  const [stats, setStats]       = useState<PortalStats | null>(null)
  const [findings, setFindings] = useState<PortalFinding[]>([])
  const [docs, setDocs]         = useState<PortalDocument[]>([])
  const [team, setTeam]         = useState<PortalTeamRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [multi, setMulti]       = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      getPortalProjects(), getPortalStats(projectId), getPortalFindings(projectId),
      getPortalDocuments(projectId), getPortalTeam(projectId),
    ]).then(([ps, st, f, d, t]) => {
      if (!alive) return
      setProject(ps.find(p => p.project_id === projectId) ?? null)
      setMulti(ps.length > 1)
      setStats(st); setFindings(f); setDocs(d); setTeam(t); setLoading(false)
    })
    return () => { alive = false }
  }, [projectId])

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  const pct = stats && stats.checklists_total > 0
    ? Math.round(100 * stats.checklists_complete / stats.checklists_total) : null

  return (
    <div className="space-y-10">
      {multi && <Link to="/portal" className="text-[11px] text-slate-400 hover:text-slate-100">← All projects</Link>}

      <section>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400">
          {project?.client_name ?? 'Project record'}
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight mt-1">{project?.name ?? '—'}</h1>
        {stats?.phases?.length ? (
          <p className="text-[11px] text-slate-400 mt-1">{stats.phases.join(' · ')}</p>
        ) : null}
        <div className="grid grid-cols-3 gap-4 mt-6 max-w-md">
          <div>
            <p className="font-mono text-3xl tabular-nums">{pct === null ? '—' : `${pct}%`}</p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400 mt-1">Checklists</p>
          </div>
          <div>
            <p className="font-mono text-3xl tabular-nums">{stats?.findings_open ?? 0}</p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400 mt-1">Open issues</p>
          </div>
          <div>
            <p className="font-mono text-3xl tabular-nums">{stats?.findings_closed ?? 0}</p>
            <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400 mt-1">Closed</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.08em] mb-3">
          <span className="font-mono text-teal-400 mr-2">02</span>Issues register
        </h2>
        {findings.length === 0 ? (
          <p className="text-sm text-slate-400">No issues recorded yet.</p>
        ) : (
          <div className="border border-slate-800 rounded-sm divide-y divide-slate-800">
            {findings.map(f => (
              <div key={f.finding_id} className="px-4 py-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-slate-400">#{f.number ?? '—'}</span>
                  <span className="font-medium">{f.title ?? '(untitled)'}</span>
                  <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                    f.status === 'closed' ? 'bg-slate-800 text-slate-400' : 'bg-vermilion-500/15 text-vermilion-400'
                  }`}>{f.status === 'closed' ? 'CLOSED' : 'OPEN'}</span>
                </div>
                {f.description && <p className="text-sm text-slate-300 mt-1">{f.description}</p>}
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  {[f.category, f.building_area, f.responsible_company,
                    f.date_raised ? `raised ${f.date_raised}` : null,
                    f.date_closed ? `resolved ${f.date_closed}` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.08em] mb-3">
          <span className="font-mono text-teal-400 mr-2">03</span>Documents
        </h2>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-400">No issued documents yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map(d => (
              <div key={`${d.kind}-${d.row_id}`}
                className="border border-slate-800 rounded-sm px-4 py-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{d.label}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{d.doc_date ?? ''}</p>
                </div>
                {d.has_pdf && (
                  <button onClick={() => openPortalDocument(d, 'pdf')}
                    className="text-xs border border-slate-700 rounded-sm px-3 py-2 min-h-[44px] hover:border-slate-500">PDF</button>
                )}
                {d.has_docx && (
                  <button onClick={() => openPortalDocument(d, 'docx')}
                    className="text-xs border border-slate-700 rounded-sm px-3 py-2 min-h-[44px] hover:border-slate-500">.docx</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.08em] mb-3">
          <span className="font-mono text-teal-400 mr-2">04</span>Project team
        </h2>
        {team.length === 0 ? (
          <p className="text-sm text-slate-400">No team recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {team.map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-[10px] text-slate-400 w-12">{t.role_abbr ?? ''}</span>
                <span>{t.company_name ?? '—'}</span>
                <span className="text-slate-400 text-[11px] ml-auto">{t.contact_name ?? ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default function PortalApp() {
  return (
    <PortalFrame>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/:projectId" element={<ProjectView />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </PortalFrame>
  )
}
