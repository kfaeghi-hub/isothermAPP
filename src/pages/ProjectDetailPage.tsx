import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { reportError, reportWriteBlocked } from '../lib/mutationError'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatDateRange } from '../lib/format'
import {
  fetchClassificationConfig, fetchProjectSelections, validateRequired,
  syncProjectClassifications,
  type ClassificationSelections, type ClassificationConfig,
} from '../lib/classifications'
import { ClassificationPicker } from '../components/ClassificationPicker'
import { ClassificationBadges } from '../components/ClassificationBadges'
import { ProjectStatHeader } from '../components/ProjectStatHeader'
import { AccessCard } from '../components/AccessCard'
import { fetchDeliverables, isOverdue, type DeliverableRow } from '../lib/deliverables'
import { Modal } from '../components/ui/Modal'
import { IssuesLogPage } from './IssuesLogPage'
import { CxIndexPage } from './CxIndexPage'
import { EquipmentPage } from './EquipmentPage'
import { SiteReportsPage } from './SiteReportsPage'
import { MeetingsPage } from './MeetingsPage'
import { ChecklistsPage } from './ChecklistsPage'
import { TeamPage } from './TeamPage'
import { DeliverablesPage } from './DeliverablesPage'
import type {
  ProjectWithClient, ProjectPhase, Company, ContactWithCompany, TradeType,
} from '../types/database'

// ── Types ──────────────────────────────────────────────────────────────────

interface DistributionRow {
  id: string
  contact_id: string
  contacts: {
    id: string
    name: string
    trade: string | null
    companies: { id: string; name: string; abbreviation: string | null } | null
  } | null
}

interface EditForm {
  name: string
  com_number: string
  address: string
  client_company_id: string
  start_date: string
  finish_date: string
  notes: string
}

type Tab = 'overview' | 'team' | 'issues' | 'cx_index' | 'equipment' | 'site_reports' | 'meetings' | 'checklists' | 'deliverables'

const TABS: { id: Tab; label: string; built: boolean }[] = [
  { id: 'overview',     label: 'Overview',     built: true  },
  { id: 'team',         label: 'Team',         built: true  },
  { id: 'issues',       label: 'Issues Log',   built: true  },
  { id: 'cx_index',     label: 'Cx Index',     built: true  },
  { id: 'equipment',    label: 'Equipment',    built: true  },
  { id: 'site_reports', label: 'Site Reports', built: true  },
  { id: 'meetings',     label: 'Meetings',     built: true  },
  { id: 'checklists',   label: 'Checklists',   built: true  },
  { id: 'deliverables', label: 'Deliverables', built: true },
]

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  companies: Company[]
  onBack: () => void
}

