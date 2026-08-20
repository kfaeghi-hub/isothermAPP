// Cx Plan composer — the wizard.
//
// NO SCREEN ASKS FOR PROSE. Every question is a fact, a toggle or a choice; the
// narrative is drafted from those facts and reviewed before anything becomes a
// document. There is no auto-approval path anywhere in this file, and the server
// refuses generation on an unapproved plan regardless of what the UI allows.
import { useCallback, useEffect, useState } from 'react'
import { FileText, Check, ChevronRight, ChevronLeft, Download, Loader2 } from 'lucide-react'
import type { RichDoc } from '../lib/richText'
import { supabase } from '../lib/supabase'
import { reportError, reportWriteBlocked } from '../lib/mutationError'
import { useAuth } from '../contexts/AuthContext'
import { authedFetch } from '../lib/api'
import {
  SECTIONS, APPENDIX_MENU, OPTION_LABELS, narrativeKeys,
  fetchPlan, fetchRevisions, fetchSections, fetchAnswers,
  saveAnswer, saveBackground, saveRoleDesignation, createPlan,
  acceptSection, approvePlan, draftSection, generatePlan, DraftError, recordFeedback,
  type Flag,
  type CxPlan, type PlanSection, type Tier,
} from '../lib/cxPlan'
import { SectionReview } from '../components/cxplan/ReviewScreen'

const STEPS = ['Tier', 'Background', 'Systems', 'Options', 'Appendix', 'Draft', 'Review', 'Generate'] as const

