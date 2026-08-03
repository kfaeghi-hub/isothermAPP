// typeVocabulary.ts — the ONE place the app loads the type vocabulary and files
// a type proposal. Added for 1.02 (the suggestion-as-you-type picker).
//
// The picker lives on three surfaces (Cx Index add form, inline editor, intake
// review). Three copies of "insert a proposal, dedup it, count the waiting
// units" would be three sets of rules that drift, which is the same reason
// resolveType is exported rather than reimplemented.

import { supabase } from './supabase'
import { resolveTypeDetailed, type TypeVocab, type TypeMatch } from './intakeExcel'

export type { TypeVocab, TypeMatch }

/** Load active types WITH their aliases, shaped for `resolveTypeDetailed`.
 *
 *  Aliases are vocabulary DATA — a row in equipment_type_aliases, editable by an
 *  admin beside the types — not a constant that needs a deploy. */
export async function loadTypeVocabulary(): Promise<TypeVocab[]> {
  const [tRes, aRes] = await Promise.all([
    supabase.from('equipment_types').select('key, name').eq('active', true).order('sort_order'),
    supabase.from('equipment_type_aliases').select('type_key, alias'),
  ])
  const byKey = new Map<string, string[]>()
  for (const a of aRes.data ?? []) {
    const list = byKey.get((a as any).type_key) ?? []
    list.push((a as any).alias)
    byKey.set((a as any).type_key, list)
  }
  return (tRes.data ?? []).map((t: any) => ({
    key: t.key, name: t.name, aliases: byKey.get(t.key) ?? [],
  }))
}

/** Rank the vocabulary for the dropdown as the user types.
 *
 *  Ranking is a DISPLAY concern and is deliberately looser than matching: a
 *  substring is enough to offer a row, because the user is reading the list and
 *  deciding. Only `resolveTypeDetailed` decides anything on its own, and it is
 *  strict. Loosening the ranker can never type a unit; loosening the matcher
 *  could type a hundred. */
export function rankTypes(query: string, vocab: TypeVocab[]): TypeVocab[] {
  const q = query.trim().toLowerCase()
  if (!q) return vocab
  const hit = resolveTypeDetailed(query, vocab)
  const score = (t: TypeVocab): number => {
    if (hit && t.key === hit.key) return 0                                   // the resolved answer, first
    if (t.name.toLowerCase().startsWith(q) || t.key.startsWith(q)) return 1
    if ((t.aliases ?? []).some(a => a.toLowerCase().startsWith(q))) return 2
    if (t.name.toLowerCase().includes(q) || t.key.includes(q)) return 3
    if ((t.aliases ?? []).some(a => a.toLowerCase().includes(q))) return 4
    return 99
  }
  return vocab.map(t => ({ t, s: score(t) })).filter(x => x.s < 99)
    .sort((a, b) => a.s - b.s || a.t.name.localeCompare(b.t.name)).map(x => x.t)
}

/** Why a row is being offered — shown as the option's caption. */
export function matchCaption(query: string, t: TypeVocab): string | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const hit = resolveTypeDetailed(query, [t])
  if (hit?.via === 'alias') return `matched "${hit.matched}"`
  const alias = (t.aliases ?? []).find(a => a.toLowerCase().includes(q))
  return alias ? `alias "${alias}"` : null
}

export interface ProposeResult { queued: boolean; waiting: number; error?: string }

/** File a type proposal for text the vocabulary could not resolve.
 *
 *  Deduped on (org, observed name) among OPEN proposals — and deduped by the
 *  DATABASE as well as here, because two users typing the same unknown in the
 *  same minute is exactly the case an app-level Set cannot see.
 *
 *  The waiting-unit count is DERIVED, never stored: a counter drifts the moment
 *  a unit is typed by another path, and a stale "3 units waiting" beside a
 *  ratify button is a decision made on a wrong number. */
export async function proposeType(observedName: string, projectId: string | null): Promise<ProposeResult> {
  const name = observedName.trim()
  if (!name) return { queued: false, waiting: 0, error: 'empty name' }

  const { data: existing } = await supabase.from('proposed_equipment_types')
    .select('id').eq('status', 'proposed').ilike('observed_name', name).limit(1)

  if (!existing?.length) {
    const { error } = await supabase.from('proposed_equipment_types')
      .insert({ observed_name: name, project_id: projectId, status: 'proposed' })
    // A unique-violation here means someone else filed the same proposal between
    // the read and the write. That is the index doing its job, not a failure to
    // report to the user — the queue entry they wanted exists.
    if (error && !/duplicate key|unique/i.test(error.message)) {
      return { queued: false, waiting: 0, error: error.message }
    }
  }

  const { count } = await supabase.from('equipment')
    .select('id', { count: 'exact', head: true })
    .is('equipment_type', null).ilike('observed_type_name', name)

  return { queued: true, waiting: count ?? 0 }
}
