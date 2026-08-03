// TypePicker.tsx — ONE picker, three surfaces (1.02).
//
// The Cx Index add form, the inline editor, and the intake review screen all
// used to ask for an equipment type differently: a Combobox over raw keys, a
// bare text field, and a <select> of the known types. Three controls meant three
// behaviours for the same question, and only one of them could offer the propose
// path — so on the other two an unknown type was a dead end.
//
// Two rules this component exists to hold:
//
//   1. THE SAVE IS NEVER BLOCKED. An unknown type is a vocabulary gap, not a
//      data-entry error. Choosing "propose" records the typed text on the unit
//      (observed_type_name) and files a queue entry; the unit saves either way.
//
//   2. THE MATCHER IS THE SHARED ONE. Ranking for display is loose (substring is
//      enough to OFFER a row); deciding is strict (resolveTypeDetailed only).
//      Loosening the ranker cannot type a unit. Loosening the matcher could type
//      a hundred — that is law 8, and it is why the two are separate functions.

import { useMemo } from 'react'
import { Combobox } from '../ui/Combobox'
import { resolveTypeDetailed } from '../../lib/intakeExcel'
import { rankTypes, matchCaption, type TypeVocab } from '../../lib/typeVocabulary'

interface Props {
  /** The current type key, or '' for untyped. */
  value: string
  /** Free text the user has typed that is not (yet) a type — shown when the unit
   *  carries an observed_type_name rather than a key. */
  observedName?: string | null
  vocab: TypeVocab[]
  /** Fires on pick. `key` set ⇒ typed. `observedName` set ⇒ proposed. Never both. */
  onPick: (r: { key: string | null; observedName: string | null }) => void
  /** Raw text as the user types, for callers that keep the draft in their state. */
  onText?: (v: string) => void
  text: string
  placeholder?: string
  className?: string
  wrapperClassName?: string
  ariaLabel?: string
  disabled?: boolean
}

export function TypePicker({
  value, observedName, vocab, onPick, onText, text,
  placeholder, className, wrapperClassName, ariaLabel, disabled,
}: Props) {
  const byName = useMemo(() => {
    const m = new Map<string, TypeVocab>()
    for (const t of vocab) m.set(t.name, t)
    return m
  }, [vocab])

  const names = useMemo(() => vocab.map(t => t.name), [vocab])

  const rank = useMemo(
    () => (q: string) => rankTypes(q, vocab).map(t => t.name),
    [vocab],
  )

  const optionMeta = useMemo(() => {
    const meta: Record<string, string> = {}
    for (const t of vocab) {
      const c = matchCaption(text, t)
      if (c) meta[t.name] = c
    }
    return meta
  }, [vocab, text])

  const typed = text.trim()
  const resolved = typed ? resolveTypeDetailed(typed, vocab) : null
  // The propose row appears only when the vocabulary genuinely cannot resolve
  // the text — not merely when the list is empty. A user mid-word on "unit hea"
  // has no resolution yet and no business being offered a proposal.
  const showPropose = !!typed && !resolved && !byName.has(typed)

  return (
    <Combobox
      value={text}
      onChange={v => onText?.(v)}
      options={names}
      rank={rank}
      optionMeta={optionMeta}
      extraRow={showPropose
        ? {
            label: `No matching type — propose "${typed}"`,
            onSelect: () => onPick({ key: null, observedName: typed }),
          }
        : null}
      onCommit={v => {
        const t = byName.get(v.trim())
        if (t) onPick({ key: t.key, observedName: null })
        else if (!v.trim()) onPick({ key: null, observedName: null })
        // Free text that resolves to nothing is NOT silently discarded and NOT
        // silently accepted: it waits for the user to choose the propose row.
        // Committing it as a type here is exactly the silent-success this
        // architecture exists to prevent.
      }}
      placeholder={placeholder ?? 'Type or pick — e.g. UH, FCU, boiler'}
      className={className}
      wrapperClassName={wrapperClassName}
      ariaLabel={ariaLabel ?? 'Equipment type'}
      disabled={disabled}
      title={observedName && !value ? `Proposed: ${observedName}` : undefined}
    />
  )
}

/** The display name for a key, for read-only rows. Falls back to the observed
 *  name so an untyped unit still SAYS what it is waiting on, rather than
 *  rendering an empty cell that reads as missing data. */
export function typeLabel(
  key: string | null, observedName: string | null, vocab: TypeVocab[],
): string {
  if (key) return vocab.find(t => t.key === key)?.name ?? key
  if (observedName) return `${observedName} — proposed`
  return '—'
}
