// HARNESS CONCURRENCY LOCK — one harness touches the ZZ-TEST family at a time.
//
// WHY THIS IS STRUCTURE AND NOT A COMMENT.
//
// `run-battery.mjs` has carried a header for months saying *never run anything
// beside it*, written after a concurrent run produced three convincing and
// entirely fictional failures. On 2026-08-08 its own author violated it twice in
// one day: once by killing a battery to save wall-clock (three suites then failed
// on the ZZ-TEST guard), and once by running the palette sweep and a document
// verification alongside a battery (nine suites failed, none of them real).
//
// That is the third law in one session to reach the same conclusion from a
// different direction:
//   · a new permission is audited in the batch that introduces it — four fires,
//     one author, before it became a guard that refuses at authorship;
//   · when one ruling orders a write and an audit, the audit runs first — the
//     rule was in the file and still did not fire;
//   · and now this.
//
// **A rule that depends on being remembered mid-session is not a rule yet.** So
// the runner gets the ZZ-TEST guard's own pattern applied to itself: refuse, name
// what is running, and make the deliberate case explicit rather than silent.
//
// HOW IT COMPOSES. The battery holds the lock for its whole run and passes a
// token to the suites it spawns. A child whose token matches the live lock is the
// battery's own work and proceeds; anything else refuses and says which run is
// holding it and for how long. So the guard answers DIFFERENTLY in the two states
// it must distinguish — which is the only kind of guard this codebase counts.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const LOCK = '.harness.lock'
const ENV_TOKEN = 'HARNESS_LOCK_TOKEN'

/** Break-glass. Deliberate, and never silent — every use is announced. */
export function overrideRequested(argv = process.argv) {
  return argv.includes('--no-harness-lock')
}

function readLock() {
  if (!existsSync(LOCK)) return null
  try { return JSON.parse(readFileSync(LOCK, 'utf8')) } catch { return null }
}

function alive(pid) {
  if (!pid) return false
  // signal 0 tests for existence without touching the process.
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

/** A lock whose owner died is not a lock. Reclaimed loudly, never silently:
 *  a stale lock that vanishes without comment looks exactly like no lock. */
function clearIfStale(l) {
  if (!l) return null
  if (alive(l.pid)) return l
  console.error(`[harness-lock] stale lock from ${l.owner} (pid ${l.pid}, dead) — reclaiming`)
  try { unlinkSync(LOCK) } catch {}
  return null
}

const mins = since => ((Date.now() - since) / 60000).toFixed(1)

/**
 * For the BATTERY. Takes the lock for the whole run and returns a release fn.
 * Refuses if another harness is live.
 */
export function acquire(owner) {
  if (overrideRequested()) {
    console.error(`[harness-lock] OVERRIDE — ${owner} starting WITHOUT the lock (--no-harness-lock).`)
    console.error(`[harness-lock] Concurrent harness runs produce convincing fictional failures. This is on you.`)
    return () => {}
  }
  const live = clearIfStale(readLock())
  if (live) {
    console.error(`REFUSING to start ${owner}: "${live.owner}" is already running (pid ${live.pid}, ${mins(live.started)} min).`)
    console.error(`Concurrent harnesses share the ZZ-TEST family and produce failures that are not real.`)
    console.error(`Wait for it, or pass --no-harness-lock if you genuinely mean to.`)
    process.exit(1)
  }
  const token = randomUUID()
  writeFileSync(LOCK, JSON.stringify({ owner, pid: process.pid, token, started: Date.now() }, null, 2))
  process.env[ENV_TOKEN] = token

  let released = false
  const release = () => {
    if (released) return
    released = true
    const l = readLock()
    if (l?.token === token) { try { unlinkSync(LOCK) } catch {} }
  }
  // A lock outliving its holder is worse than no lock: it blocks every later run
  // until someone deletes a file they have never heard of.
  process.on('exit', release)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { release(); process.exit(130) })
  process.on('uncaughtException', e => { release(); throw e })
  return release
}

/**
 * For every OTHER harness entry point — suites, sweeps, gates, calibration tools.
 * Proceeds when there is no lock, or when this process is the lock holder's own
 * child (token passed down through the environment). Refuses otherwise.
 */
export function assertHarnessFree(me) {
  if (overrideRequested()) {
    console.error(`[harness-lock] OVERRIDE — ${me} ignoring the harness lock (--no-harness-lock).`)
    return
  }
  const live = clearIfStale(readLock())
  if (!live) return
  if (live.token && process.env[ENV_TOKEN] === live.token) return   // the battery's own child
  console.error(`REFUSING to start ${me}: "${live.owner}" is running (pid ${live.pid}, ${mins(live.started)} min).`)
  console.error(`Both touch the ZZ-TEST family. Running them together produces failures that look real and are not —`)
  console.error(`nine suites failed that way on 2026-08-08, and three the run before.`)
  console.error(`Wait for it to finish, or pass --no-harness-lock if this is the rare deliberate case.`)
  process.exit(1)
}
