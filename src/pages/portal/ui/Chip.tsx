// Conformance marks — DESIGN.md's chip grammar exactly: rectangular (2px),
// letter-spaced 700-weight 10px caps, tinted field + tinted text of the SAME
// hue. Never a pill, never gray-on-colour.
//
// Two grounds, because this world has two: `paper` inside the record panels,
// `cover` on the purple hero where a paper-tinted field would go muddy.
type Tone = 'open' | 'closed' | 'pending' | 'info' | 'brand'

const PAPER: Record<Tone, string> = {
  open:    'bg-vermilion-50 text-vermilion-700',
  closed:  'bg-conform-50 text-conform-700',
  pending: 'bg-pending-50 text-pending-700',
  info:    'bg-steel-50 text-steel-700',
  brand:   'bg-brand-50 text-brand-700',
}

// On cover, tint the FIELD from the same hue at low alpha and lift the text to
// the light end of that hue — the paper tints have no contrast on purple.
const COVER: Record<Tone, string> = {
  open:    'bg-vermilion-500/15 text-vermilion-400',
  closed:  'bg-conform-600/20 text-conform-50',
  pending: 'bg-pending-700/25 text-pending-50',
  info:    'bg-steel-700/25 text-steel-50',
  brand:   'bg-brand-400/15 text-brand-200',
}

export function Chip({ tone, children, ground = 'paper' }: {
  tone: Tone
  children: React.ReactNode
  ground?: 'paper' | 'cover'
}) {
  const map = ground === 'cover' ? COVER : PAPER
  return (
    <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${map[tone]}`}>
      {children}
    </span>
  )
}
