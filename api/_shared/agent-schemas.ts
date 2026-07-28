// agent-schemas — the typed contracts an agent's input and output must satisfy.
//
// The registry file NAMES a schema; this module IS it. Keeping the validators in
// code rather than as JSON Schema in the front-matter is deliberate: a validator
// that runs is worth more than a specification that describes, and these run on
// every call — before the model is paid for the input, and before its output is
// allowed anywhere near a review surface.
//
// FAIL CLOSED. A validator returns false rather than coercing. The verification
// lesson stands behind this file: a check that cannot fail is not a check, and an
// output that "looks about right" is exactly what a shape mismatch feels like from
// the inside.

export type Validator<T> = (v: any) => v is T

const isStr  = (v: any): v is string  => typeof v === 'string' && v.length > 0
const isNum  = (v: any): v is number  => typeof v === 'number' && Number.isFinite(v)
const isArr  = (v: any): v is any[]   => Array.isArray(v)
const isObj  = (v: any): boolean      => !!v && typeof v === 'object' && !Array.isArray(v)
/** 0..1 inclusive. A confidence outside that range is a shape error, not a rounding
 *  quirk — it means the model is reporting on a scale nobody agreed to. */
const isConf = (v: any): v is number  => isNum(v) && v >= 0 && v <= 1

// ── writer ──────────────────────────────────────────────────────────────────
export interface WriterInput {
  section_key: string
  section_title: string
  section_intent?: string
  facts: Record<string, unknown>
  steering_note?: string
  constraints?: string[]
}
export interface WriterOutput {
  prose: string
  claims?: { text: string; supported_by: string }[]
}

export const WriterInput: Validator<WriterInput> = (v): v is WriterInput =>
  isObj(v) && isStr(v.section_key) && isStr(v.section_title) && isObj(v.facts)

export const WriterOutput: Validator<WriterOutput> = (v): v is WriterOutput =>
  isObj(v) && isStr(v.prose) && v.prose.trim().length > 0 &&
  (v.claims === undefined || isArr(v.claims))

// ── verifier ────────────────────────────────────────────────────────────────
export interface VerifierInput { prose: string; facts: Record<string, unknown> }
export interface VerifierOutput {
  flags: { span: string; claim: string; severity: string; why: string }[]
}

export const VerifierInput: Validator<VerifierInput> = (v): v is VerifierInput =>
  isObj(v) && isStr(v.prose) && isObj(v.facts)

// `flags` MUST be present, even empty. An absent array and an empty array mean
// different things — "the check did not run" versus "the check found nothing" —
// and collapsing them is precisely the bug that let a truncated verification read
// as a clean bill of health.
export const VerifierOutput: Validator<VerifierOutput> = (v): v is VerifierOutput =>
  isObj(v) && isArr(v.flags) &&
  v.flags.every((f: any) => isObj(f) && isStr(f.span) && isStr(f.severity))

// ── classifier ──────────────────────────────────────────────────────────────
export interface ClassifierInput {
  units: { tag: string; category?: string | null; equipment_type?: string | null
           descriptor?: string | null }[]
  stage_groups: { name: string; columns: string[] }[]
}
export interface ClassifierOutput {
  rules: { equipment_type: string; stage_group: string; column?: string | null
           applicable: boolean; rationale: string; confidence: number
           units_affected?: number; life_safety?: boolean }[]
  exceptions: { tag: string; stage_group: string; column?: string | null
                applicable: boolean; rationale: string; confidence: number
                life_safety?: boolean }[]
}

export const ClassifierInput: Validator<ClassifierInput> = (v): v is ClassifierInput =>
  isObj(v) && isArr(v.units) && v.units.length > 0 &&
  v.units.every((u: any) => isObj(u) && isStr(u.tag)) &&
  isArr(v.stage_groups) && v.stage_groups.every((g: any) => isObj(g) && isStr(g.name))

export const ClassifierOutput: Validator<ClassifierOutput> = (v): v is ClassifierOutput =>
  isObj(v) && isArr(v.rules) && isArr(v.exceptions) &&
  v.rules.every((r: any) => isObj(r) && isStr(r.equipment_type) && isStr(r.stage_group) &&
    typeof r.applicable === 'boolean' && isStr(r.rationale) && isConf(r.confidence)) &&
  v.exceptions.every((e: any) => isObj(e) && isStr(e.tag) && isStr(e.stage_group) &&
    typeof e.applicable === 'boolean' && isStr(e.rationale) && isConf(e.confidence))

/** ONE STAGE GROUP AT A TIME. The whole-matrix question ("work out every type
 *  against every group") has no natural stopping point, and the model reasoned
 *  until it exhausted any budget it was given — 15,999 thinking tokens and zero
 *  text, repeatedly. This asks a bounded question with a short answer: given ONE
 *  group, which types does it not apply to? The stage group is known by the
 *  caller and assembled deterministically afterwards, so the model never restates
 *  it and cannot get it wrong. */
