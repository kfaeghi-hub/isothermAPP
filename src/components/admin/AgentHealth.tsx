// Agent health — "is the Cx Agent getting smarter", in numbers.
//
// PER CATEGORY, NOT PER AGENT. classifier:applicability-rule and
// classifier:fire-integration are separate lines because they are separate track
// records, and any future graduated-autonomy ruling is made per category on this
// data. The data only exists if it was captured from day one — which is why the
// categories are declared in each agent's registry contract rather than
// discovered from whatever rows happen to arrive.
//
// A FALLING EDIT RATE IS THE SYSTEM LEARNING. It is the only honest measure of it,
// and it is the number this screen exists to show.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

interface HealthRow {
  agent_key: string; category: string
  reviewed: number; accepted: number; edited: number; rejected: number
  accept_pct: number | null; edit_pct: number | null
  first_seen: string; last_seen: string
}
interface Proposal {
  id: string; scope: string; proposed: string; rationale: string | null
  confidence: number | null; evidence: any; status: string; created_at: string
}
interface CostRow { agent_key: string | null; calls: number; cents: number }

export function AgentHealth() {
  const [health, setHealth] = useState<HealthRow[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [h, p, g] = await Promise.all([
      supabase.from('agent_health').select('*').order('agent_key').order('category'),
      supabase.from('firm_corrections').select('*').eq('status', 'proposed')
        .order('created_at', { ascending: false }),
      supabase.from('ai_generations').select('agent_key, cost_cents'),
    ])
    setHealth((h.data ?? []) as HealthRow[])
    setProposals((p.data ?? []) as Proposal[])
    const agg = new Map<string, CostRow>()
    for (const r of (g.data ?? []) as any[]) {
      const k = r.agent_key ?? '(pre-registry)'
      const row = agg.get(k) ?? { agent_key: k, calls: 0, cents: 0 }
      row.calls++; row.cents += Number(r.cost_cents ?? 0)
      agg.set(k, row)
    }
    setCosts([...agg.values()].sort((a, b) => b.cents - a.cents))
  }, [])

  useEffect(() => { if (open) void fetchAll() }, [open, fetchAll])

  async function harvest() {
    setBusy(true); setNote(null)
    try {
      const { authedFetch } = await import('../../lib/api')
      const res = await authedFetch('/api/librarian-harvest', {})
      const body = await res.json().catch(() => ({}))
      setNote(res.ok
        ? (body.note ?? `Harvest complete — ${body.clusters} cluster(s), ${body.proposals} proposal(s).`)
        : (body.error ?? 'The harvest failed.'))
      await fetchAll()
    } finally { setBusy(false) }
  }

  async function rule(id: string, status: 'ratified' | 'dismissed') {
    // RATIFIED IS NOT APPLIED. Ratifying records the decision; landing it in the
    // corpus is a deliberate second step (a firm-knowledge PR, or a row write), and
    // applied_at stays null until then so the gap is visible rather than assumed.
    const { error } = await supabase.from('firm_corrections')
      .update({ status, ratified_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert(error.message); return }
    await fetchAll()
  }

  const totalCents = costs.reduce((s, c) => s + c.cents, 0)

  return (
    <section>
      <button onClick={() => setOpen(o => !o)}
        className="text-sm font-semibold text-gray-800 hover:text-teal-700">
        Agent Health ({health.length} tracked){proposals.length > 0 && (
          <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
            {proposals.length} PROPOSED
          </span>
        )} {open ? '▾' : '▸'}
      </button>

      {open && (
        <>
          <p className="text-xs text-gray-400 mt-1 mb-3">
            Rates are per <span className="font-medium">proposal category</span>, not per agent — each
            category earns its own track record. Every category is at{' '}
            <span className="font-mono">autonomy_tier 1</span> (individually ratified); no other tier
            is implemented.
          </p>

          {/* ── correction rates ─────────────────────────────────────────── */}
          {health.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No feedback recorded yet. Rates appear once a human reviews an agent proposal.
            </p>
          ) : (
            <table className="w-full text-xs border-collapse max-lg:block max-lg:overflow-x-auto">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-1.5 pr-3">Agent</th>
                  <th className="py-1.5 pr-3">Category</th>
                  <th className="py-1.5 pr-3 w-16">Seen</th>
                  <th className="py-1.5 pr-3 w-20">Accepted</th>
                  <th className="py-1.5 pr-3 w-20">Edited</th>
                  <th className="py-1.5 pr-3 w-20">Rejected</th>
                  <th className="py-1.5 w-24">Accept rate</th>
                </tr>
              </thead>
              <tbody>
                {health.map(r => (
                  <tr key={`${r.agent_key}:${r.category}`} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-mono text-gray-500">{r.agent_key}</td>
                    <td className="py-1.5 pr-3 text-gray-800">{r.category}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{r.reviewed}</td>
                    <td className="py-1.5 pr-3 text-green-700">{r.accepted}</td>
                    <td className="py-1.5 pr-3 text-amber-700">{r.edited}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{r.rejected}</td>
                    <td className="py-1.5 font-semibold text-gray-800">
                      {r.accept_pct == null ? '—' : `${r.accept_pct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── cost per specialist ──────────────────────────────────────── */}
          <h4 className="text-xs font-semibold text-gray-700 mt-6 mb-1">
            Cost per specialist — {(totalCents / 100).toFixed(2)} total
          </h4>
          <div className="flex flex-wrap gap-2">
            {costs.map(c => (
              <span key={c.agent_key ?? 'null'}
                className="text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="font-mono text-gray-500">{c.agent_key}</span>
                <span className="text-gray-400"> · {c.calls} calls · </span>
                <span className="font-semibold text-gray-800">{(c.cents / 100).toFixed(2)}</span>
              </span>
            ))}
          </div>

          {/* ── the harvest + its queue ──────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-6 mb-1">
            <h4 className="text-xs font-semibold text-gray-700">
              Librarian proposals ({proposals.length})
            </h4>
            <button onClick={harvest} disabled={busy}
              className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
              {busy ? 'Harvesting…' : 'Run harvest'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            The librarian clusters corrections and proposes corpus changes. It never writes to the
            corpus — you ratify, then the change lands as a firm-knowledge PR or a row.
          </p>
          {note && <p className="text-xs text-gray-600 mb-2">{note}</p>}

          {proposals.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nothing awaiting ratification.</p>
          ) : proposals.map(p => (
            <div key={p.id} className="border border-gray-200 rounded p-2 mb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-gray-500">{p.scope}</span>
                <span className="text-[10px] text-gray-400">
                  {p.confidence == null ? '' : `confidence ${p.confidence}`}
                </span>
              </div>
              <p className="text-xs text-gray-800 mt-1">{p.proposed}</p>
              {p.rationale && <p className="text-[11px] text-gray-500 mt-1">{p.rationale}</p>}
              {Array.isArray(p.evidence) && p.evidence.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-gray-400 cursor-pointer">
                    {p.evidence.length} piece(s) of evidence
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {p.evidence.slice(0, 5).map((e: any, i: number) => (
                      <li key={i} className="text-[10px] text-gray-500">
                        <span className="text-gray-400">before:</span> {String(e.before ?? '—').slice(0, 120)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="flex gap-2 mt-2">
                <button onClick={() => rule(p.id, 'ratified')}
                  className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800">
                  Ratify
                </button>
                <button onClick={() => rule(p.id, 'dismissed')}
                  className="text-[11px] text-gray-500 hover:text-red-600">Dismiss</button>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
