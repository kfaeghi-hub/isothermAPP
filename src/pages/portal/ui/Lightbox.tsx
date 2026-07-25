// Finding-photo lightbox. Deliberately NOT src/components/ui/Modal — that is a
// paper-world object (white sheet, gray borders, shadow-xl) and would read as a
// foreign body on cover. This is a full-bleed cover-world viewer.
//
// Photos arrive as SIGNED URLs minted per open (portal_finding_photos returns
// IDs only, never a storage path), so nothing here can be deep-linked or shared
// out of the portal beyond the 60-minute signature.
import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export function Lightbox({ urls, index, onClose, onStep, caption }: {
  urls: string[]
  index: number
  onClose: () => void
  onStep: (delta: number) => void
  caption?: string | null
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowRight') { onStep(1); return }
      if (e.key === 'ArrowLeft') { onStep(-1); return }
      // Focus stays inside the viewer: it covers the page, so Tab must not
      // walk into the record behind it.
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('button')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose, onStep])

  const many = urls.length > 1

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Finding photo">
      <div className="absolute inset-0 bg-cover-edge/95" onClick={onClose} />
      <div ref={panelRef} className="relative flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
            {many ? `Photo ${index + 1} / ${urls.length}` : 'Photo'}
          </p>
          <button ref={closeRef} onClick={onClose} aria-label="Close photo"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-paper">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center gap-2 px-2 pb-2">
          {many && (
            <button onClick={() => onStep(-1)} aria-label="Previous photo"
              className="min-h-[44px] min-w-[44px] flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-paper">
              <ChevronLeft size={24} strokeWidth={1.75} />
            </button>
          )}
          <img src={urls[index]} alt={caption || 'Finding photo'}
            className="max-h-full max-w-full object-contain rounded-sm" />
          {many && (
            <button onClick={() => onStep(1)} aria-label="Next photo"
              className="min-h-[44px] min-w-[44px] flex-shrink-0 flex items-center justify-center text-slate-400 hover:text-paper">
              <ChevronRight size={24} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {caption && (
          <p className="flex-shrink-0 px-4 pb-4 text-center text-sm text-slate-300">{caption}</p>
        )}
      </div>
    </div>
  )
}
