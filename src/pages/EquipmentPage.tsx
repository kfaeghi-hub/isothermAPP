import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { reportError } from '../lib/mutationError'
import { Combobox } from '../components/ui/Combobox'
import { openStoredFile } from '../lib/fileUrl'
import { useAuth } from '../contexts/AuthContext'
import { IntakePanel } from '../components/intake/IntakePanel'
import { TypeAssignmentReview } from '../components/equipment/TypeAssignmentReview'
import { alternatesFor, convertValue, type Conversion } from '../lib/unitConvert'
import type {
  Equipment, EquipmentTagGlossary, ProjectEquipmentFieldDef,
  EquipmentAttachment, NameplateExtra,
} from '../types/database'

// ── Constants ────────────────────────────────────────────────────────────────

/** The def set every unit gets, prepended ahead of its type's own. Not an
 *  equipment type: neither def table has an FK to equipment_types, so this key
 *  can never be assigned to a unit or appear in the type picker. */
const BASE_KEY = '__base'

/** The single-column ancestors of nameplate_extra that still hold data.
 *  Identity is deliberately absent — it lives in the base def set now. */
const LEGACY_NAMEPLATE: [string, keyof Equipment][] = [
  ['Voltage (V)', 'voltage'], ['Phase', 'phase'], ['Hz', 'hz'],
  ['Amperage (A)', 'amperage'], ['Flow', 'flow'], ['Capacity', 'capacity'],
]

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
  // The type vocabulary is DATA, not a literal. It used to be a hardcoded array
  // right here in the JSX, so a type could not be added without a code change —
  // which meant the taxonomy could not learn from a project. Now it is rows in
  // equipment_types, minted by ratification in the admin screen.
  const [typeKeys, setTypeKeys]       = useState<string[]>([])
  /** Which unit string new field defs are seeded with. Read once per project. */
  const [unitSystem, setUnitSystem]   = useState<'metric' | 'imperial'>('metric')
  const [attachments, setAttachments] = useState<EquipmentAttachment[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)

  // Add modal
  const [intakeOpen, setIntakeOpen] = useState(false)
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

  const fetchUnitSystem = useCallback(async () => {
    const { data } = await supabase.from('projects')
      .select('unit_system').eq('id', projectId).maybeSingle()
    setUnitSystem((data?.unit_system as 'metric' | 'imperial') ?? 'metric')
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
    Promise.all([fetchEquipment(), fetchGlossary(), fetchFieldDefs(), fetchAttachments(),
                 fetchUnitSystem()])
      .then(() => setLoading(false))
  }, [fetchEquipment, fetchGlossary, fetchFieldDefs, fetchAttachments, fetchUnitSystem])

  // The base set is seeded once per project, on first load, so an UNTYPED unit
  // has somewhere to record identity without anyone choosing a type first.
  useEffect(() => {
    if (loading) return
    if (fieldDefs.some(f => f.equipment_type === BASE_KEY)) return
    void ensureFieldDefs(BASE_KEY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, fieldDefs])

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
    const { data: newEquip, error } = await supabase
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
    // On failure keep the modal open so the user can retry; re-enable the button.
    if (reportError(error, 'add the equipment')) { setSavingAdd(false); return }

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

  const fetchTypeVocabulary = useCallback(async () => {
    const { data } = await supabase.from('equipment_types')
      .select('key').eq('active', true).order('sort_order')
    setTypeKeys((data ?? []).map((t: any) => t.key))
  }, [])

  useEffect(() => { void fetchTypeVocabulary() }, [fetchTypeVocabulary])

  /** Seed a project's copy of a firm def set. `type` may be BASE_KEY. */
  async function ensureFieldDefs(type: string) {
    const existing = fieldDefs.filter(f => f.equipment_type === type)
    if (existing.length > 0) return
    const { data: firmDefs } = await supabase
      .from('equipment_type_field_defs')
      .select('*')
      .eq('equipment_type', type)
      .order('sort_order')
    if (!firmDefs || firmDefs.length === 0) return
    const { error } = await supabase.from('project_equipment_field_defs').insert(
      firmDefs.map((d: any) => ({
        project_id:     projectId,
        equipment_type: d.equipment_type,
        section:        d.section,
        field_name:     d.field_name,
        // THE PROJECT'S SYSTEM DECIDES THE LABEL, AT SEEDING TIME ONLY.
        // `unit_imperial` is null for the units both systems share — CFM, MBH,
        // NPS, V, A, Hz — because those are already what a local engineer
        // writes. Only five quantities actually swap.
        unit:           unitSystem === 'imperial' ? (d.unit_imperial ?? d.unit) : d.unit,
        sort_order:     d.sort_order,
      }))
    )
    if (reportError(error, 'set up the field template')) return
    await fetchFieldDefs()
  }

  // ── Delete equipment ───────────────────────────────────────────────────────

  /**
   * REFERENCE-AWARE DELETE — count first, then block, warn, or allow.
   *
   * The old version asked "Delete this? It also removes Cx Index progress data
   * and attachments" — the same sentence whether the unit was untouched or
   * carried fifty verified cells. A warning that never changes is a warning
   * nobody reads.
   *
   * NOTE ON THE BRIEF: it asked to block when a CHECKLIST targets the unit.
   * Checklists do not reference equipment at all — they hold a
   * `nameplate_snapshot`, deliberately, so an issued checklist stays true after
   * the register moves. The reference that genuinely must block is a FINDING:
   * findings.linked_equipment_id is ON DELETE SET NULL, so deleting the unit
   * would silently strip the link from part of the signed record and leave a
   * finding pointing at nothing.
   */
  async function deleteEquipment(id: string) {
    const eq = equipment.find(e => e.id === id)
    const name = eq?.tag ?? eq?.descriptor ?? 'this item'

    const [findings, cells, atts] = await Promise.all([
      supabase.from('findings').select('finding_number, title', { count: 'exact' })
        .eq('linked_equipment_id', id).limit(5),
      supabase.from('cx_cell_values').select('id', { count: 'exact', head: true })
        .eq('equipment_id', id),
      supabase.from('equipment_attachments').select('id', { count: 'exact', head: true })
        .eq('equipment_id', id),
    ])

    // BLOCKED, with the reason and the specific findings named. Not "cannot
    // delete" — which sends someone hunting — but which findings, so they can go
    // and unlink them deliberately if that is really what they want.
    if ((findings.count ?? 0) > 0) {
      const list = (findings.data ?? [])
        .map(f => `  · ${f.finding_number ?? ''} ${String(f.title ?? '').slice(0, 60)}`)
        .join('\n')
      alert(
        `Cannot delete ${name} — ${findings.count} finding${findings.count === 1 ? '' : 's'} ` +
        `link${findings.count === 1 ? 's' : ''} to it:\n\n${list}` +
        ((findings.count ?? 0) > 5 ? `\n  …and ${(findings.count ?? 0) - 5} more` : '') +
        `\n\nA finding is part of the signed record. Unlink them first if this unit ` +
        `really should go.`)
      return
    }

    const losses = [
      (cells.count ?? 0) > 0 && `${cells.count} Cx Index cell${cells.count === 1 ? '' : 's'} of recorded progress`,
      (atts.count ?? 0) > 0 && `${atts.count} attachment${atts.count === 1 ? '' : 's'}`,
    ].filter(Boolean)

    const msg = losses.length
      ? `Delete ${name}?\n\nThis also destroys:\n${losses.map(l => `  · ${l}`).join('\n')}\n\n` +
        `That work cannot be recovered.`
      : `Delete ${name}?\n\nNothing references it — no findings, no recorded progress, ` +
        `no attachments.`
    if (!confirm(msg)) return

    const { error } = await supabase.from('equipment').delete().eq('id', id)
    if (reportError(error, 'delete the equipment')) return
    setSelectedId(null)
    fetchEquipment()
  }

  /**
   * COPY — the template, never the verification.
   *
   * Duplicating a unit copies what it IS: type, category, nameplate, location.
   * It must never copy what was VERIFIED about it — no Cx Index cells, no
   * attachments, no findings, and no serial number, because a serial identifies
   * one physical machine and two rows sharing one is a register that cannot be
   * trusted.
   *
   * The tag is cleared rather than suffixed. "P-01 copy" is a tag somebody will
   * ship, and an empty tag is a question the register asks out loud.
   */
  async function copyEquipment(eq: Equipment) {
    setSavingAdd(true)
    const np = eq.nameplate_extra
      ? JSON.parse(JSON.stringify(eq.nameplate_extra)) as NameplateExtra
      : null
    // The serial belongs to the machine, not to the model.
    if (np?.installed) delete (np.installed as Record<string, unknown>)['Serial Number']

    const maxSort = equipment.reduce((m, e) => Math.max(m, e.sort_order), 0)
    const { data: made, error } = await supabase.from('equipment').insert({
      project_id: projectId,
      kind: eq.kind,
      equipment_type: eq.equipment_type,
      category: eq.category,
      tag: null,
      descriptor: eq.descriptor,
      location: eq.location,
      area_served: eq.area_served,
      nameplate_extra: np,
      sort_order: maxSort + 1,
    }).select('id').single()
    setSavingAdd(false)
    if (reportError(error, 'copy the equipment')) return
    await fetchEquipment()
    setSelectedId(made?.id ?? null)
    // Straight into edit, because the tag is the one thing that must be filled in.
    if (made) {
      const fresh = { ...eq, id: made.id, tag: null } as Equipment
      startEdit(fresh)
    }
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
    // THE LEGACY IDENTITY COLUMNS ARE MIRRORED, IN THE SAME UPDATE.
    // manufacturer/model/serial_number are the single-column ancestors of
    // nameplate_extra — the same shape as contacts.email/phone — and other
    // readers (the report and checklist generators among them) still read the
    // columns. Editing identity through the base def set and not mirroring it
    // would leave the columns holding a value the nameplate has since changed,
    // which is the dual-write drift that has already cost this build once.
    //
    // One statement, so there is no window where the two disagree.
    const installed = editNameplate.installed ?? {}
    const mirror = {
      manufacturer:  installed['Manufacturer']  ?? null,
      model:         installed['Model Number']  ?? null,
      serial_number: installed['Serial Number'] ?? null,
    }
    const { error } = await supabase
      .from('equipment')
      .update({
        ...editValues,
        ...mirror,
        nameplate_extra: editNameplate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eq.id)
    // On failure stay in edit mode so the user keeps their changes; re-enable Save.
    if (reportError(error, 'save changes')) { setSavingEdit(false); return }

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
    const { data: upload, error: uploadErr } = await supabase.storage
      .from('equipment-files')
      .upload(path, file, { contentType: file.type })
    // Upload failed — don't insert a row that points at a nonexistent file.
    if (reportError(uploadErr, 'upload the attachment')) { setUploadingFile(false); return }
    if (upload) {
      // storage_url persists the bucket-relative PATH (storage privacy pass) —
      // opens go through api/get-file-url signed URLs.
      const { error: insertErr } = await supabase.from('equipment_attachments').insert({
        project_id:   projectId,
        equipment_id: equipId,
        filename:     file.name,
        file_type:    pendingFileType,
        storage_url:  path,
      })
      if (reportError(insertErr, 'save the attachment')) { setUploadingFile(false); return }
      fetchAttachments()
    }
    setUploadingFile(false)
  }

  async function deleteAttachment(att: EquipmentAttachment) {
    if (!confirm(`Remove "${att.filename}"?`)) return
    const { error } = await supabase.from('equipment_attachments').delete().eq('id', att.id)
    if (reportError(error, 'delete the attachment')) return
    // storage_url is a bucket-relative path (legacy rows carried a full URL — slice those).
    const marker = '/equipment-files/'
    const idx = att.storage_url.indexOf(marker)
    const storagePath = idx >= 0 ? att.storage_url.slice(idx + marker.length) : att.storage_url
    if (storagePath) {
      // Best-effort storage cleanup; the row is already gone, so don't block on it.
      const { error: removeErr } = await supabase.storage.from('equipment-files').remove([storagePath.split('?')[0]])
      if (removeErr) console.error('[equipment] storage cleanup failed:', removeErr)
    }
    fetchAttachments()
  }

  // ── Field structure editing ────────────────────────────────────────────────

  async function saveFieldName(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingFieldId(null); return }
    const { error } = await supabase.from('project_equipment_field_defs').update({ field_name: trimmed }).eq('id', id)
    // Resync from the server so the UI doesn't show an unsaved rename.
    if (reportError(error, 'rename the field')) { fetchFieldDefs(); return }
    setFieldDefs(prev => prev.map(f => f.id === id ? { ...f, field_name: trimmed } : f))
    setEditingFieldId(null)
  }

  async function moveField(id: string, dir: 'up' | 'down', type: string, section: string) {
    const group = fieldDefs.filter(f => f.equipment_type === type && f.section === section)
    const idx = group.findIndex(f => f.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= group.length) return
    const a = group[idx], b = group[swapIdx]
    const [resA, resB] = await Promise.all([
      supabase.from('project_equipment_field_defs').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('project_equipment_field_defs').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    // Either update failing leaves the two rows' sort_order inconsistent — reload to resync.
    if (reportError(resA.error ?? resB.error, 'reorder fields')) { fetchFieldDefs(); return }
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
    const { error } = await supabase.from('project_equipment_field_defs').delete().eq('id', id)
    // Reload so a field that wasn't actually deleted stays visible.
    if (reportError(error, 'delete the field')) { fetchFieldDefs(); return }
    setFieldDefs(prev => prev.filter(f => f.id !== id))
  }

  async function addField(type: string, section: string) {
    const name = newFieldName.trim()
    if (!name) return
    const group = fieldDefs.filter(f => f.equipment_type === type && f.section === section)
    const maxSort = group.reduce((m, f) => Math.max(m, f.sort_order), 0)
    const { data, error } = await supabase
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
    // On failure keep the inline add row open with the user's input for retry.
    if (reportError(error, 'add the field')) return
    if (data) setFieldDefs(prev => [...prev, data as ProjectEquipmentFieldDef])
    setAddingFieldSection(null)
    setNewFieldName('')
    setNewFieldUnit('')
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const selected = equipment.find(e => e.id === selectedId) ?? null

  const categories = [...new Set(equipment.map(e => e.category ?? ''))].sort()
  // Locations this project already uses. A room is written down dozens of times
  // across a register and gets spelled a different way most of them — "L1 Mech",
  // "L1 Mech Rm", "Level 1 Mechanical". Offering what is already there is how the
  // category field stopped drifting, and location drifts harder because nobody
  // reviews it.
  const locations = [...new Set(equipment.map(e => e.location ?? '').filter(Boolean))].sort()

  /**
   * THE UNIVERSAL BASE SET IS ALWAYS PREPENDED — typed or not.
   *
   * 55% of the register had no equipment type, and an untyped unit used to get
   * no defs at all: `ensureFieldDefs` returned early on a null type and the
   * nameplate rendered empty. On the two live retrofit projects that was nearly
   * everything (Clairlea 92 of 99, Muir 57 of 89) — which is why three field
   * users independently reported fields "missing" that their type already had.
   * They were looking at units the system did not consider to be that type.
   *
   * Identity is the floor beneath every unit, so it comes from a def set rather
   * than from a type. Dedup by field name: a type that already declares its own
   * Manufacturer keeps its own row and its own unit.
   */
  function defsForType(type: string, section: string) {
    const base = fieldDefs
      .filter(f => f.equipment_type === BASE_KEY && f.section === section)
      .sort((a, b) => a.sort_order - b.sort_order)
    const own = type
      ? fieldDefs
          .filter(f => f.equipment_type === type && f.section === section)
          .sort((a, b) => a.sort_order - b.sort_order)
      : []
    const ownNames = new Set(own.map(f => f.field_name))
    return [...base.filter(f => !ownNames.has(f.field_name)), ...own]
  }

  /**
   * CHANGE A FIELD'S UNIT — never a silent relabel.
   *
   * Relabelling alone is how "225" entered as GPM becomes "225 L/s": the number
   * stays, the meaning changes, and nothing anywhere says so. It renders, it
   * prints, and it is only wrong once something computes with it.
   *
   * So the count comes first. The human is told how many values exist and what
   * the arithmetic will be, and chooses. Cancelling changes nothing at all —
   * not even the label — because a label that disagrees with its values is the
   * state this exists to prevent.
   */
  async function changeFieldUnit(def: ProjectEquipmentFieldDef, c: Conversion) {
    // Count the values this would touch, across every unit on the project.
    const section = def.section as keyof NameplateExtra
    const affected: { id: string; raw: string }[] = []
    for (const e of equipment) {
      const v = (e.nameplate_extra?.[section] ?? {})[def.field_name]
      if (typeof v === 'string' && v.trim()) affected.push({ id: e.id, raw: v })
    }
    const convertible = affected.filter(a => convertValue(a.raw, c) !== null)
    const stubborn = affected.length - convertible.length

    if (affected.length === 0) {
      // Nothing recorded yet — the relabel is free and needs no ceremony.
      const { error } = await supabase.from('project_equipment_field_defs')
        .update({ unit: c.to }).eq('id', def.id)
      if (reportError(error, 'change the unit')) return
      await fetchFieldDefs()
      return
    }

    const ok = window.confirm(
      `Change ${def.field_name} from ${def.unit} to ${c.to}?\n\n` +
      `${affected.length} value${affected.length === 1 ? '' : 's'} already recorded ` +
      `on this project.\n\n` +
      `OK — convert them (${c.label}) and change the label.\n` +
      `Cancel — change nothing.\n\n` +
      (stubborn
        ? `${stubborn} of them are not plain numbers (things like "1 1/2" or ` +
          `"N/A") and CANNOT be converted. Converting would leave those at their ` +
          `old magnitude under the new label, so they are left exactly as they ` +
          `are for you to fix by hand.`
        : `All ${affected.length} are plain numbers and convert cleanly.`))
    if (!ok) return

    // Values first, label last. If a value write fails the label still says the
    // old unit, which is true of the data; the reverse order would leave the
    // label lying about numbers that never moved.
    for (const a of convertible) {
      const eq = equipment.find(x => x.id === a.id)
      if (!eq) continue
      const next = { ...(eq.nameplate_extra ?? { spec: {}, shop_drawing: {}, installed: {} }) }
      next[section] = { ...(next[section] ?? {}), [def.field_name]: convertValue(a.raw, c)! }
      const { error } = await supabase.from('equipment')
        .update({ nameplate_extra: next, updated_at: new Date().toISOString() }).eq('id', a.id)
      if (reportError(error, `convert ${eq.tag ?? 'a unit'}`)) return
    }

    const { error } = await supabase.from('project_equipment_field_defs')
      .update({ unit: c.to }).eq('id', def.id)
    if (reportError(error, 'change the unit')) return
    await Promise.all([fetchFieldDefs(), fetchEquipment()])
  }

  function equipAttachments(equipId: string) {
    return attachments.filter(a => a.equipment_id === equipId)
  }

  const currentType = editing ? (editValues.equipment_type ?? '') : (selected?.equipment_type ?? '')

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="flex flex-col h-full min-h-0 rise">

      {/* THE REVIEW SPANS BOTH COLUMNS.
          It first sat inside the equipment-list column, which collapses to w-72
          the moment a unit is selected — so a rationale like "no match on the
          descriptor; category 'UNIT HEATERS' matches unit_heater" wrapped into a
          twelve-line ribbon and became unreadable exactly when someone had a unit
          open to compare it against.

          It is a project-level decision surface, not a property of the list, so
          it belongs above both. Renders nothing when there is nothing to rule on. */}
      <TypeAssignmentReview projectId={projectId}
        onApplied={() => { void fetchEquipment(); void fetchFieldDefs() }} />

      <div className="flex flex-1 min-h-0">

      {/* ── Left panel: equipment list ──────────────────────────────────── */}
      {/* RC2 — below lg: detail open hides the list (full-width detail + back). */}
      <div className={`flex-col border-r border-gray-200 bg-white shrink-0 ${selectedId ? 'hidden lg:flex lg:w-72' : 'flex flex-1'}`}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="text-xs font-semibold text-gray-700 mr-auto">
            Equipment / Systems
          </span>
          <span className="text-[10px] text-gray-400 font-mono">{equipment.length}</span>
          <button
            onClick={() => setIntakeOpen(o => !o)}
            className="px-2.5 py-1 text-xs border border-gray-200 rounded text-gray-600 hover:border-teal-400 hover:text-teal-700"
          >
            Import
          </button>
          <button
            onClick={() => { setAddOpen(true); setTagQuery(''); setGlossarySuggestions([]) }}
            className="px-2.5 py-1 text-xs bg-teal-700 text-white rounded hover:bg-teal-800"
          >
            + Add
          </button>
        </div>

        {intakeOpen && (
          <div className="border-b border-gray-100 bg-gray-50/60 shrink-0 max-h-[55vh] overflow-y-auto">
            <IntakePanel projectId={projectId} onChanged={() => void fetchEquipment()} />
          </div>
        )}

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
            <div className="px-4 lg:px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start gap-3">
                {/* mobile back to the register list (RC2) */}
                <button
                  onClick={() => setSelectedId(null)}
                  className="lg:hidden shrink-0 -ml-1 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 text-lg"
                  aria-label="Back to equipment list"
                >
                  ←
                </button>
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
                      <button
                        onClick={() => copyEquipment(selected)}
                        disabled={savingAdd}
                        title="Duplicate this unit's type, category and nameplate. Verification state is never copied."
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded text-gray-600 hover:border-gray-300 disabled:opacity-50"
                      >Copy</button>
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
                    <MetaField label="Location" value={editValues.location ?? ''} options={locations}
                      onChange={v => setEditValues(x => ({ ...x, location: v }))} />
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
            {/* Both branches now render defs. The untyped one shows the base
                identity group plus whatever legacy electrical values a unit
                still carries — see the note on the legacy block below. */}
            {(currentType || fieldDefs.some(f => f.equipment_type === BASE_KEY)) ? (
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
                              {/* THE UNIT SITS WITH THE VALUE, NOT ONLY IN THE HEADING.
                                  The drawings are imperial and the defs are largely
                                  metric, so a CxA reads "225 GPM" off a pump schedule
                                  and types 225 into a field whose unit is two rows up
                                  in a heading they stopped reading an hour ago. The
                                  number is then wrong in the database and nothing ever
                                  says so — it renders, prints, and only misleads when
                                  something computes with it.

                                  This does not decide the metric/imperial question. It
                                  puts the answer where the mistake happens. */}
                              <label className="block text-[9px] text-gray-400 uppercase tracking-wide font-semibold">
                                {def.field_name}
                              </label>
                              {editing ? (
                                <div className="flex items-baseline gap-1 border-b border-gray-200 focus-within:border-teal-400">
                                  <input
                                    value={values[def.field_name] ?? ''}
                                    onChange={e => setFieldValue(key, def.field_name, e.target.value)}
                                    className="min-w-0 flex-1 text-xs focus:outline-none py-0.5 bg-transparent"
                                    placeholder="—"
                                  />
                                  {def.unit && (
                                    <span className="text-[10px] text-gray-400 shrink-0 pr-0.5"
                                          aria-hidden="true">{def.unit}</span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-700 font-medium">
                                  {values[def.field_name]
                                    ? <>{values[def.field_name]}
                                        {def.unit && <span className="text-gray-400 font-normal ml-1">{def.unit}</span>}</>
                                    : <span className="text-gray-300">—</span>}
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
            ) : null}

            {/* ── LEGACY COLUMN VALUES ──────────────────────────────────────
                Identity (manufacturer / model / serial) moved to the base def
                set and was copied into nameplate_extra.installed by the
                migration, so it is NOT repeated here.

                These six are what remains: single columns on `equipment`, the
                ancestor of the nameplate_extra mechanism, still holding real
                data — 32 units carry voltage/phase/hz, 2 carry
                amperage/flow/capacity. No type def exists to receive them until
                a type is assigned, and simply dropping the inputs would leave
                that data in the database and uneditable, which is the register
                quietly disagreeing with itself.

                So it renders only for units that actually HAVE such values, and
                it says what it is. Assigning a type gives these fields a proper
                home; until then they stay reachable rather than orphaned. */}
            {LEGACY_NAMEPLATE.some(([, k]) => (selected[k] as string | null)) && (
              <div className="px-6 py-4 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">
                  Legacy nameplate values
                </p>
                <p className="text-[10px] text-gray-400 mb-3">
                  Recorded before this unit had a type. Assign a type to give them a
                  proper home in its nameplate structure.
                </p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  {LEGACY_NAMEPLATE.map(([label, key]) => (
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
              </div>
            )}

            {!currentType && !editing && (
              <p className="px-6 pb-4 text-[10px] text-gray-400">
                No equipment type set — this unit shows identity only. Assign a type
                to unlock its Spec / Shop Drawing / Installed fields.{' '}
                <button onClick={() => startEdit(selected)} className="text-teal-600 underline">Edit</button>
              </p>
            )}

            {/* ── Attachments ───────────────────────────────────────────── */}
            <Section label="Attachments" count={equipAttachments(selected.id).length}>
              <div className="px-6 py-3 space-y-2">
                {equipAttachments(selected.id).map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium shrink-0">
                      {FILE_TYPE_LABELS[att.file_type] ?? att.file_type}
                    </span>
                    <button
                      onClick={() => openStoredFile(att.storage_url, { table: 'equipment_attachments', id: att.id })}
                      className="flex-1 text-left text-teal-700 hover:text-teal-900 truncate"
                    >
                      {att.filename}
                    </button>
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
                          {/* Offered only where a real counterpart exists. CFM,
                              MBH, NPS and the electrical units have none — on an
                              Ontario drawing they are already what both systems
                              write, and offering a swap would invite one. */}
                          {alternatesFor(def.unit).map(c => (
                            <button key={c.to} onClick={() => changeFieldUnit(def, c)}
                              title={`Change to ${c.to} — ${c.label}`}
                              className="text-[9px] text-gray-300 hover:text-teal-700 px-1 shrink-0">
                              →{c.to}
                            </button>
                          ))}
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
                  <Combobox
                    value={addForm.category}
                    options={categories.filter(Boolean) as string[]}
                    onChange={v => setAddForm(f => ({ ...f, category: v }))}
                    placeholder="AIR HANDLING UNITS"
                    ariaLabel="Category"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Field Template Type</label>
                  <Combobox
                    value={addForm.equipment_type}
                    options={typeKeys}
                    onChange={v => setAddForm(f => ({ ...f, equipment_type: v }))}
                    placeholder="ahu, pump, boiler…"
                    ariaLabel="Field Template Type"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-400" />
                </div>
              </div>

              {/* Location + Area Served */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Location</label>
                  <Combobox
                    value={addForm.location}
                    options={locations}
                    onChange={v => setAddForm(f => ({ ...f, location: v }))}
                    placeholder="L1 Mech Room"
                    ariaLabel="Location"
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

function MetaField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options?: string[]
}) {
  /* THE NATIVE <datalist> IS GONE.
   *
   * It rendered the browser's own dropdown — a ▼ affordance and a box on an
   * input whose neighbours are borderless underlines, and an OS-drawn popup this
   * app deliberately does not use anywhere else. Playwright could not even
   * screenshot it, which is a fair summary of how far outside the design system
   * it sat.
   *
   * The dense-row worry that led me to it was real, and the answer was to fix
   * the Combobox rather than reach for the native control: its list now anchors
   * right and flips above when it would collide. */
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">{label}:</span>
      {options?.length ? (
        <Combobox
          value={value}
          options={options}
          onChange={onChange}
          ariaLabel={label}
          wrapperClassName="min-w-0 w-28"
          className="w-full text-xs text-gray-600 border-b border-gray-200 focus:outline-none focus:border-teal-400 bg-transparent"
          placeholder="—"
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="text-xs text-gray-600 border-b border-gray-200 focus:outline-none focus:border-teal-400 bg-transparent min-w-0 w-28"
          placeholder="—"
        />
      )}
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
