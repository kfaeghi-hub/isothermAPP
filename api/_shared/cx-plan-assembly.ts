// Cx Plan assembly — THE THREE-ENGINE BOUNDARY, in code.
//
//   DETERMINISTIC  everything the database holds. Parameterised boilerplate with
//                  merge fields, the team table from the matrix, systems,
//                  deliverables, the project header. AI NEVER generates a fact
//                  the DB knows.
//   QUESTIONNAIRE  facts that exist only in the CxA's head, as structured answers.
//   NARRATIVE      AI, from questionnaire facts + project data + corpus slices.
//
// The boundary is enforced structurally: buildDeterministic() runs with no model
// involvement at all, and the narrative sections are merged in afterwards. The
// model is never handed the team table, so it cannot restate it wrongly — it is
// not given the opportunity, which is stronger than an instruction.
import type { Block } from './docx-skeleton.js'

export interface TeamRow {
  role_name: string | null; role_abbr: string | null
  company_name: string | null; contact_name: string | null
}
export interface PlanFacts {
  project: { name: string; com_number: string | null; address: string | null
             client_name: string | null; background_description: string | null
             cx_role_designation: 'CxA' | 'CxP' | null }
  team: TeamRow[]
  systems: string[]              // distinct equipment categories on the register
  submittals: string[]
  phases: string[]
  answers: Record<string, string>
  procedures: string[]           // selected procedure-library bullets
  options: { training: boolean; coordination: boolean; schedule: boolean
             ils: boolean; tab: boolean; qa: boolean }
  appendices: { letter: string; title: string; reference: string }[]
  tier: 'standard' | 'tender'
  revisionLabel: string          // "Rev 0" | "Rev 1 – Issued for Tender"
  docDate: string                // ISO
}

/** D1a: the designation expands ONE way each. "Agent" is retired. */
export function roleText(d: 'CxA' | 'CxP' | null): string {
  return d === 'CxP' ? 'Commissioning Provider (CxP)' : 'Commissioning Authority (CxA)'
}

/** The section list, in order, with its engine. The wizard, the review screen and
 *  the assembler all read THIS — one declaration, so a section cannot exist in
 *  the document and be missing from review. */
export interface SectionDef {
  key: string; title: string
  kind: 'boilerplate' | 'data' | 'narrative'
  tier?: 'tender'                 // tender-only
  option?: keyof PlanFacts['options']
}
export const SECTIONS: SectionDef[] = [
  { key: 'exec',        title: 'Executive Summary',                        kind: 'boilerplate' },
  { key: 'overview',    title: 'Project Overview',                         kind: 'boilerplate' },
  { key: 'background',  title: 'Background',                               kind: 'narrative' },
  { key: 'cxplan',      title: 'Commissioning Plan',                       kind: 'boilerplate' },
  { key: 'team',        title: 'Commissioning Team',                       kind: 'data' },
  { key: 'roles',       title: 'Roles and Responsibilities',               kind: 'narrative' },
  { key: 'process',     title: 'Commissioning Process Overview',           kind: 'narrative' },
  { key: 'install',     title: 'Installation and Startup Testing Procedures', kind: 'data' },
  { key: 'operational', title: 'Operational Testing',                      kind: 'narrative' },
  { key: 'training',    title: 'Training for Operation and Maintenance Staff', kind: 'boilerplate', option: 'training' },
  { key: 'coordination',title: 'Project Coordination',                     kind: 'boilerplate', option: 'coordination' },
  { key: 'ils',         title: 'Integrated Life Safety Systems Testing',   kind: 'narrative', tier: 'tender', option: 'ils' },
  { key: 'tab',         title: 'Testing, Adjusting and Balancing of Mechanical Systems', kind: 'narrative', tier: 'tender', option: 'tab' },
  { key: 'schedule',    title: 'Commissioning Schedule',                   kind: 'narrative', tier: 'tender', option: 'schedule' },
  { key: 'docs',        title: 'Documentation and Deliverables',           kind: 'data' },
  { key: 'qa',          title: 'Quality Assurance',                        kind: 'boilerplate', tier: 'tender', option: 'qa' },
  { key: 'conclusion',  title: 'Conclusion',                               kind: 'boilerplate' },
  { key: 'appendix',    title: 'Appendix',                                 kind: 'data' },
]

export function activeSections(facts: PlanFacts): SectionDef[] {
  return SECTIONS.filter(s => {
    if (s.tier === 'tender' && facts.tier !== 'tender') return false
    if (s.option && !facts.options[s.option]) return false
    return true
  })
}

/** Merge fields. One place, so a field cannot be spelled two ways. */
export function merge(template: string, facts: PlanFacts): string {
  const p = facts.project
  const map: Record<string, string> = {
    client: p.client_name ?? 'the Client',
    cx_role: roleText(p.cx_role_designation),
    project: p.name,
    scope: facts.answers.scope ?? 'the systems described in this plan',
    systems_list: facts.systems.length
      ? facts.systems.join(', ')
      : '',
  }
  return template.replace(/⟦(\w+)⟧/g, (_, k) => map[k] ?? '')
}

/**
 * DETERMINISTIC ASSEMBLY. No model. Given the same facts this returns the same
 * blocks, which is what lets the test assert the team table field-by-field
 * against the matrix.
 */
