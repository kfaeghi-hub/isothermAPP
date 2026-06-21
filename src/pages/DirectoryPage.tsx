import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui/Modal'
import type { Company, CompanyWithRoles, Contact, ContactWithCompany } from '../types/database'

// ── Form state types ───────────────────────────────────────────────────────

interface CompanyForm {
  name: string
  abbreviation: string
  notes: string
  roles: string[]
  roleInput: string
}

interface ContactForm {
  name: string
  company_id: string
  trade: string
  email: string
  phone: string
}

const EMPTY_COMPANY: CompanyForm = { name: '', abbreviation: '', notes: '', roles: [], roleInput: '' }
const EMPTY_CONTACT: ContactForm = { name: '', company_id: '', trade: '', email: '', phone: '' }

// ── Component ──────────────────────────────────────────────────────────────

export function DirectoryPage() {
  // Data
  const [companies, setCompanies] = useState<CompanyWithRoles[]>([])
  const [contacts, setContacts] = useState<ContactWithCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [companySearch, setCompanySearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  // Company modal
  const [companyModal, setCompanyModal] = useState<{ open: boolean; editing: Company | null }>({ open: false, editing: null })
  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY)
  const [companyError, setCompanyError] = useState<string | null>(null)
  const [savingCompany, setSavingCompany] = useState(false)

  // Contact modal
  const [contactModal, setContactModal] = useState<{ open: boolean; editing: Contact | null }>({ open: false, editing: null })
  const [contactForm, setContactForm] = useState<ContactForm>(EMPTY_CONTACT)
  const [contactError, setContactError] = useState<string | null>(null)
  const [savingContact, setSavingContact] = useState(false)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [cRes, ctRes] = await Promise.all([
      supabase.from('companies').select('*, company_roles(*)').order('name'),
      supabase.from('contacts').select('*, companies(id, name, abbreviation)').order('name'),
    ])
    if (cRes.error)  { setError(cRes.error.message);  setLoading(false); return }
    if (ctRes.error) { setError(ctRes.error.message); setLoading(false); return }
    setCompanies(cRes.data as CompanyWithRoles[])
    setContacts(ctRes.data as ContactWithCompany[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived values ───────────────────────────────────────────────────────

  // All distinct company roles — used for the filter dropdown
  const allRoles = Array.from(
    new Set(companies.flatMap(c => c.company_roles.map(r => r.role)))
  ).sort()

  // Contact count per company — shown in the left panel
  const countByCompany = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.company_id] = (acc[c.company_id] ?? 0) + 1
    return acc
  }, {})

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
    (c.abbreviation ?? '').toLowerCase().includes(companySearch.toLowerCase())
  )

  const filteredContacts = contacts.filter(c => {
    if (selectedCompanyId && c.company_id !== selectedCompanyId) return false
    if (roleFilter) {
      // Filter by the company's role tag, not the contact's personal trade
      const co = companies.find(co => co.id === c.company_id)
      if (!co?.company_roles.some(r => r.role === roleFilter)) return false
    }
    if (contactSearch) {
      const q = contactSearch.toLowerCase()
      const match = [c.name, c.trade, c.email, c.phone, c.companies?.name]
        .some(v => v?.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })

  const selectedCompany = companies.find(c => c.id === selectedCompanyId)

  // ── Company CRUD ─────────────────────────────────────────────────────────

  function openAddCompany() {
    setCompanyForm(EMPTY_COMPANY)
    setCompanyError(null)
    setCompanyModal({ open: true, editing: null })
  }

  function openEditCompany(company: CompanyWithRoles, e: React.MouseEvent) {
    e.stopPropagation()
    setCompanyForm({
      name: company.name,
      abbreviation: company.abbreviation ?? '',
      notes: company.notes ?? '',
      roles: company.company_roles.map(r => r.role),
      roleInput: '',
    })
    setCompanyError(null)
    setCompanyModal({ open: true, editing: company })
  }

  async function saveCompany() {
    if (!companyForm.name.trim()) { setCompanyError('Company name is required.'); return }
    setSavingCompany(true)
    setCompanyError(null)

    const payload = {
      name: companyForm.name.trim(),
      abbreviation: companyForm.abbreviation.trim() || null,
      notes: companyForm.notes.trim() || null,
    }

    let companyId: string
    if (companyModal.editing) {
      const { error } = await supabase.from('companies').update(payload).eq('id', companyModal.editing.id)
      if (error) { setCompanyError(error.message); setSavingCompany(false); return }
      companyId = companyModal.editing.id
    } else {
      const { data, error } = await supabase.from('companies').insert(payload).select('id').single()
      if (error) { setCompanyError(error.message); setSavingCompany(false); return }
      companyId = data.id
    }

    // Replace all roles (delete-then-insert is safe — company_roles has no downstream FK refs yet)
    await supabase.from('company_roles').delete().eq('company_id', companyId)
    if (companyForm.roles.length > 0) {
      const { error } = await supabase.from('company_roles').insert(
        companyForm.roles.map(role => ({ company_id: companyId, role }))
      )
      if (error) { setCompanyError(error.message); setSavingCompany(false); return }
    }

    setSavingCompany(false)
    setCompanyModal({ open: false, editing: null })
    fetchData()
  }

  async function deleteCompany(company: CompanyWithRoles, e: React.MouseEvent) {
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

  function addRole() {
    const role = companyForm.roleInput.trim()
    if (!role || companyForm.roles.includes(role)) return
    setCompanyForm(f => ({ ...f, roles: [...f.roles, role], roleInput: '' }))
  }

  // ── Contact CRUD ─────────────────────────────────────────────────────────

  function openAddContact() {
    setContactForm({ ...EMPTY_CONTACT, company_id: selectedCompanyId ?? '' })
    setContactError(null)
    setContactModal({ open: true, editing: null })
  }

  function openEditContact(contact: Contact, e: React.MouseEvent) {
    e.stopPropagation()
    setContactForm({
      name: contact.name,
      company_id: contact.company_id,
      trade: contact.trade ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
    })
    setContactError(null)
    setContactModal({ open: true, editing: contact })
  }

  async function saveContact() {
    if (!contactForm.name.trim()) { setContactError('Name is required.'); return }
    if (!contactForm.company_id)  { setContactError('Company is required.'); return }
    setSavingContact(true)
    setContactError(null)

    const payload = {
      name: contactForm.name.trim(),
      company_id: contactForm.company_id,
      trade: contactForm.trade.trim() || null,
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
    }

    if (contactModal.editing) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', contactModal.editing.id)
      if (error) { setContactError(error.message); setSavingContact(false); return }
    } else {
      const { error } = await supabase.from('contacts').insert(payload)
      if (error) { setContactError(error.message); setSavingContact(false); return }
    }

    setSavingContact(false)
    setContactModal({ open: false, editing: null })
    fetchData()
  }

  async function deleteContact(contact: ContactWithCompany, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${contact.name}"?`)) return
    const { error } = await supabase.from('contacts').delete().eq('id', contact.id)
    if (error) { alert(error.message); return }
    fetchData()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading directory…</div>
  if (error)   return <div className="p-8 text-sm text-red-600">Error: {error}</div>

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: Company list ──────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">

        {/* Company search */}
        <div className="p-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search companies…"
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {/* Company list */}
        <div className="flex-1 overflow-y-auto py-1">

          {/* "All" row */}
          <button
            onClick={() => setSelectedCompanyId(null)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors
              ${!selectedCompanyId
                ? 'bg-teal-50 text-teal-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <span>All Companies</span>
            <span className="text-xs text-gray-400">{contacts.length}</span>
          </button>

          {filteredCompanies.length === 0 && companySearch && (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">No companies match.</p>
          )}

          {filteredCompanies.map(company => (
            <div
              key={company.id}
              onClick={() => setSelectedCompanyId(company.id)}
              className={`group px-3 py-2.5 cursor-pointer border-l-2 transition-colors
                ${selectedCompanyId === company.id
                  ? 'border-l-teal-500 bg-teal-50'
                  : 'border-l-transparent hover:bg-gray-50'}`}
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

              {/* Role chips */}
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

              {/* Edit / Delete (appear on hover) */}
              <div className="hidden group-hover:flex items-center gap-2 mt-1.5">
                <button
                  onClick={e => openEditCompany(company, e)}
                  className="text-xs text-teal-700 hover:underline"
                >
                  Edit
                </button>
                <span className="text-gray-300 text-xs">·</span>
                <button
                  onClick={e => deleteCompany(company, e)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add company button */}
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

        {/* Sub-header: filters + actions */}
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

        {/* Contacts table */}
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
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Trade / Role</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Email</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Phone</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(contact => (
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
                      {contact.email
                        ? <a href={`mailto:${contact.email}`} className="text-teal-700 hover:underline">{contact.email}</a>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-2 text-gray-600">{contact.phone ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2">
                      <div className="hidden group-hover:flex items-center gap-2">
                        <button
                          onClick={e => openEditContact(contact, e)}
                          className="text-teal-700 hover:underline text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={e => deleteContact(contact, e)}
                          className="text-red-500 hover:underline text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Company name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={companyForm.name}
              onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              placeholder="e.g. Active Mechanical Inc."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Abbreviation</label>
            <input
              type="text"
              value={companyForm.abbreviation}
              onChange={e => setCompanyForm(f => ({ ...f, abbreviation: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              placeholder="e.g. AMI"
            />
          </div>

          {/* Roles */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Roles</label>
            {companyForm.roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {companyForm.roles.map(role => (
                  <span key={role}
                    className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs rounded px-2 py-0.5">
                    {role}
                    <button
                      onClick={() => setCompanyForm(f => ({ ...f, roles: f.roles.filter(r => r !== role) }))}
                      className="text-teal-400 hover:text-red-500 leading-none font-bold ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={companyForm.roleInput}
                onChange={e => setCompanyForm(f => ({ ...f, roleInput: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole() } }}
                placeholder="Type a role and press Enter…"
                className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
              <button
                onClick={addRole}
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">e.g. Client/Owner · Mechanical · BAS · Electrical · GC · TAB</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              value={companyForm.notes}
              onChange={e => setCompanyForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
            />
          </div>

          {companyError && <p className="text-sm text-red-600">{companyError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setCompanyModal({ open: false, editing: null })}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={saveCompany}
              disabled={savingCompany}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
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
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={contactForm.name}
              onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              placeholder="Full name"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Company <span className="text-red-400">*</span>
            </label>
            <select
              value={contactForm.company_id}
              onChange={e => setContactForm(f => ({ ...f, company_id: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Select a company…</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Trade / Role</label>
            <input
              type="text"
              value={contactForm.trade}
              onChange={e => setContactForm(f => ({ ...f, trade: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              placeholder="e.g. Mechanical Engineer, Project Manager"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
            <input
              type="email"
              value={contactForm.email}
              onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
            <input
              type="tel"
              value={contactForm.phone}
              onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {contactError && <p className="text-sm text-red-600">{contactError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setContactModal({ open: false, editing: null })}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={saveContact}
              disabled={savingContact}
              className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium"
            >
              {savingContact ? 'Saving…' : contactModal.editing ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
