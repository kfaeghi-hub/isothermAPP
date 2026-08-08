/**
 * IST — Integrated Systems Testing (CAN/ULC-S1001). PHASE 1: schema-backed CRUD
 * for plans, systems, integrations and protocols.
 *
 * The matrix presentation, the pre-IST checklist, field mode and document
 * generation are phases 2-4. This screen is deliberately plain: it exists so the
 * data model can be exercised and its guards demonstrated against a real UI
 * before any of that is built on top.
 *
 * WHY THE PROTOCOL FORM CHANGES SHAPE. A protocol's subject is one of three
 * kinds, because the firm's own report proves the polymorphism: Attachment A-1
 * enumerates CONDITION TYPES, A-3 enumerates UNITS, and A-2 enumerates POINTS
 * with an equipment-type code. The form follows the kind — picking `condition`
 * shows the four S1001 condition types and hides the point code; picking `unit`
 * hides both. That is not cosmetic: the database constraint refuses the wrong
 * combination, so a form that offered every field on every kind would be a form
 * that lets you build a row the database will reject.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SubjectKind = 'condition' | 'unit' | 'point'
type ConditionType = 'alarm' | 'supervisory' | 'trouble' | 'connection_integrity'

interface Plan { id: string; revision_label: string; revision_date: string | null; description: string | null; status: string }
interface Sys { id: string; label: string; overview_description: string | null; integrations_objectives: string | null; sort_order: number }
interface Integration {
  id: string; system_a_id: string; system_b_id: string; integration_type: string
  normal_mode_behavior: string | null; offnormal_mode_behavior: string | null
  attachment_label: string | null; sort_order: number
}
interface Protocol {
  id: string; integration_id: string; subject_kind: SubjectKind; subject_label: string
  condition_type: ConditionType | null; equip_type_code: string | null
  normal_mode_steps: string | null; fire_mode_steps: string | null; expected_result: string | null; sort_order: number
}

const CONDITION_LABEL: Record<ConditionType, string> = {
  alarm: 'Alarm', supervisory: 'Supervisory', trouble: 'Trouble', connection_integrity: 'Connection Integrity',
}
const KIND_HELP: Record<SubjectKind, string> = {
  condition: 'One row per S1001 condition type — the Attachment A-1 shape.',
  unit: 'One row per machine — the Attachment A-3 shape (ERV-1, DH-1 …).',
  point: 'One row per supervised device, with its type code — the Attachment A-2 shape.',
}

export function ISTPage({ projectId }: { projectId: string }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [planId, setPlanId] = useState<string | null>(null)
  const [systems, setSystems] = useState<Sys[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [openIntegration, setOpenIntegration] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: p } = await supabase.from('ist_plans')
      .select('id, revision_label, revision_date, description, status')
      .eq('project_id', projectId).order('created_at')
    const list = p ?? []
    setPlans(list)
    const active = planId && list.some(x => x.id === planId) ? planId : list[0]?.id ?? null
    setPlanId(active)
    if (active) {
      const { data: s } = await supabase.from('ist_systems')
        .select('id, label, overview_description, integrations_objectives, sort_order')
        .eq('plan_id', active).order('sort_order')
      const { data: i } = await supabase.from('ist_integrations')
        .select('id, system_a_id, system_b_id, integration_type, normal_mode_behavior, offnormal_mode_behavior, attachment_label, sort_order')
        .eq('plan_id', active).order('sort_order')
      setSystems(s ?? []); setIntegrations(i ?? [])
      const ids = (i ?? []).map(x => x.id)
      if (ids.length) {
        const { data: pr } = await supabase.from('ist_protocols')
          .select('id, integration_id, subject_kind, subject_label, condition_type, equip_type_code, normal_mode_steps, fire_mode_steps, expected_result, sort_order')
          .in('integration_id', ids).order('sort_order')
        setProtocols(pr ?? [])
      } else setProtocols([])
    } else { setSystems([]); setIntegrations([]); setProtocols([]) }
    setLoading(false)
  }, [projectId, planId])

  useEffect(() => { void load() }, [projectId])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (planId) void load() }, [planId])   // eslint-disable-line react-hooks/exhaustive-deps

  // Every write surfaces its error rather than failing silently: the constraints
  // on these tables are the design, and a UI that swallows their messages hides
  // the part worth seeing.
  // PromiseLike, not Promise: a supabase-js builder is a thenable, not a real
  // Promise, and `tsc -b` (the deployment's own build) rejects the narrower type
  // even though `tsc --noEmit` let it pass.
  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setErr(null)
    const { error } = await fn()
    if (error) { setErr((error as { message?: string })?.message ?? String(error)); return false }
    await load(); return true
  }

  const sysName = (id: string) => systems.find(s => s.id === id)?.label ?? '—'

  return (
    <div className="space-y-5" data-testid="ist-page">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.08em] text-gray-900">Integrated Systems Testing</h2>
        <span className="text-[10px] text-gray-400">CAN/ULC-S1001 · OBC 3.2.10.1</span>
      </div>

      {err && (
        <div data-testid="ist-error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
      )}

      {/* ── plans ───────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-display text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Plan revisions</h3>
          <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
            An issued revision is a frozen record. A correction is the next revision, never an edit.
          </p>
        </div>
        <div className="p-4 space-y-2">
          {loading ? <p className="text-xs text-gray-400">Loading…</p> : plans.length === 0 ? (
            <p className="text-xs text-gray-400">No IST plan yet.</p>
          ) : plans.map(p => (
            <label key={p.id} className="flex items-center gap-2 text-xs" data-testid="ist-plan-row">
              <input type="radio" checked={planId === p.id} onChange={() => setPlanId(p.id)} />
              <span className="font-mono">{p.revision_label}</span>
              <span className="text-gray-500">{p.description ?? ''}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">{p.status}</span>
            </label>
          ))}
          <PlanForm onCreate={(label, desc) => run(() =>
            supabase.from('ist_plans').insert({ project_id: projectId, revision_label: label, description: desc }))} />
        </div>
      </section>

      {planId && (
        <>
          {/* ── systems ───────────────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-display text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Participating systems</h3>
              <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
                Each carries its own overview and functional-objectives prose — §3.3 of the report.
              </p>
            </div>
            <div className="p-4 space-y-2">
              {systems.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs" data-testid="ist-system-row">
                  <span className="font-medium text-gray-900">{s.label}</span>
                  <button className="ml-auto text-[10px] text-gray-400 hover:text-red-600"
                    onClick={() => run(() => supabase.from('ist_systems').delete().eq('id', s.id))}>remove</button>
                </div>
              ))}
              <InlineForm placeholder="System label (e.g. Fire Alarm)" cta="Add system"
                testid="ist-add-system"
                onSubmit={v => run(() => supabase.from('ist_systems').insert({ plan_id: planId, label: v, sort_order: systems.length }))} />
            </div>
          </section>

          {/* ── integrations ──────────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-display text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Integrations</h3>
              <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
                Pairwise, with the Normal and Off-Normal behaviour that defines the test. Tabular rather than a
                systems grid: an integration that does not exist is not interesting — one that exists and was not
                tested is.
              </p>
            </div>
            <div className="p-4 space-y-3">
              {integrations.length === 0 && <p className="text-xs text-gray-400">No integrations yet.</p>}
              {integrations.map(i => {
                const mine = protocols.filter(p => p.integration_id === i.id)
                return (
                  <div key={i.id} className="rounded-lg border border-gray-200" data-testid="ist-integration-row">
                    <div className="flex flex-wrap items-baseline gap-2 px-3 py-2">
                      <span className="text-xs font-medium text-gray-900">{sysName(i.system_a_id)} ↔ {sysName(i.system_b_id)}</span>
                      <span className="text-[10px] text-gray-500">{i.integration_type}</span>
                      {i.attachment_label && <span className="font-mono text-[10px] text-gray-400">{i.attachment_label}</span>}
                      <span className="ml-auto text-[10px] text-gray-400">{mine.length} protocol{mine.length === 1 ? '' : 's'}</span>
                      <button className="text-[10px] text-gray-500 hover:text-gray-900"
                        data-testid="ist-toggle-protocols"
                        onClick={() => setOpenIntegration(openIntegration === i.id ? null : i.id)}>
                        {openIntegration === i.id ? 'hide' : 'protocols'}
                      </button>
                      <button className="text-[10px] text-gray-400 hover:text-red-600"
                        onClick={() => run(() => supabase.from('ist_integrations').delete().eq('id', i.id))}>remove</button>
                    </div>
                    {openIntegration === i.id && (
                      <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                        {mine.map(p => (
                          <div key={p.id} className="flex flex-wrap items-baseline gap-2 text-[11px]" data-testid="ist-protocol-row">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-gray-500">{p.subject_kind}</span>
                            <span className="text-gray-900">{p.subject_label}</span>
                            {p.condition_type && <span className="text-gray-500">{CONDITION_LABEL[p.condition_type]}</span>}
                            {p.equip_type_code && <span className="font-mono text-gray-400">{p.equip_type_code}</span>}
                            <button className="ml-auto text-[10px] text-gray-400 hover:text-red-600"
                              onClick={() => run(() => supabase.from('ist_protocols').delete().eq('id', p.id))}>remove</button>
                          </div>
                        ))}
                        <ProtocolForm integrationId={i.id} count={mine.length} onCreate={row => run(() =>
                          supabase.from('ist_protocols').insert(row))} />
                      </div>
                    )}
                  </div>
                )
              })}
              <IntegrationForm systems={systems} onCreate={row => run(() =>
                supabase.from('ist_integrations').insert({ ...row, plan_id: planId, sort_order: integrations.length }))} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// ── small forms ─────────────────────────────────────────────────────────────

function InlineForm({ placeholder, cta, onSubmit, testid }: {
  placeholder: string; cta: string; testid: string; onSubmit: (v: string) => Promise<boolean>
}) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2 pt-1">
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} data-testid={`${testid}-input`}
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
      <button disabled={!v.trim()} data-testid={testid}
        className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40"
        onClick={async () => { if (await onSubmit(v.trim())) setV('') }}>{cta}</button>
    </div>
  )
}

function PlanForm({ onCreate }: { onCreate: (label: string, desc: string) => Promise<boolean> }) {
  const [label, setLabel] = useState(''); const [desc, setDesc] = useState('')
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Rev (e.g. 0)" data-testid="ist-plan-rev"
        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs" />
      <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description of this revision" data-testid="ist-plan-desc"
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
      <button disabled={!label.trim()} data-testid="ist-add-plan"
        className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40"
        onClick={async () => { if (await onCreate(label.trim(), desc.trim())) { setLabel(''); setDesc('') } }}>Add revision</button>
    </div>
  )
}

function IntegrationForm({ systems, onCreate }: {
  systems: Sys[]; onCreate: (row: Record<string, unknown>) => Promise<boolean>
}) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [type, setType] = useState('')
  const [att, setAtt] = useState('')
  const ready = a && b && type.trim()
  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
      <select value={a} onChange={e => setA(e.target.value)} data-testid="ist-int-a" className="rounded border border-gray-300 px-2 py-1 text-xs">
        <option value="">System A…</option>{systems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select value={b} onChange={e => setB(e.target.value)} data-testid="ist-int-b" className="rounded border border-gray-300 px-2 py-1 text-xs">
        <option value="">System B…</option>{systems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <input value={type} onChange={e => setType(e.target.value)} placeholder="Integration type" data-testid="ist-int-type"
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
      <input value={att} onChange={e => setAtt(e.target.value)} placeholder="A-1" data-testid="ist-int-att"
        className="w-16 rounded border border-gray-300 px-2 py-1 text-xs" />
      <button disabled={!ready} data-testid="ist-add-integration"
        className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40"
        onClick={async () => {
          if (await onCreate({ system_a_id: a, system_b_id: b, integration_type: type.trim(), attachment_label: att.trim() || null })) {
            setA(''); setB(''); setType(''); setAtt('')
          }
        }}>Add integration</button>
    </div>
  )
}

function ProtocolForm({ integrationId, count, onCreate }: {
  integrationId: string; count: number; onCreate: (row: Record<string, unknown>) => Promise<boolean>
}) {
  const [kind, setKind] = useState<SubjectKind>('condition')
  const [label, setLabel] = useState('')
  const [cond, setCond] = useState<ConditionType>('alarm')
  const [code, setCode] = useState('')
  return (
    <div className="space-y-2 border-t border-gray-100 pt-2">
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={e => setKind(e.target.value as SubjectKind)} data-testid="ist-proto-kind"
          className="rounded border border-gray-300 px-2 py-1 text-xs">
          <option value="condition">condition</option><option value="unit">unit</option><option value="point">point</option>
        </select>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Subject label" data-testid="ist-proto-label"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        {/* The form follows the kind, because the constraint does. */}
        {kind === 'condition' && (
          <select value={cond} onChange={e => setCond(e.target.value as ConditionType)} data-testid="ist-proto-cond"
            className="rounded border border-gray-300 px-2 py-1 text-xs">
            {(Object.keys(CONDITION_LABEL) as ConditionType[]).map(c => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
          </select>
        )}
        {kind === 'point' && (
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="S.V." data-testid="ist-proto-code"
            className="w-20 rounded border border-gray-300 px-2 py-1 text-xs" />
        )}
        <button disabled={!label.trim()} data-testid="ist-add-protocol"
          className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40"
          onClick={async () => {
            const row: Record<string, unknown> = {
              integration_id: integrationId, subject_kind: kind, subject_label: label.trim(), sort_order: count,
              condition_type: kind === 'condition' ? cond : null,
              equip_type_code: kind === 'point' ? (code.trim() || null) : null,
            }
            if (await onCreate(row)) { setLabel(''); setCode('') }
          }}>Add protocol</button>
      </div>
      <p className="text-[10px] leading-relaxed text-gray-400">{KIND_HELP[kind]}</p>
    </div>
  )
}
