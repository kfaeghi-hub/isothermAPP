// PortalApp — the external world's router and surfaces.
//
// THE CONCEPT: this is the THIRD cover surface (login and landing are the first
// two), not a re-skin of the internal app. Cover purple is the ground; the
// project record sits on PAPER inside it — the firm's standard, opened to one
// project. Sections carry the document's clause grammar (01 Progress ·
// 02 Issues · 03 Documents · 04 Team).
//
// SECURITY IS PART A's, NOT THIS FILE'S. Every read here goes through a
// SECURITY DEFINER RPC with a fixed column whitelist; nothing on this page can
// widen what an external account may see, however it is styled. Route
// separation (this tree never renders inside Shell) is defence in depth.
//
// CONTAINMENT, per the landing precedent: everything under src/pages/portal/,
// one lazy import, no existing app component modified. GSAP is the only extra
// dependency and it is dynamically imported inside the two authored moments —
// Lenis and Three.js are deliberately absent (a working document must not have
// its scroll hijacked, and a GC PM on site data must not pay 120 KB for a
// canvas). Motion budget and the three fallback gates: see motion.ts.
import './portal.css'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { signOut } from '../../lib/auth'
import { LogoMark } from '../../components/Logo'
import {
  getPortalProjects, getPortalProject, getPortalFindings, getPortalPhotos,
  getPortalDocuments, getPortalStats, getPortalTeam,
  type PortalProject, type PortalFinding, type PortalPhoto, type PortalDocument,
  type PortalStats, type PortalTeamRow,
} from '../../lib/portal'
import { useMotionMode } from './motion'
import { Hero } from './sections/Hero'
import { Register } from './sections/Register'
import { Documents } from './sections/Documents'
import { Team } from './sections/Team'
import { EmptyState } from './ui/EmptyState'

const STAFF = ['admin', 'developer', 'owner', 'user']

function Frame({ children, projects, current }: {
  children: React.ReactNode
  projects?: PortalProject[]
  current?: string
}) {
  const { profile } = useAuth()
  return (
    <div className="min-h-screen pt-cover text-slate-300 flex flex-col">
      <header className="border-b border-cover-edge flex-shrink-0">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <Link to="/portal" className="flex items-center gap-2.5 min-w-0 rounded-sm">
            <LogoMark variant="reverse" className="h-6 w-auto flex-shrink-0" />
            <span className="font-display text-[13px] font-bold tracking-tight text-paper truncate">
              Isotherm <span className="font-mono text-vermilion-400">Cx</span>
            </span>
          </Link>

          {/* The switcher exists ONLY at ≥2 memberships — a single-project
              invitee never sees chrome they don't need. */}
          {projects && projects.length > 1 && (
            <>
              <span className="text-cover-edge select-none" aria-hidden="true">/</span>
              <label htmlFor="pt-proj" className="sr-only">Choose project</label>
              <select id="pt-proj" value={current ?? ''}
                onChange={e => { window.location.href = `/portal/${e.target.value}` }}
                className="min-w-0 max-w-[14rem] min-h-[36px] rounded-sm border border-cover-edge bg-transparent
                           px-2 text-[12px] text-paper">
                {projects.map(p => (
                  <option key={p.project_id} value={p.project_id} className="text-ink">{p.name}</option>
                ))}
              </select>
            </>
          )}

          <div className="ml-auto flex items-center gap-3 text-[11px] flex-shrink-0">
            <span className="hidden sm:inline truncate max-w-[11rem] text-slate-400">{profile?.name}</span>
            <button onClick={() => signOut()}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-1 text-slate-400 hover:text-paper transition-colors duration-150">
              <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-cover-edge flex-shrink-0">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 text-[11px] text-slate-400">
          Isotherm Engineering — commissioning record. Documents shown here are the issued record.
        </div>
      </footer>
    </div>
  )
}

/** Staff opened the external world deliberately: say so, plainly, once. */
function PreviewNotice({ projectId }: { projectId: string }) {
  return (
    <div className="border-b border-cover-edge bg-cover-edge/40">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-2.5 flex items-center gap-3 flex-wrap text-[11px]">
        <span className="font-mono uppercase tracking-[0.14em] text-vermilion-400">Preview</span>
        <span className="text-slate-300">You are viewing this project as an external member sees it.</span>
        <Link to={`/projects/${projectId}`}
          className="ml-auto inline-flex items-center gap-1.5 min-h-[36px] text-slate-300 hover:text-paper transition-colors duration-150">
          <ChevronLeft size={13} strokeWidth={2} aria-hidden="true" />
          Back to the project
        </Link>
      </div>
    </div>
  )
}

function ProjectList() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState<PortalProject[] | null>(null)
  useEffect(() => { getPortalProjects().then(setProjects) }, [])

  if (!projects) return <Loading />
  if (projects.length === 1) return <Navigate to={`/portal/${projects[0].project_id}`} replace />

  const staff = STAFF.includes(profile?.role ?? '')
  return (
    <Frame projects={projects}>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
        {projects.length === 0 ? (
          <div className="pt-panel">
            {staff ? (
              <EmptyState
                headline="Open a project to preview it"
                line="Staff accounts hold no external memberships by design. Use “View as client” on a project's Overview to see its external record."
              />
            ) : (
              <EmptyState
                headline="No projects yet"
                line="When Isotherm gives you access to a project, its record appears here."
              />
            )}
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight text-paper mb-5">Your projects</h1>
            <ul className="space-y-2">
              {projects.map(p => (
                <li key={p.project_id}>
                  <Link to={`/portal/${p.project_id}`}
                    className="block pt-panel px-4 py-3.5 transition-colors duration-150 hover:bg-brand-50">
                    <p className="font-display font-bold text-ink-display">{p.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-500">
                      {[p.client_name, p.com_number].filter(Boolean).join('  ·  ') || 'Commissioning record'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Frame>
  )
}

function ProjectView() {
  const { projectId = '' } = useParams()
  const { profile } = useAuth()
  const motion = useMotionMode()

  const [projects, setProjects] = useState<PortalProject[]>([])
  const [project, setProject] = useState<PortalProject | null>(null)
  const [stats, setStats] = useState<PortalStats | null>(null)
  const [findings, setFindings] = useState<PortalFinding[]>([])
  const [photos, setPhotos] = useState<PortalPhoto[]>([])
  const [docs, setDocs] = useState<PortalDocument[]>([])
  const [team, setTeam] = useState<PortalTeamRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      getPortalProjects(), getPortalProject(projectId), getPortalStats(projectId),
      getPortalFindings(projectId), getPortalPhotos(projectId),
      getPortalDocuments(projectId), getPortalTeam(projectId),
    ]).then(([ps, pr, st, f, ph, d, t]) => {
      if (!alive) return
      setProjects(ps); setProject(pr); setStats(st)
      setFindings(f); setPhotos(ph); setDocs(d); setTeam(t)
      setLoading(false)
    })
    return () => { alive = false }
  }, [projectId])

  if (loading) return <Frame><Loading /></Frame>

  const staff = STAFF.includes(profile?.role ?? '')

  return (
    <Frame projects={projects} current={projectId}>
      {staff && <PreviewNotice projectId={projectId} />}
      <Hero project={project} stats={stats} motion={motion} />
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-10">
        <Register findings={findings} photos={photos} />
        <Documents docs={docs} />
        <Team team={team} />
      </div>
    </Frame>
  )
}

function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">Loading the record…</p>
    </div>
  )
}

export default function PortalApp() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/:projectId" element={<ProjectView />} />
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  )
}

