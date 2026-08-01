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
}

interface Existing {
  id: string; tag: string; descriptor: string | null
  equipment_type: string | null; location: string | null; area_served: string | null
}

const CLEAN_AT = 0.85

export function IntakeReview({ uploadId, projectId, onClose }: {
  uploadId: string; projectId: string; onClose: () => void
}) {
  const [rows, setRows]   = useState<Row[]>([])
  const [upload, setUpload] = useState<{ filename: string; kind: string; parse_note: string | null } | null>(null)
  const [existing, setExisting] = useState<Map<string, Existing>>(new Map())
  const [vocab, setVocab] = useState<{ key: string; name: string }[]>([])
  const [busy, setBusy]   = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const fetchAll = useCallback(async () => {
    const [{ data: u }, { data: r }, { data: t }] = await Promise.all([
      supabase.from('intake_uploads').select('filename, kind, parse_note').eq('id', uploadId).maybeSingle(),
      supabase.from('intake_rows').select('*').eq('upload_id', uploadId)
        .order('confidence', { ascending: true }).order('source_row'),
      supabase.from('equipment_types').select('key, name').eq('active', true).order('name'),
    ])
    setUpload(u ?? null)
    setVocab(t ?? [])
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

  const pending  = rows.filter(r => r.disposition === 'pending')
  const dupes    = pending.filter(r => r.duplicate_of)
  const enrich   = pending.filter(r => !r.duplicate_of && r.match_equipment_id)
  const looks    = pending.filter(r => !r.duplicate_of && !r.match_equipment_id &&
                                       ((r.confidence ?? 0) < CLEAN_AT || !r.proposed_type))
  const clean    = pending.filter(r => !r.duplicate_of && !r.match_equipment_id &&
                                       (r.confidence ?? 0) >= CLEAN_AT && !!r.proposed_type)
  const settled  = rows.length - pending.length

  async function acceptClean() {
    if (!clean.length) return
    if (!window.confirm(
      `Accept all ${clean.length} clean rows?\n\n` +
      `These are new units with a known type and confidence at or above ${CLEAN_AT}.\n\n` +
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

  function startEdit(r: Row) {
    setEditing(r.id)
    setDraft({
      tag: r.tag ?? '', descriptor: r.descriptor ?? '',
      proposed_type: r.proposed_type ?? '', location: r.location ?? '',
      area_served: r.area_served ?? '',
    })
  }

  const typeName = (k: string | null) => vocab.find(v => v.key === k)?.name ?? k

  /** The diff a reviewer actually needs: only fields that would CHANGE. */
  function diffFor(r: Row): { field: string; from: string; to: string }[] {
    const e = r.match_equipment_id ? existing.get(r.match_equipment_id) : undefined
    if (!e) return []
    const pairs: [string, string | null, string | null][] = [
      ['descriptor', e.descriptor, r.descriptor],
      ['type', e.equipment_type, r.proposed_type],
      ['location', e.location, r.location],
      ['area served', e.area_served, r.area_served],
    ]
    return pairs
      // A blank proposal is not a proposal to blank the field. Enrichment ADDS;
      // it never clears something a human wrote — that is the directory-import
      // standard and the reason this block is never bulk-accepted.
      .filter(([, from, to]) => to && to !== from)
      .map(([field, from, to]) => ({ field, from: from || '—', to: to as string }))
  }

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
                <select value={draft.proposed_type ?? ''}
                  onChange={e => setDraft(d => ({ ...d, proposed_type: e.target.value }))}
                  className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5">
                  <option value="">type — unresolved</option>
                  {vocab.map(v => <option key={v.key} value={v.key}>{v.name}</option>)}
                </select>
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
              </div>
            )}

            {diff.length > 0 && (
              <div className="mt-0.5 text-[11px]">
                {diff.map(d => (
                  <div key={d.field} className="text-gray-600">
                    <span className="text-gray-400">{d.field}:</span>{' '}
                    <span className="line-through text-gray-400">{d.from}</span>
                    {' → '}<span className="text-teal-800">{d.to}</span>
                  </div>
                ))}
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
                <button onClick={() => void dispose(r, 'accepted')} disabled={busy}
                  className="text-[11px] bg-teal-700 text-white rounded px-2 py-0.5 hover:bg-teal-800 disabled:opacity-50">
                  Accept
                </button>
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
        {list.map(r => <Line key={r.id} r={r} showDiff={showDiff} />)}
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
            Accept all {clean.length} clean
          </button>
        )}
        <button onClick={onClose} className="ml-auto text-[11px] text-gray-400 hover:text-gray-700">Close</button>
      </div>

      {pending.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Every row has been ruled on. {settled} decision{settled === 1 ? '' : 's'} recorded.
        </p>
      ) : (
        <>
          <Block tone="warn" title="⧉ REPEATED TAG" list={dupes}
            hint="Another row in this same upload claims this tag. Usually two real units the
                  schedule tagged alike — which one is which is a judgement, so neither is
                  dropped and neither is bulk-accepted." />

          <Block tone="warn" title="✎ CHANGES EXISTING EQUIPMENT" list={enrich} showDiff
            hint="This tag is already on the project. Only fields that would CHANGE are shown,
                  and a blank proposal never clears a value someone entered. This is the one
                  block that can alter an existing record, so it is read one at a time." />

          <Block title="Needs a look" list={looks}
            hint={`Confidence below ${CLEAN_AT}, or a type outside the firm vocabulary. ` +
                  `Lowest confidence first. Accepting an unknown type queues the name for ` +
                  `ratification — it never mints one.`} />

          <Block title="Clean" list={clean}
            hint="New units, known type, high confidence. This is where the volume is and where
                  the review should end quickly." />
        </>
      )}

      {upload?.parse_note && (
        <p className="text-[10px] text-gray-300 mt-3 font-mono">{upload.parse_note}</p>
      )}
    </div>
  )
}
