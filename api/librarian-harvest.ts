// api/librarian-harvest — the keeper's one action.
//
//   POST { min_cluster?: number, dry_run?: boolean } → { clusters, proposals }
//
// Reads the agent_feedback ledger, clusters human corrections by
// (agent_key, category), and asks the librarian agent to draft corpus changes
// where a pattern has actually formed.
//
// IT PROPOSES; IT NEVER WRITES TO THE BRAIN. Output lands in firm_corrections for
// ratification. Law 6 — no agent self-modifies, the librarian included — is why
// this endpoint has no path that touches firm-knowledge/ at all: not a flag, not
// an option. A ratified proposal is applied by a human as a PR or a row write.
//
// ADMIN ONLY. The harvest is a firm-level operation on firm-level knowledge.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applyCors, requireUser, AuthError } from './_shared/auth-common.js'
import { runAgent, logAgentRun, AiError } from './_shared/ai-common.js'
import type { LibrarianOutput } from './_shared/agent-schemas.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** A pattern, not a one-off. Three similar corrections is the threshold the
 *  EXTRACTION-PLAYBOOK loop settled on over 26 ratified rules — below it you are
 *  generalising from an incident. */
const DEFAULT_MIN_CLUSTER = 3

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const user = await requireUser(req, service)

    const { data: profile } = await service.from('user_profiles')
      .select('role').eq('id', user.userId).maybeSingle()
    if (!['admin', 'developer', 'owner'].includes(profile?.role ?? '')) {
      return res.status(403).json({ error: 'The harvest is an administrator action.' })
    }

    const minCluster = Number(req.body?.min_cluster ?? DEFAULT_MIN_CLUSTER)
    const dryRun = !!req.body?.dry_run

    // ── Only CORRECTIONS cluster ─────────────────────────────────────────────
    // An accepted draft is evidence the corpus is right; it belongs in the health
    // view, not in a proposal to change something. What the librarian reads is
    // where a human disagreed with an agent.
    const { data: rows, error } = await service.from('agent_feedback')
      .select('id, agent_key, category, subject_ref, disposition, before_text, after_text, evidence')
      .in('disposition', ['edited', 'rejected', 'dismissed'])
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return res.status(500).json({ error: error.message })

    const byKey = new Map<string, any[]>()
    for (const r of rows ?? []) {
      const k = `${r.agent_key}::${r.category}`
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k)!.push(r)
    }

    const clusters = [...byKey.entries()]
      .map(([k, items]) => ({
        agent_key: k.split('::')[0],
        scope: k.split('::')[1],
        corrections: items.map(i => ({
          id: i.id, before: i.before_text ?? undefined, after: i.after_text ?? undefined,
        })),
      }))
      .filter(c => c.corrections.length >= minCluster)

    if (clusters.length === 0) {
      return res.status(200).json({
        clusters: 0, proposals: 0,
        note: `No category has reached ${minCluster} corrections yet. ` +
              `Nothing to harvest — which is the correct outcome, not a failure.`,
      })
    }

    const harvestRun = randomUUID()
    const run = await runAgent<LibrarianOutput>('librarian', { clusters }, {
      task:
        'You are the keeper of this firm\'s knowledge base. Below are clusters of ' +
        'corrections a human made to agent proposals. For each cluster where a real ' +
        'pattern exists, draft ONE proposed change to the corpus that would prevent ' +
        'the correction recurring. Quote the specific corrections as evidence. If a ' +
        'cluster shows no coherent pattern, omit it — a proposal per cluster is not ' +
        'the goal. Return JSON only: { "proposals": [ { "scope": string, ' +
        '"proposed": string, "rationale": string, "evidence": [ { "feedback_id": ' +
        'string, "before": string, "after": string } ], "confidence": number } ] }',
    })
    await logAgentRun(service, {
      agentKey: 'librarian', feature: 'librarian:harvest', projectId: null,
      run, createdBy: user.userId, runId: harvestRun,
    })

    if (!run.ok) {
      return res.status(502).json({
        error: 'The harvest could not be read. Nothing was proposed.',
        reason: run.failure, retryable: true,
      })
    }

    const proposals = run.value!.proposals
    if (dryRun) {
      return res.status(200).json({ clusters: clusters.length, proposals, dry_run: true })
    }

    // Queue for ratification. Nothing here is applied.
    const inserted: string[] = []
    for (const p of proposals) {
      const { data, error: iErr } = await service.from('firm_corrections').insert({
        scope: p.scope,
        proposed: p.proposed,
        rationale: p.rationale,
        confidence: p.confidence,
        evidence: p.evidence,
        status: 'proposed',
        agent_key: 'librarian',
        category: 'corpus-proposal',
        harvest_run: harvestRun,
      }).select('id').single()
      if (iErr) { console.error('[librarian] proposal insert failed:', iErr.message); continue }
      inserted.push(data.id)
    }

    return res.status(200).json({
      harvest_run: harvestRun,
      clusters: clusters.length,
      proposals: inserted.length,
      cost_cents: run.usage
        ? Math.round((run.usage.inputTokens / 1e6 * 300 + run.usage.outputTokens / 1e6 * 1500) * 100) / 100
        : null,
    })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    if (err instanceof AiError)   return res.status(err.status).json({ error: err.message })
    console.error('librarian-harvest error:', err)
    return res.status(500).json({ error: err.message })
  }
}
