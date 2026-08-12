// bounded — run tasks a few at a time, and back off the moment the service says so.
// [KEEL] Phase 5a, ruled 2026-08-12.
//
// WHY IT IS BOUNDED AND NOT JUST PARALLEL. A three-sheet workbook with a banded
// 199×52 sheet is a twenty-minute import when every call waits for the last one.
// Running them all at once is the other failure: a corpus run once fired ~26 calls
// in quick succession, tripped a rate limit, and came back with the model leg at
// 18% and fourteen consecutive files reporting "the drafting service did not
// respond". None of it was about extraction.
//
// So: THREE AT A TIME, AND ON THE FIRST 429 THE RUN GOES SEQUENTIAL FOR THE REST.
//
// That last rule matters more than the number. The transport retry in ai-common
// handles a TRANSIENT — a dropped connection, a momentary 503. A 429 is not a
// transient; it is the service telling you the rate is wrong, and retrying into it
// is arguing. The right answer to back-pressure is less pressure, applied to
// everything that follows rather than to the one call that hit it.

export interface BoundedResult<T> {
  results: (T | null)[]
  /** Set when a task reported back-pressure and the run dropped to sequential. */
  throttledAt: number | null
  /** Per-task wall clock, so a caller can report the sequential equivalent —
   *  the sum of these IS what sequential would have cost in time. */
  durations: number[]
}

/** Does this failure mean "you are going too fast"? */
export function isBackPressure(e: unknown): boolean {
  const s = String((e as Error)?.message ?? e ?? '')
  return /\b429\b|rate.?limit|too many requests|overloaded|\b529\b|temporarily unavailable/i.test(s)
}

/**
 * Run `tasks` with at most `limit` in flight.
 *
 * A task that throws yields `null` in its slot — the caller decides what a hole
 * means, exactly as `parallel()` does elsewhere in this codebase. A task that
 * throws BACK-PRESSURE additionally collapses the remaining work to sequential.
 */
export async function runBounded<T>(
  tasks: (() => Promise<T>)[], limit = 3,
  onBackPressure?: (at: number) => void,
): Promise<BoundedResult<T>> {
  const results: (T | null)[] = new Array(tasks.length).fill(null)
  const durations: number[] = new Array(tasks.length).fill(0)
  let throttledAt: number | null = null
  let next = 0

  const runOne = async (i: number) => {
    const t0 = Date.now()
    try {
      results[i] = await tasks[i]()
    } catch (e) {
      if (throttledAt === null && isBackPressure(e)) {
        throttledAt = i
        onBackPressure?.(i)
      }
      results[i] = null
    } finally {
      durations[i] = Date.now() - t0
    }
  }

  const worker = async () => {
    while (next < tasks.length) {
      // ONCE THROTTLED, ONE AT A TIME. Checked inside the loop rather than at the
      // top, so the decision applies to work that has not started yet — including
      // work already claimed by another worker's next iteration.
      if (throttledAt !== null) return
      const i = next++
      await runOne(i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))

  // Anything the workers abandoned when the throttle tripped runs sequentially.
  while (next < tasks.length) {
    const i = next++
    await runOne(i)
  }

  return { results, throttledAt, durations }
}
