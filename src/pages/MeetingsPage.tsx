import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authedFetch, apiErrorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { FindingPicker, type PickerFinding } from '../components/FindingPicker'
import { useAuth } from '../contexts/AuthContext'
import type { Meeting, MeetingType, MeetingTopic, MeetingAttendee, MeetingItem } from '../types/database'

// ── Local types ────────────────────────────────────────────────────────────

interface MeetingRow extends Meeting {
  meeting_types: { name: string } | null
}

interface TeamOption {
  id: string
  contact_id: string | null
  label: string          // "GC — Bird Construction"
  role_name: string
}

interface AttendeeRow extends MeetingAttendee {
  contacts: { id: string; name: string; companies: { name: string } | null } | null
}

const TYPE_COLORS: Record<number, string> = {
  0: 'bg-teal-50 text-teal-700', 1: 'bg-blue-50 text-blue-700', 2: 'bg-violet-50 text-violet-700',
  3: 'bg-amber-50 text-amber-700', 4: 'bg-rose-50 text-rose-700', 5: 'bg-emerald-50 text-emerald-700',
  6: 'bg-slate-100 text-slate-600', 7: 'bg-gray-100 text-gray-500',
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props { projectId: string }

export function MeetingsPage({ projectId }: Props) {
  const { profile } = useAuth()

  const [meetings, setMeetings]   = useState<MeetingRow[]>([])
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({})
  const [types, setTypes]         = useState<MeetingType[]>([])
  const [team, setTeam]           = useState<TeamOption[]>([])
  const [teamByContact, setTeamByContact] = useState<Record<string, string>>({})  // contact_id -> role name
  const [contacts, setContacts]   = useState<Array<{ id: string; name: string; company: string | null }>>([])
  const [findings, setFindings]   = useState<PickerFinding[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Detail
  const [topics, setTopics]       = useState<MeetingTopic[]>([])
  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [items, setItems]         = useState<MeetingItem[]>([])
  const [itemDrafts, setItemDrafts] = useState<Record<string, Partial<MeetingItem>>>({})
  // Items whose Responsible is in free-text mode ("Other…") before any text exists.
  const [textModeItems, setTextModeItems] = useState<Set<string>>(new Set())

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    meeting_type_id: '', meeting_number: 1, meeting_date: todayISO(),
    start_time: '', location: '', carryForward: true,
  })
  const [carryInfo, setCarryInfo] = useState<{ prior: MeetingRow; count: number } | null>(null)
  const [creating, setCreating]   = useState(false)

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    meeting_number: 1, meeting_date: '', start_time: '', location: '',
    prepared_by: '', next_meeting_date: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // Attendee picker
  const [attendeeOpen, setAttendeeOpen] = useState(false)
  const [attendeeQuery, setAttendeeQuery] = useState('')
  const [guestOpen, setGuestOpen] = useState(false)
  const [guestForm, setGuestForm] = useState({ name: '', company: '', role: '' })

  // Topic add
  const [newTopic, setNewTopic] = useState('')

  // Delete + generate
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  // ── Data ────────────────────────────────────────────────────────────────

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('meetings')
      .select('*, meeting_types(name)')
      .eq('project_id', projectId)
      .order('meeting_date', { ascending: false })
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as unknown as MeetingRow[]
    setMeetings(rows)
    if (rows.length) {
      const { data: it } = await supabase
        .from('meeting_items').select('meeting_id, status')
        .in('meeting_id', rows.map(m => m.id))
      const counts: Record<string, number> = {}
      for (const r of it ?? []) if (r.status === 'open') counts[r.meeting_id] = (counts[r.meeting_id] ?? 0) + 1
      setOpenCounts(counts)
    } else setOpenCounts({})
    setLoading(false)
  }, [projectId])

  const fetchSupport = useCallback(async () => {
    const [tyRes, taRes, cRes, fRes] = await Promise.all([
      supabase.from('meeting_types').select('*').eq('active', true).order('sort_order'),
      supabase.from('project_team_assignments')
        .select('id, contact_id, sort_order, companies(name, abbreviation), company_role_types(name, abbreviation)')
        .eq('project_id', projectId).order('sort_order'),
      supabase.from('contacts').select('id, name, companies(name)').order('name'),
      supabase.from('findings').select('id, number, title, status').eq('project_id', projectId).order('number'),
    ])
    setTypes((tyRes.data ?? []) as MeetingType[])
    const teamOpts: TeamOption[] = ((taRes.data ?? []) as any[]).map(a => {
      const co = Array.isArray(a.companies) ? a.companies[0] : a.companies
      const ro = Array.isArray(a.company_role_types) ? a.company_role_types[0] : a.company_role_types
      return {
        id: a.id,
        contact_id: a.contact_id,
        label: `${ro?.abbreviation ?? ro?.name ?? '?'} — ${co?.name ?? '?'}`,
        role_name: ro?.name ?? '',
      }
    })
    setTeam(teamOpts)
    const byContact: Record<string, string> = {}
    for (const t of teamOpts) if (t.contact_id && !byContact[t.contact_id]) byContact[t.contact_id] = t.role_name
    setTeamByContact(byContact)
    setContacts(((cRes.data ?? []) as any[]).map(c => ({
      id: c.id, name: c.name,
      company: (Array.isArray(c.companies) ? c.companies[0] : c.companies)?.name ?? null,
    })))
    setFindings((fRes.data ?? []) as PickerFinding[])
  }, [projectId])

  const fetchDetail = useCallback(async (meetingId: string) => {
    const [tRes, aRes, iRes] = await Promise.all([
      supabase.from('meeting_topics').select('*').eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('meeting_attendees')
        .select('*, contacts(id, name, companies(name))')
        .eq('meeting_id', meetingId).order('sort_order'),
      supabase.from('meeting_items').select('*').eq('meeting_id', meetingId).order('sort_order'),
    ])
    setTopics((tRes.data ?? []) as MeetingTopic[])
    setAttendees((aRes.data ?? []) as unknown as AttendeeRow[])
    setItems((iRes.data ?? []) as MeetingItem[])
  }, [])

  useEffect(() => { fetchMeetings(); fetchSupport() }, [fetchMeetings, fetchSupport])
  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else { setTopics([]); setAttendees([]); setItems([]) }
  }, [selectedId, fetchDetail])

  const meeting = meetings.find(m => m.id === selectedId) ?? null

  // ── Create ──────────────────────────────────────────────────────────────

  function openCreate() {
    const firstType = types[0]?.id ?? ''
    setCreateForm({
      meeting_type_id: firstType,
      meeting_number: suggestNumber(firstType),
      meeting_date: todayISO(), start_time: '', location: '', carryForward: true,
    })
    setCarryInfo(computeCarry(firstType))
    setCreateOpen(true)
  }

  function suggestNumber(typeId: string): number {
    const nums = meetings.filter(m => m.meeting_type_id === typeId).map(m => m.meeting_number)
    return nums.length ? Math.max(...nums) + 1 : 1
  }

  function computeCarry(typeId: string): { prior: MeetingRow; count: number } | null {
    const prior = meetings
      .filter(m => m.meeting_type_id === typeId)
      .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date) || b.created_at.localeCompare(a.created_at))[0]
    if (!prior) return null
    return { prior, count: openCounts[prior.id] ?? 0 }
  }

  function onCreateTypeChange(typeId: string) {
    setCreateForm(f => ({ ...f, meeting_type_id: typeId, meeting_number: suggestNumber(typeId) }))
    setCarryInfo(computeCarry(typeId))
  }

  // COM#-pattern soft duplicate warning — warning only, no constraint.
  const createDup = meetings.some(m =>
    m.meeting_type_id === createForm.meeting_type_id && m.meeting_number === createForm.meeting_number)
  const editDup = meeting ? meetings.some(m =>
    m.id !== meeting.id && m.meeting_type_id === meeting.meeting_type_id && m.meeting_number === editForm.meeting_number) : false

  async function createMeeting() {
    if (!createForm.meeting_type_id || !createForm.meeting_date) return
    setCreating(true)

    const { data: mtg, error } = await supabase.from('meetings').insert({
      project_id: projectId,
      meeting_type_id: createForm.meeting_type_id,
      meeting_number: createForm.meeting_number,
      meeting_date: createForm.meeting_date,
      start_time: createForm.start_time || null,
      location: createForm.location.trim() || null,
      prepared_by: profile?.name ?? null,
    }).select('id, meeting_number').single()
    if (error || !mtg) { alert(error?.message ?? 'Failed to create meeting.'); setCreating(false); return }

    // Copy the type's default topics — each meeting OWNS its agenda (rule 4).
    const { data: defaults } = await supabase
      .from('meeting_type_default_topics').select('title, sort_order')
      .eq('meeting_type_id', createForm.meeting_type_id).order('sort_order')
    let newTopics: MeetingTopic[] = []
    if ((defaults ?? []).length > 0) {
      const { data: created } = await supabase.from('meeting_topics').insert(
        (defaults ?? []).map(d => ({ meeting_id: mtg.id, title: d.title, sort_order: d.sort_order }))
      ).select('*')
      newTopics = (created ?? []) as MeetingTopic[]
    }

    // Carry-forward: open items from the most recent prior meeting of this type,
    // ORIGINAL numbers retained, matched to topics by title; unmatched → Old Business.
    if (createForm.carryForward && carryInfo && carryInfo.count > 0) {
      const priorId = carryInfo.prior.id
      const [piRes, ptRes] = await Promise.all([
        supabase.from('meeting_items').select('*').eq('meeting_id', priorId).eq('status', 'open').order('sort_order'),
        supabase.from('meeting_topics').select('id, title').eq('meeting_id', priorId),
      ])
      const priorItems  = (piRes.data ?? []) as MeetingItem[]
      const priorTopics = new Map(((ptRes.data ?? []) as MeetingTopic[]).map(t => [t.id, t.title]))
      const topicByTitle = new Map(newTopics.map(t => [t.title.trim().toLowerCase(), t.id]))

      let oldBusinessId: string | null = null
      async function ensureOldBusiness(): Promise<string> {
        if (oldBusinessId) return oldBusinessId
        const { data: ob } = await supabase.from('meeting_topics')
          .insert({ meeting_id: mtg!.id, title: 'Old Business', sort_order: -1 })
          .select('id').single()
        oldBusinessId = ob!.id
        return oldBusinessId!
      }

      let sort = 0
      for (const it of priorItems) {
        const priorTitle = (priorTopics.get(it.topic_id) ?? '').trim().toLowerCase()
        const targetTopic = topicByTitle.get(priorTitle) ?? await ensureOldBusiness()
        await supabase.from('meeting_items').insert({
          meeting_id: mtg.id,
          topic_id: targetTopic,
          item_number: it.item_number,          // construction convention: number never changes
          carried_from_item_id: it.id,
          discussion: it.discussion,
          responsible_assignment_id: it.responsible_assignment_id,
          responsible_text: it.responsible_text,
          due_date: it.due_date,
          status: 'open',
          linked_finding_id: it.linked_finding_id,
          sort_order: sort++,
        })
      }
    }

    setCreating(false); setCreateOpen(false)
    await fetchMeetings()
    setSelectedId(mtg.id)
  }

  // ── Edit header ─────────────────────────────────────────────────────────

  function openEdit() {
    if (!meeting) return
    setEditForm({
      meeting_number: meeting.meeting_number,
      meeting_date: meeting.meeting_date,
      start_time: meeting.start_time ?? '',
      location: meeting.location ?? '',
      prepared_by: meeting.prepared_by ?? '',
      next_meeting_date: meeting.next_meeting_date ?? '',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!meeting) return
    setSavingEdit(true)
    await supabase.from('meetings').update({
      meeting_number: editForm.meeting_number,
      meeting_date: editForm.meeting_date,
      start_time: editForm.start_time || null,
      location: editForm.location.trim() || null,
      prepared_by: editForm.prepared_by.trim() || null,
      next_meeting_date: editForm.next_meeting_date || null,
    }).eq('id', meeting.id)
    setSavingEdit(false); setEditOpen(false)
    fetchMeetings()
  }

  // ── Attendees ───────────────────────────────────────────────────────────

  async function addAttendee(contactId: string) {
    if (!meeting) return
    const c = contacts.find(x => x.id === contactId)
    await supabase.from('meeting_attendees').insert({
      meeting_id: meeting.id,
      contact_id: contactId,
      // Snapshots stamped at pick time — attendance records survive directory churn.
      name_snapshot: c?.name ?? null,
      company_snapshot: c?.company ?? null,
      role_label: teamByContact[contactId] ?? null,
      sort_order: attendees.length,
    })
    setAttendeeOpen(false); setAttendeeQuery('')
    fetchDetail(meeting.id)
  }

  async function addGuest() {
    if (!meeting || !guestForm.name.trim()) return
    await supabase.from('meeting_attendees').insert({
      meeting_id: meeting.id,
      name_snapshot: guestForm.name.trim(),
      company_snapshot: guestForm.company.trim() || null,
      role_label: guestForm.role.trim() || null,
      sort_order: attendees.length,
    })
    setGuestOpen(false); setGuestForm({ name: '', company: '', role: '' })
    fetchDetail(meeting.id)
  }

  async function setAttendance(id: string, attendance: MeetingAttendee['attendance']) {
    await supabase.from('meeting_attendees').update({ attendance }).eq('id', id)
    if (meeting) fetchDetail(meeting.id)
  }

  async function setAttendeeRole(id: string, role_label: string) {
    await supabase.from('meeting_attendees').update({ role_label: role_label.trim() || null }).eq('id', id)
  }

  async function removeAttendee(id: string) {
    await supabase.from('meeting_attendees').delete().eq('id', id)
    if (meeting) fetchDetail(meeting.id)
  }

  const attendeeName = (a: AttendeeRow) => a.contacts?.name ?? a.name_snapshot ?? '?'
  const attendeeCompany = (a: AttendeeRow) => a.contacts?.companies?.name ?? a.company_snapshot ?? ''

  // ── Topics ──────────────────────────────────────────────────────────────

  async function addTopic() {
    if (!meeting || !newTopic.trim()) return
    const maxSort = topics.reduce((m, t) => Math.max(m, t.sort_order), -1)
    await supabase.from('meeting_topics').insert({
      meeting_id: meeting.id, title: newTopic.trim(), sort_order: maxSort + 1,
    })
    setNewTopic('')
    fetchDetail(meeting.id)
  }

  async function renameTopic(id: string, title: string) {
    if (!title.trim()) return
    await supabase.from('meeting_topics').update({ title: title.trim() }).eq('id', id)
  }

  async function moveTopic(id: string, dir: -1 | 1) {
    if (!meeting) return
    const idx = topics.findIndex(t => t.id === id)
    const swap = topics[idx + dir]
    if (!swap) return
    const a = topics[idx]
    await Promise.all([
      supabase.from('meeting_topics').update({ sort_order: swap.sort_order }).eq('id', a.id),
      supabase.from('meeting_topics').update({ sort_order: a.sort_order }).eq('id', swap.id),
    ])
    fetchDetail(meeting.id)
  }

  async function deleteTopic(t: MeetingTopic) {
    if (!meeting) return
    const n = items.filter(i => i.topic_id === t.id).length
    if (n > 0 && !confirm(`Delete topic "${t.title}" and its ${n} item(s)?`)) return
    await supabase.from('meeting_topics').delete().eq('id', t.id)
    fetchDetail(meeting.id)
  }

  // ── Items ───────────────────────────────────────────────────────────────

  function nextItemNumber(): string {
    if (!meeting) return '0.1'
    const prefix = `${meeting.meeting_number}.`
    const seqs = items
      .filter(i => i.item_number.startsWith(prefix))
      .map(i => parseInt(i.item_number.slice(prefix.length), 10))
      .filter(n => !isNaN(n))
    const next = seqs.length ? Math.max(...seqs) + 1 : 1
    return `${meeting.meeting_number}.${next}`
  }

  async function addItem(topicId: string) {
    if (!meeting) return
    const maxSort = items.reduce((m, i) => Math.max(m, i.sort_order), -1)
    await supabase.from('meeting_items').insert({
      meeting_id: meeting.id, topic_id: topicId,
      item_number: nextItemNumber(),      // stamped once, never renumbered
      discussion: '',
      sort_order: maxSort + 1,
    })
    fetchDetail(meeting.id)
  }

  async function updateItem(id: string, patch: Partial<MeetingItem>) {
    await supabase.from('meeting_items').update(patch).eq('id', id)
    setItems(list => list.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  async function deleteItem(id: string) {
    await supabase.from('meeting_items').delete().eq('id', id)
    if (meeting) fetchDetail(meeting.id)
  }

  const draftFor = (id: string) => itemDrafts[id] ?? {}
  function setDraft(id: string, patch: Partial<MeetingItem>) {
    setItemDrafts(d => ({ ...d, [id]: { ...(d[id] ?? {}), ...patch } }))
  }
  function commitDraft(id: string, field: keyof MeetingItem) {
    const v = (itemDrafts[id] as any)?.[field]
    if (v === undefined) return
    updateItem(id, { [field]: v } as Partial<MeetingItem>)
    setItemDrafts(d => { const { [id]: gone, ...rest } = d; void gone; return rest })
  }

  // ── Generate / delete ───────────────────────────────────────────────────

  async function generateMinutes() {
    if (!meeting) return
    setGenerating(true); setGenError(null)
    try {
      const res = await authedFetch('/api/generate-minutes', { meeting_id: meeting.id })
      const body = await res.json()
      if (!res.ok) throw new Error(apiErrorMessage(res.status, body.error))
      await fetchMeetings()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed.')
    }
    setGenerating(false)
  }

  async function deleteMeeting() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from('meetings').delete().eq('id', confirmDelete)
    setDeleting(false); setConfirmDelete(null); setSelectedId(null)
    fetchMeetings()
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading meetings…</div>

  const typeIdx = (id: string) => Math.max(0, types.findIndex(t => t.id === id))
  const typeBadge = (m: MeetingRow) => (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase ${TYPE_COLORS[typeIdx(m.meeting_type_id) % 8]}`}>
      {m.meeting_types?.name ?? '?'}
    </span>
  )

  return (
    <div className="flex h-full overflow-hidden rise">

      {/* ── Meeting list ─────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-gray-200 overflow-hidden flex-shrink-0 transition-all ${selectedId ? 'w-80' : 'flex-1'}`}>
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-700">Meetings</span>
          <span className="text-[10px] text-gray-400 font-mono">{meetings.length}</span>
          <button onClick={openCreate}
            className="ml-auto text-xs bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium whitespace-nowrap">
            + New Meeting
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {meetings.length === 0 ? (
            <EmptyState>
              <p className="text-sm font-medium text-gray-600 mb-1">No meetings yet</p>
              <p className="text-xs text-gray-400 mb-5 max-w-[220px] mx-auto">
                Kickoffs, recurring Cx meetings, workshops — each with its agenda skeleton and carried action items.
              </p>
              <button onClick={openCreate}
                className="text-xs bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium">
                + New Meeting
              </button>
            </EmptyState>
          ) : meetings.map(m => (
            <button key={m.id} onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors relative ${m.id === selectedId ? 'bg-teal-50/40' : ''}`}>
              {m.id === selectedId && <div className="absolute left-0 inset-y-0 w-0.5 bg-teal-500" />}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {typeBadge(m)}
                <span className="font-mono text-[11px] text-gray-500">#{m.meeting_number}</span>
                {m.status === 'issued'
                  ? <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700">ISSUED</span>
                  : <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-gray-100 text-gray-500">DRAFT</span>}
              </div>
              <div className="text-[11px] text-gray-400 flex items-center justify-between gap-2">
                <span className="font-mono">{formatDate(m.meeting_date)}</span>
                {(openCounts[m.id] ?? 0) > 0 && (
                  <span className="text-amber-600 font-medium">{openCounts[m.id]} open</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail ───────────────────────────────────────────────── */}
      {meeting && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-start gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {typeBadge(meeting)}
                <h3 className="text-sm font-semibold text-gray-900">#{meeting.meeting_number}</h3>
                {meeting.status === 'issued' && meeting.pdf_url && (
                  <>
                    <a href={meeting.pdf_url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-teal-700 hover:underline">PDF</a>
                    <a href={meeting.storage_url ?? '#'} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-teal-700 hover:underline">DOCX</a>
                  </>
                )}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                <span className="font-mono">{formatDate(meeting.meeting_date)}</span>
                {meeting.start_time && <span>{meeting.start_time.slice(0, 5)}</span>}
                {meeting.location && <span>{meeting.location}</span>}
                {meeting.prepared_by && <span>By: {meeting.prepared_by}</span>}
                {meeting.next_meeting_date && <span>Next: <span className="font-mono">{formatDate(meeting.next_meeting_date)}</span></span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={generateMinutes} disabled={generating}
                data-testid="generate-minutes"
                className="text-xs bg-emerald-600 text-white border border-emerald-700 rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-40 transition-colors font-medium">
                {generating ? 'Generating…' : meeting.status === 'issued' ? 'Regenerate' : 'Generate Minutes'}
              </button>
              <button onClick={openEdit}
                className="text-xs border border-gray-200 rounded px-3 py-1.5 text-gray-500 hover:text-teal-700 hover:border-teal-400 transition-colors">Edit</button>
              {/* Governors (admin/dev/owner) delete any; employees their OWN DRAFTS only */}
              {(['admin', 'developer', 'owner'].includes(profile?.role ?? '')
                || (meeting.status === 'draft' && meeting.prepared_by === profile?.name)) && (
                <button onClick={() => setConfirmDelete(meeting.id)}
                  className="text-xs border border-red-200 rounded px-3 py-1.5 text-red-500 hover:bg-red-50 transition-colors">Delete</button>
              )}
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700 text-lg leading-none ml-1">×</button>
            </div>
          </div>

          {genError && (
            <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">{genError}</div>
          )}

          <div className="flex-1 overflow-auto">
            {/* ── Attendees ───────────────────────────────────────── */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Attendees</h4>
                <button onClick={() => setAttendeeOpen(true)} data-testid="add-attendee"
                  className="text-[11px] text-teal-600 hover:underline">+ Add from directory</button>
                <button onClick={() => setGuestOpen(true)}
                  className="text-[11px] text-teal-600 hover:underline">+ Guest</button>
              </div>
              {attendees.length === 0 ? (
                <p className="text-xs text-gray-400">No attendees recorded.</p>
              ) : (
                <div className="space-y-1">
                  {attendees.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs group">
                      <span className="text-gray-800 font-medium">{attendeeName(a)}</span>
                      {attendeeCompany(a) && <span className="text-gray-400">— {attendeeCompany(a)}</span>}
                      <input
                        defaultValue={a.role_label ?? ''}
                        placeholder="role"
                        onBlur={e => setAttendeeRole(a.id, e.target.value)}
                        className="w-24 border border-transparent hover:border-gray-200 focus:border-teal-400 rounded px-1 py-0.5 text-[11px] text-gray-500 focus:outline-none"
                      />
                      <select value={a.attendance}
                        onChange={e => setAttendance(a.id, e.target.value as MeetingAttendee['attendance'])}
                        className={`text-[11px] border rounded px-1 py-0.5 bg-white ${
                          a.attendance === 'present' ? 'text-emerald-700 border-emerald-200'
                          : a.attendance === 'regrets' ? 'text-amber-700 border-amber-200'
                          : 'text-gray-500 border-gray-200'
                        }`}>
                        <option value="present">Present</option>
                        <option value="regrets">Regrets</option>
                        <option value="distribution">Distribution</option>
                      </select>
                      <button onClick={() => removeAttendee(a.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Topics + items ──────────────────────────────────── */}
            {topics.map((t, ti) => {
              const topicItems = items.filter(i => i.topic_id === t.id)
              return (
                <div key={t.id} className="border-b border-gray-100">
                  <div className="px-5 py-2 bg-slate-50 border-b border-gray-200 flex items-center gap-2 group">
                    <span className="text-[10px] font-mono text-gray-400">{ti + 1}</span>
                    <input
                      defaultValue={t.title}
                      onBlur={e => renameTopic(t.id, e.target.value)}
                      className="flex-1 bg-transparent text-[11px] font-semibold text-slate-700 uppercase tracking-wider border border-transparent hover:border-gray-200 focus:border-teal-400 rounded px-1 py-0.5 focus:outline-none"
                    />
                    <button onClick={() => addItem(t.id)} data-testid={`add-item-${ti}`}
                      className="text-[11px] text-teal-600 hover:underline opacity-0 group-hover:opacity-100">+ Item</button>
                    <button onClick={() => moveTopic(t.id, -1)} disabled={ti === 0}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">↑</button>
                    <button onClick={() => moveTopic(t.id, 1)} disabled={ti === topics.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">↓</button>
                    <button onClick={() => deleteTopic(t)}
                      className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100">×</button>
                  </div>

                  {topicItems.length === 0 ? (
                    <div className="px-5 py-1.5 flex items-center gap-3">
                      <p className="text-[11px] text-gray-300 italic">No items</p>
                      <button onClick={() => addItem(t.id)} className="text-[11px] text-teal-600/60 hover:text-teal-700 hover:underline">+ Add item</button>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {topicItems.map(it => {
                          const d = draftFor(it.id)
                          const respValue = it.responsible_assignment_id
                            ?? ((it.responsible_text || textModeItems.has(it.id)) ? '__text' : '')
                          return (
                            <tr key={it.id} className="border-b border-gray-50 group align-top">
                              <td className="pl-5 pr-2 py-1.5 w-14 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                                {it.item_number}
                                {it.carried_from_item_id && <span title="Carried forward" className="text-amber-500 ml-0.5">↺</span>}
                              </td>
                              <td className="px-2 py-1 w-[42%]">
                                <textarea
                                  value={(d.discussion ?? it.discussion) as string}
                                  rows={Math.max(1, Math.ceil(((d.discussion ?? it.discussion) as string).length / 70))}
                                  placeholder="Discussion…"
                                  onChange={e => setDraft(it.id, { discussion: e.target.value })}
                                  onBlur={() => commitDraft(it.id, 'discussion')}
                                  className="w-full border border-transparent hover:border-gray-200 focus:border-teal-400 rounded px-1.5 py-1 resize-none focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1.5 w-44">
                                <select
                                  value={respValue}
                                  onChange={e => {
                                    const v = e.target.value
                                    if (v === '__text') {
                                      setTextModeItems(s => new Set(s).add(it.id))
                                      updateItem(it.id, { responsible_assignment_id: null })
                                    } else {
                                      setTextModeItems(s => { const n = new Set(s); n.delete(it.id); return n })
                                      updateItem(it.id, { responsible_assignment_id: v || null, responsible_text: null })
                                    }
                                  }}
                                  className="w-full text-[11px] border border-gray-200 rounded px-1 py-1 bg-white text-gray-600">
                                  <option value="">—</option>
                                  {team.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                  <option value="__text">Other…</option>
                                </select>
                                {respValue === '__text' && (
                                  <input
                                    defaultValue={it.responsible_text ?? ''}
                                    placeholder="responsible"
                                    onBlur={e => updateItem(it.id, { responsible_text: e.target.value.trim() || null })}
                                    className="w-full mt-1 text-[11px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-teal-400"
                                  />
                                )}
                              </td>
                              <td className="px-2 py-1.5 w-32">
                                <input type="date" value={it.due_date ?? ''}
                                  onChange={e => updateItem(it.id, { due_date: e.target.value || null })}
                                  className="w-full text-[11px] border border-gray-200 rounded px-1 py-0.5 text-gray-600" />
                              </td>
                              <td className="px-2 py-1.5 w-20">
                                <select value={it.status}
                                  onChange={e => updateItem(it.id, { status: e.target.value as MeetingItem['status'] })}
                                  className={`w-full text-[11px] font-semibold border rounded px-1 py-1 bg-white ${
                                    it.status === 'open' ? 'text-amber-700 border-amber-200'
                                    : it.status === 'closed' ? 'text-gray-400 border-gray-200'
                                    : 'text-sky-700 border-sky-200'
                                  }`}>
                                  <option value="open">Open</option>
                                  <option value="closed">Closed</option>
                                  <option value="info">Info</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5 w-24">
                                <FindingPicker findings={findings}
                                  value={it.linked_finding_id ?? ''}
                                  onChange={id => updateItem(it.id, { linked_finding_id: id || null })} />
                              </td>
                              <td className="pr-4 py-1.5 w-6">
                                <button onClick={() => deleteItem(it.id)}
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">×</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}

            {/* Add topic */}
            <div className="px-5 py-3 flex items-center gap-2">
              <input value={newTopic}
                onChange={e => setNewTopic(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTopic() }}
                placeholder="+ Add topic…"
                className="text-xs border border-gray-200 rounded px-2.5 py-1.5 w-64 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              {newTopic.trim() && (
                <button onClick={addTopic} className="text-xs text-teal-700 font-medium hover:underline">Add</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create modal ─────────────────────────────────────────── */}
      <Modal title="New Meeting" open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
              <select value={createForm.meeting_type_id}
                onChange={e => onCreateTypeChange(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white">
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Meeting #</label>
              <input type="number" min={1} value={createForm.meeting_number}
                onChange={e => setCreateForm(f => ({ ...f, meeting_number: parseInt(e.target.value || '1', 10) }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              {createDup && (
                <p className="text-[11px] text-amber-600 mt-1">
                  #{createForm.meeting_number} already exists for this meeting type on this project.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
              <input type="date" value={createForm.meeting_date}
                onChange={e => setCreateForm(f => ({ ...f, meeting_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Time</label>
              <input type="time" value={createForm.start_time}
                onChange={e => setCreateForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Location</label>
              <input type="text" value={createForm.location} placeholder="Room or Teams/virtual"
                onChange={e => setCreateForm(f => ({ ...f, location: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          {carryInfo && carryInfo.count > 0 && (
            <label className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={createForm.carryForward}
                onChange={e => setCreateForm(f => ({ ...f, carryForward: e.target.checked }))}
                className="mt-0.5" data-testid="carry-forward" />
              <span>
                Carry forward <strong>{carryInfo.count}</strong> open item{carryInfo.count === 1 ? '' : 's'} from{' '}
                <strong>{carryInfo.prior.meeting_types?.name} #{carryInfo.prior.meeting_number}</strong>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  Original item numbers are retained until each item is closed.
                </span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={createMeeting} disabled={creating || !createForm.meeting_type_id}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
              {creating ? 'Creating…' : 'Create Meeting'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────── */}
      <Modal title={`Edit Meeting #${meeting?.meeting_number ?? ''}`} open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Meeting #</label>
              <input type="number" min={1} value={editForm.meeting_number}
                onChange={e => setEditForm(f => ({ ...f, meeting_number: parseInt(e.target.value || '1', 10) }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              {editDup && (
                <p className="text-[11px] text-amber-600 mt-1">This number already exists for this type.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
              <input type="date" value={editForm.meeting_date}
                onChange={e => setEditForm(f => ({ ...f, meeting_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Start Time</label>
              <input type="time" value={editForm.start_time}
                onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Location</label>
              <input type="text" value={editForm.location}
                onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Prepared By</label>
              <input type="text" value={editForm.prepared_by}
                onChange={e => setEditForm(f => ({ ...f, prepared_by: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Next Meeting Date</label>
              <input type="date" value={editForm.next_meeting_date}
                onChange={e => setEditForm(f => ({ ...f, next_meeting_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={saveEdit} disabled={savingEdit}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Attendee directory picker ────────────────────────────── */}
      <Modal title="Add Attendee" open={attendeeOpen} onClose={() => setAttendeeOpen(false)} maxWidth="sm">
        <div className="space-y-3">
          <input type="text" value={attendeeQuery} autoFocus
            onChange={e => setAttendeeQuery(e.target.value)}
            placeholder="Search directory…"
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="max-h-72 overflow-auto space-y-0.5">
            {(() => {
              const q = attendeeQuery.trim().toLowerCase()
              const existing = new Set(attendees.map(a => a.contact_id).filter(Boolean))
              const pool = contacts.filter(c => !existing.has(c.id) &&
                (!q || c.name.toLowerCase().includes(q) || (c.company ?? '').toLowerCase().includes(q)))
              // Team-matrix members surface first, role auto-attributed from the matrix.
              const inMatrix  = pool.filter(c => teamByContact[c.id])
              const rest      = pool.filter(c => !teamByContact[c.id])
              const renderRow = (c: { id: string; name: string; company: string | null }) => (
                <button key={c.id} onClick={() => addAttendee(c.id)}
                  className="w-full text-left px-3 py-1.5 rounded hover:bg-teal-50 text-xs flex items-center gap-2">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  {c.company && <span className="text-gray-400">— {c.company}</span>}
                  {teamByContact[c.id] && (
                    <span className="ml-auto text-[10px] text-teal-700 bg-teal-50 rounded px-1.5 py-0.5">{teamByContact[c.id]}</span>
                  )}
                </button>
              )
              return (
                <>
                  {inMatrix.length > 0 && (
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-1">Project team</div>
                  )}
                  {inMatrix.map(renderRow)}
                  {rest.length > 0 && inMatrix.length > 0 && (
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-2">Directory</div>
                  )}
                  {rest.map(renderRow)}
                  {pool.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">No matches.</p>}
                </>
              )
            })()}
          </div>
        </div>
      </Modal>

      {/* ── Guest modal ──────────────────────────────────────────── */}
      <Modal title="Add Guest Attendee" open={guestOpen} onClose={() => setGuestOpen(false)} maxWidth="sm">
        <div className="space-y-3">
          <input type="text" value={guestForm.name} autoFocus placeholder="Name *"
            onChange={e => setGuestForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <input type="text" value={guestForm.company} placeholder="Company"
            onChange={e => setGuestForm(f => ({ ...f, company: e.target.value }))}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <input type="text" value={guestForm.role} placeholder="Role"
            onChange={e => setGuestForm(f => ({ ...f, role: e.target.value }))}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setGuestOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={addGuest} disabled={!guestForm.name.trim()}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 font-medium">Add</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm ───────────────────────────────────────── */}
      <Modal title="Delete Meeting" open={!!confirmDelete} onClose={() => !deleting && setConfirmDelete(null)} maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Delete this meeting? All topics, items, and attendee records are removed.
            Generated documents in storage are not deleted. Items carried INTO later meetings are unaffected.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmDelete(null)} disabled={deleting}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={deleteMeeting} disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 font-medium">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
