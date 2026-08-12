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
import { SCHEMAS, type Validator } from './agent-schemas.js'

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

/** A page the model should LOOK at rather than read as text.
 *
 *  A PDF is not an image and must not be sent as one — the API takes it as a
 *  `document` block, which preserves its page structure and its embedded text.
 *  Flattening a typed PDF schedule into a picture would throw away the machine
 *  readable half of it and then charge for reading the pixels. */
export interface PageAttachment {
  base64: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf'
}
/** @deprecated kept so existing callers keep compiling; use PageAttachment. */
export type ImageAttachment = PageAttachment

export interface ModelCall {
  /** 'off' disables extended thinking for this call. Set from the agent's
   *  budget class, never by a call site — Law 4. */
  thinking?: 'off' | 'default'
  system: string
  /** A plain string, or content blocks when the call carries images. Blocks live
   *  HERE rather than at a call site because law 1 puts every model interaction
   *  in this module — a feature that hand-rolled an image request would be a
   *  second way to talk to the model, and two ways drift. */
  user: string | unknown[]
  /** THE TOTAL GENERATION BUDGET, REASONING INCLUDED — not the length of the
   *  answer. These models think before they write and the thinking is drawn
   *  from here: a Cx Plan section that returns ~450 tokens of prose spends
   *  ~4,900 getting there. Budget an order of magnitude above the output you
   *  expect. Tokens are billed as USED, not as reserved, so headroom is free and
   *  a short ceiling costs a wasted call plus a failed feature. */
  maxTokens?: number
  /** A backstop against a hung request, not a deadline. Defaults to 240s — under
   *  intake's maxDuration of 300 and above every call this system has been
   *  observed to make, so it names a hang rather than causing one. */
  timeoutMs?: number
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

