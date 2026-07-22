import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type {
  Equipment, EquipmentTagGlossary, ProjectEquipmentFieldDef,
  EquipmentAttachment, NameplateExtra,
} from '../types/database'

// ── Constants ────────────────────────────────────────────────────────────────

const SECTIONS: { key: keyof NameplateExtra; label: string }[] = [
  { key: 'spec',         label: 'Spec (Design)' },
  { key: 'shop_drawing', label: 'Shop Drawing' },
  { key: 'installed',    label: 'Installed (Nameplate)' },
]

const FILE_TYPE_LABELS: Record<string, string> = {
  shop_drawing:   'Shop Drawing',
  cut_sheet:      'Cut Sheet',
  submittal:      'Submittal',
  startup_report: 'Startup Report',
  om_manual:      'O&M Manual',
  other:          'Other',
}

const DISCIPLINE_LABELS: Record<string, string> = {
  mechanical:   'Mechanical',
  controls_bas: 'Controls / BAS',
  electrical:   'Electrical',
  lighting:     'Lighting',
  fire_alarm:   'Fire Alarm',
  security:     'Security',
  data_center:  'Data Center',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface AddForm {
  kind: 'equipment' | 'system'
  tag: string
  descriptor: string
  category: string
  equipment_type: string
  location: string
  area_served: string
  discipline: string  // for glossary lookup display only
}

const EMPTY_FORM: AddForm = {
  kind: 'equipment', tag: '', descriptor: '', category: '',
  equipment_type: '', location: '', area_served: '', discipline: '',
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
}

export function EquipmentPage({ projectId }: Props) {
  const { profile } = useAuth()
  const [equipment, setEquipment]     = useState<Equipment[]>([])
  const [glossary, setGlossary]       = useState<EquipmentTagGlossary[]>([])
  const [fieldDefs, setFieldDefs]     = useState<ProjectEquipmentFieldDef[]>([])
  const [attachments, setAttachments] = useState<EquipmentAttachment[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)

  // Add modal
  const [addOpen, setAddOpen]           = useState(false)
  const [addForm, setAddForm]           = useState<AddForm>(EMPTY_FORM)
  const [tagQuery, setTagQuery]         = useState('')
  const [glossarySuggestions, setGlossarySuggestions] = useState<EquipmentTagGlossary[]>([])
  const [savingAdd, setSavingAdd]       = useState(false)

  // Edit mode (detail panel inline)
  const [editing, setEditing]           = useState(false)
  const [editValues, setEditValues]     = useState<Partial<Equipment>>({})
  const [editNameplate, setEditNameplate] = useState<NameplateExtra>({ spec: {}, shop_drawing: {}, installed: {} })
  const [savingEdit, setSavingEdit]     = useState(false)

  // Structure editor
  const [structureOpen, setStructureOpen] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editingFieldName, setEditingFieldName] = useState('')
  const [addingFieldSection, setAddingFieldSection] = useState<string | null>(null)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldUnit, setNewFieldUnit] = useState('')

  // Attachments
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFileType, setPendingFileType] = useState<EquipmentAttachment['file_type']>('shop_drawing')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchEquipment = useCallback(async () => {
    const { data } = await supabase
      .from('equipment')
      .select('*')
      .eq('project_id', projectId)
      .order('category')
      .order('sort_order')
    setEquipment((data ?? []) as Equipment[])
  }, [projectId])

  const fetchGlossary = useCallback(async () => {
    const { data } = await supabase
      .from('equipment_tag_glossary')
      .select('*')
      .order('sort_order')
    setGlossary((data ?? []) as EquipmentTagGlossary[])
  }, [])

  const fetchFieldDefs = useCallback(async () => {
    const { data } = await supabase
      .from('project_equipment_field_defs')
      .select('*')
      .eq('project_id', projectId)
      .order('section')
      .order('sort_order')
    setFieldDefs((data ?? []) as ProjectEquipmentFieldDef[])
  }, [projectId])

  const fetchAttachments = useCallback(async () => {
    const { data } = await supabase
      .from('equipment_attachments')
      .select('*')
      .eq('project_id', projectId)
      .order('uploaded_at')
    setAttachments((data ?? []) as EquipmentAttachment[])
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchEquipment(), fetchGlossary(), fetchFieldDefs(), fetchAttachments()])
      .then(() => setLoading(false))
  }, [fetchEquipment, fetchGlossary, fetchFieldDefs, fetchAttachments])

  // ── Glossary autocomplete ──────────────────────────────────────────────────

  function updateTagQuery(q: string) {
    setTagQuery(q)
    setAddForm(f => ({ ...f, tag: q }))
    if (q.length < 1) { setGlossarySuggestions([]); return }
    const upper = q.toUpperCase()
    setGlossarySuggestions(
      glossary.filter(g => g.tag.toUpperCase().startsWith(upper)).slice(0, 8)
    )
  }

  function applyGlossarySuggestion(entry: EquipmentTagGlossary) {
    setAddForm(f => ({
      ...f,
      tag:            entry.tag,
      descriptor:     f.descriptor || entry.descriptor,
      equipment_type: f.equipment_type || (entry.equipment_type ?? ''),
      category:       f.category || (entry.category_label ?? ''),
      discipline:     entry.discipline,
    }))
    setTagQuery(entry.tag)
    setGlossarySuggestions([])
  }

  // ── Add equipment ──────────────────────────────────────────────────────────

  async function saveAdd() {
    if (!addForm.tag.trim() && !addForm.descriptor.trim()) return
    setSavingAdd(true)
    const maxSort = equipment.reduce((m, e) => Math.max(m, e.sort_order), 0)
    const { data: newEquip } = await supabase
      .from('equipment')
      .insert({
        project_id:     projectId,
        kind:           addForm.kind,
        equipment_type: addForm.equipment_type.trim() || null,
        category:       addForm.category.trim() || null,
        tag:            addForm.tag.trim() || null,
        descriptor:     addForm.descriptor.trim() || null,
        location:       addForm.location.trim() || null,
        area_served:    addForm.area_served.trim() || null,
        sort_order:     maxSort + 1,
      })
      .select('id, equipment_type')
      .single()

    // Initialize field defs for this type if not yet done
    if (newEquip?.equipment_type) {
      await ensureFieldDefs(newEquip.equipment_type)
    }

    setSavingAdd(false)
    setAddOpen(false)
    setAddForm(EMPTY_FORM)
    setTagQuery('')
    setGlossarySuggestions([])
    await Promise.all([fetchEquipment(), fetchFieldDefs()])
    setSelectedId(newEquip?.id ?? null)
  }

  async function ensureFieldDefs(type: string) {
    const existing = fieldDefs.filter(f => f.equipment_type === type)
    if (existing.length > 0) return
    const { data: firmDefs } = await supabase
      .from('equipment_type_field_defs')
      .select('*')
      .eq('equipment_type', type)
      .order('sort_order')
    if (!firmDefs || firmDefs.length === 0) return
    await supabase.from('project_equipment_field_defs').insert(
      firmDefs.map((d: any) => ({
        project_id:     projectId,
        equipment_type: d.equipment_type,
        section:        d.section,
        field_name:     d.field_name,
        unit:           d.unit,
        sort_order:     d.sort_order,
      }))
    )
    await fetchFieldDefs()
  }

  // ── Delete equipment ───────────────────────────────────────────────────────

  async function deleteEquipment(id: string) {
    const eq = equipment.find(e => e.id === id)
    if (!confirm(`Delete ${eq?.tag ?? eq?.descriptor ?? 'this item'}? This also removes its Cx Index progress data and attachments.`)) return
    await supabase.from('equipment').delete().eq('id', id)
    setSelectedId(null)
    fetchEquipment()
  }

  // ── Edit equipment (inline in detail panel) ────────────────────────────────

  function startEdit(eq: Equipment) {
    setEditValues({
      kind:           eq.kind,
      equipment_type: eq.equipment_type,
      category:       eq.category,
      tag:            eq.tag,
      descriptor:     eq.descriptor,
      location:       eq.location,
      area_served:    eq.area_served,
    })
    setEditNameplate(eq.nameplate_extra ?? { spec: {}, shop_drawing: {}, installed: {} })
    setEditing(true)
  }

  async function saveEdit(eq: Equipment) {
    setSavingEdit(true)
    await supabase
      .from('equipment')
      .update({
        ...editValues,
        nameplate_extra: editNameplate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eq.id)

    // If equipment_type changed, ensure field defs exist for the new type
    if (editValues.equipment_type && editValues.equipment_type !== eq.equipment_type) {
      await ensureFieldDefs(editValues.equipment_type)
    }

    setSavingEdit(false)
    setEditing(false)
    fetchEquipment()
  }

  function setFieldValue(section: keyof NameplateExtra, field: string, value: string) {
    setEditNameplate(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }))
  }

  // ── File attachments ───────────────────────────────────────────────────────

  async function uploadAttachment(equipId: string, file: File) {
    setUploadingFile(true)
    const ext    = file.name.split('.').pop() ?? 'bin'
    const path   = `${equipId}/${Date.now()}.${ext}`
    const { data: upload } = await supabase.storage
      .from('equipment-files')
      .upload(path, file, { contentType: file.type })
    if (upload) {
      const { data: urlData } = supabase.storage.from('equipment-files').getPublicUrl(path)
      await supabase.from('equipment_attachments').insert({
        project_id:   projectId,
        equipment_id: equipId,
        filename:     file.name,
        file_type:    pendingFileType,
        storage_url:  urlData.publicUrl,
      })
      fetchAttachments()
    }
    setUploadingFile(false)
  }

  async function deleteAttachment(att: EquipmentAttachment) {
    if (!confirm(`Remove "${att.filename}"?`)) return
    await supabase.from('equipment_attachments').delete().eq('id', att.id)
    const marker = '/equipment-files/'
    const idx = att.storage_url.indexOf(marker)
    if (idx >= 0) {
      await supabase.storage.from('equipment-files').remove([att.storage_url.slice(idx + marker.length)])
    }
    fetchAttachments()
  }

  // ── Field structure editing ────────────────────────────────────────────────

  async function saveFieldName(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingFieldId(null); return }
    await supabase.from('project_equipment_field_defs').update({ field_name: trimmed }).eq('id', id)
    setFieldDefs(prev => prev.map(f => f.id === id ? { ...f, field_name: trimmed } : f))
    setEditingFieldId(null)
  }

  async function moveField(id: string, dir: 'up' | 'down', type: string, section: string) {
    const group = fieldDefs.filter(f => f.equipment_type === type && f.section === section)
    const idx = group.findIndex(f => f.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= group.length) return
    const a = group[idx], b = group[swapIdx]
    await Promise.all([
      supabase.from('project_equipment_field_defs').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('project_equipment_field_defs').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    setFieldDefs(prev => {
      const next = prev.map(f => {
        if (f.id === a.id) return { ...f, sort_order: b.sort_order }
        if (f.id === b.id) return { ...f, sort_order: a.sort_order }
        return f
      })
      return [...next].sort((x, y) => x.sort_order - y.sort_order)
    })
  }

  async function deleteField(id: string) {
    if (!confirm('Remove this field from the project template?')) return
    await supabase.from('project_equipment_field_defs').delete().eq('id', id)
    setFieldDefs(prev => prev.filter(f => f.id !== id))
  }

  async function addField(type: string, section: string) {
    const name = newFieldName.trim()
    if (!name) return
    const group = fieldDefs.filter(f => f.equipment_type === type && f.section === section)
    const maxSort = group.reduce((m, f) => Math.max(m, f.sort_order), 0)
    const { data } = await supabase
      .from('project_equipment_field_defs')
      .insert({
        project_id:     projectId,
        equipment_type: type,
        section,
        field_name:     name,
        unit:           newFieldUnit.trim() || null,
        sort_order:     maxSort + 1,
      })
      .select('*')
      .single()
    if (data) setFieldDefs(prev => [...prev, data as ProjectEquipmentFieldDef])
    setAddingFieldSection(null)
    setNewFieldName('')
    setNewFieldUnit('')
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const selected = equipment.find(e => e.id === selectedId) ?? null

  const categories = [...new Set(equipment.map(e => e.category ?? ''))].sort()

  function defsForType(type: string, section: string) {
    return fieldDefs
      .filter(f => f.equipment_type === type && f.section === section)
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  function equipAttachments(equipId: string) {
    return attachments.filter(a => a.equipment_id === equipId)
  }

  const currentType = editing ? (editValues.equipment_type ?? '') : (selected?.equipment_type ?? '')

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="flex h-full min-h-0 rise">

      {/* ── Left panel: equipment list ──────────────────────────────────── */}
      <div className={`flex flex-col border-r border-gray-200 bg-white shrink-0 ${selectedId ? 'w-72' : 'flex-1'}`}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-xs font-semibold text-gray-700 mr-auto">
            Equipment / Systems
          </span>
          <span className="text-[10px] text-gray-400 font-mono">{equipment.length}</span>
          <button
            onClick={() => { setAddOpen(true); setTagQuery(''); setGlossarySuggestions([]) }}
            className="px-2.5 py-1 text-xs bg-teal-700 text-white rounded hover:bg-teal-800"
          >
            + Add
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {equipment.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <p className="text-xs text-gray-400">No equipment yet.</p>
              <p className="text-[10px] text-gray-300 mt-1">Equipment added here automatically appears as rows in the Cx Index.</p>
            </div>
          ) : (
            categories.map(cat => {
              const items = equipment.filter(e => (e.category ?? '') === cat)
              return (
                <div key={cat || '__none__'}>
                  {cat && (
                    <div className="px-4 py-1 bg-gray-50 border-b border-gray-100 text-[9px] font-bold text-gray-500 uppercase tracking-wider sticky top-0">
                      {cat}
                    </div>
                  )}
                  {items.map(eq => (
                    <button
                      key={eq.id}
                      onClick={() => { setSelectedId(eq.id); setEditing(false) }}
                      className={`w-full text-left px-4 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedId === eq.id ? 'bg-teal-50 border-l-2 border-l-teal-600' : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-gray-800">{eq.tag}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${eq.kind === 'system' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                          {eq.kind === 'system' ? 'SYS' : 'EQ'}
                        </span>
                      </div>
                      {eq.descriptor && (
                        <div className="text-[10px] text-gray-500 truncate mt-0.5">{eq.descriptor}</div>
                      )}
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel: equipment detail ───────────────────────────────── */}
      {selected && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${selected.kind === 'system' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                      {selected.kind === 'system' ? 'SYSTEM' : 'EQUIPMENT'}
                    </span>
                    {selected.equipment_type && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-medium">
                        {selected.equipment_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    )}
                    {selected.category && (
                      <span className="text-[9px] text-gray-400">{selected.category}</span>
                    )}
                  </div>
                  {editing ? (
                    <input
                      value={editValues.tag ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, tag: e.target.value }))}
                      className="mt-1.5 font-mono text-2xl font-bold text-gray-900 w-full border-b border-teal-300 focus:outline-none bg-transparent"
                      placeholder="TAG"
                    />
                  ) : (
                    <h2 className="mt-1.5 font-mono text-2xl font-bold text-gray-900">{selected.tag}</h2>
                  )}
                  {editing ? (
                    <input
                      value={editValues.descriptor ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, descriptor: e.target.value }))}
                      className="text-sm text-gray-500 mt-0.5 w-full border-b border-gray-200 focus:outline-none bg-transparent"
                      placeholder="Descriptor"
                    />
                  ) : (
                    <p className="text-sm text-gray-500 mt-0.5">{selected.descriptor}</p>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {editing ? (
                    <>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded text-gray-500 hover:border-gray-300"
                      >Cancel</button>
                      <button
                        onClick={() => saveEdit(selected)}
                        disabled={savingEdit}
                        className="px-3 py-1.5 text-xs bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50"
                      >{savingEdit ? 'Saving…' : 'Save'}</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(selected)}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded text-gray-600 hover:border-gray-300"
                      >Edit</button>
                      {/* Equipment hard-delete: admin/dev + owner (C3) */}
                      {['admin', 'developer', 'owner'].includes(profile?.role ?? '') && (
                        <button
                          onClick={() => deleteEquipment(selected.id)}
                          className="px-3 py-1.5 text-xs border border-red-100 rounded text-red-500 hover:border-red-300 hover:bg-red-50"
                        >Delete</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-4 mt-3">
                {editing ? (
                  <>
                    <MetaField label="Category" value={editValues.category ?? ''} onChange={v => setEditValues(x => ({ ...x, category: v }))} />
                    <MetaField label="Location" value={editValues.location ?? ''} onChange={v => setEditValues(x => ({ ...x, location: v }))} />
                    <MetaField label="Area Served" value={editValues.area_served ?? ''} onChange={v => setEditValues(x => ({ ...x, area_served: v }))} />
                    <MetaField label="Type" value={editValues.equipment_type ?? ''} onChange={v => setEditValues(x => ({ ...x, equipment_type: v }))} />
                  </>
                ) : (
                  <>
                    {selected.location   && <MetaDisplay label="Location"    value={selected.location} />}
                    {selected.area_served && <MetaDisplay label="Area Served" value={selected.area_served} />}
                  </>
                )}
              </div>
            </div>

            {/* ── Field sections ────────────────────────────────────────── */}
            {currentType ? (
              <div className="divide-y divide-gray-100">
                {SECTIONS.map(({ key, label }) => {
                  const defs = defsForType(currentType, key)
                  const values = editing
                    ? editNameplate[key]
                    : (selected.nameplate_extra?.[key] ?? {})

                  return (
                    <Section
                      key={key}
                      label={label}
                      count={defs.length}
                    >
                      {defs.length === 0 ? (
                        <p className="text-[10px] text-gray-300 italic px-6 py-2">No fields defined for this section.</p>
                      ) : (
                        <div className="px-6 py-3 grid grid-cols-2 gap-x-8 gap-y-2">
                          {defs.map(def => (
                            <div key={def.id}>
                              <label className="block text-[9px] text-gray-400 uppercase tracking-wide font-semibold">
                                {def.field_name}{def.unit ? ` (${def.unit})` : ''}
                              </label>
                              {editing ? (
                                <input
                                  value={values[def.field_name] ?? ''}
                                  onChange={e => setFieldValue(key, def.field_name, e.target.value)}
                                  className="w-full text-xs border-b border-gray-200 focus:outline-none focus:border-teal-400 py-0.5 bg-transparent"
                                  placeholder="—"
                                />
                              ) : (
                                <p className="text-xs text-gray-700 font-medium">
                                  {values[def.field_name] || <span className="text-gray-300">—</span>}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  )
                })}
              </div>
            ) : (
              /* No equipment type — show basic nameplate fields */
              <div className="px-6 py-4">
                <p className="text-[10px] text-gray-400 mb-3 uppercase tracking-wide font-semibold">Nameplate Data</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  {([
                    ['Manufacturer', 'manufacturer'], ['Model', 'model'], ['Serial No.', 'serial_number'],
                    ['Voltage (V)', 'voltage'], ['Phase', 'phase'], ['Hz', 'hz'],
                    ['Amperage (A)', 'amperage'], ['Flow', 'flow'], ['Capacity', 'capacity'],
                  ] as [string, keyof Equipment][]).map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-[9px] text-gray-400 uppercase tracking-wide font-semibold">{label}</label>
                      {editing ? (
                        <input
                          value={(editValues[key] as string) ?? ''}
                          onChange={e => setEditValues(v => ({ ...v, [key]: e.target.value }))}
                          className="w-full text-xs border-b border-gray-200 focus:outline-none focus:border-teal-400 py-0.5 bg-transparent"
                          placeholder="—"
                        />
                      ) : (
                        <p className="text-xs text-gray-700 font-medium">
                          {(selected[key] as string | null) || <span className="text-gray-300">—</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {!editing && (
                  <p className="mt-4 text-[10px] text-gray-400">
                    Set an equipment type to unlock type-specific Spec / Shop Drawing / Installed sections.{' '}
                    <button onClick={() => startEdit(selected)} className="text-teal-600 underline">Edit</button>
                  </p>
                )}
              </div>
            )}

            {/* ── Attachments ───────────────────────────────────────────── */}
            <Section label="Attachments" count={equipAttachments(selected.id).length}>
              <div className="px-6 py-3 space-y-2">
                {equipAttachments(selected.id).map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium shrink-0">
                      {FILE_TYPE_LABELS[att.file_type] ?? att.file_type}
                    </span>
                    <a
                      href={att.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-teal-700 hover:text-teal-900 truncate"
                    >
                      {att.filename}
                    </a>
                    <button
                      onClick={() => deleteAttachment(att)}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                      title="Remove attachment"
                    >×</button>
                  </div>
                ))}
                {/* Upload */}
                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={pendingFileType}
                    onChange={e => setPendingFileType(e.target.value as EquipmentAttachment['file_type'])}
                    className="text-[10px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-teal-400"
                  >
                    {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="px-2.5 py-1 text-[10px] border border-gray-200 rounded text-gray-500 hover:border-gray-300 disabled:opacity-50"
                  >
                    {uploadingFile ? 'Uploading…' : '+ Attach File'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadAttachment(selected.id, file)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            </Section>

            {/* Edit Structure link */}
            {currentType && (
              <div className="px-6 py-3 border-t border-gray-100">
                <button
                  onClick={() => setStructureOpen(true)}
                  className="text-[10px] text-gray-400 hover:text-teal-700 underline"
                >
                  Edit field structure for {currentType.replace(/_/g, ' ')} on this project →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          Edit Field Structure Panel
      ══════════════════════════════════════════════════════════════════ */}
      {structureOpen && currentType && (
        <div className="fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setStructureOpen(false)} />
          <div className="relative z-50 ml-auto w-[460px] bg-white h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Field Structure</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {currentType.replace(/_/g, ' ').toUpperCase()} · this project only · firm default unchanged
                </p>
              </div>
              <button onClick={() => setStructureOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {SECTIONS.map(({ key, label }) => {
                const defs = defsForType(currentType, key)
                return (
                  <div key={key}>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                      {defs.map((def, ci) => (
                        <div key={def.id} className="flex items-center gap-1.5 px-3 py-1 hover:bg-gray-50">
                          <span className="w-4 shrink-0 text-[8px] text-gray-300 font-mono text-right">{ci + 1}</span>
                          {editingFieldId === def.id ? (
                            <input
                              autoFocus
                              value={editingFieldName}
                              onChange={e => setEditingFieldName(e.target.value)}
                              onBlur={() => saveFieldName(def.id, editingFieldName)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveFieldName(def.id, editingFieldName)
                                if (e.key === 'Escape') setEditingFieldId(null)
                              }}
                              className="flex-1 text-[10px] border border-teal-300 rounded px-1.5 py-0.5 focus:outline-none"
                            />
                          ) : (
                            <span
                              className="flex-1 text-[10px] text-gray-700 cursor-pointer hover:text-teal-700 leading-snug"
                              onClick={() => { setEditingFieldId(def.id); setEditingFieldName(def.field_name) }}
                            >
                              {def.field_name}{def.unit ? <span className="text-gray-400 ml-1">({def.unit})</span> : ''}
                            </span>
                          )}
                          <button onClick={() => moveField(def.id, 'up', currentType, key)} disabled={ci === 0} className="text-[9px] text-gray-300 hover:text-gray-600 disabled:opacity-20 px-0.5">↑</button>
                          <button onClick={() => moveField(def.id, 'down', currentType, key)} disabled={ci === defs.length - 1} className="text-[9px] text-gray-300 hover:text-gray-600 disabled:opacity-20 px-0.5">↓</button>
                          <button onClick={() => deleteField(def.id)} className="text-[9px] text-gray-300 hover:text-red-500 px-0.5">×</button>
                        </div>
                      ))}
                      {/* Inline add */}
                      {addingFieldSection === `${currentType}:${key}` ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-teal-50">
                          <input
                            autoFocus
                            value={newFieldName}
                            onChange={e => setNewFieldName(e.target.value)}
                            placeholder="Field name…"
                            onKeyDown={e => {
                              if (e.key === 'Enter') addField(currentType, key)
                              if (e.key === 'Escape') { setAddingFieldSection(null); setNewFieldName(''); setNewFieldUnit('') }
                            }}
                            className="flex-1 text-[10px] border border-teal-300 rounded px-1.5 py-0.5 focus:outline-none bg-white"
                          />
                          <input
                            value={newFieldUnit}
                            onChange={e => setNewFieldUnit(e.target.value)}
                            placeholder="unit"
                            className="w-12 text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none"
                          />
                          <button onClick={() => addField(currentType, key)} className="text-[9px] text-teal-700 font-semibold hover:text-teal-900">Add</button>
                          <button onClick={() => { setAddingFieldSection(null); setNewFieldName(''); setNewFieldUnit('') }} className="text-[9px] text-gray-400">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingFieldSection(`${currentType}:${key}`); setNewFieldName(''); setNewFieldUnit('') }}
                          className="w-full py-1.5 text-[9px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 text-left px-3"
                        >
                          + Add field
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          Add Equipment Modal
      ══════════════════════════════════════════════════════════════════ */}
      {addOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => { setAddOpen(false); setAddForm(EMPTY_FORM); setGlossarySuggestions([]) }} />
          <div className="relative z-50 bg-white rounded-xl shadow-2xl w-[520px] p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-5">Add Equipment / System</h2>

            <div className="space-y-4">
              {/* Kind */}
              <div className="flex gap-4">
                {(['equipment', 'system'] as const).map(k => (
                  <label key={k} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600">
                    <input type="radio" name="kind" value={k} checked={addForm.kind === k}
                      onChange={() => setAddForm(f => ({ ...f, kind: k }))} className="accent-teal-700" />
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>

              {/* Tag — with glossary autocomplete */}
              <div className="relative">
                <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">
                  Tag — type to search glossary
                </label>
                <input
                  value={tagQuery}
                  onChange={e => updateTagQuery(e.target.value)}
                  placeholder="AHU, HP, GEN, P-1…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                  autoFocus
                />
                {glossarySuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                    {glossarySuggestions.map(entry => (
                      <button
                        key={entry.id}
                        onClick={() => applyGlossarySuggestion(entry)}
                        className="w-full text-left px-3 py-2 hover:bg-teal-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                      >
                        <span className="font-mono text-xs font-bold text-gray-800 w-12 shrink-0">{entry.tag}</span>
                        <span className="text-xs text-gray-600 flex-1">{entry.descriptor}</span>
                        <span className="text-[9px] text-gray-400">{DISCIPLINE_LABELS[entry.discipline] ?? entry.discipline}</span>
                        {entry.equipment_type && (
                          <span className="text-[8px] bg-teal-50 text-teal-600 px-1 rounded">{entry.equipment_type}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {addForm.discipline && (
                  <p className="mt-1 text-[9px] text-gray-400">
                    {DISCIPLINE_LABELS[addForm.discipline]} · {addForm.equipment_type ? `fields: ${addForm.equipment_type.replace(/_/g,' ')}` : 'basic entry (no field template)'}
                  </p>
                )}
              </div>

              {/* Descriptor */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Descriptor</label>
                <input value={addForm.descriptor} onChange={e => setAddForm(f => ({ ...f, descriptor: e.target.value }))}
                  placeholder="Air Handling Unit"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400" />
              </div>

              {/* Category + Equipment Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Category</label>
                  <input value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="AIR HANDLING UNITS"
                    list="existing-cats"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400" />
                  <datalist id="existing-cats">
                    {categories.filter(Boolean).map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Field Template Type</label>
                  <input value={addForm.equipment_type} onChange={e => setAddForm(f => ({ ...f, equipment_type: e.target.value }))}
                    placeholder="ahu, pump, boiler…"
                    list="known-types"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-400" />
                  <datalist id="known-types">
                    {['heat_pump','boiler','pump','ahu','erv','fan','ats','generator','chiller','cooling_tower','fcu','vav'].map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
              </div>

              {/* Location + Area Served */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Location</label>
                  <input value={addForm.location} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="L1 Mech Room"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Area Served</label>
                  <input value={addForm.area_served} onChange={e => setAddForm(f => ({ ...f, area_served: e.target.value }))}
                    placeholder="ENTIRE BUILDING"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setAddOpen(false); setAddForm(EMPTY_FORM); setGlossarySuggestions([]) }}
                className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300">
                Cancel
              </button>
              <button onClick={saveAdd} disabled={savingAdd || (!addForm.tag.trim() && !addForm.descriptor.trim())}
                className="px-5 py-2 text-xs bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-40">
                {savingAdd ? 'Adding…' : 'Add Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small sub-components ──────────────────────────────────────────────────────

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-gray-50 text-left border-b border-gray-100"
      >
        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex-1">{label}</span>
        <span className="text-[9px] text-gray-300 font-mono">{count}</span>
        <span className="text-[10px] text-gray-300">{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  )
}

function MetaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">{label}:</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs text-gray-600 border-b border-gray-200 focus:outline-none focus:border-teal-400 bg-transparent min-w-0 w-28"
        placeholder="—"
      />
    </div>
  )
}

function MetaDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-400">{label}:</span>
      <span className="text-gray-600 font-medium">{value}</span>
    </div>
  )
}
