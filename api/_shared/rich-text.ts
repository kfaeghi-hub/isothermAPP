// RICH-TEXT — the platform schema and the renderer trio (RICH-TEXT-PROPOSAL,
// ruled 2026-08-20; Phase 1).
//
// ONE STORED TRUTH: TipTap JSON, whitelisted at this door. THE TRIO: JSON→HTML
// (screen/PDF/portal), JSON→Blocks (the docx-skeleton lineage), toPlainText
// (summaries, the legacy-column projection, the verifier's input, the future
// Procore payload). All three REFUSE on unknown nodes by name — the patcher's
// count-mismatch law at this layer.
//
// DELIBERATELY DEPENDENCY-FREE. The TipTap packages are pinned for the EDITOR
// (client); the server trio and the markdown-lite lift are hand-rolled against
// the same JSON shape, so the serverless bundles carry no editor machinery and
// the render-twin fixtures pin OUR bytes, not a library's HTML choices. (A
// narrower surface than the proposal's §1.5 package list — noted in the Phase 1
// record.)
//
// THE PLATFORM SCHEMA, locked by ruling:
//   nodes  doc · paragraph · text · bulletList · orderedList · listItem
//          heading (levels 2–3) — THE CX PLAN TIER ONLY
//   marks  bold · italic
// No tables, no images, no colors, no hardBreak (a multi-line block lifts to
// separate paragraphs), NO NESTED LISTS in Phase 1 — the chrome offers no
// indent control (a control that inserts what storage refuses is a lie in
// button form), the lift never produces nesting, and the validator refuses it
// by name so nothing else can smuggle it in.

export type RichTier = 'platform' | 'cxplan'

export interface RichMark { type: string }
export interface RichNode {
  type: string
  text?: string
  marks?: RichMark[]
  attrs?: Record<string, unknown>
  content?: RichNode[]
}
export interface RichDoc extends RichNode { type: 'doc'; content: RichNode[] }

export class RichTextError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RichTextError' }
}

const MARKS = new Set(['bold', 'italic'])

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── Validation — the whitelist, enforced by refusal ──────────────────────────

export function validateRich(doc: RichNode, tier: RichTier = 'platform'): asserts doc is RichDoc {
  if (!doc || typeof doc !== 'object' || doc.type !== 'doc' || !Array.isArray(doc.content))
    throw new RichTextError(`not a rich document (type "${(doc as any)?.type ?? typeof doc}")`)
  const walk = (n: RichNode, inListItem: boolean, depth: number) => {
    switch (n.type) {
      case 'paragraph':
        for (const c of n.content ?? []) {
          if (c.type !== 'text') throw new RichTextError(`unknown node "${c.type}" inside paragraph`)
          for (const m of c.marks ?? [])
            if (!MARKS.has(m.type)) throw new RichTextError(`unknown mark "${m.type}"`)
        }
        return
      case 'heading': {
        if (tier !== 'cxplan')
          throw new RichTextError('node "heading" is reserved to the Cx Plan tier')
        const lvl = Number((n.attrs as any)?.level)
        if (lvl !== 2 && lvl !== 3)
          throw new RichTextError(`heading level ${lvl} outside the tier's 2–3`)
        for (const c of n.content ?? [])
          if (c.type !== 'text') throw new RichTextError(`unknown node "${c.type}" inside heading`)
        return
      }
      case 'bulletList':
      case 'orderedList':
        if (inListItem) throw new RichTextError('nested list — not in the Phase 1 schema')
        for (const li of n.content ?? []) {
          if (li.type !== 'listItem') throw new RichTextError(`unknown node "${li.type}" inside ${n.type}`)
          for (const c of li.content ?? []) {
            if (c.type !== 'paragraph') throw new RichTextError(`unknown node "${c.type}" inside listItem`)
            walk(c, true, depth + 1)
          }
        }
        return
      default:
        throw new RichTextError(`unknown node "${n.type}"`)
    }
  }
  for (const n of doc.content) walk(n, false, 0)
}

// ── Runs — the shared inline shape the renderers consume ─────────────────────

export interface RichRun { text: string; bold?: boolean; italic?: boolean }

