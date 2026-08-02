// ContactModal — the ONE way a contact is created or edited.
//
// It used to live inline in DirectoryPage, and the Team tab had its own
// name-and-title quick-add beside it. That quick-add minted contacts with no
// phones, no emails and no primary flags — invisible to distribution lists and
// to every mailto link — and nobody knew until somebody went looking for a
// number that had never existed. A contact born on the Team tab should be a
// complete citizen from birth (Adam Cheney's report).
//
// The fix is one component rather than two forms, and the reason is the save
// path. Copying the modal would mean two front-ends over
// `replace_contact_channels` — the RPC that exists because the previous
// four-request version failed silently for every non-admin. Two callers of a
// path with that history is two chances to get the next change half-applied.
//
// SELF-CONTAINED: it owns its form state and its save. A caller passes what it
// knows (which contact, which company) and is told when a save landed.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal } from '../ui/Modal'
import { PHONE_TYPES } from '../../lib/contactInfo'
import type { ContactWithDetail, PhoneType } from '../../types/database'

/** ONLY WHAT THE MODAL ACTUALLY READS. Typing this as CompanyWithDetail would
 *  force every caller to fetch a company's roles, trades and locations just to
 *  open a contact form — the Team tab carries a lighter shape and has no reason
 *  to load more. A caller without locations gets the picker disabled, which is
 *  the honest state rather than an empty dropdown pretending to offer choices. */
export interface ContactModalCompany {
  id: string
  name: string
  company_locations?: { id: string; label: string; active: boolean; sort_order?: number }[]
}

export interface PhoneRow { phone_type: PhoneType; number: string; extension: string; is_primary: boolean }
export interface EmailRow { label: string; email: string; is_primary: boolean }
export interface ContactForm {
  name: string
  company_id: string
  trade: string          // job title — rendered as "Title"
  location_id: string
  phones: PhoneRow[]
  emails: EmailRow[]
}
export const EMPTY_CONTACT: ContactForm = {
  name: '', company_id: '', trade: '', location_id: '', phones: [], emails: [],
}

const inputCls = 'border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500'
const smallInputCls = 'border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500'

