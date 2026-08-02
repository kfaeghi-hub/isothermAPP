// Type-assignment review — the sweep's proposals, for a human to rule on.
//
// THREE BLOCKS, ordered by what they cost to get wrong:
//
//   1. UNRESOLVED    — no type in the firm vocabulary matches. The name is
//                      already queued for ratification; these units stay untyped
//                      until it is ruled on. Shown, not actionable here.
//   2. FROM CATEGORY — matched on the source HEADER rather than the unit's own
//                      description. A header often covers several classes (the
//                      Seneca AHU split was one header over thirteen), so these
//                      are read individually.
//   3. FROM DESCRIPTOR — the unit's own words matched every word of the type
//                      name. One click settles the body.
//
// ASSIGNING A TYPE IS A CLAIM ABOUT WHAT A THING IS. It decides which nameplate
// the unit gets and which applicability rules reach it, so nothing here is
// automatic — the sweep proposes, this disposes.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

interface Proposal {
  id: string
  equipment_id: string
  proposed_type: string | null
  observed_name: string | null
  confidence: number | null
  rationale: string | null
  status: string
}
interface Unit { id: string; tag: string | null; descriptor: string | null; category: string | null }

export function TypeAssignmentReview({ projectId, onApplied }: {
  projectId: string; onApplied: () => void
}) {
  const [props, setProps] = useState<Proposal[]>([])
  const [units, setUnits] = useState<Map<string, Unit>>(new Map())
  const [busy, setBusy]   = useState(false)
  const [note, setNote]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const { data } = await supabase.from('equipment_type_proposals')
      .select('*').eq('project_id', projectId).eq('status', 'proposed')
      .order('confidence', { ascending: false })
    const list = (data ?? []) as Proposal[]
    setProps(list)
    if (list.length) {
      const { data: eq } = await supabase.from('equipment')
        .select('id, tag, descriptor, category').in('id', list.map(p => p.equipment_id))
      setUnits(new Map((eq ?? []).map(e => [e.id, e as Unit])))
    }
  }, [projectId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  const byDesc = props.filter(p => p.proposed_type && (p.confidence ?? 0) >= 0.85)
  const byCat  = props.filter(p => p.proposed_type && (p.confidence ?? 0) < 0.85)
  const none   = props.filter(p => !p.proposed_type)

  async function accept(list: Proposal[]) {
    if (!list.length) return
    setBusy(true); setNote(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let done = 0
      for (const p of list) {
        // The type first, the proposal second. If the type write fails the
        // proposal stays open, which is true; the reverse order would mark it
        // settled over a unit that never changed.
        const { error } = await supabase.from('equipment')
          .update({ equipment_type: p.proposed_type, updated_at: new Date().toISOString() })
          .eq('id', p.equipment_id)
        if (error) { alert(`${units.get(p.equipment_id)?.tag ?? 'unit'}: ${error.message}`); break }
        await supabase.from('equipment_type_proposals').update({
          status: 'accepted', resolved_by: user?.id ?? null,
          resolved_at: new Date().toISOString(),
        }).eq('id', p.id)
        done++
      }
      setNote(`${done} unit${done === 1 ? '' : 's'} typed. Their nameplate fields are ` +
              `live now — the def sets were already waiting.`)
      await fetchAll(); onApplied()
    } finally { setBusy(false) }
  }

  async function reject(p: Proposal) {
    await supabase.from('equipment_type_proposals')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', p.id)
    await fetchAll()
  }

  const Line = ({ p }: { p: Proposal }) => {
    const u = units.get(p.equipment_id)
    return (
      <div className="flex items-start gap-2 py-1.5 border-b border-gray-100">
        <span className={`text-[10px] shrink-0 w-8 text-right ${
          (p.confidence ?? 1) < 0.85 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
          {p.confidence == null ? '—' : p.confidence.toFixed(2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gray-800">
            <span className="font-mono text-gray-700">{u?.tag ?? '—'}</span>
            {u?.descriptor && <span className="text-gray-500"> · {u.descriptor}</span>}
            {p.proposed_type ? (
              <span className="ml-2 text-[10px] text-teal-800 bg-teal-50 rounded px-1.5 py-0.5">
                → {p.proposed_type.replace(/_/g, ' ')}
              </span>
            ) : (
              <span className="ml-2 text-[10px] text-gray-700 bg-gray-100 rounded px-1.5 py-0.5">
                queued for the type vocabulary
              </span>
            )}
          </div>
          {p.rationale && <p className="text-[11px] text-gray-500 mt-0.5">{p.rationale}</p>}
        </div>
        {p.proposed_type && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => accept([p])} disabled={busy}
              className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
              Assign
            </button>
            <button onClick={() => reject(p)} disabled={busy}
              className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50">Reject</button>
          </div>
        )}
      </div>
    )
  }

  if (props.length === 0) return null

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Type assignments</h3>
        <span className="text-[11px] text-gray-400">{props.length} proposed</span>
        {byDesc.length > 0 && (
          <button onClick={() => accept(byDesc)} disabled={busy}
            className="text-[11px] bg-teal-700 text-white rounded px-2.5 py-0.5 hover:bg-teal-800 disabled:opacity-50">
            Assign {byDesc.length} matched on description
          </button>
        )}
      </div>
      {note && (
        <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded px-3 py-1.5 mb-2">
          {note}
        </p>
      )}

      {byCat.length > 0 && (
        <div className="mb-4 border border-amber-300 rounded">
          <div className="bg-amber-50 px-3 py-1.5 border-b border-amber-200">
            <h4 className="text-xs font-bold text-amber-900">Matched on the CATEGORY — {byCat.length}</h4>
            <p className="text-[11px] text-amber-800 mt-0.5">
              The unit's own description matched nothing; this comes from its source
              header. One header often covers several classes — on Seneca a single
              "AIR HANDLING UNIT" header covered thirteen. Read these individually.
            </p>
          </div>
          <div className="px-3">{byCat.map(p => <Line key={p.id} p={p} />)}</div>
        </div>
      )}

      {byDesc.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-1">
            Matched on the description — {byDesc.length}
            <span className="font-normal text-gray-400"> · every word of the type name appears</span>
          </h4>
          {byDesc.map(p => <Line key={p.id} p={p} />)}
        </div>
      )}

      {none.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-1">
            No type in the vocabulary — {none.length}
            <span className="font-normal text-gray-400"> · names queued for ratification in Classifications</span>
          </h4>
          <p className="text-[11px] text-gray-500 mb-1">
            Not a failure to match: the vocabulary does not yet contain these. They
            stay untyped, and keep their identity fields, until a type is minted.
          </p>
          {none.slice(0, 8).map(p => <Line key={p.id} p={p} />)}
          {none.length > 8 && (
            <p className="text-[11px] text-gray-400 mt-1">…and {none.length - 8} more.</p>
          )}
        </div>
      )}
    </div>
  )
}
