import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import type {
  CompanyWithDetail, ContactWithDetail,
  CompanyRoleType, TradeType, PhoneType,
} from '../types/database'

import { PHONE_TYPES, phoneLabel, primaryOf } from '../lib/contactInfo'

// ── Form state types ───────────────────────────────────────────────────────

interface LocationRow {
  id?: string          // present = existing row (contacts may reference it — never delete-and-recreate)
  label: string
  address: string
  phone: string
  is_primary: boolean
  active: boolean
}

interface PhoneRow  { phone_type: PhoneType; number: string; extension: string; is_primary: boolean }
interface EmailRow  { label: string; email: string; is_primary: boolean }

interface CompanyForm {
  name: string
  abbreviation: string
  notes: string
  phone: string
  website: string
  email: string
  roleTypeIds: string[]
  tradeIds: string[]
  locations: LocationRow[]
}

interface ContactForm {
  name: string
  company_id: string
  trade: string          // job title — rendered as "Title"
  location_id: string
  phones: PhoneRow[]
  emails: EmailRow[]
}

const EMPTY_COMPANY: CompanyForm = {
  name: '', abbreviation: '', notes: '', phone: '', website: '', email: '',
  roleTypeIds: [], tradeIds: [], locations: [],
}
const EMPTY_CONTACT: ContactForm = {
  name: '', company_id: '', trade: '', location_id: '', phones: [], emails: [],
}

// ── Component ──────────────────────────────────────────────────────────────