export function ContactModal({
  open, onClose, editing, companies, defaultCompanyId, lockedCompanyId, onSaved,
}: {
  open: boolean
  onClose: () => void
  /** null ⇒ creating. */
  editing: ContactWithDetail | null
  companies: ContactModalCompany[]
  /** Pre-selects a company the user may still change (Directory's selection). */
  defaultCompanyId?: string | null
  /** Forces a company and disables the picker. The Team tab passes the seat's
   *  company: a contact added under a seat belongs to that seat's company, and
   *  letting it be changed here would silently break the assignment it is being
   *  created for. */
  lockedCompanyId?: string | null
  onSaved: (contactId: string) => void
}) {
  const [form, setForm] = useState<ContactForm>(EMPTY_CONTACT)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load the form when the modal opens, from `editing` or from the defaults.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      setForm({
        name: editing.name,
        company_id: editing.company_id,
        trade: editing.trade ?? '',
        location_id: editing.location_id ?? '',
        phones: (editing.contact_phones ?? []).map(p => ({
          phone_type: p.phone_type, number: p.number,
          extension: p.extension ?? '', is_primary: p.is_primary,
        })),
        emails: (editing.contact_emails ?? []).map(em => ({
          label: em.label ?? '', email: em.email, is_primary: em.is_primary,
        })),
      })
    } else {
      setForm({ ...EMPTY_CONTACT, company_id: lockedCompanyId ?? defaultCompanyId ?? '' })
    }
  }, [open, editing, lockedCompanyId, defaultCompanyId])

  const locations = (companies.find(c => c.id === form.company_id)?.company_locations ?? [])
    .filter(l => l.active || l.id === form.location_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  async function save() {
    if (!form.name.trim())  { setError('Name is required.'); return }
    if (!form.company_id)   { setError('Company is required.'); return }

    const phones = form.phones.filter(p => p.number.trim())
    const emails = form.emails.filter(em => em.email.trim())
    // Exactly-one-primary in app state; the RPC decides it again server-side and
    // the partial unique index backstops both.
    if (phones.length > 0 && !phones.some(p => p.is_primary)) phones[0].is_primary = true
    if (emails.length > 0 && !emails.some(em => em.is_primary)) emails[0].is_primary = true

    setSaving(true)
    setError(null)

    // Moving a contact to a different company is blocked while they hold project
    // team seats — the assignments' composite FK would reject it anyway; this
    // turns that into an honest message instead of a constraint error.
    if (editing && editing.company_id !== form.company_id) {
      const { count } = await supabase.from('project_team_assignments')
        .select('id', { count: 'exact', head: true }).eq('contact_id', editing.id)
      if ((count ?? 0) > 0) {
        setError(`${editing.name} is assigned on ${count} project team${count === 1 ? '' : 's'}. ` +
                 `Remove those team assignments first, then change the company.`)
        setSaving(false); return
      }
    }

    const payload = {
      name: form.name.trim(),
      company_id: form.company_id,
      trade: form.trade.trim() || null,
      location_id: form.location_id || null,
      // DUAL-WRITE: legacy single columns mirror the primaries until the removal
      // pass. replace_contact_channels rewrites them in its own transaction too,
      // so this is belt and braces rather than the source of truth.
      email: emails.find(em => em.is_primary)?.email.trim() || null,
      phone: phones.find(p => p.is_primary)?.number.trim() || null,
    }

    let contactId: string
    if (editing) {
      const { error: e } = await supabase.from('contacts').update(payload).eq('id', editing.id)
      if (e) { setError(e.message); setSaving(false); return }
      contactId = editing.id
    } else {
      const { data, error: e } = await supabase.from('contacts').insert(payload).select('id').single()
      if (e || !data) { setError(e?.message ?? 'Insert failed.'); setSaving(false); return }
      contactId = data.id
    }

    // ONE TRANSACTION, SERVER SIDE. This used to be four sequential requests —
    // delete phones, insert phones, delete emails, insert emails — and it failed
    // for every user who was not an admin: the DELETE policy was narrower than
    // the INSERT policy, so a staff user's delete removed ZERO ROWS AND RETURNED
    // NO ERROR, and the code carried on to insert a duplicate primary.
    //
    // The function decides the primary flag itself, so the unique index is a last
    // line of defence rather than the only one.
    const { error: chanError } = await supabase.rpc('replace_contact_channels', {
      p_contact_id: contactId,
      p_phones: phones.map(p => ({
        phone_type: p.phone_type, number: p.number.trim(),
        extension: p.extension.trim() || null, is_primary: p.is_primary,
      })),
      p_emails: emails.map(em => ({
        label: em.label.trim() || null, email: em.email.trim(), is_primary: em.is_primary,
      })),
    })
    if (chanError) { setError(chanError.message); setSaving(false); return }

    setSaving(false)
    onSaved(contactId)
    onClose()
  }

  return (
    <Modal
      title={editing ? 'Edit Contact' : 'Add Contact'}
      open={open}
      onClose={onClose}
      maxWidth="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={`w-full ${inputCls}`} placeholder="Full name" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
            <input type="text" value={form.trade}
              onChange={e => setForm(f => ({ ...f, trade: e.target.value }))}
              className={`w-full ${inputCls}`} placeholder="e.g. Mechanical Engineer, Project Manager" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Company <span className="text-red-400">*</span>
            </label>
            <select value={form.company_id}
              disabled={!!lockedCompanyId}
              onChange={e => setForm(f => ({ ...f, company_id: e.target.value, location_id: '' }))}
              className={`w-full ${inputCls} disabled:bg-gray-50 disabled:text-gray-500`}>
              <option value="">Select a company…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {lockedCompanyId && (
              <p className="text-[11px] text-gray-400 mt-1">
                Set by the team seat this contact is being added to.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Location</label>
            <select value={form.location_id}
              onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}
              disabled={locations.length === 0}
              className={`w-full ${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}>
              <option value="">
                {locations.length === 0 ? 'No locations for this company' : '— Unspecified —'}
              </option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.label}{!l.active ? ' (inactive)' : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Phones */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phones</label>
          {form.phones.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {form.phones.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="radio" name="primary-phone" checked={p.is_primary} title="Primary phone"
                    onChange={() => setForm(f => ({
                      ...f, phones: f.phones.map((x, j) => ({ ...x, is_primary: j === i })),
                    }))} />
                  <select value={p.phone_type}
                    onChange={e => setForm(f => ({
                      ...f, phones: f.phones.map((x, j) => j === i ? { ...x, phone_type: e.target.value as PhoneType } : x),
                    }))}
                    className={`${smallInputCls} bg-white w-24`}>
                    {PHONE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="tel" value={p.number} placeholder="Number"
                    onChange={e => setForm(f => ({
                      ...f, phones: f.phones.map((x, j) => j === i ? { ...x, number: e.target.value } : x),
                    }))}
                    className={`${smallInputCls} flex-1`} />
                  <input type="text" value={p.extension} placeholder="Ext."
                    onChange={e => setForm(f => ({
                      ...f, phones: f.phones.map((x, j) => j === i ? { ...x, extension: e.target.value } : x),
                    }))}
                    className={`${smallInputCls} w-16`} />
                  <button
                    onClick={() => setForm(f => {
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
            onClick={() => setForm(f => ({
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
          {form.emails.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {form.emails.map((em, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="radio" name="primary-email" checked={em.is_primary}
                    title="Primary email — used in report distribution"
                    onChange={() => setForm(f => ({
                      ...f, emails: f.emails.map((x, j) => ({ ...x, is_primary: j === i })),
                    }))} />
                  <input type="text" value={em.label} placeholder="Label (optional)"
                    onChange={e => setForm(f => ({
                      ...f, emails: f.emails.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                    }))}
                    className={`${smallInputCls} w-28`} />
                  <input type="email" value={em.email} placeholder="Email"
                    onChange={e => setForm(f => ({
                      ...f, emails: f.emails.map((x, j) => j === i ? { ...x, email: e.target.value } : x),
                    }))}
                    className={`${smallInputCls} flex-1`} />
                  <button
                    onClick={() => setForm(f => {
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
            onClick={() => setForm(f => ({
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-teal-700 text-white rounded hover:bg-teal-800 disabled:opacity-50 transition-colors font-medium">
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Contact'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
