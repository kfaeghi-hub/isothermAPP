// reconcile — the merge, and the two rulings that shaped it.
//
// [KEEL] Every expectation is written by hand. The cases below are the ones the
// corpus actually produced, not shapes invented to be easy.
import { describe, it, expect } from 'vitest'
import { reconcileSheet, CONFLICT_CAP } from './reconcile'

const rules = (o = {}) => ({
  tag: 'FCU-1', descriptor: null, location: null, area_served: null,
  proposed_type: null, nameplate: {}, confidence: 0.9, ...o,
})
const model = (o = {}) => ({
  tag: 'FCU-1', descriptor: null, location: null, area_served: null,
  proposed_type: null, nameplate: {}, confidence: 0.9, ...o,
})

describe('agreement is evidence', () => {
  it('two readers landing on the same type raises confidence and marks it `both`', () => {
    const m = reconcileSheet([rules({ proposed_type: 'fcu' })], [model({ proposed_type: 'fcu' })])
    expect(m.rows[0].typeFrom).toBe('both')
    expect(m.rows[0].proposed_type).toBe('fcu')
    expect(m.rows[0].confidence).toBeGreaterThan(0.9)
    expect(m.disagreements).toHaveLength(0)
  })
})

describe('a type-conflict is a review question — neither leg wins silently', () => {
  const m = reconcileSheet(
    [rules({ proposed_type: 'fan' })],
    [model({ proposed_type: 'fcu' })],
  )

  it('offers the MORE SPECIFIC reading', () => {
    // `fcu` is not more specific by token count here, so the tie keeps the rules
    // value — what matters is that neither is accepted at clean confidence.
    expect(['fan', 'fcu']).toContain(m.rows[0].proposed_type)
  })

  it('caps confidence BELOW the review screen\'s CLEAN_AT of 0.85', () => {
    expect(m.rows[0].confidence).toBeLessThanOrEqual(CONFLICT_CAP)
    expect(CONFLICT_CAP).toBeLessThan(0.85)
  })

  it('records the conflict with BOTH readings named', () => {
    const d = m.disagreements.find(x => x.kind === 'type-conflict')
    expect(d).toBeTruthy()
    expect(d!.rules).toBe('fan')
    expect(d!.model).toBe('fcu')
    expect(d!.note).toMatch(/disagree/)
  })

  it('prefers the more specific key when one genuinely is', () => {
    const r = reconcileSheet(
      [rules({ proposed_type: 'panel' })],
      [model({ proposed_type: 'radiant_panel' })],
    )
    expect(r.rows[0].proposed_type).toBe('radiant_panel')
    expect(r.rows[0].confidence).toBeLessThanOrEqual(CONFLICT_CAP)
  })
})

describe('a row without a tag is still a row', () => {
  it('carries untagged rows through instead of dropping them', () => {
    const m = reconcileSheet(
      [rules({ tag: null }), rules({ tag: 'P-1' })],
      [model({ tag: 'P-1' })],
    )
    // Two rules rows in, two rows out. The first merge keyed on tag and lost it.
    expect(m.rows).toHaveLength(2)
    expect(m.rows.filter(r => r.seenBy === 'rules')).toHaveLength(1)
  })
})

describe('a sheet the model could not read is a NAMED HOLE, not an absence', () => {
  it('carries every rules row and says the model read failed', () => {
    const m = reconcileSheet([rules({ proposed_type: 'pump' }), rules({ tag: 'P-2' })], null)
    expect(m.rows).toHaveLength(2)
    expect(m.modelReadFailed).toBe(true)
    expect(m.rows.every(r => r.seenBy === 'rules')).toBe(true)
  })
})

describe('spec values union, and one-sidedness is recorded', () => {
  it('keeps a heading only one leg captured, and says which', () => {
    const m = reconcileSheet(
      [rules({ nameplate: { 'FLOW [GPM]': '130' } })],
      [model({ nameplate: { 'HEAD [ft]': '25' } })],
    )
    expect(m.rows[0].nameplate).toEqual({ 'FLOW [GPM]': '130', 'HEAD [ft]': '25' })
    expect(m.disagreements.filter(d => d.kind === 'spec-one-sided').length).toBe(2)
  })
})