  // A BACKSTOP, NOT A DEADLINE (2026-08-12, Phase 1).
  //
  // There was no timeout of any kind: a bare fetch with no AbortController, so a
  // hung request blocked until the platform killed the lambda — and a platform
  // kill has no message, no logged outcome, and no way for a caller to say what
  // happened. agent-schemas.ts already records a 170s call that returned nothing.
  //
  // 240s sits UNDER intake's maxDuration of 300 and ABOVE every call this system
  // has been observed to make, so it converts a hang into a named failure without
  // creating a new one. On the 60s functions the platform still wins, unchanged.
  // Self-verification doubles the number of calls per page, which is why this is
  // being closed before that lands rather than after.
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), c.timeoutMs ?? 240_000)
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
    signal: ac.signal,
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
      // EXTRACTION BUYS OUTPUT, NOT THINKING. Omitted, the model decides; on a
      // dense schedule it decided to spend two thirds of the budget thinking and
      // returned no rows at all.
      ...(c.thinking === 'off' ? { thinking: { type: 'disabled' } } : {}),
      system: c.system,
      messages: [{ role: 'user', content: c.user }],
    }),
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new AiError(504, 'The model did not answer within the time allowed. Nothing was saved.')
    }
    throw new AiError(502, 'The drafting service could not be reached. Nothing was saved.')
  } finally {
    clearTimeout(timer)
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// THE AGENT RUNTIME
//
// One brain, many agents, one keeper. Every model call in this system goes
// through runAgent — features compose agents, agents read the brain, and nothing
// writes without a human. The universal laws live in ARCHITECTURE; this is where
// four of them are ENFORCED rather than merely stated:
//
//   law 1  every agent reads the brain through ai-common
//          -> context is assembled from the contract's declared slices ONLY, so
//             a call site cannot widen what an agent sees.
//   law 4  budgets per class; parse failures fail closed with the raw logged
//          -> the ceiling comes from budget_class, never from a caller.
//   law 5  the verifier never shares context with what it verifies
//          -> verifier.md declares `slices: []`, and this runtime honours it.
//             The isolation is a data fact, not a habit at the call site.
//   law 6  no agent self-modifies
//          -> contracts are read-only here. Nothing in this file writes to
//             firm-knowledge/.
// ─────────────────────────────────────────────────────────────────────────────

/** A total generation budget INCLUDING reasoning, chosen by task shape rather
 *  than by a number a caller invents. Sized from measurement, not taste: a Cx
 *  Plan section returning ~450 tokens of prose spent ~4,900 getting there. */
/** A budget class defines TWO things, and the second one was missing.
 *
 *  REASONING CLASSES BUY THINKING. EXTRACTION CLASSES BUY OUTPUT.
 *
 *  A class that lets thinking eat the output budget fails on exactly its
 *  densest, highest-value inputs — which is the worst possible failure curve,
 *  because the page worth the most is the page that dies.
 *
 *  The evidence: Clairlea M-601 carries 88 units in four schedules. Sent whole
 *  it logged `outcome: truncated` at max_tokens 16,000 having spent **10,684 of
 *  them thinking**, leaving ~5,300 for the rows. Split into its four tables, two
 *  regions still failed — and NOT the biggest ones. The 510-item table succeeded
 *  in 119s; the 380-item table burned 170s and returned nothing. Failure did not
 *  follow size, so the variable was never the amount of work: it was how much
 *  thinking the model happened to spend.
 *
 *  The precedent is the classifier's, recorded in its own contract: a narrowed
 *  ceiling made it skip thinking, and the result was MORE complete and ten times
 *  faster. Deliberation is variance on a transcription task, not value.
 *
 *  So `extraction` disables thinking outright. Reading a table off a page is
 *  transcription; there is nothing to deliberate about, and every token spent
 *  deliberating is a row that does not get written. */
export const BUDGET_CLASS = {
  reasoning:  16000,   // compares many things against many rules
  prose:      10000,   // writes a few hundred words under a style card
  extraction:  8000,   // transcribes structure — PER PAGE, never per document
} as const
export type BudgetClass = keyof typeof BUDGET_CLASS

/** The thinking posture per class. `'off'` sends `thinking: { type: 'disabled' }`;
 *  `'default'` sends nothing and lets the model decide.
 *
 *  Ruled 2026-08-04. The ceiling is unchanged at 8,000 with the 16,000 retry —
 *  with thinking off the whole budget goes to rows, and thirty rows of JSON sit
 *  comfortably inside it. */
export const CLASS_THINKING: Record<BudgetClass, 'off' | 'default'> = {
  reasoning:  'default',
  prose:      'default',
  extraction: 'off',
}

export interface AgentContract {
  key: string
  purpose: string
  slices: Slice[]
  budgetClass: BudgetClass
  inputSchema: string
  outputSchema: string
  reviewSurface: string
  verifier: string | null
  /** GRADUATED AUTONOMY, forward-provisioned. Every category is fixed at tier 1 —
   *  individually ratified — and NO OTHER TIER IS IMPLEMENTED. The field exists so
   *  the decision has a home and the data has a shape; promotion is a future build
   *  justified by a future track record. */
  autonomyTier: number
  /** An optional NARROWER ceiling than the budget class. It may only reduce:
   *  widening would let a contract escape its class, which is the thing the class
   *  exists to prevent. */
  maxTokens?: number
  /** The proposal categories this agent emits. Declared here so the ledger and the
   *  health view carry one line PER CATEGORY from day one — classifier's
   *  applicability-rule and fire-integration are separate track records, and a
   *  future per-category ruling can only be made on data that was captured before
   *  anyone thought to ask for it. */
  proposalCategories: string[]
  costExpectation: string
}

/** Minimal front-matter reader. Deliberately not a YAML dependency: the contract
 *  front-matter is a fixed, flat key set, and a parser that accepts only what the
 *  registry is allowed to contain rejects a malformed contract rather than
 *  interpreting it generously. */
function parseFrontMatter(text: string, key: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) throw new AiError(500, `agent contract "${key}" has no front-matter block`)
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim())
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const contractCache: Record<string, AgentContract> = {}
const bodyCache: Record<string, string> = {}

