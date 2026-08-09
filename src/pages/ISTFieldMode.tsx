/**
 * IST FIELD MODE — a witnessed integrated systems test, recorded live.
 *
 * THE VENUE DECIDES THE LAYOUT. This is used standing in a fire command room or
 * a sprinkler room, on a phone, often one-handed, sometimes in gloves, while a
 * horn is sounding and an ITC is calling instructions over a radio. So:
 *
 *   · one protocol per card, full width, no horizontal scroll at 390px;
 *   · verdict targets are large tap areas, not a select;
 *   · nothing needs a keyboard to record a PASS — the common case is two taps;
 *   · the observed note and the photo are there when something is wrong, and
 *     out of the way when nothing is.
 *
 * BOTH MODES OR IT IS NOT TESTED. S1001 tests Normal AND Off-Normal, so a card
 * shows as complete only when both verdicts are set — the same definition the
 * matrix chip uses, deliberately, because two screens disagreeing about what
 * "tested" means is how a green matrix ends up sitting over an unfinished test.
 *
 * OFFLINE VIA THE EXISTING OUTBOX, not a second one. `ist_results` carries a
 * unique key on (session_id, protocol_id), which is exactly the natural key the
 * outbox already requires: re-tapping a verdict REPLACES its queued op rather
 * than appending, so a long session cannot grow an unbounded queue, and a double
 * flush cannot duplicate a row.
 *
 * PHOTOS RIDE A FINDING, and that is the point rather than a limitation. A photo
 * in an integrated test exists because something failed; a deficiency belongs in
 * the findings register with `origin = 'ist'`, never in a parallel store. The
 * finding path needs a live connection — the same honest constraint the checklist
 * fill has, surfaced rather than hidden.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { enqueue, pendingCount, subscribe, flushOutbox } from '../lib/checklistOutbox'

type Verdict = 'pass' | 'fail' | 'na'

interface FieldProtocol {
  id: string; integration_id: string; subject_kind: string; subject_label: string
  condition_type: string | null; equip_type_code: string | null
  normal_mode_steps: string | null; fire_mode_steps: string | null
  integrationLabel: string
}
interface Result {
  protocol_id: string; normal_verdict: Verdict | null; fire_verdict: Verdict | null
  observed_text: string | null; tested_on: string | null
}

const VERDICTS: { v: Verdict; label: string; on: string }[] = [
  { v: 'pass', label: 'Pass', on: 'bg-emerald-600 text-white border-emerald-600' },
  { v: 'fail', label: 'Fail', on: 'bg-red-600 text-white border-red-600' },
  { v: 'na',   label: 'N/A',  on: 'bg-gray-500 text-white border-gray-500' },
]

const today = () => new Date().toISOString().slice(0, 10)

export function ISTFieldMode({ sessionId, sessionDate, onExit }: {
  sessionId: string; sessionDate: string; onExit: () => void
}) {
  const [protocols, setProtocols] = useState<FieldProtocol[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [pending, setPending] = useState(pendingCount())
  const [online, setOnline] = useState(navigator.onLine)
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => subscribe(() => setPending(pendingCount())), [])
  useEffect(() => {
    const on = () => { setOnline(true); void flushOutbox() }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: sess } = await supabase.from('ist_sessions').select('plan_id').eq('id', sessionId).single()
    if (!sess) { setLoading(false); return }
    const { data: ints } = await supabase.from('ist_integrations')
      .select('id, integration_type, attachment_label, system_a_id, system_b_id').eq('plan_id', sess.plan_id).order('sort_order')
    const { data: sys } = await supabase.from('ist_systems').select('id, label').eq('plan_id', sess.plan_id)
    const name = (id: string) => (sys ?? []).find(s => s.id === id)?.label ?? '—'
    const ids = (ints ?? []).map(i => i.id)
    const { data: pr } = ids.length
      ? await supabase.from('ist_protocols')
          .select('id, integration_id, subject_kind, subject_label, condition_type, equip_type_code, normal_mode_steps, fire_mode_steps')
          .in('integration_id', ids).order('sort_order')
      : { data: [] }
    setProtocols((pr ?? []).map(p => {
      const i = (ints ?? []).find(x => x.id === p.integration_id)
      return { ...p, integrationLabel: i ? `${name(i.system_a_id)} ↔ ${name(i.system_b_id)} · ${i.integration_type}` : '' }
    }) as FieldProtocol[])
    const { data: rs } = await supabase.from('ist_results')
      .select('protocol_id, normal_verdict, fire_verdict, observed_text, tested_on').eq('session_id', sessionId)
    setResults(Object.fromEntries((rs ?? []).map(r => [r.protocol_id, r as Result])))
    setLoading(false)
  }, [sessionId])
  useEffect(() => { void load() }, [load])

  /** Optimistic locally, durable through the outbox. The screen must never wait
   *  on a network the building does not have. */
  function record(p: FieldProtocol, patch: Partial<Result>) {
    const prev = results[p.id] ?? { protocol_id: p.id, normal_verdict: null, fire_verdict: null, observed_text: null, tested_on: null }
    const next: Result = { ...prev, ...patch, tested_on: prev.tested_on ?? patch.tested_on ?? today() }
    setResults(r => ({ ...r, [p.id]: next }))
    enqueue({
      kind: 'upsert', table: 'ist_results', onConflict: 'session_id,protocol_id',
      key: `ist_results:${sessionId}:${p.id}`,
      label: `${p.subject_label} · ${p.integrationLabel}`,
      payload: {
        session_id: sessionId, protocol_id: p.id,
        normal_verdict: next.normal_verdict, fire_verdict: next.fire_verdict,
        observed_text: next.observed_text, tested_on: next.tested_on,
      },
    })
    if (navigator.onLine) void flushOutbox()
  }

  const groups = useMemo(() => {
    const m = new Map<string, FieldProtocol[]>()
    for (const p of protocols) { const k = p.integrationLabel; if (!m.has(k)) m.set(k, []); m.get(k)!.push(p) }
    return [...m.entries()]
  }, [protocols])

  const complete = protocols.filter(p => {
    const r = results[p.id]; return r?.normal_verdict && r?.fire_verdict
  }).length

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-24" data-testid="ist-field-mode">
      {/* sticky status bar — the two facts that matter while testing */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <button onClick={onExit} data-testid="ist-field-exit" className="text-xs text-gray-500 hover:text-gray-900">← Session</button>
          <span className="font-mono text-[11px] text-gray-900" data-testid="ist-field-progress">{complete}/{protocols.length} tested</span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px]">
            <span className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className={online ? 'text-gray-400' : 'font-bold text-amber-700'} data-testid="ist-field-conn">
              {online ? 'online' : 'OFFLINE — recording locally'}
            </span>
            {pending > 0 && <span className="font-mono text-amber-700" data-testid="ist-field-pending">{pending} queued</span>}
          </span>
        </div>
      </div>

      {loading && <p className="px-1 text-xs text-gray-400">Loading protocols…</p>}
      {!loading && protocols.length === 0 && (
        <p className="px-1 text-xs text-gray-400">No protocols on this plan yet.</p>
      )}

      {groups.map(([label, list]) => (
        <section key={label} className="space-y-2">
          <h3 className="px-1 pt-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-gray-900">{label}</h3>
          {list.map(p => {
            const r = results[p.id]
            const done = !!(r?.normal_verdict && r?.fire_verdict)
            return (
              <div key={p.id} data-testid="ist-field-card"
                className={`rounded-xl border bg-white p-3 ${done ? 'border-gray-200' : 'border-amber-300'}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-900">{p.subject_label}</span>
                  {p.condition_type && <span className="text-[10px] uppercase tracking-wide text-gray-400">{p.condition_type.replace('_', ' ')}</span>}
                  {p.equip_type_code && <span className="font-mono text-[10px] text-gray-400">{p.equip_type_code}</span>}
                  {!done && <span className="ml-auto rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">untested</span>}
                </div>

                {(['normal', 'fire'] as const).map(mode => {
                  const field = mode === 'normal' ? 'normal_verdict' : 'fire_verdict'
                  const cur = r?.[field] ?? null
                  const steps = mode === 'normal' ? p.normal_mode_steps : p.fire_mode_steps
                  return (
                    <div key={mode} className="mt-2.5">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        {mode === 'normal' ? 'Normal mode' : 'Fire mode'}
                      </div>
                      {steps && <p className="mb-1.5 text-[11px] leading-relaxed text-gray-500">{steps}</p>}
                      <div className="flex gap-2">
                        {VERDICTS.map(v => (
                          <button key={v.v} data-testid={`ist-verdict-${mode}-${v.v}`}
                            onClick={() => record(p, { [field]: v.v } as Partial<Result>)}
                            className={`min-h-[44px] flex-1 rounded-lg border text-xs font-medium transition-colors ${
                              cur === v.v ? v.on : 'border-gray-300 bg-white text-gray-600 active:bg-gray-100'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {/* Defaulted to the session date but EDITABLE, because one signed
                      attachment legitimately holds rows tested on different days. */}
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    tested
                    <input type="date" data-testid="ist-field-date"
                      value={r?.tested_on ?? sessionDate}
                      onChange={e => record(p, { tested_on: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-1 text-[11px]" />
                  </label>
                  <button data-testid="ist-field-note-toggle"
                    className="text-[11px] text-gray-500 underline-offset-2 hover:underline"
                    onClick={() => setOpenNote(openNote === p.id ? null : p.id)}>
                    {r?.observed_text ? 'observed ✓' : 'add observed'}
                  </button>
                </div>

                {openNote === p.id && (
                  <textarea data-testid="ist-field-observed" rows={3}
                    defaultValue={r?.observed_text ?? ''}
                    placeholder="What was observed…"
                    onBlur={e => record(p, { observed_text: e.target.value })}
                    className="mt-2 w-full rounded border border-gray-300 p-2 text-xs" />
                )}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
