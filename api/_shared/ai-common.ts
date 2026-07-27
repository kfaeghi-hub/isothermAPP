// ai-common — the doc-common of AI. THE standing AI architecture for this system.
//
// TWO RULES, recorded in ARCHITECTURE and enforced by this module's shape:
//
//   1. FIRM KNOWLEDGE LIVES IN DOCUMENTS, NEVER IN WEIGHTS. No fine-tuning, ever.
//      Everything the model knows about Isotherm arrives as context that can be
//      shown, audited, corrected and diffed in a pull request.
//
//   2. EVERY AI FEATURE READS THIS MODULE. No feature carries a private prompt
//      that duplicates corpus content. The moment two features each hold their
//      own copy of the style rules they drift — the same failure that put the
//      portal column whitelists in portal_internal and the document palette in
//      DOC. This codebase has made that mistake's inverse three times; the
//      pattern is established.
//
// Corpus location is HYBRID (ruling D4): the files under firm-knowledge/ are the
// base, and DB rows (admin-editable procedure bullets, ratified corrections)
// merge OVER them at assembly time. The file always wins ties on identity and
// style; the DB only adds.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ── Corpus ───────────────────────────────────────────────────────────────────
// Vercel bundles files referenced statically. The corpus is read at cold start
// and cached for the lambda's life — it changes only on deploy, by design: a
// corpus edit is a PR, which is the whole point of rule 1.
const ROOT = join(process.cwd(), 'firm-knowledge')

let cache: Record<string, string> = {}
function corpus(rel: string): string {
  if (cache[rel] !== undefined) return cache[rel]
  const p = join(ROOT, rel)
  cache[rel] = existsSync(p) ? readFileSync(p, 'utf8') : ''
  if (!cache[rel]) console.warn(`[ai-common] corpus file missing: ${rel}`)
  return cache[rel]
}

/** The corpus version stamped onto every generation and every issued snapshot,
 *  so a document can always be traced to the knowledge that produced it. Vercel
 *  exposes the commit SHA; local falls back to 'dev'. */
export const knowledgeVersion = (): string =>
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'dev'

// ── Context slices ───────────────────────────────────────────────────────────
// A feature declares which slices it needs. It does NOT get to write its own
// identity or style text — that is what rule 2 forbids.
export type Slice =
  | 'identity' | 'style' | 'terminology' | 'domain-rules'
  | 'exemplar' | 'procedures'

const SLICE_FILES: Record<Exclude<Slice, 'exemplar' | 'procedures'>, string> = {
  identity: 'identity.md',
  style: 'style-card.md',
  terminology: 'terminology.md',
  'domain-rules': 'domain-rules.md',
}

export interface ContextRequest {
  feature: string                    // 'cx-plan' | 'fpt' | …  → contracts/<feature>.md
  slices: Slice[]
  exemplar?: string                  // e.g. 'cx-plan-standard'
  /** Admin-editable rows merged over the file corpus (ruling D4). */
  dbAdditions?: { procedures?: string[]; corrections?: string[] }
}

/**
 * Assemble the SYSTEM prompt for a feature. Deterministic and inspectable: the
 * same request always produces the same text, which is what makes a generation
 * reproducible from its snapshot.
 */
export function buildContext(req: ContextRequest): string {
  const parts: string[] = []

  for (const s of req.slices) {
    if (s === 'exemplar' || s === 'procedures') continue
    const body = corpus(SLICE_FILES[s])
    if (body) parts.push(body)
  }

  if (req.slices.includes('exemplar') && req.exemplar) {
    const body = corpus(join('exemplars', `${req.exemplar}.md`))
    if (body) parts.push(body)
  }

  if (req.slices.includes('procedures') && req.dbAdditions?.procedures?.length) {
    parts.push(
      '# Procedure bullets — project selection\n\n' +
      req.dbAdditions.procedures.map(b => `- ${b}`).join('\n'))
  }

  // The feature contract goes LAST so its hard constraints are the final thing
  // read before the task.
  const contract = corpus(join('contracts', `${req.feature}.md`))
  if (contract) parts.push(contract)

  if (req.dbAdditions?.corrections?.length) {
    parts.push(
      '# Ratified corrections\n\n' +
      'These were ratified after review-screen edits revealed a pattern. They\n' +
      'take precedence over the exemplars above.\n\n' +
      req.dbAdditions.corrections.map(c => `- ${c}`).join('\n'))
  }

  return parts.join('\n\n---\n\n')
}

// ── The one model call site ──────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.AI_MODEL ?? 'claude-sonnet-5'

export interface ModelCall {
  system: string
  user: string
  maxTokens?: number
}
// NO `temperature`. The current models reject it outright:
//   400 invalid_request_error — "`temperature` is deprecated for this model."
// It is deliberately absent from this interface rather than silently dropped, so
// a caller cannot pass one and believe it took effect. Determinism in the
// verification call comes from its framing and its separate context, not from a
// sampling parameter.
export interface ModelResult {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
}

export class AiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/**
 * The ONLY place this system talks to a model. Every feature goes through here,
 * so cost, model choice and failure handling have exactly one implementation.
 */
export async function callModel(c: ModelCall): Promise<ModelResult> {
  if (!ANTHROPIC_KEY) throw new AiError(503, 'AI is not configured on this deployment')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: c.maxTokens ?? 2000,
      system: c.system,
      messages: [{ role: 'user', content: c.user }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[ai-common] model call failed:', res.status, body.slice(0, 400))
    // Fail closed and legibly: the caller surfaces this to a human who can retry.
    throw new AiError(502, 'The drafting service did not respond. Nothing was saved.')
  }

  const j = await res.json() as any
  const text = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  return {
    text,
    inputTokens: j.usage?.input_tokens ?? 0,
    outputTokens: j.usage?.output_tokens ?? 0,
    model: j.model ?? MODEL,
  }
}

/** Rough cost in cents. Rates are a deploy-time constant, not a live lookup —
 *  an approximate logged cost is useful; a failed call to price a call is not. */
const RATE_PER_MTOK = { input: 300, output: 1500 }   // cents per million tokens
export function estimateCents(inputTokens: number, outputTokens: number): number {
  return +(
    (inputTokens / 1e6) * RATE_PER_MTOK.input +
    (outputTokens / 1e6) * RATE_PER_MTOK.output
  ).toFixed(4)
}

/** Every generation is logged. Non-fatal: a logging failure must never lose work
 *  the user already paid for and is looking at. */
export async function logGeneration(service: any, row: {
  feature: string; projectId: string | null; result: ModelResult
  createdBy: string | null
}): Promise<void> {
  const { error } = await service.from('ai_generations').insert({
    feature: row.feature,
    project_id: row.projectId,
    model: row.result.model,
    input_tokens: row.result.inputTokens,
    output_tokens: row.result.outputTokens,
    cost_cents: estimateCents(row.result.inputTokens, row.result.outputTokens),
    created_by: row.createdBy,
  })
  if (error) console.error('[ai-common] logGeneration failed (non-fatal):', error.message)
}

/** Models wrap JSON in prose or fences more often than they should. One parser,
 *  used by every feature, so no feature reinvents a fragile one. */
export function parseJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) return null
  try { return JSON.parse(raw.slice(start)) as T } catch { return null }
}
