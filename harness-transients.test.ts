// harness-transients — the guard, proven by injection. [KEEL]
//
// The constraint this was built against: DON'T BUILD A RETRY THAT TEACHES THE
// BATTERY TO SHRUG. So the tests that matter most are the REFUSALS — the cases
// where the guard declines to be lenient.
import { describe, it, expect } from 'vitest'
import { classify, excerpt, SIGNATURES } from './harness-transients.mjs'

// The three real ones, verbatim from this session's runs.
const DEPLOY_WINDOW = `  FAIL  unexpected: Unexpected token 'A', "An error o"... is not valid JSON`
const SOCKET_HANGUP = `Error: report generation failed (500): socket hang up
    at generateReportText (file:///C:/Dev/isotherm-cx/pw-finding-register.mjs:45:22)`
const RATE_LIMIT = `FanCoils.xlsx (threw:The drafting service is temporarily unavailable (429). Nothing was saved.)`

describe('the three that actually happened are recognised', () => {
  it('socket hang up', () => expect(classify(SOCKET_HANGUP)?.name).toBe('socket-hangup'))
  it('rate limit', () => expect(classify(RATE_LIMIT)?.name).toBe('rate-limit'))
  it('gateway', () => expect(classify('upstream returned 503 Service Unavailable')?.name).toBe('gateway'))
})

describe('IT REFUSES TO BE LENIENT — the half that stops the shrug', () => {
  // THE MOST IMPORTANT TEST IN THIS FILE. The deploy-window output happens to
  // arrive on a line beginning `FAIL  `, because the suite reported it as one of
  // its own checks. An assertion failure is never transient, whatever else the
  // output contains — otherwise a genuinely broken suite that logs a socket error
  // on its way down gets retried into a pass.
  it('will not retry anything that printed a failing assertion', () => {
    expect(classify(DEPLOY_WINDOW)).toBeNull()
  })

  it('will not retry an ordinary assertion failure', () => {
    expect(classify('  FAIL  the widget renders\nFAIL — 1 of 12')).toBeNull()
  })

  it('will not retry an assertion failure that MENTIONS a socket error', () => {
    expect(classify('  FAIL  the report saved\n  (note: earlier log said socket hang up)')).toBeNull()
  })

  it('will not retry an unrecognised failure — a new shape is reported, not excused', () => {
    expect(classify('Error: something nobody has seen before')).toBeNull()
  })

  it('will not retry a clean-looking empty output', () => {
    expect(classify('')).toBeNull()
    expect(classify(undefined)).toBeNull()
  })
})

describe('the excerpt is shape, never payload', () => {
  it('takes the matched line and caps it', () => {
    const sig = SIGNATURES.find(s => s.name === 'socket-hangup')!
    const e = excerpt(SOCKET_HANGUP, sig)
    expect(e).toMatch(/socket hang up/)
    expect(e.length).toBeLessThanOrEqual(200)
  })

  it('caps a long line rather than logging a payload', () => {
    const sig = SIGNATURES.find(s => s.name === 'socket-hangup')!
    expect(excerpt(`socket hang up ${'x'.repeat(500)}`, sig).length).toBe(200)
  })
})
