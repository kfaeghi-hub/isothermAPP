// Durable write queue for checklist fill-out (MASTER-BRIEF Phase 2 field resilience).
//
// Why this is small on purpose (§9A right-sizing): every checklist write is already an
// idempotent upsert on a natural key that exists in the schema. That single fact buys us
// everything a heavyweight sync engine would:
//   - Replay is safe        -> a double flush cannot duplicate a row.
//   - The queue is bounded  -> re-editing a field REPLACES its queued op (keyed by the
//                              same natural key), so a 300-cell checklist can never queue
//                              more than 300 ops no matter how much the user fiddles.
//   - Conflict resolution   -> last-write-wins per field, which is what a form means.
//
// So: no service worker, no IndexedDB, no PWA shell, no Replicache/RxDB/PowerSync, no CRDT.
// localStorage survives a reload and a tab kill, which is the realistic field failure.

import { supabase } from './supabase'

const STORAGE_KEY = 'isotherm.checklist.outbox.v1'

/** After this many failed flushes while online, an op is treated as stuck, not merely
 *  pending — a validation/RLS failure would otherwise queue forever and look "pending". */
export const MAX_ATTEMPTS = 5

export type OutboxOp = {
  /** Natural-key identity. Re-editing the same field replaces its op rather than appending. */
  key: string
  /** Human label for the sync UI, e.g. "AHU-1 · Supply fan rotation". */
  label: string
  queuedAt: number
  attempts: number
} & (
  | { kind: 'upsert'; table: string; onConflict: string; payload: Record<string, unknown> }
  | { kind: 'update'; table: string; match: Record<string, unknown>; payload: Record<string, unknown> }
  /** Finding + its link, queued as ONE op so there is no cross-op ordering to manage.
   *  The finding carries a client-generated id, so the link can reference it offline. */
  | {
      kind: 'finding'
      finding: Record<string, unknown>
      link: { onConflict: string; payload: Record<string, unknown> }
    }
)

// ── Storage ────────────────────────────────────────────────────────────────

function read(): OutboxOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []  // corrupt storage must not brick the fill view
  }
}

function write(ops: OutboxOp[]): void {
  try {
    if (ops.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ops))
  } catch {
    // Quota exceeded — nothing useful to do here; the caller already surfaced an error.
  }
  notify()
}

// ── Subscription (drives the sync chip) ────────────────────────────────────

type Listener = (count: number) => void
const listeners = new Set<Listener>()

function notify(): void {
  const n = read().length
  for (const l of listeners) l(n)
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  listener(read().length)
  return () => { listeners.delete(listener) }
}

// ── Queue API ──────────────────────────────────────────────────────────────

export function pendingCount(): number {
  return read().length
}

export function pendingOps(): OutboxOp[] {
  return read()
}

/** Ops that have exhausted MAX_ATTEMPTS — these need the user's attention, not more waiting. */
export function stuckOps(): OutboxOp[] {
  return read().filter(o => o.attempts >= MAX_ATTEMPTS)
}

/** Omit must distribute over the union, or it collapses to the shared keys only. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type NewOutboxOp = DistributiveOmit<OutboxOp, 'queuedAt' | 'attempts'>

/** Queue a write. An op with the same key replaces the existing one, in place. */
export function enqueue(op: NewOutboxOp): void {
  const ops = read()
  const i = ops.findIndex(o => o.key === op.key)
  // A fresh edit resets attempts: the user changed the value, so it deserves a clean try.
  const full = { ...op, queuedAt: Date.now(), attempts: 0 } as OutboxOp
  if (i >= 0) ops[i] = full   // replace: bounded queue, last-write-wins, order preserved
  else ops.push(full)
  write(ops)
}

export function clear(): void {
  write([])
}

// ── Flush ──────────────────────────────────────────────────────────────────

async function runOp(op: OutboxOp): Promise<boolean> {
  try {
    if (op.kind === 'update') {
      const { error } = await supabase.from(op.table).update(op.payload).match(op.match)
      return !error
    }
    if (op.kind === 'finding') {
      // Idempotent on the finding's client-generated PK.
      const { error } = await supabase.from('findings').upsert(op.finding, { onConflict: 'id' })
      if (error) return false
      const { error: linkErr } = await supabase
        .from('checklist_finding_links')
        .upsert(op.link.payload, { onConflict: op.link.onConflict })
      return !linkErr
    }
    const { error } = await supabase.from(op.table).upsert(op.payload, { onConflict: op.onConflict })
    return !error
  } catch {
    return false  // network throw — keep the op queued
  }
}

let flushing = false

/** Replay queued ops in order. Ops that still fail stay queued. Safe to call anytime. */
export async function flushOutbox(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return { flushed: 0, remaining: read().length }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { flushed: 0, remaining: read().length }
  }

  flushing = true
  try {
    const ops = read()
    if (ops.length === 0) return { flushed: 0, remaining: 0 }

    let flushed = 0
    const remaining: OutboxOp[] = []
    let halted = false
    for (const op of ops) {
      // Preserve order: once one op fails, keep the rest queued rather than reordering
      // writes behind it. (A failure almost always means the connection is gone again.)
      // Stuck ops are skipped so one poison op can't block everything behind it.
      if (halted || op.attempts >= MAX_ATTEMPTS) { remaining.push(op); continue }
      if (await runOp(op)) {
        flushed++
      } else {
        remaining.push({ ...op, attempts: op.attempts + 1 })
        halted = true
      }
    }
    write(remaining)
    return { flushed, remaining: remaining.length }
  } finally {
    flushing = false
  }
}

/** Flush on reconnect, on an interval, and on mount. Returns an unsubscribe fn. */
export function startAutoFlush(intervalMs = 15_000): () => void {
  const onOnline = () => { void flushOutbox() }
  window.addEventListener('online', onOnline)
  const timer = setInterval(() => { void flushOutbox() }, intervalMs)
  void flushOutbox()
  return () => {
    window.removeEventListener('online', onOnline)
    clearInterval(timer)
  }
}
