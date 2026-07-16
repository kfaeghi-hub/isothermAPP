import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/projectTypes'
import { uploadFindingPhoto } from '../lib/photos'
import { Modal } from '../components/ui/Modal'
import type { ProjectPhase, ContactWithCompany, FindingDiaryEntry, FindingPhoto } from '../types/database'

interface ProjectTradeOption { id: string; name: string; sort_order: number }

// ── Local types ────────────────────────────────────────────────────────────

interface FindingRow {
  id: string
  number: string | null
  title: string | null
  category: string
  responsible_party_id: string | null
  status: 'open' | 'closed'
  origin: string
  date_raised: string
  date_closed: string | null
  phase_id: string | null
  contacts: {
    id: string
    name: string
    trade: string | null
    companies: { name: string; abbreviation: string | null } | null
  } | null
}

interface CreateForm {
  title: string
  category: string
  responsible_party_id: string
  origin: string
  phase_id: string
  initialEntry: string
}

interface EditForm {
  title: string
  category: string
  responsible_party_id: string
  origin: string
  phase_id: string
}

const EMPTY_CREATE: CreateForm = {
  title: '',
  category: 'INFO',
  responsible_party_id: '',
  origin: 'site_visit',
  phase_id: '',
  initialEntry: '',
}

const ORIGIN_LABELS: Record<string, string> = {
  site_visit: 'Site Visit',
  ivc: 'IVC',
  pfc: 'PFC',
  fpt: 'FPT',
}

// Image compression + upload now live in src/lib/photos.ts (shared with checklist fill-out).

// ── Date helpers ───────────────────────────────────────────────────────────

function entryDateLabel(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD' — add T12:00 to avoid timezone shift when parsing
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  phases: ProjectPhase[]
}

