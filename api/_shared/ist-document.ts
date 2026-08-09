/**
 * IST DOCUMENT — one skeleton, two modes. CAN/ULC-S1001 Appendix C.
 *
 * PLAN mode   = the Integrated Testing Plan: sections 1-11 plus Attachment A,
 *               the BLANK forms, "for future test use".
 * REPORT mode = the Integrated Testing Report: the plan, PLUS the executive
 *               summary, the pre-completed-test table, the ongoing-testing log,
 *               and Attachment B, the same forms carrying results and sign-offs.
 *
 * ONE SKELETON, because the standard says the report CONSISTS OF the plan plus
 * the collected documentation plus the forms. Two generators would drift, and
 * the first thing to drift would be section numbering — which is the thing an
 * AHJ reads the document by.
 *
 * THE ATTACHMENT TABLES ARE NOT ONE SHAPE, and this is where a naive renderer
 * would bend the firm's document. Rendering follows `subject_kind`:
 *   · condition → No. | System Integration | Record of test | Notes
 *   · unit      → the same columns, subject is the machine
 *   · point     → an extra Equip. Type column carrying S.V./F.S./P.S./L.A.P.S.
 * A table whose protocols are all points gets the extra column; one with none
 * does not. That is exactly how A-1, A-2 and A-3 differ in the issued report.
 *
 * MONOCHROME. This is a generated document, so it uses DOC and nothing else;
 * DOC_SEMANTIC is the only colour a generated document may carry and this
 * document has no semantic colour to carry.
 */
import { esc, isoShort, BASE_CSS, FIRM_HEADER_PDF, DOC, footerBand } from './doc-common.js'

export type IstMode = 'plan' | 'report'

export interface IstProtocol {
  id: string; subject_kind: 'condition' | 'unit' | 'point'; subject_label: string
  condition_type: string | null; equip_type_code: string | null
  normal_mode_steps: string | null; fire_mode_steps: string | null; sort_order: number
}
export interface IstIntegration {
  id: string; integration_type: string; attachment_label: string | null
  normal_mode_behavior: string | null; offnormal_mode_behavior: string | null
  system_a: string; system_b: string; protocols: IstProtocol[]
}
export interface IstResult {
  protocol_id: string; normal_verdict: string | null; fire_verdict: string | null
  observed_text: string | null; tested_on: string | null
}
export interface IstDoc {
  project: { name: string; com_number?: string | null; address?: string | null }
  plan: { revision_label: string; revision_date: string | null; description: string | null }
  revisions: { revision_label: string; revision_date: string | null; description: string | null }[]
  systems: { label: string; overview_description: string | null; integrations_objectives: string | null }[]
  integrations: IstIntegration[]
  prerequisites: { item_no: number; category: string; description: string; state: string; evidence_reference?: string | null }[]
  precompleted: { subject_text: string; integration_type: string | null; documentation_ref: string | null; comments: string | null }[]
  sessions: { id: string; test_date: string; test_type: string; description: string | null; records_ref: string | null }[]
  participants: { session_id: string; role_label: string; company: string | null; name: string | null }[]
  results: IstResult[]
  signoffs: { attachment_label: string; company_text: string | null; name_text: string | null; signed_on: string | null }[]
  notes: { scope: string; integration_id: string | null; result_id: string | null; body: string; author_label: string | null }[]
  authored_by?: string | null
}

const CONDITION_LABEL: Record<string, string> = {
  alarm: 'Alarm Condition', supervisory: 'Supervisory Condition',
  trouble: 'Trouble Condition', connection_integrity: 'Connection Integrity',
}
const TEST_TYPE_LABEL: Record<string, string> = {
  new: 'New', one_year: 'One Year', five_year: 'Five Year', modification: 'Modification',
}
const TRI = (state: string, want: string) => (state === want ? '&#9746;' : '&#9744;')   // ☒ / ☐

