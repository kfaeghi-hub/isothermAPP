// The rich-text schema + trio, pinned (Phase 1 of RICH-TEXT-PROPOSAL, ruled
// 2026-08-20). Four claims live here:
//   · THE WHITELIST REFUSES BY NAME — unknown nodes/marks, out-of-tier
//     headings, nested lists all throw with the offender named.
//   · THE LIFT IS THE FIVE TOKENS AND NOTHING ELSE — unknown syntax stays
//     literal; the round-trip refusal (two independent projections agreeing)
//     fires BEFORE storage, not after.
//   · THE RENDER-TWINS ARE BYTE-STABLE — the committed fixture outputs are
//     the upgrade gate (ruled Q5): a pin bump that changes a twin must show
//     the diff in its own commit.
//   · toPlainText IS THE PROJECTION every raw consumer reads — bullets to
//     `- ` lines, paragraphs to breaks, emphasis dropped.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  liftMarkdownLite, liftOrRefuse, richToBlocks, richToHtml,
  RichTextError, sourceProjection, toPlainText, validateRich,
} from './richText'
import type { RichDoc } from './richText'

const P = (text: string): RichDoc =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('validateRich — the whitelist refuses by name', () => {
  it('accepts the platform subset', () => {
    expect(() => validateRich(P('plain'))).not.toThrow()
  })
  it('refuses unknown nodes by name', () => {
    const doc = { type: 'doc', content: [{ type: 'codeBlock', content: [] }] }
    expect(() => validateRich(doc as any)).toThrow(/unknown node "codeBlock"/)
  })
  it('refuses unknown marks by name', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'x', marks: [{ type: 'textStyle' }] }] }] }
    expect(() => validateRich(doc as any)).toThrow(/unknown mark "textStyle"/)
  })
  it('reserves headings to the Cx Plan tier', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [] }] }
    expect(() => validateRich(doc as any, 'platform')).toThrow(/reserved to the Cx Plan tier/)
    expect(() => validateRich(doc as any, 'cxplan')).not.toThrow()
  })
  it('refuses heading levels outside 2–3 even in tier', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [] }] }
    expect(() => validateRich(doc as any, 'cxplan')).toThrow(/level 1 outside/)
  })
  it('refuses nested lists by name (Phase 1 schema)', () => {
    const doc = { type: 'doc', content: [{ type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [] },
        { type: 'bulletList', content: [] }] }] }] }
    expect(() => validateRich(doc as any)).toThrow(/unknown node "bulletList" inside listItem|nested list/)
  })
  it('refuses a catastrophically wrong shape at the top (the tripwire class)', () => {
    expect(() => validateRich('a string' as any)).toThrow(RichTextError)
    expect(() => validateRich({ type: 'html' } as any)).toThrow(/not a rich document/)
  })
})

describe('liftMarkdownLite — five tokens, nothing else', () => {
  it('blank lines split paragraphs; single newlines split paragraphs too (no hardBreak in the schema)', () => {
    const d = liftMarkdownLite('one\n\ntwo\nthree')
    expect(d.content.map(n => n.type)).toEqual(['paragraph', 'paragraph', 'paragraph'])
  })
  it('dash runs lift to one bulletList', () => {
    const d = liftMarkdownLite('- a\n- b')
    expect(d.content).toHaveLength(1)
    expect(d.content[0].type).toBe('bulletList')
    expect(d.content[0].content).toHaveLength(2)
  })
  it('numbered runs lift to orderedList; both `.` and `)` accepted', () => {
    const d = liftMarkdownLite('1. a\n2) b')
    expect(d.content[0].type).toBe('orderedList')
    expect(d.content[0].content).toHaveLength(2)
  })
  it('**bold** and *italic* lift to marks; unpaired markers stay literal', () => {
    const d = liftMarkdownLite('a **b** and *c* and 2*3*4 leftover **open')
    const runs = d.content[0].content!
    expect(runs.some(r => r.marks?.some(m => m.type === 'bold') && r.text === 'b')).toBe(true)
    expect(runs.some(r => r.marks?.some(m => m.type === 'italic') && r.text === 'c')).toBe(true)
    const flat = runs.map(r => r.text).join('')
    expect(flat).toContain('**open')            // unpaired stays literal
  })
  it('headings lift only in the Cx Plan tier; stay literal on the platform', () => {
    expect(liftMarkdownLite('## Title', 'cxplan').content[0].type).toBe('heading')
    const plat = liftMarkdownLite('## Title', 'platform')
    expect(plat.content[0].type).toBe('paragraph')
    expect(plat.content[0].content![0].text).toBe('## Title')
  })
  it('unknown markdown stays literal (tables, links, code fences)', () => {
    const d = liftMarkdownLite('| a | b |\n\n[x](y)\n\n`code`')
    expect(d.content.every(n => n.type === 'paragraph')).toBe(true)
    expect(toPlainText(d)).toContain('| a | b |')
    expect(toPlainText(d)).toContain('[x](y)')
  })
})

describe('liftOrRefuse — the round-trip is a boundary refusal', () => {
  const CASES = [
    'plain paragraph',
    'two\n\nparagraphs with **bold** and *italic*',
    '- one\n- two **strong**\n\nafter the list',
    '1. first\n2. second\n\n- mixed\n- lists',
    'unpaired *star and ** doubles',
    'a line\nwith a soft break\n\n- then a bullet',
  ]
  for (const t of CASES) {
    it(`round-trips: ${JSON.stringify(t.slice(0, 40))}`, () => {
      expect(() => liftOrRefuse(t)).not.toThrow()
    })
  }
  it('cxplan tier round-trips headings', () => {
    expect(() => liftOrRefuse('## Approach\n\nBody text', 'cxplan')).not.toThrow()
  })
  it('the two projections are genuinely independent implementations', () => {
    // sourceProjection never builds a tree; agreement is the oracle.
    const t = '- a\n- b\n\n**c**'
    expect(sourceProjection(t).replace(/\s+/g, ' ')).toBe('- a - b c')
    expect(toPlainText(liftOrRefuse(t)).replace(/\s+/g, ' ')).toBe('- a - b c')
  })
})

describe('render-twins — byte-stable, the upgrade gate (Q5)', () => {
  const doc = JSON.parse(readFileSync('fixtures/rich-text/twin.json', 'utf8'))
  it('HTML twin', () => {
    expect(richToHtml(doc, 'cxplan')).toBe(readFileSync('fixtures/rich-text/twin.html', 'utf8'))
  })
  it('plaintext twin', () => {
    expect(toPlainText(doc, 'cxplan')).toBe(readFileSync('fixtures/rich-text/twin.txt', 'utf8'))
  })
  it('blocks twin', () => {
    expect(JSON.stringify(richToBlocks(doc, 'cxplan'), null, 2) + '\n')
      .toBe(readFileSync('fixtures/rich-text/twin.blocks.json', 'utf8'))
  })
})

describe('toPlainText — the maintained projection', () => {
  it('drops emphasis, keeps every word', () => {
    const d = liftOrRefuse('**A** meets *B*')
    expect(toPlainText(d)).toBe('A meets B')
  })
  it('escapes nothing and invents nothing — HTML-ish text passes through as text', () => {
    const d = P('<script>alert(1)</script>')
    expect(toPlainText(d)).toBe('<script>alert(1)</script>')
    expect(richToHtml(d)).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })
})
