import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/ui/Modal'
import type {
  ChecklistTemplate,
  ChecklistTemplateSection,
  ChecklistTemplateItem,
  ChecklistTemplateGrid,
  ChecklistTemplateSignoff,
  ChecklistType,
  GridDefinition,
  GridColumn,
  GridRow,
} from '../types/database'

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const TYPE_LABELS: Record<ChecklistType, string> = { ivc: 'IVC', pfc: 'PFC', fpt: 'FPT' }
const TYPE_COLORS: Record<ChecklistType, string> = {
  ivc: 'bg-blue-50 text-blue-700',
  pfc: 'bg-violet-50 text-violet-700',
  fpt: 'bg-orange-50 text-orange-700',
}

function TypeBadge({ type }: { type: ChecklistType }) {
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 flex-shrink-0 ${TYPE_COLORS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

// ── Grid definition editor ─────────────────────────────────────────────────

function GridDefEditor({
  value,
  onChange,
}: {
  value: GridDefinition
  onChange: (d: GridDefinition) => void
}) {
  function addColumn() {
    const label = `Column ${value.columns.length + 1}`
    onChange({ ...value, columns: [...value.columns, { key: slugify(label), label, unit: null }] })
  }
  function updateColumn(i: number, patch: Partial<GridColumn>) {
    const columns = value.columns.map((c, ci) => {
      if (ci !== i) return c
      const updated = { ...c, ...patch }
      if (patch.label !== undefined) updated.key = slugify(patch.label)
      return updated
    })
    onChange({ ...value, columns })
  }
  function removeColumn(i: number) {
    onChange({ ...value, columns: value.columns.filter((_, ci) => ci !== i) })
  }
  function addRow() {
    const label = `Row ${value.rows.length + 1}`
    onChange({ ...value, rows: [...value.rows, { key: slugify(label), label }] })
  }
  function updateRow(i: number, patch: Partial<GridRow>) {
    const rows = value.rows.map((r, ri) => {
      if (ri !== i) return r
      const updated = { ...r, ...patch }
      if (patch.label !== undefined) updated.key = slugify(patch.label)
      return updated
    })
    onChange({ ...value, rows })
  }
  function removeRow(i: number) {
    onChange({ ...value, rows: value.rows.filter((_, ri) => ri !== i) })
  }

  return (
    <div className="space-y-4">
      {/* Columns */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Columns</span>
          <button onClick={addColumn} className="text-[11px] text-teal-600 hover:text-teal-800 font-medium">
            + Add Column
          </button>
        </div>
        {value.columns.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No columns yet.</p>
        ) : (
          <div className="space-y-1.5">
            {value.columns.map((col, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={col.label}
                  onChange={e => updateColumn(i, { label: e.target.value })}
                  placeholder="Label"
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <input
                  value={col.unit ?? ''}
                  onChange={e => updateColumn(i, { unit: e.target.value || null })}
                  placeholder="Unit"
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <span className="text-[10px] font-mono text-gray-400 w-20 truncate">{col.key}</span>
                <button onClick={() => removeColumn(i)} className="text-gray-300 hover:text-red-500 text-sm leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Rows */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rows</span>
          <button onClick={addRow} className="text-[11px] text-teal-600 hover:text-teal-800 font-medium">
            + Add Row
          </button>
        </div>
        {value.rows.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No rows yet.</p>
        ) : (
          <div className="space-y-1.5">
            {value.rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.label}
                  onChange={e => updateRow(i, { label: e.target.value })}
                  placeholder="Row label"
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <span className="text-[10px] font-mono text-gray-400 w-20 truncate">{row.key}</span>
                <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-500 text-sm leading-none">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form types ─────────────────────────────────────────────────────────────

interface TemplateForm {
  name: string
  type: ChecklistType
  equipment_type: string
  description: string
  revision_label: string
}

const EMPTY_TEMPLATE: TemplateForm = { name: '', type: 'ivc', equipment_type: '', description: '', revision_label: '' }

interface SectionForm { title: string }
const EMPTY_SECTION: SectionForm = { title: '' }

interface ItemForm {
  label: string
  hint: string
  status_type: 'yn_nr_na' | 'pass_yn'
  creates_finding: boolean
  expected_response: string
  suggested_category: string
}
const EMPTY_ITEM: ItemForm = {
  label: '', hint: '', status_type: 'yn_nr_na',
  creates_finding: true, expected_response: '', suggested_category: '',
}

interface GridForm { title: string; definition: GridDefinition }
const EMPTY_GRID: GridForm = { title: '', definition: { columns: [], rows: [] } }

interface SignoffForm { role_label: string }
const EMPTY_SIGNOFF: SignoffForm = { role_label: '' }

// ── Confirm delete state ────────────────────────────────────────────────────

type DeleteTarget =
  | { kind: 'template'; id: string; name: string }
  | { kind: 'section';  id: string; name: string }
  | { kind: 'item';     id: string; name: string }
  | { kind: 'grid';     id: string; name: string }
  | { kind: 'signoff';  id: string; name: string }

// ── Main component ──────────────────────────────────────────────────────────

export function TemplatesPage() {
  const { profile } = useAuth()
  const canEdit = ['admin', 'developer', 'owner'].includes(profile?.role ?? '')

  // List state
  const [templates, setTemplates]     = useState<ChecklistTemplate[]>([])
  const [filter, setFilter]           = useState<'all' | ChecklistType>('all')
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId]   = useState<string | null>(null)

  // Detail state
  const [sections,  setSections]  = useState<ChecklistTemplateSection[]>([])
  const [items,     setItems]     = useState<ChecklistTemplateItem[]>([])
  const [grids,     setGrids]     = useState<ChecklistTemplateGrid[]>([])
  const [signoffs,  setSignoffs]  = useState<ChecklistTemplateSignoff[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Expanded sections in detail view
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Create template modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<TemplateForm>(EMPTY_TEMPLATE)
  const [creating, setCreating]     = useState(false)

  // Edit template meta modal
  const [editOpen, setEditOpen]   = useState(false)
  const [editForm, setEditForm]   = useState<TemplateForm>(EMPTY_TEMPLATE)
  const [saving, setSaving]       = useState(false)

  // Section modals
  const [sectionModal, setSectionModal] = useState<{
    mode: 'create' | 'edit'; open: boolean; form: SectionForm; editId?: string
  }>({ mode: 'create', open: false, form: EMPTY_SECTION })

  // Item modals
  const [itemModal, setItemModal] = useState<{
    mode: 'create' | 'edit'; open: boolean; form: ItemForm;
    sectionId?: string; editId?: string
  }>({ mode: 'create', open: false, form: EMPTY_ITEM })

  // Grid modals
  const [gridModal, setGridModal] = useState<{
    mode: 'create' | 'edit'; open: boolean; form: GridForm;
    sectionId?: string; editId?: string
  }>({ mode: 'create', open: false, form: EMPTY_GRID })

  // Signoff modals
  const [signoffModal, setSignoffModal] = useState<{
    mode: 'create' | 'edit'; open: boolean; form: SignoffForm; editId?: string
  }>({ mode: 'create', open: false, form: EMPTY_SIGNOFF })

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const [modalSaving, setModalSaving]     = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setLoadingList(true)
    const { data } = await supabase
      .from('checklist_templates')
      .select('*')
      .order('type').order('name')
    setTemplates((data ?? []) as ChecklistTemplate[])
    setLoadingList(false)
  }, [])

  const fetchDetail = useCallback(async (templateId: string) => {
    setLoadingDetail(true)
    const [sRes, soRes] = await Promise.all([
      supabase.from('checklist_template_sections').select('*')
        .eq('template_id', templateId).order('sort_order'),
      supabase.from('checklist_template_signoffs').select('*')
        .eq('template_id', templateId).order('sort_order'),
    ])
    const fetchedSections = (sRes.data ?? []) as ChecklistTemplateSection[]
    setSections(fetchedSections)
    setSignoffs((soRes.data ?? []) as ChecklistTemplateSignoff[])
    setExpandedSections(new Set(fetchedSections.map(s => s.id)))

    if (fetchedSections.length > 0) {
      const sectionIds = fetchedSections.map(s => s.id)
      const [iRes, gRes] = await Promise.all([
        supabase.from('checklist_template_items').select('*')
          .in('section_id', sectionIds).order('sort_order'),
        supabase.from('checklist_template_grids').select('*')
          .in('section_id', sectionIds).order('sort_order'),
      ])
      setItems((iRes.data ?? []) as ChecklistTemplateItem[])
      setGrids((gRes.data ?? []) as ChecklistTemplateGrid[])
    } else {
      setItems([])
      setGrids([])
    }
    setLoadingDetail(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else { setSections([]); setItems([]); setGrids([]); setSignoffs([]) }
  }, [selectedId, fetchDetail])

  // ── Derived ────────────────────────────────────────────────────────────

  const filteredTemplates = templates.filter(t => filter === 'all' || t.type === filter)
  const selectedTemplate  = templates.find(t => t.id === selectedId) ?? null

  // ── Template CRUD ──────────────────────────────────────────────────────

  async function createTemplate() {
    if (!createForm.name.trim()) return
    setCreating(true)
    const { data } = await supabase
      .from('checklist_templates')
      .insert({
        name: createForm.name.trim(),
        type: createForm.type,
        equipment_type: createForm.equipment_type.trim() || null,
        description: createForm.description.trim() || null,
        revision_label: createForm.revision_label.trim() || null,
      })
      .select('*')
      .single()
    setCreating(false)
    if (data) {
      setCreateOpen(false)
      setCreateForm(EMPTY_TEMPLATE)
      await fetchTemplates()
      setSelectedId(data.id)
    }
  }

  function openEditTemplate() {
    if (!selectedTemplate) return
    setEditForm({
      name: selectedTemplate.name,
      type: selectedTemplate.type,
      equipment_type: selectedTemplate.equipment_type ?? '',
      description: selectedTemplate.description ?? '',
      revision_label: selectedTemplate.revision_label ?? '',
    })
    setEditOpen(true)
  }

  async function saveEditTemplate() {
    if (!selectedId || !editForm.name.trim()) return
    setSaving(true)
    await supabase.from('checklist_templates').update({
      name: editForm.name.trim(),
      type: editForm.type,
      equipment_type: editForm.equipment_type.trim() || null,
      description: editForm.description.trim() || null,
      revision_label: editForm.revision_label.trim() || null,
    }).eq('id', selectedId)
    setSaving(false)
    setEditOpen(false)
    await fetchTemplates()
  }

  async function toggleActive() {
    if (!selectedTemplate) return
    await supabase.from('checklist_templates')
      .update({ active: !selectedTemplate.active })
      .eq('id', selectedTemplate.id)
    await fetchTemplates()
  }

  // ── Generic delete ─────────────────────────────────────────────────────

  async function executeDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    const { kind, id } = confirmDelete
    if (kind === 'template') {
      await supabase.from('checklist_templates').delete().eq('id', id)
      setSelectedId(null)
      await fetchTemplates()
    } else if (kind === 'section') {
      await supabase.from('checklist_template_sections').delete().eq('id', id)
      if (selectedId) fetchDetail(selectedId)
    } else if (kind === 'item') {
      await supabase.from('checklist_template_items').delete().eq('id', id)
      if (selectedId) fetchDetail(selectedId)
    } else if (kind === 'grid') {
      await supabase.from('checklist_template_grids').delete().eq('id', id)
      if (selectedId) fetchDetail(selectedId)
    } else if (kind === 'signoff') {
      await supabase.from('checklist_template_signoffs').delete().eq('id', id)
      if (selectedId) fetchDetail(selectedId)
    }
    setDeleting(false)
    setConfirmDelete(null)
  }

  // ── Section CRUD ───────────────────────────────────────────────────────

  function openCreateSection() {
    setSectionModal({ mode: 'create', open: true, form: EMPTY_SECTION })
  }
  function openEditSection(s: ChecklistTemplateSection) {
    setSectionModal({ mode: 'edit', open: true, form: { title: s.title }, editId: s.id })
  }

  async function saveSection() {
    if (!sectionModal.form.title.trim() || !selectedId) return
    setModalSaving(true)
    if (sectionModal.mode === 'create') {
      const nextOrder = sections.length > 0 ? Math.max(...sections.map(s => s.sort_order)) + 10 : 0
      await supabase.from('checklist_template_sections').insert({
        template_id: selectedId,
        title: sectionModal.form.title.trim(),
        sort_order: nextOrder,
      })
    } else {
      await supabase.from('checklist_template_sections')
        .update({ title: sectionModal.form.title.trim() })
        .eq('id', sectionModal.editId!)
    }
    setModalSaving(false)
    setSectionModal(m => ({ ...m, open: false }))
    fetchDetail(selectedId)
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────

  function openCreateItem(sectionId: string) {
    setItemModal({ mode: 'create', open: true, form: EMPTY_ITEM, sectionId })
  }
  function openEditItem(item: ChecklistTemplateItem) {
    setItemModal({
      mode: 'edit', open: true, editId: item.id,
      form: {
        label: item.label,
        hint: item.hint ?? '',
        status_type: item.status_type,
        creates_finding: item.creates_finding,
        expected_response: item.expected_response ?? '',
        suggested_category: item.suggested_category ?? '',
      },
    })
  }

  async function saveItem() {
    if (!itemModal.form.label.trim() || !selectedId) return
    setModalSaving(true)
    const payload = {
      label: itemModal.form.label.trim(),
      hint: itemModal.form.hint.trim() || null,
      status_type: itemModal.form.status_type,
      creates_finding: itemModal.form.creates_finding,
      expected_response: itemModal.form.expected_response.trim() || null,
      suggested_category: itemModal.form.suggested_category.trim() || null,
    }
    if (itemModal.mode === 'create') {
      const sectionItems = items.filter(i => i.section_id === itemModal.sectionId)
      const nextOrder = sectionItems.length > 0 ? Math.max(...sectionItems.map(i => i.sort_order)) + 10 : 0
      await supabase.from('checklist_template_items').insert({
        ...payload, section_id: itemModal.sectionId!, sort_order: nextOrder,
      })
    } else {
      await supabase.from('checklist_template_items').update(payload).eq('id', itemModal.editId!)
    }
    setModalSaving(false)
    setItemModal(m => ({ ...m, open: false }))
    fetchDetail(selectedId)
  }

  // ── Grid CRUD ──────────────────────────────────────────────────────────

  function openCreateGrid(sectionId: string) {
    setGridModal({ mode: 'create', open: true, form: EMPTY_GRID, sectionId })
  }
  function openEditGrid(grid: ChecklistTemplateGrid) {
    setGridModal({
      mode: 'edit', open: true, editId: grid.id,
      form: { title: grid.title, definition: grid.definition },
    })
  }

  async function saveGrid() {
    if (!gridModal.form.title.trim() || !selectedId) return
    setModalSaving(true)
    const payload = {
      title: gridModal.form.title.trim(),
      definition: gridModal.form.definition,
    }
    if (gridModal.mode === 'create') {
      const sectionGrids = grids.filter(g => g.section_id === gridModal.sectionId)
      const nextOrder = sectionGrids.length > 0 ? Math.max(...sectionGrids.map(g => g.sort_order)) + 10 : 0
      await supabase.from('checklist_template_grids').insert({
        ...payload, section_id: gridModal.sectionId!, sort_order: nextOrder,
      })
    } else {
      await supabase.from('checklist_template_grids').update(payload).eq('id', gridModal.editId!)
    }
    setModalSaving(false)
    setGridModal(m => ({ ...m, open: false }))
    fetchDetail(selectedId)
  }

  // ── Signoff CRUD ───────────────────────────────────────────────────────

  function openCreateSignoff() {
    setSignoffModal({ mode: 'create', open: true, form: EMPTY_SIGNOFF })
  }
  function openEditSignoff(s: ChecklistTemplateSignoff) {
    setSignoffModal({ mode: 'edit', open: true, form: { role_label: s.role_label }, editId: s.id })
  }

  async function saveSignoff() {
    if (!signoffModal.form.role_label.trim() || !selectedId) return
    setModalSaving(true)
    if (signoffModal.mode === 'create') {
      const nextOrder = signoffs.length > 0 ? Math.max(...signoffs.map(s => s.sort_order)) + 10 : 0
      await supabase.from('checklist_template_signoffs').insert({
        template_id: selectedId,
        role_label: signoffModal.form.role_label.trim(),
        sort_order: nextOrder,
      })
    } else {
      await supabase.from('checklist_template_signoffs')
        .update({ role_label: signoffModal.form.role_label.trim() })
        .eq('id', signoffModal.editId!)
    }
    setModalSaving(false)
    setSignoffModal(m => ({ ...m, open: false }))
    fetchDetail(selectedId)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const narrow = !!selectedId

  return (
    <div className="flex h-full overflow-hidden rise">

      {/* ── Template list ──────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-gray-200 flex-shrink-0 transition-all ${narrow ? 'w-72' : 'flex-1'}`}>

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-1">
            {(['all', 'ivc', 'pfc', 'fpt'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors capitalize ${
                  filter === f
                    ? 'bg-slate-100 text-slate-700 font-semibold'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {f === 'all' ? `All (${templates.length})` : f.toUpperCase()}
              </button>
            ))}
          </div>
          {canEdit && (
            <button
              onClick={() => { setCreateForm(EMPTY_TEMPLATE); setCreateOpen(true) }}
              className="ml-auto text-xs bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium whitespace-nowrap flex-shrink-0"
            >
              + New Template
            </button>
          )}
        </div>

        {/* Template rows */}
        <div className="flex-1 overflow-auto">
          {loadingList ? (
            <div className="p-8 text-sm text-gray-400 text-center">Loading templates…</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-3xl mb-3 opacity-20">🗂️</div>
              <p className="text-sm font-medium text-gray-600 mb-1">No templates yet</p>
              {canEdit && (
                <p className="text-xs text-gray-400 max-w-[180px] mx-auto">
                  Create firm-level IVC, PFC, and FPT templates here. They become available to all projects.
                </p>
              )}
            </div>
          ) : (
            filteredTemplates.map(t => {
              const isSelected = t.id === selectedId
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(isSelected ? null : t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors relative ${
                    isSelected ? 'bg-teal-50/40' : ''
                  } ${!t.active ? 'opacity-50' : ''}`}
                >
                  {isSelected && <div className="absolute left-0 inset-y-0 w-0.5 bg-teal-500 rounded-r" />}
                  <div className="flex items-center gap-2 mb-0.5">
                    <TypeBadge type={t.type} />
                    <span className="text-sm font-medium text-gray-800 truncate">{t.name}</span>
                    {!t.active && (
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">inactive</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    {t.equipment_type && <span>{t.equipment_type}</span>}
                    {t.revision_label && <span className="font-mono">{t.revision_label}</span>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Template detail ─────────────────────────────────────────── */}
      {selectedTemplate ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Detail header */}
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-start gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <TypeBadge type={selectedTemplate.type} />
                {!selectedTemplate.active && (
                  <span className="text-[10px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5 font-semibold">INACTIVE</span>
                )}
                {selectedTemplate.revision_label && (
                  <span className="text-[10px] font-mono text-gray-400">{selectedTemplate.revision_label}</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{selectedTemplate.name}</h3>
              {selectedTemplate.equipment_type && (
                <p className="text-xs text-gray-400 mt-0.5">{selectedTemplate.equipment_type}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={toggleActive}
                  className={`text-xs border rounded px-3 py-1.5 transition-colors ${
                    selectedTemplate.active
                      ? 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                      : 'border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-400'
                  }`}
                >
                  {selectedTemplate.active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={openEditTemplate}
                  className="text-xs border border-gray-200 rounded px-3 py-1.5 text-gray-500 hover:text-teal-700 hover:border-teal-400 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete({ kind: 'template', id: selectedTemplate.id, name: selectedTemplate.name })}
                  className="text-xs border border-red-200 rounded px-3 py-1.5 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-gray-400 hover:text-gray-700 text-lg leading-none ml-1"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Detail body */}
          <div className="flex-1 overflow-auto p-5 space-y-6">
            {loadingDetail ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <>
                {/* Description */}
                {selectedTemplate.description && (
                  <p className="text-sm text-gray-500 italic">{selectedTemplate.description}</p>
                )}

                {/* Sections */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Sections ({sections.length})
                    </h4>
                    {canEdit && (
                      <button onClick={openCreateSection} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                        + Add Section
                      </button>
                    )}
                  </div>

                  {sections.length === 0 ? (
                    <div className="rounded border-2 border-dashed border-gray-200 p-6 text-center">
                      <p className="text-sm text-gray-400">No sections yet.</p>
                      {canEdit && (
                        <button onClick={openCreateSection} className="mt-2 text-xs text-teal-600 hover:text-teal-800 font-medium">
                          + Add first section
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sections.map(section => {
                        const sectionItems = items.filter(i => i.section_id === section.id)
                        const sectionGrids = grids.filter(g => g.section_id === section.id)
                        const isExpanded   = expandedSections.has(section.id)

                        return (
                          <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
                            {/* Section header */}
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                              <button
                                onClick={() => setExpandedSections(s => {
                                  const n = new Set(s)
                                  n.has(section.id) ? n.delete(section.id) : n.add(section.id)
                                  return n
                                })}
                                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                              >
                                <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                              <span className="text-xs font-semibold text-gray-700 flex-1">{section.title}</span>
                              <span className="text-[10px] text-gray-400">
                                {sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}
                                {sectionGrids.length > 0 ? `, ${sectionGrids.length} grid${sectionGrids.length !== 1 ? 's' : ''}` : ''}
                              </span>
                              {canEdit && (
                                <div className="flex items-center gap-1 ml-1">
                                  <button
                                    onClick={() => openEditSection(section)}
                                    className="text-[11px] text-gray-400 hover:text-teal-600 px-1"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete({ kind: 'section', id: section.id, name: section.title })}
                                    className="text-[11px] text-gray-400 hover:text-red-500 px-1"
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Section content */}
                            {isExpanded && (
                              <div className="divide-y divide-gray-100">

                                {/* Items */}
                                {sectionItems.map(item => (
                                  <div key={item.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/50 group">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-[10px] font-semibold rounded px-1 py-0.5 flex-shrink-0 ${
                                          item.status_type === 'yn_nr_na'
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'bg-orange-50 text-orange-600'
                                        }`}>
                                          {item.status_type === 'yn_nr_na' ? 'Y/N' : 'P/F'}
                                        </span>
                                        <span className="text-xs text-gray-800">{item.label}</span>
                                        {!item.creates_finding && (
                                          <span className="text-[10px] text-gray-400 italic flex-shrink-0">no finding</span>
                                        )}
                                      </div>
                                      {item.hint && (
                                        <p className="text-[11px] text-gray-400 ml-8">{item.hint}</p>
                                      )}
                                      {item.expected_response && (
                                        <p className="text-[11px] text-gray-500 ml-8">
                                          <span className="text-gray-400">Expected: </span>{item.expected_response}
                                        </p>
                                      )}
                                    </div>
                                    {canEdit && (
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
                                        <button onClick={() => openEditItem(item)} className="text-[11px] text-gray-400 hover:text-teal-600">Edit</button>
                                        <button onClick={() => setConfirmDelete({ kind: 'item', id: item.id, name: item.label })} className="text-[11px] text-gray-400 hover:text-red-500">×</button>
                                      </div>
                                    )}
                                  </div>
                                ))}

                                {/* Grids */}
                                {sectionGrids.map(grid => (
                                  <div key={grid.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/50 group">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-semibold rounded px-1 py-0.5 bg-slate-100 text-slate-500 flex-shrink-0">GRID</span>
                                        <span className="text-xs text-gray-800">{grid.title}</span>
                                        <span className="text-[10px] text-gray-400">
                                          {grid.definition.columns.length} col × {grid.definition.rows.length} row
                                        </span>
                                      </div>
                                    </div>
                                    {canEdit && (
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
                                        <button onClick={() => openEditGrid(grid)} className="text-[11px] text-gray-400 hover:text-teal-600">Edit</button>
                                        <button onClick={() => setConfirmDelete({ kind: 'grid', id: grid.id, name: grid.title })} className="text-[11px] text-gray-400 hover:text-red-500">×</button>
                                      </div>
                                    )}
                                  </div>
                                ))}

                                {/* Add controls */}
                                {canEdit && (
                                  <div className="flex items-center gap-3 px-4 py-2 bg-gray-50/50">
                                    <button onClick={() => openCreateItem(section.id)} className="text-[11px] text-teal-600 hover:text-teal-800 font-medium">
                                      + Add Item
                                    </button>
                                    <button onClick={() => openCreateGrid(section.id)} className="text-[11px] text-teal-600 hover:text-teal-800 font-medium">
                                      + Add Grid
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Signoffs */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      Sign-off Blocks ({signoffs.length})
                    </h4>
                    {canEdit && (
                      <button onClick={openCreateSignoff} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                        + Add Sign-off
                      </button>
                    )}
                  </div>
                  {signoffs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No sign-off blocks defined.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {signoffs.map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2 border border-gray-200 rounded hover:bg-gray-50 group">
                          <span className="text-xs text-gray-700 flex-1">{s.role_label}</span>
                          {canEdit && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => openEditSignoff(s)} className="text-[11px] text-gray-400 hover:text-teal-600">Edit</button>
                              <button onClick={() => setConfirmDelete({ kind: 'signoff', id: s.id, name: s.role_label })} className="text-[11px] text-gray-400 hover:text-red-500">×</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Create Template modal ──────────────────────────────────── */}
      <Modal title="New Template" open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={createForm.name}
              onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Heat Pump IVC"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
              <select
                value={createForm.type}
                onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as ChecklistType }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="ivc">IVC — Installation Verification</option>
                <option value="pfc">PFC — Pre-Functional Check</option>
                <option value="fpt">FPT — Functional Performance Test</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Revision Label <span className="text-gray-400 font-normal">optional</span>
              </label>
              <input
                type="text"
                value={createForm.revision_label}
                onChange={e => setCreateForm(f => ({ ...f, revision_label: e.target.value }))}
                placeholder="v1, Rev A…"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Equipment Type <span className="text-gray-400 font-normal">optional — leave blank for system-level FPTs</span>
            </label>
            <input
              type="text"
              value={createForm.equipment_type}
              onChange={e => setCreateForm(f => ({ ...f, equipment_type: e.target.value }))}
              placeholder="e.g. heat_pump, ahu, chiller…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Description <span className="text-gray-400 font-normal">optional</span>
            </label>
            <textarea
              value={createForm.description}
              onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={createTemplate}
              disabled={creating || !createForm.name.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {creating ? 'Creating…' : 'Create Template'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Template modal ────────────────────────────────────── */}
      <Modal title="Edit Template" open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
            <input
              autoFocus type="text"
              value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
              <select
                value={editForm.type}
                onChange={e => setEditForm(f => ({ ...f, type: e.target.value as ChecklistType }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="ivc">IVC</option>
                <option value="pfc">PFC</option>
                <option value="fpt">FPT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Revision Label</label>
              <input
                type="text"
                value={editForm.revision_label}
                onChange={e => setEditForm(f => ({ ...f, revision_label: e.target.value }))}
                placeholder="v1, Rev A…"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Equipment Type</label>
            <input
              type="text"
              value={editForm.equipment_type}
              onChange={e => setEditForm(f => ({ ...f, equipment_type: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={saveEditTemplate}
              disabled={saving || !editForm.name.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Section modal ──────────────────────────────────────────── */}
      <Modal
        title={sectionModal.mode === 'create' ? 'Add Section' : 'Edit Section'}
        open={sectionModal.open}
        onClose={() => setSectionModal(m => ({ ...m, open: false }))}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
            <input
              autoFocus type="text"
              value={sectionModal.form.title}
              onChange={e => setSectionModal(m => ({ ...m, form: { title: e.target.value } }))}
              placeholder="e.g. General, Electrical, Controls…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              onKeyDown={e => { if (e.key === 'Enter') saveSection() }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setSectionModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={saveSection}
              disabled={modalSaving || !sectionModal.form.title.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {modalSaving ? 'Saving…' : sectionModal.mode === 'create' ? 'Add Section' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Item modal ─────────────────────────────────────────────── */}
      <Modal
        title={itemModal.mode === 'create' ? 'Add Line Item' : 'Edit Line Item'}
        open={itemModal.open}
        onClose={() => setItemModal(m => ({ ...m, open: false }))}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Label <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus type="text"
              value={itemModal.form.label}
              onChange={e => setItemModal(m => ({ ...m, form: { ...m.form, label: e.target.value } }))}
              placeholder="e.g. Verify unit is properly supported and level"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Response Type</label>
              <select
                value={itemModal.form.status_type}
                onChange={e => setItemModal(m => ({ ...m, form: { ...m.form, status_type: e.target.value as 'yn_nr_na' | 'pass_yn' } }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="yn_nr_na">Y / N / NR / NA (IVC/PFC)</option>
                <option value="pass_yn">Pass / Fail (FPT)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Suggested Category</label>
              <input
                type="text"
                value={itemModal.form.suggested_category}
                onChange={e => setItemModal(m => ({ ...m, form: { ...m.form, suggested_category: e.target.value } }))}
                placeholder="e.g. Mechanical"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Hint <span className="text-gray-400 font-normal">optional</span>
            </label>
            <input
              type="text"
              value={itemModal.form.hint}
              onChange={e => setItemModal(m => ({ ...m, form: { ...m.form, hint: e.target.value } }))}
              placeholder="Per spec section, reference note, or clarification…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Expected Response <span className="text-gray-400 font-normal">FPT only — what should happen</span>
            </label>
            <input
              type="text"
              value={itemModal.form.expected_response}
              onChange={e => setItemModal(m => ({ ...m, form: { ...m.form, expected_response: e.target.value } }))}
              placeholder="e.g. Fan ramps to setpoint within 30 s"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="creates_finding"
              type="checkbox"
              checked={itemModal.form.creates_finding}
              onChange={e => setItemModal(m => ({ ...m, form: { ...m.form, creates_finding: e.target.checked } }))}
              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="creates_finding" className="text-sm text-gray-700">
              Prompt to create a finding when response is N or Fail
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setItemModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={saveItem}
              disabled={modalSaving || !itemModal.form.label.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {modalSaving ? 'Saving…' : itemModal.mode === 'create' ? 'Add Item' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Grid modal ─────────────────────────────────────────────── */}
      <Modal
        title={gridModal.mode === 'create' ? 'Add Measurement Grid' : 'Edit Measurement Grid'}
        open={gridModal.open}
        onClose={() => setGridModal(m => ({ ...m, open: false }))}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Grid Title <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus type="text"
              value={gridModal.form.title}
              onChange={e => setGridModal(m => ({ ...m, form: { ...m.form, title: e.target.value } }))}
              placeholder="e.g. Voltage Measurements, Airflow Readings…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <GridDefEditor
              value={gridModal.form.definition}
              onChange={def => setGridModal(m => ({ ...m, form: { ...m.form, definition: def } }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setGridModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={saveGrid}
              disabled={modalSaving || !gridModal.form.title.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {modalSaving ? 'Saving…' : gridModal.mode === 'create' ? 'Add Grid' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Signoff modal ──────────────────────────────────────────── */}
      <Modal
        title={signoffModal.mode === 'create' ? 'Add Sign-off Block' : 'Edit Sign-off Block'}
        open={signoffModal.open}
        onClose={() => setSignoffModal(m => ({ ...m, open: false }))}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role Label</label>
            <input
              autoFocus type="text"
              value={signoffModal.form.role_label}
              onChange={e => setSignoffModal(m => ({ ...m, form: { role_label: e.target.value } }))}
              placeholder="e.g. Commissioning Authority (CxA), Mechanical Contractor…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              onKeyDown={e => { if (e.key === 'Enter') saveSignoff() }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setSignoffModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={saveSignoff}
              disabled={modalSaving || !signoffModal.form.role_label.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {modalSaving ? 'Saving…' : signoffModal.mode === 'create' ? 'Add Sign-off' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Confirm Delete modal ───────────────────────────────────── */}
      <Modal
        title={`Delete ${confirmDelete ? confirmDelete.kind.charAt(0).toUpperCase() + confirmDelete.kind.slice(1) : ''}`}
        open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        maxWidth="sm"
      >
        {confirmDelete && (
          <div className="space-y-4">
            <div className="flex gap-3 p-3 rounded-md bg-red-50 border border-red-100">
              <span className="text-red-500 mt-0.5 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-red-800">"{confirmDelete.name}"</p>
                <p className="text-xs text-red-600 mt-1">
                  {confirmDelete.kind === 'template'
                    ? 'Deletes the template and all its sections, items, grids, and sign-off blocks. Existing checklist instances are unaffected (they use snapshots).'
                    : confirmDelete.kind === 'section'
                    ? 'Deletes this section and all its items and grids.'
                    : 'This cannot be undone.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancel</button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
