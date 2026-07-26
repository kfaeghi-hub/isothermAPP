// 03 Documents — the issued record. Only what the firm has ISSUED can appear
// here, and that filter lives in SQL (portal_documents) and again in the
// signing endpoint, not in this component. A draft cannot reach this list, and
// asking for one by id returns 403.
//
// One obvious action per format. The signed URL is minted on CLICK (10-minute
// expiry), never rendered into the page — nothing here is a shareable link.
import { useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { openPortalDocument, type PortalDocument } from '../../../lib/portal'
import { Chip } from '../ui/Chip'
import { EmptyState } from '../ui/EmptyState'

const KIND = { site_report: 'Site report', meeting: 'Minutes' } as const

export function Documents({ docs, onOpen = openPortalDocument }: {
  docs: PortalDocument[]
  /** How to open a document. Defaults to account mode; link mode injects its
   *  token-carrying equivalent. The ISSUED test is server-side in both. */
  onOpen?: (doc: PortalDocument, kind: 'docx' | 'pdf') => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function open(doc: PortalDocument, kind: 'pdf' | 'docx') {
    const key = `${doc.kind}-${doc.row_id}-${kind}`
    setBusy(key)
    try { await onOpen(doc, kind) } finally { setBusy(null) }
  }

  return (
    <section aria-labelledby="pt-docs">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 id="pt-docs" className="font-display text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">
          <span className="font-mono text-vermilion-400 mr-2">03</span>Documents
        </h2>
        {docs.length > 0 && (
          <p className="font-mono text-[11px] text-slate-400">{docs.length} issued</p>
        )}
      </div>

      <div className="pt-panel overflow-hidden">
        {docs.length === 0 ? (
          <EmptyState
            headline="No issued documents yet"
            line="Site reports and meeting minutes appear here once they are issued. Drafts stay with the commissioning team until then."
          />
        ) : (
          <ul className="divide-y divide-rule">
            {docs.map(d => (
              <li key={`${d.kind}-${d.row_id}`}
                className="px-4 sm:px-5 py-4 flex items-start gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
                <FileText size={18} strokeWidth={1.75} className="text-gray-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-display">{d.label}</p>
                  <p className="mt-1 flex items-center gap-2 flex-wrap">
                    <Chip tone={d.kind === 'site_report' ? 'info' : 'brand'}>{KIND[d.kind]}</Chip>
                    {d.doc_date && <span className="font-mono text-[11px] text-gray-500">{d.doc_date}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                  {d.has_pdf && (
                    <DownloadButton label="PDF" busy={busy === `${d.kind}-${d.row_id}-pdf`}
                      onClick={() => open(d, 'pdf')} docLabel={d.label} />
                  )}
                  {d.has_docx && (
                    <DownloadButton label=".docx" busy={busy === `${d.kind}-${d.row_id}-docx`}
                      onClick={() => open(d, 'docx')} docLabel={d.label} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function DownloadButton({ label, busy, onClick, docLabel }: {
  label: string; busy: boolean; onClick: () => void; docLabel: string
}) {
  return (
    <button onClick={onClick} disabled={busy}
      aria-label={`Download ${docLabel} as ${label}`}
      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-sm border border-rule
                 text-[12px] font-semibold text-ink transition-colors duration-150
                 hover:border-brand-600 hover:text-brand-600 disabled:opacity-50">
      <Download size={14} strokeWidth={1.75} aria-hidden="true" />
      {busy ? 'Opening…' : label}
    </button>
  )
}