/** The agent contract's PROSE — everything after the front-matter. This is the
 *  specialist's own instruction set, and it is what makes writer.md the single
 *  place the "what it never sees" guarantee is written. Front-matter is runtime
 *  configuration and is never sent to a model. */
function agentContractBody(agentKey: string): string {
  if (bodyCache[agentKey] !== undefined) return bodyCache[agentKey]
  const path = join(ROOT, 'agents', `${agentKey}.md`)
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : ''
  // Front-matter is delimited by a pair of `---` lines. Split on lines rather
  // than with a multiline regex: the corpus is authored on Windows and a regex
  // that forgets \r silently returns the whole file, front-matter included —
  // which would send runtime configuration to a model as if it were instruction.
  const lines = raw.split('\n')
  let body = raw
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (close > 0) body = lines.slice(close + 1).join('\n')
  }
  bodyCache[agentKey] = body.trim()
  return bodyCache[agentKey]
}

/** Resolve an agent's contract. Throws on a contract that names a budget class or
 *  a schema that does not exist — a registry typo becomes a startup error, not a
 *  silent fallback at 2am. */
export function loadAgent(agentKey: string): AgentContract {
  if (contractCache[agentKey]) return contractCache[agentKey]
  const path = join(ROOT, 'agents', `${agentKey}.md`)
  if (!existsSync(path)) throw new AiError(500, `no agent contract for "${agentKey}"`)
  const fm = parseFrontMatter(readFileSync(path, 'utf8'), agentKey)

  const slices = (fm.slices ?? '[]').replace(/^\[|\]$/g, '').split(',')
    .map(s => s.trim()).filter(Boolean) as Slice[]
  const budgetClass = (fm.budget_class ?? '') as BudgetClass
  if (!(budgetClass in BUDGET_CLASS)) {
    throw new AiError(500, `agent "${agentKey}" declares unknown budget_class "${fm.budget_class}"`)
  }
  for (const nm of [fm.input_schema, fm.output_schema]) {
    if (!nm || !SCHEMAS[nm]) {
      throw new AiError(500, `agent "${agentKey}" names schema "${nm}" which does not exist`)
    }
  }
  const tier = Number(fm.autonomy_tier ?? '1')
  // Tier 1 is the ONLY tier this build implements. A contract claiming otherwise
  // is refused rather than honoured — a field that silently permits what no code
  // enforces is worse than no field.
  if (tier !== 1) {
    throw new AiError(500,
      `agent "${agentKey}" declares autonomy_tier ${tier}; only tier 1 ` +
      `(individually ratified) is implemented`)
  }
  const c: AgentContract = {
    key: fm.key || agentKey,
    purpose: fm.purpose ?? '',
    slices,
    budgetClass,
    inputSchema: fm.input_schema,
    outputSchema: fm.output_schema,
    reviewSurface: fm.review_surface ?? '',
    verifier: !fm.verifier || fm.verifier === 'none' ? null : fm.verifier,
    autonomyTier: tier,
    maxTokens: fm.max_tokens ? Number(fm.max_tokens) : undefined,
    proposalCategories: (fm.proposal_categories ?? '[]').replace(/^\[|\]$/g, '')
      .split(',').map(x => x.trim()).filter(Boolean),
    costExpectation: fm.cost_expectation ?? '',
  }
  if (c.key !== agentKey) {
    throw new AiError(500, `agent contract "${agentKey}.md" declares key "${c.key}"`)
  }
  contractCache[agentKey] = c
  return c
}

export type AgentFailure =
  | 'contract-input'      // the caller's input did not satisfy the contract — no token spent
  | 'contract-output'     // the model returned the wrong shape — fail closed
  | JsonFailure

export interface AgentRun<T> {
  ok: boolean
  value?: T
  failure?: AgentFailure
  raw?: string
  usage: ModelResult | null
  budget: number
}

