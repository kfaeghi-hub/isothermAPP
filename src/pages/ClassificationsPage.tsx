// Admin config for the project classification framework: dimensions, options,
// deliverable templates, and each option's deliverable-default mappings.
// Everything here is firm-level runtime DATA — new dimensions/options are rows,
// never migrations. RLS: admin/developer write; the page is also nav-gated.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import type {
  ClassificationDimension, ClassificationOption, DeliverableTemplate, SelectionMode, TradeType,
  CompanyRoleType,
} from '../types/database'

// Reference-aware delete: every delete names its impact before proceeding, and
// referenced things offer "Deactivate instead" as the primary action.
interface DeleteTarget {
  kind: 'dimension' | 'option' | 'system' | 'template' | 'company_role'
  table: string
  id: string
  name: string
}

export function ClassificationsPage() {
  const [dimensions, setDimensions] = useState<ClassificationDimension[]>([])
  const [options, setOptions]       = useState<ClassificationOption[]>([])
  const [templates, setTemplates]   = useState<DeliverableTemplate[]>([])
  const [mappings, setMappings]     = useState<Record<string, string[]>>({})  // option_id → template_ids
  const [systems, setSystems]       = useState<TradeType[]>([])
  const [companyRoles, setCompanyRoles] = useState<CompanyRoleType[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [selectedDimId, setSelectedDimId] = useState<string | null>(null)
  const [expandedOptId, setExpandedOptId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSystems, setShowSystems]     = useState(false)
  const [showCompanyRoles, setShowCompanyRoles] = useState(false)

  const [newDimName, setNewDimName] = useState('')
  const [newOptLabel, setNewOptLabel] = useState('')
  const [newOptGroup, setNewOptGroup] = useState('')
  const [newTplName, setNewTplName] = useState('')
  const [newSysName, setNewSysName] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleAbbr, setNewRoleAbbr] = useState('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [impact, setImpact] = useState<string[] | null>(null)   // null = counting
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    const [dRes, oRes, tRes, mRes, sRes, crRes] = await Promise.all([
      supabase.from('classification_dimensions').select('*').order('sort_order'),
      supabase.from('classification_options').select('*').order('sort_order'),
      supabase.from('deliverable_templates').select('*').order('sort_order'),
      supabase.from('option_deliverable_defaults').select('option_id, template_id'),
      supabase.from('trade_types').select('*').order('sort_order'),
      supabase.from('company_role_types').select('*').order('sort_order'),
    ])
    const firstErr = dRes.error ?? oRes.error ?? tRes.error ?? mRes.error ?? sRes.error ?? crRes.error
    if (firstErr) { setError(firstErr.message); setLoading(false); return }
    setDimensions((dRes.data ?? []) as ClassificationDimension[])
    setOptions((oRes.data ?? []) as ClassificationOption[])
    setTemplates((tRes.data ?? []) as DeliverableTemplate[])
    setSystems((sRes.data ?? []) as TradeType[])
    setCompanyRoles((crRes.data ?? []) as CompanyRoleType[])
    const m: Record<string, string[]> = {}
    for (const r of (mRes.data ?? [])) (m[r.option_id as string] ??= []).push(r.template_id as string)
    setMappings(m)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Generic single-field updates (immediate write, then refetch) ──────────

  async function updateRow(table: string, id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) alert(error.message)
    fetchAll()
  }

  async function addDimension() {
    const name = newDimName.trim()
    if (!name) return
    const maxOrder = dimensions.reduce((m, d) => Math.max(m, d.sort_order), 0)
    const { error } = await supabase.from('classification_dimensions')
      .insert({ name, selection_mode: 'multi', required: false, sort_order: maxOrder + 1 })
    if (error) { alert(error.message); return }
    setNewDimName('')
    fetchAll()
  }

  async function addOption() {
    if (!selectedDimId) return
    const label = newOptLabel.trim()
    if (!label) return
    const dimOpts = options.filter(o => o.dimension_id === selectedDimId)
    const maxOrder = dimOpts.reduce((m, o) => Math.max(m, o.sort_order), 0)
    const { error } = await supabase.from('classification_options').insert({
      dimension_id: selectedDimId,
      label,
      group_label: newOptGroup.trim() || null,
      sort_order: maxOrder + 1,
    })
    if (error) { alert(error.message); return }
    setNewOptLabel('')
    fetchAll()
  }

  async function addTemplate() {
    const name = newTplName.trim()
    if (!name) return
    const maxOrder = templates.reduce((m, t) => Math.max(m, t.sort_order), 0)
    const { error } = await supabase.from('deliverable_templates')
      .insert({ name, sort_order: maxOrder + 1 })
    if (error) { alert(error.message); return }
    setNewTplName('')
    fetchAll()
  }

  async function addSystem() {
    const name = newSysName.trim()
    if (!name) return
    const maxOrder = systems.reduce((m, s) => Math.max(m, s.sort_order), 0)
    const { error } = await supabase.from('trade_types').insert({ name, sort_order: maxOrder + 1 })
    if (error) { alert(error.message); return }
    setNewSysName('')
    fetchAll()
  }

  // ── Reference-aware delete ─────────────────────────────────────────────────

  const distinct = (rows: { project_id: string }[] | null) =>
    new Set((rows ?? []).map(r => r.project_id)).size

  async function requestDelete(target: DeleteTarget) {
    setDeleteTarget(target)
    setImpact(null)

    const lines: string[] = []
    if (target.kind === 'option') {
      const { data } = await supabase.from('project_classifications')
        .select('project_id').eq('option_id', target.id)
      const n = distinct(data as any)
      if (n > 0) lines.push(`${n} project${n === 1 ? '' : 's'} currently use this — deleting removes it from their classification.`)
      const nMap = (mappings[target.id] ?? []).length
      if (nMap > 0) lines.push(`${nMap} deliverable-default mapping${nMap === 1 ? '' : 's'} will be deleted with it.`)
    } else if (target.kind === 'dimension') {
      const dimOpts = options.filter(o => o.dimension_id === target.id)
      const { data } = await supabase.from('project_classifications')
        .select('project_id').eq('dimension_id', target.id)
      const n = distinct(data as any)
      if (dimOpts.length > 0) lines.push(`Cascade: deletes its ${dimOpts.length} option${dimOpts.length === 1 ? '' : 's'} and their deliverable mappings.`)
      if (n > 0) lines.push(`${n} project${n === 1 ? '' : 's'} have selections in this dimension — all of them will be removed.`)
    } else if (target.kind === 'system') {
      const { data } = await supabase.from('project_trades')
        .select('project_id').eq('trade_type_id', target.id)
      const n = distinct(data as any)
      if (n > 0) lines.push(`${n} project${n === 1 ? '' : 's'} have this system selected — deleting removes it from them.`)
      lines.push('Historical finding categories keep their text either way (rule 4).')
    } else if (target.kind === 'company_role') {
      // Dual count: directory usages + project team assignments
      const [dirRes, teamRes] = await Promise.all([
        supabase.from('company_roles').select('company_id').eq('role_type_id', target.id),
        supabase.from('project_team_assignments').select('project_id').eq('role_type_id', target.id),
      ])
      const nDir = new Set((dirRes.data ?? []).map((r: any) => r.company_id)).size
      const nTeam = distinct(teamRes.data as any)
      if (nDir > 0)  lines.push(`${nDir} compan${nDir === 1 ? 'y holds' : 'ies hold'} this role in the directory — the tag will be removed from them.`)
      if (nTeam > 0) lines.push(`${nTeam} project team${nTeam === 1 ? '' : 's'} have this role assigned — those seats will be deleted.`)
    } else {
      const nMap = Object.values(mappings).flat().filter(id => id === target.id).length
      const { count } = await supabase.from('project_deliverables')
        .select('id', { count: 'exact', head: true }).eq('template_id', target.id)
      if (nMap > 0) lines.push(`${nMap} option mapping${nMap === 1 ? '' : 's'} will be deleted with it.`)
      if ((count ?? 0) > 0) lines.push(`${count} project deliverable${count === 1 ? '' : 's'} reference it — they will be deleted from those projects.`)
    }
    setImpact(lines)
  }

  const isReferenced = (impact ?? []).some(l => /^\d/.test(l) || l.startsWith('Cascade'))

  async function performDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    // project_deliverables.template_id is NO ACTION by design — clear it first.
    if (deleteTarget.kind === 'template') {
      const { error } = await supabase.from('project_deliverables')
        .delete().eq('template_id', deleteTarget.id)
      if (error) { alert(error.message); setDeleting(false); return }
    }
    // company_roles.role_type_id is NO ACTION — clear the directory tags first
    // (team assignments cascade from their own FK).
    if (deleteTarget.kind === 'company_role') {
      const { error } = await supabase.from('company_roles')
        .delete().eq('role_type_id', deleteTarget.id)
      if (error) { alert(error.message); setDeleting(false); return }
    }
    // Everything else cascades (options → selections/mappings; dimensions → options;
    // systems → project_trades).
    const { error } = await supabase.from(deleteTarget.table).delete().eq('id', deleteTarget.id)
    if (error) alert(error.message)
    setDeleting(false)
    setDeleteTarget(null)
    fetchAll()
  }

  async function deactivateInstead() {
    if (!deleteTarget) return
    await updateRow(deleteTarget.table, deleteTarget.id, { active: false })
    setDeleteTarget(null)
  }

  async function addCompanyRole() {
    const name = newRoleName.trim()
    if (!name) return
    const maxOrder = companyRoles.reduce((m, r) => Math.max(m, r.sort_order), 0)
    const { error } = await supabase.from('company_role_types')
      .insert({ name, abbreviation: newRoleAbbr.trim() || null, sort_order: maxOrder + 1 })
    if (error) { alert(error.message); return }
    setNewRoleName(''); setNewRoleAbbr('')
    fetchAll()
  }

  async function toggleMapping(optionId: string, templateId: string) {
    const has = (mappings[optionId] ?? []).includes(templateId)
    if (has) {
      const { error } = await supabase.from('option_deliverable_defaults')
        .delete().eq('option_id', optionId).eq('template_id', templateId)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.from('option_deliverable_defaults')
        .insert({ option_id: optionId, template_id: templateId })
      if (error) alert(error.message)
    }
    fetchAll()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading classifications…</div>
  if (error)   return <div className="p-8 text-sm text-red-600">{error}</div>

  const selectedDim = dimensions.find(d => d.id === selectedDimId) ?? null
  const dimOptions = selectedDim ? options.filter(o => o.dimension_id === selectedDim.id) : []
  const inputCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <div className="h-full overflow-auto p-6 space-y-8 max-w-5xl">

      {/* ── Dimensions ──────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Classification Dimensions</h3>
        <p className="text-xs text-gray-400 mb-3">
          Rendered in the New/Edit Project modals in this order. Required flags take effect immediately —
          they are enforced at project creation from these values.
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="py-1.5 pr-3">Dimension</th>
              <th className="py-1.5 pr-3 w-28">Mode</th>
              <th className="py-1.5 pr-3 w-20">Required</th>
              <th className="py-1.5 pr-3 w-16">Order</th>
              <th className="py-1.5 pr-3 w-16">Active</th>
              <th className="py-1.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {dimensions.map(d => (
              <tr key={d.id} className={`border-b border-gray-100 ${selectedDimId === d.id ? 'bg-teal-50/40' : ''}`}>
                <td className="py-1.5 pr-3">
                  <input defaultValue={d.name} className={`${inputCls} w-full`}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.name) updateRow('classification_dimensions', d.id, { name: v }) }} />
                </td>
                <td className="py-1.5 pr-3">
                  <select value={d.selection_mode} className={`${inputCls} bg-white`}
                    onChange={e => updateRow('classification_dimensions', d.id, { selection_mode: e.target.value as SelectionMode })}>
                    <option value="single">single</option>
                    <option value="multi">multi</option>
                  </select>
                </td>
                <td className="py-1.5 pr-3 text-center">
                  <input type="checkbox" checked={d.required}
                    onChange={e => updateRow('classification_dimensions', d.id, { required: e.target.checked })} />
                </td>
                <td className="py-1.5 pr-3">
                  <input type="number" defaultValue={d.sort_order} className={`${inputCls} w-14`}
                    onBlur={e => { const v = Number(e.target.value); if (v !== d.sort_order) updateRow('classification_dimensions', d.id, { sort_order: v }) }} />
                </td>
                <td className="py-1.5 pr-3 text-center">
                  <input type="checkbox" checked={d.active}
                    onChange={e => updateRow('classification_dimensions', d.id, { active: e.target.checked })} />
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedDimId(selectedDimId === d.id ? null : d.id)}
                      className="text-teal-700 hover:underline">
                      {selectedDimId === d.id ? 'Hide options' : `Options (${options.filter(o => o.dimension_id === d.id).length})`}
                    </button>
                    <button
                      onClick={() => requestDelete({ kind: 'dimension', table: 'classification_dimensions', id: d.id, name: d.name })}
                      className="text-red-400 hover:text-red-600">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2 mt-2">
          <input value={newDimName} onChange={e => setNewDimName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDimension()}
            placeholder="New dimension name…" className={`${inputCls} w-64`} />
          <button onClick={addDimension} className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">Add</button>
        </div>
      </section>

      {/* ── Options of the selected dimension ───────────────────────────── */}
      {selectedDim && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Options — {selectedDim.name}</h3>
          <p className="text-xs text-gray-400 mb-3">
            Group labels render as optgroup bands (single) or are informational (multi). "Deliverables"
            maps the default document set this option contributes at project creation.
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-1.5 pr-3">Label</th>
                <th className="py-1.5 pr-3 w-44">Group</th>
                <th className="py-1.5 pr-3">Description</th>
                <th className="py-1.5 pr-3 w-16">Order</th>
                <th className="py-1.5 pr-3 w-16">Active</th>
                <th className="py-1.5 w-32" />
              </tr>
            </thead>
            <tbody>
              {dimOptions.map(o => (
                <>
                  <tr key={o.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">
                      <input defaultValue={o.label} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== o.label) updateRow('classification_options', o.id, { label: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input defaultValue={o.group_label ?? ''} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim() || null; if (v !== o.group_label) updateRow('classification_options', o.id, { group_label: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input defaultValue={o.description ?? ''} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim() || null; if (v !== o.description) updateRow('classification_options', o.id, { description: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" defaultValue={o.sort_order} className={`${inputCls} w-14`}
                        onBlur={e => { const v = Number(e.target.value); if (v !== o.sort_order) updateRow('classification_options', o.id, { sort_order: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      <input type="checkbox" checked={o.active}
                        onChange={e => updateRow('classification_options', o.id, { active: e.target.checked })} />
                    </td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setExpandedOptId(expandedOptId === o.id ? null : o.id)}
                          className="text-teal-700 hover:underline">
                          Deliverables ({(mappings[o.id] ?? []).length})
                        </button>
                        <button
                          onClick={() => requestDelete({ kind: 'option', table: 'classification_options', id: o.id, name: o.label })}
                          className="text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                  {expandedOptId === o.id && (
                    <tr key={`${o.id}-map`}>
                      <td colSpan={6} className="py-2 px-3 bg-gray-50 border-b border-gray-100">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">
                          Default deliverables contributed by "{o.label}"
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {templates.filter(t => t.active).map(t => {
                            const on = (mappings[o.id] ?? []).includes(t.id)
                            return (
                              <button key={t.id} onClick={() => toggleMapping(o.id, t.id)}
                                title={t.description ?? undefined}
                                className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                                  on ? 'bg-teal-700 text-white border-teal-700'
                                     : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400'
                                }`}>
                                {t.name}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-2">
            <input value={newOptLabel} onChange={e => setNewOptLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addOption()}
              placeholder="New option label…" className={`${inputCls} w-56`} />
            <input value={newOptGroup} onChange={e => setNewOptGroup(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addOption()}
              placeholder="Group (optional)…" className={`${inputCls} w-44`} />
            <button onClick={addOption} className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">Add</button>
          </div>
        </section>
      )}

      {/* ── Systems to be Commissioned ───────────────────────────────────── */}
      {/* Managed here so classification feels like one system to the user, but the
          backbone is untouched: rows live in trade_types, selections in project_trades,
          and finding categories keep reading them exactly as before. */}
      <section>
        <button onClick={() => setShowSystems(s => !s)} className="text-sm font-semibold text-gray-800 hover:text-teal-700">
          Systems to be Commissioned ({systems.length}) {showSystems ? '▾' : '▸'}
        </button>
        {showSystems && (
          <>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              Stored as the firm's systems list (trade_types) and selected per project. Renaming a
              system does <span className="font-medium">not</span> rewrite historical finding
              categories — issued records keep the text they were created with (rule 4).
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-1.5 pr-3">System</th>
                  <th className="py-1.5 pr-3 w-16">Order</th>
                  <th className="py-1.5 pr-3 w-16">Active</th>
                  <th className="py-1.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {systems.map(s => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">
                      <input defaultValue={s.name} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) updateRow('trade_types', s.id, { name: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" defaultValue={s.sort_order} className={`${inputCls} w-14`}
                        onBlur={e => { const v = Number(e.target.value); if (v !== s.sort_order) updateRow('trade_types', s.id, { sort_order: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      <input type="checkbox" checked={s.active}
                        onChange={e => updateRow('trade_types', s.id, { active: e.target.checked })} />
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => requestDelete({ kind: 'system', table: 'trade_types', id: s.id, name: s.name })}
                        className="text-red-400 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-2">
              <input value={newSysName} onChange={e => setNewSysName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSystem()}
                placeholder="New system…" className={`${inputCls} w-64`} />
              <button onClick={addSystem} className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">Add</button>
            </div>
          </>
        )}
      </section>

      {/* ── Company Roles ────────────────────────────────────────────────── */}
      {/* One vocabulary for "what a company does" (directory) and "role on this
          project" (team matrix). Deleting counts BOTH usages. */}
      <section>
        <button onClick={() => setShowCompanyRoles(s => !s)} className="text-sm font-semibold text-gray-800 hover:text-teal-700">
          Company Roles ({companyRoles.length}) {showCompanyRoles ? '▾' : '▸'}
        </button>
        {showCompanyRoles && (
          <>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              Used as directory tags and as project team seats. Abbreviations render as the
              matrix chips (CxA, GC, BECx…).
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-1.5 pr-3">Role</th>
                  <th className="py-1.5 pr-3 w-24">Abbr.</th>
                  <th className="py-1.5 pr-3 w-16">Order</th>
                  <th className="py-1.5 pr-3 w-16">Active</th>
                  <th className="py-1.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {companyRoles.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">
                      <input defaultValue={r.name} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.name) updateRow('company_role_types', r.id, { name: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input defaultValue={r.abbreviation ?? ''} className={`${inputCls} w-20 font-mono`}
                        onBlur={e => { const v = e.target.value.trim() || null; if (v !== r.abbreviation) updateRow('company_role_types', r.id, { abbreviation: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" defaultValue={r.sort_order} className={`${inputCls} w-14`}
                        onBlur={e => { const v = Number(e.target.value); if (v !== r.sort_order) updateRow('company_role_types', r.id, { sort_order: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      <input type="checkbox" checked={r.active}
                        onChange={e => updateRow('company_role_types', r.id, { active: e.target.checked })} />
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => requestDelete({ kind: 'company_role', table: 'company_role_types', id: r.id, name: r.name })}
                        className="text-red-400 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-2">
              <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCompanyRole()}
                placeholder="New role…" className={`${inputCls} w-56`} />
              <input value={newRoleAbbr} onChange={e => setNewRoleAbbr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCompanyRole()}
                placeholder="Abbr." className={`${inputCls} w-20 font-mono`} />
              <button onClick={addCompanyRole} className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">Add</button>
            </div>
          </>
        )}
      </section>

      {/* ── Deliverable templates ────────────────────────────────────────── */}
      <section>
        <button onClick={() => setShowTemplates(s => !s)} className="text-sm font-semibold text-gray-800 hover:text-teal-700">
          Deliverable Templates ({templates.length}) {showTemplates ? '▾' : '▸'}
        </button>
        {showTemplates && (
          <>
            <p className="text-xs text-gray-400 mt-1 mb-3">
              The firm's document deliverable pool (Cx Plan, OPR review, Systems Manual…). Options map
              onto these; project creation composes the union into the project's editable copy.
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-1.5 pr-3 w-64">Name</th>
                  <th className="py-1.5 pr-3">Description</th>
                  <th className="py-1.5 pr-3 w-16">Order</th>
                  <th className="py-1.5 pr-3 w-16">Active</th>
                  <th className="py-1.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">
                      <input defaultValue={t.name} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) updateRow('deliverable_templates', t.id, { name: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input defaultValue={t.description ?? ''} className={`${inputCls} w-full`}
                        onBlur={e => { const v = e.target.value.trim() || null; if (v !== t.description) updateRow('deliverable_templates', t.id, { description: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input type="number" defaultValue={t.sort_order} className={`${inputCls} w-14`}
                        onBlur={e => { const v = Number(e.target.value); if (v !== t.sort_order) updateRow('deliverable_templates', t.id, { sort_order: v }) }} />
                    </td>
                    <td className="py-1.5 pr-3 text-center">
                      <input type="checkbox" checked={t.active}
                        onChange={e => updateRow('deliverable_templates', t.id, { active: e.target.checked })} />
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => requestDelete({ kind: 'template', table: 'deliverable_templates', id: t.id, name: t.name })}
                        className="text-red-400 hover:text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-2">
              <input value={newTplName} onChange={e => setNewTplName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTemplate()}
                placeholder="New deliverable template…" className={`${inputCls} w-64`} />
              <button onClick={addTemplate} className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">Add</button>
            </div>
          </>
        )}
      </section>

      {/* ── Reference-aware delete confirmation ──────────────────────────── */}
      <Modal
        title={`Delete "${deleteTarget?.name ?? ''}"?`}
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        maxWidth="sm"
      >
        <div className="space-y-4">
          {impact === null ? (
            <p className="text-sm text-gray-400">Checking references…</p>
          ) : impact.length === 0 ? (
            <p className="text-sm text-gray-700">
              Not referenced by any project — safe to delete permanently.
            </p>
          ) : (
            <ul className="text-sm text-gray-700 space-y-1.5 list-disc pl-5">
              {impact.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}

          {impact !== null && isReferenced && (
            <p className="text-xs text-gray-400">
              Deactivating hides it from pickers while preserving every existing
              selection (shown as "(inactive)").
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setDeleteTarget(null)} disabled={deleting}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">
              Cancel
            </button>
            {impact !== null && isReferenced && (
              <button onClick={deactivateInstead} disabled={deleting}
                className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 font-medium">
                Deactivate instead
              </button>
            )}
            <button onClick={performDelete} disabled={deleting || impact === null}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 font-medium">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