export function ProjectDetailPage({ projectId, companies, onBack }: Props) {
  const [project, setProject] = useState<ProjectWithClient | null>(null)
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [distribution, setDistribution] = useState<DistributionRow[]>([])
  const [allContacts, setAllContacts] = useState<ContactWithCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Tab state lives in the URL (?tab=…) so dashboard rows and external links can
  // deep-link straight to a project's Meetings/Issues/Checklists.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: Tab = TABS.some(t => t.id === tabParam) ? (tabParam as Tab) : 'overview'
  const setActiveTab = (tab: Tab) => {
    setSearchParams(tab === 'overview' ? {} : { tab }, { replace: true })
  }

  // RC1 — mobile tab strip: keep the active tab in view; fade the right edge
  // while more tabs are hidden past it (fade clears at scroll end).
  const tabStripRef = useRef<HTMLDivElement>(null)
  const [tabFade, setTabFade] = useState(true)
  const onTabStripScroll = () => {
    const el = tabStripRef.current
    if (el) setTabFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }
  useEffect(() => {
    const el = tabStripRef.current
    if (!el) return
    el.querySelector<HTMLElement>('[data-tab-active]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
    onTabStripScroll()
  }, [activeTab])

  // Access control: employees see project settings only as leads. RLS lets each
  // user read their OWN membership row; admins see all (and are implicit leads).
  const { profile } = useAuth()
  // Governors: admin/dev see all; the owner role only ever reaches member
  // projects (RLS), so granting it these buttons is portfolio-scoped by construction.
  const isOwner = ['admin', 'developer', 'owner'].includes(profile?.role ?? '')
  const [isLead, setIsLead] = useState(false)
  useEffect(() => {
    if (isOwner || !profile) { setIsLead(isOwner); return }
    let alive = true
    supabase.from('project_members').select('is_lead')
      .eq('project_id', projectId).eq('profile_id', profile.id).maybeSingle()
      .then(({ data }) => { if (alive) setIsLead(!!data?.is_lead) })
    return () => { alive = false }
  }, [projectId, profile, isOwner])

  // Edit project modal
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', com_number: '', address: '', client_company_id: '', start_date: '', finish_date: '', notes: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Team summary (Overview block; the Team tab owns the full matrix)
  const [teamSummary, setTeamSummary] = useState<{ abbr: string; role: string; companies: string }[]>([])

  // Classifications
  const [classConfig, setClassConfig] = useState<ClassificationConfig>({ dimensions: [], options: [] })
  const [projSelections, setProjSelections] = useState<ClassificationSelections>({})
  const [editSelections, setEditSelections] = useState<ClassificationSelections>({})
  const [dimErrors, setDimErrors] = useState<Record<string, string>>({})

  // Inline "add new company" in the edit modal (never a loose string)
  const [extraCompanies, setExtraCompanies] = useState<Company[]>([])
  const [addingCompany, setAddingCompany]   = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')

  // Trade management
  const [allTrades, setAllTrades]         = useState<TradeType[]>([])
  const [projectTradeIds, setProjectTradeIds] = useState<string[]>([])
  const [editTradeIds, setEditTradeIds]   = useState<string[]>([])
  const [addingTrade, setAddingTrade]     = useState(false)
  const [newTradeName, setNewTradeName]   = useState('')

  // Phase management
  const [phaseInput, setPhaseInput] = useState('')

  // Distribution management
  const [distContactId, setDistContactId] = useState('')
  const [addingDist, setAddingDist] = useState(false)

  // ── Data ────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [pRes, phRes, dRes, ctRes, tRes, ptRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*, companies(id, name, abbreviation)')
        .eq('id', projectId)
        .single(),
      supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order'),
      supabase
        .from('project_distribution')
        .select('id, contact_id, contacts(id, name, trade, companies(id, name, abbreviation))')
        .eq('project_id', projectId),
      supabase
        .from('contacts')
        .select('*, companies(id, name, abbreviation)')
        .order('name'),
      supabase.from('trade_types').select('*').order('sort_order'),
      supabase.from('project_trades').select('trade_type_id').eq('project_id', projectId),
    ])
    const [ccRes, selRes] = await Promise.all([
      fetchClassificationConfig(),
      fetchProjectSelections(projectId),
    ])
    await fetchTeamSummary()
    if (pRes.error)  { setError(pRes.error.message);  setLoading(false); return }
    setProject(pRes.data as ProjectWithClient)
    setPhases((phRes.data ?? []) as ProjectPhase[])
    setDistribution((dRes.data ?? []) as unknown as DistributionRow[])
    setAllContacts((ctRes.data ?? []) as ContactWithCompany[])
    setAllTrades((tRes.data ?? []) as TradeType[])
    setProjectTradeIds((ptRes.data ?? []).map(r => r.trade_type_id))
    setClassConfig(ccRes)
    setProjSelections(selRes)
    setLoading(false)
  }, [projectId])

  const fetchTeamSummary = useCallback(async () => {
    const { data } = await supabase.from('project_team_assignments')
      .select('role_type_id, company_id, company_role_types(name, abbreviation, sort_order), companies(name)')
      .eq('project_id', projectId)

    // Compact per-role summary: abbreviation chip + distinct company names
    const roleMap = new Map<string, { abbr: string; role: string; sort: number; companies: Set<string> }>()
    for (const r of (data ?? []) as any[]) {
      const rt = Array.isArray(r.company_role_types) ? r.company_role_types[0] : r.company_role_types
      const co = Array.isArray(r.companies) ? r.companies[0] : r.companies
      if (!rt) continue
      const entry = roleMap.get(r.role_type_id) ?? {
        abbr: rt.abbreviation ?? rt.name.slice(0, 4).toUpperCase(),
        role: rt.name, sort: rt.sort_order, companies: new Set<string>(),
      }
      if (co?.name) entry.companies.add(co.name)
      roleMap.set(r.role_type_id, entry)
    }
    setTeamSummary([...roleMap.values()]
      .sort((a, b) => a.sort - b.sort)
      .map(e => ({ abbr: e.abbr, role: e.role, companies: [...e.companies].join(', ') })))
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // The Team tab writes assignments; refresh the Overview summary on return so it
  // never shows a stale matrix.
  useEffect(() => {
    if (activeTab === 'overview') fetchTeamSummary()
  }, [activeTab, fetchTeamSummary])

  // ── Edit project ────────────────────────────────────────────────────────

  function openEdit() {
    if (!project) return
    setEditForm({
      name: project.name,
      com_number: project.com_number ?? '',
      address: project.address ?? '',
      client_company_id: project.client_company_id ?? '',
      start_date: project.start_date ?? '',
      finish_date: project.finish_date ?? '',
      notes: project.notes ?? '',
    })
    // Deep-copy so cancelling the modal doesn't mutate the displayed selections
    setEditSelections(Object.fromEntries(
      Object.entries(projSelections).map(([k, v]) => [k, [...v]]),
    ))
    setDimErrors({})
    setEditTradeIds([...projectTradeIds])
    setAddingTrade(false)
    setNewTradeName('')
    setEditError(null)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editForm.name.trim()) { setEditError('Project name is required.'); return }

    // Required flags are runtime data; the modal enforces whatever they say now.
    const errors = validateRequired(classConfig.dimensions, editSelections)
    setDimErrors(errors)
    if (Object.keys(errors).length > 0) { setEditError('Complete the required classifications.'); return }

    setSavingEdit(true)
    const { error } = await supabase
      .from('projects')
      .update({
        name: editForm.name.trim(),
        com_number: editForm.com_number.trim() || null,
        address: editForm.address.trim() || null,
        client_company_id: editForm.client_company_id || null,
        start_date: editForm.start_date || null,
        finish_date: editForm.finish_date || null,
        notes: editForm.notes.trim() || null,
      })
      .eq('id', projectId)
    if (error) { setSavingEdit(false); setEditError(error.message); return }

    // Sync junction (deletes first — the single-mode trigger rejects insert-before-delete)
    const syncErr = await syncProjectClassifications(projectId, editSelections, classConfig.options)
    if (syncErr) { setSavingEdit(false); setEditError(`Classifications: ${syncErr}`); return }

    // Sync project_trades: replace all with current selection. A failed delete
    // must abort before the re-insert (otherwise the systems silently drop or
    // the insert conflicts). Surface via the modal's own error slot.
    const { error: delTradesErr } = await supabase.from('project_trades').delete().eq('project_id', projectId)
    if (delTradesErr) { setSavingEdit(false); setEditError(`Systems: ${delTradesErr.message}`); return }
    if (editTradeIds.length > 0) {
      const { error: insTradesErr } = await supabase.from('project_trades').insert(
        editTradeIds.map(trade_type_id => ({ project_id: projectId, trade_type_id }))
      )
      if (insTradesErr) { setSavingEdit(false); setEditError(`Systems: ${insTradesErr.message}`); return }
    }

    setSavingEdit(false)
    setEditOpen(false)
    fetchAll()
  }

  async function addNewCompanyEdit() {
    const name = newCompanyName.trim()
    if (!name) return
    const { data, error } = await supabase
      .from('companies').insert({ name }).select('id, name, abbreviation').single()
    if (error || !data) { alert(error?.message ?? 'Could not create company.'); return }
    setExtraCompanies(cs => [...cs, data as Company])
    setEditForm(f => ({ ...f, client_company_id: data.id }))
    setAddingCompany(false)
    setNewCompanyName('')
  }

  async function addNewTradeEdit() {
    const name = newTradeName.trim()
    if (!name) return
    const maxOrder = allTrades.reduce((m, t) => Math.max(m, t.sort_order), 0)
    const { data, error } = await supabase
      .from('trade_types')
      .insert({ name, sort_order: maxOrder + 1 })
      .select('*')
      .single()
    if (reportError(error, 'add the system')) return
    if (data) {
      const trade = data as TradeType
      setAllTrades(prev => [...prev, trade])
      setEditTradeIds(prev => [...prev, trade.id])
    }
    setNewTradeName('')
    setAddingTrade(false)
  }

  async function changeStatus(status: 'active' | 'completed') {
    // .select() so the C2 status-guard raising, or an RLS-filtered 0-row update,
    // surfaces instead of silently looking like it worked.
    const { data, error } = await supabase.from('projects').update({ status }).eq('id', projectId).select('id')
    if (reportWriteBlocked({ data, error }, `mark this project ${status}`)) return
    fetchAll()
  }

  // ── Phase management ────────────────────────────────────────────────────

  async function addPhase() {
    const name = phaseInput.trim()
    if (!name) return
    const nextOrder = phases.length > 0 ? Math.max(...phases.map(p => p.sort_order)) + 1 : 0
    const { error } = await supabase
      .from('project_phases')
      .insert({ project_id: projectId, name, sort_order: nextOrder })
    if (error) { alert(error.message); return }
    setPhaseInput('')
    fetchAll()
  }

  async function deletePhase(phaseId: string) {
    if (!confirm('Remove this phase? It will be unlinked from any tagged findings.')) return
    const { error } = await supabase.from('project_phases').delete().eq('id', phaseId)
    if (reportError(error, 'remove the phase')) return
    fetchAll()
  }

  // ── Distribution ────────────────────────────────────────────────────────

  const distContactIds = new Set(distribution.map(d => d.contact_id))
  const availableContacts = allContacts.filter(c => !distContactIds.has(c.id))

  async function addToDistribution() {
    if (!distContactId) return
    setAddingDist(true)
    const { error } = await supabase
      .from('project_distribution')
      .insert({ project_id: projectId, contact_id: distContactId })
    setAddingDist(false)
    if (error) { alert(error.message); return }
    setDistContactId('')
    fetchAll()
  }

  async function removeFromDistribution(rowId: string) {
    const { error } = await supabase.from('project_distribution').delete().eq('id', rowId)
    if (reportError(error, 'remove the contact from distribution')) return
    fetchAll()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading project…</div>
  if (error || !project) return <div className="p-8 text-sm text-red-600">{error ?? 'Project not found.'}</div>

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Project header ──────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 pt-3 pb-0 flex-shrink-0">
        {/* Breadcrumb */}
        <button
          onClick={onBack}
          className="text-xs text-gray-400 hover:text-teal-700 transition-colors mb-2 flex items-center gap-1"
        >
          ← Projects
        </button>

        {/* Project identity row — the sheet's title block. Below lg the title
            takes the full row and actions wrap under it (RC5: the side-by-side
            row truncated the title to "ZZ-TES…" at 375). */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-3">
          <div className="min-w-0 basis-full lg:basis-auto lg:flex-1">
            <h2 className="font-display text-lg font-bold text-gray-900 leading-tight truncate">{project.name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <ClassificationBadges
                dimensions={classConfig.dimensions}
                options={classConfig.options}
                selections={projSelections}
              />
              {project.status === 'completed' && (
                <span className="text-[11px] font-semibold rounded px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Completed
                </span>
              )}
              {project.com_number && (
                <span className="font-mono text-xs text-gray-500">{project.com_number}</span>
              )}
              {/* Verbose meta stays desktop-only (RC5): on phones it stacked the
                  header to ~480px before any content; client/address/dates all
                  live on Overview and in Edit Project. */}
              {project.companies && (
                <span className="hidden lg:inline text-xs text-gray-500">{project.companies.name}</span>
              )}
              {!project.companies && (
                <span className="hidden lg:inline text-xs text-gray-400 italic">Standalone</span>
              )}
              {project.address && (
                <span className="hidden lg:inline text-xs text-gray-400">{project.address}</span>
              )}
              {formatDateRange(project.start_date, project.finish_date) && (
                <span className="hidden lg:inline text-xs font-mono text-gray-500">
                  {formatDateRange(project.start_date, project.finish_date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Complete/reopen is owner-only (C2, DB status-guard trigger backs it) */}
            {isOwner && (project.status === 'active' ? (
              <button
                onClick={() => changeStatus('completed')}
                className="text-xs text-gray-500 hover:text-emerald-700 border border-gray-200 hover:border-emerald-400 rounded px-3 py-1.5 transition-colors"
              >
                Mark as Completed
              </button>
            ) : (
              <button
                onClick={() => changeStatus('active')}
                className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 hover:border-emerald-400 rounded px-3 py-1.5 transition-colors"
              >
                Reopen
              </button>
            ))}
            {/* Settings (dates/classifications/systems) are lead-or-owner */}
            {(isOwner || isLead) && (
              <button
                onClick={openEdit}
                className="text-xs text-gray-500 hover:text-teal-700 border border-gray-200 hover:border-teal-400 rounded px-3 py-1.5 transition-colors"
              >
                Edit Project
              </button>
            )}
          </div>
        </div>

        {/* Tabs — the sheet's contents rule. The strip scrolls horizontally on
            phones (RC1): the active tab auto-scrolls into view, and an edge
            fade signals the hidden tabs (the audit found the strip ending
            clean at the viewport edge with 5 tabs undiscoverable). */}
        <div className="relative">
          <div ref={tabStripRef} onScroll={onTabStripScroll}
            className="flex gap-0 -mb-px overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(tab => (
              <button
                key={tab.id}
                data-tab-active={activeTab === tab.id || undefined}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 lg:py-2 text-[13px] border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-standard-600 text-standard-700 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-800 font-medium'
                } ${!tab.built ? 'text-gray-400' : ''}`}
              >
                {tab.label}
                {!tab.built && (
                  <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-gray-400">soon</span>
                )}
              </button>
            ))}
          </div>
          {tabFade && (
            <div className="lg:hidden pointer-events-none absolute inset-y-0 right-0 w-10
              bg-gradient-to-l from-white to-transparent" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────── */}
      <div className={`flex-1 bg-slate-50 ${activeTab === 'checklists' ? 'overflow-hidden' : 'overflow-auto'}`}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="p-4 lg:p-6 max-w-4xl">
            <ProjectStatHeader projectId={projectId} onTab={setActiveTab} />
            {/* single column on phones (the 3-col grid squeezed cards to ~180px) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

              {/* Team summary — the Team tab owns the full matrix */}
              <div className="card-tile bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Team</h3>
                  <button onClick={() => setActiveTab('team')}
                    className="text-xs text-teal-700 hover:underline">View Team →</button>
                </div>
                {teamSummary.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No team assigned yet — the communication matrix lives in the Team tab.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {teamSummary.map(t => (
                      <div key={t.abbr + t.role} className="flex items-center gap-2.5 text-sm">
                        <span className="text-[10px] font-semibold font-mono rounded px-1.5 py-0.5 bg-[#1F3A5F] text-white w-12 text-center flex-shrink-0">
                          {t.abbr}
                        </span>
                        <span className="text-gray-700">{t.companies || '—'}</span>
                        <span className="text-xs text-gray-400 ml-auto">{t.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deliverables — compact summary; the full rollup lives in the Deliverables tab */}
              <DeliverablesSummaryCard projectId={projectId} onOpen={() => setActiveTab('deliverables')} />

              {/* Access — beside Project Team, owner-only (§9.4a) */}
              {isOwner && <AccessCard projectId={projectId} />}

              {/* Phases */}
              <div className="card-tile bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Phases</h3>
                {phases.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">No phases — add one below for multi-phase projects.</p>
                ) : (
                  <ul className="space-y-1.5 mb-3">
                    {phases.map(ph => (
                      <li key={ph.id} className="flex items-center justify-between group">
                        <span className="text-sm text-gray-700">{ph.name}</span>
                        <button
                          onClick={() => deletePhase(ph.id)}
                          className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={phaseInput}
                    onChange={e => setPhaseInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhase() } }}
                    placeholder="Phase name…"
                    className="flex-1 min-w-0 border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                  <button
                    onClick={addPhase}
                    className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors whitespace-nowrap"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Distribution */}
              <div className="sm:col-span-2 card-tile bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Distribution List</h3>
                {distribution.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">No contacts on the distribution yet — add them below.</p>
                ) : (
                  <table className="w-full text-sm mb-3">
                    <thead>
                      <tr>
                        <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-1.5">Name</th>
                        <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-1.5">Company</th>
                        <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-1.5">Role</th>
                        <th className="w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {distribution.map(row => (
                        <tr key={row.id} className="border-t border-gray-50 group">
                          <td className="py-1.5 pr-4 text-gray-800">{row.contacts?.name ?? '—'}</td>
                          <td className="py-1.5 pr-4 text-gray-500 text-xs">
                            {row.contacts?.companies?.abbreviation
                              ? <span title={row.contacts.companies.name} className="font-mono">{row.contacts.companies.abbreviation}</span>
                              : (row.contacts?.companies?.name ?? '—')}
                          </td>
                          <td className="py-1.5 pr-4 text-gray-400 text-xs">{row.contacts?.trade ?? '—'}</td>
                          <td className="py-1.5">
                            <button
                              onClick={() => removeFromDistribution(row.id)}
                              className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="flex gap-2">
                  <select
                    value={distContactId}
                    onChange={e => setDistContactId(e.target.value)}
                    className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Add contact to distribution…</option>
                    {availableContacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.companies ? ` — ${c.companies.abbreviation ?? c.companies.name}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addToDistribution}
                    disabled={!distContactId || addingDist}
                    className="text-xs px-3 py-1.5 bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Notes + metadata */}
              {(project.notes || true) && (
                <div className="sm:col-span-2 lg:col-span-3 card-tile bg-white rounded-xl border border-gray-200 p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</h3>
                      {project.notes ? (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.notes}</p>
                      ) : (
                        <p className="text-xs text-gray-400">No notes. Edit project to add.</p>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Project Info</h3>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex gap-2">
                          <dt className="text-gray-400 w-20 flex-shrink-0">Created</dt>
                          <dd className="font-mono text-gray-600">{formatDate(project.created_at)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-gray-400 w-20 flex-shrink-0">Last opened</dt>
                          <dd className="font-mono text-gray-600">{formatDate(project.last_visited_at)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-gray-400 w-20 flex-shrink-0">Cx Index</dt>
                          <dd className="text-teal-600">Standard Comprehensive</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Issues Log */}
        {activeTab === 'team' && (
          <TeamPage projectId={projectId} />
        )}

        {activeTab === 'issues' && (
          <IssuesLogPage projectId={projectId} phases={phases} />
        )}

        {/* Cx Index */}
        {activeTab === 'cx_index' && (
          <CxIndexPage projectId={projectId} />
        )}

        {/* Equipment / Systems Register */}
        {activeTab === 'equipment' && (
          <EquipmentPage projectId={projectId} />
        )}

        {/* Site Reports */}
        {activeTab === 'site_reports' && (
          <SiteReportsPage projectId={projectId} />
        )}

        {/* Meetings */}
        {activeTab === 'meetings' && (
          <MeetingsPage projectId={projectId} />
        )}

        {/* Checklists */}
        {activeTab === 'checklists' && (
          <ChecklistsPage projectId={projectId} phases={phases} />
        )}

        {/* Deliverables */}
        {activeTab === 'deliverables' && (
          <DeliverablesPage projectId={projectId} canAssign={isOwner || isLead} />
        )}
      </div>

      {/* ── Edit Project modal ──────────────────────────── */}
      <Modal title="Edit Project" open={editOpen} onClose={() => setEditOpen(false)} maxWidth="lg">
        <div className="space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Project Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">COM #</label>
              <input
                type="text"
                value={editForm.com_number}
                onChange={e => setEditForm(f => ({ ...f, com_number: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Address</label>
              <input
                type="text"
                value={editForm.address}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Client</label>
              {addingCompany ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addNewCompanyEdit() }
                      if (e.key === 'Escape') { setAddingCompany(false); setNewCompanyName('') }
                    }}
                    placeholder="New company name…"
                    className="flex-1 border border-teal-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                  <button onClick={addNewCompanyEdit} className="text-teal-700 text-lg font-medium leading-none px-1">✓</button>
                  <button onClick={() => { setAddingCompany(false); setNewCompanyName('') }} className="text-gray-400 text-lg leading-none px-1">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <select
                    value={editForm.client_company_id}
                    onChange={e => setEditForm(f => ({ ...f, client_company_id: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Standalone / No Client</option>
                    {[...companies, ...extraCompanies]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setAddingCompany(true)}
                    title="Add a new company to the directory"
                    className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-2.5 py-2 whitespace-nowrap transition-colors"
                  >
                    + New
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Start Date
                <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
              </label>
              <input
                type="date"
                value={editForm.start_date}
                onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Finish Date
                <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
              </label>
              <input
                type="date"
                value={editForm.finish_date}
                onChange={e => setEditForm(f => ({ ...f, finish_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Classification dimensions — rendered dynamically from runtime config */}
          <ClassificationPicker
            dimensions={classConfig.dimensions}
            options={classConfig.options}
            value={editSelections}
            errors={dimErrors}
            onChange={(dimensionId, optionIds) => {
              setEditSelections(s => ({ ...s, [dimensionId]: optionIds }))
              setDimErrors(e => { const { [dimensionId]: _gone, ...rest } = e; return rest })
            }}
          />

          {/* Systems to be Commissioned — peer section of the classification block.
              Presentation only: storage stays trade_types/project_trades, and the
              finding-category wiring is untouched. */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Systems to be Commissioned
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allTrades.filter(t => t.active || editTradeIds.includes(t.id)).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEditTradeIds(prev =>
                    prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                  )}
                  className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                    editTradeIds.includes(t.id)
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700'
                  }`}
                >
                  {t.name}{!t.active && ' (inactive)'}
                </button>
              ))}
              {addingTrade ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTradeName}
                    onChange={e => setNewTradeName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addNewTradeEdit() }
                      if (e.key === 'Escape') { setAddingTrade(false); setNewTradeName('') }
                    }}
                    placeholder="System name…"
                    className="text-xs border border-teal-300 rounded-full px-3 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    autoFocus
                  />
                  <button onClick={addNewTradeEdit} className="text-teal-700 text-sm font-medium leading-none">✓</button>
                  <button onClick={() => { setAddingTrade(false); setNewTradeName('') }} className="text-gray-400 text-sm leading-none">✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTrade(true)}
                  className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded-full px-3 py-1 transition-colors"
                >
                  + Add system
                </button>
              )}
            </div>
            {editTradeIds.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                No systems selected — finding categories will be limited to INFO.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
            />
          </div>

          {editError && <p className="text-sm text-red-600">{editError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={savingEdit}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/** #2 — compact deliverables summary on the project Overview. Total · assigned to me ·
 *  overdue; the full by-assignee rollup and table live in the Deliverables tab. Uses
 *  the same numeral/label language as the ProjectStatHeader. */
function DeliverablesSummaryCard({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState<DeliverableRow[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchDeliverables(projectId).then(r => { if (alive) setRows(r) })
    return () => { alive = false }
  }, [projectId])

  const total = rows?.length ?? 0
  const mine = rows?.filter(r => !!r.assigned_to && r.assigned_to === profile?.name).length ?? 0
  const overdue = rows?.filter(r => isOverdue(r.status, r.due_date)).length ?? 0

  return (
    <div className="card-tile bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deliverables</h3>
        <button onClick={onOpen} className="text-xs text-teal-700 hover:underline">View all →</button>
      </div>
      {rows === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : total === 0 ? (
        <p className="text-sm text-gray-400">None tracked yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <button onClick={onOpen} className="text-left group">
            <p className="font-mono text-[24px] font-medium leading-none tabular-nums tracking-[-0.02em] text-gray-900">{total}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5 group-hover:text-standard-600 transition-colors">Total</p>
          </button>
          <button onClick={onOpen} className="text-left group">
            <p className="font-mono text-[24px] font-medium leading-none tabular-nums tracking-[-0.02em] text-gray-900">{mine}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5 group-hover:text-standard-600 transition-colors">Assigned to Me</p>
          </button>
          <button onClick={onOpen} className="text-left group">
            <p className={`font-mono text-[24px] font-medium leading-none tabular-nums tracking-[-0.02em] ${overdue ? 'text-rose-700' : 'text-gray-900'}`}>{overdue}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 mt-1.5 group-hover:text-standard-600 transition-colors">Overdue</p>
          </button>
        </div>
      )}
    </div>
  )
}