export interface RunAgentOpts {
  /** The task for THIS call — never identity or style, which arrive from the
   *  corpus. A call site that restates the style card is the drift this
   *  architecture exists to prevent. */
  task: string
  exemplar?: string
  dbAdditions?: ContextRequest['dbAdditions']
  // `budgetOverride` WAS HERE AND IS GONE (2026-08-12, Phase 1).
  //
  // It read `opts.budgetOverride ?? Math.min(c.maxTokens, classCeiling)` — two
  // lines under the comment "the number still comes from the registry, not the
  // caller" — so any call site could set any ceiling and escape its class
  // entirely. Law 4 was stated in a comment and contradicted by the line beneath
  // it, which is this codebase's oldest failure shape: a rule that lives only in
  // prose is not a rule the code follows.
  //
  // NO CALL SITE EVER PASSED IT. It was a loaded footgun in dead code, and it is
  // deleted rather than guarded, on the empty-Vercel-project precedent: a hazard
  // kept for symmetry is a hazard kept. A future caller that genuinely needs a
  // different ceiling changes its agent's `max_tokens` in the registry, where the
  // number is reviewable and belongs.
  //
  // The retry's `budget *= 2` is NOT the same thing and is deliberately untouched:
  // "the ceiling is unchanged at 8,000 with the 16,000 retry" is a ruling the
  // calibration campaign depends on. See BUDGET_CLASS above.
  /** One retry, matched to the failure. Pass false to disable. */
  retry?: boolean
  /** The FEATURE composing this agent — loads contracts/<feature>.md above the
   *  agent contract (D5). Omit for an agent invoked outside any feature. */
  feature?: string
  /** Pages the agent must SEE. Attached ahead of the task text, because a model
   *  reads an instruction better when it already has the thing being discussed.
   *
   *  An agent whose input declares an image and receives none is a law 9 failure
   *  — it was asked for keys nothing in its input could supply — so the caller
   *  asserts the two agree before spending a token. */
  images?: PageAttachment[]
}

/**
 * THE ONLY WAY A FEATURE TALKS TO A MODEL.
 *
 * Resolve the contract -> validate input -> assemble declared slices -> apply the
 * class budget -> call -> validate output fail-closed. Logging stays with the
 * caller (it holds the service client and the project id), but the row shape comes
 * from logAgentRun so cost reads per specialist.
 */