export function DirectoryPage() {
  // Data
  const [companies, setCompanies] = useState<CompanyWithDetail[]>([])
  const [contacts, setContacts] = useState<ContactWithDetail[]>([])
  const [roleTypes, setRoleTypes] = useState<CompanyRoleType[]>([])
  const [tradeTypes, setTradeTypes] = useState<TradeType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [companySearch, setCompanySearch] = useState('')
  const [companyTradeFilter, setCompanyTradeFilter] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Company modal
  const [companyModal, setCompanyModal] = useState<{ open: boolean; editing: CompanyWithDetail | null }>({ open: false, editing: null })
  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [savingCompany, setSavingCompany] = useState(false)
  const [addingRoleType, setAddingRoleType] = useState(false)
  const [newRoleTypeName, setNewRoleTypeName] = useState('')
  const [addingTrade, setAddingTrade] = useState(false)
  const [newTradeName, setNewTradeName] = useState('')

  // Contact modal
  const [contactModal, setContactModal] = useState<{ open: boolean; editing: ContactWithDetail | null }>({ open: false, editing: null })
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT)
  const [contactError, setContactError] = useState<string | null>(null)
  const [savingContact, setSavingContact] = useState(false)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [cRes, ctRes, rtRes, ttRes] = await Promise.all([
      supabase.from('companies')
        .select('*, company_roles(*), company_locations(*), company_trades(*)')
        .order('name'),
      supabase.from('contacts')
        .select('*, companies(id, name, abbreviation), contact_phones(*), contact_emails(*)')
        .order('name'),
      supabase.from('company_role_types').select('*').order('sort_order'),
      supabase.from('trade_types').select('*').order('sort_order'),
    ])
    const firstErr = cRes.error ?? ctRes.error ?? rtRes.error ?? ttRes.error
    if (firstErr) { setError(firstErr.message); setLoading(false); return }
    setCompanies(cRes.data as CompanyWithDetail[])
    setContacts(ctRes.data as ContactWithDetail[])
    setRoleTypes((rtRes.data ?? []) as CompanyRoleType[])
    setTradeTypes((ttRes.data ?? []) as TradeType[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived values ───────────────────────────────────────────────────────

  const roleTypeName = (id: string | null) => roleTypes.find(r => r.id === id)?.name

  const countByCompany = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.company_id] = (acc[c.company_id] ?? 0) + 1
    return acc
  }, {})

  const filteredCompanies = companies
    .filter(c =>
      c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
      (c.abbreviation ?? '').toLowerCase().includes(companySearch.toLowerCase()))
    .filter(c => !companyTradeFilter ||
      c.company_trades.some(t => t.trade_type_id === companyTradeFilter))

  const filteredContacts = contacts.filter(c => {
    if (selectedCompanyId && c.company_id !== selectedCompanyId) return false
    if (roleFilter) {
      const co = companies.find(co => co.id === c.company_id)
      if (!co?.company_roles.some(r => r.role === roleFilter)) return false
    }
    if (contactSearch) {
      const q = contactSearch.toLowerCase()
      const pe = primaryOf(c.contact_emails)?.email ?? c.email
      const pp = primaryOf(c.contact_phones)?.number ?? c.phone
      const match = [c.name, c.trade, pe, pp, c.companies?.name]
        .some(v => v?.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })

  const allRoles = Array.from(new Set(companies.flatMap(c => c.company_roles.map(r => r.role)))).sort()
  const selectedCompany = companies.find(c => c.id === selectedCompanyId)

  // ── Company CRUD ─────────────────────────────────────────────────────────

  function openAddCompany() {
    setCompanyForm(EMPTY_COMPANY)
    setCompanyError(null)
    setAddingRoleType(false); setAddingTrade(false)
    setCompanyModal({ open: true, editing: null })
  }

  function openEditCompany(company: CompanyWithDetail, e: React.MouseEvent) {
    e.stopPropagation()
    setCompanyForm({
      name: company.name,
      abbreviation: company.abbreviation ?? '',
      notes: company.notes ?? '',
      phone: company.phone ?? '',
      website: company.website ?? '',
      email: company.email ?? '',
      roleTypeIds: company.company_roles.map(r => r.role_type_id).filter((x): x is string => !!x),
      tradeIds: company.company_trades.map(t => t.trade_type_id),
      locations: [...company.company_locations]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(l => ({
          id: l.id, label: l.label, address: l.address ?? '', phone: l.phone ?? '',
          is_primary: l.is_primary, active: l.active,
        })),
    })
    setCompanyError(null)
    setAddingRoleType(false); setAddingTrade(false)
    setCompanyModal({ open: true, editing: company })
  }

  async function saveCompany() {
    if (!companyForm.name.trim()) { setCompanyError('Company name is required.'); return }
    const withLabel = companyForm.locations.filter(l => l.label.trim())
    if (withLabel.length !== companyForm.locations.length) {
      setCompanyError('Every location needs a label (e.g. "HQ", "Toronto Office").'); return
    }
    setSavingCompany(true)
    setCompanyError(null)

    const payload = {
      name: companyForm.name.trim(),
      abbreviation: companyForm.abbreviation.trim() || null,
      notes: companyForm.notes.trim() || null,
      phone: companyForm.phone.trim() || null,
      website: companyForm.website.trim() || null,
      email: companyForm.email.trim() || null,
    }

    let companyId: string
    if (companyModal.editing) {
      const { error } = await supabase.from('companies').update(payload).eq('id', companyModal.editing.id)
      if (error) { setCompanyError(error.message); setSavingCompany(false); return }
      companyId = companyModal.editing.id
    } else {
      const { data, error } = await supabase.from('companies').insert(payload).select('id').single()
      if (error || !data) { setCompanyError(error?.message ?? 'Insert failed.'); setSavingCompany(false); return }
      companyId = data.id
    }

    // Roles: delete-then-insert junction. DUAL-WRITE: legacy role text stays in
    // sync with role_type_id until the removal pass drops it.
    await supabase.from('company_roles').delete().eq('company_id', companyId)
    if (companyForm.roleTypeIds.length > 0) {
      const { error } = await supabase.from('company_roles').insert(
        companyForm.roleTypeIds.map(role_type_id => ({
          company_id: companyId,
          role_type_id,
          role: roleTypeName(role_type_id) ?? '',
        })),
      )
      if (error) { setCompanyError(error.message); setSavingCompany(false); return }
    }

    // Trades: leaf junction, delete-then-insert is safe.
    await supabase.from('company_trades').delete().eq('company_id', companyId)
    if (companyForm.tradeIds.length > 0) {
      const { error } = await supabase.from('company_trades').insert(
        companyForm.tradeIds.map(trade_type_id => ({ company_id: companyId, trade_type_id })),
      )
      if (error) { setCompanyError(error.message); setSavingCompany(false); return }
    }

    // Locations: ID-PRESERVING sync — contacts.location_id references these rows,
    // so delete-and-recreate would silently unassign every contact.
    const locErr = await syncLocations(companyId)
    if (locErr) { setCompanyError(locErr); setSavingCompany(false); return }

    setSavingCompany(false)
    setCompanyModal({ open: false, editing: null })
    fetchData()
  }

  async function syncLocations(companyId: string): Promise<string | null> {
    const existing = companyModal.editing?.company_locations ?? []
    const kept = new Set(companyForm.locations.filter(l => l.id).map(l => l.id!))
    const toDelete = existing.filter(l => !kept.has(l.id)).map(l => l.id)

    // Deletes first (frees the primary slot); contacts at these offices get
    // location_id nulled by the column-scoped SET NULL.
    if (toDelete.length > 0) {
      const { error } = await supabase.from('company_locations').delete().in('id', toDelete)
      if (error) return error.message
    }

    // Two-pass update honours the partial unique index: clear old primary before
    // setting the new one.
    const rows = companyForm.locations.map((l, i) => ({ ...l, sort_order: i }))
    for (const pass of [false, true] as const) {
      for (const l of rows.filter(r => r.id && r.is_primary === pass)) {
        const { error } = await supabase.from('company_locations').update({
          label: l.label.trim(), address: l.address.trim() || null,
          phone: l.phone.trim() || null, is_primary: l.is_primary,
          sort_order: l.sort_order, active: l.active,
        }).eq('id', l.id!)
        if (error) return error.message
      }
    }
    const toInsert = rows.filter(l => !l.id)
    if (toInsert.length > 0) {
      const { error } = await supabase.from('company_locations').insert(
        toInsert.map(l => ({
          company_id: companyId, label: l.label.trim(),
          address: l.address.trim() || null, phone: l.phone.trim() || null,
          is_primary: l.is_primary, sort_order: l.sort_order, active: l.active,
        })),
      )
      if (error) return error.message
    }
    return null
  }

  async function removeLocationRow(index: number) {
    const row = companyForm.locations[index]
    // Reference-aware: an existing office may have contacts sitting at it.
    if (row.id) {
      const { count } = await supabase.from('contacts')
        .select('id', { count: 'exact', head: true }).eq('location_id', row.id)
      if ((count ?? 0) > 0) {
        const ok = confirm(
          `${count} contact${count === 1 ? ' is' : 's are'} assigned to "${row.label}" — ` +
          `deleting it will unassign them (their other details are untouched).\n\n` +
          `Tip: untick Active instead to hide it while keeping assignments.\n\nDelete anyway?`,
        )
        if (!ok) return
      }
    }
    setCompanyForm(f => {
      const locations = f.locations.filter((_, i) => i !== index)
      // Keep exactly-one-primary when the primary row was removed
      if (row.is_primary && locations.length > 0 && !locations.some(l => l.is_primary)) {
        locations[0] = { ...locations[0], is_primary: true }
      }
      return { ...f, locations }
    })
  }

  async function deleteCompany(company: CompanyWithDetail, e: React.MouseEvent) {
    e.stopPropagation()
    const count = countByCompany[company.id] ?? 0
    if (count > 0) {
      alert(`Cannot delete "${company.name}" — it has ${count} contact${count !== 1 ? 's' : ''}. Remove them first.`)
      return
    }
    if (!confirm(`Delete "${company.name}"?`)) return
    const { error } = await supabase.from('companies').delete().eq('id', company.id)
    if (error) { alert(error.message); return }
    if (selectedCompanyId === company.id) setSelectedCompanyId(null)
    fetchData()
  }

  async function addNewRoleType() {
    const name = newRoleTypeName.trim()
    if (!name) return
    const existing = roleTypes.find(r => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setCompanyForm(f => f.roleTypeIds.includes(existing.id) ? f : { ...f, roleTypeIds: [...f.roleTypeIds, existing.id] })
    } else {
      const maxOrder = roleTypes.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { data, error } = await supabase.from('company_role_types')
        .insert({ name, sort_order: maxOrder + 1 }).select('*').single()
      if (error || !data) { alert(error?.message ?? 'Could not create role.'); return }
      setRoleTypes(rt => [...rt, data as CompanyRoleType])
      setCompanyForm(f => ({ ...f, roleTypeIds: [...f.roleTypeIds, data.id] }))
    }
    setAddingRoleType(false)
    setNewRoleTypeName('')
  }

  async function addNewTradeType() {
    const name = newTradeName.trim()
    if (!name) return
    const existing = tradeTypes.find(t => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setCompanyForm(f => f.tradeIds.includes(existing.id) ? f : { ...f, tradeIds: [...f.tradeIds, existing.id] })
    } else {
      const maxOrder = tradeTypes.reduce((m, t) => Math.max(m, t.sort_order), 0)
      const { data, error } = await supabase.from('trade_types')
        .insert({ name, sort_order: maxOrder + 1 }).select('*').single()
      if (error || !data) { alert(error?.message ?? 'Could not create trade.'); return }
      setTradeTypes(tt => [...tt, data as TradeType])
      setCompanyForm(f => ({ ...f, tradeIds: [...f.tradeIds, data.id] }))
    }
    setAddingTrade(false)
    setNewTradeName('')
  }

  // ── Contact CRUD ─────────────────────────────────────────────────────────

  function openAddContact() {
    setContactForm({ ...EMPTY_CONTACT, company_id: selectedCompanyId ?? '' })
    setContactError(null)
    setContactModal({ open: true, editing: null })
  }

  function openEditContact(contact: ContactWithDetail, e: React.MouseEvent) {
    e.stopPropagation()
    setContactForm({
      name: contact.name,
      company_id: contact.company_id,
      trade: contact.trade ?? '',
      location_id: contact.location_id ?? '',
      phones: (contact.contact_phones ?? []).map(p => ({
        phone_type: p.phone_type, number: p.number, extension: p.extension ?? '', is_primary: p.is_primary,
      })),
      emails: (contact.contact_emails ?? []).map(em => ({
        label: em.label ?? '', email: em.email, is_primary: em.is_primary,
      })),
    })
    setContactError(null)
    setContactModal({ open: true, editing: contact })
  }

  async function saveContact() {
    if (!contactForm.name.trim()) { setContactError('Name is required.'); return }
    if (!contactForm.company_id)  { setContactError('Company is required.'); return }
    const phones = contactForm.phones.filter(p => p.number.trim())
    const emails = contactForm.emails.filter(em => em.email.trim())
    // Exactly-one-primary in app state (the partial unique index backstops it)
    if (phones.length > 0 && !phones.some(p => p.is_primary)) phones[0].is_primary = true
    if (emails.length > 0 && !emails.some(em => em.is_primary)) emails[0].is_primary = true

    setSavingContact(true)
    setContactError(null)

    // Moving a contact to a different company is blocked while they hold project
    // team seats — the assignments' composite FK would reject it anyway; this
    // check turns that into an honest message instead of a constraint error.
    if (contactModal.editing && contactModal.editing.company_id !== contactForm.company_id) {
      const { count } = await supabase.from('project_team_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', contactModal.editing.id)
      if ((count ?? 0) > 0) {
        setContactError(
          `${contactModal.editing.name} is assigned on ${count} project team${count === 1 ? '' : 's'}. ` +
          `Remove those team assignments first, then change the company.`,
        )
        setSavingContact(false)
        return
      }
    }

    const primaryPhone = phones.find(p => p.is_primary)
    const primaryEmail = emails.find(em => em.is_primary)

    const payload = {
      name: contactForm.name.trim(),
      company_id: contactForm.company_id,
      trade: contactForm.trade.trim() || null,
      location_id: contactForm.location_id || null,
      // DUAL-WRITE: legacy single columns mirror the primaries until the removal pass.
      email: primaryEmail?.email.trim() || null,
      phone: primaryPhone?.number.trim() || null,
    }

    let contactId: string
    if (contactModal.editing) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', contactModal.editing.id)
      if (error) { setContactError(error.message); setSavingContact(false); return }
      contactId = contactModal.editing.id
    } else {
      const { data, error } = await supabase.from('contacts').insert(payload).select('id').single()
      if (error || !data) { setContactError(error?.message ?? 'Insert failed.'); setSavingContact(false); return }
      contactId = data.id
    }

    // Phones/emails are leaf rows (nothing references them): delete-then-insert.
    await supabase.from('contact_phones').delete().eq('contact_id', contactId)
    if (phones.length > 0) {
      const { error } = await supabase.from('contact_phones').insert(
        phones.map(p => ({
          contact_id: contactId, phone_type: p.phone_type, number: p.number.trim(),
          extension: p.extension.trim() || null, is_primary: p.is_primary,
        })),
      )
      if (error) { setContactError(error.message); setSavingContact(false); return }
    }
    await supabase.from('contact_emails').delete().eq('contact_id', contactId)
    if (emails.length > 0) {
      const { error } = await supabase.from('contact_emails').insert(
        emails.map(em => ({
          contact_id: contactId, label: em.label.trim() || null,
          email: em.email.trim(), is_primary: em.is_primary,
        })),
      )
      if (error) { setContactError(error.message); setSavingContact(false); return }
    }

    setSavingContact(false)
    setContactModal({ open: false, editing: null })
    fetchData()
  }

  async function deleteContact(contact: ContactWithDetail, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${contact.name}"?`)) return
    const { error } = await supabase.from('contacts').delete().eq('id', contact.id)
    if (error) { alert(error.message); return }
    fetchData()
  }

  // Locations available to the contact modal (selected company's active offices)
  const contactCompanyLocations = (companies.find(c => c.id === contactForm.company_id)?.company_locations ?? [])
    .filter(l => l.active || l.id === contactForm.location_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading directory…</div>
  if (error)   return <div className="p-8 text-sm text-red-600">Error: {error}</div>

  const inputCls = 'border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500'
  const smallInputCls = 'border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <div className="flex h-full overflow-hidden rise">

      {/* ── Left panel: Company list ──────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">

        <div className="p-3 border-b border-gray-100 space-y-2">
          <input
            type="text"
            placeholder="Search companies…"
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          <select
            value={companyTradeFilter}
            onChange={e => setCompanyTradeFilter(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All trades</option>
            {tradeTypes.filter(t => t.active).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          <button
            onClick={() => setSelectedCompanyId(null)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors
              ${!selectedCompanyId ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <span>All Companies</span>
            <span className="text-xs text-gray-400">{contacts.length}</span>
          </button>

          {filteredCompanies.length === 0 && (companySearch || companyTradeFilter) && (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">No companies match.</p>
          )}

          {filteredCompanies.map(company => (
            <div
              key={company.id}
              onClick={() => setSelectedCompanyId(company.id)}
              className={`group px-3 py-2.5 cursor-pointer border-l-2 transition-colors
                ${selectedCompanyId === company.id ? 'border-l-teal-500 bg-teal-50' : 'border-l-transparent hover:bg-gray-50'}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={`text-sm font-medium leading-snug truncate
                  ${selectedCompanyId === company.id ? 'text-teal-700' : 'text-gray-800'}`}>
                  {company.name}
                  {company.abbreviation && (
                    <span className="font-mono font-normal text-gray-400 ml-1 text-xs">({company.abbreviation})</span>
                  )}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                  {countByCompany[company.id] ?? 0}
                </span>
              </div>

              {company.company_roles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {company.company_roles.slice(0, 3).map(r => (
                    <span key={r.id}
                      className="text-[10px] font-medium bg-teal-50 text-teal-600 rounded px-1.5 py-0.5 leading-none">
                      {r.role}
                    </span>
                  ))}
                  {company.company_roles.length > 3 && (
                    <span className="text-xs text-gray-400">+{company.company_roles.length - 3}</span>
                  )}
                </div>
              )}

              <div className="hidden group-hover:flex items-center gap-2 mt-1.5">
                <button onClick={e => openEditCompany(company, e)} className="text-xs text-teal-700 hover:underline">
                  Edit
                </button>
                <span className="text-gray-300 text-xs">·</span>
                <button onClick={e => deleteCompany(company, e)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={openAddCompany}
            className="w-full text-sm bg-slate-800 text-white rounded px-3 py-2 hover:bg-slate-700 transition-colors font-medium"
          >
            + Add Company
          </button>
        </div>
      </aside>

      {/* ── Right panel: Contacts ─────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <div className="border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3 flex-wrap flex-shrink-0">
          {selectedCompany && (
            <span className="text-sm font-semibold text-gray-700 mr-1 truncate max-w-xs">
              {selectedCompany.name}
            </span>
          )}
          <input
            type="text"
            placeholder="Search contacts…"
            value={contactSearch}
            onChange={e => setContactSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          {allRoles.length > 0 && (
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">All roles</option>
              {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={openAddContact}
            className="text-sm bg-teal-700 text-white rounded px-3 py-1.5 hover:bg-teal-800 transition-colors font-medium"
          >
            + Add Contact
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredContacts.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-3xl mb-3 opacity-20">👥</div>
              <p className="text-sm text-gray-400">
                {contacts.length === 0
                  ? 'No contacts yet — add a company first, then add contacts to it.'
                  : 'No contacts match the current filter.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                <tr>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Name</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Company</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Title</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Email</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Phone</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(contact => {
                  const pe = primaryOf(contact.contact_emails)
                  const pp = primaryOf(contact.contact_phones)
                  const emailVal = pe?.email ?? contact.email
                  const phoneVal = pp ? `${pp.number}${pp.extension ? ` x${pp.extension}` : ''}` : contact.phone
                  return (
                    <tr key={contact.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                      <td className="px-4 py-2 font-medium text-gray-900">{contact.name}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {contact.companies?.abbreviation
                          ? <span title={contact.companies.name} className="font-mono text-xs">{contact.companies.abbreviation}</span>
                          : (contact.companies?.name ?? <span className="text-gray-300">—</span>)
                        }
                      </td>
                      <td className="px-4 py-2 text-gray-600">{contact.trade ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2">
                        {emailVal
                          ? <a href={`mailto:${emailVal}`} className="text-teal-700 hover:underline">
                              {emailVal}
                              {(contact.contact_emails?.length ?? 0) > 1 && (
                                <span className="text-gray-400 no-underline ml-1 text-xs">+{contact.contact_emails.length - 1}</span>
                              )}
                            </a>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {phoneVal
                          ? <>
                              {phoneVal}
                              {pp && <span className="text-[10px] text-gray-400 ml-1">{phoneLabel(pp.phone_type)}</span>}
                              {(contact.contact_phones?.length ?? 0) > 1 && (
                                <span className="text-gray-400 ml-1 text-xs">+{contact.contact_phones.length - 1}</span>
                              )}
                            </>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="hidden group-hover:flex items-center gap-2">
                          <button onClick={e => openEditContact(contact, e)} className="text-teal-700 hover:underline text-xs">
                            Edit
                          </button>
                          <button onClick={e => deleteContact(contact, e)} className="text-red-500 hover:underline text-xs">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Company modal ─────────────────────────────────── */}
      <Modal
        title={companyModal.editing ? 'Edit Company' : 'Add Company'}
        open={companyModal.open}
        onClose={() => setCompanyModal({ open: false, editing: null })}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Company name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={companyForm.name}
                onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                className={`w-full ${inputCls}`} placeholder="e.g. Active Mechanical Inc." autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Abbreviation</label>
              <input type="text" value={companyForm.abbreviation}
                onChange={e => setCompanyForm(f => ({ ...f, abbreviation: e.target.value }))}
                className={`w-full ${inputCls} font-mono`} placeholder="e.g. AMI" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Main phone</label>
              <input type="tel" value={companyForm.phone}
                onChange={e => setCompanyForm(f => ({ ...f, phone: e.target.value }))}
                className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Website</label>
              <input type="url" value={companyForm.website}
                onChange={e => setCompanyForm(f => ({ ...f, website: e.target.value }))}
                className={`w-full ${inputCls}`} placeholder="https://…" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">General email</label>
              <input type="email" value={companyForm.email}
                onChange={e => setCompanyForm(f => ({ ...f, email: e.target.value }))}
                className={`w-full ${inputCls}`} />
            </div>
          </div>

          {/* Roles — managed reference with inline add (never free text) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Roles</label>
            <div className="flex flex-wrap gap-1.5">
              {roleTypes.filter(r => r.active || companyForm.roleTypeIds.includes(r.id)).map(r => {
                const on = companyForm.roleTypeIds.includes(r.id)
                return (
                  <button key={r.id} type="button"
                    onClick={() => setCompanyForm(f => ({
                      ...f,
                      roleTypeIds: on ? f.roleTypeIds.filter(id => id !== r.id) : [...f.roleTypeIds, r.id],
                    }))}
                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                      on ? 'bg-teal-700 text-white border-teal-700'
                         : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700'
                    }`}>
                    {r.name}{!r.active && ' (inactive)'}
                  </button>
                )
              })}
              {addingRoleType ? (
                <div className="flex items-center gap-1">
                  <input type="text" value={newRoleTypeName}
                    onChange={e => setNewRoleTypeName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addNewRoleType() }
                      if (e.key === 'Escape') { setAddingRoleType(false); setNewRoleTypeName('') }
                    }}
                    placeholder="Role name…"
                    className="text-xs border border-teal-300 rounded-full px-3 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    autoFocus />
                  <button onClick={addNewRoleType} className="text-teal-700 text-sm font-medium leading-none">✓</button>
                  <button onClick={() => { setAddingRoleType(false); setNewRoleTypeName('') }} className="text-gray-400 text-sm leading-none">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingRoleType(true)}
                  className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded-full px-3 py-1 transition-colors">
                  + Add role
                </button>
              )}
            </div>
          </div>

          {/* Trades — same vocabulary as Systems to be Commissioned */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Trades</label>
            <div className="flex flex-wrap gap-1.5">
              {tradeTypes.filter(t => t.active || companyForm.tradeIds.includes(t.id)).map(t => {
                const on = companyForm.tradeIds.includes(t.id)
                return (
                  <button key={t.id} type="button"
                    onClick={() => setCompanyForm(f => ({
                      ...f,
                      tradeIds: on ? f.tradeIds.filter(id => id !== t.id) : [...f.tradeIds, t.id],
                    }))}
                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                      on ? 'bg-teal-700 text-white border-teal-700'
                         : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-700'
                    }`}>
                    {t.name}{!t.active && ' (inactive)'}
                  </button>
                )
              })}
              {addingTrade ? (
                <div className="flex items-center gap-1">
                  <input type="text" value={newTradeName}
                    onChange={e => setNewTradeName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addNewTradeType() }
                      if (e.key === 'Escape') { setAddingTrade(false); setNewTradeName('') }
                    }}
                    placeholder="Trade name…"
                    className="text-xs border border-teal-300 rounded-full px-3 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    autoFocus />
                  <button onClick={addNewTradeType} className="text-teal-700 text-sm font-medium leading-none">✓</button>
                  <button onClick={() => { setAddingTrade(false); setNewTradeName('') }} className="text-gray-400 text-sm leading-none">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingTrade(true)}
                  className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded-full px-3 py-1 transition-colors">
                  + Add trade
                </button>
              )}
            </div>
          </div>

          {/* Locations */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Locations</label>
            {companyForm.locations.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {companyForm.locations.map((l, i) => (
                  <div key={l.id ?? `new-${i}`} className="flex items-center gap-1.5">
                    <input type="radio" name="primary-location" checked={l.is_primary}
                      title="Primary location"
                      onChange={() => setCompanyForm(f => ({
                        ...f,
                        locations: f.locations.map((x, j) => ({ ...x, is_primary: j === i })),
                      }))} />
                    <input type="text" value={l.label} placeholder='Label ("HQ")'
                      onChange={e => setCompanyForm(f => ({
                        ...f, locations: f.locations.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} w-28`} />
                    <input type="text" value={l.address} placeholder="Address"
                      onChange={e => setCompanyForm(f => ({
                        ...f, locations: f.locations.map((x, j) => j === i ? { ...x, address: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} flex-1`} />
                    <input type="tel" value={l.phone} placeholder="Phone"
                      onChange={e => setCompanyForm(f => ({
                        ...f, locations: f.locations.map((x, j) => j === i ? { ...x, phone: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} w-28`} />
                    <label className="flex items-center gap-1 text-[10px] text-gray-400" title="Inactive locations are hidden from pickers; contact assignments are preserved.">
                      <input type="checkbox" checked={l.active}
                        onChange={e => setCompanyForm(f => ({
                          ...f, locations: f.locations.map((x, j) => j === i ? { ...x, active: e.target.checked } : x),
                        }))} />
                      Active
                    </label>
                    <button onClick={() => removeLocationRow(i)}
                      className="text-gray-300 hover:text-red-500 text-sm leading-none px-1">×</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button"
              onClick={() => setCompanyForm(f => ({
                ...f,
                locations: [...f.locations, {
                  label: f.locations.length === 0 ? 'HQ' : '', address: '', phone: '',
                  is_primary: f.locations.length === 0, active: true,
                }],
              }))}
              className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-3 py-1 transition-colors">
              + Add location
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={companyForm.notes}
              onChange={e => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className={`w-full ${inputCls} resize-none`} />
          </div>

          {companyError && <p className="text-sm text-red-600">{companyError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setCompanyModal({ open: false, editing: null })}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button onClick={saveCompany} disabled={savingCompany}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
              {savingCompany ? 'Saving…' : companyModal.editing ? 'Save Changes' : 'Add Company'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Contact modal ─────────────────────────────────── */}
      <Modal
        title={contactModal.editing ? 'Edit Contact' : 'Add Contact'}
        open={contactModal.open}
        onClose={() => setContactModal({ open: false, editing: null })}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={contactForm.name}
                onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                className={`w-full ${inputCls}`} placeholder="Full name" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
              <input type="text" value={contactForm.trade}
                onChange={e => setContactForm(f => ({ ...f, trade: e.target.value }))}
                className={`w-full ${inputCls}`} placeholder="e.g. Mechanical Engineer, Project Manager" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Company <span className="text-red-400">*</span>
              </label>
              <select value={contactForm.company_id}
                onChange={e => setContactForm(f => ({ ...f, company_id: e.target.value, location_id: '' }))}
                className={`w-full ${inputCls}`}>
                <option value="">Select a company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Location</label>
              <select value={contactForm.location_id}
                onChange={e => setContactForm(f => ({ ...f, location_id: e.target.value }))}
                disabled={contactCompanyLocations.length === 0}
                className={`w-full ${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}>
                <option value="">
                  {contactCompanyLocations.length === 0 ? 'No locations for this company' : '— Unspecified —'}
                </option>
                {contactCompanyLocations.map(l => (
                  <option key={l.id} value={l.id}>{l.label}{!l.active ? ' (inactive)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Phones */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phones</label>
            {contactForm.phones.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {contactForm.phones.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="radio" name="primary-phone" checked={p.is_primary} title="Primary phone"
                      onChange={() => setContactForm(f => ({
                        ...f, phones: f.phones.map((x, j) => ({ ...x, is_primary: j === i })),
                      }))} />
                    <select value={p.phone_type}
                      onChange={e => setContactForm(f => ({
                        ...f, phones: f.phones.map((x, j) => j === i ? { ...x, phone_type: e.target.value as PhoneType } : x),
                      }))}
                      className={`${smallInputCls} bg-white w-24`}>
                      {PHONE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input type="tel" value={p.number} placeholder="Number"
                      onChange={e => setContactForm(f => ({
                        ...f, phones: f.phones.map((x, j) => j === i ? { ...x, number: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} flex-1`} />
                    <input type="text" value={p.extension} placeholder="Ext."
                      onChange={e => setContactForm(f => ({
                        ...f, phones: f.phones.map((x, j) => j === i ? { ...x, extension: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} w-16`} />
                    <button
                      onClick={() => setContactForm(f => {
                        const phones = f.phones.filter((_, j) => j !== i)
                        if (p.is_primary && phones.length > 0 && !phones.some(x => x.is_primary)) {
                          phones[0] = { ...phones[0], is_primary: true }
                        }
                        return { ...f, phones }
                      })}
                      className="text-gray-300 hover:text-red-500 text-sm leading-none px-1">×</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button"
              onClick={() => setContactForm(f => ({
                ...f,
                phones: [...f.phones, { phone_type: 'mobile', number: '', extension: '', is_primary: f.phones.length === 0 }],
              }))}
              className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-3 py-1 transition-colors">
              + Add phone
            </button>
          </div>

          {/* Emails */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Emails</label>
            {contactForm.emails.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {contactForm.emails.map((em, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="radio" name="primary-email" checked={em.is_primary} title="Primary email — used in report distribution"
                      onChange={() => setContactForm(f => ({
                        ...f, emails: f.emails.map((x, j) => ({ ...x, is_primary: j === i })),
                      }))} />
                    <input type="text" value={em.label} placeholder="Label (optional)"
                      onChange={e => setContactForm(f => ({
                        ...f, emails: f.emails.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} w-28`} />
                    <input type="email" value={em.email} placeholder="Email"
                      onChange={e => setContactForm(f => ({
                        ...f, emails: f.emails.map((x, j) => j === i ? { ...x, email: e.target.value } : x),
                      }))}
                      className={`${smallInputCls} flex-1`} />
                    <button
                      onClick={() => setContactForm(f => {
                        const emails = f.emails.filter((_, j) => j !== i)
                        if (em.is_primary && emails.length > 0 && !emails.some(x => x.is_primary)) {
                          emails[0] = { ...emails[0], is_primary: true }
                        }
                        return { ...f, emails }
                      })}
                      className="text-gray-300 hover:text-red-500 text-sm leading-none px-1">×</button>
                  </div>
                ))}
              </div>
            )}
            <button type="button"
              onClick={() => setContactForm(f => ({
                ...f,
                emails: [...f.emails, { label: '', email: '', is_primary: f.emails.length === 0 }],
              }))}
              className="text-xs border border-dashed border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 rounded px-3 py-1 transition-colors">
              + Add email
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5">
              The primary email is what site report distribution lists use.
            </p>
          </div>

          {contactError && <p className="text-sm text-red-600">{contactError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setContactModal({ open: false, editing: null })}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button onClick={saveContact} disabled={savingContact}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
              {savingContact ? 'Saving…' : contactModal.editing ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
