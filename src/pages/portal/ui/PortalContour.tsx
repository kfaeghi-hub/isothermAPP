// The isotherm contour — the firm's namesake, and the signature of every cover
// surface. DESIGN.md's signature rule is amended in this build (ruling 9.9) to
// cover surfaces (login, landing, PORTAL) + empty states, ≤8% opacity.
//
// Pure SVG, zero JS, aria-hidden + pointer-events-none. `slice` crops the same
// 1440×900 field correctly into a short header band OR a small empty-state
// square, which is why one component serves both.
export function PortalContour({ variant = 'band' }: { variant?: 'band' | 'mark' }) {
  const band = variant === 'band'
  return (
    <svg
      className={`${band ? 'pt-contour' : 'pt-contour-mark'} absolute inset-0 w-full h-full pointer-events-none`}
      viewBox={band ? '0 0 1440 900' : '0 200 1440 500'}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      fill="none"
    >
      <path d="M -80 660 C 240 560, 480 760, 800 640 S 1300 520, 1560 620"
        stroke="var(--color-vermilion-500)" strokeOpacity={band ? 0.14 : 0.08} strokeWidth="2" />
      <path d="M -80 740 C 280 640, 520 840, 860 720 S 1340 620, 1560 710"
        stroke="var(--color-vermilion-500)" strokeOpacity={band ? 0.10 : 0.06} strokeWidth="2" />
      <path d="M -80 820 C 320 730, 560 910, 920 800 S 1380 710, 1560 790"
        stroke="var(--color-brand-400)" strokeOpacity={band ? 0.12 : 0.07} strokeWidth="2" />
      <path d="M -80 580 C 200 500, 460 680, 780 570 S 1280 460, 1560 545"
        stroke="var(--color-brand-400)" strokeOpacity={band ? 0.08 : 0.05} strokeWidth="2" />
    </svg>
  )
}