export interface ClassifierGroupOutput {
  inapplicable: { equipment_type: string; rationale: string
                  confidence: number; life_safety?: boolean }[]
  // KEYED BY CATEGORY, NOT BY TAG. The input carries (equipment_type, category,
  // n, sample) and no tags whatsoever, so a tag is something this agent cannot
  // know. Asking for one produced ten proposals that resolved to no equipment and
  // would have ratified into silence. An agent must only be asked for keys its
  // declared input can actually supply.
  exceptions?: { category: string; equipment_type?: string; rationale: string
                 confidence: number; life_safety?: boolean }[]
}
export const ClassifierGroupOutput: Validator<ClassifierGroupOutput> = (v): v is ClassifierGroupOutput =>
  isObj(v) && isArr(v.inapplicable) &&
  v.inapplicable.every((r: any) => isObj(r) && isStr(r.equipment_type) &&
    isStr(r.rationale) && isConf(r.confidence)) &&
  (v.exceptions === undefined || (isArr(v.exceptions) &&
    v.exceptions.every((e: any) => isObj(e) && isStr(e.category) && isConf(e.confidence))))

export interface ClassifierGroupInput {
  stage_group: string
  columns: string[]
  types: { equipment_type: string | null; category: string | null
           n: number; sample: string | null }[]
}
export const ClassifierGroupInput: Validator<ClassifierGroupInput> = (v): v is ClassifierGroupInput =>
  isObj(v) && isStr(v.stage_group) && isArr(v.columns) && isArr(v.types) && v.types.length > 0

// ── extractor ───────────────────────────────────────────────────────────────
export interface ExtractorInput {
  source_kind: 'pdf' | 'image' | 'single_line'
  page: number
  content: string
  known_types: string[]
}
export interface ExtractorOutput {
  rows: { source_row?: number; tag: string; descriptor?: string | null
          proposed_category?: string | null; proposed_type?: string | null
          location?: string | null; area_served?: string | null
          nameplate?: Record<string, unknown> | null
          confidence: number; reasoning?: string }[]
  page_note?: string
}

export const ExtractorInput: Validator<ExtractorInput> = (v): v is ExtractorInput =>
  isObj(v) && isStr(v.source_kind) && isNum(v.page) && isStr(v.content) &&
  isArr(v.known_types)

export const ExtractorOutput: Validator<ExtractorOutput> = (v): v is ExtractorOutput =>
  isObj(v) && isArr(v.rows) &&
  v.rows.every((r: any) => isObj(r) && isStr(r.tag) && isConf(r.confidence))

// ── analyst (stub — declared so the registry validates end to end) ──────────
export interface AnalystInput  { project_id: string; scope: Record<string, unknown> }
export interface AnalystOutput { candidates: any[] }
export const AnalystInput: Validator<AnalystInput> = (v): v is AnalystInput =>
  isObj(v) && isStr(v.project_id)
export const AnalystOutput: Validator<AnalystOutput> = (v): v is AnalystOutput =>
  isObj(v) && isArr(v.candidates)

// ── librarian ───────────────────────────────────────────────────────────────
export interface LibrarianInput {
  clusters: { agent_key: string; scope: string
              corrections: { id: string; before?: string; after?: string }[] }[]
}
export interface LibrarianOutput {
  proposals: { scope: string; proposed: string; rationale: string
               evidence: { feedback_id: string; before?: string; after?: string }[]
               confidence: number }[]
}

export const LibrarianInput: Validator<LibrarianInput> = (v): v is LibrarianInput =>
  isObj(v) && isArr(v.clusters) &&
  v.clusters.every((c: any) => isObj(c) && isStr(c.agent_key) && isArr(c.corrections))

// EVIDENCE IS MANDATORY. A proposal without it is an opinion, and the ratification
// screen exists to weigh evidence — so an evidence-free proposal is rejected at the
// contract boundary rather than shown to a human who would have to take it on faith.
export const LibrarianOutput: Validator<LibrarianOutput> = (v): v is LibrarianOutput =>
  isObj(v) && isArr(v.proposals) &&
  v.proposals.every((p: any) => isObj(p) && isStr(p.scope) && isStr(p.proposed) &&
    isArr(p.evidence) && p.evidence.length > 0 && isConf(p.confidence))

// ── the lookup the runtime resolves contract names through ─────────────────
export const SCHEMAS: Record<string, Validator<any>> = {
  WriterInput, WriterOutput,
  VerifierInput, VerifierOutput,
  ClassifierInput, ClassifierOutput,
  ClassifierGroupInput, ClassifierGroupOutput,
  ExtractorInput, ExtractorOutput,
  AnalystInput, AnalystOutput,
  LibrarianInput, LibrarianOutput,
}