export function CxPlanPage({ projectId, canApprove }: { projectId: string; canApprove: boolean }) {
  const { profile } = useAuth()
  const [plan, setPlan] = useState<CxPlan | null>(null)
  const [revisions, setRevisions] = useState<CxPlan[]>([])
  const [sections, setSections] = useState<PlanSection[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [project, setProject] = useState<any>(null)
  const [systems, setSystems] = useState<string[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [procLibrary, setProcLibrary] = useState<Record<string, string[]>>({})
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // A drafting failure is shown INLINE with its reason and a Retry, not as an
  // alert() with an OK button. "Nothing was saved" is only reassuring if the
  // next step is obvious.
  const [draftError, setDraftError] = useState<
    { section: string; message: string; reason?: string } | null>(null)

  const tier: Tier = (plan?.tier ?? 'standard')
  const options: Record<string, boolean> = JSON.parse(answers.options || '{}')
  const procedures: string[] = JSON.parse(answers.procedures || '[]')
  const appendices = JSON.parse(answers.appendices || '[]')

  const load = useCallback(async () => {
    const [p, revs, a, proj, eq, tm] = await Promise.all([
      fetchPlan(projectId), fetchRevisions(projectId), fetchAnswers(projectId),
      supabase.from('projects')
        .select('name, com_number, address, background_description, cx_role_designation, companies(name)')
        .eq('id', projectId).maybeSingle(),
      supabase.from('equipment').select('category').eq('project_id', projectId),
      supabase.from('project_team_assignments')
        .select('companies(name), contacts(name), company_role_types(name, abbreviation)')
        .eq('project_id', projectId),
    ])
    setPlan(p); setRevisions(revs); setAnswers(a); setProject(proj.data)
    setSystems([...new Set((eq.data ?? []).map((e: any) => e.category).filter(Boolean))] as string[])
    setTeam(tm.data ?? [])
    if (p) setSections(await fetchSections(p.id))
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  // The procedure library — file corpus is the base; DB rows add (D4 hybrid).
  useEffect(() => {
    supabase.from('firm_procedure_bullets').select('system_key, bullet')
      .eq('active', true).order('sort_order')
      .then(({ data }) => {
        const m: Record<string, string[]> = {}
        for (const r of data ?? []) (m[r.system_key] ??= []).push(r.bullet)
        setProcLibrary(m)
      })
  }, [])

  const put = async (key: string, value: unknown) => {
    setAnswers(a => ({ ...a, [key]: typeof value === 'string' ? value : JSON.stringify(value) }))
    const res = await saveAnswer(projectId, key, value)
    reportWriteBlocked(res as any, 'save answer')
  }

  const nKeys = narrativeKeys(tier, options)
  const byKey = Object.fromEntries(sections.map(s => [s.section_key, s]))
  const allAccepted = nKeys.length > 0 && nKeys.every(k => byKey[k]?.accepted)

  // Facts shown beside the prose in review. The SAME set the endpoint sends.
  const factsFor = () => {
    const f: Record<string, unknown> = {
      project_name: project?.name,
      location: project?.address,
      client: project?.companies?.name,
      cx_role: project?.cx_role_designation === 'CxP'
        ? 'Commissioning Provider (CxP)' : 'Commissioning Authority (CxA)',
      background: project?.background_description,
      systems, companies: [...new Set(team.map(t => t.companies?.name).filter(Boolean))],
      ...answers,
    }
    for (const k of Object.keys(f)) {
      const v = f[k]
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete f[k]
    }
    delete f.options; delete f.procedures; delete f.appendices
    return f
  }

  async function start(t: Tier) {
    setBusy('start')
    try {
      const { data, error } = await createPlan(projectId, t)
      if (error) { reportError(error, 'start a Cx Plan'); return }
      setPlan(data as CxPlan); setSections([]); setStep(1)
      if (!Object.keys(options).length) {
        await put('options', { training: true, coordination: true, schedule: false, ils: t === 'tender', tab: t === 'tender', qa: t === 'tender' })
      }
      await load()
    } finally { setBusy(null) }
  }

  async function draftOne(k: string, note?: string): Promise<boolean> {
    if (!plan) return false
    setBusy(`draft:${k}`)
    try {
      await draftSection(plan.id, k, note)
      setDraftError(null)
      return true
    } catch (e: unknown) {
      if (e instanceof DraftError) {
        setDraftError({ section: k, message: e.message, reason: e.reason })
      } else {
        reportError(e as Error, `draft ${k}`)
      }
      return false
    } finally {
      setBusy(null)
      setSections(await fetchSections(plan.id))
    }
  }

  async function draftAll() {
    if (!plan) return
    setDraftError(null)
    for (const k of nKeys) {
      // Stop at the first failure so the error names the section it belongs to,
      // rather than burying it under later sections that may also fail.
      if (!await draftOne(k)) { setStep(6); return }
    }
    setStep(6)
  }

  const redraft = (key: string, note?: string) => draftOne(key, note)

  async function accept(key: string, text: string, rich: RichDoc | null = null) {
    if (!plan) return
    const res = await acceptSection(plan.id, key, text, rich)
    if (reportWriteBlocked(res as any, 'accept section')) return

    // Ledger: accepted VERBATIM or accepted AFTER EDITING. The distinction is the
    // whole signal — a draft taken as written and a draft rewritten before use are
    // the difference between an agent that is working and one that is not, and
    // only the ledger can tell them apart later.
    const drafted = sections.find(x => x.section_key === key)?.drafted_text ?? ''
    if (drafted) {
      const edited = text.trim() !== drafted.trim()
      void recordFeedback({
        agentKey: 'writer', category: 'narrative-draft',
        projectId, subjectRef: key,
        disposition: edited ? 'edited' : 'accepted',
        before: drafted, after: edited ? text : null,
      })
    }
    setSections(await fetchSections(plan.id))
  }

  /** Verifier flags: a dismissed flag is as informative as a confirmed one, and
   *  more so in aggregate — a verifier that keeps raising something the CxA keeps
   *  waving off is telling you the corpus is wrong, not the reviewer. */
  function ruleOnFlag(key: string, flag: Flag, confirmed: boolean) {
    void recordFeedback({
      agentKey: 'verifier', category: 'factual-flag',
      projectId, subjectRef: `${key}:${flag.span.slice(0, 60)}`,
      disposition: confirmed ? 'confirmed' : 'dismissed',
      before: flag.why, evidence: { severity: flag.severity, claim: flag.claim },
    })
  }

  async function approveAndGenerate(issue: boolean) {
    if (!plan || !profile) return
    setBusy('generate')
    try {
      if (plan.status === 'draft') {
        const res = await approvePlan(plan.id, profile.id)
        if (reportWriteBlocked(res as any, 'approve the plan')) return
      }
      await generatePlan(plan.id, issue)
      await load(); setStep(7)
    } catch (e: any) { reportError(e, issue ? 'issue the plan' : 'generate the plan') }
    finally { setBusy(null) }
  }

  async function newRevision() {
    if (!plan) return
    setBusy('revise')
    try {
      const label = window.prompt('Revision label (optional) — e.g. Issued for Tender') ?? undefined
      const { data, error } = await createPlan(projectId, plan.tier, plan.revision_index + 1, label || undefined)
      if (error) { reportError(error, 'create a revision'); return }
      setPlan(data as CxPlan); setStep(5); await load()
    } finally { setBusy(null) }
  }

  const openFile = async (kind: 'docx' | 'pdf') => {
    if (!plan) return
    const w = window.open('about:blank', '_blank')
    try {
      const r = await authedFetch('/api/get-file-url', { table: 'cx_plans', id: plan.id, kind })
      const b = await r.json().catch(() => ({}))
      if (!r.ok || !b.url) throw new Error(b.error ?? 'Could not open the document.')
      if (w) w.location.href = b.url
    } catch (e: any) { w?.close(); reportError(e, 'open the document') }
  }

  if (loading) return <p className="text-sm text-gray-500 p-4">Loading…</p>

  // ── No plan yet ───────────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div className="max-w-2xl">
        <div className="card-tile bg-white rounded-xl border border-gray-200 p-6">
          <FileText size={20} strokeWidth={1.75} className="text-gray-400 mb-3" />
          <h3 className="font-display text-base font-bold text-gray-900">Compose the Cx Plan</h3>
          <p className="text-sm text-gray-500 mt-1.5 mb-4">
            The plan is assembled from this project's data and a short questionnaire.
            Nothing is generated until you approve every section.
          </p>
          <div className="flex gap-2">
            <button onClick={() => start('standard')} disabled={!!busy}
              className="text-sm px-3 py-2 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
              Standard plan
            </button>
            <button onClick={() => start('tender')} disabled={!!busy}
              className="text-sm px-3 py-2 rounded border border-gray-200 font-medium disabled:opacity-50">
              Tender plan
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-base font-bold text-gray-900">
            Cx Plan — Rev {plan.revision_index}
            {plan.revision_label ? ` · ${plan.revision_label}` : ''}
          </h3>
          <p className="text-xs text-gray-500 capitalize">
            {plan.tier} tier · {plan.status}
            {plan.issued_at ? ` · issued ${plan.issued_at.slice(0, 10)}` : ''}
          </p>
        </div>
        {plan.storage_url && (
          <div className="flex gap-2">
            <button onClick={() => openFile('pdf')}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-200">
              <Download size={13} strokeWidth={1.75} /> PDF
            </button>
            <button onClick={() => openFile('docx')}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-200">
              <Download size={13} strokeWidth={1.75} /> .docx
            </button>
          </div>
        )}
      </div>

      {/* ── Step rail ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-wrap text-[11px]">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            className={`px-2 py-1 rounded ${i === step
              ? 'bg-standard-600 text-white font-semibold'
              : 'text-gray-500 hover:bg-gray-100'}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="card-tile bg-white rounded-xl border border-gray-200 p-4">
        {/* 1 · TIER */}
        {step === 0 && (
          <Screen title="Tier" hint="The tender tier adds execution procedures, life-safety testing, TAB, schedule and quality assurance.">
            <div className="flex gap-2 mb-4">
              {(['standard', 'tender'] as Tier[]).map(t => (
                <button key={t} disabled
                  className={`text-xs px-3 py-1.5 rounded border capitalize ${
                    tier === t ? 'bg-standard-600 border-standard-600 text-white' : 'border-gray-200 text-gray-400'}`}>
                  {t}
                </button>
              ))}
              <span className="text-[11px] text-gray-500 self-center">
                Tier is fixed for a revision. Start a new revision to change it.
              </span>
            </div>
            <Field label="Isotherm's role on this project">
              <div className="flex gap-2">
                {(['CxA', 'CxP'] as const).map(d => (
                  <button key={d} onClick={async () => {
                      const res = await saveRoleDesignation(projectId, d)
                      if (!reportWriteBlocked(res as any, 'set the role')) load()
                    }}
                    className={`text-xs px-3 py-1.5 rounded border ${
                      project?.cx_role_designation === d
                        ? 'bg-standard-600 border-standard-600 text-white'
                        : 'border-gray-200 text-gray-600'}`}>
                    {d === 'CxA' ? 'Commissioning Authority (CxA)' : 'Commissioning Provider (CxP)'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                "Commissioning Agent" is retired — see the firm terminology record.
              </p>
            </Field>
          </Screen>
        )}

        {/* 2 · BACKGROUND */}
        {step === 1 && (
          <Screen title="Background facts" hint="One line each. These are facts, not prose — the narrative is drafted from them.">
            <Field label="What is being built, where, and why now">
              <textarea rows={4} defaultValue={project?.background_description ?? ''}
                onBlur={async e => {
                  const res = await saveBackground(projectId, e.target.value)
                  if (!reportWriteBlocked(res as any, 'save the background')) load()
                }}
                className="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:border-standard-600" />
              <p className="text-[11px] text-gray-500 mt-1">
                Saved on the project, not on this plan — the portal and future reports use the same text.
              </p>
            </Field>
            <Field label="Scope phrase (completes “…for the commissioning of …”)">
              <input defaultValue={answers.scope ?? ''} onBlur={e => put('scope', e.target.value)}
                placeholder="new HVAC and mechanical systems in the central plant"
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-standard-600" />
            </Field>
          </Screen>
        )}

        {/* 3 · SYSTEMS & PROCEDURES */}
        {step === 2 && (
          <Screen title="Systems and procedures" hint="Systems come from the equipment register. Procedure bullets are pre-selected per system and toggleable.">
            <p className="text-xs text-gray-500 mb-2">
              {systems.length
                ? <>On the register: <span className="text-gray-800">{systems.join(', ')}</span></>
                : 'No equipment on the register yet — the systems sentence will be omitted.'}
            </p>
            {Object.entries(procLibrary).length === 0 && (
              <p className="text-[11px] text-gray-500">
                No admin-added procedure bullets. The file corpus supplies the defaults at draft time.
              </p>
            )}
            {Object.entries(procLibrary).map(([sys, bullets]) => (
              <div key={sys} className="mb-3">
                <p className="text-[11px] font-semibold text-gray-600 mb-1">{sys}</p>
                {bullets.map(b => (
                  <label key={b} className="flex items-start gap-2 text-xs text-gray-700 py-0.5">
                    <input type="checkbox" checked={procedures.includes(b)}
                      onChange={e => put('procedures', e.target.checked
                        ? [...procedures, b] : procedures.filter(x => x !== b))}
                      className="mt-0.5" />
                    {b}
                  </label>
                ))}
              </div>
            ))}
          </Screen>
        )}

        {/* 4 · OPTIONS */}
        {step === 3 && (
          <Screen title="Optional sections" hint="Include only what this project actually covers. An omitted section is a deliberate choice.">
            {Object.entries(OPTION_LABELS).map(([k, label]) => {
              const tenderOnly = ['ils', 'tab', 'qa', 'schedule'].includes(k)
              if (tenderOnly && tier !== 'tender') return null
              return (
                <label key={k} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                  <input type="checkbox" checked={!!options[k]}
                    onChange={e => put('options', { ...options, [k]: e.target.checked })} />
                  {label}
                </label>
              )
            })}
          </Screen>
        )}

        {/* 5 · APPENDIX */}
        {step === 4 && (
          <Screen title="Appendices" hint="Each renders as a titled reference to the living record. The register is maintained live and is never embedded stale.">
            {APPENDIX_MENU.map(a => {
              const on = appendices.some((x: any) => x.letter === a.letter)
              return (
                <label key={a.letter} className="flex items-start gap-2 text-sm text-gray-700 py-1">
                  <input type="checkbox" checked={on} className="mt-1"
                    onChange={e => put('appendices', e.target.checked
                      ? [...appendices, { letter: a.letter, title: a.title, reference: a.reference }]
                      : appendices.filter((x: any) => x.letter !== a.letter))} />
                  <span>
                    <span className="text-gray-900">Appendix {a.letter} — {a.title}</span>
                    {a.live && <span className="ml-1.5 text-[9px] font-bold text-green-700 bg-green-50 rounded px-1 py-0.5">LIVE RECORD</span>}
                    <span className="block text-[11px] text-gray-500">{a.reference}</span>
                  </span>
                </label>
              )
            })}
          </Screen>
        )}

        {/* 6 · DRAFT */}
        {step === 5 && (
          <Screen title="Draft the narrative sections" hint="Each section is drafted, then checked by a second pass that flags claims the facts do not support.">
            <p className="text-xs text-gray-500 mb-3">
              {nKeys.length} narrative section{nKeys.length === 1 ? '' : 's'}: {nKeys.join(', ')}.
              Everything else is assembled from project data and does not involve the model.
            </p>
            <button onClick={draftAll} disabled={!!busy || plan.status === 'issued'}
              className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
              {busy?.startsWith('draft') ? <Loader2 size={14} className="animate-spin" /> : null}
              {busy?.startsWith('draft') ? `Drafting ${busy.split(':')[1]}…` : 'Draft all sections'}
            </button>
          </Screen>
        )}

        {draftError && (
          <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200">
            <p className="text-sm font-semibold text-red-800">
              Couldn't draft {SECTIONS.find(s => s.key === draftError.section)?.title ?? draftError.section}
            </p>
            <p className="text-xs text-red-700 mt-1">{draftError.message}</p>
            {draftError.reason === 'truncated' && (
              <p className="text-[11px] text-red-700 mt-1">
                This section produced more text than its length budget allows. Retrying
                usually works; if it keeps happening the section has too many facts.
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <button onClick={() => draftOne(draftError.section)} disabled={!!busy}
                className="text-xs px-3 py-1.5 rounded bg-red-600 text-white font-medium disabled:opacity-50">
                {busy ? 'Retrying…' : 'Retry this section'}
              </button>
              <button onClick={() => setDraftError(null)}
                className="text-xs px-2 py-1.5 text-red-700">Dismiss</button>
            </div>
          </div>
        )}

        {/* 7 · REVIEW */}
        {step === 6 && (
          <Screen title="Review" hint="Facts beside prose. Accept each section, or redraft it with a note.">
            <div className="space-y-3">
              {nKeys.map(k => (
                <SectionReview key={k}
                  title={SECTIONS.find(s => s.key === k)?.title ?? k}
                  section={byKey[k]} facts={factsFor()}
                  busy={busy === `draft:${k}`}
                  onAccept={(t, rich) => accept(k, t, rich)}
                  onRuleOnFlag={(f, ok) => ruleOnFlag(k, f, ok)}
                  onRegenerate={note => redraft(k, note)} />
              ))}
            </div>
          </Screen>
        )}

        {/* 8 · GENERATE */}
        {step === 7 && (
          <Screen title="Approve and generate" hint="No draft becomes a document without approval.">
            <p className="text-sm text-gray-700 mb-3">
              {allAccepted
                ? 'Every narrative section has been accepted.'
                : `${nKeys.filter(k => !byKey[k]?.accepted).length} section(s) still need accepting.`}
            </p>
            {!canApprove && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mb-3">
                Only an owner or lead of this project can approve and issue.
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => approveAndGenerate(false)}
                disabled={!allAccepted || !canApprove || !!busy || plan.status === 'issued'}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
                {busy === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
                Approve &amp; generate draft
              </button>
              <button onClick={() => approveAndGenerate(true)}
                disabled={!allAccepted || !canApprove || !!busy || plan.status === 'issued'}
                className="text-sm px-3 py-2 rounded border border-gray-200 font-medium disabled:opacity-50">
                Issue this revision
              </button>
              {plan.status === 'issued' && (
                <button onClick={newRevision} disabled={!!busy}
                  className="text-sm px-3 py-2 rounded border border-gray-200 font-medium">
                  Start Rev {plan.revision_index + 1}
                </button>
              )}
            </div>
            {plan.status === 'issued' && (
              <p className="text-[11px] text-gray-500 mt-3">
                This revision is issued and frozen. Its questionnaire answers, drafts and edits
                are snapshotted alongside the file.
              </p>
            )}
          </Screen>
        )}

        {/* Step nav */}
        <div className="flex justify-between mt-4 pt-3 border-t border-gray-100">
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="inline-flex items-center gap-1 text-xs text-gray-500 disabled:opacity-30">
            <ChevronLeft size={13} /> Back
          </button>
          <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}
            className="inline-flex items-center gap-1 text-xs text-standard-600 disabled:opacity-30">
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── Revisions ──────────────────────────────────────────────────── */}
      {revisions.length > 1 && (
        <div className="card-tile bg-white rounded-xl border border-gray-200 p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Revisions</h4>
          <ul className="space-y-1 text-sm">
            {revisions.map(r => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="text-gray-800">Rev {r.revision_index}</span>
                {r.revision_label && <span className="text-gray-500">· {r.revision_label}</span>}
                <span className="text-[10px] uppercase text-gray-400">{r.status}</span>
                {r.issued_at && <span className="text-[11px] text-gray-400 ml-auto">{r.issued_at.slice(0, 10)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Screen({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">{hint}</p>
      {children}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
