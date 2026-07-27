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
  /** THE TOTAL GENERATION BUDGET, REASONING INCLUDED — not the length of the
   *  answer. These models think before they write and the thinking is drawn
   *  from here: a Cx Plan section that returns ~450 tokens of prose spends
   *  ~4,900 getting there. Budget an order of magnitude above the output you
   *  expect. Tokens are billed as USED, not as reserved, so headroom is free and
   *  a short ceiling costs a wasted call plus a failed feature. */
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
  /** Reasoning tokens. THESE COUNT AGAINST max_tokens AND ARE BILLED AS OUTPUT.
   *  On the first calibration failure the model spent 2998 of a 3000-token
   *  budget thinking and never emitted a single text block. */
  thinkingTokens: number
  /** Which content-block types came back. `['thinking']` with no `'text'` is the
   *  signature of a budget exhausted before the answer began. */
  blockTypes: string[]
  /** The API's own reason for stopping. `max_tokens` means the response was
   *  CUT OFF mid-sentence — and, for a JSON contract, mid-object. That is a
   *  budget failure, not a parse failure, and callers must be able to tell them
   *  apart: one is fixed by raising the ceiling, the other by fixing the prompt.
   *  Inferring it from `outputTokens === maxTokens` also works but is a guess;
   *  this is the API saying so. */
  stopReason: string | null
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
      // The default was 2000 — sized for prose, and therefore a trap armed for
      // whichever feature next omits maxTokens. 8000 is the smallest ceiling
      // that has been observed to leave room to reason AND answer on this
      // corpus. A caller with a genuinely short task should still pass its own.
      max_tokens: c.maxTokens ?? 8000,
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
  const blocks: any[] = j.content ?? []
  const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('')
  return {
    text,
    inputTokens: j.usage?.input_tokens ?? 0,
    outputTokens: j.usage?.output_tokens ?? 0,
    thinkingTokens: j.usage?.output_tokens_details?.thinking_tokens ?? 0,
    blockTypes: [...new Set(blocks.map(b => b.type))],
    model: j.model ?? MODEL,
    stopReason: j.stop_reason ?? null,
  }
}

/** Distinguishes the two ways a JSON contract fails, because they have different
 *  fixes and different messages. */
export type JsonFailure = 'thinking-overrun' | 'truncated' | 'unparseable' | 'wrong-shape'
export interface JsonOutcome<T> {
  ok: boolean
  value?: T
  failure?: JsonFailure
  /** The raw text, for the server log. Never returned to a browser. */
  raw?: string
}

/**
 * Parse a model's JSON response and VALIDATE ITS SHAPE.
 *
 * `parseJson` alone answered "did JSON.parse succeed" — which is not the
 * question. A response can parse cleanly and still be the wrong object, and a
 * truncated response fails identically to a fenced one while needing the
 * opposite fix. This separates all three.
 */
export function parseModelJson<T>(
  result: ModelResult, validate: (v: any) => v is T,
): JsonOutcome<T> {
  // The budget ran out DURING REASONING — the model never began its answer.
  // Distinct from a mid-sentence cut-off: the fix is a bigger ceiling, and the
  // raw text is empty so there is nothing to salvage or diagnose from.
  if (!result.blockTypes.includes('text') && result.blockTypes.includes('thinking')) {
    return { ok: false, failure: 'thinking-overrun', raw: '' }
  }
  if (result.stopReason === 'max_tokens') {
    return { ok: false, failure: 'truncated', raw: result.text }
  }
  const parsed = parseJson<any>(result.text)
  if (parsed === null) return { ok: false, failure: 'unparseable', raw: result.text }
  if (!validate(parsed)) return { ok: false, failure: 'wrong-shape', raw: result.text }
  return { ok: true, value: parsed }
}

/** Appended verbatim on the ONE automatic retry. Terse on purpose: a long
 *  scolding costs input tokens and changes the model's register. */
export const JSON_RETRY_REMINDER =
  '\n\nYour previous response could not be parsed. Return ONLY the JSON object. ' +
  'No code fences, no preamble, no commentary. Keep the prose within the stated ' +
  'sentence limit so the response is not cut off.'

/** Rough cost in cents. Rates are a deploy-time constant, not a live lookup —
 *  an approximate logged cost is useful; a failed call to price a call is not.
 *  NOTE: outputTokens INCLUDES thinking tokens, and thinking dominates on this
 *  workload (~4.9k of ~5.4k on a Roles draft). The logged cost is therefore
 *  already correct — but anyone reading it should know most of it is reasoning,
 *  not prose. */
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
  let raw = text.trim()

  // Strip code fences FIRST, and handle the unclosed case: a response cut off
  // mid-object often opens ```json and never closes it, so a closing-fence-
  // required regex misses exactly the responses most likely to be fenced.
  const closed = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (closed) raw = closed[1].trim()
  else raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  const start = raw.search(/[[{]/)
  if (start < 0) return null
  const body = raw.slice(start)
  try { return JSON.parse(body) as T } catch { /* fall through */ }

  // Last resort: trim to the outermost balanced brace. Recovers a response with
  // trailing commentary after valid JSON. Does NOT try to repair a truncated
  // object — a half-written document section must never be silently completed.
  let depth = 0, inStr = false, esc = false
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(body.slice(0, i + 1)) as T } catch { return null }
      }
    }
  }
  return null
}
