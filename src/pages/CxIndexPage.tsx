import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { reportError } from '../lib/mutationError'
import { Combobox } from '../components/ui/Combobox'
import type { Equipment } from '../types/database'

// ── Local types ──────────────────────────────────────────────────────────────

interface CxColumn {
  id: string
  stage_group_id: string
  label: string
  sort_order: number
}

interface CxStageGroup {
  id: string
  project_id: string
  name: string
  sort_order: number
  columns: CxColumn[]
}

type CellStatus = 'done' | 'in_progress' | 'na'

interface AddEquipForm {
  kind: 'equipment' | 'system'
  category: string
  tag: string
  descriptor: string
  location: string
  area_served: string
}

const EMPTY_EQUIP: AddEquipForm = {
  kind: 'equipment', category: '', tag: '', descriptor: '', location: '', area_served: '',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// THE 'na' STATUS IS DEPRECATED IN PLACE (ruling D1). The cycle no longer writes
// it: applicability is a separate axis now, and a status that can overwrite 'done'
// cannot express "does not apply" without destroying "was completed". Existing
// 'na' values still READ correctly everywhere — deprecated, not deleted.
//
//   blank → done → in progress → blank
//
// Not-applicable is set by alt-click or by a ratified rule, never by cycling.
function nextStatus(s: CellStatus | undefined): CellStatus | null {
  if (!s) return 'done'
  if (s === 'done') return 'in_progress'
  return null // in_progress (or a legacy 'na') → blank
}

// One color per stage group, indexed by position in the sorted list
const GROUP_HDR = [
  'bg-slate-200 text-slate-800',
  'bg-sky-200 text-sky-900',
  'bg-cyan-200 text-cyan-900',
  'bg-amber-200 text-amber-900',
  'bg-amber-300 text-amber-950',
  'bg-violet-200 text-violet-900',
  'bg-yellow-200 text-yellow-900',
  'bg-orange-200 text-orange-900',
  'bg-orange-300 text-orange-950',
  'bg-rose-200 text-rose-900',
  'bg-emerald-200 text-emerald-900',
  'bg-green-300 text-green-950',
]

const GROUP_CELL = [
  'bg-slate-50',
  'bg-sky-50',
  'bg-cyan-50',
  'bg-amber-50',
  'bg-amber-50',
  'bg-violet-50',
  'bg-yellow-50',
  'bg-orange-50',
  'bg-orange-50',
  'bg-rose-50',
  'bg-emerald-50',
  'bg-green-50',
]

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
}

