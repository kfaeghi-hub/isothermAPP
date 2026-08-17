// meeting-numbering — item numbers DERIVE from structure; they are not stored.
// [KEEL] 2026-08-14, the section-numbering incident.
//
// WHAT THIS REPLACES. Numbers were stamped once at creation from a
// meeting-global counter prefixed with the meeting number ("stamped once,
// never renumbered") — so an item created under section 3 got 2.1, the next
// under section 4 got 2.2, and a deleted item left its gap forever. The owner's
// ruling: section-scoped positional numbering, fully derived — an item under
// section N displays N.k, k = its 1-based position among the section's NATIVE
// items. Store position; compute display. Per the derived-from-source law the
// IST grids proved: where structure is generated, its description derives from
// the same source or the two drift.
//
// ONE SOURCE, THREE CONSUMERS: the meetings UI, both document formats in
// generate-minutes, and the dashboard's item lines all call this. That is the
// point — the number a reader sees is the same derivation everywhere, not
// three renderers agreeing by luck.
//
// CARRIED ITEMS ARE THE DELIBERATE EXCEPTION (ruled, with the reason): a
// carried item's number is FROZEN at carry time, origin-qualified
// ("#2 · 3.1"), rendered with the ↺ provenance, and EXCLUDED from the native
// count of its section. Under derived numbering a number is no longer globally
// unique across meetings — "3.1" exists in every meeting with a third section —
// so a frozen number must NAME ITS ORIGIN MEETING to keep the cross-meeting
// traceability the construction convention exists for. Legacy carried numbers
// ("1.1"-style, stamped under the old scheme) already encode their origin
// meeting in their first digit and render as-is.
//
// SECTION N is the topic's 1-BASED POSITION in display order (sort_order, id
// tiebreak) — the same `{ti + 1}` the UI prints beside each section heading,
// which is how the owner counts sections. Reordering sections renumbers items;
// that is the ruling working, not a defect.

export interface NumberingTopic { id: string; sort_order: number }
export interface NumberingItem {
  id: string
  topic_id: string
  sort_order: number
  created_at?: string | null
  item_number: string
  carried_from_item_id?: string | null
}

/** The display number for every item of one meeting: derived N.k for native
 *  items, the frozen origin-qualified number (with ↺) for carried ones. */
export function deriveItemNumbers(
  topics: NumberingTopic[], items: NumberingItem[],
): Map<string, string> {
  const orderedTopics = [...topics].sort((a, b) =>
    a.sort_order - b.sort_order || a.id.localeCompare(b.id))
  const topicPos = new Map(orderedTopics.map((t, i) => [t.id, i + 1]))

  const out = new Map<string, string>()
  const byTopic = new Map<string, NumberingItem[]>()
  for (const it of items) {
    if (!byTopic.has(it.topic_id)) byTopic.set(it.topic_id, [])
    byTopic.get(it.topic_id)!.push(it)
  }

  for (const [topicId, list] of byTopic) {
    const n = topicPos.get(topicId)
    const ordered = [...list].sort((a, b) =>
      a.sort_order - b.sort_order
      || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      || a.id.localeCompare(b.id))
    let k = 0
    for (const it of ordered) {
      if (it.carried_from_item_id) {
        // frozen, and the ↺ travels IN the display string — one form everywhere
        out.set(it.id, `↺ ${it.item_number}`)
      } else if (n != null) {
        k += 1
        out.set(it.id, `${n}.${k}`)
      } else {
        // an item whose topic is not in the list — a caller bug; show the
        // stored number rather than nothing, so the defect is visible
        out.set(it.id, it.item_number || '?')
      }
    }
  }
  return out
}

/** The frozen form stamped onto a NEW carry: the item's display in its origin
 *  meeting, qualified by that meeting's number. A chained carry (the origin
 *  item was itself carried) copies the existing frozen string verbatim — it is
 *  already origin-qualified (or legacy-stamped, which encodes its origin). */
export function frozenCarryNumber(
  originMeetingNumber: number,
  originItem: NumberingItem,
  originDisplay: Map<string, string>,
): string {
  if (originItem.carried_from_item_id) return originItem.item_number
  const display = originDisplay.get(originItem.id) ?? originItem.item_number
  return `#${originMeetingNumber} · ${display}`
}