export const IST_CSS = `${BASE_CSS}
  .sec-band { background: ${DOC.BAND}; color: #fff; font-weight: 700; font-size: 10pt;
              padding: 4px 10px; margin: 18px 0 8px 0; letter-spacing: .04em; }
  .sec-band .n { display: inline-block; width: 26px; }
  h3.sub { font-size: 10.5pt; font-weight: 700; margin: 12px 0 4px 0; }
  h4.sub2 { font-size: 10pt; font-weight: 700; margin: 8px 0 3px 0; }
  .kv { margin: 2px 0; }
  .kv .k { display: inline-block; width: 150px; color: #444; }
  table.att { margin-top: 6px; }
  table.att td, table.att th { font-size: 9pt; }
  .mode { text-align: right; white-space: nowrap; color: #333; }
  .verdict { white-space: nowrap; }
  .signoff { margin-top: 14px; }
  .signoff td { padding: 7px 10px; }
  .note-block { font-size: 9pt; }
  .contd { font-style: italic; color: #666; font-size: 9pt; margin-top: 4px; }
`

export const IST_FOOTER = footerBand(
  '<em>Isotherm Engineering Ltd. — Integrated Systems Testing of Fire Protection and Life Safety Systems</em>' +
  ' &nbsp;·&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span>')

// ── attachment table ─────────────────────────────────────────────────────────
/**
 * One attachment table. `results` is null in PLAN mode, which is what makes the
 * SAME function render Attachment A (empty boxes) and Attachment B (ticked) —
 * the checklist engine's blank/completed precedent, applied here.
 */
function attachmentTable(group: IstIntegration[], letter: string, n: number, results: IstResult[] | null, doc: IstDoc): string {
  // AN ATTACHMENT TABLE IS A GROUP, NOT AN INTEGRATION. Scarborough's matrix
  // carries NINE integration rows across THREE attachment tables: the Fire
  // Alarm / Fire Signal Receiving Centre pair alone contributes four rows
  // (alarm, supervisory, trouble, connection integrity) and they all land in
  // A-1. Rendering one table per integration would have produced nine
  // attachments and nine sign-off blocks where the firm issues three.
  // `attachment_label` is what groups them, which is why it is a column.
  const i = group[0]
  const protocols = group.flatMap(g => g.protocols)
  const hasPoints = protocols.some(p => p.subject_kind === 'point')
  const byId = new Map((results ?? []).map(r => [r.protocol_id, r]))

  const head = `<thead><tr>
      <th style="width:5%">No.</th>
      <th>${hasPoints ? 'FACP / FAAP Annunciation' : 'System Integration'}</th>
      ${hasPoints ? '<th style="width:12%">Equip. Type</th>' : ''}
      <th style="width:26%">Record of test</th>
      <th style="width:24%">Notes</th>
    </tr></thead>`

  const rows = protocols.map((p, idx) => {
    const r = byId.get(p.id)
    const box = (v: string | null | undefined, want: string) =>
      results === null ? '&#9744;' : (v === want ? '&#9746;' : '&#9744;')
    const label = p.subject_kind === 'condition'
      ? (CONDITION_LABEL[p.condition_type ?? ''] ?? p.subject_label)
      : p.subject_label
    const noteBits: string[] = []
    if (r?.tested_on) noteBits.push(`<em>Tested ${esc(isoShort(r.tested_on))}</em>`)
    if (r?.observed_text) noteBits.push(esc(r.observed_text))
    for (const nt of doc.notes.filter(x => x.scope === 'row' && x.result_id && r && x.result_id === (r as unknown as { id?: string }).id))
      noteBits.push(esc(nt.body))
    return `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${esc(label)}</td>
      ${hasPoints ? `<td style="text-align:center">${esc(p.equip_type_code ?? '')}</td>` : ''}
      <td>
        <div><span class="mode">Normal Mode</span> &nbsp; ${box(r?.normal_verdict, 'pass')} Pass &nbsp; ${box(r?.normal_verdict, 'fail')} Fail</div>
        <div><span class="mode">Fire Mode</span> &nbsp; ${box(r?.fire_verdict, 'pass')} Pass &nbsp; ${box(r?.fire_verdict, 'fail')} Fail</div>
      </td>
      <td class="note-block">${noteBits.join('<br>')}</td>
    </tr>`
  }).join('')

  // An attachment-scoped note spans the whole table — the B-3 shape, where one
  // note carried two engineers' determinations across five rows.
  const attNotes = doc.notes.filter(x => x.scope === 'attachment' && group.some(g => g.id === x.integration_id))
  const notesBlock = attNotes.length ? `<table class="att"><tbody><tr><td class="note-block">
      ${attNotes.map(nt => `${nt.author_label ? `<strong>${esc(nt.author_label)}:</strong> ` : ''}${esc(nt.body).replace(/\n/g, '<br>')}`).join('<br><br>')}
    </td></tr></tbody></table>` : ''

  const so = doc.signoffs.find(s => s.attachment_label === i.attachment_label)
  const title = `${i.system_a} / ${i.system_b}`
  const signoff = `<table class="att signoff"><tbody>
      <tr><td colspan="2" style="text-align:center;font-weight:700;background:${DOC.ZEBRA}">Integrated Systems Testing Completion Sign-Off</td></tr>
      <tr><td colspan="2" style="text-align:center;font-weight:700">${esc(title)} Integrations</td></tr>
      <tr><td colspan="2" style="font-size:8pt">As per CAN/ULC-S1001 standard, Integrated Systems Testing Forms are signed upon completion of the test protocol and procedure confirming that the participants in the Integrated Systems Testing concur with the results of the tests.</td></tr>
      <tr><td style="width:30%">Integrated Systems Testing Coordinator</td><td>Company: ${esc(results === null ? '' : (so?.company_text ?? ''))}</td></tr>
      <tr><td></td><td>Name: ${esc(results === null ? '' : (so?.name_text ?? ''))}</td></tr>
      <tr><td></td><td>Signature: ${esc(results === null ? '' : (so?.name_text ?? ''))} &nbsp;&nbsp;&nbsp; Date: ${esc(results === null || !so?.signed_on ? '' : isoShort(so.signed_on))}</td></tr>
    </tbody></table>`

  return `<div class="sec-band"><span class="n">${n}</span>TABLE ${letter} ${esc(title).toUpperCase()} INTEGRATIONS</div>
    <table class="att">${head}<tbody>${rows}</tbody></table>
    ${notesBlock}${signoff}`
}

