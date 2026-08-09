import { describe, it, expect } from 'vitest'
import { plainError, PLAIN_ERRORS } from './plainError'

// The strings below are REAL messages, copied from what PostgREST returned when
// each constraint was deliberately violated during the IST build. Testing
// against invented text would prove the regex matches the regex.
describe('plainError', () => {
  it('maps the evidence constraint a person can actually hit', () => {
    const real = 'new row for relation "ist_prerequisites" violates check constraint "ist_prerequisites_yes_needs_evidence"'
    expect(plainError(real)).toBe(
      'Marking this YES needs a note saying where the document is — a title and a location is enough.')
    expect(plainError(real)).not.toContain('violates check constraint')
  })

  it('maps the three-kind protocol shape', () => {
    const real = 'new row for relation "ist_protocols" violates check constraint "ist_protocols_kind_shape"'
    expect(plainError(real)).toContain('do not match its kind')
  })

  it('maps a self-referencing integration', () => {
    const real = 'new row for relation "ist_integrations" violates check constraint "ist_integrations_distinct_systems"'
    expect(plainError(real)).toBe('An integration has to be between two different systems.')
  })

  it('passes anything it does not recognise through UNCHANGED', () => {
    // A message that gets swallowed is worse than an ugly one: an unmapped
    // failure must still reach whoever can act on it.
    const unknown = 'connection terminated unexpectedly'
    expect(plainError(unknown)).toBe(unknown)
  })

  it('every mapping produces a sentence, not a constraint name', () => {
    for (const [, plain] of PLAIN_ERRORS) {
      expect(plain).not.toMatch(/_/)          // no snake_case leaking through
      expect(plain.length).toBeGreaterThan(20)
    }
  })
})
