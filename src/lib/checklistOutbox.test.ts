import { describe, it, expect, beforeEach, vi } from 'vitest'

// The outbox's only dependency is the supabase client. Mock it so these are pure
// unit tests of the queue's semantics — the properties the whole design rests on.
const calls: Array<{ table: string; op: string; payload: unknown }> = []
let failFrom: string | null = null   // table name that should fail, or null

vi.mock('./supabase', () => {
  const builder = (table: string) => ({
    upsert: (payload: unknown) => {
      calls.push({ table, op: 'upsert', payload })
      return Promise.resolve({ error: failFrom === table ? { message: 'offline' } : null })
    },
    update: (payload: unknown) => ({
      match: () => {
        calls.push({ table, op: 'update', payload })
        return Promise.resolve({ error: failFrom === table ? { message: 'offline' } : null })
      },
    }),
  })
  return { supabase: { from: (table: string) => builder(table) } }
})

import {
  enqueue, flushOutbox, pendingCount, pendingOps, clear, stuckOps, MAX_ATTEMPTS,
} from './checklistOutbox'

const response = (itemId: string, status: string) => ({
  key: `response:${itemId}:t1`,
  label: `item ${itemId}`,
  kind: 'upsert' as const,
  table: 'checklist_responses',
  onConflict: 'instance_id,item_id,target_id',
  payload: { instance_id: 'i1', item_id: itemId, target_id: 't1', status },
})

beforeEach(() => {
  localStorage.clear()
  clear()
  calls.length = 0
  failFrom = null
})

describe('queue semantics', () => {
  it('is bounded: re-editing the same field replaces its op instead of appending', () => {
    enqueue(response('a', 'y'))
    enqueue(response('a', 'n'))
    enqueue(response('a', 'na'))

    expect(pendingCount()).toBe(1)
    // Last write wins — which is what a form field means.
    expect((pendingOps()[0] as any).payload.status).toBe('na')
  })

  it('keeps distinct fields as distinct ops', () => {
    enqueue(response('a', 'y'))
    enqueue(response('b', 'n'))
    expect(pendingCount()).toBe(2)
  })

  it('preserves original position when replacing an op', () => {
    enqueue(response('a', 'y'))
    enqueue(response('b', 'n'))
    enqueue(response('a', 'na'))   // replace the first

    const keys = pendingOps().map(o => o.key)
    expect(keys).toEqual(['response:a:t1', 'response:b:t1'])
  })

  it('survives a reload: ops are read back from localStorage', () => {
    enqueue(response('a', 'y'))
    // pendingCount reads storage fresh, simulating a new page load.
    expect(pendingCount()).toBe(1)
    expect(localStorage.getItem('isotherm.checklist.outbox.v1')).toBeTruthy()
  })
})

describe('flush', () => {
  it('drains the queue when writes succeed', async () => {
    enqueue(response('a', 'y'))
    enqueue(response('b', 'n'))

    const { flushed, remaining } = await flushOutbox()

    expect(flushed).toBe(2)
    expect(remaining).toBe(0)
    expect(pendingCount()).toBe(0)
    expect(calls).toHaveLength(2)
  })

  it('keeps ops queued when the write fails — nothing is lost', async () => {
    failFrom = 'checklist_responses'
    enqueue(response('a', 'y'))

    const { flushed, remaining } = await flushOutbox()

    expect(flushed).toBe(0)
    expect(remaining).toBe(1)
    expect(pendingCount()).toBe(1)
  })

  it('replay is idempotent: flushing twice does not double-write a drained queue', async () => {
    enqueue(response('a', 'y'))
    await flushOutbox()
    await flushOutbox()
    // Second flush has nothing to do — the upsert is not re-issued.
    expect(calls).toHaveLength(1)
    expect(pendingCount()).toBe(0)
  })

  it('halts on first failure so later writes cannot overtake earlier ones', async () => {
    enqueue(response('a', 'y'))
    enqueue(response('b', 'n'))
    failFrom = 'checklist_responses'

    await flushOutbox()
    expect(pendingCount()).toBe(2)   // both retained, order intact
    expect(pendingOps().map(o => o.key)).toEqual(['response:a:t1', 'response:b:t1'])
  })

  it('recovers on reconnect: the same ops flush cleanly once writes succeed', async () => {
    failFrom = 'checklist_responses'
    enqueue(response('a', 'y'))
    enqueue(response('b', 'n'))
    await flushOutbox()
    expect(pendingCount()).toBe(2)

    failFrom = null                  // back online
    const { flushed, remaining } = await flushOutbox()

    expect(flushed).toBe(2)
    expect(remaining).toBe(0)
    expect(pendingCount()).toBe(0)
  })
})

describe('stuck ops', () => {
  it('marks an op stuck after MAX_ATTEMPTS so it cannot masquerade as pending forever', async () => {
    failFrom = 'checklist_responses'
    enqueue(response('a', 'y'))

    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushOutbox()

    expect(stuckOps()).toHaveLength(1)
    expect(pendingCount()).toBe(1)
  })

  it('a fresh edit resets attempts — the user changed the value, it deserves a clean try', async () => {
    failFrom = 'checklist_responses'
    enqueue(response('a', 'y'))
    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushOutbox()
    expect(stuckOps()).toHaveLength(1)

    enqueue(response('a', 'n'))      // user re-enters the value
    expect(stuckOps()).toHaveLength(0)
  })
})

describe('finding ops', () => {
  it('queues finding + link as one op and writes both on flush', async () => {
    enqueue({
      key: 'finding:item1:t1',
      label: 'Finding · leaking valve',
      kind: 'finding',
      finding: { id: 'client-uuid-1', project_id: 'p1', title: 'leaking valve' },
      link: {
        onConflict: 'instance_id,item_id,target_id',
        payload: { instance_id: 'i1', item_id: 'item1', target_id: 't1', finding_id: 'client-uuid-1' },
      },
    })

    const { flushed } = await flushOutbox()

    expect(flushed).toBe(1)
    expect(calls.map(c => c.table)).toEqual(['findings', 'checklist_finding_links'])
    // The link references the client-generated id — which is what makes offline findings work.
    expect((calls[1].payload as any).finding_id).toBe('client-uuid-1')
  })

  it('keeps the pair queued if the finding write fails', async () => {
    failFrom = 'findings'
    enqueue({
      key: 'finding:item1:t1',
      label: 'Finding · leaking valve',
      kind: 'finding',
      finding: { id: 'client-uuid-1', project_id: 'p1' },
      link: {
        onConflict: 'instance_id,item_id,target_id',
        payload: { instance_id: 'i1', item_id: 'item1', target_id: 't1', finding_id: 'client-uuid-1' },
      },
    })

    await flushOutbox()

    expect(pendingCount()).toBe(1)
    // The link must not be written without its finding.
    expect(calls.map(c => c.table)).toEqual(['findings'])
  })
})
