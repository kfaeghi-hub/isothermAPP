// Intake review — the staged rows, for a human to dispose of.
//
// FOUR BLOCKS, AND THE ORDER IS THE ARGUMENT — the same shape as the
// applicability ratification screen, for the same reason:
//
//   1. DUPLICATE   — two rows of this upload claim one tag. Never bulk-accepted.
//   2. ENRICH      — the tag already exists. This is the only block that can
//                    touch a record someone already wrote, so it is read one at
//                    a time with the diff shown, and never bulk-accepted.
//   3. NEEDS A LOOK — low confidence or a type outside the firm vocabulary,
//                    lowest confidence first: the ones most likely to be wrong
//                    are the ones you read.
//   4. CLEAN       — one click settles the body. A 200-row schedule is a
//                    two-minute review because this block is where the volume is.
//
// ACCEPTING IS A DECISION, NOT A WRITE. Disposition lands on the staged row;
// equipment is created by the approval step, from accepted rows only. Law 2.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { recordFeedback } from '../../lib/cxPlan'
import { TypePicker } from '../equipment/TypePicker'
import { loadTypeVocabulary } from '../../lib/typeVocabulary'
import { authedFetch } from '../../lib/api'

// ── Provenance shapes, as the 5a pipeline stages them (reconcile.ts) ─────────
// Legacy rows (pre-pipeline uploads) carry NULL in all five columns and render
// exactly as they always did — the provenance surface only exists where
// provenance does. Widened, not replaced (5b).
interface FieldClaim { rules: string | null; model: string | null; from: 'rules' | 'model' | 'both'; agreed: boolean }
interface Disagreement { tag: string; kind: string; field: string; rules: string | null; model: string | null; note: string }
interface Ambiguity { about: string; question: string; where?: string }
interface Verification {
  ran: boolean
  ok?: boolean
  failure?: string
  flags?: { row?: string; field?: string; note: string }[]
}

interface Row {
  id: string
  source_sheet: string | null
  source_page: number | null
  source_row: number | null
  tag: string | null
  descriptor: string | null
  proposed_category: string | null
  proposed_type: string | null
  observed_type_name: string | null
  location: string | null
  area_served: string | null
  nameplate: Record<string, string> | null
  confidence: number | null
  match_equipment_id: string | null
  duplicate_of: string | null
  disposition: string
  edited: Record<string, string | null> | null
  created_equipment_id: string | null
  // 5b — the provenance columns. All null on legacy uploads.
  read_via: 'rules' | 'model' | 'both' | null
  claims: Record<string, FieldClaim> | null
  disagreements: Disagreement[] | null
  questions: Ambiguity[] | null
  verification: Verification | null
}

interface Existing {
  id: string; tag: string; descriptor: string | null
  equipment_type: string | null; location: string | null; area_served: string | null
}

const CLEAN_AT = 0.85

