import { useEffect } from 'react'

interface Props {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg'
  /** Action row rendered OUTSIDE the scroll area — always reachable without
   *  scrolling (RC4: the pre-slot pattern clipped footers at every size).
   *  Consumers migrate their button rows here; until they do, the body
   *  scrolls with a visible scrollbar. */
  footer?: React.ReactNode
}

// RC4 (mobile Wave 1): below `sm` the modal is a FULL-SCREEN SHEET (h-dvh, no
// outer padding) with sticky header/footer so actions stay reachable; at `sm+`
// the centered dialog is unchanged. The close button grows to a 44px tap
// target on touch widths. Modal-scoped CSS in index.css collapses consumers'
// multi-column field grids to one column below `sm`.
export function Modal({ title, open, onClose, children, maxWidth = 'md', footer }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`modal-sheet relative bg-white sm:rounded-md shadow-xl w-full ${widths[maxWidth]} h-dvh sm:h-auto sm:max-h-[90vh] flex flex-col`}>
        <div className="h-[2px] bg-standard-600 sm:rounded-t-md flex-shrink-0" />
        <div className="flex items-center justify-between pl-4 pr-2 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-display text-base font-bold text-gray-900 truncate">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-11 h-11 sm:w-7 sm:h-7 flex-shrink-0 flex items-center justify-center rounded-sm hover:bg-gray-100 transition-colors"
          >
            &times;
          </button>
        </div>
        <div className="modal-body overflow-y-auto p-4 sm:p-6 flex-1 overscroll-contain">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-gray-200 px-4 sm:px-6 py-3 bg-white sm:rounded-b-md">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