function runsOf(n: RichNode): RichRun[] {
  return (n.content ?? []).map(c => ({
    text: c.text ?? '',
    bold: c.marks?.some(m => m.type === 'bold') || undefined,
    italic: c.marks?.some(m => m.type === 'italic') || undefined,
  }))
}

const runsHtml = (runs: RichRun[]) => runs.map(r => {
  let h = escHtml(r.text)
  if (r.italic) h = `<em>${h}</em>`
  if (r.bold) h = `<strong>${h}</strong>`
  return h
}).join('')

// ── The trio ─────────────────────────────────────────────────────────────────

/** (1) JSON → HTML, for screen, PDF paths and (if ever ruled) the portal. */
export function richToHtml(doc: RichNode, tier: RichTier = 'platform'): string {
  validateRich(doc, tier)
  return doc.content.map(n => {
    switch (n.type) {
      case 'paragraph': return `<p>${runsHtml(runsOf(n))}</p>`
      case 'heading': return `<h${(n.attrs as any).level}>${runsHtml(runsOf(n))}</h${(n.attrs as any).level}>`
      case 'bulletList':
        return `<ul>${(n.content ?? []).map(li =>
          `<li>${(li.content ?? []).map(p => runsHtml(runsOf(p))).join('<br>')}</li>`).join('')}</ul>`
      case 'orderedList':
        return `<ol>${(n.content ?? []).map(li =>
          `<li>${(li.content ?? []).map(p => runsHtml(runsOf(p))).join('<br>')}</li>`).join('')}</ol>`
      default: throw new RichTextError(`unknown node "${n.type}"`) // unreachable past validate
    }
  }).join('')
}

/** (2) JSON → docx-skeleton Blocks. Paragraph runs carry bold/italic; list
 *  items land as bullet/numbered blocks (Bullet1-ABC / Bulletnumbered-ABC —
 *  both already in the skeleton, verified 2026-08-20, so Q3's regeneration
 *  contingency never fired). */
export interface RichBlock {
  kind: 'para' | 'bullet' | 'numbered' | 'heading'
  level?: 2 | 3
  runs: RichRun[]
}
export function richToBlocks(doc: RichNode, tier: RichTier = 'platform'): RichBlock[] {
  validateRich(doc, tier)
  const out: RichBlock[] = []
  for (const n of doc.content) {
    switch (n.type) {
      case 'paragraph': out.push({ kind: 'para', runs: runsOf(n) }); break
      case 'heading': out.push({ kind: 'heading', level: (n.attrs as any).level, runs: runsOf(n) }); break
      case 'bulletList':
        for (const li of n.content ?? [])
          out.push({ kind: 'bullet', runs: (li.content ?? []).flatMap(runsOf) })
        break
      case 'orderedList':
        for (const li of n.content ?? [])
          out.push({ kind: 'numbered', runs: (li.content ?? []).flatMap(runsOf) })
        break
    }
  }
  return out
}

/** (3) JSON → plain text: bullets to `- ` lines, ordered to `N. ` lines,
 *  paragraphs to line breaks, emphasis dropped. The legacy column's maintained
 *  projection, the verifier's input, and the pre-answered Procore payload. */
export function toPlainText(doc: RichNode, tier: RichTier = 'platform'): string {
  validateRich(doc, tier)
  const text = (n: RichNode) => (n.content ?? []).map(c => c.text ?? '').join('')
  return doc.content.map(n => {
    switch (n.type) {
      case 'paragraph': return text(n)
      case 'heading': return text(n)
      case 'bulletList':
        return (n.content ?? []).map(li => `- ${(li.content ?? []).map(text).join(' ')}`).join('\n')
      case 'orderedList':
        return (n.content ?? []).map((li, i) => `${i + 1}. ${(li.content ?? []).map(text).join(' ')}`).join('\n')
      default: return ''
    }
  }).filter(s => s !== '').join('\n\n')
}

// ── The markdown-lite lift (ruled Q1) ────────────────────────────────────────
//
// FIVE TOKENS, nothing else: blank-line paragraphs · `- ` bullets · `N. `
// ordered · **bold** · *italic* (+ `## `/`### ` headings, the Cx Plan tier
// only). Unknown syntax stays literal. Deterministic; no parser dependency.