export function IntakeReview({ uploadId, projectId, onClose, onApplied }: {
  uploadId: string; projectId: string; onClose: () => void; onApplied?: () => void
}) {
  const [rows, setRows]   = useState<Row[]>([])
  const [sheetQuestions, setSheetQuestions] = useState<Ambiguity[]>([])
  const [upload, setUpload] = useState<{ filename: string; kind: string; parse_note: string | null } | null>(null)
  const [existing, setExisting] = useState<Map<string, Existing>>(new Map())
  const [vocab, setVocab] = useState<{ key: string; name: string }[]>([])
  const [busy, setBusy]   = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [picks, setPicks] = useState<Map<string, Set<string>>>(new Map())
  const [result, setResult] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [{ data: u }, { data: r }, { data: q }, t] = await Promise.all([
      supabase.from('intake_uploads').select('filename, kind, parse_note').eq('id', uploadId).maybeSingle(),
      supabase.from('intake_rows').select('*').eq('upload_id', uploadId)
        .order('confidence', { ascending: true }).order('source_row'),
      // Sheet-level questions are ROWS OF THEIR OWN since the Phase 6
      // normalization — stored once per (sheet, question), read directly. The
      // render-side dedupe this replaces existed because the 5a orchestrator
      // staged the sheet's whole list onto every row.
      supabase.from('intake_sheet_questions').select('source_sheet, about, question')
        .eq('upload_id', uploadId).order('source_sheet'),
      // The SAME vocabulary loader the Cx Index and inline editor use, aliases
      // included. Three surfaces reading the vocabulary three ways is how the
      // import path and the typing path drift apart.
      loadTypeVocabulary(),
    ])
    setUpload(u ?? null)
    setSheetQuestions((q ?? []) as Ambiguity[])
    setVocab(t)
    const list = (r ?? []) as Row[]
    setRows(list)

    const ids = [...new Set(list.map(x => x.match_equipment_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: eq } = await supabase.from('equipment')
        .select('id, tag, descriptor, equipment_type, location, area_served').in('id', ids)
      setExisting(new Map((eq ?? []).map(e => [e.id, e as Existing])))
    } else setExisting(new Map())
  }, [uploadId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  /** The Excel path has no agent, so there is nothing to credit or correct. Only
   *  extractor-sourced rows feed the ledger — recording a deterministic parse as
   *  agent feedback would pollute the track record the promotion rule reads. */
  const fromAgent = upload?.kind === 'pdf' || upload?.kind === 'image'

  async function dispose(row: Row, disposition: 'accepted' | 'rejected' | 'edited',
                         edited?: Record<string, string | null>) {
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('intake_rows').update({
        disposition, edited: edited ?? null,
        resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(),
      }).eq('id', row.id)
      if (error) { alert(error.message); return }

      if (fromAgent) {
        // THE CATEGORY IS THE ONE THE CONTRACT DECLARES, not a name invented at
        // the call site. extractor.md declares register-row / enrich-proposal /
        // type-proposal, and the ledger is keyed per category so each earns its
        // own track record — a row that proposed a NEW TYPE is a different kind
        // of claim from one that filled in a location, and lumping them would
        // make the acceptance rate mean nothing.
        const category = row.match_equipment_id ? 'enrich-proposal'
                       : !row.proposed_type     ? 'type-proposal'
                       : 'register-row'
        void recordFeedback({
          agentKey: 'extractor', category, projectId,
          subjectRef: `${row.tag ?? '?'}:${row.source_page ?? row.source_row ?? '?'}`,
          disposition: disposition === 'edited' ? 'edited' : disposition,
          before: row.descriptor, after: edited ? JSON.stringify(edited) : null,
          evidence: { confidence: row.confidence },
        })
      }
      await fetchAll()
    } finally { setBusy(false) }
  }

  /** The questions on THIS row. Since the Phase 6 normalization a row carries
   *  only what the pipeline attributed to it (`where` names its tag); sheet-
   *  level questions live in intake_sheet_questions and render once, above.
   *  Deliberately unfiltered: if an old-shape row ever surfaces, its questions
   *  render repeated rather than vanish — the safe failure direction. */
  const rowQuestions = (r: Row): Ambiguity[] => r.questions ?? []

  /** True when the readers left something a human has not seen yet: a
   *  disagreement between the legs, or a question attributed to the row. */
  const carriesUnseen = (r: Row) =>
    (r.disagreements?.length ?? 0) > 0 || rowQuestions(r).length > 0

  /** A row the readers disagree about at the TYPE level. Ruled 2026-08-13: such
   *  a row has no unnamed accept — accepting it always names which reading was
   *  taken, through the offer buttons' edited-disposition path. A generic
   *  Accept here could record a resolution without naming a reading, which is
   *  the swallow the clean gate exists to prevent, one level down. */
  const hasTypeConflict = (r: Row) =>
    (r.disagreements ?? []).some(d => d.kind === 'type-conflict')

  const pending  = rows.filter(r => r.disposition === 'pending')
  const dupes    = pending.filter(r => r.duplicate_of)
  const enrich   = pending.filter(r => !r.duplicate_of && r.match_equipment_id)
  // CONSERVATIVE GATING (5b, flagged as a product call): a row the readers
  // disagreed on, or asked about, is NOT clean regardless of its confidence —
  // one-click Accept would swallow the disagreement or the question unread.
  // Type-conflicts already sit below CLEAN_AT via the 0.8 cap; this extends the
  // same instinct to value disagreements and attributed questions.
  const looks    = pending.filter(r => !r.duplicate_of && !r.match_equipment_id &&
                                       ((r.confidence ?? 0) < CLEAN_AT || !r.proposed_type || carriesUnseen(r)))
  const clean    = pending.filter(r => !r.duplicate_of && !r.match_equipment_id &&
                                       (r.confidence ?? 0) >= CLEAN_AT && !!r.proposed_type && !carriesUnseen(r))

  const settled  = rows.length - pending.length
  // Only rows that were RULED ON and have not already been written. A row
  // carrying created_equipment_id is done; offering to write it again would be
  // offering an action with no effect.
  const approvable = rows.filter(r =>
    ['accepted', 'edited'].includes(r.disposition) && !r.created_equipment_id).length

  /** Clean rows whose verification pass did not run. Unverified is NOT unsound
   *  (ruled 2026-08-13) — they stay bulk-acceptable — but the count is SAID on
   *  the button and in the confirm, so taking them unverified is a sighted act. */
  const cleanUnverified = clean.filter(r => r.verification && !r.verification.ran).length

  async function acceptClean() {
    if (!clean.length) return
    if (!window.confirm(
      `Accept all ${clean.length} clean rows?\n\n` +
      `These are new units with a known type and confidence at or above ${CLEAN_AT}.` +
      (cleanUnverified
        ? `\n${cleanUnverified} of them ${cleanUnverified === 1 ? 'is' : 'are'} UNVERIFIED — the second-pass ` +
          `check did not run (an outage, not a data problem). Accepting takes ${cleanUnverified === 1 ? 'it' : 'them'} as read once.`
        : '') + `\n\n` +
      `NOT included: ${enrich.length} that change existing equipment, ` +
      `${dupes.length} repeated tag${dupes.length === 1 ? '' : 's'}, and ` +
      `${looks.length} needing a look — those are ruled one at a time.`)) return
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('intake_rows').update({
        disposition: 'accepted', resolved_by: user?.id ?? null,
        resolved_at: new Date().toISOString(),
      }).in('id', clean.map(r => r.id))
      if (error) { alert(error.message); return }
      await fetchAll()
    } finally { setBusy(false) }
  }

  /**
   * THE ONLY STEP THAT WRITES TO THE RECORD. Everything above it decided; this
   * performs. It is deliberately a separate, named act rather than a side effect
   * of the last Accept — a reviewer should be able to rule on 200 rows, walk
   * away, and come back before anything becomes equipment.
   */
  async function approve() {
    const ready = rows.filter(r => ['accepted', 'edited'].includes(r.disposition))
    if (!ready.length) return
    if (!window.confirm(
      `Write ${ready.length} approved row(s) to the equipment register?\n\n` +
      (pending.length
        ? `${pending.length} row(s) are still undecided and will be left for later.\n\n`
        : '') +
      `New units are created; enrich rows change only the fields you ticked. ` +
      `Ratified applicability rules are applied so the index shows honest ` +
      `denominators straight away.`)) return
    setBusy(true); setResult(null)
    try {
      const res = await authedFetch('/api/intake', { upload_id: uploadId, action: 'approve' })
      const body = await res.json().catch(() => null)
      if (!res.ok) { alert(body?.error ?? `Approval failed (${res.status})`); return }
      setResult(
        body.note ??
        `${body.created} created · ${body.enriched} enriched` +
        (body.queued_types ? ` · ${body.queued_types} type name(s) queued for ratification` : '') +
        (body.still_pending ? ` · ${body.still_pending} still undecided` : ''))
      await fetchAll(); onApplied?.()
    } finally { setBusy(false) }
  }

  function startEdit(r: Row) {
    setEditing(r.id)
    setDraft({
      tag: r.tag ?? '', descriptor: r.descriptor ?? '',
      proposed_type: r.proposed_type ?? '', location: r.location ?? '',
      area_served: r.area_served ?? '',
      observed_type_name: r.proposed_type ? '' : (r.observed_type_name ?? ''),
      type_text: r.proposed_type
        ? (vocab.find(v => v.key === r.proposed_type)?.name ?? r.proposed_type)
        : (r.observed_type_name ?? ''),
    })
  }

  const typeName = (k: string | null) => vocab.find(v => v.key === k)?.name ?? k

  /** Which intake column each diff line reads from, for writing `edited`. */
  const FIELD_COL = {
    descriptor: 'descriptor', type: 'proposed_type',
    location: 'location', area_served: 'area_served',
  } as const
  type DiffField = keyof typeof FIELD_COL

  /**
   * The diff a reviewer needs, SPLIT BY WHAT IT WOULD COST.
   *
   *   add     — the existing field is empty. Purely additive, nothing at risk.
   *   replace — the field holds a value someone put there, and the schedule
   *             disagrees with it.
   *
   * The split is not cosmetic. On the first real render this diff read
   * "descriptor: ZZ seeded pump → PUMP" — a specific, human-written descriptor
   * about to be replaced by a schedule's generic one, under a single Accept
   * button that took the whole row. That is overwriting with a preview attached,
   * not the never-overwrite standard it claimed to be.
   *
   * So `add` is ticked by default and `replace` is not. Taking a replacement is
   * an act, and the reviewer performs it.
   */
  function diffFor(r: Row): { field: DiffField; from: string; to: string; kind: 'add' | 'replace' }[] {
    const e = r.match_equipment_id ? existing.get(r.match_equipment_id) : undefined
    if (!e) return []
    const pairs: [DiffField, string | null, string | null][] = [
      ['descriptor', e.descriptor, r.descriptor],
      ['type', e.equipment_type, r.proposed_type],
      ['location', e.location, r.location],
      ['area_served', e.area_served, r.area_served],
    ]
    return pairs
      // A blank proposal is not a proposal to blank the field. Enrichment never
      // clears something a human wrote.
      .filter(([, from, to]) => to && to !== from)
      .map(([field, from, to]) => ({
        field, from: from || '—', to: to as string,
        kind: (from ? 'replace' : 'add') as 'add' | 'replace',
      }))
  }

  /** Default selection: everything additive, nothing that replaces. */
  function defaultPicks(r: Row): Set<string> {
    return new Set(diffFor(r).filter(d => d.kind === 'add').map(d => d.field as string))
  }

  function togglePick(rowId: string, field: string, r: Row) {
    setPicks(p => {
      const next = new Map(p)
      const cur = new Set(next.get(rowId) ?? defaultPicks(r))
      if (cur.has(field)) cur.delete(field); else cur.add(field)
      next.set(rowId, cur)
      return next
    })
  }

  async function acceptEnrich(r: Row) {
    const diff = diffFor(r)
    const chosen = picks.get(r.id) ?? defaultPicks(r)
    const edited: Record<string, string | null> = {}
    for (const d of diff) if (chosen.has(d.field as string)) edited[FIELD_COL[d.field]] = d.to

    if (Object.keys(edited).length === 0) {
      // Nothing selected is a real decision: "this row adds nothing I want".
      // Recording it as accepted would claim a change that will never happen, so
      // it is a rejection — and the reviewer is told that is what it becomes.
      if (!window.confirm(
        `Nothing is selected on ${r.tag ?? 'this row'}, so accepting would change nothing.\n\n` +
        `Record it as rejected instead?`)) return
      await dispose(r, 'rejected')
      return
    }
    // Took everything proposed = accepted. Took a subset = edited. The ledger
    // needs that distinction, or the extractor's acceptance rate overstates it.
    await dispose(r, Object.keys(edited).length === diff.length ? 'accepted' : 'edited', edited)
  }

  /** The leg that read this row, as a compact chip. Null read_via = a legacy
   *  upload from before the two-reader pipeline; no chip, nothing implied. */
  const LegChip = ({ r }: { r: Row }) => {
    if (!r.read_via) return null
    const leg = r.read_via
    const label = leg === 'both' ? 'both readers' : leg === 'rules' ? 'rules only' : 'model only'
    const title = leg === 'both'
      ? 'The deterministic parser and the model both read this row.'
      : leg === 'rules'
        ? 'Only the deterministic parser returned this row — the model did not.'
        : 'Only the model returned this row — the deterministic parser did not.'
    return (
      <span title={title}
        className={`text-[9px] rounded px-1 py-0.5 shrink-0 ${
          leg === 'both' ? 'bg-teal-50 text-teal-700' : 'bg-sky-50 text-sky-700'}`}>
        {label}
      </span>
    )
  }

  /** Verification state, only where verification exists (5a uploads). A run
   *  that DID NOT RUN is shown as exactly that — never as a quiet pass. */
  const VerifyChip = ({ r }: { r: Row }) => {
    const v = r.verification
    if (!v) return null
    if (!v.ran) return (
      <span title={`The verification pass did not run (${v.failure ?? 'unknown'}). The row is unverified, not unsound.`}
        className="text-[9px] rounded px-1 py-0.5 bg-gray-100 text-gray-500 shrink-0">unverified</span>
    )
    const rowFlags = (v.flags ?? []).filter(f => !f.row || (r.tag && f.row.toUpperCase() === r.tag.toUpperCase()))
    if (rowFlags.length) return (
      <span title={rowFlags.map(f => `${f.field ? f.field + ': ' : ''}${f.note}`).join('\n')}
        className="text-[9px] rounded px-1 py-0.5 bg-amber-100 text-amber-900 shrink-0">
        ⚑ {rowFlags.length} flag{rowFlags.length === 1 ? '' : 's'}
      </span>
    )
    return null // verified-clean earns silence, not a badge on every row
  }

  // RENDER HELPERS, CALLED AS FUNCTIONS — NEVER AS <Components>. Defined inside
  // the component they close over state; used as JSX components their function
  // identity changes EVERY RENDER, so React sees a new element type and
  // REMOUNTS the subtree — which drops focus from whatever input the user is
  // typing in and resets the type-picker's open state, one keystroke at a
  // time. Found by the harvest replay: the sighted disposition typed "Pump"
  // and the field kept exactly "P". Function-call usage keeps the tree's
  // element types stable (div/input/Combobox), so nothing remounts.
  const Line = ({ r, showDiff }: { r: Row; showDiff?: boolean }) => {
    const diff = showDiff ? diffFor(r) : []
    const isEditing = editing === r.id
    return (
      <div className="border-b border-gray-100 py-1.5">
        <div className="flex items-start gap-2">
          <span className={`text-[10px] shrink-0 w-8 text-right ${
            (r.confidence ?? 1) < 0.7 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
            {r.confidence == null ? '—' : r.confidence.toFixed(2)}
          </span>
          <span className="text-[10px] text-gray-300 shrink-0 font-mono w-20 truncate">
            {r.source_sheet ?? (r.source_page ? `p${r.source_page}` : '')}
            {r.source_row ? ` r${r.source_row}` : ''}
          </span>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="flex flex-wrap gap-1.5">
                {(['tag', 'descriptor', 'location', 'area_served'] as const).map(f => (
                  <input key={f} value={draft[f] ?? ''} placeholder={f}
                    onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))}
                    className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-32" />
                ))}
                <TypePicker
                  value={draft.proposed_type ?? ''}
                  observedName={draft.observed_type_name || null}
                  text={draft.type_text ?? ''}
                  onText={v => setDraft(d => ({ ...d, type_text: v, proposed_type: '', observed_type_name: '' }))}
                  vocab={vocab}
                  onPick={r => setDraft(d => ({
                    ...d,
                    proposed_type: r.key ?? '',
                    observed_type_name: r.observedName ?? '',
                    type_text: r.key ? (vocab.find(t => t.key === r.key)?.name ?? r.key) : (r.observedName ?? ''),
                  }))}
                  wrapperClassName="w-40"
                  className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-0.5"
                  ariaLabel="Row type" />

                {/* ── What each reader actually wrote, while the editor decides.
                       Only fields where a reader produced something; agreed
                       fields say so once instead of repeating the value. ── */}
                {r.claims && (
                  <div className="w-full mt-1 text-[10px] text-gray-500 space-y-0.5">
                    {Object.entries(r.claims)
                      .filter(([, c]) => c.rules != null || c.model != null)
                      .map(([field, c]) => (
                        <p key={field}>
                          <span className="text-gray-400">{field.replace('_', ' ')} —</span>{' '}
                          {c.agreed ? (
                            <>both readers: <span className="font-mono text-gray-600">{c.rules}</span></>
                          ) : (
                            <>
                              rules: <span className="font-mono text-gray-600">{c.rules ?? '—'}</span>
                              <span className="mx-1 text-gray-300">·</span>
                              model: <span className="font-mono text-gray-600">{c.model ?? '—'}</span>
                            </>
                          )}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-800">
                <span className="font-mono text-gray-700">{r.tag ?? '—'}</span>
                {r.descriptor && <span className="text-gray-500"> · {r.descriptor}</span>}
                {r.proposed_type ? (
                  <span className="ml-2 text-[10px] text-teal-800 bg-teal-50 rounded px-1.5 py-0.5">
                    {typeName(r.proposed_type)}
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] text-gray-700 bg-gray-100 rounded px-1.5 py-0.5"
                        title="Accepting queues this name for the type vocabulary; it never mints one silently.">
                    unknown type{r.observed_type_name ? ` — "${r.observed_type_name}"` : ''}
                  </span>
                )}
                {r.location && <span className="text-[10px] text-gray-400 ml-1.5">{r.location}</span>}
                <span className="ml-1.5 inline-flex gap-1 align-middle">
                  {LegChip({ r })}
                  {VerifyChip({ r })}
                </span>
              </div>
            )}

            {/* ── What the readers disagreed on, per Phase 3: offered, never asserted.
                   Rendered inline, not behind a toggle — a disagreement a click can
                   hide is a disagreement that goes unread. ── */}
            {!isEditing && (r.disagreements?.length ?? 0) > 0 && (
              <div className="mt-1 space-y-1">
                {(r.disagreements ?? []).map((d, i) => (
                  <div key={i} className="text-[11px] bg-sky-50 border border-sky-200 rounded px-2 py-1">
                    <p className="text-sky-900">{d.note}</p>
                    {d.kind !== 'row-one-sided' && (
                      <p className="mt-0.5 text-sky-800">
                        <span className="text-sky-600">rules:</span>{' '}
                        <span className="font-mono">{d.field === 'proposed_type' ? (typeName(d.rules) ?? '—') : (d.rules ?? '—')}</span>
                        <span className="mx-1.5 text-sky-400">·</span>
                        <span className="text-sky-600">model:</span>{' '}
                        <span className="font-mono">{d.field === 'proposed_type' ? (typeName(d.model) ?? '—') : (d.model ?? '—')}</span>
                      </p>
                    )}
                    {/* A TYPE CONFLICT gets its offers as one-click acts: choosing a
                        candidate is an EDIT disposition through the existing path —
                        the same ledger, the same approval flow, no second door. */}
                    {d.kind === 'type-conflict' && d.rules && d.model && (
                      <div className="mt-1 flex gap-1.5">
                        {([['rules', d.rules], ['model', d.model]] as const).map(([leg, key]) => (
                          <button key={leg} disabled={busy}
                            onClick={() => void dispose(r, 'edited', { proposed_type: key })}
                            className="text-[10px] border border-sky-700 text-sky-800 rounded px-1.5 py-0.5 hover:bg-sky-100 disabled:opacity-50">
                            Accept as {typeName(key)} — the {leg} leg's reading
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Questions the pipeline attributed to THIS row ── */}
            {!isEditing && rowQuestions(r).map((q, i) => (
              <div key={i} className="mt-1 text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <span className="text-[9px] uppercase tracking-wide text-amber-700 mr-1.5">question · {q.about}</span>
                <span className="text-amber-900">{q.question}</span>
                <span className="block mt-0.5 text-[10px] text-amber-700">
                  Answer it by editing the row — accepting as-is records the value unanswered.
                </span>
              </div>
            ))}

            {diff.length > 0 && (
              <div className="mt-0.5 text-[11px] space-y-0.5">
                {diff.map(d => {
                  const chosen = (picks.get(r.id) ?? defaultPicks(r)).has(d.field as string)
                  return (
                    <label key={d.field} className="flex items-start gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={chosen} disabled={busy}
                        onChange={() => togglePick(r.id, d.field as string, r)}
                        className="mt-0.5 accent-teal-700" />
                      <span className={chosen ? 'text-gray-700' : 'text-gray-400'}>
                        <span className="text-gray-400">{d.field.replace('_', ' ')}:</span>{' '}
                        {d.kind === 'replace' ? (
                          <>
                            <span className="text-amber-900">{d.from}</span>
                            {' → '}<span className="text-gray-800">{d.to}</span>
                            <span className="ml-1.5 text-[10px] text-amber-900 bg-amber-100 rounded px-1 py-0.5">
                              replaces an entered value
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-400">empty</span>
                            {' → '}<span className="text-teal-800">{d.to}</span>
                          </>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {showDiff && diff.length === 0 && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Nothing to add — the existing unit already holds everything this row proposes.
              </p>
            )}
          </div>

          <div className="flex gap-1.5 shrink-0">
            {isEditing ? (
              <>
                <button disabled={busy}
                  onClick={() => { void dispose(r, 'edited', {
                    tag: draft.tag || null, descriptor: draft.descriptor || null,
                    proposed_type: draft.proposed_type || null,
                    // A proposed name edited here rides through with the row.
                    // Approval already queues unresolved names (api/intake.ts);
                    // this is the same path, not a second one.
                    observed_type_name: draft.proposed_type ? null : (draft.observed_type_name || null),
                    location: draft.location || null, area_served: draft.area_served || null,
                  }); setEditing(null) }}
                  className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
                  Save + accept
                </button>
                <button onClick={() => setEditing(null)}
                  className="text-[11px] text-gray-400 hover:text-gray-600">Cancel</button>
              </>
            ) : (
              <>
                {hasTypeConflict(r) ? (
                  // No unnamed accept on a conflicted row (ruled 2026-08-13).
                  // The named accepts are the offer buttons in the disagreement
                  // block; Edit also names, because saving the edit form names
                  // a type explicitly.
                  <span className="text-[10px] text-sky-800 self-center"
                        title="The readers disagree on this unit's type. Accepting must name which reading is taken — use the offers, or Edit.">
                    choose a reading to accept
                  </span>
                ) : (
                  <button onClick={() => void (showDiff ? acceptEnrich(r) : dispose(r, 'accepted'))} disabled={busy}
                    className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
                    {showDiff ? 'Apply selected' : 'Accept'}
                  </button>
                )}
                <button onClick={() => startEdit(r)} disabled={busy}
                  className="text-[11px] text-gray-500 hover:text-teal-700 disabled:opacity-50">Edit</button>
                <button onClick={() => void dispose(r, 'rejected')} disabled={busy}
                  className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50">Reject</button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const Block = ({ title, hint, list, tone, showDiff }: {
    title: string; hint: string; list: Row[]; tone?: 'warn'; showDiff?: boolean
  }) => list.length === 0 ? null : (
    <div className={`mb-5 ${tone === 'warn' ? 'border border-amber-300 rounded' : ''}`}>
      <div className={tone === 'warn' ? 'bg-amber-50 px-3 py-1.5 border-b border-amber-200' : 'mb-1'}>
        <h4 className={`text-xs font-bold ${tone === 'warn' ? 'text-amber-900' : 'text-gray-700'}`}>
          {title} — {list.length}
        </h4>
        <p className={`text-[11px] mt-0.5 ${tone === 'warn' ? 'text-amber-800' : 'text-gray-400'}`}>{hint}</p>
      </div>
      <div className={tone === 'warn' ? 'px-3' : ''}>
        {list.map(r => <div key={r.id}>{Line({ r, showDiff })}</div>)}
      </div>
    </div>
  )

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Intake review
          <span className="font-normal text-gray-400"> · {upload?.filename ?? ''}</span>
        </h3>
        <span className="text-[11px] text-gray-400">
          {pending.length} pending{settled > 0 && ` · ${settled} settled`}
        </span>
        {clean.length > 0 && (
          <button onClick={acceptClean} disabled={busy}
            className="text-[11px] border border-teal-700 text-teal-700 rounded px-2 py-0.5 hover:bg-teal-50 disabled:opacity-50">
            Accept all {clean.length} clean{cleanUnverified > 0 && ` (${cleanUnverified} unverified)`}
          </button>
        )}
        {approvable > 0 && (
          <button onClick={approve} disabled={busy}
            className="text-[11px] bg-teal-700 text-white rounded px-2.5 py-0.5 hover:bg-teal-800 disabled:opacity-50">
            Write {approvable} to the register
          </button>
        )}
        <button onClick={onClose} className="ml-auto text-[11px] text-gray-400 hover:text-gray-700">Close</button>
      </div>

      {result && (
        <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded px-3 py-1.5 mb-3">
          {result}
        </p>
      )}

      {/* ── Questions the readers could not attribute to a single row — asked
             ONCE for the upload, not repeated down the list. They inform the
             review; they do not block it. ── */}
      {sheetQuestions.length > 0 && (
        <div className="mb-4 border border-amber-300 rounded">
          <div className="bg-amber-50 px-3 py-1.5 border-b border-amber-200">
            <h4 className="text-xs font-bold text-amber-900">
              ? THE READERS ASKED — {sheetQuestions.length}
            </h4>
            <p className="text-[11px] mt-0.5 text-amber-800">
              Things the sheet did not disambiguate. A default here would be a confident
              wrong answer, so they are questions — read them before ruling on the rows below.
            </p>
          </div>
          <div className="px-3 py-1.5 space-y-1">
            {sheetQuestions.map((q, i) => (
              <p key={i} className="text-[11px] text-gray-700">
                <span className="text-[9px] uppercase tracking-wide text-amber-700 mr-1.5">{q.about}</span>
                {q.question}
              </p>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Every row has been ruled on. {settled} decision{settled === 1 ? '' : 's'} recorded.
          {approvable > 0 && ' Nothing is in the register until you write it.'}
        </p>
      ) : (
        <>
          {Block({ tone: 'warn', title: '⧉ REPEATED TAG', list: dupes,
            hint: 'Another row in this same upload claims this tag. Usually two real units the ' +
                  'schedule tagged alike — which one is which is a judgement, so neither is ' +
                  'dropped and neither is bulk-accepted.' })}

          {Block({ tone: 'warn', title: '✎ CHANGES EXISTING EQUIPMENT', list: enrich, showDiff: true,
            hint: 'This tag is already on the project. Only fields that would CHANGE are shown, ' +
                  'and a blank proposal never clears a value someone entered. Filling an EMPTY field ' +
                  'is ticked for you; REPLACING something already entered is not — taking that ' +
                  'is an act, and it is yours.' })}

          {Block({ title: 'Needs a look', list: looks,
            hint: `Confidence below ${CLEAN_AT}, a type outside the firm vocabulary, or the ` +
                  `two readers disagreed / asked a question about the row. Lowest confidence ` +
                  `first. Accepting an unknown type queues the name for ratification — it ` +
                  `never mints one.` })}

          {Block({ title: 'Clean', list: clean,
            hint: 'New units, known type, high confidence. This is where the volume is and where ' +
                  'the review should end quickly.' })}
        </>
      )}

      {/* ── Settled rows keep their provenance on screen. A ruling made five
             minutes ago is still a ruling about two readers' work — the chips
             and the disposition stay visible so the review's record reads back
             without a database query. Muted: settled is done, not urgent. ── */}
      {settled > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-2">
          <h4 className="text-[11px] font-semibold text-gray-400 mb-1">Settled — {settled}</h4>
          {rows.filter(r => r.disposition !== 'pending').map(r => (
            <div key={r.id} className="flex items-center gap-2 border-b border-gray-50 py-1 text-[11px]">
              <span className={`shrink-0 w-14 text-[9px] uppercase tracking-wide ${
                r.disposition === 'rejected' ? 'text-red-400' : 'text-teal-600'}`}>
                {r.disposition}
              </span>
              <span className="font-mono text-gray-500">{r.tag ?? '—'}</span>
              {r.descriptor && <span className="text-gray-400 truncate">{r.descriptor}</span>}
              {r.edited?.proposed_type && (
                <span className="text-[10px] text-sky-700 bg-sky-50 rounded px-1 py-0.5"
                      title="The type this row was accepted as — a named reading, not the merge's default.">
                  as {typeName(r.edited.proposed_type)}
                </span>
              )}
              <span className="ml-auto inline-flex gap-1">
                {LegChip({ r })}
                {VerifyChip({ r })}
              </span>
            </div>
          ))}
        </div>
      )}

      {upload?.parse_note && (
        <p className="text-[10px] text-gray-400 mt-3 font-mono">{upload.parse_note}</p>
      )}
    </div>
  )
}