export async function runAgent<T>(
  agentKey: string, input: unknown, opts: RunAgentOpts,
): Promise<AgentRun<T>> {
  const c = loadAgent(agentKey)

  // 1. VALIDATE INPUT BEFORE SPENDING A TOKEN. A malformed call is the caller's
  //    bug, and discovering it after paying for 20k tokens of context helps nobody.
  const validIn = SCHEMAS[c.inputSchema] as Validator<unknown>
  if (!validIn(input)) {
    return { ok: false, failure: 'contract-input', usage: null, budget: 0 }
  }

  // 2. Context from the DECLARED slices only. An empty list means an empty system
  //    prompt — which is the verifier's whole guarantee, held here rather than
  //    remembered at each call site.
  //
  //    THREE LAYERS, in this order, and the order is the precedence:
  //      corpus slices        — identity, style, terminology (shared by all)
  //      the AGENT contract   — agents/<key>.md, this specialist's own rules
  //      the FEATURE contract — contracts/<feature>.md, when a caller names one
  //
  //    D5: the feature contract sits ABOVE the agent split. Features compose
  //    agents; a feature contract REFERENCES its agents and never restates their
  //    constraints, because two copies of a rule are two rules that will drift.
  let system = ''
  if (c.slices.length > 0) {
    const parts = [buildContext({
      feature: '__none__',                 // no contract here; added explicitly below
      slices: c.slices, exemplar: opts.exemplar, dbAdditions: opts.dbAdditions,
    })]
    const agentBody = agentContractBody(agentKey)
    if (agentBody) parts.push(agentBody)
    if (opts.feature) {
      const feat = corpus(join('contracts', `${opts.feature}.md`))
      if (feat) parts.push(feat)
    }
    system = parts.filter(Boolean).join('\n\n---\n\n')
  }

  // The class sets the ceiling; a contract may NARROW it (never widen). Law 4
  // holds either way — the number still comes from the registry, not the caller.
  const classCeiling = BUDGET_CLASS[c.budgetClass]
  const thinkingPosture = CLASS_THINKING[c.budgetClass]
  let budget = c.maxTokens ? Math.min(c.maxTokens, classCeiling) : classCeiling
  const text = `${opts.task}\n\n${JSON.stringify(input)}`
  // Images first, then the instruction. The text is kept separate so a retry can
  // append its JSON reminder without rebuilding the attachments.
  const withImages = (t: string): string | unknown[] =>
    opts.images?.length
      ? [
          ...opts.images.map(im => ({
            // The block TYPE follows the media type. Sending a PDF as an image
            // block is rejected by the API, and sending it as a picture would
            // discard the text layer it already carries.
            type: im.mediaType === 'application/pdf' ? 'document' : 'image',
            source: { type: 'base64', media_type: im.mediaType, data: im.base64 },
          })),
          { type: 'text', text: t },
        ]
      : t
  const user = withImages(text)
  const validOut = SCHEMAS[c.outputSchema] as Validator<T>

  let result = await callModel({ system, user, maxTokens: budget, thinking: thinkingPosture })
  let outcome = parseModelJson<T>(result, validOut)

  if (!outcome.ok && opts.retry !== false) {
    const ranOutOfRoom =
      outcome.failure === 'truncated' || outcome.failure === 'thinking-overrun'
    console.warn(`[runAgent:${agentKey}] ${outcome.failure} — retrying once ` +
      `(${ranOutOfRoom ? `budget ${budget} -> ${budget * 2}` : 'same budget, JSON reminder'}).` +
      `\nRaw:\n` + String(outcome.raw ?? '').slice(0, 2000))
    if (ranOutOfRoom) budget *= 2
    result = await callModel({
      system,
      user: ranOutOfRoom ? user : withImages(text + JSON_RETRY_REMINDER),
      maxTokens: budget,
      thinking: thinkingPosture,
    })
    outcome = parseModelJson<T>(result, validOut)
  }

  if (!outcome.ok) {
    console.error(`[runAgent:${agentKey}] ${outcome.failure} after retry. ` +
      `stop=${result.stopReason} out=${result.outputTokens} think=${result.thinkingTokens} ` +
      `blocks=${result.blockTypes.join('+') || 'none'} budget=${budget}\nRAW:\n` +
      String(outcome.raw ?? '').slice(0, 4000))
    // 'wrong-shape' means the output failed THIS agent's contract. Name it as a
    // contract failure so the log distinguishes "the model returned nonsense" from
    // "the model returned the wrong thing" — different fixes.
    const failure: AgentFailure =
      outcome.failure === 'wrong-shape' ? 'contract-output' : outcome.failure!
    return { ok: false, failure, raw: outcome.raw, usage: result, budget }
  }

  return { ok: true, value: outcome.value, usage: result, budget }
}

/** Log an agent run. FAILURES ARE LOGGED TOO: a run that produced nothing still
 *  cost money, and silence here would hide exactly the failures worth counting. */
export async function logAgentRun(service: any, row: {
  agentKey: string; feature: string; projectId: string | null
  run: AgentRun<any>; createdBy: string | null; runId?: string | null
}): Promise<void> {
  const u = row.run.usage
  const { error } = await service.from('ai_generations').insert({
    feature: row.feature,
    agent_key: row.agentKey,
    run_id: row.runId ?? null,
    project_id: row.projectId,
    model: u?.model ?? null,
    input_tokens: u?.inputTokens ?? 0,
    output_tokens: u?.outputTokens ?? 0,
    thinking_tokens: u?.thinkingTokens ?? 0,
    cost_cents: estimateCents(u?.inputTokens ?? 0, u?.outputTokens ?? 0),
    budget_class: loadAgent(row.agentKey).budgetClass,
    max_tokens: row.run.budget,
    outcome: row.run.ok ? 'ok' : (row.run.failure ?? 'unknown'),
    created_by: row.createdBy,
  })
  if (error) console.error('[ai-common] logAgentRun failed (non-fatal):', error.message)
}