export function buildDeterministic(
  facts: PlanFacts, narrative: Record<string, string>,
): Block[] {
  const b: Block[] = []
  const p = facts.project
  const role = roleText(p.cx_role_designation)

  // ── Cover ────────────────────────────────────────────────────────────────
  b.push({ kind: 'title', text: 'Building Commissioning Plan' })
  b.push({ kind: 'cover', text: p.name })
  if (p.com_number) b.push({ kind: 'cover', text: `Document Number: ${p.com_number}` })
  b.push({ kind: 'cover', text: `${facts.revisionLabel} – ${facts.docDate}` })
  b.push({ kind: 'pagebreak' })
  b.push({ kind: 'toc' })
  b.push({ kind: 'pagebreak' })

  const sections = activeSections(facts)
  const N = (k: string) => (narrative[k] ?? '').trim()

  for (const s of sections) {
    // Sub-headings nest under Project Overview.
    const level: 1 | 2 = (s.key === 'background' || s.key === 'cxplan') ? 2 : 1
    if (s.key !== 'overview') b.push({ kind: 'heading', level, text: s.title })

    switch (s.key) {
      case 'exec':
        b.push({ kind: 'para', text: merge(
          `Isotherm Engineering Ltd. (Isotherm), as the independent ${role}, has been ` +
          `retained by ⟦client⟧ (the Client) for the commissioning of ⟦scope⟧. This project ` +
          `aims to enhance operational efficiency, reliability, and safety, and align with ` +
          `environmental sustainability goals.`, facts) })
        break

      case 'overview':
        b.push({ kind: 'heading', level: 1, text: s.title })
        break

      case 'background': {
        const text = N('background') || p.background_description || ''
        if (text) b.push({ kind: 'para', text })
        if (facts.systems.length) {
          b.push({ kind: 'para', text: merge(
            'Systems served by the new equipment include ⟦systems_list⟧.', facts) })
        }
        break
      }

      case 'cxplan':
        b.push({ kind: 'para', text: merge(
          `The Project Commissioning Plan (Cx Plan) describes the commissioning process for ` +
          `⟦project⟧. The goals, intent, requirements, and timing of the process are included ` +
          `in the plan to provide a guide on how the process is to be executed and documented. ` +
          `Additional detailed requirements and procedures are provided in the project ` +
          `specifications and the appendices of this Commissioning Plan. The contract documents ` +
          `describe the process and provide the construction checklists, test procedures, forms, ` +
          `and other requirements to guide the commissioning activities. The Final Commissioning ` +
          `Plan/Cx Report covers all components of the commissioning process, including the ` +
          `following:`, facts) })
        for (const t of ['Installation Checks', 'Initial Startup and Testing',
                         'Equipment Safeties Check', 'Control System Verification',
                         'Load Response Testing']) {
          b.push({ kind: 'bullet', text: t })
        }
        break

      case 'team':
        b.push({ kind: 'para', text:
          `A primary function and the key to an effective commissioning process is to ensure ` +
          `well-defined lines of communication between all parties involved in the project. ` +
          `Communication is maintained throughout the project through the conscious effort of ` +
          `the ${role} and contractors.` })
        b.push({ kind: 'para', text: 'The commissioning team is detailed in the table below:' })
        b.push({ kind: 'table',
          header: ['Role', 'Company', 'Contact'],
          // VERBATIM from the matrix. An unassigned seat renders TBD — a real
          // state the prose must not paper over.
          rows: facts.team.map(t => [
            `${t.role_name ?? '—'}${t.role_abbr ? ` | ${t.role_abbr}` : ''}`,
            t.company_name ?? 'TBD',
            t.contact_name ?? 'TBD',
          ]) })
        break

      case 'roles':
        b.push({ kind: 'para', text:
          `The Specifications and contract documents describe and explain the roles and ` +
          `responsibilities of those participating in the commissioning process. The Cx Plan ` +
          `here only explains the process and substantiates each team member's ` +
          `interrelationship. If questions arise, the specifications take precedence.` })
        if (N('roles')) b.push({ kind: 'para', text: N('roles') })
        break

      case 'install':
        b.push({ kind: 'para', text:
          `Installation checks and testing protocols will ensure the system and its components ` +
          `are installed correctly and function as intended. Procedures will include:` })
        for (const t of facts.procedures) b.push({ kind: 'bullet', text: t })
        break

      case 'operational':
        if (N('operational')) b.push({ kind: 'para', text: N('operational') })
        b.push({ kind: 'bullet', text: 'Functional Performance Testing (FPT) by Isotherm' })
        b.push({ kind: 'bullet', text: 'Training for Operation and Maintenance Staff (GC)' })
        b.push({ kind: 'bullet', text: 'Issue O&M Manual (GC)' })
        break

      case 'docs':
        b.push({ kind: 'para', text:
          `The turnover documentation at the end of the Commissioning Process is intended to ` +
          `leave a legacy of the scope and result of the works and complete documentation for ` +
          `the facility staff and the Owner to use for the operation and maintenance of the ` +
          `building.` })
        b.push({ kind: 'para', text:
          `Appendices shall contain acquired sequence documentation, logs, progress reports, ` +
          `deficiency lists, site visit reports, findings, unresolved issues, communications, etc.` })
        if (facts.submittals.length) {
          b.push({ kind: 'para', text: `The required contractors' submittals are:` })
          for (const t of facts.submittals) b.push({ kind: 'bullet', text: t })
        }
        break

      case 'conclusion':
        b.push({ kind: 'para', text:
          `This Commissioning Plan is a living document. It will be revised and reissued at ` +
          `key project milestones to reflect the current scope, team and schedule.` })
        break

      case 'appendix':
        // TITLED REFERENCES to the living records — never an embedded stale copy.
        for (const a of facts.appendices) {
          b.push({ kind: 'heading', level: 2, text: `Appendix ${a.letter} — ${a.title}` })
          b.push({ kind: 'para', text: a.reference })
        }
        break

      default:
        if (N(s.key)) b.push({ kind: 'para', text: N(s.key) })
        break
    }
  }
  return b
}