// ── the document ─────────────────────────────────────────────────────────────
/** Integrations grouped into attachment tables, in first-appearance order.
 *  An integration with no attachment_label gets its own table rather than being
 *  silently merged into another — losing a sign-off block is worse than an
 *  extra one. */
function attachmentGroups(doc: IstDoc): IstIntegration[][] {
  const out: IstIntegration[][] = []
  const byLabel = new Map<string, IstIntegration[]>()
  for (const i of doc.integrations) {
    if (!i.attachment_label) { out.push([i]); continue }
    if (!byLabel.has(i.attachment_label)) { const g: IstIntegration[] = []; byLabel.set(i.attachment_label, g); out.push(g) }
    byLabel.get(i.attachment_label)!.push(i)
  }
  return out
}

export function buildIstHtml(doc: IstDoc, mode: IstMode): string {
  const isReport = mode === 'report'
  const R = doc.results
  let n = 0
  const band = (title: string) => `<div class="sec-band"><span class="n">${++n}</span>${title}</div>`

  const revisionTable = `<table><thead><tr><th style="width:12%">Rev.</th><th style="width:22%">Date</th><th>Description</th></tr></thead>
    <tbody>${doc.revisions.map(r => `<tr><td>${esc(r.revision_label)}</td><td>${esc(r.revision_date ? isoShort(r.revision_date) : '')}</td><td>${esc(r.description ?? '')}</td></tr>`).join('')}</tbody></table>`

  const execSummary = isReport ? `<div class="sec-band">EXECUTIVE SUMMARY</div>
    <p class="kv">${esc(doc.sessions.length ? isoShort(doc.sessions[doc.sessions.length - 1].test_date) : '')}</p>
    <p>Integrated System Testing was performed at ${esc(doc.project.name)} for the initial occupancies of this project${doc.project.address ? `, located at ${esc(doc.project.address)}` : ''}.</p>
    <p>This test is to implement CAN/ULC-S1001, <em>Integrated Systems Testing of Fire Protection and Life Safety Systems</em>.</p>
    <p>We are the independent Integrated Test Coordinator who created and carried out this Integrated System Test plan on ${esc(doc.sessions.map(s => isoShort(s.test_date)).join(', '))}. We are not involved in or responsible for the design or construction of the systems.</p>
    <p>Blank test form can be found in Attachment A for future test use. The detailed test results of this report are recorded in Attachment B.</p>
    <p>This testing does not remove or reduce the responsibilities of the designers and contractors or the warranty of the systems installed. The building owner is responsible for the operation and maintenance of the systems after project turn-over from construction. Integrated System Testing is to be re-tested in accordance with the testing frequency required by the Ontario Building Code.</p>
    ${doc.authored_by ? `<p style="margin-top:14px"><em>${esc(doc.authored_by)}</em><br>Isotherm Engineering Ltd.</p>` : ''}` : ''

  const systemsBlock = doc.systems.map(s => `
    <h3 class="sub">${esc(s.label)}</h3>
    ${s.overview_description ? `<h4 class="sub2">System Overview Description</h4><p>${esc(s.overview_description)}</p>` : ''}
    ${s.integrations_objectives ? `<h4 class="sub2">Systems Integrations &amp; Functional Objectives</h4><p>${esc(s.integrations_objectives)}</p>` : ''}`).join('')

  const matrix = `<table><thead><tr>
      <th style="width:14%">System A</th><th style="width:16%">System B</th><th style="width:14%">Integration Type</th>
      <th>Normal Mode</th><th>Off Normal / Fire Mode</th></tr></thead><tbody>
    ${doc.integrations.map(i => `<tr>
      <td>${esc(i.system_a)}</td><td>${esc(i.system_b)}</td><td>${esc(i.integration_type)}</td>
      <td>${esc(i.normal_mode_behavior ?? '')}</td><td>${esc(i.offnormal_mode_behavior ?? '')}</td></tr>`).join('')}
    </tbody></table>`

  const protocolsBlock = doc.integrations.map(i => `
    <h3 class="sub">${esc(i.system_a)} / ${esc(i.system_b)} Integrations</h3>
    ${i.protocols.map(p => `
      <h4 class="sub2">${esc(p.subject_kind === 'condition' ? (CONDITION_LABEL[p.condition_type ?? ''] ?? p.subject_label) : p.subject_label)} Test Procedure</h4>
      <table><tbody>
        <tr><td style="width:14%">Normal Mode</td><td>${esc(p.normal_mode_steps ?? '')}</td></tr>
        <tr><td>Fire Mode</td><td>${esc(p.fire_mode_steps ?? '')}</td></tr>
      </tbody></table>`).join('')}`).join('')

  // A THIRD COLUMN THE ISSUED DOCUMENT'S §9.1 DOES NOT HAVE — deliberate, and
  // recorded as a departure. The firm's §9.1 is two columns because the paper
  // form had nowhere to say where a document lives; §9.2 names its documentation
  // in a Comments column precisely because it needed to. This carries that
  // habit up into §9.1, which is what the reference-not-upload ruling asks for:
  // the claim names its evidence, and the reader can go find it.
  const prereqTable = `<table><thead><tr><th>Document Description</th><th style="width:24%">Document Received</th><th style="width:28%">Reference</th></tr></thead><tbody>
    ${[...new Set(doc.prerequisites.map(p => p.category))].map(cat => `
      <tr><td colspan="3" style="background:${DOC.ZEBRA};font-weight:600">${esc(cat)}</td></tr>
      ${doc.prerequisites.filter(p => p.category === cat).map(p => `<tr>
        <td>${p.item_no}. &nbsp; ${esc(p.description)}</td>
        <td>YES ${TRI(p.state, 'yes')} &nbsp; NO ${TRI(p.state, 'no')} &nbsp; N/A ${TRI(p.state, 'na')}</td>
        <td class="note-block">${esc(p.evidence_reference ?? '')}</td></tr>`).join('')}`).join('')}
    </tbody></table>`

  const ongoing = `<table><thead><tr><th style="width:14%">Date</th><th style="width:12%">Test Type</th><th>Description / Comments</th><th style="width:16%">Test Records</th></tr></thead><tbody>
    ${doc.sessions.map(s => `<tr><td>${esc(isoShort(s.test_date))}</td><td>${esc(TEST_TYPE_LABEL[s.test_type] ?? s.test_type)}</td><td>${esc(s.description ?? '')}</td><td style="text-align:center">${esc(s.records_ref ?? (isReport ? 'Attachment B' : ''))}</td></tr>`).join('')}
    ${Array.from({ length: Math.max(0, 8 - doc.sessions.length) }, () => '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('')}
    </tbody></table>`

  const participantsTable = (sessionId: string | null) => `<table><thead><tr><th style="width:34%">Role</th><th style="width:33%">Company</th><th>Name</th></tr></thead><tbody>
    ${(sessionId ? doc.participants.filter(p => p.session_id === sessionId) : []).map(p =>
      `<tr><td>${esc(p.role_label)}</td><td>${esc(p.company ?? '')}</td><td>${esc(p.name ?? '')}</td></tr>`).join('')
      || ['Integrated Systems Testing Coordinator', 'Owner’s Rep.', 'Mechanical, Electrical, and Fire Alarm Contractor', 'Fire Protection Contractor']
          .map(r => `<tr><td>${esc(r)}</td><td></td><td></td></tr>`).join('')}
    </tbody></table>`

  const GROUPS = attachmentGroups(doc)
  const checklistIndex = (letter: string) => `<table><thead><tr><th colspan="2">Integrated Systems Testing Checklist</th></tr></thead><tbody>
    ${GROUPS.map((g, k) => `<tr><td style="width:16%">Table ${letter}-${k + 1}</td><td>${esc(g[0].system_a)} / ${esc(g[0].system_b)} Integrations</td></tr>`).join('')}
    </tbody></table>`

  const lastSession = doc.sessions.length ? doc.sessions[doc.sessions.length - 1] : null

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${IST_CSS}</style></head><body><div class="page">
  ${FIRM_HEADER_PDF}

  <div class="phead">
    <div class="cell left">
      <div><span class="label">Project:</span> <span class="val">${esc(doc.project.name)}</span></div>
      <div><span class="label">Reference:</span> <span class="val">${esc(doc.project.com_number ?? '—')}</span></div>
    </div>
    <div class="cell mid"><span class="note">Integrated Systems Testing ${isReport ? 'Report' : 'Plan'}</span></div>
    <div class="cell right">
      <div><span class="label">Rev:</span> <span class="val">${esc(doc.plan.revision_label)}</span></div>
      <div><span class="label">Date:</span> <span class="val">${esc(doc.plan.revision_date ? isoShort(doc.plan.revision_date) : '')}</span></div>
    </div>
  </div>

  <div class="sec-band">REVISION CONTROL:</div>
  ${revisionTable}
  ${execSummary}

  ${band('ABBREVIATIONS AND DEFINITIONS')}
  <table><tbody>
    <tr><td style="width:8%">A/E</td><td>Architect and Design Engineers</td><td style="width:8%">EC</td><td>Electrical Contractor</td></tr>
    <tr><td>IST</td><td>Integrated System Testing</td><td>GC</td><td>General Contractor</td></tr>
    <tr><td>ITP</td><td>Integrated Test Plan</td><td>MC</td><td>Mechanical Contractor</td></tr>
    <tr><td>ITC</td><td>Integrated Test Coordinator</td><td>PM</td><td>Project Manager / Owner</td></tr>
  </tbody></table>

  ${band('PURPOSE OF THE INTEGRATED SYSTEMS TESTING REPORT')}
  <p>The purpose of the Integrated Systems Testing report is to provide the results of the Integrated Systems Testing Plan for ${esc(doc.project.name)}. The construction of this building conforms to the requirements of the Ontario Fire Code, the local Building Department, and the Ontario Building Code.</p>

  ${band('INTRODUCTION')}
  <p>This Integrated Systems Testing Plan provides the results of the implementation of CAN/ULC-S1001, <em>Integrated Systems Testing of Fire Protection and Life Safety Systems</em> for ${esc(doc.project.name)}${doc.project.address ? ` located at ${esc(doc.project.address)}` : ''}.</p>
  <h3 class="sub">Integrated Systems</h3>
  ${systemsBlock}

  ${band('INTEGRATIONS MATRIX')}
  <p>The general flow of information is shown in the following schematic.</p>
  ${matrix}

  ${band('TEST PROTOCOLS AND PROCEDURES')}
  ${protocolsBlock}

  ${band('NOTIFICATIONS')}
  <p>Integrated System Testing Participants shall be provided one (1) week&rsquo;s notice of the date and time of the implementation of the Integrated System Testing Plan.</p>
  <p>Building occupants shall be provided with 48 hours&rsquo; notice of the implementation of Integrated System Testing.</p>

  ${band('PERSONNEL SAFETY')}
  <p>Integrated Systems Testing will be implemented during the construction phase. Head, eye and ear protection, safety footwear and a safety vest are required for all participants as a minimum.</p>
  <p>In the event of the unexpected operation of a system which could harm a testing participant, a building occupant, or the system, testing shall be immediately suspended by broadcasting &ldquo;STAND DOWN, STAND DOWN, STAND DOWN&rdquo; over the radio system, followed by a description of the concern.</p>

  ${band('PHASED OCCUPANCIES')}
  <p>As per CAN/ULC-S1001, where a building is occupied in phases and an integrated Fire Protection and Life Safety System is complete and undergoes Integrated Systems Testing, the system integrations are not required to be retested for subsequent integrated systems tests provided ongoing construction does not impact previously tested system integrations.</p>

  ${band('PRE-TESTING OCCUPANCIES')}
  <h3 class="sub">Documentation for Integrated Systems Testing</h3>
  ${prereqTable}
  ${isReport ? `<h3 class="sub">Documentation for Pre-Completed Test Results</h3>
    <table><thead><tr><th>Integration</th><th style="width:18%">Integration Type</th><th style="width:24%">Pre-Completed Test Documentation</th><th style="width:22%">Comments</th></tr></thead><tbody>
    ${doc.precompleted.map(p => `<tr><td>${esc(p.subject_text)}</td><td>${esc(p.integration_type ?? '')}</td><td>${esc(p.documentation_ref ?? '')}</td><td>${esc(p.comments ?? '')}</td></tr>`).join('') || '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>'}
    </tbody></table>` : ''}

  ${band('TESTING FORMS')}
  <p>A Master Integrated Systems Testing Checklist was prepared for this project to record the Integrated Systems Testing of Fire Protection and Life Safety Systems, as outlined in the Integrated Systems Testing Plan. This Master Integrated Systems Testing Checklist has been included as <strong>Attachment A</strong>.</p>

  ${band('ONGOING INTEGRATED SYSTEMS TESTING')}
  <p>As required by CAN/ULC-S1001, the Integrated Systems Testing Plan for this project will be completed one year after completion of the initial Integrated Systems Testing and at five-year intervals after that.</p>
  ${ongoing}

  ${band('ATTACHMENT A MASTER INTEGRATED SYSTEMS TESTING CHECKLIST')}
  <p><strong>Master Integrated Systems Testing Checklists</strong></p>
  ${participantsTable(null)}
  ${checklistIndex('A')}
  ${GROUPS.map((g, k) => attachmentTable(g, `A-${k + 1}`, ++n, null, doc)).join('')}

  ${isReport ? `
  ${band('ATTACHMENT B RECORDING OF COMPLETED INTEGRATED SYSTEM TESTING')}
  <p><strong>Record of completed Integrated Systems Testing Checklist</strong></p>
  ${participantsTable(lastSession?.id ?? null)}
  ${checklistIndex('B')}
  ${GROUPS.map((g, k) => attachmentTable(g, `B-${k + 1}`, ++n, R, doc)).join('')}` : ''}

  </div></body></html>`
}
