import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { PROJECT_TYPES, formatDate } from '../lib/projectTypes'
import {
  fetchClassificationConfig, validateRequired, deriveLegacyProjectType,
  composeDeliverableTemplateIds, allSelectedOptionIds,
  type ClassificationSelections, type ClassificationConfig,
} from '../lib/classifications'
import { Modal } from '../components/ui/Modal'
import { ClassificationPicker } from '../components/ClassificationPicker'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { ProjectWithClient, Company, ProjectType, TradeType } from '../types/database'

// Legacy type filter/badge still read PROJECT_TYPES until step 3 replaces them.
const TYPE_ENTRIES = Object.entries(PROJECT_TYPES) as [ProjectType, typeof PROJECT_TYPES[ProjectType]][]

// ── Types ──────────────────────────────────────────────────────────────────

interface ProjectForm {
  name: string
  com_number: string
  address: string
  client_company_id: string
  notes: string
  phases: string[]
  phaseInput: string
  classifications: ClassificationSelections
}

const EMPTY_FORM: ProjectForm = {
  name: '',
  com_number: '',
  address: '',
  client_company_id: '',
  notes: '',
  phases: [],
  phaseInput: '',
  classifications: {},
}

type Section = 'active' | 'completed'

// ── Component ──────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithClient[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [dimErrors, setDimErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Classification config (dimensions + options are firm-level runtime data)
  const [classConfig, setClassConfig] = useState<ClassificationConfig>({ dimensions: [], options: [] })

  // Trade selection for new project
  const [allTrades, setAllTrades]           = useState<TradeType[]>([])
  const [selectedTradeIds, setSelectedTradeIds] = useState<string[]>([])
  const [addingTrade, setAddingTrade]       = useState(false)
  const [newTradeName, setNewTradeName]     = useState('')

  // Section + filters
  const [section, setSection] = useState<Section>('active')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ProjectType | ''>('')
  const [clientFilter, setClientFilter] = useState('')

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; project: ProjectWithClient | null }>({
    open: false, project: null,
  })
  const [deleting, setDeleting] = useState(false)

  // ── Data ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [pRes, cRes, tRes, ccRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*, companies(id, name, abbreviation)')
        .order('last_visited_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('companies')
        .select('id, name, abbreviation')
        .order('name'),
      supabase
        .from('trade_types')
        .select('*')
        .order('sort_order'),
      fetchClassificationConfig(),
    ])
    if (pRes.error) { setError(pRes.error.message); setLoading(false); return }
    if (cRes.error) { setError(cRes.error.message); setLoading(false); return }
    setProjects(pRes.data as ProjectWithClient[])
    setCompanies(cRes.data as Company[])
    setAllTrades((tRes.data ?? []) as TradeType[])
    setClassConfig(ccRes)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeCount    = projects.filter(p => p.status === 'active').length
  const completedCount = projects.filter(p => p.status === 'completed').length

  // Clients that actually appear in projects (for the filter dropdown)
  const uniqueClients = [...new Map(
    projects
      .filter(p => p.client_company_id && p.companies)
      .map(p => [p.client_company_id!, { id: p.client_company_id!, name: p.companies!.name }])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  const filteredProjects = projects
    .filter(p => p.status === section)
    .filter(p => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.com_number?.toLowerCase().includes(q) ?? false) ||
        (p.companies?.name.toLowerCase().includes(q) ?? false)
      )
    })
    .filter(p => !typeFilter || p.project_type === typeFilter)
    .filter(p => !clientFilter || p.client_company_id === clientFilter)

  // ── Actions ───────────────────────────────────────────────────────────────

  async function openProject(id: string) {
    await supabase
      .from('projects')
      .update({ last_visited_at: new Date().toISOString() })
      .eq('id', id)
    setSelectedProjectId(id)
  }

  async function setProjectStatus(id: string, status: 'active' | 'completed') {
    await supabase.from('projects').update({ status }).eq('id', id)
    fetchData()
  }

  async function confirmDelete() {
    if (!deleteConfirm.project) return
    setDeleting(true)
    await supabase.from('projects').delete().eq('id', deleteConfirm.project.id)
    setDeleting(false)
    setDeleteConfirm({ open: false, project: null })
    fetchData()
  }

  async function saveProject() {
    if (!form.name.trim()) { setFormError('Project name is required.'); return }

    // Required dimensions are enforced from the RUNTIME flags, never hardcoded.
    const errors = validateRequired(classConfig.dimensions, form.classifications)
    setDimErrors(errors)
    if (Object.keys(errors).length > 0) { setFormError('Complete the required classifications.'); return }

    setSaving(true)
    setFormError(null)

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .insert({
        name: form.name.trim(),
        com_number: form.com_number.trim() || null,
        address: form.address.trim() || null,
        client_company_id: form.client_company_id || null,
        // Transition dual-write: derived legacy enum keeps a rolled-back app sane.
        // Removed with the project_type removal pass.
        project_type: deriveLegacyProjectType(form.classifications, classConfig.dimensions, classConfig.options),
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single()

    if (pErr || !project) { setFormError(pErr?.message ?? 'Insert failed.'); setSaving(false); return }

    // Classification junction rows
    const optionById = new Map(classConfig.options.map(o => [o.id, o]))
    const selectedIds = allSelectedOptionIds(form.classifications)
    if (selectedIds.length > 0) {
      const { error: clErr } = await supabase.from('project_classifications').insert(
        selectedIds.map(option_id => ({
          project_id: project.id,
          option_id,
          dimension_id: optionById.get(option_id)!.dimension_id,
        })),
      )
      if (clErr) { setFormError(`Project created, but classifications failed: ${clErr.message}`); setSaving(false); return }
    }

    if (form.phases.length > 0) {
      await supabase.from('project_phases').insert(
        form.phases.map((name, i) => ({ project_id: project.id, name, sort_order: i }))
      )
    }

    if (selectedTradeIds.length > 0) {
      await supabase.from('project_trades').insert(
        selectedTradeIds.map(trade_type_id => ({ project_id: project.id, trade_type_id }))
      )
    }

    // Deliverable composition: union of every selected option's default templates
    // into the per-project editable copy (§5.2 behaviour otherwise unchanged).
    const templateIds = await composeDeliverableTemplateIds(selectedIds)
    if (templateIds.length > 0) {
      await supabase.from('project_deliverables').insert(
        templateIds.map(template_id => ({
          project_id: project.id,
          template_id,
          status: 'not_started',
        })),
      )
    }

    setSaving(false)
    setModalOpen(false)
    setForm(EMPTY_FORM)
    setDimErrors({})
    fetchData()
  }

  function addPhase() {
    const name = form.phaseInput.trim()
    if (!name || form.phases.includes(name)) return
    setForm(f => ({ ...f, phases: [...f.phases, name], phaseInput: '' }))
  }

  async function addNewTrade() {
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
      setSelectedTradeIds(prev => [...prev, trade.id])
    }
    setNewTradeName('')
    setAddingTrade(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (selectedProjectId) {
    return (
      <ProjectDetailPage
        projectId={selectedProjectId}
        companies={companies}
        onBack={() => { setSelectedProjectId(null); fetchData() }}
      />
    )
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading projects…</div>
  if (error)   return <div className="p-8 text-sm text-red-600">Error: {error}</div>

  const hasFilters = !!search || !!typeFilter || !!clientFilter

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white px-5 flex items-stretch h-11 flex-shrink-0">

        {/* Section tabs — full-height underline style */}
        <div className="flex items-stretch mr-4">
          {(['active', 'completed'] as Section[]).map(s => {
            const count = s === 'active' ? activeCount : completedCount
            return (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`flex items-center gap-1.5 px-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  section === s
                    ? 'border-teal-500 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="capitalize">{s}</span>
                <span className={`text-[11px] font-normal tabular-nums px-1.5 py-0.5 rounded-full ${
                  section === s ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="self-center h-4 w-px bg-gray-200 mr-3" />

        {/* Search */}
        <div className="relative self-center mr-2">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, COM#, client…"
            className="w-52 pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as ProjectType | '')}
          className="self-center text-xs border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-gray-600 mr-2"
        >
          <option value="">All types</option>
          {TYPE_ENTRIES.map(([v, info]) => (
            <option key={v} value={v}>{info.label}</option>
          ))}
        </select>

        {/* Client filter — only shown when there are clients to filter by */}
        {uniqueClients.length > 0 && (
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="self-center text-xs border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white text-gray-600 mr-2"
          >
            <option value="">All clients</option>
            {uniqueClients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setClientFilter('') }}
            className="self-center text-xs text-gray-400 hover:text-gray-600 mr-2"
          >
            Clear
          </button>
        )}

        <button
          onClick={() => { setForm(EMPTY_FORM); setFormError(null); setSelectedTradeIds([]); setAddingTrade(false); setNewTradeName(''); setModalOpen(true) }}
          className="ml-auto self-center text-sm bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium whitespace-nowrap"
        >
          + New Project
        </button>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {filteredProjects.length === 0 ? (
          <div className="p-20 text-center">
            <div className="text-3xl mb-3 opacity-20">📋</div>
            {hasFilters ? (
              <p className="text-sm text-gray-400">No {section} projects match your filters.</p>
            ) : section === 'active' ? (
              <>
                <p className="text-sm text-gray-400 mb-5">No active projects yet.</p>
                <button
                  onClick={() => { setForm(EMPTY_FORM); setFormError(null); setSelectedTradeIds([]); setAddingTrade(false); setNewTradeName(''); setModalOpen(true) }}
                  className="text-sm bg-teal-700 text-white rounded px-4 py-2 hover:bg-teal-800 transition-colors font-medium"
                >
                  Create your first project
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                No completed projects yet. Use "Mark as Completed" on a project when it wraps up — it stays fully intact here.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                <th className="text-left px-5 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-32">COM #</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">Created</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-28">Last Opened</th>
                <th className="w-44" />
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => {
                const type = PROJECT_TYPES[p.project_type]
                return (
                  <tr
                    key={p.id}
                    onClick={() => openProject(p.id)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer group"
                  >
                    <td className="px-5 py-2 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">
                      {p.com_number ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {p.companies?.name ?? <span className="text-gray-400 text-xs italic">Standalone</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${type.badge}`}>
                        {type.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">
                      {p.last_visited_at ? formatDate(p.last_visited_at) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      {/* Row actions — visible on row hover, clicks don't open the project */}
                      <div
                        className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => e.stopPropagation()}
                      >
                        {p.status === 'active' ? (
                          <button
                            onClick={() => setProjectStatus(p.id, 'completed')}
                            className="text-xs text-gray-400 hover:text-teal-700 whitespace-nowrap"
                          >
                            Mark complete
                          </button>
                        ) : (
                          <button
                            onClick={() => setProjectStatus(p.id, 'active')}
                            className="text-xs text-gray-400 hover:text-teal-700 whitespace-nowrap"
                          >
                            Reopen
                          </button>
                        )}
                        <span className="text-gray-200 text-xs select-none">|</span>
                        <button
                          onClick={() => setDeleteConfirm({ open: true, project: p })}
                          className="text-xs text-gray-400 hover:text-red-600 whitespace-nowrap"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Project modal ──────────────────────────────────────────── */}
      <Modal title="New Project" open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="lg">
        <div className="space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Project Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="e.g. Seneca Health & Wellness"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">COM #</label>
              <input
                type="text"
                value={form.com_number}
                onChange={e => setForm(f => ({ ...f, com_number: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="e.g. COM-2024-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="e.g. 1750 Finch Ave E, Toronto ON"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Client</label>
              <select
                value={form.client_company_id}
                onChange={e => setForm(f => ({ ...f, client_company_id: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="">Standalone / No Client</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Classification dimensions — rendered dynamically from runtime config */}
          <ClassificationPicker
            dimensions={classConfig.dimensions}
            options={classConfig.options}
            value={form.classifications}
            errors={dimErrors}
            onChange={(dimensionId, optionIds) => {
              setForm(f => ({ ...f, classifications: { ...f.classifications, [dimensionId]: optionIds } }))
              setDimErrors(e => { const { [dimensionId]: _gone, ...rest } = e; return rest })
            }}
          />

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Phases
              <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
            </label>
            {form.phases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.phases.map((ph, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs rounded px-2 py-0.5">
                    {ph}
                    <button
                      onClick={() => setForm(f => ({ ...f, phases: f.phases.filter((_, j) => j !== i) }))}
                      className="text-slate-400 hover:text-red-500 leading-none font-bold ml-0.5"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={form.phaseInput}
                onChange={e => setForm(f => ({ ...f, phaseInput: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhase() } }}
                placeholder="e.g. Phase 1 — Mechanical"
                className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
              <button
                onClick={addPhase}
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Trades in Scope */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Trades in Scope
              <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allTrades.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTradeIds(prev =>
                    prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                  )}
                  className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                    selectedTradeIds.includes(t.id)
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
                      if (e.key === 'Enter') { e.preventDefault(); addNewTrade() }
                      if (e.key === 'Escape') { setAddingTrade(false); setNewTradeName('') }
                    }}
                    placeholder="Trade name…"
                    className="text-xs border border-teal-300 rounded-full px-3 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    autoFocus
                  />
                  <button onClick={addNewTrade} className="text-teal-700 text-sm font-medium leading-none">✓</button>
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

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={saveProject}
              disabled={saving}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      <Modal
        title="Delete Project"
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, project: null })}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Permanently delete <span className="font-semibold">{deleteConfirm.project?.name}</span>?
          </p>
          <p className="text-xs text-gray-500 leading-relaxed">
            All findings, Cx Index data, site reports, phases, distribution, and related records will be permanently removed. This cannot be undone.
          </p>
          <p className="text-[11px] text-amber-600 bg-amber-50 rounded px-3 py-2">
            To keep the project on record, use <strong>Mark as Completed</strong> instead — completed projects are fully intact and can be reopened at any time.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setDeleteConfirm({ open: false, project: null })}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
            >
              {deleting ? 'Deleting…' : 'Delete Project'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
