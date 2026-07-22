// Project Team / Communication Matrix — the Cx Plan Table 1-1 come alive.
// One card per role in FIRM sort order (consistent matrix rhythm across projects;
// per-project role order is a future additive column if practice demands it).
// Phone/email are never stored on assignments: every render resolves the contact's
// title + primary phone/email from the directory (primary ?? legacy).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { resolveEmail, resolvePhone } from '../lib/contactInfo'
import { reportError } from '../lib/mutationError'
import { Modal } from '../components/ui/Modal'
import type {
  CompanyRoleType, TeamAssignmentWithDetail, ContactWithDetail,
} from '../types/database'

interface CompanyLite { id: string; name: string; abbreviation: string | null; roleTypeIds: string[] }

interface Props { projectId: string }

export function TeamPage({ projectId }: Props) {
  const [roleTypes, setRoleTypes]     = useState<CompanyRoleType[]>([])
  const [assignments, setAssignments] = useState<TeamAssignmentWithDetail[]>([])
  const [companies, setCompanies]     = useState<CompanyLite[]>([])
  const [contacts, setContacts]       = useState<ContactWithDetail[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [hideUnassigned, setHideUnassigned] = useState(false)

  // Assign modal: two steps in one Modal (company → contacts), per approved design
  const [assign, setAssign] = useState<{
    open: boolean; roleTypeId: string; step: 1 | 2; companyId: string
  } | null>(null)
  const [companySearch, setCompanySearch] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  const [companyOnly, setCompanyOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Inline adds
  const [newCompanyName, setNewCompanyName] = useState('')
  const [addingCompany, setAddingCompany] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactTitle, setNewContactTitle] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleAbbr, setNewRoleAbbr] = useState('')

  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [rtRes, aRes, cRes, ctRes] = await Promise.all([
      supabase.from('company_role_types').select('*').order('sort_order'),
      supabase.from('project_team_assignments')
        .select('*, companies(id, name, abbreviation), contacts(id, name, trade, email, phone, contact_emails(*), contact_phones(*))')
        .eq('project_id', projectId)
        .order('sort_order'),
      supabase.from('companies').select('id, name, abbreviation, company_roles(role_type_id)').order('name'),
      supabase.from('contacts')
        .select('*, companies(id, name, abbreviation), contact_phones(*), contact_emails(*)')
        .order('name'),
    ])
    const firstErr = rtRes.error ?? aRes.error ?? cRes.error ?? ctRes.error
    if (firstErr) { setError(firstErr.message); setLoading(false); return }
    setRoleTypes((rtRes.data ?? []) as CompanyRoleType[])
    setAssignments((aRes.data ?? []) as unknown as TeamAssignmentWithDetail[])
    setCompanies(((cRes.data ?? []) as any[]).map(c => ({
      id: c.id, name: c.name, abbreviation: c.abbreviation,
      roleTypeIds: (c.company_roles ?? []).map((r: any) => r.role_type_id).filter(Boolean),
    })))
    setContacts((ctRes.data ?? []) as ContactWithDetail[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived ────────────────────────────────────────────────────────────────

  const byRole = assignments.reduce<Record<string, TeamAssignmentWithDetail[]>>((acc, a) => {
    (acc[a.role_type_id] ??= []).push(a)
    return acc
  }, {})

  // Active roles in firm order, plus any inactive role that still has assignments
  const matrixRoles = roleTypes.filter(r => r.active || (byRole[r.id]?.length ?? 0) > 0)

  // ── Assignment flow ────────────────────────────────────────────────────────

  function openAssign(roleTypeId: string) {
    setAssign({ open: true, roleTypeId, step: 1, companyId: '' })
    setCompanySearch(''); setSelectedContactIds([]); setCompanyOnly(false)
    setAddingCompany(false); setAddingContact(false); setAssignError(null)
  }

  function openAddPerson(roleTypeId: string, companyId: string) {
    setAssign({ open: true, roleTypeId, step: 2, companyId })
    setSelectedContactIds([]); setCompanyOnly(false)
    setAddingContact(false); setAssignError(null)
  }

  function pickCompany(companyId: string) {
    setAssign(a => a ? { ...a, step: 2, companyId } : a)
    setSelectedContactIds([]); setCompanyOnly(false); setAssignError(null)
  }

  async function addNewCompanyInline() {
    if (!assign) return
    const name = newCompanyName.trim()
    if (!name) return
    const roleType = roleTypes.find(r => r.id === assign.roleTypeId)
    const { data, error } = await supabase.from('companies')
      .insert({ name }).select('id, name, abbreviation').single()
    if (error || !data) { setAssignError(error?.message ?? 'Could not create company.'); return }
    // Real directory record with this role pre-set (junction + legacy dual-write)
    const { error: roleError } = await supabase.from('company_roles').insert({
      company_id: data.id, role_type_id: assign.roleTypeId, role: roleType?.name ?? '',
    })
    reportError(roleError, 'tag the new company with its role')
    setCompanies(cs => [...cs, { id: data.id, name: data.name, abbreviation: data.abbreviation, roleTypeIds: [assign.roleTypeId] }]
      .sort((a, b) => a.name.localeCompare(b.name)))
    setNewCompanyName(''); setAddingCompany(false)
    pickCompany(data.id)
  }

  async function addNewContactInline() {
    if (!assign?.companyId) return
    const name = newContactName.trim()
    if (!name) return
    const { data, error } = await supabase.from('contacts')
      .insert({ name, company_id: assign.companyId, trade: newContactTitle.trim() || null })
      .select('*, companies(id, name, abbreviation), contact_phones(*), contact_emails(*)')
      .single()
    if (error || !data) { setAssignError(error?.message ?? 'Could not create contact.'); return }
    setContacts(cs => [...cs, data as ContactWithDetail].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedContactIds(ids => [...ids, data.id])
    setNewContactName(''); setNewContactTitle(''); setAddingContact(false)
  }

  async function saveAssignment() {
    if (!assign) return
    if (!companyOnly && selectedContactIds.length === 0) {
      setAssignError('Pick at least one person, or choose "Company only".'); return
    }
    setSaving(true)
    setAssignError(null)

    const existing = (byRole[assign.roleTypeId] ?? []).filter(a => a.company_id === assign.companyId)
    const base = existing.reduce((m, a) => Math.max(m, a.sort_order), -1) + 1
    const rows: { project_id: string; role_type_id: string; company_id: string; contact_id: string | null; sort_order: number }[] =
      companyOnly
        ? [{ project_id: projectId, role_type_id: assign.roleTypeId, company_id: assign.companyId, contact_id: null, sort_order: base }]
        : selectedContactIds.map((contact_id, i) => ({
            project_id: projectId, role_type_id: assign.roleTypeId, company_id: assign.companyId,
            contact_id, sort_order: base + i,
          }))

    const { error } = await supabase.from('project_team_assignments').insert(rows)
    setSaving(false)
    if (error) {
      setAssignError(error.code === '23505'
        ? 'Already assigned to this role.'
        : error.message)
      return
    }
    setAssign(null)
    fetchAll()
  }

  async function removeAssignmentRow(id: string) {
    const { error } = await supabase.from('project_team_assignments').delete().eq('id', id)
    if (reportError(error, 'remove this assignment')) return
    fetchAll()
  }

  async function removeRoleAssignments(roleTypeId: string, roleName: string) {
    const n = byRole[roleTypeId]?.length ?? 0
    if (!confirm(`Remove the ${roleName} assignment${n > 1 ? `s (${n} entries)` : ''} from this project?`)) return
    const { error } = await supabase.from('project_team_assignments')
      .delete().eq('project_id', projectId).eq('role_type_id', roleTypeId)
    if (reportError(error, "remove the role's assignments")) return
    fetchAll()
  }

  async function swapCompany(roleTypeId: string, roleName: string, companyId: string, companyName: string) {
    const n = (byRole[roleTypeId] ?? []).filter(a => a.company_id === companyId).length
    if (!confirm(`Replace ${companyName} as ${roleName}? ${n > 1 ? `Its ${n} entries` : 'Its entry'} will be removed.`)) return
    const { error } = await supabase.from('project_team_assignments')
      .delete().eq('project_id', projectId).eq('role_type_id', roleTypeId).eq('company_id', companyId)
    if (reportError(error, 'replace the current company')) return
    await fetchAll()
    openAssign(roleTypeId)
  }

  async function movePerson(a: TeamAssignmentWithDetail, dir: -1 | 1) {
    const siblings = (byRole[a.role_type_id] ?? [])
      .filter(x => x.company_id === a.company_id)
      .sort((x, y) => x.sort_order - y.sort_order)
    const i = siblings.findIndex(x => x.id === a.id)
    const j = i + dir
    if (j < 0 || j >= siblings.length) return
    // Swap sort_orders
    const [resA, resB] = await Promise.all([
      supabase.from('project_team_assignments').update({ sort_order: siblings[j].sort_order }).eq('id', a.id),
      supabase.from('project_team_assignments').update({ sort_order: a.sort_order }).eq('id', siblings[j].id),
    ])
    // On any error the reorder may be half-applied; report and reload to resync.
    reportError(resA.error ?? resB.error, 'reorder the team')
    fetchAll()
  }

  async function addNewRoleInline() {
    const name = newRoleName.trim()
    if (!name) return
    const maxOrder = roleTypes.reduce((m, r) => Math.max(m, r.sort_order), 0)
    const { error } = await supabase.from('company_role_types')
      .insert({ name, abbreviation: newRoleAbbr.trim() || null, sort_order: maxOrder + 1 })
    if (error) { alert(error.message); return }
    setNewRoleName(''); setNewRoleAbbr(''); setAddingRole(false)
    fetchAll()
  }

  function copyEmail(email: string) {
    navigator.clipboard?.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 1200)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading team…</div>
  if (error)   return <div className="p-8 text-sm text-red-600">{error}</div>

  const assignedCount = matrixRoles.filter(r => (byRole[r.id]?.length ?? 0) > 0).length
  const assignCompanies = assign
    ? companies.filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()))
    : []
  const suggested = assignCompanies.filter(c => assign && c.roleTypeIds.includes(assign.roleTypeId))
  const others    = assignCompanies.filter(c => !assign || !c.roleTypeIds.includes(assign.roleTypeId))
  const assignRole = roleTypes.find(r => r.id === assign?.roleTypeId)
  const assignCompany = companies.find(c => c.id === assign?.companyId)
  const alreadyAssignedIds = new Set(
    (assign ? (byRole[assign.roleTypeId] ?? []) : [])
      .filter(a => a.company_id === assign?.companyId && a.contact_id)
      .map(a => a.contact_id as string),
  )
  const pickableContacts = contacts.filter(c =>
    c.company_id === assign?.companyId && !alreadyAssignedIds.has(c.id))

  return (
    <div className="max-w-3xl p-6">
      <style>{`@keyframes team-settle { from { opacity: 0.35; transform: translateY(3px); } to { opacity: 1; transform: none; } }`}</style>

      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">Project Team</h3>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={hideUnassigned} onChange={e => setHideUnassigned(e.target.checked)} />
          Hide unassigned
        </label>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        This team feeds the Cx Plan communication matrix and other project documents.
        &nbsp;{assignedCount}/{matrixRoles.length} roles assigned.
      </p>

      <div className="space-y-2">
        {matrixRoles.map(role => {
          const roleAssignments = (byRole[role.id] ?? []).sort((a, b) => a.sort_order - b.sort_order)
          if (roleAssignments.length === 0) {
            if (hideUnassigned) return null
            return (
              <button
                key={role.id}
                onClick={() => openAssign(role.id)}
                className="w-full text-left border-2 border-dashed border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3 hover:border-teal-300 hover:bg-teal-50/20 transition-colors group"
              >
                <RoleBadge role={role} muted />
                <span className="text-sm text-gray-400">{role.name}</span>
                <span className="ml-auto text-xs text-gray-300 group-hover:text-teal-600 transition-colors">
                  Assign company →
                </span>
              </button>
            )
          }

          // Group by company within the role (schema permits multi-company seats)
          const byCompany = roleAssignments.reduce<Record<string, TeamAssignmentWithDetail[]>>((acc, a) => {
            (acc[a.company_id] ??= []).push(a)
            return acc
          }, {})

          return (
            <div
              key={role.id}
              style={{ animation: 'team-settle .25s ease-out' }}
              className="border border-gray-200 rounded-lg px-4 py-3 bg-white group"
            >
              <div className="flex items-center gap-3">
                <RoleBadge role={role} />
                <span className="text-xs text-gray-500">{role.name}{!role.active && ' (inactive)'}</span>
                <div className="ml-auto hidden group-hover:flex items-center gap-3 text-xs">
                  <button
                    onClick={() => removeRoleAssignments(role.id, role.name)}
                    className="text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {Object.entries(byCompany).map(([companyId, rows]) => (
                <div key={companyId} className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {rows[0].companies?.name ?? '—'}
                    </span>
                    {rows[0].companies?.abbreviation && (
                      <span className="font-mono text-[11px] text-gray-400">({rows[0].companies.abbreviation})</span>
                    )}
                    <div className="hidden group-hover:flex items-center gap-2.5 text-[11px] ml-2">
                      <button onClick={() => openAddPerson(role.id, companyId)}
                        className="text-teal-700 hover:underline">+ person</button>
                      <button
                        onClick={() => swapCompany(role.id, role.name, companyId, rows[0].companies?.name ?? '')}
                        className="text-gray-400 hover:text-gray-600">swap</button>
                    </div>
                  </div>

                  {rows.filter(a => a.contacts).map((a, idx, arr) => {
                    const c = a.contacts!
                    const email = resolveEmail(c)
                    const phone = resolvePhone(c)
                    return (
                      <div key={a.id} className="flex items-center gap-2.5 mt-1.5 pl-1">
                        <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                          {c.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm text-gray-800">{c.name}</span>
                            {c.trade && <span className="text-xs text-gray-400 truncate">{c.trade}</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            {phone ? (
                              <span className="flex items-center gap-1">
                                <PhoneIcon />{phone.display}
                                {phone.typeLabel && <span className="text-[10px] text-gray-400">{phone.typeLabel}</span>}
                              </span>
                            ) : (
                              <span className="text-gray-300 italic">no phone on file — add in Directory</span>
                            )}
                            {email ? (
                              <span className="flex items-center gap-1">
                                <MailIcon />
                                <a href={`mailto:${email}`} className="text-teal-700 hover:underline">{email}</a>
                                <button onClick={() => copyEmail(email)} title="Copy email"
                                  className="text-gray-300 hover:text-teal-600">
                                  {copiedEmail === email ? '✓' : <CopyIcon />}
                                </button>
                              </span>
                            ) : (
                              <span className="text-gray-300 italic">no email on file — add in Directory</span>
                            )}
                          </div>
                        </div>
                        <div className="ml-auto hidden group-hover:flex items-center gap-1.5 flex-shrink-0">
                          {arr.length > 1 && (
                            <>
                              <button onClick={() => movePerson(a, -1)} disabled={idx === 0}
                                className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs">↑</button>
                              <button onClick={() => movePerson(a, 1)} disabled={idx === arr.length - 1}
                                className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs">↓</button>
                            </>
                          )}
                          <button onClick={() => removeAssignmentRow(a.id)} title="Remove person"
                            className="text-gray-300 hover:text-red-500 text-sm leading-none">×</button>
                        </div>
                      </div>
                    )
                  })}

                  {rows.some(a => !a.contact_id) && (
                    <div className="flex items-center gap-2 mt-1.5 pl-1 text-xs text-gray-400 italic">
                      Company only — no contact assigned
                      <button
                        onClick={() => removeAssignmentRow(rows.find(a => !a.contact_id)!.id)}
                        className="hidden group-hover:inline text-gray-300 hover:text-red-500 not-italic">×</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* + Add role — grows the FIRM vocabulary (real company_role_types row) */}
      <div className="mt-3">
        {addingRole ? (
          <div className="flex items-center gap-1.5">
            <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNewRoleInline(); if (e.key === 'Escape') setAddingRole(false) }}
              placeholder="Role name (e.g. Sprinkler Contractor)…"
              className="border border-teal-300 rounded px-3 py-1.5 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-teal-500" autoFocus />
            <input value={newRoleAbbr} onChange={e => setNewRoleAbbr(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addNewRoleInline(); if (e.key === 'Escape') setAddingRole(false) }}
              placeholder="Abbr."
              className="border border-teal-300 rounded px-3 py-1.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            <button onClick={addNewRoleInline} className="text-teal-700 text-sm font-medium leading-none px-1">✓</button>
            <button onClick={() => setAddingRole(false)} className="text-gray-400 text-sm leading-none px-1">✕</button>
          </div>
        ) : (
          <button onClick={() => setAddingRole(true)}
            className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-3 py-1.5 transition-colors">
            + Add role
          </button>
        )}
        <p className="text-[11px] text-gray-300 mt-1.5">
          New roles join the firm vocabulary — manage them under Classifications.
        </p>
      </div>

      {/* ── Assign modal: company → contacts ─────────────────────────────── */}
      <Modal
        title={assign?.step === 1
          ? `Assign ${assignRole?.name ?? ''} — Select Company`
          : `${assignRole?.name ?? ''} · ${assignCompany?.name ?? ''} — Select People`}
        open={!!assign?.open}
        onClose={() => setAssign(null)}
        maxWidth="md"
      >
        {assign?.step === 1 && (
          <div className="space-y-3">
            <input
              type="text" value={companySearch} onChange={e => setCompanySearch(e.target.value)}
              placeholder="Search companies…" autoFocus
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="max-h-72 overflow-auto space-y-0.5">
              {suggested.length > 0 && (
                <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider px-1 pt-1">
                  Suggested — hold the {assignRole?.name} role
                </p>
              )}
              {suggested.map(c => <CompanyRow key={c.id} c={c} onPick={pickCompany} />)}
              {suggested.length > 0 && others.length > 0 && (
                <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider px-1 pt-2">All companies</p>
              )}
              {others.map(c => <CompanyRow key={c.id} c={c} onPick={pickCompany} />)}
            </div>
            {addingCompany ? (
              <div className="flex items-center gap-1.5">
                <input value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNewCompanyInline(); if (e.key === 'Escape') setAddingCompany(false) }}
                  placeholder="New company name…" autoFocus
                  className="flex-1 border border-teal-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" />
                <button onClick={addNewCompanyInline} className="text-teal-700 text-lg leading-none px-1">✓</button>
                <button onClick={() => setAddingCompany(false)} className="text-gray-400 text-lg leading-none px-1">✕</button>
              </div>
            ) : (
              <button onClick={() => setAddingCompany(true)}
                className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-3 py-1.5 transition-colors">
                + New company (created in the directory with this role)
              </button>
            )}
            {assignError && <p className="text-sm text-red-600">{assignError}</p>}
          </div>
        )}

        {assign?.step === 2 && (
          <div className="space-y-3">
            <div className="max-h-64 overflow-auto space-y-0.5">
              {pickableContacts.map(c => {
                const email = resolveEmail(c)
                const on = selectedContactIds.includes(c.id)
                return (
                  <label key={c.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer transition-colors ${
                      on ? 'bg-teal-50' : 'hover:bg-gray-50'
                    } ${companyOnly ? 'opacity-40 pointer-events-none' : ''}`}>
                    <input type="checkbox" checked={on}
                      onChange={() => setSelectedContactIds(ids =>
                        on ? ids.filter(id => id !== c.id) : [...ids, c.id])} />
                    <span className="text-sm text-gray-800">{c.name}</span>
                    {c.trade && <span className="text-xs text-gray-400">{c.trade}</span>}
                    {email && <span className="text-xs text-gray-400 ml-auto truncate max-w-[180px]">{email}</span>}
                  </label>
                )
              })}
              {pickableContacts.length === 0 && (
                <p className="text-xs text-gray-400 px-1 py-2">
                  No unassigned contacts at this company yet — add one below, or use "Company only".
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer border-t border-gray-100 pt-3">
              <input type="checkbox" checked={companyOnly}
                onChange={e => { setCompanyOnly(e.target.checked); if (e.target.checked) setSelectedContactIds([]) }} />
              Company only — no contact
            </label>

            {addingContact ? (
              <div className="flex items-center gap-1.5">
                <input value={newContactName} onChange={e => setNewContactName(e.target.value)}
                  placeholder="Name…" autoFocus
                  className="flex-1 border border-teal-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" />
                <input value={newContactTitle} onChange={e => setNewContactTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNewContactInline() }}
                  placeholder="Title…"
                  className="w-40 border border-teal-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500" />
                <button onClick={addNewContactInline} className="text-teal-700 text-lg leading-none px-1">✓</button>
                <button onClick={() => setAddingContact(false)} className="text-gray-400 text-lg leading-none px-1">✕</button>
              </div>
            ) : (
              <button onClick={() => setAddingContact(true)}
                className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-3 py-1.5 transition-colors">
                + New contact at {assignCompany?.name ?? 'this company'}
              </button>
            )}

            {assignError && <p className="text-sm text-red-600">{assignError}</p>}

            <div className="flex justify-between pt-1">
              <button onClick={() => setAssign(a => a ? { ...a, step: 1 } : a)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">← Back</button>
              <div className="flex gap-2">
                <button onClick={() => setAssign(null)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={saveAssignment} disabled={saving}
                  className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 font-medium">
                  {saving ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function RoleBadge({ role, muted = false }: { role: CompanyRoleType; muted?: boolean }) {
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 font-mono ${
      muted ? 'bg-gray-100 text-gray-400' : 'bg-[#1F3A5F] text-white'
    }`}>
      {role.abbreviation ?? role.name.slice(0, 4).toUpperCase()}
    </span>
  )
}

function CompanyRow({ c, onPick }: { c: { id: string; name: string; abbreviation: string | null }; onPick: (id: string) => void }) {
  return (
    <button onClick={() => onPick(c.id)}
      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded hover:bg-teal-50/40 transition-colors">
      <span className="text-sm text-gray-800">{c.name}</span>
      {c.abbreviation && <span className="font-mono text-[11px] text-gray-400">({c.abbreviation})</span>}
    </button>
  )
}

function PhoneIcon() {
  return (
    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
    </svg>
  )
}