const BULLET_RE = /^\s*[-*]\s+/
const ORDERED_RE = /^\s*\d+[.)]\s+/
const HEADING_RE = /^(##{1,2})\s+/

function liftInline(s: string): RichNode[] {
  // **bold** first (its delimiter contains the italic one), then *italic*.
  // Unpaired markers stay literal — no escaping syntax exists in the subset.
  const nodes: RichNode[] = []
  const push = (text: string, marks: RichMark[]) => {
    if (text) nodes.push({ type: 'text', text, ...(marks.length ? { marks } : {}) })
  }
  const boldSplit = s.split(/\*\*(.+?)\*\*/s)
  boldSplit.forEach((seg, i) => {
    const bold = i % 2 === 1
    const italSplit = seg.split(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/s)
    italSplit.forEach((part, j) => {
      const marks: RichMark[] = []
      if (bold) marks.push({ type: 'bold' })
      if (j % 2 === 1) marks.push({ type: 'italic' })
      push(part, marks)
    })
  })
  return nodes.length ? nodes : []
}

export function liftMarkdownLite(text: string, tier: RichTier = 'platform'): RichDoc {
  const content: RichNode[] = []
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim() !== '')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (BULLET_RE.test(line)) {
        const items: RichNode[] = []
        while (i < lines.length && BULLET_RE.test(lines[i])) {
          items.push({ type: 'listItem', content: [
            { type: 'paragraph', content: liftInline(lines[i].replace(BULLET_RE, '')) }] })
          i++
        }
        content.push({ type: 'bulletList', content: items })
      } else if (ORDERED_RE.test(line)) {
        const items: RichNode[] = []
        while (i < lines.length && ORDERED_RE.test(lines[i])) {
          items.push({ type: 'listItem', content: [
            { type: 'paragraph', content: liftInline(lines[i].replace(ORDERED_RE, '')) }] })
          i++
        }
        content.push({ type: 'orderedList', content: items })
      } else {
        const h = tier === 'cxplan' ? line.match(HEADING_RE) : null
        if (h) {
          content.push({ type: 'heading', attrs: { level: h[1].length === 2 ? 2 : 3 },
            content: liftInline(line.replace(HEADING_RE, '')) })
        } else {
          content.push({ type: 'paragraph', content: liftInline(line) })
        }
        i++
      }
    }
  }
  if (content.length === 0) content.push({ type: 'paragraph', content: [] })
  return { type: 'doc', content }
}

// ── The round-trip refusal (ruled Q1: a boundary REFUSAL, not a log line) ────
//
// TWO INDEPENDENT PROJECTIONS AGREE OR THE LIFT REFUSES: toPlainText(lift(t))
// versus a positional token-strip of the source that never builds a tree
// (agreement-as-oracle — a wrong answer would have to be wrong identically in
// two different implementations).

export function sourceProjection(text: string, tier: RichTier = 'platform'): string {
  return text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(block =>
    block.split('\n').filter(l => l.trim() !== '').map(line => {
      let s = line
      if (BULLET_RE.test(s)) s = s.replace(BULLET_RE, '- ')
      else if (ORDERED_RE.test(s)) s = s.replace(ORDERED_RE, m => m.trim().replace(/\)/, '.') + ' ')
      else if (tier === 'cxplan') s = s.replace(HEADING_RE, '')
      s = s.replace(/\*\*(.+?)\*\*/gs, '$1')
      s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, '$1')
      return s
    }).join('\n')
  ).filter(b => b !== '').join('\n\n')
}

const normWs = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Lift with the refusal armed. Throws before anything could be stored. */
export function liftOrRefuse(text: string, tier: RichTier = 'platform'): RichDoc {
  const doc = liftMarkdownLite(text, tier)
  validateRich(doc, tier)
  const a = normWs(toPlainText(doc, tier))
  // Ordered lists renumber from 1 in the projection; normalize the source's
  // own numbers the same way for the comparison only.
  const b = normWs(sourceProjection(text, tier).replace(/^(\s*)\d+\.\s/gm, '$11. ')
    .replace(/\n/g, ' '))
  const a2 = a.replace(/(^|\s)\d+\.\s/g, '$11. ')
  if (a2 !== b)
    throw new RichTextError(
      `lift lost content — projections disagree\n  lifted: ${a2.slice(0, 160)}\n  source: ${b.slice(0, 160)}`)
  return doc
}
