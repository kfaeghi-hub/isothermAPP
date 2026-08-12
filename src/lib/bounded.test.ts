// bounded — proven by injection, especially the refusal to keep pushing. [KEEL]
import { describe, it, expect } from 'vitest'
import { runBounded, isBackPressure } from './bounded'

const ok = (v: number) => () => Promise.resolve(v)
const boom = (msg: string) => () => Promise.reject(new Error(msg))

describe('back-pressure is recognised, transients are not', () => {
  it.each([
    'The model service is temporarily unavailable (429). Nothing was saved.',
    'rate limit exceeded',
    'overloaded_error',
    'HTTP 529',
  ])('%s is back-pressure', m => expect(isBackPressure(new Error(m))).toBe(true))

  // A DROPPED CONNECTION IS NOT PRESSURE. The transport retry owns that case;
  // collapsing a whole run to sequential over one socket error would be the
  // wrong medicine for the wrong illness.
  it.each(['socket hang up', 'ECONNRESET', 'the model did not answer within the time allowed'])(
    '%s is NOT back-pressure', m => expect(isBackPressure(new Error(m))).toBe(false))
})

describe('bounded concurrency', () => {
  it('runs everything and keeps order', async () => {
    const r = await runBounded([ok(1), ok(2), ok(3), ok(4), ok(5)], 3)
    expect(r.results).toEqual([1, 2, 3, 4, 5])
    expect(r.throttledAt).toBeNull()
  })

  it('never exceeds the limit in flight', async () => {
    let live = 0, peak = 0
    const t = Array.from({ length: 9 }, () => async () => {
      live++; peak = Math.max(peak, live)
      await new Promise(r => setTimeout(r, 20))
      live--; return 1
    })
    await runBounded(t, 3)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('a task that throws leaves a hole rather than killing the run', async () => {
    const r = await runBounded([ok(1), boom('nope'), ok(3)], 3)
    expect(r.results[1]).toBeNull()
    expect(r.results[0]).toBe(1)
    expect(r.results[2]).toBe(3)
    expect(r.throttledAt).toBeNull()
  })
})

describe('THE RULE THAT MATTERS — one 429 and the rest goes sequential', () => {
  it('drops to sequential and still completes every task', async () => {
    let live = 0, peakAfter = 0, seen = 0
    const tasks = Array.from({ length: 8 }, (_, i) => async () => {
      if (i === 1) throw new Error('rate limit (429)')
      live++
      if (seen > 1) peakAfter = Math.max(peakAfter, live)
      await new Promise(r => setTimeout(r, 15))
      live--; seen++
      return i
    })
    let notified = -1
    const r = await runBounded(tasks, 3, at => { notified = at })

    expect(r.throttledAt).toBe(1)
    expect(notified).toBe(1)
    // Every task still ran — throttling slows the run, it does not truncate it.
    expect(r.results.filter(x => x !== null).length).toBe(7)
    expect(peakAfter).toBeLessThanOrEqual(1)
  })

  it('reports per-task durations, so the sequential equivalent is measurable', async () => {
    const r = await runBounded([
      async () => { await new Promise(x => setTimeout(x, 30)); return 1 },
      async () => { await new Promise(x => setTimeout(x, 30)); return 2 },
    ], 2)
    expect(r.durations).toHaveLength(2)
    expect(r.durations.every(d => d >= 25)).toBe(true)
  })
})