export function IssuesLogPage({ projectId, phases }: Props) {
  const [findings, setFindings]       = useState<FindingRow[]>([])
  const [allContacts, setAllContacts] = useState<ContactWithCompany[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'open' | 'closed' | 'all'>('open')
  const [selectedId, setSelectedId]   = useState<string | null>(null)

  // Detail panel
  const [diary, setDiary]               = useState<FindingDiaryEntry[]>([])
  const [photos, setPhotos]             = useState<FindingPhoto[]>([])
  const [newEntry, setNewEntry]         = useState('')
  const [addingEntry, setAddingEntry]   = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null)
  const [deletingPhotoId, setDeletingPhotoId]           = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Create modal
  const [createOpen, setCreateOpen]     = useState(false)
  const [createForm, setCreateForm]     = useState<CreateForm>(EMPTY_CREATE)
  const [createError, setCreateError]   = useState<string | null>(null)
  const [creating, setCreating]         = useState(false)

  // Edit modal
  const [editOpen, setEditOpen]         = useState(false)
  const [editForm, setEditForm]         = useState<EditForm>({ title: '', category: '', responsible_party_id: '', origin: 'site_visit', phase_id: '' })
  const [savingEdit, setSavingEdit]     = useState(false)

  // Delete finding
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingFinding, setDeletingFinding] = useState(false)

  // Project trade options (for category select)
  const [projectTrades, setProjectTrades] = useState<ProjectTradeOption[]>([])

  // ── Data ────────────────────────────────────────────────────────────────

  const fetchFindings = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('findings')
      .select('id, number, title, category, responsible_party_id, status, origin, date_raised, date_closed, phase_id, contacts(id, name, trade, companies(name, abbreviation))')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    setFindings((data ?? []) as unknown as FindingRow[])
    setLoading(false)
  }, [projectId])

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase
      .from('contacts')
      .select('*, companies(id, name, abbreviation)')
      .order('name')
    setAllContacts((data ?? []) as ContactWithCompany[])
  }, [])

  const fetchProjectTrades = useCallback(async () => {
    const [ptRes, ttRes] = await Promise.all([
      supabase.from('project_trades').select('trade_type_id').eq('project_id', projectId),
      supabase.from('trade_types').select('id, name, sort_order').order('sort_order'),
    ])
    const tradeIds = new Set((ptRes.data ?? []).map(r => r.trade_type_id))
    setProjectTrades((ttRes.data ?? []).filter(t => tradeIds.has(t.id)))
  }, [projectId])

  const fetchDetail = useCallback(async (findingId: string) => {
    const [dRes, pRes] = await Promise.all([
      supabase
        .from('finding_diary_entries')
        .select('*')
        .eq('finding_id', findingId)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('finding_photos')
        .select('*')
        .eq('finding_id', findingId)
        .order('uploaded_at', { ascending: true }),
    ])
    setDiary((dRes.data ?? []) as FindingDiaryEntry[])
    setPhotos((pRes.data ?? []) as FindingPhoto[])
  }, [])

  useEffect(() => { fetchFindings(); fetchContacts(); fetchProjectTrades() }, [fetchFindings, fetchContacts, fetchProjectTrades])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else { setDiary([]); setPhotos([]) }
  }, [selectedId, fetchDetail])

  // ── Derived ──────────────────────────────────────────────────────────────

  const openCount      = findings.filter(f => f.status === 'open').length
  const closedCount    = findings.filter(f => f.status === 'closed').length
  const filteredList   = findings.filter(f => filter === 'all' || f.status === filter)
  const selectedFinding = findings.find(f => f.id === selectedId) ?? null
  const hasFindings    = findings.length > 0

  // ── Actions ──────────────────────────────────────────────────────────────

  async function createFinding() {
    if (!createForm.initialEntry.trim()) { setCreateError('An initial description is required.'); return }
    setCreating(true); setCreateError(null)

    const { data: finding, error } = await supabase
      .from('findings')
      .insert({
        project_id: projectId,
        title: createForm.title.trim() || null,
        category: createForm.category.trim() || 'INFO',
        responsible_party_id: createForm.responsible_party_id || null,
        origin: createForm.origin,
        phase_id: createForm.phase_id || null,
        // number auto-set by DB trigger; date_raised auto-set by column default
      })
      .select('id, number')
      .single()

    if (error || !finding) {
      setCreateError(error?.message ?? 'Failed to create finding.')
      setCreating(false); return
    }

    await supabase.from('finding_diary_entries').insert({
      finding_id: finding.id,
      entry_date: todayISO(),
      body: createForm.initialEntry.trim(),
    })

    setCreating(false); setCreateOpen(false); setCreateForm(EMPTY_CREATE)
    await fetchFindings()
    setSelectedId(finding.id)
    setFilter('open')
  }

  async function addDiaryEntry() {
    if (!selectedId || !newEntry.trim()) return
    setAddingEntry(true)
    await supabase.from('finding_diary_entries').insert({
      finding_id: selectedId,
      entry_date: todayISO(),
      body: newEntry.trim(),
    })
    setNewEntry('')
    setAddingEntry(false)
    fetchDetail(selectedId)
  }

  async function toggleStatus() {
    if (!selectedFinding) return
    const closing = selectedFinding.status === 'open'
    await supabase
      .from('findings')
      .update({
        status: closing ? 'closed' : 'open',
        date_closed: closing ? todayISO() : null,
      })
      .eq('id', selectedFinding.id)
    fetchFindings()
  }

  async function deletePhoto(photo: FindingPhoto) {
    setDeletingPhotoId(photo.id)
    // Delete DB record first — source of truth for UI visibility
    await supabase.from('finding_photos').delete().eq('id', photo.id)
    // Then remove from Storage (best-effort; orphaned files are preferable to broken UI state)
    const marker = '/finding-photos/'
    const idx = photo.storage_url.indexOf(marker)
    if (idx >= 0) {
      await supabase.storage.from('finding-photos').remove([photo.storage_url.slice(idx + marker.length)])
    }
    setDeletingPhotoId(null)
    setConfirmDeletePhotoId(null)
    if (selectedId) fetchDetail(selectedId)
  }

  function openEditModal() {
    if (!selectedFinding) return
    setEditForm({
      title: selectedFinding.title ?? '',
      category: selectedFinding.category,
      responsible_party_id: selectedFinding.responsible_party_id ?? '',
      origin: selectedFinding.origin,
      phase_id: selectedFinding.phase_id ?? '',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!selectedId) return
    setSavingEdit(true)
    await supabase
      .from('findings')
      .update({
        title: editForm.title.trim() || null,
        category: editForm.category.trim() || 'INFO',
        responsible_party_id: editForm.responsible_party_id || null,
        origin: editForm.origin,
        phase_id: editForm.phase_id || null,
      })
      .eq('id', selectedId)
    setSavingEdit(false); setEditOpen(false)
    fetchFindings()
  }

  async function deleteFinding(findingId: string) {
    setDeletingFinding(true)

    // Fetch photo rows before the cascade wipes them, so we have storage paths
    const { data: photoRows } = await supabase
      .from('finding_photos')
      .select('storage_url')
      .eq('finding_id', findingId)

    // Delete storage files (best-effort — orphaned files < broken DB state)
    if (photoRows && photoRows.length > 0) {
      const marker = '/finding-photos/'
      const paths = photoRows
        .map(p => { const i = p.storage_url.indexOf(marker); return i >= 0 ? p.storage_url.slice(i + marker.length) : null })
        .filter((p): p is string => p !== null)
      if (paths.length > 0) await supabase.storage.from('finding-photos').remove(paths)
    }

    // Delete the finding row — CASCADE removes diary entries + photo rows
    await supabase.from('findings').delete().eq('id', findingId)

    setDeletingFinding(false)
    setConfirmDeleteId(null)
    setSelectedId(null)
    await fetchFindings()
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedId) return
    e.target.value = ''
    setUploadingPhoto(true)
    const result = await uploadFindingPhoto(selectedId, file)
    setUploadingPhoto(false)
    if (!result.ok) { alert(result.error); return }
    fetchDetail(selectedId)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading issues log…</div>

  const narrow = !!selectedId

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Finding list panel ────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-r border-gray-200 overflow-hidden flex-shrink-0 transition-all ${narrow ? 'w-80' : 'flex-1'}`}>

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-1">
            {(['open', 'closed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  filter === f
                    ? f === 'open' ? 'bg-amber-50 text-amber-700 font-semibold'
                    : f === 'closed' ? 'bg-gray-100 text-gray-600 font-semibold'
                    : 'bg-slate-100 text-slate-600 font-semibold'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {f === 'open' ? `Open (${openCount})` : f === 'closed' ? `Closed (${closedCount})` : 'All'}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(null); setCreateOpen(true) }}
            className="ml-auto text-xs bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium whitespace-nowrap flex-shrink-0"
          >
            + New Finding
          </button>
        </div>

        {/* Finding rows */}
        <div className="flex-1 overflow-auto">
          {filteredList.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-3xl mb-3 opacity-20">⚠️</div>
              {!hasFindings ? (
                <>
                  <p className="text-sm font-medium text-gray-600 mb-1">No findings yet</p>
                  <p className="text-xs text-gray-400 mb-5 max-w-[200px] mx-auto">
                    Log issues as they're discovered on site, during IVC/PFC, or in FPT.
                  </p>
                  <button
                    onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(null); setCreateOpen(true) }}
                    className="text-xs bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium"
                  >
                    + New Finding
                  </button>
                </>
              ) : (
                <p className="text-xs text-gray-400">No {filter} findings.</p>
              )}
            </div>
          ) : (
            filteredList.map(f => {
              const isSelected = f.id === selectedId
              const isClosed   = f.status === 'closed'
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedId(isSelected ? null : f.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors relative ${
                    isSelected ? 'bg-teal-50/40' : ''
                  }`}
                >
                  {isSelected && <div className="absolute left-0 inset-y-0 w-0.5 bg-teal-500" />}
                  <div className={`flex items-center gap-2 mb-1 ${isClosed ? 'opacity-50' : ''}`}>
                    <span className="font-mono text-[11px] text-gray-400 flex-shrink-0">
                      #{f.number ?? '—'}
                    </span>
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 flex-shrink-0 ${
                      isClosed ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {isClosed ? 'CLOSED' : 'OPEN'}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">{f.category}</span>
                    {f.title && (
                      <span className="text-xs font-medium text-gray-700 truncate">{f.title}</span>
                    )}
                  </div>
                  <div className={`text-[11px] flex items-center justify-between gap-2 ${isClosed ? 'text-gray-300' : 'text-gray-400'}`}>
                    <span className="truncate">
                      {f.contacts?.name ?? <em className="not-italic">Unassigned</em>}
                    </span>
                    <span className="font-mono text-[10px] flex-shrink-0">
                      {formatDate(f.date_raised)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Finding detail panel ──────────────────────────────────── */}
      {selectedFinding ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Detail header */}
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-start gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs text-gray-400">#{selectedFinding.number ?? '—'}</span>
                <span className={`text-[10px] font-semibold rounded px-2 py-0.5 ${
                  selectedFinding.status === 'open'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {selectedFinding.status === 'open' ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedFinding.title && (
                  <h3 className="text-sm font-semibold text-gray-900">{selectedFinding.title}</h3>
                )}
                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">
                  {selectedFinding.category}
                </span>
                {!selectedFinding.title && (
                  <span className="text-xs text-gray-400 italic">No title set</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {selectedFinding.status === 'open' ? (
                <button
                  onClick={toggleStatus}
                  className="text-xs border border-gray-200 rounded px-3 py-1.5 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  Close Finding
                </button>
              ) : (
                <button
                  onClick={toggleStatus}
                  className="text-xs border border-teal-200 bg-teal-50 rounded px-3 py-1.5 text-teal-700 hover:border-teal-400 transition-colors"
                >
                  Reopen
                </button>
              )}
              <button
                onClick={openEditModal}
                className="text-xs border border-gray-200 rounded px-3 py-1.5 text-gray-500 hover:text-teal-700 hover:border-teal-400 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmDeleteId(selectedFinding.id)}
                className="text-xs border border-red-200 rounded px-3 py-1.5 text-red-500 hover:bg-red-50 hover:border-red-400 transition-colors"
                title="Delete this finding permanently"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedId(null)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none ml-1"
                title="Close panel"
              >
                ×
              </button>
            </div>
          </div>

          {/* Detail body — scrollable */}
          <div className="flex-1 overflow-auto p-5 space-y-6">

            {/* Meta */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Responsible Party</dt>
                <dd className="text-sm text-gray-700">
                  {selectedFinding.contacts ? (
                    <>
                      {selectedFinding.contacts.name}
                      {selectedFinding.contacts.companies && (
                        <span className="text-gray-400 ml-1.5 text-xs">
                          ({selectedFinding.contacts.companies.abbreviation ?? selectedFinding.contacts.companies.name})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400 italic text-xs">Unassigned</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Origin</dt>
                <dd className="text-sm text-gray-700">{ORIGIN_LABELS[selectedFinding.origin] ?? selectedFinding.origin}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Phase</dt>
                <dd className="text-sm text-gray-700">
                  {selectedFinding.phase_id
                    ? (phases.find(p => p.id === selectedFinding.phase_id)?.name ?? '—')
                    : <span className="text-gray-400">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Date Raised</dt>
                <dd className="text-sm font-mono text-gray-700">{formatDate(selectedFinding.date_raised)}</dd>
              </div>
              {selectedFinding.status === 'closed' && selectedFinding.date_closed && (
                <div>
                  <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Date Closed</dt>
                  <dd className="text-sm font-mono text-gray-700">{formatDate(selectedFinding.date_closed)}</dd>
                </div>
              )}
            </dl>

            {/* Diary */}
            <div>
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4">Diary</h4>

              {diary.length === 0 ? (
                <p className="text-xs text-gray-400 mb-4">No entries yet.</p>
              ) : (
                <div className="space-y-4 mb-6">
                  {diary.map(entry => (
                    <div key={entry.id} className="flex gap-4">
                      <div className="w-24 flex-shrink-0 pt-0.5">
                        <span className="text-[11px] font-mono text-gray-400">
                          {entryDateLabel(entry.entry_date)}
                        </span>
                      </div>
                      <div
                        className={`flex-1 text-sm leading-relaxed whitespace-pre-wrap ${
                          selectedFinding.status === 'closed' ? 'text-gray-400' : 'text-gray-700'
                        }`}
                      >
                        {entry.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add entry */}
              <div className="border-t border-dashed border-gray-200 pt-4">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  New Entry · <span className="font-mono">{todayISO()}</span>
                </div>
                <textarea
                  value={newEntry}
                  onChange={e => setNewEntry(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      addDiaryEntry()
                    }
                  }}
                  rows={3}
                  placeholder="Describe what was observed, discussed, or actioned…"
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-gray-400">⌘↵ to submit</span>
                  <button
                    onClick={addDiaryEntry}
                    disabled={!newEntry.trim() || addingEntry}
                    className="text-sm bg-teal-700 text-white rounded px-4 py-1.5 hover:bg-teal-800 disabled:opacity-40 transition-colors font-medium"
                  >
                    {addingEntry ? 'Adding…' : 'Add Entry'}
                  </button>
                </div>
              </div>
            </div>

            {/* Photos */}
            <div>
              <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Photos</h4>
              <div className="flex flex-wrap gap-2">
                {photos.map(photo => (
                  <div key={photo.id} className="relative group w-24 h-24 flex-shrink-0">
                    {confirmDeletePhotoId === photo.id ? (
                      /* Inline confirm — replaces thumbnail */
                      <div className="w-24 h-24 rounded border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-2 text-center">
                        <span className="text-[10px] text-red-700 font-medium leading-tight px-1">Delete photo?</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setConfirmDeletePhotoId(null)}
                            className="text-[10px] px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => deletePhoto(photo)}
                            disabled={deletingPhotoId === photo.id}
                            className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingPhotoId === photo.id ? '…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <a
                          href={photo.storage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={photo.caption ?? undefined}
                        >
                          <img
                            src={photo.storage_url}
                            alt={photo.caption ?? 'Finding photo'}
                            className="w-24 h-24 object-cover rounded border border-gray-200 group-hover:opacity-80 transition-opacity cursor-zoom-in"
                          />
                        </a>
                        {/* Delete button — visible on hover */}
                        <button
                          onClick={() => setConfirmDeletePhotoId(photo.id)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="Remove photo"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="w-24 h-24 rounded border-2 border-dashed border-gray-200 hover:border-teal-400 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:text-teal-600 transition-colors disabled:opacity-40"
                >
                  {uploadingPhoto ? (
                    <span className="text-[10px]">Uploading…</span>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[10px]">Add Photo</span>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
              {photos.length === 0 && !uploadingPhoto && (
                <p className="text-xs text-gray-400 mt-2">
                  Attach before/after photos as evidence. Images are compressed automatically.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* No finding selected and list is full width — no right panel needed */
        null
      )}

      {/* ── Create Finding modal ──────────────────────────────────── */}
      <Modal title="New Finding" open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md">
        <div className="space-y-4">

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Title
              <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
            </label>
            <input
              type="text"
              value={createForm.title}
              onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Brief subject — e.g. BAS setpoint not persisting after restart"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Category
            </label>
            <select
              value={createForm.category}
              onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
            >
              <option value="INFO">INFO</option>
              {projectTrades.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            {projectTrades.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                No systems to be commissioned — add them via <strong>Edit Project</strong> to use specific categories.
              </p>
            )}
          </div>

          {/* Responsible Party + Origin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Responsible Party
              </label>
              <select
                value={createForm.responsible_party_id}
                onChange={e => setCreateForm(f => ({ ...f, responsible_party_id: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">Unassigned</option>
                {allContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.companies ? ` — ${c.companies.abbreviation ?? c.companies.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Origin
              </label>
              <select
                value={createForm.origin}
                onChange={e => setCreateForm(f => ({ ...f, origin: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Phase */}
          {phases.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Phase
                <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
              </label>
              <select
                value={createForm.phase_id}
                onChange={e => setCreateForm(f => ({ ...f, phase_id: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">No phase</option>
                {phases.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Initial diary entry */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={createForm.initialEntry}
              onChange={e => setCreateForm(f => ({ ...f, initialEntry: e.target.value }))}
              rows={4}
              placeholder="Describe the deficiency or observation found…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Becomes the first diary entry — add further updates as the finding progresses.
            </p>
          </div>

          {createError && <p className="text-sm text-red-600">{createError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              onClick={createFinding}
              disabled={creating}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {creating ? 'Creating…' : 'Create Finding'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Finding confirmation modal ────────────────────── */}
      {(() => {
        const f = findings.find(x => x.id === confirmDeleteId)
        if (!f) return null
        return (
          <Modal
            title="Delete Finding"
            open={!!confirmDeleteId}
            onClose={() => !deletingFinding && setConfirmDeleteId(null)}
            maxWidth="sm"
          >
            <div className="space-y-4">
              <div className="flex gap-3 p-3 rounded-md bg-red-50 border border-red-100">
                <span className="text-red-500 mt-0.5 flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    Delete Finding #{f.number ?? '—'}
                    {f.title ? ` — ${f.title}` : ''}
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    This will permanently remove the finding, all diary entries, and all photos
                    (including files from storage). This cannot be undone.
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Finding numbers are never renumbered — the gap left by #{f.number ?? '—'} will remain
                so existing reports and cross-references stay valid.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deletingFinding}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteFinding(f.id)}
                  disabled={deletingFinding}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {deletingFinding ? 'Deleting…' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ── Edit Finding modal ────────────────────────────────────── */}
      <Modal
        title={`Edit Finding #${selectedFinding?.number ?? '—'}`}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="md"
      >
        <div className="space-y-4">

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Title
              <span className="ml-1.5 text-gray-400 font-normal normal-case tracking-normal text-[11px]">optional</span>
            </label>
            <input
              type="text"
              value={editForm.title}
              onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Brief subject — e.g. BAS setpoint not persisting after restart"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
            <select
              value={editForm.category}
              onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
            >
              <option value="INFO">INFO</option>
              {/* Preserve old value if it's no longer in the trade list */}
              {editForm.category !== 'INFO' && !projectTrades.some(t => t.name === editForm.category) && (
                <option value={editForm.category}>{editForm.category}</option>
              )}
              {projectTrades.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Responsible Party</label>
              <select
                value={editForm.responsible_party_id}
                onChange={e => setEditForm(f => ({ ...f, responsible_party_id: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">Unassigned</option>
                {allContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.companies ? ` — ${c.companies.abbreviation ?? c.companies.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Origin</label>
              <select
                value={editForm.origin}
                onChange={e => setEditForm(f => ({ ...f, origin: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {Object.entries(ORIGIN_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {phases.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phase</label>
              <select
                value={editForm.phase_id}
                onChange={e => setEditForm(f => ({ ...f, phase_id: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">No phase</option>
                {phases.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

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