export function CxIndexPage({ projectId }: Props) {
  const [groups, setGroups]       = useState<CxStageGroup[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [cells, setCells]         = useState<Map<string, CellStatus>>(new Map())
  /** A2 — the sparse not-applicable overlay. A key PRESENT means not applicable;
   *  absent means applicable. The value is the SOURCE, which is what makes a
   *  manual override immune to rule re-application. */
  const [naMap, setNaMap] = useState<Map<string, 'rule' | 'manual'>>(new Map())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loading, setLoading]     = useState(true)
  const [initing, setIniting]     = useState(false)

  // Structure panel
  const [structureOpen, setStructureOpen]   = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingColId, setEditingColId]     = useState<string | null>(null)
  const [editName, setEditName]             = useState('')
  const [addingColForGroup, setAddingColForGroup] = useState<string | null>(null)
  const [newColLabel, setNewColLabel]       = useState('')

  // Add equipment modal
  // ── A1: find, filter, and the per-unit panel ──────────────────────────────
  // Pure UI over data already loaded. No AI, no schema, no round-trip — the
  // matrix is 367 x 88 on a real project and the answer to "where is AHU-3" must
  // arrive at the speed of typing.
  const [query, setQuery]   = useState('')
  const [fType, setFType]   = useState('')
  const [fCat, setFCat]     = useState('')
  const [fState, setFState] = useState('')     // `${groupId}:outstanding|complete`
  const [panelUnit, setPanelUnit] = useState<Equipment | null>(null)

  const [addEquipOpen, setAddEquipOpen] = useState(false)
  const [addEquipForm, setAddEquipForm] = useState<AddEquipForm>(EMPTY_EQUIP)
  const [savingEquip, setSavingEquip]   = useState(false)

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [gRes, eRes, cRes, aRes] = await Promise.all([
      supabase
        .from('project_cx_stage_groups')
        .select('id, project_id, name, sort_order, project_cx_columns(id, stage_group_id, label, sort_order)')
        .eq('project_id', projectId)
        .order('sort_order'),
      supabase
        .from('equipment')
        .select('*')
        .eq('project_id', projectId)
        .order('category')
        .order('sort_order'),
      supabase
        .from('cx_cell_values')
        .select('equipment_id, column_id, status')
        .eq('project_id', projectId),
      supabase
        .from('cx_cell_applicability')
        .select('equipment_id, column_id, source')
        .eq('project_id', projectId),
    ])

    const rawGroups = (gRes.data ?? []) as any[]
    const sortedGroups: CxStageGroup[] = rawGroups.map(g => ({
      ...g,
      columns: [...(g.project_cx_columns ?? [])].sort(
        (a: CxColumn, b: CxColumn) => a.sort_order - b.sort_order
      ),
    }))
    setGroups(sortedGroups)
    setEquipment((eRes.data ?? []) as Equipment[])

    const cellMap = new Map<string, CellStatus>()
    ;(cRes.data ?? []).forEach((row: any) => {
      cellMap.set(`${row.equipment_id}:${row.column_id}`, row.status as CellStatus)
    })
    setCells(cellMap)

    const na = new Map<string, 'rule' | 'manual'>()
    ;(aRes.data ?? []).forEach((row: any) => {
      na.set(`${row.equipment_id}:${row.column_id}`, row.source)
    })
    setNaMap(na)
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Initialize from firm default ────────────────────────────────────────────

  async function initFromDefault() {
    setIniting(true)
    const [dgRes, dcRes] = await Promise.all([
      supabase.from('cx_default_stage_groups').select('*').order('sort_order'),
      supabase.from('cx_default_columns').select('*').order('sort_order'),
    ])
    const defaultGroups = (dgRes.data ?? []) as any[]
    const defaultColumns = (dcRes.data ?? []) as any[]

    for (const dg of defaultGroups) {
      const { data: newGroup, error: gErr } = await supabase
        .from('project_cx_stage_groups')
        .insert({ project_id: projectId, name: dg.name, sort_order: dg.sort_order })
        .select('id')
        .single()
      // If the very first insert is blocked (e.g. RLS), every one will be — surface
      // and stop rather than silently doing nothing. fetchAll shows any partial state.
      if (gErr) { reportError(gErr, 'initialize the Cx Index from the firm default'); await fetchAll(); setIniting(false); return }
      if (!newGroup) continue
      const cols = defaultColumns
        .filter((dc: any) => dc.stage_group_id === dg.id)
        .map((dc: any) => ({
          stage_group_id: newGroup.id,
          label: dc.label,
          sort_order: dc.sort_order,
        }))
      if (cols.length > 0) {
        const { error: cErr } = await supabase.from('project_cx_columns').insert(cols)
        if (cErr) { reportError(cErr, 'initialize the Cx Index columns'); await fetchAll(); setIniting(false); return }
      }
    }
    await fetchAll()
    setIniting(false)
  }

  /**
   * MANUAL APPLICABILITY OVERRIDE — alt-click a cell.
   *
   * Writes source='manual', which is what makes it immune to rule re-application:
   * A3 re-applies rules against source='rule' rows ONLY. The precedence lives in
   * the column rather than in the care of whoever writes the next query.
   *
   * Marking not-applicable NEVER touches cx_cell_values, so a done cell keeps its
   * status and stays visible, struck through.
   */
  async function toggleApplicable(equipId: string, colId: string) {
    const key = `${equipId}:${colId}`
    const wasNa = naMap.has(key)

    setNaMap(prev => {
      const m = new Map(prev)
      if (wasNa) m.delete(key)
      else m.set(key, 'manual')
      return m
    })

    const { data: auth } = await supabase.auth.getUser()
    const { error } = wasNa
      ? await supabase.from('cx_cell_applicability').delete()
          .eq('equipment_id', equipId).eq('column_id', colId)
      : await supabase.from('cx_cell_applicability').upsert({
          project_id: projectId, equipment_id: equipId, column_id: colId,
          applicable: false, source: 'manual', set_by: auth?.user?.id ?? null,
          set_at: new Date().toISOString(),
        }, { onConflict: 'equipment_id,column_id' })

    if (error) {
      reportError(error, 'change whether this applies')
      await fetchAll()          // the optimistic view was a guess; refetch the truth
    }
  }

  // ── Cell toggle (optimistic) ────────────────────────────────────────────────

  async function toggleCell(equipId: string, colId: string) {
    const key = `${equipId}:${colId}`
    const current = cells.get(key)
    const next = nextStatus(current)

    setCells(prev => {
      const m = new Map(prev)
      if (next === null) m.delete(key)
      else m.set(key, next)
      return m
    })

    const { error } = next === null
      ? await supabase
          .from('cx_cell_values')
          .delete()
          .eq('equipment_id', equipId)
          .eq('column_id', colId)
      : await supabase.from('cx_cell_values').upsert(
          {
            project_id: projectId,
            equipment_id: equipId,
            column_id: colId,
            status: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'equipment_id,column_id' }
        )

    if (error) {
      // Roll the one cell back to its pre-click value — don't refetch the whole
      // matrix (that would clobber other in-flight optimistic toggles).
      setCells(prev => {
        const m = new Map(prev)
        if (current === undefined) m.delete(key)
        else m.set(key, current)
        return m
      })
      reportError(error, 'save the progress update')
    }
  }

  // ── Progress ────────────────────────────────────────────────────────────────

  /** Applicable unless the overlay says otherwise. Absent row = applicable. */
  const isNa = (equipId: string, colId: string) => naMap.has(`${equipId}:${colId}`)

  /**
   * PROGRESS EXCLUDES NOT-APPLICABLE FROM BOTH SIDES.
   *
   * A cell that does not apply is not work outstanding, so it leaves the
   * denominator. It also leaves the NUMERATOR even when its status is 'done' —
   * otherwise a unit with more done-then-N/A'd cells than applicable ones reports
   * over 100%, which is the arithmetic telling an obvious lie.
   *
   * The done-on-later-N/A'd cell still RENDERS (struck through). It is the one
   * state the UI shows that the arithmetic ignores, and hiding it would quietly
   * discard a record of work someone actually did.
   */
  function rowProgress(equipId: string) {
    let done = 0, total = 0
    groups.forEach(g =>
      g.columns.forEach(col => {
        if (isNa(equipId, col.id)) return
        const s = cells.get(`${equipId}:${col.id}`)
        if (s === 'na') return          // deprecated status, still honoured on read
        total++
        if (s === 'done') done++
      })
    )
    return { done, total }
  }

  // ── Equipment ───────────────────────────────────────────────────────────────

  async function saveEquipment() {
    if (!addEquipForm.tag.trim() && !addEquipForm.descriptor.trim()) return
    setSavingEquip(true)
    const maxSort = equipment.reduce((m, e) => Math.max(m, e.sort_order), 0)
    const { error } = await supabase.from('equipment').insert({
      project_id: projectId,
      kind: addEquipForm.kind,
      category: addEquipForm.category.trim() || null,
      tag: addEquipForm.tag.trim() || null,
      descriptor: addEquipForm.descriptor.trim() || null,
      location: addEquipForm.location.trim() || null,
      area_served: addEquipForm.area_served.trim() || null,
      sort_order: maxSort + 1,
    })
    // On failure keep the modal open with the entered values for retry.
    if (reportError(error, 'add the equipment')) { setSavingEquip(false); return }
    setSavingEquip(false)
    setAddEquipOpen(false)
    setAddEquipForm(EMPTY_EQUIP)
    fetchAll()
  }

  // ── Structure: groups ───────────────────────────────────────────────────────

  async function saveGroupName(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingGroupId(null); return }
    const { error } = await supabase.from('project_cx_stage_groups').update({ name: trimmed }).eq('id', id)
    if (error) { reportError(error, 'rename the group'); setEditingGroupId(null); await fetchAll(); return }
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name: trimmed } : g))
    setEditingGroupId(null)
  }

  async function moveGroup(id: string, dir: 'up' | 'down') {
    const idx = groups.findIndex(g => g.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= groups.length) return
    const a = groups[idx], b = groups[swapIdx]
    const [ra, rb] = await Promise.all([
      supabase.from('project_cx_stage_groups').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('project_cx_stage_groups').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    // A half-applied swap corrupts ordering — surface and reload server truth.
    if (reportError(ra.error ?? rb.error, 'reorder the groups')) { await fetchAll(); return }
    const next = [...groups]
    next[idx] = { ...b, sort_order: a.sort_order }
    next[swapIdx] = { ...a, sort_order: b.sort_order }
    next.sort((x, y) => x.sort_order - y.sort_order)
    setGroups(next)
  }

  async function deleteGroup(id: string) {
    const g = groups.find(x => x.id === id)
    if (!g) return
    const hasData = g.columns.some(col =>
      [...cells.keys()].some(k => k.endsWith(`:${col.id}`))
    )
    const msg = hasData
      ? `"${g.name}" has progress data. Delete this group and all its progress data?`
      : `Delete group "${g.name}" and its ${g.columns.length} column${g.columns.length !== 1 ? 's' : ''}?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('project_cx_stage_groups').delete().eq('id', id)
    if (reportError(error, 'delete the group')) return
    setGroups(prev => prev.filter(x => x.id !== id))
  }

  async function addGroup() {
    const name = prompt('New stage group name:')?.trim()
    if (!name) return
    const maxSort = groups.reduce((m, g) => Math.max(m, g.sort_order), 0)
    const { data, error } = await supabase
      .from('project_cx_stage_groups')
      .insert({ project_id: projectId, name, sort_order: maxSort + 1 })
      .select('id, project_id, name, sort_order')
      .single()
    if (reportError(error, 'add the group')) return
    if (data) setGroups(prev => [...prev, { ...(data as any), columns: [] }])
  }

  // ── Structure: columns ──────────────────────────────────────────────────────

  async function saveColLabel(id: string, label: string, groupId: string) {
    const trimmed = label.trim()
    if (!trimmed) { setEditingColId(null); return }
    const { error } = await supabase.from('project_cx_columns').update({ label: trimmed }).eq('id', id)
    if (error) { reportError(error, 'rename the column'); setEditingColId(null); await fetchAll(); return }
    setGroups(prev => prev.map(g =>
      g.id !== groupId ? g : {
        ...g,
        columns: g.columns.map(c => c.id === id ? { ...c, label: trimmed } : c),
      }
    ))
    setEditingColId(null)
  }

  async function moveColumn(id: string, groupId: string, dir: 'up' | 'down') {
    const g = groups.find(x => x.id === groupId)
    if (!g) return
    const idx = g.columns.findIndex(c => c.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= g.columns.length) return
    const a = g.columns[idx], b = g.columns[swapIdx]
    const [ra, rb] = await Promise.all([
      supabase.from('project_cx_columns').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('project_cx_columns').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    if (reportError(ra.error ?? rb.error, 'reorder the columns')) { await fetchAll(); return }
    const newCols = [...g.columns]
    newCols[idx] = { ...b, sort_order: a.sort_order }
    newCols[swapIdx] = { ...a, sort_order: b.sort_order }
    newCols.sort((x, y) => x.sort_order - y.sort_order)
    setGroups(prev => prev.map(x => x.id === groupId ? { ...x, columns: newCols } : x))
  }

  async function deleteColumn(id: string, groupId: string) {
    const g = groups.find(x => x.id === groupId)
    const col = g?.columns.find(c => c.id === id)
    if (!col) return
    const dataCount = [...cells.keys()].filter(k => k.endsWith(`:${id}`)).length
    const msg = dataCount > 0
      ? `Column "${col.label}" has ${dataCount} progress entr${dataCount !== 1 ? 'ies' : 'y'}. Delete anyway?`
      : `Delete column "${col.label}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('project_cx_columns').delete().eq('id', id)
    if (reportError(error, 'delete the column')) return
    setGroups(prev => prev.map(g =>
      g.id !== groupId ? g : { ...g, columns: g.columns.filter(c => c.id !== id) }
    ))
  }

  async function confirmAddColumn(groupId: string) {
    const label = newColLabel.trim()
    if (!label) return
    const g = groups.find(x => x.id === groupId)
    const maxSort = g ? g.columns.reduce((m, c) => Math.max(m, c.sort_order), 0) : 0
    const { data, error } = await supabase
      .from('project_cx_columns')
      .insert({ stage_group_id: groupId, label, sort_order: maxSort + 1 })
      .select('id, stage_group_id, label, sort_order')
      .single()
    // Keep the inline add row open with the typed label on failure.
    if (reportError(error, 'add the column')) return
    if (data) {
      setGroups(prev => prev.map(g =>
        g.id !== groupId ? g : { ...g, columns: [...g.columns, data as CxColumn] }
      ))
    }
    setAddingColForGroup(null)
    setNewColLabel('')
  }

  // ── Group collapse ──────────────────────────────────────────────────────────

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-sm text-gray-400">Cx Index not yet initialized for this project.</p>
        <p className="text-xs text-gray-300">Initializes from the firm default — 12 stage groups, 88 columns.</p>
        <button
          onClick={initFromDefault}
          disabled={initing}
          className="mt-2 px-5 py-2 bg-teal-700 text-white text-sm rounded hover:bg-teal-800 disabled:opacity-50"
        >
          {initing ? 'Initializing…' : 'Initialize Cx Index'}
        </button>
      </div>
    )
  }

  // Group equipment by category for header rows
  // SEARCH AND FILTER DO DIFFERENT JOBS, deliberately.
  //   filters HIDE   — narrowing the register to a workable set
  //   search HIGHLIGHTS — you want to SEE the unit in its row of context, not
  //                       alone on an empty grid. Hiding everything else is the
  //                       wrong answer to "where is AHU-3".
  const q = query.trim().toLowerCase()
  const matchesQuery = (e: Equipment) =>
    !!q && ((e.tag ?? '').toLowerCase().includes(q) ||
            (e.descriptor ?? '').toLowerCase().includes(q))

  const stageState = (equipId: string, g: CxStageGroup) => {
    let outstanding = 0, done = 0, na = 0
    g.columns.forEach(c => {
      const st = cells.get(`${equipId}:${c.id}`)
      if (isNa(equipId, c.id) || st === 'na') na++
      else if (st === 'done') done++
      else outstanding++
    })
    return { outstanding, done, na }
  }

  const passesFilters = (e: Equipment) => {
    if (fType && (e.equipment_type ?? '') !== fType) return false
    if (fCat && (e.category ?? '') !== fCat) return false
    if (fState) {
      const [gid, want] = fState.split(':')
      const g = groups.find(x => x.id === gid)
      if (g) {
        const { outstanding } = stageState(e.id, g)
        if (want === 'outstanding' && outstanding === 0) return false
        if (want === 'complete' && outstanding > 0) return false
      }
    }
    return true
  }

  const visible = equipment.filter(passesFilters)
  const matchCount = visible.filter(matchesQuery).length
  const typeOptions = [...new Set(equipment.map(e => e.equipment_type).filter(Boolean))].sort() as string[]
  const catOptions  = [...new Set(equipment.map(e => e.category).filter(Boolean))].sort() as string[]
  const filtersOn = !!(fType || fCat || fState)

  /** Jump to the first match. The matrix is wider than any screen, so scrolling a
   *  row into view has to bring the STICKY TAG COLUMN with it — centring on the
   *  row and leaving the horizontal scroll where it was would land the user on
   *  column 60 of a row they cannot identify. */
  function jumpToFirstMatch() {
    const first = visible.find(matchesQuery)
    if (!first) return
    const el = document.querySelector(`[data-unit-row="${first.id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const scroller = el?.closest('.overflow-auto')
    if (scroller) scroller.scrollLeft = 0
  }

  const seen = new Set<string>()
  const catOrder: string[] = []
  visible.forEach(e => {
    const c = e.category ?? ''
    if (!seen.has(c)) { seen.add(c); catOrder.push(c) }
  })
  const byCategory = catOrder.map(cat => ({
    cat,
    items: visible.filter(e => (e.category ?? '') === cat),
  }))

  const totalCols = groups.reduce((s, g) => s + g.columns.length, 0)
  const totalEntries = cells.size

  return (
    <div className="flex flex-col h-full min-h-0 rise">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 shrink-0">
        <span className="text-[11px] text-gray-400 mr-auto font-mono">
          {filtersOn
            ? `${visible.length} of ${equipment.length} items`
            : `${equipment.length} items`} · {totalCols} columns · {totalEntries} entries
        </span>
        <button
          onClick={() => setStructureOpen(true)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-colors"
        >
          Edit Structure
        </button>
        <button
          onClick={() => setAddEquipOpen(true)}
          className="px-3 py-1.5 text-xs bg-teal-700 text-white rounded hover:bg-teal-800 transition-colors"
        >
          + Add Equipment
        </button>
      </div>

      {/* ── A1: find + filter ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-2 border-b border-gray-100 shrink-0">
        <div className="relative">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') jumpToFirstMatch() }}
            placeholder="Find a tag…"
            aria-label="Find equipment by tag or descriptor"
            className="border border-gray-200 rounded pl-2 pr-16 py-1 text-xs w-52 focus:outline-none focus:border-teal-400"
          />
          {q && (
            <button
              onClick={jumpToFirstMatch}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-teal-700 hover:underline">
              {matchCount} ↵
            </button>
          )}
        </div>

        <select value={fType} onChange={e => setFType(e.target.value)} aria-label="Filter by type"
          className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 focus:outline-none focus:border-teal-400">
          <option value="">All types</option>
          {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={fCat} onChange={e => setFCat(e.target.value)} aria-label="Filter by category"
          className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 max-w-[14rem] focus:outline-none focus:border-teal-400">
          <option value="">All categories</option>
          {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* The question a CxA actually asks: "what's outstanding in X?" */}
        <select value={fState} onChange={e => setFState(e.target.value)} aria-label="Filter by stage state"
          className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 max-w-[16rem] focus:outline-none focus:border-teal-400">
          <option value="">Any stage state</option>
          {groups.map(g => (
            <Fragment key={g.id}>
              <option value={`${g.id}:outstanding`}>{g.name} — outstanding</option>
              <option value={`${g.id}:complete`}>{g.name} — complete</option>
            </Fragment>
          ))}
        </select>

        {filtersOn && (
          <button onClick={() => { setFType(''); setFCat(''); setFState('') }}
            className="text-[11px] text-gray-500 hover:text-teal-700">Clear filters</button>
        )}

        {filtersOn && visible.length === 0 && (
          <span className="text-[11px] text-amber-700">
            No equipment matches — clear a filter to see the register again.
          </span>
        )}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-1.5 border-b border-gray-100 shrink-0 bg-gray-50/60">
        <span className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Status:</span>
        {[
          { label: 'Done', bg: 'bg-teal-700', text: 'text-white', symbol: '✓' },
          { label: 'In Progress', bg: 'bg-amber-400', text: 'text-white', symbol: '◐' },
          { label: 'Not applicable (alt-click)', bg: 'bg-gray-100', text: 'text-gray-300', symbol: '·' },
          { label: 'Done, now n/a', bg: 'bg-gray-100', text: 'text-gray-400 line-through', symbol: '✓' },
          { label: 'Blank (click to cycle)', bg: 'bg-white border border-gray-200', text: 'text-gray-300', symbol: '' },
        ].map(({ label, bg, text, symbol }) => (
          <span key={label} className="flex items-center gap-1 text-[9px] text-gray-500">
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm text-[8px] font-semibold ${bg} ${text}`}>
              {symbol}
            </span>
            {label}
          </span>
        ))}
        <span className="ml-4 text-[9px] text-gray-400">
          Click header to collapse · <span className="font-semibold">alt-click a cell</span> = does not apply
        </span>
      </div>

      {/* ── Matrix ─────────────────────────────────────────────────────────── */}
      {/* Scroll affordance for phones: the matrix scrolls and the tag column is
          sticky, but the audit found nothing SIGNALS it (§6C's simplified
          mobile matrix stays roadmap — this is the owed hint, not a redesign). */}
      <p className="lg:hidden px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-gray-400 border-b border-gray-100 flex-shrink-0">
        Swipe sideways — 88 columns · tag column stays pinned →
      </p>
      <div className="overflow-auto flex-1 min-h-0">
        <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {/* # */}
            <col style={{ width: '2rem', minWidth: '2rem' }} />
            {/* Tag + Descriptor */}
            <col style={{ width: '160px', minWidth: '160px' }} />
            {/* Stage group / column cells */}
            {groups.flatMap((g) =>
              collapsed.has(g.id)
                ? [<col key={g.id} style={{ width: '2rem', minWidth: '2rem' }} />]
                : g.columns.map(col => <col key={col.id} style={{ width: '1.75rem', minWidth: '1.75rem' }} />)
            )}
            {/* Progress % */}
            <col style={{ width: '2.5rem', minWidth: '2.5rem' }} />
          </colgroup>

          <thead>
            {/* ── Row 1: Stage group headers ── */}
            <tr>
              <th
                className="sticky left-0 z-30 bg-white border-b border-r border-gray-200"
                rowSpan={2}
              />
              <th
                className="sticky left-8 z-30 bg-white border-b border-r border-gray-200 text-left px-2 text-[9px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                rowSpan={2}
              >
                Tag / Descriptor
              </th>
              {groups.map((g, gi) => {
                const isCollapsed = collapsed.has(g.id)
                const colSpan = isCollapsed ? 1 : g.columns.length
                const color = GROUP_HDR[gi % GROUP_HDR.length]
                return (
                  <th
                    key={g.id}
                    colSpan={colSpan}
                    className={`${color} border border-gray-300/60 text-center font-semibold px-1 py-1 cursor-pointer select-none whitespace-nowrap overflow-hidden`}
                    style={{ fontSize: '9px', maxWidth: isCollapsed ? '2rem' : undefined }}
                    title={isCollapsed ? `Click to expand: ${g.name}` : `Click to collapse: ${g.name}`}
                    onClick={() => toggleCollapse(g.id)}
                  >
                    {isCollapsed
                      ? <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'inline-block', fontSize: '8px' }}>▶</span>
                      : `▼ ${g.name}`
                    }
                  </th>
                )
              })}
              <th
                className="bg-gray-100 border border-gray-200 text-center font-semibold text-gray-400"
                style={{ fontSize: '9px' }}
                rowSpan={2}
              >
                %
              </th>
            </tr>

            {/* ── Row 2: Column labels (rotated) ── */}
            <tr>
              {groups.flatMap((g, gi) => {
                if (collapsed.has(g.id)) {
                  return [(
                    <th
                      key={`${g.id}-collapsed-col`}
                      className="border border-gray-200 bg-gray-50"
                      style={{ height: '120px' }}
                    />
                  )]
                }
                const cellBg = GROUP_CELL[gi % GROUP_CELL.length]
                return g.columns.map(col => (
                  <th
                    key={col.id}
                    className={`${cellBg} border border-gray-200`}
                    style={{ height: '120px', verticalAlign: 'bottom', padding: '4px 2px' }}
                    title={col.label}
                  >
                    <div
                      style={{
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        fontSize: '9px',
                        fontWeight: 500,
                        color: '#4b5563',
                        maxHeight: '112px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </div>
                  </th>
                ))
              })}
            </tr>
          </thead>

          <tbody>
            {byCategory.map(({ cat, items }) => (
              <Fragment key={cat || '__uncategorized__'}>
                {/* Category header row */}
                {cat && (
                  <tr key={`cat-${cat}`}>
                    <td className="sticky left-0 z-20 bg-gray-100 border-b border-gray-200 border-r" />
                    <td
                      className="sticky left-8 z-20 bg-gray-100 border-b border-r border-gray-200 px-2 py-0.5 font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap"
                      style={{ fontSize: '9px' }}
                    >
                      {cat}
                    </td>
                    {groups.flatMap((g) =>
                      collapsed.has(g.id)
                        ? [<td key={`${g.id}-cat`} className="bg-gray-100 border-b border-gray-200" />]
                        : g.columns.map(col => (
                            <td key={`${col.id}-cat`} className="bg-gray-100 border-b border-gray-200" />
                          ))
                    )}
                    <td className="bg-gray-100 border-b border-gray-200" />
                  </tr>
                )}

                {/* Equipment rows */}
                {items.map((equip, rowIdx) => {
                  const { done, total } = rowProgress(equip.id)
                  const pct = total === 0 ? null : Math.round((done / total) * 100)
                  const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'

                  const hit = matchesQuery(equip)
                  return (
                    <tr key={equip.id} data-unit-row={equip.id}
                        className={hit ? 'ring-2 ring-inset ring-amber-400' : undefined}>
                      {/* # */}
                      <td
                        className={`sticky left-0 z-20 ${rowBg} border-b border-r border-gray-100 text-center text-gray-300 font-mono`}
                        style={{ fontSize: '8px' }}
                      >
                        {rowIdx + 1}
                      </td>

                      {/* Tag + Descriptor */}
                      <td className={`sticky left-8 z-20 ${hit ? 'bg-amber-50' : rowBg} border-b border-r border-gray-200 px-2 py-1`}>
                        <button
                          onClick={() => setPanelUnit(equip)}
                          title="What's still needed for this unit"
                          className="font-mono font-semibold text-gray-800 leading-none hover:text-teal-700 text-left"
                          style={{ fontSize: '9px' }}>
                          {equip.tag}
                        </button>
                        {equip.descriptor && (
                          <div className="text-gray-400 leading-none mt-0.5 truncate" style={{ fontSize: '8px', maxWidth: '148px' }}>
                            {equip.descriptor}
                          </div>
                        )}
                      </td>

                      {/* Cells */}
                      {groups.flatMap((g, gi) => {
                        if (collapsed.has(g.id)) {
                          // Summary cell — group progress for this row
                          const gNa   = g.columns.filter(c => cells.get(`${equip.id}:${c.id}`) === 'na').length
                          const gDone = g.columns.filter(c => cells.get(`${equip.id}:${c.id}`) === 'done').length
                          const gTotal = g.columns.length - gNa
                          const gPct = gTotal === 0 ? 100 : Math.round((gDone / gTotal) * 100)
                          const hdr = GROUP_HDR[gi % GROUP_HDR.length].split(' ')[0] // just bg class
                          return [(
                            <td
                              key={`${g.id}-sum-${equip.id}`}
                              className={`border-b border-r border-gray-200 text-center cursor-pointer ${gPct === 100 ? hdr + ' opacity-80' : 'bg-white'}`}
                              onClick={() => toggleCollapse(g.id)}
                              title={`${g.name}: ${gPct}% — click to expand`}
                            >
                              <span
                                className={`font-semibold ${gPct === 100 ? 'text-white' : gPct > 0 ? 'text-gray-500' : 'text-gray-200'}`}
                                style={{ fontSize: '7px' }}
                              >
                                {gPct}%
                              </span>
                            </td>
                          )]
                        }

                        return g.columns.map(col => {
                          const status = cells.get(`${equip.id}:${col.id}`)
                          const na = isNa(equip.id, col.id) || status === 'na'
                          // A DONE CELL THAT NO LONGER APPLIES still renders. It
                          // leaves the arithmetic but not the record — someone did
                          // that work, and hiding it would quietly discard the fact.
                          const doneButNa = na && status === 'done'

                          const cellBg = na
                            ? 'bg-gray-100'
                            : status === 'done'
                            ? 'bg-teal-700'
                            : status === 'in_progress'
                            ? 'bg-amber-400'
                            : rowBg

                          return (
                            <td
                              key={`${col.id}-${equip.id}`}
                              className={`${cellBg} border-b border-r border-gray-100 text-center select-none transition-opacity ${
                                na ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
                              style={{ height: '1.75rem' }}
                              onClick={e => {
                                // Alt-click rules on applicability; plain click cycles
                                // status. A not-applicable cell does not cycle — there
                                // is no progress to record on work that will not happen.
                                if (e.altKey) { void toggleApplicable(equip.id, col.id); return }
                                if (!na) void toggleCell(equip.id, col.id)
                              }}
                              title={
                                na
                                  ? `${equip.tag} — ${col.label}: NOT APPLICABLE` +
                                    `${naMap.get(`${equip.id}:${col.id}`) === 'rule' ? ' (by rule)' : ''}` +
                                    `${doneButNa ? ' — was completed' : ''}` +
                                    ` · alt-click to restore`
                                  : `${equip.tag ?? equip.descriptor} — ${col.label}: ${status ?? 'blank'}` +
                                    ` · alt-click = not applicable`
                              }
                            >
                              {doneButNa && (
                                <span className="text-gray-400 line-through" style={{ fontSize: '9px' }}>✓</span>
                              )}
                              {na && !doneButNa && (
                                <span className="text-gray-300" style={{ fontSize: '8px' }}>·</span>
                              )}
                              {!na && status === 'done'        && <span className="text-white" style={{ fontSize: '10px' }}>✓</span>}
                              {!na && status === 'in_progress' && <span className="text-white" style={{ fontSize: '9px' }}>◐</span>}
                            </td>
                          )
                        })
                      })}

                      {/* Progress % */}
                      <td className="border-b border-gray-100 text-center" style={{ fontSize: '9px' }}>
                        {pct === null ? (
                          <span className="text-gray-200">—</span>
                        ) : (
                          <span className={`font-semibold ${pct === 100 ? 'text-teal-700' : pct > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                            {pct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}

            {equipment.length === 0 && (
              <tr>
                <td
                  colSpan={999}
                  className="text-center py-16 text-gray-300 text-xs"
                >
                  No equipment yet — click "+ Add Equipment" to add the first row.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Edit Structure panel (right-side drawer)
      ══════════════════════════════════════════════════════════════════════ */}
      {structureOpen && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => { setStructureOpen(false); setEditingGroupId(null); setEditingColId(null) }}
          />
          <div className="relative z-50 ml-auto w-[500px] bg-white h-full shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Edit Cx Index Structure</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Changes affect only this project. Firm default is never modified.</p>
              </div>
              <button
                onClick={() => { setStructureOpen(false); setEditingGroupId(null); setEditingColId(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Group list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {groups.map((g, gi) => (
                <div key={g.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Group row */}
                  <div className={`${GROUP_HDR[gi % GROUP_HDR.length]} px-3 py-2 flex items-center gap-1.5`}>
                    {editingGroupId === g.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => saveGroupName(g.id, editName)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveGroupName(g.id, editName)
                          if (e.key === 'Escape') setEditingGroupId(null)
                        }}
                        className="flex-1 text-xs bg-white/60 rounded px-1.5 py-0.5 border border-white/50 focus:outline-none"
                      />
                    ) : (
                      <span
                        className="flex-1 text-xs font-semibold cursor-pointer hover:underline"
                        title="Click to rename"
                        onClick={() => { setEditingGroupId(g.id); setEditName(g.name) }}
                      >
                        {g.name}
                      </span>
                    )}
                    <span className="text-[9px] opacity-50 shrink-0">{g.columns.length} cols</span>
                    <button
                      onClick={() => moveGroup(g.id, 'up')}
                      disabled={gi === 0}
                      className="px-1 text-[10px] opacity-60 hover:opacity-100 disabled:opacity-20"
                      title="Move group up"
                    >↑</button>
                    <button
                      onClick={() => moveGroup(g.id, 'down')}
                      disabled={gi === groups.length - 1}
                      className="px-1 text-[10px] opacity-60 hover:opacity-100 disabled:opacity-20"
                      title="Move group down"
                    >↓</button>
                    <button
                      onClick={() => { setAddingColForGroup(g.id); setNewColLabel('') }}
                      className="px-1.5 text-[9px] opacity-60 hover:opacity-100 font-semibold"
                      title="Add column"
                    >+col</button>
                    <button
                      onClick={() => deleteGroup(g.id)}
                      className="px-1 text-[10px] opacity-40 hover:opacity-100 hover:text-red-700"
                      title="Delete group"
                    >×</button>
                  </div>

                  {/* Columns */}
                  <div className="divide-y divide-gray-100">
                    {g.columns.map((col, ci) => (
                      <div key={col.id} className="flex items-center gap-1.5 px-3 py-1 hover:bg-gray-50">
                        <span className="w-4 shrink-0 text-[8px] text-gray-300 font-mono text-right">{ci + 1}</span>
                        {editingColId === col.id ? (
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onBlur={() => saveColLabel(col.id, editName, g.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveColLabel(col.id, editName, g.id)
                              if (e.key === 'Escape') setEditingColId(null)
                            }}
                            className="flex-1 text-[10px] border border-teal-300 rounded px-1.5 py-0.5 focus:outline-none"
                          />
                        ) : (
                          <span
                            className="flex-1 text-[10px] text-gray-700 cursor-pointer hover:text-teal-700 leading-snug"
                            title="Click to rename"
                            onClick={() => { setEditingColId(col.id); setEditName(col.label) }}
                          >
                            {col.label}
                          </span>
                        )}
                        <button
                          onClick={() => moveColumn(col.id, g.id, 'up')}
                          disabled={ci === 0}
                          className="text-[9px] text-gray-300 hover:text-gray-600 disabled:opacity-20 px-0.5 shrink-0"
                        >↑</button>
                        <button
                          onClick={() => moveColumn(col.id, g.id, 'down')}
                          disabled={ci === g.columns.length - 1}
                          className="text-[9px] text-gray-300 hover:text-gray-600 disabled:opacity-20 px-0.5 shrink-0"
                        >↓</button>
                        <button
                          onClick={() => deleteColumn(col.id, g.id)}
                          className="text-[9px] text-gray-300 hover:text-red-500 px-0.5 shrink-0"
                        >×</button>
                      </div>
                    ))}

                    {/* Inline add column row */}
                    {addingColForGroup === g.id ? (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-teal-50">
                        <span className="w-4 shrink-0 text-[8px] text-gray-300 font-mono text-right">{g.columns.length + 1}</span>
                        <input
                          autoFocus
                          value={newColLabel}
                          onChange={e => setNewColLabel(e.target.value)}
                          placeholder="Column label…"
                          onKeyDown={e => {
                            if (e.key === 'Enter') confirmAddColumn(g.id)
                            if (e.key === 'Escape') { setAddingColForGroup(null); setNewColLabel('') }
                          }}
                          className="flex-1 text-[10px] border border-teal-300 rounded px-1.5 py-0.5 focus:outline-none bg-white"
                        />
                        <button
                          onClick={() => confirmAddColumn(g.id)}
                          className="text-[9px] text-teal-700 font-semibold hover:text-teal-900"
                        >Add</button>
                        <button
                          onClick={() => { setAddingColForGroup(null); setNewColLabel('') }}
                          className="text-[9px] text-gray-400 hover:text-gray-600"
                        >Cancel</button>
                      </div>
                    ) : g.columns.length === 0 ? (
                      <div className="px-3 py-1.5 text-[9px] text-gray-300 italic">No columns — click +col to add one</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Add group */}
            <div className="px-4 py-3 border-t border-gray-100 shrink-0">
              <button
                onClick={addGroup}
                className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400 hover:text-gray-700 hover:border-gray-400 transition-colors"
              >
                + Add Stage Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Add Equipment modal
      ══════════════════════════════════════════════════════════════════════ */}
      {addEquipOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => { setAddEquipOpen(false); setAddEquipForm(EMPTY_EQUIP) }}
          />
          <div className="relative z-50 bg-white rounded-xl shadow-2xl w-[480px] p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-5">Add Equipment / System</h2>

            <div className="space-y-4">
              {/* Kind */}
              <div className="flex gap-4">
                {(['equipment', 'system'] as const).map(k => (
                  <label key={k} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600">
                    <input
                      type="radio"
                      name="kind"
                      value={k}
                      checked={addEquipForm.kind === k}
                      onChange={() => setAddEquipForm(f => ({ ...f, kind: k }))}
                      className="accent-teal-700"
                    />
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </label>
                ))}
              </div>

              {/* Category */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Category</label>
                <Combobox
                  value={addEquipForm.category}
                  options={[...new Set(equipment.map(e => e.category).filter(Boolean))] as string[]}
                  onChange={v => setAddEquipForm(f => ({ ...f, category: v }))}
                  placeholder="e.g. PUMPS · AHU · VAV BOXES"
                  ariaLabel="Category"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                />
              </div>

              {/* Tag + Descriptor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Tag</label>
                  <input
                    value={addEquipForm.tag}
                    onChange={e => setAddEquipForm(f => ({ ...f, tag: e.target.value }))}
                    placeholder="GEO-P-01"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Descriptor</label>
                  <input
                    value={addEquipForm.descriptor}
                    onChange={e => setAddEquipForm(f => ({ ...f, descriptor: e.target.value }))}
                    placeholder="GEOTHERMAL PUMP"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                  />
                </div>
              </div>

              {/* Location + Area Served */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Location</label>
                  <input
                    value={addEquipForm.location}
                    onChange={e => setAddEquipForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="L1 Mech Room"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wide font-semibold">Area Served</label>
                  <input
                    value={addEquipForm.area_served}
                    onChange={e => setAddEquipForm(f => ({ ...f, area_served: e.target.value }))}
                    placeholder="ENTIRE BUILDING"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => { setAddEquipOpen(false); setAddEquipForm(EMPTY_EQUIP) }}
                className="px-4 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveEquipment}
                disabled={savingEquip || (!addEquipForm.tag.trim() && !addEquipForm.descriptor.trim())}
                className="px-5 py-2 text-xs bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-40 transition-colors"
              >
                {savingEquip ? 'Adding…' : 'Add Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── A1: the per-unit panel — "what's still needed" ─────────────────── */}
      {/* The matrix answers "how is the project doing". This answers "what does
          THIS unit still need", which is the question asked standing in front of
          it. Same data, one column instead of eighty-eight. */}
      {panelUnit && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true"
             aria-label={`What's still needed for ${panelUnit.tag}`}>
          <button className="absolute inset-0 bg-gray-900/20" aria-label="Close"
                  onClick={() => setPanelUnit(null)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-xl flex flex-col">
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-gray-900 text-sm">{panelUnit.tag}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {panelUnit.descriptor || panelUnit.category || '—'}
                </div>
                {(panelUnit.location || panelUnit.area_served) && (
                  <div className="text-[10px] text-gray-400 truncate mt-0.5">
                    {[panelUnit.location, panelUnit.area_served].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <button onClick={() => setPanelUnit(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none shrink-0">×</button>
            </div>

            {(() => {
              const rows = groups.map(g => ({ g, st: stageState(panelUnit.id, g) }))
              const outstandingTotal = rows.reduce((n, r) => n + r.st.outstanding, 0)
              const doneTotal = rows.reduce((n, r) => n + r.st.done, 0)
              return (
                <>
                  <div className="px-4 py-2 border-b border-gray-100 shrink-0">
                    <span className="text-[11px] text-gray-500">
                      <span className="font-semibold text-gray-800">{outstandingTotal}</span> outstanding
                      <span className="text-gray-300"> · </span>
                      {doneTotal} done
                    </span>
                  </div>
                  <div className="overflow-y-auto flex-1 min-h-0 px-4 py-3 space-y-3">
                    {rows.map(({ g, st }) => (
                      <div key={g.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <h4 className="text-[11px] font-semibold text-gray-800">{g.name}</h4>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {st.done}/{st.done + st.outstanding || 0}
                            {st.na > 0 && <span className="text-gray-300"> · {st.na} n/a</span>}
                          </span>
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {g.columns.map(col => {
                            const status = cells.get(`${panelUnit.id}:${col.id}`)
                            const mark = status === 'done' ? '✓' : status === 'in_progress' ? '◐'
                                       : status === 'na' ? '—' : '○'
                            const cls = status === 'done' ? 'text-teal-700'
                                      : status === 'in_progress' ? 'text-amber-600'
                                      : status === 'na' ? 'text-gray-300'
                                      : 'text-gray-500'
                            return (
                              <li key={col.id} className="flex items-start gap-1.5 text-[11px]">
                                <span className={`${cls} font-semibold w-3 shrink-0`}>{mark}</span>
                                <span className={status === 'na' ? 'text-gray-300 line-through' : 'text-gray-700'}>
                                  {col.label}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
