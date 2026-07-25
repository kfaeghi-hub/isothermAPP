// Designed empty states — the anatomy calls for them by name, and an external
// user hits them on day one of every project. A default "no rows" line would
// read as a broken page; this reads as a record that hasn't been written yet.
//
// The contour watermark is the sanctioned use under DESIGN.md's signature rule
// (empty states, ≤8% opacity) — unchanged by the 9.9 amendment, which only
// added cover surfaces alongside it.
import { PortalContour } from './PortalContour'

export function EmptyState({ headline, line }: { headline: string; line: string }) {
  return (
    <div className="relative overflow-hidden px-6 py-12 text-center">
      <PortalContour variant="mark" />
      <div className="relative">
        <p className="font-display text-base font-bold text-ink-display">{headline}</p>
        <p className="mt-1.5 text-sm text-gray-500 max-w-sm mx-auto">{line}</p>
      </div>
    </div>
  )
}
