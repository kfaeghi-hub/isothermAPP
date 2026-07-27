// Applicability ratification — the classifier's proposals, for a human to rule on.
//
// THREE BLOCKS, and the order is the argument:
//
//   1. LIFE SAFETY   — read individually. A wrong answer here is a scope error,
//                      not an untidy grid, so it is never in a bulk-ratify list.
//   2. RULES         — one click settles every unit of a type. This is where the
//                      session's time should go and where it should end quickly.
//   3. EXCEPTIONS    — confidence-sorted, lowest first: the ones most likely to be
//                      wrong are the ones you read.
//
// The burden scales with TYPES, never units. 367 units, 22 types.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { recordFeedback } from '../../lib/cxPlan'

interface Proposal {
  id: string
  kind: 'rule' | 'exception'
  category: string
  equipment_type: string | null
  equipment_id: string | null
  tag: string | null
  stage_group_name: string
  column_label: string | null
  applicable: boolean
  rationale: string | null
  confidence: number | null
  units_affected: number | null
  life_safety: boolean
  status: string
}

export function ApplicabilityReview({ projectId, onApplied }: {
  projectId: string
  onApplied: () => void
}) {
  const [props, setProps] = useState<Proposal[]>([])
  const [busy, setBusy]   = useState(false)
  const [note, setNote]   = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const { data } = await supabase.from('cx_applicability_proposals')
      .select('*').eq('project_id', projectId).eq('status', 'proposed')
      .order('confidence', { ascending: true })
    setProps((data ?? []) as Proposal[])
  }, [projectId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  async function classify() {
    setBusy(true); setNote(null)
    try {
      const { authedFetch } = await import('../../lib/api')
      const res = await authedFetch('/api/classify-applicability', { project_id: projectId })
      const body = await res.json().catch(() => ({}))
      setNote(res.ok
        ? `${body.rules} rule(s), ${body.exceptions} exception(s) across ${body.type_groups} ` +
          `type groups · ${body.units_considered} units · ${body.cost_cents}c`
        : (body.error ?? 'The classifier failed.'))
      await fetchAll()
    } finally { setBusy(false) }
  }

  /** Ratifying a RULE writes a firm rule — it will apply to every future project
   *  too. Ratifying an EXCEPTION writes a single overlay row, source='rule' so a
   *  later re-application owns it (a human editing that cell makes it manual). */
  async function ratify(p: Proposal) {
    setBusy(true)
    try {
      if (p.kind === 'rule' && p.equipment_type) {
        const { error } = await supabase.from('cx_applicability_rules').upsert({
          equipment_type: p.equipment_type,
          stage_group_name: p.stage_group_name,
          column_label: p.column_label,
          applicable: p.applicable,
          rationale: p.rationale,
          ratified_at: new Date().toISOString(),
        }, { onConflict: 'equipment_type,stage_group_name,column_label' })
        if (error) { alert(error.message); return }
      } else if (p.equipment_id) {
        const cols = await supabase.from('project_cx_stage_groups')
          .select('id, project_cx_columns(id, label)')
          .eq('project_id', projectId).eq('name', p.stage_group_name).maybeSingle()
        const list = (cols.data?.project_cx_columns ?? []) as any[]
        const targets = p.column_label ? list.filter(c => c.label === p.column_label) : list
        if (targets.length && !p.applicable) {
          const { error } = await supabase.from('cx_cell_applicability').upsert(
            targets.map(c => ({
              project_id: projectId, equipment_id: p.equipment_id,
              column_id: c.id, applicable: false, source: 'rule',
            })), { onConflict: 'equipment_id,column_id' })
          if (error) { alert(error.message); return }
        }
      }

      await supabase.from('cx_applicability_proposals')
        .update({ status: 'ratified', ratified_at: new Date().toISOString() }).eq('id', p.id)

      // The ledger, keyed to the category the registry declared — fire-integration
      // earns its own track record separate from ordinary rules.
      void recordFeedback({
        agentKey: 'classifier', category: p.category, projectId,
        subjectRef: `${p.equipment_type ?? p.tag}:${p.stage_group_name}`,
        disposition: 'accepted', before: p.rationale,
        evidence: { confidence: p.confidence, life_safety: p.life_safety },
      })
      await fetchAll(); onApplied()
    } finally { setBusy(false) }
  }

  async function reject(p: Proposal) {
    await supabase.from('cx_applicability_proposals')
      .update({ status: 'rejected', ratified_at: new Date().toISOString() }).eq('id', p.id)
    void recordFeedback({
      agentKey: 'classifier', category: p.category, projectId,
      subjectRef: `${p.equipment_type ?? p.tag}:${p.stage_group_name}`,
      disposition: 'rejected', before: p.rationale,
      evidence: { confidence: p.confidence, life_safety: p.life_safety },
    })
    await fetchAll()
  }

  const life  = props.filter(p => p.life_safety)
  const rules = props.filter(p => !p.life_safety && p.kind === 'rule')
  const excs  = props.filter(p => !p.life_safety && p.kind === 'exception')

  async function ratifyAllRules() {
    if (!window.confirm(
      `Ratify all ${rules.length} type rules?\n\n` +
      `Life-safety proposals are NOT included — those are ruled one at a time.`)) return
    for (const r of rules) await ratify(r)
  }

  const Line = ({ p }: { p: Proposal }) => (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-100">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-800">
          <span className="font-mono text-gray-600">{p.equipment_type ?? p.tag}</span>
          <span className="text-gray-300"> · </span>
          {p.stage_group_name}
          {p.column_label && <span className="text-gray-400"> / {p.column_label}</span>}
          <span className={`ml-2 text-[10px] font-semibold rounded px-1.5 py-0.5 ${
            p.applicable ? 'text-teal-800 bg-teal-50' : 'text-gray-700 bg-gray-100'}`}>
            {p.applicable ? 'APPLIES' : 'NOT APPLICABLE'}
          </span>
          {p.units_affected ? (
            <span className="ml-1.5 text-[10px] text-gray-400">{p.units_affected} units</span>
          ) : null}
        </div>
        {p.rationale && <p className="text-[11px] text-gray-500 mt-0.5">{p.rationale}</p>}
      </div>
      <span className={`text-[10px] shrink-0 ${
        (p.confidence ?? 1) < 0.7 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
        {p.confidence == null ? '—' : p.confidence.toFixed(2)}
      </span>
      <div className="flex gap-1.5 shrink-0">
        <button onClick={() => ratify(p)} disabled={busy}
          className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
          Ratify
        </button>
        <button onClick={() => reject(p)} disabled={busy}
          className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50">Reject</button>
      </div>
    </div>
  )

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Applicability proposals</h3>
        <button onClick={classify} disabled={busy}
          className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
          {busy ? 'Working…' : props.length ? 'Re-run classifier' : 'Run classifier'}
        </button>
        {rules.length > 0 && (
          <button onClick={ratifyAllRules} disabled={busy}
            className="text-[11px] border border-teal-700 text-teal-700 rounded px-2 py-0.5 hover:bg-teal-50 disabled:opacity-50">
            Ratify all {rules.length} rules
          </button>
        )}
      </div>
      {note && <p className="text-[11px] text-gray-600 mb-2">{note}</p>}

      {props.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No proposals awaiting a decision. Run the classifier to generate them.
        </p>
      ) : (
        <>
          {life.length > 0 && (
            <div className="mb-5 border border-amber-300 rounded">
              <div className="bg-amber-50 px-3 py-1.5 border-b border-amber-200">
                <h4 className="text-xs font-bold text-amber-900">
                  ⚠ LIFE-SAFETY SCOPE — {life.length} proposal{life.length === 1 ? '' : 's'}
                </h4>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Integrated systems testing, fire and smoke control, emergency power. A wrong
                  answer here is a scope error, not an untidy grid — these are ruled one at a
                  time and are never included in a bulk ratify.
                </p>
              </div>
              <div className="px-3">{life.map(p => <Line key={p.id} p={p} />)}</div>
            </div>
          )}

          {rules.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-gray-700 mb-1">
                Type rules — {rules.length}
                <span className="font-normal text-gray-400"> · one click settles every unit of a type</span>
              </h4>
              {rules.map(p => <Line key={p.id} p={p} />)}
            </div>
          )}

          {excs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">
                Per-unit exceptions — {excs.length}
                <span className="font-normal text-gray-400"> · lowest confidence first</span>
              </h4>
              {excs.map(p => <Line key={p.id} p={p} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
