// Deliverables tab — the management screen over the composition machinery.
// Rows are per-project work tracking (member-editable, content pattern); the
// pool and option mappings stay in the admin Classifications screen.

import { Fragment, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import {
  fetchDeliverables, composeDelta, applyCompose, statusDates, displayName,
  STATUS_ORDER, STATUS_META, type DeliverableRow,
} from '../lib/deliverables'
import type { DeliverableStatus, DeliverableTemplate } from '../types/database'
import { formatDate } from '../lib/format'

interface Props { projectId: string }

export function DeliverablesPage({ projectId }: Props) {
  const [rows, setRows] = useState<DeliverableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [pool, setPool] = useState<DeliverableTemplate[]>([])
  const [pickedTemplate, setPickedTemplate] = useState<string>('')
  const [adhocName, setAdhocName] = useState('')
  const [addToPool, setAddToPool] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Compose from classification
  const [composePreview, setComposePreview] = useState<DeliverableTemplate[] | null>(null)
  const [composing, setComposing] = useState(false)

  const fetchAll = useCallback(async () => {
    const [rowsData, profRes] = await Promise.all([
      fetchDeliverables(projectId),
      supabase.from('user_profiles').select('name').order('name'),
    ])
    setRows(rowsData)
    setMemberNames(((profRes.data ?? []) as any[]).map(p => p.name as string).filter(Boolean))
    setLoading(false)
  }, [projectId])
  useEffect(() => { fetchAll() }, [fetchAll])

  const nextSort = rows.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1

  async function patch(id: string, fields: Partial<DeliverableRow>) {
    const { error } = await supabase.from('project_deliverables').update(fields).eq('id', id)
    if (error) alert(error.message)
    fetchAll()
  }

  async function setStatus(row: DeliverableRow, next: DeliverableStatus) {
    await patch(row.id, { status: next, ...statusDates(row, next) })
  }

  async function move(row: DeliverableRow, dir: -1 | 1) {
    // Up/down swap on sort_order — team-matrix precedent, no drag.
    const i = rows.findIndex(r => r.id === row.id)
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const other = rows[j]
    await Promise.all([
      supabase.from('project_deliverables').update({ sort_order: other.sort_order }).eq('id', row.id),
      supabase.from('project_deliverables').update({ sort_order: row.sort_order }).eq('id', other.id),
    ])
    fetchAll()
  }

  async function remove(row: DeliverableRow) {
    if (!window.confirm(`Remove "${displayName(row)}" from this project's deliverables?`)) return
    const { error } = await supabase.from('project_deliverables').delete().eq('id', row.id)
    if (error) alert(error.message)
    fetchAll()
  }

  async function openAdd() {
    setAddError(null); setPickedTemplate(''); setAdhocName(''); setAddToPool(false)
    const { data } = await supabase.from('deliverable_templates')
      .select('*').eq('active', true).order('sort_order').order('name')
    setPool((data ?? []) as DeliverableTemplate[])
    setAddOpen(true)
  }

  async function performAdd() {
    setSaving(true); setAddError(null)
    let templateId = pickedTemplate || null
    let name: string | null = null
    if (!templateId) {
      const trimmed = adhocName.trim()
      if (!trimmed) { setAddError('Pick a pool deliverable or enter a name.'); setSaving(false); return }
      if (addToPool) {
        // Reusables graduate: insert into the firm pool, then link (never a loose string).
        const maxOrder = pool.reduce((m, t) => Math.max(m, t.sort_order), 0)
        const { data, error } = await supabase.from('deliverable_templates')
          .insert({ name: trimmed, sort_order: maxOrder + 1 }).select('id').single()
        if (error) { setAddError(error.message); setSaving(false); return }
        templateId = data.id
      } else {
        name = trimmed // project-local ad-hoc (one-of CHECK)
      }
    }
    const { error } = await supabase.from('project_deliverables').insert({
      project_id: projectId, template_id: templateId, name, status: 'not_started', sort_order: nextSort,
    })
    if (error) { setAddError(error.message); setSaving(false); return }
    setSaving(false); setAddOpen(false)
    fetchAll()
  }

  async function previewCompose() {
    setComposing(true)
    setComposePreview(await composeDelta(projectId))
    setComposing(false)
  }

  async function confirmCompose() {
    if (!composePreview?.length) { setComposePreview(null); return }
    setComposing(true)
    const err = await applyCompose(projectId, composePreview, nextSort)
    if (err) alert(err)
    setComposing(false); setComposePreview(null)
    fetchAll()
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading deliverables…</div>

  const presentTemplateIds = new Set(rows.map(r => r.template_id).filter(Boolean))

  return (
    <div className="p-6 max-w-4xl rise">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">
          Deliverables
          <span className="ml-2 text-xs font-normal text-gray-400">{rows.length} tracked</span>
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={previewCompose} disabled={composing}
            className="text-xs text-gray-500 hover:text-teal-700 border border-gray-200 hover:border-teal-400 rounded px-3 py-1.5 transition-colors">
            Compose from classification
          </button>
          <button onClick={openAdd}
            className="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors">
            + Add deliverable
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-md border border-gray-200">
          <EmptyState>
            <p className="text-sm font-medium text-gray-600 mb-1">No deliverables tracked yet</p>
            <p className="text-sm text-gray-400 max-w-md mx-auto mb-4">
              Compose the list from this project's classifications — each selected program and
              lifecycle option contributes its default set — or add rows individually.
            </p>
            <button onClick={previewCompose} disabled={composing}
              className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-sm transition-colors">
              Compose from classification
            </button>
          </EmptyState>
        </div>
      ) : (
        <div className="card-tile bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2 w-8"></th>
                <th className="px-2 py-2">Deliverable</th>
                <th className="px-2 py-2 w-32">Status</th>
                <th className="px-2 py-2 w-32">Assigned</th>
                <th className="px-2 py-2 w-28">Due</th>
                <th className="px-2 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50 group">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <button onClick={() => move(r, -1)} disabled={i === 0}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30 px-0.5" aria-label="Move up">↑</button>
                      <button onClick={() => move(r, 1)} disabled={i === rows.length - 1}
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-30 px-0.5" aria-label="Move down">↓</button>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-gray-800">{displayName(r)}</span>
                      {!r.template_id && (
                        <span className="ml-1.5 text-[9px] font-semibold text-violet-500 align-middle" title="Project-local (ad-hoc) deliverable">AD-HOC</span>
                      )}
                      {r.notes && <div className="text-xs text-gray-400 truncate max-w-md">{r.notes}</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.status} onChange={e => setStatus(r, e.target.value as DeliverableStatus)}
                        className={`text-[10px] font-bold rounded px-1.5 py-1 border-0 cursor-pointer ${STATUS_META[r.status].cls}`}
                        title={[
                          r.date_submitted ? `Submitted ${formatDate(r.date_submitted)}` : null,
                          r.date_accepted ? `Accepted ${formatDate(r.date_accepted)}` : null,
                        ].filter(Boolean).join(' · ') || undefined}>
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-600">{r.assigned_to ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-600 whitespace-nowrap">
                      {r.due_date ? formatDate(r.due_date) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        className="text-xs text-gray-400 hover:text-teal-700 px-1" title="Edit">✎</button>
                      <button onClick={() => remove(r)}
                        className="text-xs text-gray-300 hover:text-red-500 px-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">✕</button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="border-b border-gray-100 bg-slate-50">
                      <td></td>
                      <td colSpan={5} className="px-2 py-3">
                        <div className="grid grid-cols-4 gap-3 max-w-2xl">
                          <div>
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1">Assigned to</label>
                            <input list="member-names" value={r.assigned_to ?? ''}
                              onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, assigned_to: e.target.value } : x))}
                              onBlur={e => patch(r.id, { assigned_to: e.target.value.trim() || null })}
                              placeholder="Profile name…"
                              title="Matched by profile name on the dashboard (same convention as My Items)"
                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1">Due date</label>
                            <input type="date" value={r.due_date ?? ''}
                              onChange={e => patch(r.id, { due_date: e.target.value || null })}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-teal-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1">Date submitted</label>
                            <input type="date" value={r.date_submitted ?? ''}
                              onChange={e => patch(r.id, { date_submitted: e.target.value || null })}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-teal-400" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1">Date accepted</label>
                            <input type="date" value={r.date_accepted ?? ''}
                              onChange={e => patch(r.id, { date_accepted: e.target.value || null })}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-teal-400" />
                          </div>
                          <div className="col-span-4">
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1">Notes</label>
                            <textarea value={r.notes ?? ''} rows={2}
                              onChange={e => setRows(rs => rs.map(x => x.id === r.id ? { ...x, notes: e.target.value } : x))}
                              onBlur={e => patch(r.id, { notes: e.target.value.trim() || null })}
                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-teal-400" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <datalist id="member-names">
        {memberNames.map(n => <option key={n} value={n} />)}
      </datalist>

      {/* Compose preview */}
      <Modal title="Compose from classification" open={composePreview !== null} onClose={() => setComposePreview(null)}>
        {composePreview !== null && (
          composePreview.length === 0 ? (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Nothing to add — every deliverable mapped to this project's classification
                selections is already tracked here.
              </p>
              <div className="flex justify-end">
                <button onClick={() => setComposePreview(null)}
                  className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">Close</button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Will add <b>{composePreview.length}</b> deliverable{composePreview.length === 1 ? '' : 's'} from
                this project's current classification selections:
              </p>
              <ul className="text-sm text-gray-700 mb-4 space-y-1 max-h-64 overflow-auto">
                {composePreview.map(t => <li key={t.id}>• {t.name}</li>)}
              </ul>
              <div className="flex justify-end gap-2">
                <button onClick={() => setComposePreview(null)}
                  className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">Cancel</button>
                <button onClick={confirmCompose} disabled={composing}
                  className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded">
                  Add {composePreview.length}
                </button>
              </div>
            </div>
          )
        )}
      </Modal>

      {/* Add modal */}
      <Modal title="Add Deliverable" open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">From the firm pool</label>
            <select value={pickedTemplate} onChange={e => { setPickedTemplate(e.target.value); if (e.target.value) setAdhocName('') }}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-teal-400">
              <option value="">— pick a deliverable —</option>
              {pool.map(t => (
                <option key={t.id} value={t.id} disabled={presentTemplateIds.has(t.id)}>
                  {t.name}{presentTemplateIds.has(t.id) ? ' (already tracked)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="text-center text-[10px] text-gray-400 uppercase tracking-wider">or ad-hoc</div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Project-local name</label>
            <input type="text" value={adhocName}
              onChange={e => { setAdhocName(e.target.value); if (e.target.value) setPickedTemplate('') }}
              placeholder="e.g. Roof Warranty Letter"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-teal-400" />
            <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={addToPool} onChange={e => setAddToPool(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              Also add to the firm pool (reusable on other projects)
            </label>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setAddOpen(false)}
              className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700">Cancel</button>
            <button onClick={performAdd} disabled={saving}
              className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50">Add</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
