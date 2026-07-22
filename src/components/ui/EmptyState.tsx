// Empty state with the firm's contour mark (DESIGN.md: the isotherm watermark
// appears on the login cover and empty states only). Copy is passed through
// verbatim — headings are load-bearing for tests and muscle memory.

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative p-12 text-center overflow-hidden">
      <div className="contour-mark-ink absolute inset-x-0 top-1/2 -translate-y-1/2 h-56 opacity-[0.06] pointer-events-none" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  )
}
