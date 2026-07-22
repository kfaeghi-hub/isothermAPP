// The Isotherm Engineering mark — vector recreation of the firm's logo:
// the tall purple I-beam with the two vermilion isotherm curves opening
// toward it. `color` renders brand colors for paper grounds; `reverse`
// renders white + vermilion for the cover. Swap the paths for the official
// SVG artwork whenever Tony provides the source file.

const PURPLE = '#443C8F'
const VERMILION = '#E8432D'

export function LogoMark({ variant = 'color', className = '' }: {
  variant?: 'color' | 'reverse'
  className?: string
}) {
  const beam = variant === 'reverse' ? '#FFFFFF' : PURPLE
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden="true" fill="none">
      {/* the two isotherm curves, opening toward the beam */}
      <path d="M 54 22 A 20 20 0 1 0 54 58" stroke={VERMILION} strokeWidth="14" />
      <path d="M 54 62 A 20 20 0 1 0 54 98" stroke={VERMILION} strokeWidth="14" />
      {/* the I-beam with its caps */}
      <rect x="66" y="10" width="13" height="100" fill={beam} />
      <rect x="56" y="2" width="33" height="10" fill={beam} />
      <rect x="56" y="108" width="33" height="10" fill={beam} />
    </svg>
  )
}

/** Full lockup: mark + wordmark. */
export function LogoLockup({ variant = 'color', className = '' }: {
  variant?: 'color' | 'reverse'
  className?: string
}) {
  const text = variant === 'reverse' ? 'text-white' : 'text-brand-700'
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark variant={variant} className="h-8 w-auto flex-shrink-0" />
      <span className={`font-display font-bold leading-[1.05] tracking-tight uppercase ${text}`}>
        Isotherm<br />Engineering Ltd.
      </span>
    </span>
  )
}
