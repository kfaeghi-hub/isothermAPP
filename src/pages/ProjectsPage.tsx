import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { PROJECT_TYPES, formatDate } from '../lib/projectTypes'
import { Modal } from '../components/ui/Modal'
import { ProjectDetailPage } from './ProjectDetailPage'
import type { ProjectWithClient, Company, ProjectType } from '../types/database'

// ── Form state ─────────────────────────────────────────────────────────────

interface ProjectForm {
  name: string
  com_number: string
  address: string
  client_company_id: string
  project_type: ProjectType
  notes: string
  phases: string[]
  phaseInput: string
}

const EMPTY_FORM: ProjectForm = {
  name: '',
  com_number: '',
  address: '',
  client_company_id: '',
  project_type: 'standard',
  notes: '',
  phases: [],
  phaseInput: '',
}

const TYPE_ENTRIES = Object.entries(PROJECT_TYPES) as [ProjectType, typeof PROJECT_TYPES[ProjectType]][]

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
  const [saving, setSaving] = useState(false)

  // ── Data ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [pRes, cRes] = await Promise.all([
      supabase
        .from('projects')
        .select('*, companies(id, name, abbreviation)')
        .order('last_visited_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('companies')
        .select('id, name, abbreviation')
        .order('name'),
    ])
    if (pRes.error) { setError(pRes.error.message); setLoading(false); return }
    if (cRes.error) { setError(cRes.error.message); setLoading(false); return }
    setProjects(pRes.data as ProjectWithClient[])
    setCompanies(cRes.data as Company[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function openProject(id: string) {
    await supabase
      .from('projects')
      .update({ last_visited_at: new Date().toISOString() })
      .eq('id', id)
    setSelectedProjectId(id)
  }

  async function saveProject() {
    if (!form.name.trim()) { setFormError('Project name is required.'); return }
    setSaving(true)
    setFormError(null)

    // 1. Insert project
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .insert({
        name: form.name.trim(),
        com_number: form.com_number.trim() || null,
        address: form.address.trim() || null,
        client_company_id: form.client_company_id || null,
        project_type: form.project_type,
        notes: form.notes.trim() || null,
      })
      .select('id')
      .single()

    if (pErr || !project) { setFormError(pErr?.message ?? 'Insert failed.'); setSaving(false); return }

    // 2. Phases
    if (form.phases.length > 0) {
      await supabase.from('project_phases').insert(
        form.phases.map((name, i) => ({ project_id: project.id, name, sort_order: i }))
      )
    }

    // 3. Copy the Standard Comprehensive Cx Index defaults to this project
    const { data: cxDefault } = await supabase
      .from('cx_index_defaults')
      .select('id')
      .limit(1)
      .single()

    if (cxDefault) {
      // Fetch all groups and all columns in 2 queries, then batch-insert
      const [{ data: groups }, { data: allCols }] = await Promise.all([
        supabase
          .from('cx_index_default_groups')
          .select('id, name, discipline, sort_order')
          .eq('default_id', cxDefault.id)
          .order('sort_order'),
        supabase
          .from('cx_index_default_columns')
          .select('id, group_id, name, sort_order')
          .order('sort_order'),
      ])

      if (groups && groups.length > 0) {
        const { data: newGroups } = await supabase
          .from('project_cx_groups')
          .insert(groups.map(g => ({
            project_id: project.id,
            source_group_id: g.id,
            name: g.name,
            discipline: g.discipline,
            sort_order: g.sort_order,
          })))
          .select('id, source_group_id')

        if (newGroups && allCols && allCols.length > 0) {
          // Map default group id → new project group id
          const groupMap: Record<string, string> = {}
          for (const ng of newGroups) groupMap[ng.source_group_id] = ng.id

          const colsToInsert = allCols
            .filter(c => groupMap[c.group_id])
            .map(c => ({
              group_id: groupMap[c.group_id],
              source_column_id: c.id,
              name: c.name,
              sort_order: c.sort_order,
            }))

          if (colsToInsert.length > 0) {
            await supabase.from('project_cx_columns').insert(colsToInsert)
          }
        }
      }
    }

    // 4. Auto-load deliverables from template pool (no-op until Phase 2 populates the pool)
    const { data: templateDefaults } = await supabase
      .from('project_type_template_defaults')
      .select('template_id')
      .eq('project_type', form.project_type)

    if (templateDefaults && templateDefaults.length > 0) {
      await supabase.from('project_deliverables').insert(
        templateDefaults.map(d => ({
          project_id: project.id,
          template_id: d.template_id,
          status: 'not_started',
        }))
      )
    }

    setSaving(false)
    setModalOpen(false)
    setForm(EMPTY_FORM)
    fetchData()
  }

  function addPhase() {
    const name = form.phaseInput.trim()
    if (!name || form.phases.includes(name)) return
    setForm(f => ({ ...f, phases: [...f.phases, name], phaseInput: '' }))
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

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Toolbar */}
      <div className="border-b border-gray-200 bg-white px-5 py-2.5 flex items-center flex-shrink-0">
        <span className="text-xs text-gray-400">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => { setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }}
          className="ml-auto text-sm bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium"
        >
          + New Project
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {projects.length === 0 ? (
          <div className="p-20 text-center">
            <div className="text-3xl mb-3 opacity-20">📋</div>
            <p className="text-sm text-gray-400 mb-5">No projects yet.</p>
            <button
              onClick={() => { setForm(EMPTY_FORM); setFormError(null); setModalOpen(true) }}
              className="text-sm bg-teal-700 text-white rounded px-4 py-2 hover:bg-teal-800 transition-colors font-medium"
            >
              Create your first project
            </button>
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
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const type = PROJECT_TYPES[p.project_type]
                return (
                  <tr
                    key={p.id}
                    onClick={() => openProject(p.id)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-5 py-2.5 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {p.com_number ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {p.companies?.name ?? <span className="text-gray-400 text-xs italic">Standalone</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${type.badge}`}>
                        {type.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                      {p.last_visited_at ? formatDate(p.last_visited_at) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create Project modal ──────────────────────────── */}
      <Modal title="New Project" open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="lg">
        <div className="space-y-5">

          {/* Name + COM# */}
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

          {/* Address + Client */}
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

          {/* Project Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Project Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_ENTRIES.map(([value, info]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, project_type: value }))}
                  className={`text-left p-3 rounded border-2 transition-colors ${
                    form.project_type === value
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-0.5 ${
                    form.project_type === value ? 'text-teal-700' : 'text-gray-700'
                  }`}>
                    {info.label}
                  </div>
                  <div className="text-[11px] text-gray-400 leading-snug">{info.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Phases */}
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

          {/* Notes */}
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
    </div>
  )
}
