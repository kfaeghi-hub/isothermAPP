import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { PROJECT_TYPES, formatDate } from '../lib/projectTypes'
import { Modal } from '../components/ui/Modal'
import { IssuesLogPage } from './IssuesLogPage'
import { CxIndexPage } from './CxIndexPage'
import { EquipmentPage } from './EquipmentPage'
import { SiteReportsPage } from './SiteReportsPage'
import type {
  ProjectWithClient, ProjectPhase, Company, ContactWithCompany, ProjectType, TradeType,
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
  project_type: ProjectType
  notes: string
}

type Tab = 'overview' | 'issues' | 'cx_index' | 'equipment' | 'site_reports' | 'deliverables'

const TABS: { id: Tab; label: string; built: boolean }[] = [
  { id: 'overview',     label: 'Overview',     built: true  },
  { id: 'issues',       label: 'Issues Log',   built: true  },
  { id: 'cx_index',     label: 'Cx Index',     built: true  },
  { id: 'equipment',    label: 'Equipment',    built: true  },
  { id: 'site_reports', label: 'Site Reports', built: true  },
  { id: 'deliverables', label: 'Deliverables', built: false },
]

const TYPE_ENTRIES = Object.entries(PROJECT_TYPES) as [ProjectType, typeof PROJECT_TYPES[ProjectType]][]

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
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Edit project modal
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({ name: '', com_number: '', address: '', client_company_id: '', project_type: 'standard', notes: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

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
    if (pRes.error)  { setError(pRes.error.message);  setLoading(false); return }
    setProject(pRes.data as ProjectWithClient)
    setPhases((phRes.data ?? []) as ProjectPhase[])
    setDistribution((dRes.data ?? []) as DistributionRow[])
    setAllContacts((ctRes.data ?? []) as ContactWithCompany[])
    setAllTrades((tRes.data ?? []) as TradeType[])
    setProjectTradeIds((ptRes.data ?? []).map(r => r.trade_type_id))
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Edit project ────────────────────────────────────────────────────────

  function openEdit() {
    if (!project) return
    setEditForm({
      name: project.name,
      com_number: project.com_number ?? '',
      address: project.address ?? '',
      client_company_id: project.client_company_id ?? '',
      project_type: project.project_type,
      notes: project.notes ?? '',
    })
    setEditTradeIds([...projectTradeIds])
    setAddingTrade(false)
    setNewTradeName('')
    setEditError(null)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editForm.name.trim()) { setEditError('Project name is required.'); return }
    setSavingEdit(true)
    const { error } = await supabase
      .from('projects')
      .update({
        name: editForm.name.trim(),
        com_number: editForm.com_number.trim() || null,
        address: editForm.address.trim() || null,
        client_company_id: editForm.client_company_id || null,
        project_type: editForm.project_type,
        notes: editForm.notes.trim() || null,
      })
      .eq('id', projectId)
    if (error) { setSavingEdit(false); setEditError(error.message); return }

    // Sync project_trades: replace all with current selection
    await supabase.from('project_trades').delete().eq('project_id', projectId)
    if (editTradeIds.length > 0) {
      await supabase.from('project_trades').insert(
        editTradeIds.map(trade_type_id => ({ project_id: projectId, trade_type_id }))
      )
    }

    setSavingEdit(false)
    setEditOpen(false)
    fetchAll()
  }

  async function addNewTradeEdit() {
    const name = newTradeName.trim()
    if (!name) return
    const maxOrder = allTrades.reduce((m, t) => Math.max(m, t.sort_order), 0)
    const { data } = await supabase
      .from('trade_types')
      .insert({ name, sort_order: maxOrder + 1 })
      .select('*')
      .single()
    if (data) {
      const trade = data as TradeType
      setAllTrades(prev => [...prev, trade])
      setEditTradeIds(prev => [...prev, trade.id])
    }
    setNewTradeName('')
    setAddingTrade(false)
  }

  async function changeStatus(status: 'active' | 'completed') {
    await supabase.from('projects').update({ status }).eq('id', projectId)
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
    await supabase.from('project_phases').delete().eq('id', phaseId)
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
    await supabase.from('project_distribution').delete().eq('id', rowId)
    fetchAll()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading project…</div>
  if (error || !project) return <div className="p-8 text-sm text-red-600">{error ?? 'Project not found.'}</div>

  const type = PROJECT_TYPES[project.project_type]

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

        {/* Project identity row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 leading-tight truncate">{project.name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className={`text-[11px] font-semibold rounded px-2 py-0.5 ${type.badge}`}>
                {type.label}
              </span>
              {project.status === 'completed' && (
                <span className="text-[11px] font-semibold rounded px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Completed
                </span>
              )}
              {project.com_number && (
                <span className="font-mono text-xs text-gray-500">{project.com_number}</span>
              )}
              {project.companies && (
                <span className="text-xs text-gray-500">{project.companies.name}</span>
              )}
              {!project.companies && (
                <span className="text-xs text-gray-400 italic">Standalone</span>
              )}
              {project.address && (
                <span className="text-xs text-gray-400">{project.address}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {project.status === 'active' ? (
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
            )}
            <button
              onClick={openEdit}
              className="text-xs text-gray-500 hover:text-teal-700 border border-gray-200 hover:border-teal-400 rounded px-3 py-1.5 transition-colors"
            >
              Edit Project
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-teal-500 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              } ${!tab.built ? 'text-gray-400' : ''}`}
            >
              {tab.label}
              {!tab.built && (
                <span className="ml-1.5 text-[10px] text-gray-300 font-normal">soon</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-slate-50">

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="p-6 max-w-4xl">
            <div className="grid grid-cols-3 gap-5">

              {/* Phases */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
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
              <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-4">
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
                <div className="col-span-3 bg-white rounded-lg border border-gray-200 p-4">
                  <div className="grid grid-cols-3 gap-5">
                    <div className="col-span-2">
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

        {/* Deliverables stub */}
        {activeTab === 'deliverables' && (
          <div className="p-20 text-center">
            <div className="text-3xl mb-3 opacity-20">✅</div>
            <p className="text-sm font-medium text-gray-600 mb-1">Deliverables</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Required deliverables for <span className="font-medium">{type.label}</span> projects — IVC/PFC checklists, FPT scripts, OPR, BOD, and more.
            </p>
          </div>
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
              <select
                value={editForm.client_company_id}
                onChange={e => setEditForm(f => ({ ...f, client_company_id: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Standalone / No Client</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Project Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_ENTRIES.map(([value, info]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, project_type: value }))}
                  className={`text-left p-3 rounded border-2 transition-colors ${
                    editForm.project_type === value
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-0.5 ${
                    editForm.project_type === value ? 'text-teal-700' : 'text-gray-700'
                  }`}>
                    {info.label}
                  </div>
                  <div className="text-[11px] text-gray-400 leading-snug">{info.description}</div>
                </button>
              ))}
            </div>
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

          {/* Trades in Scope */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Trades in Scope
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allTrades.map(t => (
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
                  {t.name}
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
                    placeholder="Trade name…"
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
                  + Add trade
                </button>
              )}
            </div>
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
