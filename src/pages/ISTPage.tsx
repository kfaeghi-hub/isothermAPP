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
import { plainError } from '../lib/plainError'
import { ISTFieldMode } from './ISTFieldMode'

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
interface Prereq {
  id: string; item_no: number; category: string; description: string
  state: 'yes' | 'no' | 'na'; document_id: string | null; received_on: string | null
  evidence_reference: string | null
}

interface RegisterDoc { id: string; document_name: string; revision: string | null }
interface Session { id: string; test_date: string; test_type: string; description: string | null }
interface Generation { id: string; mode: string; generated_at: string; pdf_url: string | null; generated_by: string | null }

/**
 * THE TWO MODES, WITH THEIR PURPOSE ON THE CHOICE ITSELF.
 *
 * "Plan" and "Report" mean nothing to someone who has not read S1001. What they
 * need to know at the moment of choosing is WHEN each one is issued and WHAT is
 * in it — so that is what the button says, rather than a name plus a tooltip
 * nobody opens.
 */
const MODES = [
  { mode: 'plan' as const, title: 'IST Plan',
    blurb: 'Protocols and blank test forms, for issue before testing — team, contractors, AHJ review.' },
  { mode: 'report' as const, title: 'IST Report',
    blurb: 'Results, test log and executive summary, for issue after testing.' },
]

const TEST_TYPE_LABEL: Record<string, string> = {
  new: 'Initial', one_year: 'One-year', five_year: 'Five-year', modification: 'After modification',
}

/**
 * INTEGRATION STATUS, and why UNTESTED is the loud one.
 *
 * The matrix is tabular rather than a systems grid because an integration that
 * does not exist is not interesting — one that EXISTS AND WAS NOT TESTED is. So
 * the chip that has to be seen from across the room is `untested`, and it is the
 * only one carrying a filled amber treatment. Pass is quiet by design: a screen
 * that shouts about its good news trains people to stop reading it.
 *
 * `no protocols` is separated from `untested` deliberately. They look identical
 * in a count of results — both are zero — and they mean opposite things: one is
 * work not yet planned, the other is a plan not yet executed.
 */
type IntegrationStatus = 'no-protocols' | 'untested' | 'partial' | 'pass' | 'fail'

