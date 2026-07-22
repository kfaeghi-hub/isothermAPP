// Flat CSS/SVG contour treatment — the graceful path. Serves two duties:
// the WebGL-failure fallback behind the cinematic page (still drifts via
// landing.css) and the background of the static reduced-motion variant
// (where the CSS media query holds it still).
export function CssContour({ fixed = false }: { fixed?: boolean }) {
  return (
    <svg
      className={`lv-contour ${fixed ? 'fixed' : 'absolute'} inset-0 w-full h-full pointer-events-none`}
      viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none"
    >
      <path d="M -80 660 C 240 560, 480 760, 800 640 S 1300 520, 1560 620" stroke="#E8432D" strokeOpacity="0.14" strokeWidth="2" />
      <path d="M -80 740 C 280 640, 520 840, 860 720 S 1340 620, 1560 710" stroke="#E8432D" strokeOpacity="0.10" strokeWidth="2" />
      <path d="M -80 820 C 320 730, 560 910, 920 800 S 1380 710, 1560 790" stroke="#7f78cb" strokeOpacity="0.12" strokeWidth="2" />
    </svg>
  )
}
