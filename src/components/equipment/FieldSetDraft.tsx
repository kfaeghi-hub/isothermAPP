// FieldSetDraft.tsx — the drafter's review surface (1.02, item 2).
//
// PROPOSES, NEVER WRITES. Nothing reaches equipment_type_field_defs until a
// human has read the table, edited or cut rows, and pressed Approve. Declining
// costs nothing and leaves the type exactly as the mint left it: carrying the
// universal __base identity set and nothing else, which is a perfectly good
// place for a type to live.
//
// The review is INLINE and shows the whole table at once, because the judgement
// being asked for is about the SET — "is this the right ten fields for a
// convector" — not about ten separate yes/no decisions. A row-at-a-time flow
// would get every row right and the shape wrong.

import { useState } from 'react'
import { authedFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { recordFeedback } from '../../lib/cxPlan'

export interface DraftField {
  field_name: string
  unit: string | null
  unit_imperial?: string | null
  sections: ('spec' | 'shop_drawing' | 'installed')[]
  reasoning?: string
}

const SECTIONS: { key: DraftField['sections'][number]; label: string }[] = [
  { key: 'spec',         label: 'Spec' },
  { key: 'shop_drawing', label: 'Shop' },
  { key: 'installed',    label: 'Installed' },
]

interface Props {
  typeKey: string
  typeName: string
  onApplied: () => void
  onClose: () => void
}

export function FieldSetDraft({ typeKey, typeName, onApplied, onClose }: Props) {
  const [fields, setFields] = useState<DraftField[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [dropped, setDropped] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept so the ledger records whether the human EDITED the proposal or took it
  // as drafted. Accept-rate without edit-rate flatters an agent that is
  // directionally right and wrong in every detail.
  const [original, setOriginal] = useState<DraftField[] | null>(null)

  async function draft() {
    setBusy(true); setError(null)
    try {
      const res = await authedFetch('/api/intake', { action: 'draft-field-set', type_key: typeKey })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? 'The draft failed.'); return }
      setFields(body.fields ?? [])
      setOriginal(body.fields ?? [])
      setNote(body.note ?? null)
      setDropped(body.dropped_base_collisions ?? 0)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally { setBusy(false) }
  }

  function edit(i: number, patch: Partial<DraftField>) {
    setFields(f => f ? f.map((r, j) => j === i ? { ...r, ...patch } : r) : f)
  }
  function cut(i: number) {
    setFields(f => f ? f.filter((_, j) => j !== i) : f)
  }
  function toggleSection(i: number, sec: DraftField['sections'][number]) {
    setFields(f => f ? f.map((r, j) => {
      if (j !== i) return r
      const has = r.sections.includes(sec)
      return { ...r, sections: has ? r.sections.filter(x => x !== sec) : [...r.sections, sec] }
    }) : f)
  }

  async function approve() {
    if (!fields?.length) return
    setBusy(true); setError(null)

    // A field in no column renders nowhere. Refuse rather than write a row that
    // would silently never appear on a unit.
    const homeless = fields.filter(f => f.sections.length === 0).map(f => f.field_name)
    if (homeless.length) {
      setError(`These fields are in no column and would never appear: ${homeless.join(', ')}. ` +
               `Tick a column or cut the row.`)
      setBusy(false); return
    }

    const rows = fields.flatMap((f, i) => f.sections.map(section => ({
      equipment_type: typeKey,
      section,
      field_name: f.field_name.trim(),
      unit: f.unit?.trim() || null,
      unit_imperial: f.unit_imperial?.trim() || null,
      sort_order: i + 1,
    })))

    const { error: insErr } = await supabase.from('equipment_type_field_defs').insert(rows)
    if (insErr) { setError(insErr.message); setBusy(false); return }

    // LEDGER-FED FROM BIRTH, per category. This IS an agent-originated proposal,
    // so it feeds agent_feedback — unlike a deterministic sweep or an owner
    // ruling, which do not, because polluting the acceptance rate corrupts the
    // track record the autonomy dial reads.
    const edited = JSON.stringify(original) !== JSON.stringify(fields)
    await recordFeedback({
      agentKey: 'drafter',
      category: 'field-def-set',
      subjectRef: `equipment_type:${typeKey}`,
      disposition: edited ? 'edited' : 'accepted',
      before: JSON.stringify(original),
      after: JSON.stringify(fields),
    }).catch(() => {})

    setBusy(false)
    onApplied()
  }

  async function decline() {
    if (original) {
      await recordFeedback({
        agentKey: 'drafter',
        category: 'field-def-set',
        subjectRef: `equipment_type:${typeKey}`,
        disposition: 'rejected',
        before: JSON.stringify(original),
        after: null,
      }).catch(() => {})
    }
    onClose()
  }

  if (!fields) {
    return (
      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
        <p className="text-xs text-gray-600">
          Draft a starter nameplate table for <strong>{typeName}</strong>. Nothing is
          saved until you approve it — and minting with identity fields only is a
          perfectly good outcome.
        </p>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="flex gap-2 mt-2">
          <button onClick={() => void draft()} disabled={busy}
            className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800 disabled:opacity-50">
            {busy ? 'Drafting…' : 'Draft field set'}
          </button>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h5 className="text-xs font-semibold text-gray-700">
          Proposed nameplate table — {typeName} ({fields.length} field{fields.length === 1 ? '' : 's'})
        </h5>
        <span className="text-[10px] text-gray-500">Nothing is written until you approve.</span>
      </div>

      {note && <p className="mt-1 text-[11px] text-gray-600 italic">{note}</p>}
      {dropped > 0 && (
        <p className="mt-1 text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1">
          {dropped} drafted field{dropped === 1 ? '' : 's'} duplicated the universal identity
          set and {dropped === 1 ? 'was' : 'were'} dropped before you saw {dropped === 1 ? 'it' : 'them'}.
        </p>
      )}

      <table className="w-full text-xs mt-2">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
            <th className="py-1 pr-2">Field</th>
            <th className="py-1 pr-2 w-24">Unit</th>
            <th className="py-1 pr-2 w-24">Imperial</th>
            <th className="py-1 pr-2 w-44">Columns</th>
            <th className="py-1 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i} className="border-b border-gray-100 align-top">
              <td className="py-1 pr-2">
                <input value={f.field_name} onChange={e => edit(i, { field_name: e.target.value })}
                  aria-label={`Field name ${i + 1}`}
                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs" />
                {f.reasoning && <p className="text-[10px] text-gray-500 mt-0.5">{f.reasoning}</p>}
              </td>
              <td className="py-1 pr-2">
                <input value={f.unit ?? ''} onChange={e => edit(i, { unit: e.target.value })}
                  aria-label={`Unit ${i + 1}`}
                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs" />
              </td>
              <td className="py-1 pr-2">
                <input value={f.unit_imperial ?? ''} onChange={e => edit(i, { unit_imperial: e.target.value })}
                  aria-label={`Imperial unit ${i + 1}`}
                  placeholder="—"
                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs" />
              </td>
              <td className="py-1 pr-2">
                <div className="flex gap-1.5">
                  {SECTIONS.map(s => (
                    <label key={s.key} className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                      <input type="checkbox" checked={f.sections.includes(s.key)}
                        onChange={() => toggleSection(i, s.key)}
                        aria-label={`${s.label} column for ${f.field_name}`} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </td>
              <td className="py-1 text-right">
                <button onClick={() => cut(i)} title="Cut this field"
                  className="text-[10px] text-red-600 hover:text-red-800">Cut</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <div className="flex gap-2 mt-3">
        <button onClick={() => void approve()} disabled={busy || fields.length === 0}
          className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800 disabled:opacity-50">
          {busy ? 'Saving…' : `Approve ${fields.length} field${fields.length === 1 ? '' : 's'}`}
        </button>
        <button onClick={() => void decline()} disabled={busy}
          className="text-xs text-gray-600 hover:text-gray-800">Decline</button>
      </div>
    </div>
  )
}
