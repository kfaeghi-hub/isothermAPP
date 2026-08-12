// sheetMerges — recover the merge extents that the spreadsheet reader discards.
//
// WHY THIS FILE EXISTS. `read-excel-file` returns a merged cell as its value in
// the top-left position and `null` everywhere else, and it never reports the
// merge's WIDTH. So a header fold that carries a group header rightwards across
// blanks cannot know where the group ends — and on the benchmark's hostile
// fixture it did not:
//
//   row 2 │ · │ · │ · │ PERFORMANCE │ · │ · │ MOTOR │ · │ · │ ·     ← G2:I2
//   row 3 │ … │ … │ … │ Q [USGPM]   │ … │ … │ PWR   │ … │ … │ MBH
//
// `MBH` is column J. `MOTOR` spans G:I and stops. Forward-fill labelled it
// `MOTOR MBH`, which is a quantity that does not exist. **No cleverer rule can
// recover this**, because the information was thrown away before any rule ran.
// The fix is a better INPUT, not a better heuristic — which is why this reads the
// worksheet XML directly rather than trying to infer spans from the grid.
//
// One reader, two consumers: the deterministic parser folds headers within their
// real spans, and the model-read leg is shown the same spans. Two ways of
// deciding where a group header ends would be two answers that drift.

import type { Cell } from './intakeExcel'

/** Zero-indexed, inclusive on both ends. */
export interface MergeRange { r0: number; c0: number; r1: number; c1: number }

/** Merges per sheet NAME, matching the names `read-excel-file` reports. */
export type SheetMerges = Record<string, MergeRange[]>

/** `A1` → { r: 0, c: 0 }. Excel columns are base-26 with no zero, so AA is 26. */
export function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase())
  if (!m) return null
  let c = 0
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64)
  return { r: Number(m[2]) - 1, c: c - 1 }
}

/** `A1:F1` → a range. Returns null for anything that is not a two-ended ref. */
export function parseRange(ref: string): MergeRange | null {
  const [a, b] = ref.split(':')
  if (!a || !b) return null
  const p = parseRef(a), q = parseRef(b)
  if (!p || !q) return null
  return {
    r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c),
    r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c),
  }
}

/**
 * Read every sheet's merge ranges out of an .xlsx.
 *
 * Deliberately tolerant: a workbook this cannot understand yields `{}` and the
 * callers fall back to their previous behaviour. A merge reader that throws would
 * turn a cosmetic header problem into a failed import, which is a much worse
 * trade than a slightly worse header.
 *
 * Works in the browser and in Node — jszip runs in both, which matters because
 * the deterministic path parses client-side and the model leg reads server-side,
 * and they must see the same spans.
 */
export async function readSheetMerges(data: ArrayBuffer | Uint8Array): Promise<SheetMerges> {
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(data)

    const wb = await zip.file('xl/workbook.xml')?.async('string')
    if (!wb) return {}

    // r:id → target path, from the workbook's own relationships.
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') ?? ''
    const rels = new Map<string, string>()
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1]
      const target = /Target="([^"]+)"/.exec(m[0])?.[1]
      if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, ''))
    }

    const out: SheetMerges = {}
    let ordinal = 0
    for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
      ordinal++
      const name = /name="([^"]*)"/.exec(m[0])?.[1]
      const rid  = /r:id="([^"]+)"/.exec(m[0])?.[1]
      if (!name) continue
      // The relationship is authoritative; the ordinal is the fallback for
      // workbooks written without one (our own fixture generator, for instance).
      const target = (rid && rels.get(rid)) || `worksheets/sheet${ordinal}.xml`
      const xml = await zip.file(`xl/${target}`)?.async('string')
      if (!xml) continue

      const ranges: MergeRange[] = []
      for (const mc of xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"[^>]*\/>/g)) {
        const r = parseRange(mc[1])
        if (r) ranges.push(r)
      }
      out[name] = ranges
    }
    return out
  } catch {
    // Unreadable archive, unexpected layout, jszip absent — all the same answer:
    // no merge information, and the callers behave exactly as they did before.
    return {}
  }
}

/**
 * Forward-fill a row **within its declared merges**.
 *
 * The old rule was "carry the last value across every blank", which is right for
 * a merged span and wrong everywhere else. This carries a value only into cells a
 * merge actually covers, so a column past the end of a span keeps its own
 * (possibly empty) label instead of inheriting a neighbour's.
 *
 * With no merges supplied it falls back to the old behaviour, because a workbook
 * whose spans could not be read is still better served by an imperfect fold than
 * by no fold at all.
 */
export function fillWithinMerges(
  row: Cell[], rowIndex: number, merges: MergeRange[] | undefined,
  txt: (c: Cell) => string,
): string[] {
  const raw = row.map(txt)
  if (!merges || merges.length === 0) {
    const out: string[] = []
    let last = ''
    for (const v of raw) { if (v) last = v; out.push(v || last) }
    return out
  }

  const covering = merges.filter(m => rowIndex >= m.r0 && rowIndex <= m.r1)
  return raw.map((v, c) => {
    if (v) return v
    const m = covering.find(m => c >= m.c0 && c <= m.c1)
    if (!m) return ''                       // outside every span — inherits NOTHING
    return raw[m.c0] ?? ''                  // inside a span — takes its anchor
  })
}
