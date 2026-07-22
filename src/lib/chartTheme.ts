// One chart system (dataviz skill, brand-pinned palette). Rules encoded here:
// single hue for magnitude (brand purple), status colors reserved for status,
// recessive grid/axes, ink text never series-colored, thin rounded-end marks.
// The radar/timeline thresholds are drawn as annotated reference lines, not
// bar-color bands — bar length is the encoding; color never carries it alone.

export const CHART = {
  purple: '#443C8F',       // magnitude / single-series hue
  green: '#1E7A4E',        // semantic: closed/success
  amber: '#8A5400',        // semantic: attention (paired with green: legend + grouping gaps)
  vermilion: '#C2371F',    // semantic: overdue/deviation threshold
  neutral: '#C6C5CD',      // no-data marks (never visited)
  grid: '#EFEEEC',
  barSize: 12,
  endRadius: 4,
  tick: { fontSize: 10, fill: '#6C6B76' } as const,
  tickMono: { fontSize: 10, fill: '#6C6B76', fontFamily: 'Spline Sans Mono' } as const,
  cursor: { fill: 'rgba(68, 60, 143, 0.06)' },
  tooltip: {
    contentStyle: {
      background: '#FFFFFF',
      border: '1px solid #E0DFE6',
      borderRadius: 8,
      boxShadow: '0 8px 24px -12px rgba(22, 21, 31, 0.18)',
      fontSize: 11,
      padding: '8px 10px',
    },
    labelStyle: { color: '#23222C', fontWeight: 600, marginBottom: 2 },
    itemStyle: { color: '#4D4C56', padding: 0 },
  },
  legend: { iconSize: 8, wrapperStyle: { fontSize: 11, color: '#4D4C56' } },
} as const
