import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as outbox from '../lib/checklistOutbox'
import { uploadFindingPhoto } from '../lib/photos'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/ui/Modal'
import type {
  ChecklistTemplate, ChecklistInstance, ChecklistInstanceTarget,
  ChecklistInstanceSection, ChecklistInstanceItem, ChecklistInstanceGrid,
  ChecklistInstanceSignoff, ChecklistResponse, ChecklistGridResponse,
  ChecklistFindingLink, ChecklistType, ResponseStatus, Equipment,
} from '../types/database'

// ── Helpers ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ChecklistType, string> = { ivc: 'IVC', pfc: 'PFC', fpt: 'FPT' }
const TYPE_COLORS: Record<ChecklistType, string> = {
  ivc: 'bg-blue-50 text-blue-700',
  pfc: 'bg-violet-50 text-violet-700',
  fpt: 'bg-orange-50 text-orange-700',
}
const STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-500',
  in_progress:  'bg-amber-50 text-amber-700',
  complete:     'bg-emerald-50 text-emerald-700',
}
const STATUS_LABELS = { not_started: 'Not Started', in_progress: 'In Progress', complete: 'Complete' }

function TypeBadge({ type }: { type: ChecklistType }) {
  return <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${TYPE_COLORS[type]}`}>{TYPE_LABELS[type]}</span>
}

// ── Target type for the create flow ────────────────────────────────────────

interface TargetDraft { equipment_id: string; role: 'primary' | 'tested_unit' | 'related'; sort_order: number }

// ── Instance list row type ─────────────────────────────────────────────────

interface InstanceRow extends ChecklistInstance {
  targets: Array<{ equipment_id: string; role: string; sort_order: number; equipment: Pick<Equipment, 'id' | 'tag' | 'descriptor' | 'kind'> | null }>
}

// ── Detail target type ─────────────────────────────────────────────────────

interface DetailTarget extends ChecklistInstanceTarget {
  equipment: Pick<Equipment, 'id' | 'tag' | 'descriptor' | 'kind'> | null
}

// ── Response map helpers ───────────────────────────────────────────────────

type ResponseKey = string  // `${item_id}:${target_id}`
type GridKey = string      // `${grid_id}:${target_id}:${row_key}`

function rKey(itemId: string, targetId: string): ResponseKey { return `${itemId}:${targetId}` }
function gKey(gridId: string, targetId: string, rowKey: string): GridKey { return `${gridId}:${targetId}:${rowKey}` }

// 'saving'  = write in flight (or debouncing)
// 'pending' = write failed and was durably queued in the outbox — recorded, not yet synced
type SaveState = 'saving' | 'pending'

// ── Finding form ───────────────────────────────────────────────────────────

interface FindingForm {
  title: string
  category: string
  responsible_party_id: string
  phase_id: string
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  projectId: string
  phases: Array<{ id: string; name: string }>
}

export function ChecklistsPage({ projectId, phases }: Props) {
  const { profile } = useAuth()

  // ── List state ───────────────────────────────────────────────────────────
  const [instances, setInstances]   = useState<InstanceRow[]>([])
  const [filter, setFilter]         = useState<'all' | ChecklistType>('all')
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Detail state ─────────────────────────────────────────────────────────
  const [instance,   setInstance]   = useState<ChecklistInstance | null>(null)
  const [targets,    setTargets]    = useState<DetailTarget[]>([])
  const [sections,   setSections]   = useState<ChecklistInstanceSection[]>([])
  const [items,      setItems]      = useState<ChecklistInstanceItem[]>([])
  const [grids,      setGrids]      = useState<ChecklistInstanceGrid[]>([])
  const [signoffs,   setSignoffs]   = useState<ChecklistInstanceSignoff[]>([])
  const [responses,  setResponses]  = useState<Record<ResponseKey, ChecklistResponse>>({})
  const [gridResps,  setGridResps]  = useState<Record<GridKey, ChecklistGridResponse>>({})
  const [findLinks,  setFindLinks]  = useState<Record<ResponseKey, ChecklistFindingLink>>({})
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ── Create instance state ─────────────────────────────────────────────────
  const [createOpen, setCreateOpen]       = useState(false)
  const [templates, setTemplates]         = useState<ChecklistTemplate[]>([])
  const [equipment, setEquipment]         = useState<Equipment[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null)
  const [targetDrafts, setTargetDrafts]   = useState<TargetDraft[]>([])
  const [createStep, setCreateStep]       = useState<1 | 2>(1)
  const [creating, setCreating]           = useState(false)

  // ── Edit header fields ────────────────────────────────────────────────────
  const [editingHeader, setEditingHeader] = useState(false)
  const [headerForm, setHeaderForm]       = useState({ authored_by: '', date_performed: '', notes: '' })
  const [savingHeader, setSavingHeader]   = useState(false)

  // ── Finding modal ─────────────────────────────────────────────────────────
  const [findingModal, setFindingModal] = useState<{
    open: boolean
    itemId: string
    targetId: string
    prefillTitle: string
    prefillCategory: string
    prefillEquipmentId: string
    prefillOrigin: ChecklistType
  } | null>(null)
  const [findingForm, setFindingForm] = useState<FindingForm>({ title: '', category: '', responsible_party_id: '', phase_id: '' })
  const [projectTrades, setProjectTrades] = useState<Array<{ id: string; name: string }>>([])
  const [contacts, setContacts]           = useState<Array<{ id: string; name: string }>>([])
  const [savingFinding, setSavingFinding] = useState(false)
  const [findingError, setFindingError]   = useState<string | null>(null)
  // Photos captured in the modal, uploaded once the finding row exists.
  const [findingPhotos, setFindingPhotos] = useState<File[]>([])

  // ── Complete state ────────────────────────────────────────────────────────
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [completing, setCompleting]           = useState(false)

  // ── Reopen state ──────────────────────────────────────────────────────────
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [reopening, setReopening]         = useState(false)

  // ── Delete state ─────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState(false)

  // ── Generate document state ───────────────────────────────────────────────
  const [generating, setGenerating] = useState<'completed' | 'blank' | null>(null)

  // ── Field resilience: drafts + per-field save state ───────────────────────
  // Text inputs hold a local draft so typing is never gated on a DB round-trip.
  // Status inputs (Y/N/NR/NA, Pass/Fail, Sign) write immediately — one discrete action.
  const [gridDrafts,    setGridDrafts]    = useState<Record<string, string>>({})
  const [signoffDrafts, setSignoffDrafts] = useState<Record<string, string>>({})
  const [saveState,     setSaveState]     = useState<Record<string, SaveState>>({})

  // ── Outbox: queued writes survive a dead-signal room, a reload, and a tab kill ──
  const [queued, setQueued] = useState(0)
  const [stuck,  setStuck]  = useState(0)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const unsubscribe = outbox.subscribe(n => { setQueued(n); setStuck(outbox.stuckOps().length) })
    const stopAutoFlush = outbox.startAutoFlush()
    const goOnline  = () => { setOnline(true); void outbox.flushOutbox() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      unsubscribe(); stopAutoFlush()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const prevQueued = useRef(queued)

  // Refs mirror state so a debounced write reads current values, not its closure's.
  const gridRespsRef  = useRef(gridResps)
  const gridDraftsRef = useRef(gridDrafts)
  useEffect(() => { gridRespsRef.current  = gridResps  }, [gridResps])
  useEffect(() => { gridDraftsRef.current = gridDrafts }, [gridDrafts])

  const pending = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>>({})

  function mark(key: string, state: SaveState | null) {
    setSaveState(s => {
      if (state === null) { const { [key]: _gone, ...rest } = s; return rest }
      return { ...s, [key]: state }
    })
  }

  function debounce(key: string, ms: number, run: () => void) {
    const prev = pending.current[key]
    if (prev) clearTimeout(prev.timer)
    mark(key, 'saving')
    const timer = setTimeout(() => { delete pending.current[key]; run() }, ms)
    pending.current[key] = { timer, run }
  }

  function flush(key: string) {
    const p = pending.current[key]
    if (!p) return
    clearTimeout(p.timer)
    delete pending.current[key]
    p.run()
  }

  useEffect(() => () => {
    for (const p of Object.values(pending.current)) clearTimeout(p.timer)
  }, [])

  const syncing = Object.values(saveState).some(s => s === 'saving')

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchInstances = useCallback(async () => {
    setLoadingList(true)
    const { data } = await supabase
      .from('checklist_instances')
      .select('*, targets:checklist_instance_targets(equipment_id, role, sort_order, equipment(id, tag, descriptor, kind))')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setInstances((data ?? []) as unknown as InstanceRow[])
    setLoadingList(false)
  }, [projectId])

  const fetchDetail = useCallback(async (instanceId: string) => {
    setLoadingDetail(true)
    const [instRes, tRes, sRes, soRes] = await Promise.all([
      supabase.from('checklist_instances').select('*').eq('id', instanceId).single(),
      supabase.from('checklist_instance_targets')
        .select('*, equipment(id, tag, descriptor, kind)')
        .eq('instance_id', instanceId).order('sort_order'),
      supabase.from('checklist_instance_sections').select('*')
        .eq('instance_id', instanceId).order('sort_order'),
      supabase.from('checklist_instance_signoffs').select('*')
        .eq('instance_id', instanceId).order('created_at'),
    ])
    setInstance(instRes.data as ChecklistInstance)
    setTargets((tRes.data ?? []) as unknown as DetailTarget[])
    const fetchedSections = (sRes.data ?? []) as ChecklistInstanceSection[]
    setSections(fetchedSections)
    setSignoffs((soRes.data ?? []) as ChecklistInstanceSignoff[])

    if (fetchedSections.length > 0) {
      const sectionIds = fetchedSections.map(s => s.id)
      const [iRes, gRes] = await Promise.all([
        supabase.from('checklist_instance_items').select('*')
          .in('section_id', sectionIds).order('sort_order'),
        supabase.from('checklist_instance_grids').select('*')
          .in('section_id', sectionIds).order('sort_order'),
      ])
      setItems((iRes.data ?? []) as ChecklistInstanceItem[])
      setGrids((gRes.data ?? []) as ChecklistInstanceGrid[])
    } else {
      setItems([]); setGrids([])
    }

    const [rRes, grRes, flRes] = await Promise.all([
      supabase.from('checklist_responses').select('*').eq('instance_id', instanceId),
      supabase.from('checklist_grid_responses').select('*').eq('instance_id', instanceId),
      supabase.from('checklist_finding_links').select('*').eq('instance_id', instanceId),
    ])
    const rMap: Record<ResponseKey, ChecklistResponse> = {}
    for (const r of (rRes.data ?? []) as ChecklistResponse[]) rMap[rKey(r.item_id, r.target_id)] = r
    setResponses(rMap)
    const grMap: Record<GridKey, ChecklistGridResponse> = {}
    for (const g of (grRes.data ?? []) as ChecklistGridResponse[]) grMap[gKey(g.grid_id, g.target_id, g.row_key)] = g
    setGridResps(grMap)
    const flMap: Record<ResponseKey, ChecklistFindingLink> = {}
    for (const f of (flRes.data ?? []) as ChecklistFindingLink[]) flMap[rKey(f.item_id, f.target_id)] = f
    setFindLinks(flMap)
    setLoadingDetail(false)
  }, [])

  const fetchCreateData = useCallback(async () => {
    const [tmplRes, eqRes] = await Promise.all([
      supabase.from('checklist_templates').select('*').eq('active', true).order('type').order('name'),
      supabase.from('equipment').select('id, tag, descriptor, kind, equipment_type')
        .eq('project_id', projectId).order('sort_order'),
    ])
    setTemplates((tmplRes.data ?? []) as ChecklistTemplate[])
    setEquipment((eqRes.data ?? []) as Equipment[])
  }, [projectId])

  useEffect(() => { fetchInstances() }, [fetchInstances])

  // Trades + contacts needed by the finding modal — fetch on mount, not just when create modal opens
  useEffect(() => {
    async function fetchSupportData() {
      const [trRes, ctRes] = await Promise.all([
        supabase.from('project_trades').select('trade_type_id, trade_types(id, name)')
          .eq('project_id', projectId),
        supabase.from('contacts').select('id, name').order('name'),
      ])
      const tradeNames = (trRes.data ?? []).flatMap((r: any) =>
        r.trade_types ? [{ id: r.trade_types.id, name: r.trade_types.name }] : []
      )
      setProjectTrades(tradeNames)
      setContacts((ctRes.data ?? []) as Array<{ id: string; name: string }>)
    }
    fetchSupportData()
  }, [projectId])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else {
      setInstance(null); setTargets([]); setSections([]); setItems([])
      setGrids([]); setSignoffs([]); setResponses({}); setGridResps({}); setFindLinks({})
    }
  }, [selectedId, fetchDetail])

  // Once the outbox drains, refetch so the view picks up server-assigned values
  // (finding numbers, real row ids, org_id) instead of our local placeholders.
  useEffect(() => {
    if (prevQueued.current > 0 && queued === 0 && selectedId) fetchDetail(selectedId)
    prevQueued.current = queued
  }, [queued, selectedId, fetchDetail])

  // ── Derived ────────────────────────────────────────────────────────────

  const filteredInstances = instances.filter(i => filter === 'all' || i.type === filter)
  // Targets that get response columns (primary + tested_unit; not related)
  const responseTargets = targets.filter(t => t.role !== 'related')
  // Reopen allowed for admin always, or the person who completed it
  const canReopen = instance?.status === 'complete' && (
    profile?.role === 'admin' ||
    (profile?.name != null && profile.name === instance.completed_by)
  )

  // ── Create instance ────────────────────────────────────────────────────

  function openCreate() {
    fetchCreateData()
    setSelectedTemplate(null)
    setTargetDrafts([])
    setCreateStep(1)
    setCreateOpen(true)
  }

  function pickTemplate(tmpl: ChecklistTemplate) {
    setSelectedTemplate(tmpl)
    setTargetDrafts([])
    setCreateStep(2)
  }

  function addTargetDraft(equipmentId: string, role: TargetDraft['role']) {
    if (targetDrafts.some(t => t.equipment_id === equipmentId)) return
    const nextOrder = targetDrafts.filter(t => t.role === role).length
    setTargetDrafts(d => [...d, { equipment_id: equipmentId, role, sort_order: nextOrder }])
  }

  function removeTargetDraft(equipmentId: string) {
    setTargetDrafts(d => d.filter(t => t.equipment_id !== equipmentId))
  }

  async function createInstance() {
    if (!selectedTemplate || targetDrafts.length === 0) return
    setCreating(true)
    try {
      // 1. Insert instance
      const { data: inst, error: instErr } = await supabase
        .from('checklist_instances')
        .insert({
          project_id: projectId,
          source_template_id: selectedTemplate.id,
          source_template_name_snapshot: selectedTemplate.name,
          source_template_type_snapshot: selectedTemplate.type,
          source_template_revision_label_snapshot: selectedTemplate.revision_label ?? null,
          type: selectedTemplate.type,
          status: 'not_started',
          authored_by: profile?.name ?? null,
        })
        .select('id')
        .single()
      if (instErr || !inst) throw instErr ?? new Error('Failed to create instance')
      const instanceId = inst.id

      // 2. Insert targets
      await supabase.from('checklist_instance_targets').insert(
        targetDrafts.map(t => ({ instance_id: instanceId, ...t }))
      )

      // 3. Fetch template sections/items/grids/signoffs
      const [sRes, soRes] = await Promise.all([
        supabase.from('checklist_template_sections').select('*')
          .eq('template_id', selectedTemplate.id).order('sort_order'),
        supabase.from('checklist_template_signoffs').select('*')
          .eq('template_id', selectedTemplate.id).order('sort_order'),
      ])
      const tmplSections = sRes.data ?? []

      let tmplItems: any[] = []
      let tmplGrids: any[] = []
      if (tmplSections.length > 0) {
        const sectionIds = tmplSections.map((s: any) => s.id)
        const [iRes, gRes] = await Promise.all([
          supabase.from('checklist_template_items').select('*').in('section_id', sectionIds).order('sort_order'),
          supabase.from('checklist_template_grids').select('*').in('section_id', sectionIds).order('sort_order'),
        ])
        tmplItems = iRes.data ?? []
        tmplGrids = gRes.data ?? []
      }

      // 4. Snapshot sections → items + grids
      for (const tmplSection of tmplSections) {
        const { data: instSection } = await supabase
          .from('checklist_instance_sections')
          .insert({
            instance_id: instanceId,
            source_section_id: tmplSection.id,
            title: tmplSection.title,
            sort_order: tmplSection.sort_order,
          })
          .select('id')
          .single()
        if (!instSection) continue

        const sItems = tmplItems.filter((i: any) => i.section_id === tmplSection.id)
        if (sItems.length > 0) {
          await supabase.from('checklist_instance_items').insert(
            sItems.map((i: any) => ({
              instance_id: instanceId,
              section_id: instSection.id,
              source_item_id: i.id,
              label: i.label,
              hint: i.hint,
              status_type: i.status_type,
              creates_finding: i.creates_finding,
              expected_response: i.expected_response,
              suggested_category: i.suggested_category,
              sort_order: i.sort_order,
            }))
          )
        }

        const sGrids = tmplGrids.filter((g: any) => g.section_id === tmplSection.id)
        if (sGrids.length > 0) {
          await supabase.from('checklist_instance_grids').insert(
            sGrids.map((g: any) => ({
              instance_id: instanceId,
              section_id: instSection.id,
              source_grid_id: g.id,
              title: g.title,
              definition: g.definition,
              sort_order: g.sort_order,
            }))
          )
        }
      }

      // 5. Snapshot signoffs
      const tmplSignoffs = soRes.data ?? []
      if (tmplSignoffs.length > 0) {
        await supabase.from('checklist_instance_signoffs').insert(
          tmplSignoffs.map((s: any) => ({
            instance_id: instanceId,
            source_signoff_id: s.id,
            role_label_snapshot: s.role_label,
          }))
        )
      }

      setCreating(false)
      setCreateOpen(false)
      await fetchInstances()
      setSelectedId(instanceId)
    } catch (err) {
      setCreating(false)
      alert(err instanceof Error ? err.message : 'Failed to create checklist.')
    }
  }

  // ── Response upsert ────────────────────────────────────────────────────

  async function setResponse(item: ChecklistInstanceItem, targetId: string, status: ResponseStatus | null) {
    if (!instance) return
    const key = rKey(item.id, targetId)
    mark(key, 'saving')

    // Upsert on the natural key. No insert-vs-update branch, so two fast changes
    // can't both take the insert path and collide on the unique constraint.
    const payload = {
      instance_id: instance.id,
      item_id: item.id,
      target_id: targetId,
      status_type: item.status_type,
      status,
    }

    const { data, error } = await supabase
      .from('checklist_responses')
      .upsert(payload, { onConflict: 'instance_id,item_id,target_id' })
      .select()
      .single()

    if (error || !data) {
      // Not lost — durably queued. The entry stands; it is pending sync.
      outbox.enqueue({
        key: `response:${key}`,
        label: item.label,
        kind: 'upsert',
        table: 'checklist_responses',
        onConflict: 'instance_id,item_id,target_id',
        payload,
      })
      mark(key, 'pending')
      setResponses(r => ({ ...r, [key]: { ...(r[key] ?? {}), ...payload } as ChecklistResponse }))
    } else {
      mark(key, null)
      setResponses(r => ({ ...r, [key]: data as ChecklistResponse }))
    }

    // Promote to in_progress if still not_started
    if (instance.status === 'not_started') {
      const { error: statusErr } = await supabase
        .from('checklist_instances').update({ status: 'in_progress' }).eq('id', instance.id)
      if (!statusErr) {
        setInstance(i => i ? { ...i, status: 'in_progress' } : i)
        setInstances(list => list.map(i => i.id === instance.id ? { ...i, status: 'in_progress' } : i))
      }
    }

    // Trigger finding modal on N/fail if creates_finding and no existing link
    const isFail = (item.status_type === 'yn_nr_na' && status === 'n') || (item.status_type === 'pass_yn' && status === 'fail')
    if (isFail && item.creates_finding && !findLinks[key]) {
      const target = targets.find(t => t.id === targetId)
      setFindingModal({
        open: true,
        itemId: item.id,
        targetId,
        prefillTitle: item.label,
        prefillCategory: item.suggested_category ?? '',
        prefillEquipmentId: target?.equipment_id ?? '',
        prefillOrigin: instance.type,
      })
      setFindingForm({
        title: item.label,
        category: item.suggested_category ?? (projectTrades[0]?.name ?? ''),
        responsible_party_id: '',
        phase_id: '',
      })
    }
  }

  // ── Grid response upsert ───────────────────────────────────────────────

  // Persist a grid row. Upsert on the natural key kills the duplicate-insert race;
  // the row is rebuilt from persisted data + every pending draft for that row, so a
  // fast typist can't lose a sibling cell that hasn't flushed yet.
  async function persistGridCell(
    grid: ChecklistInstanceGrid, targetId: string, rowKey: string, colKey: string, value: string,
  ) {
    if (!instance) return
    const key = gKey(grid.id, targetId, rowKey)
    const cellKey = `${key}:${colKey}`

    const merged: Record<string, string> = { ...(gridRespsRef.current[key]?.data ?? {}) }
    for (const col of grid.definition.columns) {
      const ck = `${key}:${col.key}`
      if (ck in gridDraftsRef.current) merged[col.key] = gridDraftsRef.current[ck]
    }
    merged[colKey] = value

    const payload = {
      instance_id: instance.id, grid_id: grid.id, target_id: targetId,
      row_key: rowKey, data: merged,
    }

    const { data, error } = await supabase
      .from('checklist_grid_responses')
      .upsert(payload, { onConflict: 'instance_id,grid_id,target_id,row_key' })
      .select()
      .single()

    if (error || !data) {
      // Queue the whole row (merged), so replay restores every column, not just this cell.
      outbox.enqueue({
        key: `grid:${key}`,
        label: `${grid.title} · ${rowKey}`,
        kind: 'upsert',
        table: 'checklist_grid_responses',
        onConflict: 'instance_id,grid_id,target_id,row_key',
        payload,
      })
      mark(cellKey, 'pending')
      setGridResps(r => ({ ...r, [key]: { ...(r[key] ?? {}), ...payload } as ChecklistGridResponse }))
      return
    }

    mark(cellKey, null)
    setGridResps(r => ({ ...r, [key]: data as ChecklistGridResponse }))
    // Drop the draft only if the user hasn't typed something newer since this flush.
    setGridDrafts(d => {
      if (d[cellKey] !== value) return d
      const { [cellKey]: _gone, ...rest } = d
      return rest
    })
  }

  // Typing updates the draft immediately — the input never waits on the network.
  function onGridCellChange(
    grid: ChecklistInstanceGrid, targetId: string, rowKey: string, colKey: string, value: string,
  ) {
    const cellKey = `${gKey(grid.id, targetId, rowKey)}:${colKey}`
    setGridDrafts(d => ({ ...d, [cellKey]: value }))
    debounce(cellKey, 500, () => persistGridCell(grid, targetId, rowKey, colKey, value))
  }

  function onGridCellBlur(grid: ChecklistInstanceGrid, targetId: string, rowKey: string, colKey: string) {
    flush(`${gKey(grid.id, targetId, rowKey)}:${colKey}`)
  }

  // ── Signoff update ─────────────────────────────────────────────────────

  const soKey = (signoffId: string, field: string) => `signoff:${signoffId}:${field}`

  async function persistSignoff(signoffId: string, field: 'signer_name' | 'signer_company', value: string) {
    const key = soKey(signoffId, field)
    const { error } = await supabase
      .from('checklist_instance_signoffs').update({ [field]: value }).eq('id', signoffId)

    if (error) {
      outbox.enqueue({
        key: `signoff:${signoffId}:${field}`,
        label: `Sign-off · ${field === 'signer_name' ? 'name' : 'company'}`,
        kind: 'update',
        table: 'checklist_instance_signoffs',
        match: { id: signoffId },
        payload: { [field]: value },
      })
      mark(key, 'pending')
      setSignoffs(s => s.map(so => so.id === signoffId ? { ...so, [field]: value } : so))
      return
    }

    mark(key, null)
    setSignoffs(s => s.map(so => so.id === signoffId ? { ...so, [field]: value } : so))
    setSignoffDrafts(d => {
      if (d[key] !== value) return d
      const { [key]: _gone, ...rest } = d
      return rest
    })
  }

  function onSignoffChange(signoffId: string, field: 'signer_name' | 'signer_company', value: string) {
    const key = soKey(signoffId, field)
    setSignoffDrafts(d => ({ ...d, [key]: value }))
    debounce(key, 500, () => persistSignoff(signoffId, field, value))
  }

  async function signSignoff(signoffId: string) {
    // Flush any in-flight name/company edits before stamping the signature.
    flush(soKey(signoffId, 'signer_name'))
    flush(soKey(signoffId, 'signer_company'))

    const key = soKey(signoffId, 'signed_at')
    mark(key, 'saving')
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('checklist_instance_signoffs').update({ signed_at: now }).eq('id', signoffId)

    if (error) {
      outbox.enqueue({
        key: `signoff:${signoffId}:signed_at`,
        label: 'Sign-off · signature',
        kind: 'update',
        table: 'checklist_instance_signoffs',
        match: { id: signoffId },
        payload: { signed_at: now },
      })
      mark(key, 'pending')
    } else {
      mark(key, null)
    }
    setSignoffs(s => s.map(so => so.id === signoffId ? { ...so, signed_at: now } : so))
  }

  // ── Finding creation ───────────────────────────────────────────────────

  async function createFinding() {
    if (!findingModal || !instance) return
    setSavingFinding(true)
    setFindingError(null)

    // Client-generated id so the link row can reference the finding immediately
    // (and, once the outbox lands, so both can be queued together offline).
    const findingId = crypto.randomUUID()

    const findingPayload = {
      id: findingId,
      project_id: projectId,
      title: findingForm.title.trim() || null,
      category: findingForm.category || 'INFO',
      responsible_party_id: findingForm.responsible_party_id || null,
      origin: findingModal.prefillOrigin,
      linked_equipment_id: findingModal.prefillEquipmentId || null,
      phase_id: findingForm.phase_id || null,
    }
    const linkPayload = {
      instance_id: instance.id,
      item_id: findingModal.itemId,
      target_id: findingModal.targetId,
      finding_id: findingId,
    }
    const key = rKey(findingModal.itemId, findingModal.targetId)

    // Queue finding + link as ONE op. Because the finding carries a client-generated id,
    // the link can reference it offline, and both replay as idempotent upserts.
    function queueFinding() {
      outbox.enqueue({
        key: `finding:${key}`,
        label: `Finding · ${findingForm.title || 'untitled'}`,
        kind: 'finding',
        finding: findingPayload,
        link: { onConflict: 'instance_id,item_id,target_id', payload: linkPayload },
      })
    }

    const { error: findingErr } = await supabase.from('findings').upsert(
      findingPayload, { onConflict: 'id' },
    )

    if (findingErr) {
      queueFinding()
    } else {
      const { error: linkErr } = await supabase.from('checklist_finding_links').upsert(
        linkPayload, { onConflict: 'instance_id,item_id,target_id' },
      )
      // The finding landed but the link didn't — queue the pair; replay is idempotent,
      // so re-upserting the finding is a no-op and the link gets its second chance.
      if (linkErr) queueFinding()
    }

    setFindLinks(fl => ({
      ...fl,
      [key]: {
        id: '', org_id: null, instance_id: instance.id,
        item_id: findingModal.itemId, target_id: findingModal.targetId,
        finding_id: findingId, created_at: '',
      },
    }))

    // Photos: the storage path only needs the (client-generated) finding id, so this works
    // as soon as the finding exists — even if the finding itself is still queued.
    // Image blobs cannot live in localStorage, so an upload that fails offline is reported
    // plainly rather than pretended away.
    if (findingPhotos.length > 0) {
      const results = await Promise.all(
        findingPhotos.map(async f => ({ file: f, result: await uploadFindingPhoto(findingId, f) })),
      )
      const failed = results.filter(r => !r.result.ok).map(r => r.file)

      if (failed.length > 0) {
        // Keep only the failures, so Retry re-sends those and cannot duplicate the
        // photos that already landed (the finding upsert itself is idempotent).
        setFindingPhotos(failed)
        setSavingFinding(false)
        setFindingError(
          `The finding is saved, but ${failed.length} photo${failed.length === 1 ? '' : 's'} ` +
          `could not be uploaded — photos need a live connection. Retry once you reconnect, ` +
          `or attach them later from the Issues Log.`,
        )
        return  // keep the modal open so the photos are not silently dropped
      }
    }

    setFindingPhotos([])
    setSavingFinding(false)
    setFindingModal(null)
  }

  // ── Complete instance ──────────────────────────────────────────────────

  async function completeInstance() {
    if (!instance) return

    // Rule 4: a completed checklist is a frozen historical record. Freezing one while
    // responses are still sitting in the outbox would freeze a lie. Try to drain first,
    // and refuse outright if anything is still unsynced.
    const { remaining } = await outbox.flushOutbox()
    if (remaining > 0) {
      setConfirmComplete(false)
      alert(
        `${remaining} ${remaining === 1 ? 'entry has' : 'entries have'} not reached the server yet. ` +
        `Reconnect and let them sync before marking this checklist complete.`,
      )
      return
    }

    setCompleting(true)

    // Snapshot nameplate data for all targets
    const nameplateSnapshot: Record<string, any> = {}
    for (const target of targets) {
      if (!target.equipment) continue
      const { data: eq } = await supabase
        .from('equipment')
        .select('tag, descriptor, manufacturer, model, serial_number, voltage, phase, hz, amperage, flow, capacity, nameplate_extra')
        .eq('id', target.equipment_id)
        .single()
      if (eq) nameplateSnapshot[target.equipment_id] = eq
    }

    await supabase.from('checklist_instances').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      completed_by: profile?.name ?? null,
      nameplate_snapshot: nameplateSnapshot,
    }).eq('id', instance.id)

    setCompleting(false)
    setConfirmComplete(false)
    await fetchInstances()
    fetchDetail(instance.id)
  }

  // ── Reopen instance ────────────────────────────────────────────────────

  async function reopenInstance() {
    if (!instance) return
    setReopening(true)
    await supabase.from('checklist_instances').update({
      status: 'in_progress',
      reopened_by: profile?.name ?? null,
      reopened_at: new Date().toISOString(),
    }).eq('id', instance.id)
    setReopening(false)
    setConfirmReopen(false)
    await fetchInstances()
    fetchDetail(instance.id)
  }

  // ── Header save ────────────────────────────────────────────────────────

  async function saveHeader() {
    if (!instance) return
    setSavingHeader(true)
    await supabase.from('checklist_instances').update({
      authored_by: headerForm.authored_by || null,
      date_performed: headerForm.date_performed || null,
      notes: headerForm.notes || null,
    }).eq('id', instance.id)
    setSavingHeader(false)
    setEditingHeader(false)
    setInstance(i => i ? { ...i, ...headerForm, date_performed: headerForm.date_performed || null } : i)
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  async function deleteInstance() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from('checklist_instances').delete().eq('id', confirmDelete)
    setDeleting(false)
    setConfirmDelete(null)
    setSelectedId(null)
    fetchInstances()
  }

  // ── Generate document ──────────────────────────────────────────────────

  async function generateDoc(mode: 'completed' | 'blank') {
    if (!instance) return
    setGenerating(mode)
    try {
      const resp = await fetch('/api/generate-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_id: instance.id, mode }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? 'Generation failed')
      // Open PDF in new tab; DOCX auto-downloads or opens
      if (data.pdf_url)     window.open(data.pdf_url, '_blank')
      if (data.storage_url) window.open(data.storage_url, '_blank')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate document.')
    } finally {
      setGenerating(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const narrow = !!selectedId

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Instance list ─────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-gray-200 flex-shrink-0 transition-all ${narrow ? 'w-72' : 'flex-1'}`}>
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-1">
            {(['all', 'ivc', 'pfc', 'fpt'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  filter === f ? 'bg-slate-100 text-slate-700 font-semibold' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {f === 'all' ? `All (${instances.length})` : f.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={openCreate}
            className="ml-auto text-xs bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium whitespace-nowrap flex-shrink-0">
            + New Checklist
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loadingList ? (
            <div className="p-8 text-sm text-gray-400 text-center">Loading checklists…</div>
          ) : filteredInstances.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-3xl mb-3 opacity-20">✅</div>
              <p className="text-sm font-medium text-gray-600 mb-1">No checklists yet</p>
              <p className="text-xs text-gray-400 max-w-[180px] mx-auto">
                Create IVC, PFC, and FPT checklists from the firm template library.
              </p>
            </div>
          ) : (
            filteredInstances.map(inst => {
              const isSelected = inst.id === selectedId
              const primaryTargets = inst.targets.filter((t: any) => t.role !== 'related')
              const tagList = primaryTargets
                .map((t: any) => t.equipment?.tag ?? t.equipment?.descriptor ?? '?')
                .slice(0, 3).join(', ')
              return (
                <button key={inst.id} onClick={() => setSelectedId(isSelected ? null : inst.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors relative ${isSelected ? 'bg-teal-50/40' : ''}`}>
                  {isSelected && <div className="absolute left-0 inset-y-0 w-0.5 bg-teal-500 rounded-r" />}
                  <div className="flex items-center gap-2 mb-0.5">
                    <TypeBadge type={inst.type} />
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${STATUS_COLORS[inst.status]}`}>
                      {STATUS_LABELS[inst.status]}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-gray-800 truncate mb-0.5">{inst.source_template_name_snapshot}</p>
                  {tagList && <p className="text-[11px] text-gray-400 truncate">{tagList}{primaryTargets.length > 3 ? ` +${primaryTargets.length - 3}` : ''}</p>}
                  {inst.date_performed && (
                    <p className="text-[11px] font-mono text-gray-400 mt-0.5">{inst.date_performed}</p>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Instance fill view ────────────────────────────────────── */}
      {selectedId && instance ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Header */}
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-start gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <TypeBadge type={instance.type} />
                <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${STATUS_COLORS[instance.status]}`}>
                  {STATUS_LABELS[instance.status]}
                </span>
                {instance.source_template_revision_label_snapshot && (
                  <span className="text-[10px] font-mono text-gray-400">{instance.source_template_revision_label_snapshot}</span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{instance.source_template_name_snapshot}</h3>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {targets.map(t => (
                  <span key={t.id} className={`text-[11px] rounded px-1.5 py-0.5 ${
                    t.role === 'related' ? 'bg-gray-100 text-gray-400' : 'bg-slate-100 text-slate-600 font-medium'
                  }`}>
                    {t.equipment?.tag ?? t.equipment?.descriptor ?? '?'}
                    {t.role === 'related' && <span className="ml-1 opacity-60">(related)</span>}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Sync chip — the engineer must never have to guess whether their work landed. */}
              {instance.status !== 'complete' && (
                <span className={`text-[11px] font-medium rounded px-2 py-1 whitespace-nowrap ${
                  !online  ? 'bg-slate-100 text-slate-600'
                  : stuck > 0  ? 'bg-red-50 text-red-700'
                  : queued > 0 ? 'bg-amber-50 text-amber-700'
                  : syncing    ? 'bg-slate-50 text-slate-500'
                  : 'bg-emerald-50 text-emerald-700'
                }`}
                title={queued > 0 ? 'Entries are saved on this device and will sync automatically.' : undefined}>
                  {!online     ? `Offline — ${queued} queued`
                  : stuck > 0  ? `${stuck} failed`
                  : queued > 0 ? `Syncing — ${queued} pending`
                  : syncing    ? 'Saving…'
                  : 'All changes saved'}
                </span>
              )}
              {instance.status !== 'complete' && (
                <button onClick={() => setConfirmComplete(true)}
                  disabled={queued > 0 || stuck > 0}
                  title={queued > 0 || stuck > 0
                    ? 'Cannot complete: some entries have not reached the server yet.'
                    : undefined}
                  className="text-xs bg-emerald-600 text-white border border-emerald-700 rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
                  Mark Complete
                </button>
              )}
              {canReopen && (
                <button onClick={() => setConfirmReopen(true)}
                  className="text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded px-3 py-1.5 hover:bg-amber-100 transition-colors font-medium">
                  Reopen
                </button>
              )}
              {instance.status === 'complete' && (
                <button
                  onClick={() => generateDoc('completed')}
                  disabled={!!generating}
                  className="text-xs border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors font-medium"
                  title="Generate completed checklist PDF + DOCX"
                >
                  {generating === 'completed' ? 'Generating…' : 'Export'}
                </button>
              )}
              <button
                onClick={() => generateDoc('blank')}
                disabled={!!generating}
                className="text-xs border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors font-medium"
                title="Generate blank hand-out for contractor (Spec + Shop Drawing pre-filled)"
              >
                {generating === 'blank' ? 'Generating…' : 'Print Blank'}
              </button>
              <button onClick={() => {
                setHeaderForm({
                  authored_by: instance.authored_by ?? '',
                  date_performed: instance.date_performed ?? '',
                  notes: instance.notes ?? '',
                })
                setEditingHeader(true)
              }}
                className="text-xs border border-gray-200 rounded px-3 py-1.5 text-gray-500 hover:text-teal-700 hover:border-teal-400 transition-colors">
                Edit
              </button>
              <button onClick={() => setConfirmDelete(instance.id)}
                className="text-xs border border-red-200 rounded px-3 py-1.5 text-red-500 hover:bg-red-50 transition-colors">
                Delete
              </button>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none ml-1">×</button>
            </div>
          </div>

          {/* Fill body */}
          {loadingDetail ? (
            <div className="p-8 text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="flex-1 overflow-auto">
              {/* Meta row */}
              <div className="flex items-center gap-6 px-5 py-2.5 border-b border-gray-100 text-xs text-gray-500 bg-gray-50 flex-wrap">
                {instance.date_performed && <span>Date: <span className="font-mono text-gray-700">{instance.date_performed}</span></span>}
                {instance.authored_by && <span>By: <span className="text-gray-700">{instance.authored_by}</span></span>}
                {instance.completed_at && (
                  <span>Completed: <span className="text-emerald-700 font-medium">
                    {new Date(instance.completed_at).toLocaleDateString()}{instance.completed_by ? ` · ${instance.completed_by}` : ''}
                  </span></span>
                )}
                {instance.reopened_at && (
                  <span className="text-amber-600">Reopened: <span className="font-medium">
                    {new Date(instance.reopened_at).toLocaleDateString()}{instance.reopened_by ? ` · ${instance.reopened_by}` : ''}
                  </span></span>
                )}
                {instance.notes && <span className="text-gray-400 italic truncate max-w-xs">{instance.notes}</span>}
              </div>

              {/* Stuck ops need a human — they will not drain on their own. */}
              {stuck > 0 && (
                <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
                  <span className="font-semibold">
                    {stuck} {stuck === 1 ? 'entry' : 'entries'} could not be saved after several attempts.
                  </span>{' '}
                  This is not a connection problem — re-enter them, or contact an admin.
                  Do not mark this checklist complete.
                </div>
              )}

              {/* Column header for multi-unit */}
              {responseTargets.length > 1 && (
                <div className="sticky top-0 z-10 flex items-center border-b border-gray-200 bg-white px-5 py-2">
                  <div className="flex-1 min-w-0" />
                  {responseTargets.map(t => (
                    <div key={t.id} className="w-20 text-center text-[11px] font-semibold text-gray-600 flex-shrink-0 px-1">
                      {t.equipment?.tag ?? t.equipment?.descriptor ?? '?'}
                    </div>
                  ))}
                  <div className="w-24 flex-shrink-0" />
                </div>
              )}

              {/* Sections */}
              {sections.map(section => {
                const sectionItems = items.filter(i => i.section_id === section.id)
                const sectionGrids = grids.filter(g => g.section_id === section.id)
                return (
                  <div key={section.id}>
                    <div className="px-5 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{section.title}</span>
                    </div>

                    {/* Line items */}
                    {sectionItems.map(item => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        responseTargets={responseTargets}
                        responses={responses}
                        findLinks={findLinks}
                        saveState={saveState}
                        onSetResponse={setResponse}
                        isComplete={instance.status === 'complete'}
                      />
                    ))}

                    {/* Measurement grids */}
                    {sectionGrids.map(grid => (
                      <GridBlock
                        key={grid.id}
                        grid={grid}
                        responseTargets={responseTargets}
                        gridResps={gridResps}
                        gridDrafts={gridDrafts}
                        saveState={saveState}
                        onCellChange={onGridCellChange}
                        onCellBlur={onGridCellBlur}
                        isComplete={instance.status === 'complete'}
                      />
                    ))}
                  </div>
                )
              })}

              {/* Signoffs */}
              {signoffs.length > 0 && (
                <div>
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-200 border-t border-t-gray-200">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Sign-offs</span>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    {signoffs.map(s => (
                      <div key={s.id} className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
                        <div className="w-48 flex-shrink-0 text-xs font-medium text-gray-700">{s.role_label_snapshot}</div>
                        <input
                          type="text"
                          value={signoffDrafts[soKey(s.id, 'signer_name')] ?? s.signer_name ?? ''}
                          onChange={e => onSignoffChange(s.id, 'signer_name', e.target.value)}
                          onBlur={() => flush(soKey(s.id, 'signer_name'))}
                          placeholder="Signer name"
                          disabled={instance.status === 'complete'}
                          className={`flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400 ${
                            saveState[soKey(s.id, 'signer_name')] === 'pending' ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                          }`}
                        />
                        <input
                          type="text"
                          value={signoffDrafts[soKey(s.id, 'signer_company')] ?? s.signer_company ?? ''}
                          onChange={e => onSignoffChange(s.id, 'signer_company', e.target.value)}
                          onBlur={() => flush(soKey(s.id, 'signer_company'))}
                          placeholder="Company"
                          disabled={instance.status === 'complete'}
                          className={`w-36 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400 ${
                            saveState[soKey(s.id, 'signer_company')] === 'pending' ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                          }`}
                        />
                        {s.signed_at ? (
                          <span className="text-[11px] font-mono text-emerald-600 w-28 flex-shrink-0">
                            {new Date(s.signed_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <button
                            onClick={() => signSignoff(s.id)}
                            disabled={instance.status === 'complete' || !s.signer_name}
                            className="text-[11px] border border-teal-200 text-teal-700 rounded px-2 py-1 hover:bg-teal-50 disabled:opacity-40 w-28 flex-shrink-0"
                          >
                            Sign
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Create Checklist modal — Step 1: pick template ─────────── */}
      <Modal title="New Checklist — Select Template" open={createOpen && createStep === 1}
        onClose={() => setCreateOpen(false)} maxWidth="md">
        <div className="space-y-2 max-h-96 overflow-auto">
          {templates.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No active templates. Create one in the Templates library first.
            </p>
          ) : (
            templates.map(t => (
              <button key={t.id} onClick={() => pickTemplate(t)}
                className="w-full text-left flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
                <TypeBadge type={t.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{t.name}</p>
                  {t.equipment_type && <p className="text-xs text-gray-400">{t.equipment_type}</p>}
                </div>
                {t.revision_label && <span className="text-[10px] font-mono text-gray-400">{t.revision_label}</span>}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </Modal>

      {/* ── Create Checklist modal — Step 2: pick targets ──────────── */}
      <Modal
        title={`New ${selectedTemplate ? TYPE_LABELS[selectedTemplate.type] : ''} — ${selectedTemplate?.name ?? ''}`}
        open={createOpen && createStep === 2}
        onClose={() => setCreateOpen(false)}
        maxWidth="md"
      >
        {selectedTemplate && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {selectedTemplate.type === 'fpt'
                  ? 'Primary Target (system or equipment being tested)'
                  : selectedTemplate.type === 'ivc' || selectedTemplate.type === 'pfc'
                  ? 'Equipment — select one or more units'
                  : 'Target Equipment'}
              </p>
              <div className="space-y-1 max-h-52 overflow-auto border border-gray-200 rounded-lg p-2">
                {equipment.filter(e => targetDrafts.every(t => t.equipment_id !== e.id)).map(eq => (
                  <button key={eq.id}
                    onClick={() => {
                      const role: TargetDraft['role'] = selectedTemplate.type === 'fpt'
                        ? (targetDrafts.length === 0 ? 'primary' : 'related')
                        : (targetDrafts.length === 0 ? 'primary' : 'tested_unit')
                      addTargetDraft(eq.id, role)
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-50 transition-colors">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      eq.kind === 'system' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600'
                    }`}>{eq.kind === 'system' ? 'SYS' : 'EQ'}</span>
                    <span className="text-xs font-medium text-gray-700">{eq.tag ?? eq.descriptor ?? eq.id}</span>
                    {eq.tag && eq.descriptor && <span className="text-xs text-gray-400 truncate">{eq.descriptor}</span>}
                  </button>
                ))}
                {equipment.filter(e => targetDrafts.every(t => t.equipment_id !== e.id)).length === 0 && (
                  <p className="text-xs text-gray-400 p-2">All equipment added.</p>
                )}
              </div>
            </div>

            {targetDrafts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selected Targets</p>
                <div className="space-y-1">
                  {targetDrafts.map(t => {
                    const eq = equipment.find(e => e.id === t.equipment_id)
                    return (
                      <div key={t.equipment_id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded border border-gray-200">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          t.role === 'primary' ? 'bg-teal-50 text-teal-700'
                          : t.role === 'tested_unit' ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}>{t.role}</span>
                        <span className="text-xs text-gray-700 flex-1">{eq?.tag ?? eq?.descriptor ?? t.equipment_id}</span>
                        <button onClick={() => removeTargetDraft(t.equipment_id)}
                          className="text-gray-300 hover:text-red-500 text-sm leading-none">×</button>
                      </div>
                    )
                  })}
                </div>
                {selectedTemplate.type !== 'fpt' && targetDrafts.length > 1 && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    Multi-unit mode: each unit gets its own response column.
                    First unit auto-assigned as <em>primary</em>; remaining as <em>tested_unit</em>.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <button onClick={() => setCreateStep(1)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">← Back</button>
              <div className="flex gap-2">
                <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={createInstance}
                  disabled={creating || targetDrafts.length === 0}
                  className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
                  {creating ? 'Creating…' : 'Create Checklist'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit header modal ───────────────────────────────────────── */}
      <Modal title="Edit Checklist Details" open={editingHeader} onClose={() => setEditingHeader(false)} maxWidth="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Authored By</label>
            <input type="text" value={headerForm.authored_by}
              onChange={e => setHeaderForm(f => ({ ...f, authored_by: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date Performed</label>
            <input type="date" value={headerForm.date_performed}
              onChange={e => setHeaderForm(f => ({ ...f, date_performed: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={headerForm.notes} rows={3}
              onChange={e => setHeaderForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingHeader(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={saveHeader} disabled={savingHeader}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
              {savingHeader ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Finding modal ───────────────────────────────────────────── */}
      {findingModal && (
        <Modal title="Create Finding" open={findingModal.open}
          onClose={() => setFindingModal(null)} maxWidth="md">
          <div className="space-y-4">
            <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 border border-amber-100">
              This item was marked <strong>N</strong> or <strong>Fail</strong>. Create a linked finding to track resolution.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
              <input type="text" value={findingForm.title} autoFocus
                onChange={e => setFindingForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category <span className="text-red-400">*</span></label>
                <select value={findingForm.category}
                  onChange={e => setFindingForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="INFO">INFO</option>
                  {projectTrades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Responsible Party</label>
                <select value={findingForm.responsible_party_id}
                  onChange={e => setFindingForm(f => ({ ...f, responsible_party_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">Unassigned</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {phases.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phase</label>
                <select value={findingForm.phase_id}
                  onChange={e => setFindingForm(f => ({ ...f, phase_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                  <option value="">No phase</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {/* Photo capture — `capture="environment"` opens the rear camera straight from
                the phone, which is the whole point: photograph the defect where you find it. */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Photos
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (files.length) setFindingPhotos(p => [...p, ...files])
                }}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-200 file:text-xs file:font-medium file:bg-gray-50 file:text-gray-600 hover:file:bg-gray-100"
              />
              {findingPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {findingPhotos.map((f, i) => (
                    <span key={`${f.name}-${i}`}
                      className="flex items-center gap-1 text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1">
                      <span className="truncate max-w-[140px] text-gray-600">{f.name}</span>
                      <button
                        onClick={() => setFindingPhotos(p => p.filter((_, j) => j !== i))}
                        className="text-gray-300 hover:text-red-500 leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {findingError && (
              <p className="text-xs text-red-700 bg-red-50 rounded px-3 py-2 border border-red-200">
                {findingError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setFindingError(null); setFindingPhotos([]); setFindingModal(null) }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Skip for now</button>
              <button onClick={createFinding} disabled={savingFinding || !findingForm.category}
                className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
                {savingFinding ? 'Saving…' : findingError ? 'Retry' : 'Create Finding'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Complete confirmation ───────────────────────────────────── */}
      {/* ── Reopen confirmation ──────────────────────────────────────── */}
      <Modal title="Reopen Completed Checklist" open={confirmReopen}
        onClose={() => !reopening && setConfirmReopen(false)} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            This will reopen a completed checklist for editing. All existing responses, grid
            readings, signoffs, and finding links are preserved — nothing is deleted.
          </p>
          <p className="text-xs text-gray-400">
            The reopen is logged with your name and a timestamp. On re-completion, nameplate
            data will be re-snapshotted from the current equipment records.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmReopen(false)} disabled={reopening}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancel</button>
            <button onClick={reopenInstance} disabled={reopening}
              className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 transition-colors font-medium">
              {reopening ? 'Reopening…' : 'Reopen for Editing'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Complete confirmation ───────────────────────────────────────── */}
      <Modal title="Mark Checklist Complete" open={confirmComplete}
        onClose={() => !completing && setConfirmComplete(false)} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Mark this checklist as <strong>complete</strong>? This will snapshot the current nameplate data for all equipment targets, lock the record, and set the completion date.
          </p>
          <p className="text-xs text-gray-400">
            The checklist will remain readable. Responses cannot be edited after completion.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmComplete(false)} disabled={completing}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancel</button>
            <button onClick={completeInstance} disabled={completing}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium">
              {completing ? 'Completing…' : 'Mark Complete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      <Modal title="Delete Checklist" open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Delete this checklist instance? All responses, grid data, and finding links will be removed.
            Linked findings in the Issues Log are not deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} disabled={deleting}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancel</button>
            <button onClick={deleteInstance} disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors font-medium">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Line item row ──────────────────────────────────────────────────────────

function ItemRow({
  item, responseTargets, responses, findLinks, saveState, onSetResponse, isComplete,
}: {
  item: ChecklistInstanceItem
  responseTargets: DetailTarget[]
  responses: Record<string, ChecklistResponse>
  findLinks: Record<string, ChecklistFindingLink>
  saveState: Record<string, SaveState>
  onSetResponse: (item: ChecklistInstanceItem, targetId: string, status: ResponseStatus | null) => void
  isComplete: boolean
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-2.5 border-b border-gray-100 hover:bg-gray-50/40 group">
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs text-gray-800">{item.label}</p>
        {item.hint && <p className="text-[11px] text-gray-400 mt-0.5">{item.hint}</p>}
        {item.expected_response && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            <span className="text-gray-400">Expected: </span>{item.expected_response}
          </p>
        )}
      </div>

      {/* Response per target */}
      {responseTargets.map(target => {
        const key = `${item.id}:${target.id}`
        const resp = responses[key]
        const link = findLinks[key]
        const currentStatus = resp?.status ?? null
        const state = saveState[key]

        return (
          <div key={target.id} className="w-20 flex-shrink-0 flex flex-col items-center gap-1">
            {item.status_type === 'yn_nr_na' ? (
              <YnNrNaInput
                value={currentStatus as any}
                onChange={v => !isComplete && onSetResponse(item, target.id, v)}
                disabled={isComplete}
              />
            ) : (
              <PassFailInput
                value={currentStatus as any}
                onChange={v => !isComplete && onSetResponse(item, target.id, v)}
                disabled={isComplete}
              />
            )}
            {state === 'pending' && (
              <span className="text-[10px] text-amber-600 font-medium"
                title="Saved on this device — will sync when you reconnect.">
                Pending
              </span>
            )}
            {link && (
              <span className="text-[10px] text-amber-600 font-medium">Finding</span>
            )}
          </div>
        )
      })}

      {/* Spacer for header alignment */}
      <div className="w-24 flex-shrink-0" />
    </div>
  )
}

// ── Y/N/NR/NA input ────────────────────────────────────────────────────────

function YnNrNaInput({ value, onChange, disabled }: {
  value: 'y' | 'n' | 'nr' | 'na' | null
  onChange: (v: 'y' | 'n' | 'nr' | 'na' | null) => void
  disabled: boolean
}) {
  const opts: Array<{ v: 'y' | 'n' | 'nr' | 'na'; label: string; color: string }> = [
    { v: 'y',  label: 'Y',  color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { v: 'n',  label: 'N',  color: 'bg-red-50 text-red-700 border-red-300' },
    { v: 'nr', label: 'NR', color: 'bg-gray-100 text-gray-500 border-gray-300' },
    { v: 'na', label: 'NA', color: 'bg-gray-100 text-gray-400 border-gray-200' },
  ]
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange((e.target.value || null) as any)}
      disabled={disabled}
      className={`w-full text-center text-xs rounded border px-1 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:cursor-default ${
        value === 'y'  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
        : value === 'n'  ? 'bg-red-50 text-red-700 border-red-300'
        : value === 'nr' || value === 'na' ? 'bg-gray-100 text-gray-500 border-gray-300'
        : 'border-gray-200 text-gray-400'
      }`}
    >
      <option value="">—</option>
      {opts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )
}

// ── Pass/Fail input ────────────────────────────────────────────────────────

function PassFailInput({ value, onChange, disabled }: {
  value: 'pass' | 'fail' | null
  onChange: (v: 'pass' | 'fail' | null) => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-1 w-full">
      <button
        onClick={() => !disabled && onChange(value === 'pass' ? null : 'pass')}
        disabled={disabled}
        className={`flex-1 text-[10px] font-semibold py-1 rounded border transition-colors disabled:cursor-default ${
          value === 'pass' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-400 hover:border-emerald-400 hover:text-emerald-600'
        }`}
      >P</button>
      <button
        onClick={() => !disabled && onChange(value === 'fail' ? null : 'fail')}
        disabled={disabled}
        className={`flex-1 text-[10px] font-semibold py-1 rounded border transition-colors disabled:cursor-default ${
          value === 'fail' ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600'
        }`}
      >F</button>
    </div>
  )
}

// ── Measurement grid block ─────────────────────────────────────────────────

function GridBlock({
  grid, responseTargets, gridResps, gridDrafts, saveState, onCellChange, onCellBlur, isComplete,
}: {
  grid: ChecklistInstanceGrid
  responseTargets: DetailTarget[]
  gridResps: Record<GridKey, ChecklistGridResponse>
  gridDrafts: Record<string, string>
  saveState: Record<string, SaveState>
  onCellChange: (grid: ChecklistInstanceGrid, targetId: string, rowKey: string, colKey: string, value: string) => void
  onCellBlur: (grid: ChecklistInstanceGrid, targetId: string, rowKey: string, colKey: string) => void
  isComplete: boolean
}) {
  const { columns, rows } = grid.definition
  if (columns.length === 0 || rows.length === 0) return null

  return (
    <div className="px-5 py-3 border-b border-gray-100">
      <p className="text-[11px] font-semibold text-gray-500 mb-2">{grid.title}</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium text-gray-400 pr-4 pb-1.5 w-28" />
              {responseTargets.map(target => (
                columns.map(col => (
                  <th key={`${target.id}:${col.key}`}
                    className="text-center font-medium text-gray-500 px-2 pb-1.5 min-w-[70px]">
                    {responseTargets.length > 1 && (
                      <span className="block text-[10px] text-gray-400">{target.equipment?.tag ?? '?'}</span>
                    )}
                    {col.label}{col.unit ? ` (${col.unit})` : ''}
                  </th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="border-t border-gray-100">
                <td className="text-gray-600 pr-4 py-1.5 font-medium">{row.label}</td>
                {responseTargets.map(target => (
                  columns.map(col => {
                    const key = gKey(grid.id, target.id, row.key)
                    const cellKey = `${key}:${col.key}`
                    // Draft wins over the persisted value so typing is instant.
                    const cellValue = gridDrafts[cellKey] ?? gridResps[key]?.data?.[col.key] ?? ''
                    const state = saveState[cellKey]
                    return (
                      <td key={`${target.id}:${col.key}`} className="px-1 py-1">
                        <input
                          type="text"
                          value={cellValue}
                          onChange={e => !isComplete && onCellChange(grid, target.id, row.key, col.key, e.target.value)}
                          onBlur={() => !isComplete && onCellBlur(grid, target.id, row.key, col.key)}
                          disabled={isComplete}
                          title={state === 'pending'
                            ? 'Saved on this device — will sync when you reconnect.' : undefined}
                          className={`w-full min-w-[60px] border rounded px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400 ${
                            state === 'pending' ? 'border-amber-400 bg-amber-50'
                            : state === 'saving' ? 'border-slate-300'
                            : 'border-gray-200'
                          }`}
                        />
                      </td>
                    )
                  })
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