const STATUS_CHIP: Record<IntegrationStatus, { label: string; cls: string }> = {
  'fail':         { label: 'FAIL',        cls: 'bg-red-600 text-white' },
  'untested':     { label: 'UNTESTED',    cls: 'bg-amber-500 text-white' },
  'partial':      { label: 'PART TESTED', cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
  'no-protocols': { label: 'NO PROTOCOLS', cls: 'bg-gray-100 text-gray-500 border border-gray-300' },
  'pass':         { label: 'Pass',        cls: 'bg-gray-50 text-gray-500 border border-gray-200' },
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
  const [prereqs, setPrereqs] = useState<Prereq[]>([])
  const [docs, setDocs] = useState<RegisterDoc[]>([])
  const [results, setResults] = useState<{ protocol_id: string; normal_verdict: string | null; fire_verdict: string | null }[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [fieldSession, setFieldSession] = useState<Session | null>(null)
  const [generations, setGenerations] = useState<Generation[]>([])
  const [busy, setBusy] = useState<string | null>(null)
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
        const pids = (pr ?? []).map(x => x.id)
        const { data: rs } = pids.length
          ? await supabase.from('ist_results').select('protocol_id, normal_verdict, fire_verdict').in('protocol_id', pids)
          : { data: [] }
        setResults(rs ?? [])
      } else { setProtocols([]); setResults([]) }
      const { data: pq } = await supabase.from('ist_prerequisites')
        .select('id, item_no, category, description, state, document_id, received_on, evidence_reference')
        .eq('plan_id', active).order('item_no')
      setPrereqs(pq ?? [])
      const { data: ss } = await supabase.from('ist_sessions')
        .select('id, test_date, test_type, description').eq('plan_id', active).order('test_date')
      setSessions(ss ?? [])
      const { data: gens } = await supabase.from('ist_generations')
        .select('id, mode, generated_at, pdf_url, generated_by').eq('plan_id', active).order('generated_at', { ascending: false })
      setGenerations(gens ?? [])
      const { data: dr } = await supabase.from('documentation_register')
        .select('id, document_name, revision').eq('project_id', projectId).order('sort_order')
      setDocs(dr ?? [])
    } else { setSystems([]); setIntegrations([]); setProtocols([]); setPrereqs([]); setResults([]); setSessions([]); setGenerations([]) }
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
    if (error) { setErr(plainError((error as { message?: string })?.message ?? String(error))); return false }
    await load(); return true
  }

  const sysName = (id: string) => systems.find(s => s.id === id)?.label ?? '—'

  function statusOf(integrationId: string): IntegrationStatus {
    const mine = protocols.filter(p => p.integration_id === integrationId)
    if (mine.length === 0) return 'no-protocols'
    const rows = results.filter(r => mine.some(p => p.id === r.protocol_id))
    if (rows.some(r => r.normal_verdict === 'fail' || r.fire_verdict === 'fail')) return 'fail'
    // A protocol counts as tested only when BOTH modes carry a verdict: S1001
    // tests Normal AND Off-Normal, and half of that is not a tested integration.
    const tested = rows.filter(r => r.normal_verdict && r.fire_verdict).length
    if (tested === 0) return 'untested'
    return tested < mine.length ? 'partial' : 'pass'
  }

  const prereqDone = prereqs.filter(p => p.state !== 'na').length
  const activePlan = plans.find(p => p.id === planId) ?? null

  /**
   * MODE READINESS — offer, do not block, except where the document would be a
   * shell rather than a document.
   *
   * REPORT with no results is a legitimate thing to want: a dry run, a
   * partial-progress issue, a structure review before the test day. So it WARNS
   * and generates. The field decides.
   *
   * PLAN with no protocols is different in kind. There is nothing to test and
   * the attachment forms would be empty tables — not a partial document, an
   * empty shell. So it says what is missing instead of producing one.
   */
  function readiness(mode: 'plan' | 'report'): { blocked: boolean; message: string | null } {
    const withProtocols = integrations.filter(i => protocols.some(p => p.integration_id === i.id))
    if (mode === 'plan') {
      if (integrations.length === 0) return { blocked: true, message: 'No integrations yet — add at least one, with its protocols, before generating a plan.' }
      if (withProtocols.length === 0) return { blocked: true, message: 'No protocols on any integration yet — the test forms would be empty. Add protocols first.' }
      return { blocked: false, message: null }
    }
    const answered = results.filter(r => r.normal_verdict && r.fire_verdict).length
    if (sessions.length === 0) return { blocked: false, message: 'No test session recorded yet — this will generate a report with no results.' }
    if (answered === 0) return { blocked: false, message: 'No test results recorded yet — this will generate an empty results report.' }
    if (answered < protocols.length) return { blocked: false, message: `Partial: ${answered} of ${protocols.length} protocols have both modes recorded.` }
    return { blocked: false, message: null }
  }

  async function generate(mode: 'plan' | 'report') {
    if (!activePlan) return
    setErr(null); setBusy(mode)
    try {
      // RULE 4. An issued revision is frozen. Regenerating one produces the NEXT
      // revision — a full copy carrying its content and its recorded tests — and
      // the original keeps its documents exactly as issued.
      let targetId = activePlan.id
      if (activePlan.status === 'issued') {
        const next = nextRevisionLabel(plans.map(p => p.revision_label))
        const { data, error } = await supabase.rpc('ist_create_revision', {
          p_plan_id: activePlan.id, p_label: next,
          p_description: `Revised from ${activePlan.revision_label} for re-issue.`,
        })
        if (error) { setErr(plainError(error.message)); return }
        targetId = data as string
      }
      const { data: sess } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${sess.session?.access_token ?? ''}` },
        body: JSON.stringify({ document: 'ist', plan_id: targetId, mode }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(plainError(body?.error ?? `generation failed (${res.status})`)); return }
      await supabase.from('ist_plans').update({ status: 'issued' }).eq('id', targetId)
      await supabase.from('ist_generations').insert({
        plan_id: targetId, mode, storage_url: body.storage_url, pdf_url: body.pdf_url,
        generated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      setPlanId(targetId)
      await load()
    } finally { setBusy(null) }
  }

  // Field mode replaces the page rather than nesting inside it: on a phone, in a
  // fire command room, every pixel of chrome above the current protocol is a
  // pixel of the thing being recorded that is not on screen.
  if (fieldSession) {
    return <ISTFieldMode sessionId={fieldSession.id} sessionDate={fieldSession.test_date}
      onExit={() => { setFieldSession(null); void load() }} />
  }

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

      {planId && activePlan && (
        /* ── GENERATE ─────────────────────────────────────────────────────
           Directly under the plan revisions and ABOVE the working sections, so
           it is on screen the moment a plan is selected. The owner found this
           feature unfindable when it lived at the bottom; a door at the end of
           the corridor is a door nobody opens. */
        <section className="rounded-xl border border-gray-300 bg-white" data-testid="ist-generate">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h3 className="font-display text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Generate</h3>
              <span className="font-mono text-[10px] text-gray-400">Rev {activePlan.revision_label}</span>
              {activePlan.status === 'issued' && (
                <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">issued</span>
              )}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
              PDF and Word, into the project&rsquo;s documents. {activePlan.status === 'issued'
                ? <>This revision is issued and stays as issued — generating again creates the next revision.</>
                : <>The revision on the cover is part of the record.</>}
            </p>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {MODES.map(m => {
              const r = readiness(m.mode)
              return (
                <div key={m.mode} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs font-bold text-gray-900">{m.title}</div>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{m.blurb}</p>
                  {r.message && (
                    <p data-testid={`ist-gen-warn-${m.mode}`}
                      className={`mt-2 rounded px-2 py-1.5 text-[10px] leading-relaxed ${
                        r.blocked ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800'}`}>
                      {r.blocked ? '' : '⚠ '}{r.message}
                    </p>
                  )}
                  <button data-testid={`ist-generate-${m.mode}`}
                    disabled={r.blocked || busy !== null}
                    onClick={() => void generate(m.mode)}
                    className="mt-2 w-full rounded bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
                    {busy === m.mode ? 'Generating…' : `Generate ${m.title}`}
                  </button>
                </div>
              )
            })}
          </div>
          {generations.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3" data-testid="ist-gen-history">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Generated</div>
              <div className="mt-1.5 space-y-1">
                {generations.map(g => (
                  <div key={g.id} className="flex flex-wrap items-baseline gap-2 text-[11px]" data-testid="ist-gen-row">
                    <span className="font-medium text-gray-900">{g.mode === 'plan' ? 'IST Plan' : 'IST Report'}</span>
                    <span className="text-gray-500">{new Date(g.generated_at).toLocaleString()}</span>
                    <span className="ml-auto font-mono text-[10px] text-gray-400">Rev {activePlan.revision_label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

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
                      {(() => { const st = statusOf(i.id); return (
                        <span data-testid={`ist-status-${st}`} title={`Integration status: ${STATUS_CHIP[st].label}`}
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_CHIP[st].cls}`}>
                          {STATUS_CHIP[st].label}
                        </span>) })()}
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

          {/* ── test sessions ─────────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white" data-testid="ist-sessions">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-display text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Test sessions</h3>
              <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
                Initial, then one year, then every five — §11's life-cycle table. Open a session to record results
                in the field.
              </p>
            </div>
            <div className="p-4 space-y-2">
              {sessions.length === 0 && <p className="text-xs text-gray-400">No sessions yet.</p>}
              {sessions.map(ss => (
                <div key={ss.id} className="flex flex-wrap items-center gap-2 text-xs" data-testid="ist-session-row">
                  <span className="font-mono text-gray-900">{ss.test_date}</span>
                  <span className="text-gray-500">{TEST_TYPE_LABEL[ss.test_type] ?? ss.test_type}</span>
                  <span className="text-gray-400">{ss.description ?? ''}</span>
                  <button data-testid="ist-open-field"
                    className="ml-auto rounded bg-gray-900 px-3 py-1.5 text-[11px] text-white"
                    onClick={() => setFieldSession(ss)}>Field mode</button>
                </div>
              ))}
              <SessionForm onCreate={(date, type) => run(() =>
                supabase.from('ist_sessions').insert({ plan_id: planId, test_date: date, test_type: type }))} />
            </div>
          </section>

          {/* ── pre-IST prerequisites ─────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white" data-testid="ist-prereqs">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h3 className="font-display text-xs font-bold uppercase tracking-[0.08em] text-gray-900">Pre-IST documentation</h3>
                <span className="font-mono text-[10px] text-gray-400">{prereqDone}/{prereqs.length}</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
                §9.1 of the standard. <strong>YES names where its document is</strong> — a title and a location.
                Documents live in ShareSync; this records the reference, not a copy. Per-unit readiness stays the
                Cx Index's; these are the document prerequisites.
              </p>
            </div>
            <div className="p-4 space-y-2">
              {prereqs.length === 0 ? (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">Not seeded for this revision.</p>
                  <button data-testid="ist-seed-prereqs"
                    className="rounded bg-gray-900 px-3 py-1 text-xs text-white"
                    onClick={() => run(async () => await supabase.rpc('ist_seed_prerequisites', { p_plan_id: planId }))}>
                    Seed the standard 22
                  </button>
                </div>
              ) : prereqs.map(q => (
                <PrereqRow key={q.id} q={q} docs={docs}
                  onSet={patch => run(() => supabase.from('ist_prerequisites').update(patch).eq('id', q.id))} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/**
 * ONE PREREQUISITE ROW, AND THE ONE MOTION THAT MARKS IT RECEIVED.
 *
 * Tapping YES opens a single field — "Where is the supporting document?" — and
 * the status and the reference save TOGETHER, in one round trip. That matters
 * more than it looks: this gets ticked standing in a mechanical room, and a
 * two-step flow (set YES, get refused, find the note field, type, save again) is
 * a flow that gets abandoned. The constraint is never reached because the UI
 * never offers the state that would violate it.
 *
 * The register dropdown stays for the future/portal case, where a document
 * genuinely does live in the app. It is the second option, not the first,
 * because ShareSync is where the firm actually keeps documents.
 */
function PrereqRow({ q, docs, onSet }: {
  q: Prereq; docs: RegisterDoc[]; onSet: (patch: Record<string, unknown>) => Promise<boolean>
}) {
  const [asking, setAsking] = useState(false)
  const [ref, setRef] = useState(q.evidence_reference ?? '')
  const satisfied = !!q.document_id || !!(q.evidence_reference ?? '').trim()

  async function choose(next: string) {
    if (next !== 'yes') { await onSet({ state: next }); setAsking(false); return }
    if (satisfied) { await onSet({ state: 'yes' }); return }
    setAsking(true)                       // ask first, write once
  }
  async function commit() {
    const v = ref.trim()
    if (!v) return
    if (await onSet({ state: 'yes', evidence_reference: v, received_on: new Date().toISOString().slice(0, 10) }))
      setAsking(false)
  }

  return (
    <div className="text-[11px]" data-testid="ist-prereq-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 font-mono text-[10px] text-gray-400">{q.item_no}</span>
        <span className="min-w-[14rem] flex-1 text-gray-800">{q.description}</span>
        <select value={q.state} data-testid="ist-prereq-state"
          className="rounded border border-gray-300 px-1.5 py-1 text-[11px]"
          onChange={e => void choose(e.target.value)}>
          <option value="na">N/A</option><option value="no">NO</option><option value="yes">YES</option>
        </select>
      </div>

      {q.state === 'yes' && !asking && (
        <div className="ml-8 mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
          <span data-testid="ist-prereq-evidence">
            {q.evidence_reference
              ? q.evidence_reference
              : docs.find(d => d.id === q.document_id)?.document_name ?? '—'}
          </span>
          <button className="underline-offset-2 hover:underline" data-testid="ist-prereq-edit-evidence"
            onClick={() => { setRef(q.evidence_reference ?? ''); setAsking(true) }}>edit</button>
        </div>
      )}

      {asking && (
        <div className="ml-8 mt-1.5 space-y-1.5" data-testid="ist-prereq-ask">
          <label className="block text-[10px] font-medium text-gray-600">Where is the supporting document?</label>
          <div className="flex flex-wrap gap-2">
            <input autoFocus value={ref} onChange={e => setRef(e.target.value)} data-testid="ist-prereq-ref"
              onKeyDown={e => { if (e.key === 'Enter') void commit() }}
              placeholder="S537 Verification Cert — ShareSync /2.Bldg_Docs/5.Certs/"
              className="min-w-[16rem] flex-1 rounded border border-gray-300 px-2 py-1.5 text-[11px]" />
            <button disabled={!ref.trim()} data-testid="ist-prereq-save"
              className="rounded bg-gray-900 px-3 py-1.5 text-[11px] text-white disabled:opacity-40"
              onClick={() => void commit()}>Save</button>
            <button className="px-2 text-[11px] text-gray-500" data-testid="ist-prereq-cancel"
              onClick={() => setAsking(false)}>Cancel</button>
          </div>
          <p className="text-[10px] text-gray-400">
            A title and a location is enough. Documents live in ShareSync — this records <em>where</em>, not a copy.
          </p>
          {docs.length > 0 && (
            <select value={q.document_id ?? ''} data-testid="ist-prereq-doc"
              className="w-full rounded border border-gray-200 px-1.5 py-1 text-[10px] text-gray-500"
              onChange={async e => { if (await onSet({ state: 'yes', document_id: e.target.value || null })) setAsking(false) }}>
              <option value="">…or point at a document already in the register</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.document_name}{d.revision ? ` (${d.revision})` : ''}</option>)}
            </select>
          )}
        </div>
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

function SessionForm({ onCreate }: { onCreate: (date: string, type: string) => Promise<boolean> }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('new')
  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
      <input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="ist-session-date"
        className="rounded border border-gray-300 px-2 py-1 text-xs" />
      <select value={type} onChange={e => setType(e.target.value)} data-testid="ist-session-type"
        className="rounded border border-gray-300 px-2 py-1 text-xs">
        {Object.entries(TEST_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button data-testid="ist-add-session" className="rounded bg-gray-900 px-3 py-1 text-xs text-white"
        onClick={() => onCreate(date, type)}>Add session</button>
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

/**
 * Next revision label. Numeric where the existing ones are numeric — the firm
 * numbers revisions 0, 1, 2 — and suffixed otherwise.
 *
 * Deliberately dumb. A scheme that tried to be clever about "REV2a" would invent
 * a convention nobody asked for, and revision numbering on an issued engineering
 * document is not a place to be inventive.
 */
export function nextRevisionLabel(existing: string[]): string {
  const nums = existing
    .map(l => Number(String(l).match(/(\d+)\s*$/)?.[1] ?? NaN))
    .filter(n => !Number.isNaN(n))
  if (nums.length) return String(Math.max(...nums) + 1)
  return `${existing[existing.length - 1] ?? '0'}-rev`
}
