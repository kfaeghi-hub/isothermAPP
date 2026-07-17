// Contact phone/email resolution + display, shared by DirectoryPage and the
// project Team tab. Same primary ?? legacy resolution as the report generator:
// directory corrections update every future rendering; issued documents are
// point-in-time files and correctly keep old values.

import type { Contact, ContactEmail, ContactPhone, PhoneType } from '../types/database'

export const PHONE_TYPES: { value: PhoneType; label: string }[] = [
  { value: 'mobile',   label: 'Cell' },
  { value: 'office',   label: 'Work' },
  { value: 'landline', label: 'Landline' },
  { value: 'site',     label: 'Site' },
]

export const phoneLabel = (t: string): string =>
  PHONE_TYPES.find(p => p.value === t)?.label ?? t

/** Primary row of a phones/emails list, with sensible fallback to the first row. */
export function primaryOf<T extends { is_primary: boolean }>(rows: T[] | undefined | null): T | undefined {
  if (!rows || rows.length === 0) return undefined
  return rows.find(r => r.is_primary) ?? rows[0]
}

type ContactLike = Pick<Contact, 'email' | 'phone'> & {
  contact_emails?: ContactEmail[]
  contact_phones?: ContactPhone[]
}

/** Primary email ?? legacy column. Null when the contact has neither. */
export function resolveEmail(c: ContactLike | null | undefined): string | null {
  if (!c) return null
  return primaryOf(c.contact_emails)?.email ?? c.email ?? null
}

/** Primary phone (formatted with extension) ?? legacy column. */
export function resolvePhone(c: ContactLike | null | undefined): { display: string; typeLabel: string | null } | null {
  if (!c) return null
  const p = primaryOf(c.contact_phones)
  if (p) {
    return {
      display: `${p.number}${p.extension ? ` x${p.extension}` : ''}`,
      typeLabel: phoneLabel(p.phone_type),
    }
  }
  return c.phone ? { display: c.phone, typeLabel: null } : null
}
