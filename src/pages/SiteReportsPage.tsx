import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { authedFetch, apiErrorMessage } from '../lib/api'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../contexts/AuthContext'
import type { SiteReport, DocRegisterItem } from '../types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportForm {
  report_number: string
  site_visit_date: string
  report_date: string
  authored_by: string
  progress_narrative: string
  show_closed: boolean
  doc_register: DocRegisterItem[]
}

interface Props { projectId: string }

const EMPTY_DOC_ITEM = (): DocRegisterItem => ({
  id: crypto.randomUUID(),
  label: '',
  status: 'outstanding',
  finding_number: null,
})

const DEFAULT_FORM = (): ReportForm => ({
  report_number: '',
  site_visit_date: new Date().toISOString().slice(0, 10),
  report_date: new Date().toISOString().slice(0, 10),
  authored_by: 'Tony Faeghi',
  progress_narrative: '',
  show_closed: true,
  doc_register: [],
})

const STATUS_LABELS: Record<DocRegisterItem['status'], string> = {
  outstanding: 'Outstanding',
  received: 'Received',
  na: 'N/A',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SiteReportsPage({ projectId }: Props) {
  const { profile } = useAuth()
  // Governors (admin/dev/owner) delete any report; employees their OWN UNGENERATED drafts.
  const canDelete = (r: SiteReport) =>
    ['admin', 'developer', 'owner'].includes(profile?.role ?? '')
    || (!r.storage_url && r.authored_by === profile?.name)
  const [reports, setReports]         = useState<SiteReport[]>([])
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [modalMode, setModalMode]     = useState<'new' | 'edit'>('new')
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState<ReportForm>(DEFAULT_FORM())
  const [saving, setSaving]           = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [genError, setGenError]       = useState<string | null>(null)
  const [formError, setFormError]     = useState<string | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('site_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setReports((data ?? []) as SiteReport[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openNew() {
    setModalMode('new')
    setEditingId(null)
    setForm(DEFAULT_FORM())
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(r: SiteReport) {
    setModalMode('edit')
    setEditingId(r.id)
    setForm({
      report_number:      r.report_number,
      site_visit_date:    r.site_visit_date,
      report_date:        r.report_date,
      authored_by:        r.authored_by,
      progress_narrative: r.progress_narrative ?? '',
      show_closed:        r.show_closed,
      doc_register:       r.doc_register ?? [],
    })
    setFormError(null)
    setModalOpen(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function saveReport() {
    if (!form.report_number.trim()) { setFormError('Report number is required.'); return }
    if (!form.site_visit_date)      { setFormError('Site visit date is required.'); return }
    if (!form.report_date)          { setFormError('Report date is required.'); return }

    setSaving(true)
    setFormError(null)

    const payload = {
      project_id:         projectId,
      report_number:      form.report_number.trim(),
      site_visit_date:    form.site_visit_date,
      report_date:        form.report_date,
      authored_by:        form.authored_by.trim() || 'Tony Faeghi',
      progress_narrative: form.progress_narrative.trim() || null,
      show_closed:        form.show_closed,
      doc_register:       form.doc_register.filter(i => i.label.trim()),
    }

    let savedId = editingId

    if (modalMode === 'new') {
      const { data, error } = await supabase
        .from('site_reports')
        .insert(payload)
        .select('id')
        .single()
      if (error) { setSaving(false); setFormError(error.message); return }
      savedId = data.id
    } else {
      const { error } = await supabase
        .from('site_reports')
        .update(payload)
        .eq('id', editingId!)
      if (error) { setSaving(false); setFormError(error.message); return }
    }

    setSaving(false)
    setModalOpen(false)
    await fetchReports()

    // Auto-generate after every save so files always reflect the latest inputs
    if (savedId) {
      generateReport(savedId)
    }
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  async function generateReport(reportId: string) {
    setGeneratingId(reportId)
    setGenError(null)
    try {
      const res = await authedFetch('/api/generate-report', { report_id: reportId })
      const payload = await res.json()
      if (!res.ok) {
        setGenError(apiErrorMessage(res.status, payload.error))
        return
      }
      // Update local state immediately with returned URLs
      setReports(prev => prev.map(r =>
        r.id === reportId
          ? { ...r, storage_url: payload.storage_url, pdf_url: payload.pdf_url }
          : r
      ))
    } catch (err: any) {
      setGenError(`Generation failed: ${err.message}`)
    } finally {
      setGeneratingId(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteReport(r: SiteReport) {
    if (!confirm(`Delete Site Note #${r.report_number}? This also removes any generated files.`)) return
    await supabase.from('site_reports').delete().eq('id', r.id)
    fetchReports()
  }

  // ── Doc register item helpers ─────────────────────────────────────────────

  function addDocItem() {
    setForm(f => ({ ...f, doc_register: [...f.doc_register, EMPTY_DOC_ITEM()] }))
  }

  function updateDocItem(id: string, patch: Partial<DocRegisterItem>) {
    setForm(f => ({ ...f, doc_register: f.doc_register.map(i => i.id === id ? { ...i, ...patch } : i) }))
  }

  function removeDocItem(id: string) {
    setForm(f => ({ ...f, doc_register: f.doc_register.filter(i => i.id !== id) }))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden rise">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Site Reports</h3>
          <p className="text-xs text-gray-400 mt-0.5">Numbered Cx Site Notes — .docx and PDF generation</p>
        </div>
        <button
          onClick={openNew}
          className="text-xs px-3 py-1.5 bg-teal-700 text-white rounded hover:bg-teal-800 transition-colors font-medium"
        >
          + New Report
        </button>
      </div>

      {/* Generation error banner */}
      {genError && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center justify-between">
          <span className="text-xs text-red-700">{genError}</span>
          <button onClick={() => setGenError(null)} className="text-red-400 hover:text-red-600 text-sm leading-none ml-4">✕</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="text-sm text-gray-400 p-4">Loading…</div>
        ) : reports.length === 0 ? (
          <EmptyState>
            <p className="text-sm font-medium text-gray-600 mb-1">No site reports yet</p>
            <p className="text-sm text-gray-400">Create your first Cx Site Note to generate a .docx and PDF.</p>
          </EmptyState>
        ) : (
          <div className="card-tile bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">Report #</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">Site Visit</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">Report Date</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">By</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">Status</th>
                  <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-4 py-2.5">Files</th>
                  <th className="w-28 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {reports.map(r => {
                  const isGenerating = generatingId === r.id
                  const hasFiles = !!(r.storage_url && r.pdf_url)
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-slate-50 group">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-gray-800">
                          Cx Site Note #{r.report_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.site_visit_date}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.report_date}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.authored_by}</td>
                      <td className="px-4 py-3">
                        {isGenerating ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                            <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                            Generating…
                          </span>
                        ) : hasFiles ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                            <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            Ready
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Not generated</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.storage_url && (
                            <a
                              href={r.storage_url}
                              download
                              className="text-xs text-teal-700 hover:text-teal-900 hover:underline font-medium"
                            >
                              .docx
                            </a>
                          )}
                          {r.pdf_url && (
                            <a
                              href={r.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-teal-700 hover:text-teal-900 hover:underline font-medium"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => generateReport(r.id)}
                            disabled={isGenerating}
                            title={hasFiles ? 'Regenerate' : 'Generate'}
                            className="text-xs text-gray-500 hover:text-teal-700 border border-gray-200 hover:border-teal-400 rounded px-2 py-1 transition-colors disabled:opacity-40"
                          >
                            {hasFiles ? '↺ Regen' : '⚡ Generate'}
                          </button>
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs text-gray-500 hover:text-teal-700 border border-gray-200 hover:border-teal-400 rounded px-2 py-1 transition-colors"
                          >
                            Edit
                          </button>
                          {canDelete(r) && (
                            <button
                              onClick={() => deleteReport(r)}
                              className="text-xs text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-2 py-1 transition-colors"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New / Edit modal ─────────────────────────────────────────────── */}
      <Modal
        title={modalMode === 'new' ? 'New Site Report' : `Edit Site Note #${form.report_number}`}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="lg"
      >
        <div className="space-y-5">

          {/* Row 1: number + dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Report # <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.report_number}
                onChange={e => setForm(f => ({ ...f, report_number: e.target.value }))}
                placeholder="e.g. 5"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Site Visit Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.site_visit_date}
                onChange={e => setForm(f => ({ ...f, site_visit_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Report Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.report_date}
                onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Row 2: authored by + show_closed toggle */}
          <div className="flex items-end gap-6">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Authored By
              </label>
              <input
                type="text"
                value={form.authored_by}
                onChange={e => setForm(f => ({ ...f, authored_by: e.target.value }))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div className="flex items-center gap-3 pb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Include Closed Findings</span>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, show_closed: !f.show_closed }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  form.show_closed ? 'bg-teal-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  form.show_closed ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-xs text-gray-400">{form.show_closed ? 'Yes' : 'Open only'}</span>
            </div>
          </div>

          {/* Progress narrative */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Site Progress Observations
            </label>
            <textarea
              value={form.progress_narrative}
              onChange={e => setForm(f => ({ ...f, progress_narrative: e.target.value }))}
              rows={5}
              placeholder="Describe site progress observed during this visit…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
            />
          </div>

          {/* Documentation register */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Required Documentations
              </label>
              <button
                type="button"
                onClick={addDocItem}
                className="text-xs text-teal-700 hover:text-teal-900 border border-teal-200 hover:border-teal-400 rounded px-2 py-0.5 transition-colors"
              >
                + Add Item
              </button>
            </div>
            {form.doc_register.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No documentation items. Click + Add Item to add.</p>
            ) : (
              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left font-semibold text-gray-500 px-3 py-2 uppercase tracking-wider text-[11px]">Document</th>
                      <th className="text-left font-semibold text-gray-500 px-3 py-2 uppercase tracking-wider text-[11px] w-36">Status</th>
                      <th className="text-left font-semibold text-gray-500 px-3 py-2 uppercase tracking-wider text-[11px] w-28">Issue # (opt.)</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.doc_register.map(item => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={item.label}
                            onChange={e => updateDocItem(item.id, { label: e.target.value })}
                            placeholder="e.g. TAB Report, O&M Manual…"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={item.status}
                            onChange={e => updateDocItem(item.id, { status: e.target.value as DocRegisterItem['status'] })}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                          >
                            {(Object.keys(STATUS_LABELS) as DocRegisterItem['status'][]).map(s => (
                              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={item.finding_number ?? ''}
                            onChange={e => updateDocItem(item.id, { finding_number: e.target.value || null })}
                            placeholder="001"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => removeDocItem(item.id)}
                            className="text-gray-300 hover:text-red-500 text-sm leading-none transition-colors"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">
              Saving will update the record and automatically regenerate the .docx and PDF.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={saveReport}
                disabled={saving}
                className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
              >
                {saving ? 'Saving…' : 'Save & Generate'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
