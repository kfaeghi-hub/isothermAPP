// Cx Plan review screen — FACTS BESIDE PROSE.
//
// The reviewer checks the text against what the model was GIVEN, not against
// memory. That layout is the whole point: a draft read on its own reads
// plausibly, which is exactly the failure mode this pipeline exists to catch.
//
// Per-section accept / edit / regenerate-with-note. A note redrafts ONLY that
// section. Approve is explicit and disabled until every narrative section is
// accepted — and the server refuses regardless, so this is legibility, not the
// control.
import { useState } from 'react'
import { AlertTriangle, Check, RefreshCw, Pencil } from 'lucide-react'
import type { PlanSection, Flag } from '../../lib/cxPlan'
import { liftMarkdownLite, richToHtml, toPlainText } from '../../lib/richText'
import type { RichDoc } from '../../lib/richText'
import { RichTextEditor } from '../RichTextEditor'

const SEVERITY: Record<Flag['severity'], { label: string; cls: string }> = {
  unsupported:  { label: 'Not in the facts', cls: 'bg-red-50 text-red-700' },
  contradicted: { label: 'Contradicts the facts', cls: 'bg-red-50 text-red-700' },
  vague:        { label: 'Vague', cls: 'bg-amber-50 text-amber-700' },
}

export function SectionReview({
  title, section, facts, busy, onAccept, onRegenerate, onRuleOnFlag,
}: {
  title: string
  section: PlanSection | undefined
  facts: Record<string, unknown>
  busy: boolean
  onAccept: (text: string, rich: RichDoc | null) => void
  /** Ruling on a flag feeds the ledger. Flags never blocked and still do not —
   *  this records what the CxA thought of each one. */
  onRuleOnFlag?: (flag: Flag, confirmed: boolean) => void
  onRegenerate: (note?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  // Ruled-on flags stay visible — a dismissed flag is a record, not a deletion.
  const [ruled, setRuled] = useState<Record<number, 'confirmed' | 'dismissed'>>({})
  const [note, setNote] = useState('')
  const flags = section?.flags ?? []
  const current = section?.final_text ?? section?.drafted_text ?? ''
  // RICH-TEXT Phase 1: JSON-first with legacy fallback. A legacy row lifts
  // LAZILY here, at its first edit — the door's own lift, via the shim.
  const currentRich = section?.final_rich ?? section?.drafted_rich
    ?? (current ? liftMarkdownLite(current, 'cxplan') : null)
  const [rich, setRich] = useState<RichDoc | null>(currentRich)

  return (
    <div className={`border rounded-lg overflow-hidden ${
      section?.accepted ? 'border-green-600/40' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          {title}
          {section?.accepted && (
            <span className="text-[10px] font-bold text-green-700 bg-green-50 rounded px-1.5 py-0.5">
              ACCEPTED
            </span>
          )}
          {flags.length > 0 && !section?.accepted && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
              {flags.length} FLAG{flags.length === 1 ? '' : 'S'}
            </span>
          )}
        </h4>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => { setEditing(e => !e); setRich(currentRich) }}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-standard-600">
            <Pencil size={12} strokeWidth={2} /> {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={() => setNoteOpen(o => !o)} disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-standard-600 disabled:opacity-50">
            <RefreshCw size={12} strokeWidth={2} /> Regenerate
          </button>
          <button
            onClick={() => {
              // Accept stores BOTH: the JSON and its plain projection — the
              // legacy column stays maintained, never stale (§2.4).
              const doc = editing ? rich : currentRich
              onAccept(doc ? toPlainText(doc, 'cxplan') : current, doc ?? null)
            }}
            disabled={busy || !current}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
            <Check size={12} strokeWidth={2.5} /> Accept
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* ── FACTS USED ────────────────────────────────────────────────── */}
        <div className="p-3 bg-gray-50/60 border-b lg:border-b-0 lg:border-r border-gray-200">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Facts used
          </p>
          <dl className="space-y-1.5">
            {Object.entries(facts).map(([k, v]) => (
              <div key={k} className="text-[11px]">
                <dt className="text-gray-500">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-gray-800">
                  {Array.isArray(v) ? v.join(', ') : String(v ?? '—')}
                </dd>
              </div>
            ))}
          </dl>

          {flags.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-200 space-y-2">
              {flags.map((f, i) => (
                <div key={i} className="text-[11px]">
                  <p className={`inline-flex items-center gap-1 font-semibold rounded px-1.5 py-0.5 ${SEVERITY[f.severity]?.cls ?? ''}`}>
                    <AlertTriangle size={11} strokeWidth={2.5} />
                    {SEVERITY[f.severity]?.label ?? f.severity}
                  </p>
                  <p className="mt-1 text-gray-700">“{f.span}”</p>
                  <p className="text-gray-500">{f.why}</p>
                  {onRuleOnFlag && (
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => { onRuleOnFlag(f, true); setRuled(r => ({ ...r, [i]: 'confirmed' })) }}
                        disabled={!!ruled[i]}
                        className="text-[10px] font-semibold text-amber-800 hover:underline disabled:no-underline disabled:opacity-50">
                        {ruled[i] === 'confirmed' ? '✓ confirmed' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => { onRuleOnFlag(f, false); setRuled(r => ({ ...r, [i]: 'dismissed' })) }}
                        disabled={!!ruled[i]}
                        className="text-[10px] text-gray-500 hover:underline disabled:no-underline disabled:opacity-50">
                        {ruled[i] === 'dismissed' ? '✓ dismissed' : 'Dismiss'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── DRAFT ────────────────────────────────────────────────────── */}
        <div className="p-3">
          {editing && rich ? (
            <RichTextEditor value={rich} tier="cxplan" onChange={setRich} />
          ) : currentRich ? (
            /* Read view through the TRIO's own renderer — the same HTML the
               PDF path derives from, and it escapes all text itself. */
            <div
              className="text-sm text-gray-800 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5
                         [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-base [&_h2]:font-bold
                         [&_h3]:font-bold [&_p]:my-1"
              dangerouslySetInnerHTML={{ __html: richToHtml(currentRich, 'cxplan') }}
            />
          ) : current ? (
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{current}</p>
          ) : (
            <p className="text-sm text-gray-400">Not drafted yet.</p>
          )}

          {noteOpen && (
            <div className="mt-2 flex gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} autoFocus
                placeholder="e.g. mention the glycol loop"
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-standard-600" />
              <button onClick={() => { onRegenerate(note || undefined); setNote(''); setNoteOpen(false) }}
                disabled={busy}
                className="text-xs px-2.5 py-1.5 rounded bg-standard-600 text-white font-medium disabled:opacity-50">
                Redraft
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
