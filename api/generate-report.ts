// GENERATE-REPORT — two document families in one serverless function.
//
// WHY TWO. `api/` is at the platform's 12-function ceiling. That is physical,
// not a preference, and this codebase's established answer is an allow-list
// inside an existing function — the same reason `intake.ts` hosts the agent
// calls rather than each taking a slot. The next reader should FIND that here
// rather than infer it from a switch statement, which is why this paragraph
// exists.
//
//   document: 'site'  → the Cx Site Note (§ everything below)
//   document: 'ist'   → the CAN/ULC-S1001 Integrated Systems Testing plan/report
//
// Anything else is REFUSED loudly. An unknown document kind silently falling
// through to the site report would generate the wrong document under the right
// name, which is the failure mode this project keeps recording.
//
// The clean fix remains parked: folding the four portal endpoints into one
// router frees three slots — BACKBURNER, and deliberately its own session,
// because live security endpoints never get refactored as a side effect of a
// feature.
import { createClient } from '@supabase/supabase-js'
import {
  esc, isoShort, isoLong, isFilenameCaption, toBase64, primaryEmail,
  BASE_CSS, FIRM_HEADER_PDF, FIRM_HEADER_DOCX, toPdf, toDocx, uploadDocPair, footerBand,
  DOC, DOC_SEMANTIC,
} from './_shared/doc-common.js'
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
import { gridsFromHtmlTables } from './_shared/docx-tables.js'
import { buildIstHtml, IST_FOOTER, type IstMode } from './_shared/ist-document.js'
import { assembleIstDoc } from './_shared/ist-assemble.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const DISCLAIMER =
  'This information is for the sole use of the client and is a best reflection of the discussions that were recorded or added as a result of a site meeting or site review. Please forward any discrepancy or disagreement to Isotherm Engineering Ltd. as soon as possible.'

// ── helpers ────────────────────────────────────────────────────────────────────

function statusHtml(status: string): string {
  const t = (status ?? '').toUpperCase().replace('_', ' ')
  if (status === 'received')    return `<span class="st-rec">${t}</span>`
  if (status === 'outstanding') return `<span class="st-out">${t}</span>`
  return `<span class="st-na">${t || 'N/A'}</span>`
}

// ── CSS (matches site_report_mockup.html exactly; base rules shared) ──────────

const CSS = `${BASE_CSS}
  .intro     { margin: 12px 0 2px 0; font-style: italic; color: #333; }
  .narrative { padding: 2px 0; margin: 4px 0; }
  .none      { font-style: italic; color: #888; font-size: 9.5pt; margin-top: 4px; }

  /* status */
  .st-out { color: ${DOC_SEMANTIC.OUTSTANDING}; font-weight: 600; }
  .st-rec { color: ${DOC_SEMANTIC.RECORDED}; font-weight: 600; }
  .st-na  { color: #888; }

  /* issues table */
  table.issues th.num { width: 6%;  text-align: center; }
  table.issues th.act { width: 14%; text-align: center; }
  table.issues td.num { text-align: center; font-weight: 700; color: ${DOC.INK}; }
  table.issues td.act { text-align: center; font-weight: 600; color: #444; }

  /* finding content */
  .cat    { font-weight: 700; color: ${DOC.INK}; font-size: 9.5pt; display: block; margin-bottom: 4px; }
  .cattag { font-size: 8pt; color: #999; display: block; margin-top: -2px; margin-bottom: 6px; }
  .dentry { margin-bottom: 7px; }
  .ddate  { font-style: italic; color: #767676; font-size: 8.5pt; }
  .dtext  { margin-top: 1px; }
  /* register lines — rendered only when the field is present */
  .floc   { font-size: 8pt; color: #767676; margin: -2px 0 4px 0; }
  .fdesc  { margin: 2px 0 6px 0; }
  .fcorr  { font-size: 8.5pt; margin: 4px 0 2px 0; }
  .fcorr .lbl { font-weight: 700; color: ${DOC.INK}; }
  tr.closed .fcorr .lbl { color: #777; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 8px 0; }
  .photo-grid-item { display: flex; flex-direction: column; align-items: flex-start; }
  .photo-grid-item img { width: 140px; height: 105px; object-fit: cover; border-radius: 3px; display: block; }
  .photo-cap  { font-size: 7.5pt; font-style: italic; color: #777; margin-top: 2px; max-width: 140px; }
  .closeddate { font-style: italic; font-size: 8.5pt; color: #888; margin-top: 6px; }

  /* closed rows */
  tr.closed td         { background: ${DOC_SEMANTIC.CLOSED_FILL} !important; color: #777; }
  tr.closed .cat       { color: #777; }
  tr.closed td.num     { color: #777; }
  tr.closed td.act     { color: #777; }
  .closedtag           { display: block; font-size: 8pt; font-weight: 700; color: #888; }

`

// ── HTML builder ───────────────────────────────────────────────────────────────

function buildHtml(
  project: any, report: any,
  distribution: any[], findings: any[],
  photoBuffers: Map<string, Buffer>,
): string {
  const distRows = distribution.map((r: any) => {
    // Supabase may return the joined contact as an object or single-element array
    const c  = Array.isArray(r.contacts)  ? r.contacts[0]  : r.contacts
    const co = Array.isArray(c?.companies) ? c?.companies[0] : c?.companies
    return `<tr><td>${esc(c?.name)}</td><td>${esc(co?.name)}</td><td>${esc(co?.abbreviation)}</td><td>${esc(primaryEmail(c))}</td></tr>`
  }).join('\n')

  const docItems: any[] = report.doc_register ?? []
  const docSection = docItems.length > 0
    ? `<table>
        <thead><tr>
          <th style="width:55%">Documents</th>
          <th style="width:25%">Status</th>
          <th style="width:20%">Issues Log Item #</th>
        </tr></thead>
        <tbody>${docItems.map((item: any) =>
          `<tr><td>${esc(item.label)}</td><td>${statusHtml(item.status)}</td><td>${esc(item.finding_number ?? '—')}</td></tr>`
        ).join('\n')}</tbody>
      </table>`
    : `<p class="none">No documentation items recorded.</p>`

  // Verify every doc row made it into the HTML — each data row has exactly one </tr> in tbody.
  // The thead contributes one </tr>, so subtract 1.
  if (docItems.length > 0) {
    const renderedDocRows = (docSection.match(/<\/tr>/g) ?? []).length - 1
    if (renderedDocRows !== docItems.length) {
      console.error(`[report] DOC ROW MISMATCH: input=${docItems.length} rendered=${renderedDocRows}`)
    }
  }

  const findingRows = findings.map((f: any) => {
    const closed      = f.status === 'closed'
    const entries     = [...(f.finding_diary_entries ?? [])].sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const fContact  = Array.isArray(f.contacts)         ? f.contacts[0]         : f.contacts
    const fCompany  = Array.isArray(fContact?.companies) ? fContact?.companies[0] : fContact?.companies
    const responsible = fCompany?.abbreviation ?? fContact?.trade ?? '—'
    const headingText = f.title || f.category
    const hasTitle    = !!(f.title)

    const diaryHtml = entries.map((e: any) =>
      `<div class="dentry"><div class="ddate">${esc(isoShort(e.entry_date))}</div><div class="dtext">${esc(e.body ?? '')}</div></div>`
    ).join('')

    const photoItems = (f.finding_photos ?? []).map((ph: any) => {
      const buf = photoBuffers.get(ph.id)
      if (!buf) return ''
      const b64  = toBase64(buf)
      const cap  = isFilenameCaption(ph.caption) ? '' : (ph.caption ?? '')
      return `<div class="photo-grid-item"><img src="data:image/jpeg;base64,${b64}" alt="">${cap ? `<div class="photo-cap">${esc(cap)}</div>` : ''}</div>`
    }).filter(Boolean)
    const photosHtml = photoItems.length > 0 ? `<div class="photo-grid">${photoItems.join('')}</div>` : ''

    const closedDateHtml = closed && f.date_closed
      ? `<div class="closeddate">Closed: ${esc(isoShort(f.date_closed))}</div>` : ''

    // Register lines render ONLY when present — historical findings with all
    // register columns null must produce identical bytes on regeneration.
    const locationHtml = f.building_area
      ? `<div class="floc">Location: ${esc(f.building_area)}</div>` : ''
    const descHtml = f.description
      ? `<div class="fdesc">${esc(f.description)}</div>` : ''
    const corrHtml = f.corrective_action
      ? `<div class="fcorr"><span class="lbl">Corrective action:</span> ${esc(f.corrective_action)}</div>` : ''

    return `<tr${closed ? ' class="closed"' : ''}>
      <td class="num">${esc(f.number)}${closed ? '<span class="closedtag">CLOSED</span>' : ''}</td>
      <td>
        <span class="cat">${esc(headingText)}</span>
        ${hasTitle ? `<span class="cattag">${esc(f.category)}</span>` : ''}
        ${locationHtml}${descHtml}${diaryHtml}${photosHtml}${corrHtml}${closedDateHtml}
      </td>
      <td class="act">${esc(responsible)}</td>
    </tr>`
  }).join('\n')

  // Verify every finding made it into the HTML — each row closes with </tr>.
  const renderedFindingRows = (findingRows.match(/<\/tr>/g) ?? []).length
  if (renderedFindingRows !== findings.length) {
    console.error(`[report] FINDING ROW MISMATCH: input=${findings.length} rendered=${renderedFindingRows}`)
  }

  const narrativeHtml = (report.progress_narrative ?? '').split('\n').map((line: string) =>
    `<p class="narrative">${esc(line) || '&nbsp;'}</p>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${CSS}</style>
</head>
<body>
<div class="page">

  ${FIRM_HEADER_PDF}

  <div class="phead">
    <div class="cell left">
      <div><span class="label">Project:</span> <span class="val">${esc(project.name)}</span></div>
      <div><span class="label">Reference:</span> <span class="val">${esc(project.com_number ?? '—')}</span></div>
    </div>
    <div class="cell mid"><span class="note">Cx Site Note #${esc(report.report_number)}</span></div>
    <div class="cell right">
      <div><span class="label">Date:</span> <span class="val">${esc(isoShort(report.report_date))}</span></div>
      <div><span class="label">By:</span> <span class="val">${esc(report.authored_by)}</span></div>
    </div>
  </div>

  <h2 class="sec">Distribution</h2>
  <table>
    <thead><tr><th>Name</th><th>Company</th><th>ABRV</th><th>Email</th></tr></thead>
    <tbody>${distRows}</tbody>
  </table>

  <p class="intro">${esc(report.authored_by)} made the following site review observations on ${esc(isoLong(report.site_visit_date))}:</p>

  <h2 class="sec">Site Progress Observations</h2>
  ${narrativeHtml}

  <h2 class="sec">Required Documentations</h2>
  ${docSection}

  <h2 class="sec">Observed Issues &amp; Progress &nbsp;&mdash;&nbsp; Site Notes #${esc(report.report_number)}: ${esc(isoShort(report.site_visit_date))}</h2>
  <table class="issues">
    <thead><tr><th class="num">#</th><th>Issue Details</th><th class="act">Action</th></tr></thead>
    <tbody>${findingRows}</tbody>
  </table>

</div>

</body>
</html>`
}

// PDF footer: the disclaimer rides in Puppeteer's footer zone on every page.
// The band wrapper (shared) owns the geometry — reserve size and how far the
// rule is sunk into it — so no family can reserve the allowance and then paint
// over it. This file supplies only the words.
const PDF_FOOTER = footerBand(`<em>${DISCLAIMER}</em>`)

// ── DOCX-specific HTML builder ────────────────────────────────────────────────
// Generates a Word-friendly HTML using real <table> elements and inline styles
// instead of CSS classes / display:table divs. buildHtml() is left untouched
// for PDF — this is a separate path so neither output affects the other.

// Returns the HTML plus each TOP-LEVEL table's column proportions in emission
// order (the D1 treatment, owner-ruled onto this family 2026-08-16): the
// per-finding photo tables are NESTED inside issue cells and deliberately
// undeclared — images size themselves, and the shared patcher leaves nested
// tables exactly as emitted.
function buildDocxHtml(
  project: any, report: any,
  distribution: any[], findings: any[],
  photoBuffers: Map<string, Buffer>,
): { html: string; tableGrids: number[][] } {
  const TH = `style="background-color:${DOC.BAND};color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid ${DOC.INK};font-size:9pt;"`
  const td  = (i: number, extra = '') =>
    `style="padding:6px 10px;border:1px solid ${DOC.RULE};vertical-align:top;${i%2===1 ? `background-color:${DOC.ZEBRA};` : ''}${extra}"`

  const distRows = distribution.map((r: any, i: number) => {
    const c  = Array.isArray(r.contacts)  ? r.contacts[0]  : r.contacts
    const co = Array.isArray(c?.companies) ? c?.companies[0] : c?.companies
    return `<tr>
      <td ${td(i)}>${esc(c?.name)}</td>
      <td ${td(i)}>${esc(co?.name)}</td>
      <td ${td(i)}>${esc(co?.abbreviation)}</td>
      <td ${td(i)}>${esc(primaryEmail(c))}</td>
    </tr>`
  }).join('\n')

  const docItems: any[] = report.doc_register ?? []
  const docSection = docItems.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
        <thead><tr>
          <th ${TH}>Documents</th>
          <th ${TH}>Status</th>
          <th ${TH}>Issues Log Item #</th>
        </tr></thead>
        <tbody>${docItems.map((item: any, i: number) =>
          `<tr>
            <td ${td(i)}>${esc(item.label)}</td>
            <td ${td(i)}>${statusHtml(item.status)}</td>
            <td ${td(i)}>${esc(item.finding_number ?? '—')}</td>
          </tr>`
        ).join('\n')}</tbody>
      </table>`
    : `<p style="font-style:italic;color:#888;font-size:9.5pt;">No documentation items recorded.</p>`

  const findingRows = findings.map((f: any, rowIdx: number) => {
    const closed      = f.status === 'closed'
    const entries     = [...(f.finding_diary_entries ?? [])].sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const fContact    = Array.isArray(f.contacts)         ? f.contacts[0]         : f.contacts
    const fCompany    = Array.isArray(fContact?.companies) ? fContact?.companies[0] : fContact?.companies
    const responsible = fCompany?.abbreviation ?? fContact?.trade ?? '—'
    const headingText = f.title || f.category
    const hasTitle    = !!(f.title)
    const rowBg       = closed ? `${DOC_SEMANTIC.CLOSED_FILL}` : (rowIdx % 2 === 1 ? `${DOC.ZEBRA}` : '#ffffff')
    const rowFg       = closed ? `${DOC_SEMANTIC.CLOSED_TEXT}` : '#222222'

    const tdBase = `style="padding:6px 10px;border:1px solid ${DOC.RULE};vertical-align:top;background-color:${rowBg};color:${rowFg};"`
    const tdNum  = `style="padding:6px 10px;border:1px solid ${DOC.RULE};vertical-align:top;text-align:center;font-weight:bold;background-color:${rowBg};color:${closed ? `${DOC_SEMANTIC.CLOSED_TEXT}` : `${DOC.INK}`};"`
    const tdAct  = `style="padding:6px 10px;border:1px solid ${DOC.RULE};vertical-align:top;text-align:center;font-weight:bold;background-color:${rowBg};color:${rowFg};"`

    const diaryHtml = entries.map((e: any) =>
      `<p style="margin:4px 0;"><em style="color:#767676;font-size:8.5pt;">${esc(isoShort(e.entry_date))}</em><br>${esc(e.body ?? '')}</p>`
    ).join('')

    const allPhotos = (f.finding_photos ?? []).map((ph: any) => {
      const buf = photoBuffers.get(ph.id)
      if (!buf) return null
      return { b64: toBase64(buf), cap: isFilenameCaption(ph.caption) ? '' : (ph.caption ?? '') }
    }).filter(Boolean) as { b64: string; cap: string }[]
    // 2-per-row table for DOCX (flexbox not supported by html-to-docx)
    let photosHtml = ''
    if (allPhotos.length > 0) {
      const rows: string[] = []
      for (let i = 0; i < allPhotos.length; i += 2) {
        const cell = (ph: { b64: string; cap: string }) =>
          `<td style="padding:4px;vertical-align:top;">${ph.cap ? `<p style="font-size:8pt;font-style:italic;color:#777;margin:0 0 2px 0;">${esc(ph.cap)}</p>` : ''}<img src="data:image/jpeg;base64,${ph.b64}" style="max-width:200px;" alt=""></td>`
        const row = allPhotos[i + 1]
          ? `<tr>${cell(allPhotos[i])}${cell(allPhotos[i + 1])}</tr>`
          : `<tr>${cell(allPhotos[i])}<td></td></tr>`
        rows.push(row)
      }
      photosHtml = `<table style="border-collapse:collapse;margin:6px 0 8px 0;"><tbody>${rows.join('')}</tbody></table>`
    }

    const closedTag = closed && f.date_closed
      ? `<br><span style="font-size:8pt;font-weight:bold;color:#888;">CLOSED: ${esc(isoShort(f.date_closed))}</span>` : ''

    // Register lines render ONLY when present (byte-clean regen for historical findings).
    const locationHtml = f.building_area
      ? `<p style="margin:2px 0 4px 0;font-size:8pt;color:#767676;">Location: ${esc(f.building_area)}</p>` : ''
    const descHtml = f.description
      ? `<p style="margin:2px 0 6px 0;">${esc(f.description)}</p>` : ''
    const corrHtml = f.corrective_action
      ? `<p style="margin:4px 0 2px 0;font-size:8.5pt;"><strong style="color:${closed ? `${DOC_SEMANTIC.CLOSED_TEXT}` : `${DOC.INK}`};">Corrective action:</strong> ${esc(f.corrective_action)}</p>` : ''

    return `<tr>
      <td ${tdNum}>${esc(f.number)}${closedTag}</td>
      <td ${tdBase}>
        <strong style="color:${closed ? `${DOC_SEMANTIC.CLOSED_TEXT}` : `${DOC.INK}`};font-size:9.5pt;">${esc(headingText)}</strong>
        ${hasTitle ? `<br><span style="font-size:8pt;color:#999;">${esc(f.category)}</span>` : ''}
        ${locationHtml}${descHtml}${diaryHtml}${photosHtml}${corrHtml}
      </td>
      <td ${tdAct}>${esc(responsible)}</td>
    </tr>`
  }).join('\n')

  const narrativeHtml = (report.progress_narrative ?? '').split('\n').map((line: string) =>
    `<p style="margin:4px 0;">${esc(line) || '&nbsp;'}</p>`
  ).join('')

  // FINAL DOM ORDER, conditionals mirrored exactly — the patcher refuses on a
  // count mismatch, so a table added to the template MUST add its row here.
  const tableGrids: number[][] = [
    [34, 32, 34],                                   // project / note # / date header
    [24, 34, 10, 32],                               // distribution
    ...(docItems.length > 0 ? [[55, 25, 20]] : []), // doc register (PDF's own widths)
    [6, 80, 14],                                    // issues (PDF: num 6%, act 14%)
  ]

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #222; }
  h2   { color: ${DOC.INK}; font-size: 12pt; font-weight: bold; margin: 20px 0 7px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 4px; }
  p { margin: 4px 0; }
</style>
</head>
<body>

${FIRM_HEADER_DOCX}

<table style="width:100%;border:1px solid ${DOC.BORDER};border-collapse:collapse;margin-top:14px;font-size:9.5pt;">
  <tr>
    <td style="padding:9px 13px;border:1px solid ${DOC.BORDER};vertical-align:middle;">
      <div><span style="color:#777;font-size:8.5pt;">Project:</span> <strong>${esc(project.name)}</strong></div>
      <div><span style="color:#777;font-size:8.5pt;">Reference:</span> <strong>${esc(project.com_number ?? '—')}</strong></div>
    </td>
    <td style="padding:9px 13px;border:1px solid ${DOC.BORDER};text-align:center;background-color:${DOC.ZEBRA};vertical-align:middle;">
      <strong style="color:${DOC.INK};font-size:11pt;">Cx Site Note #${esc(report.report_number)}</strong>
    </td>
    <td style="padding:9px 13px;border:1px solid ${DOC.BORDER};vertical-align:middle;">
      <div><span style="color:#777;font-size:8.5pt;">Date:</span> <strong>${esc(isoShort(report.report_date))}</strong></div>
      <div><span style="color:#777;font-size:8.5pt;">By:</span> <strong>${esc(report.authored_by)}</strong></div>
    </td>
  </tr>
</table>

<h2>Distribution</h2>
<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
  <thead><tr>
    <th ${TH}>Name</th><th ${TH}>Company</th><th ${TH}>ABRV</th><th ${TH}>Email</th>
  </tr></thead>
  <tbody>${distRows}</tbody>
</table>

<p style="margin:12px 0 2px 0;font-style:italic;color:#333;">${esc(report.authored_by)} made the following site review observations on ${esc(isoLong(report.site_visit_date))}:</p>

<h2>Site Progress Observations</h2>
${narrativeHtml}

<h2>Required Documentations</h2>
${docSection}

<h2>Observed Issues &amp; Progress &mdash; Site Notes #${esc(report.report_number)}: ${esc(isoShort(report.site_visit_date))}</h2>
<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
  <thead><tr>
    <th ${TH} style="text-align:center;">#</th>
    <th ${TH}>Issue Details</th>
    <th ${TH} style="text-align:center;">Action</th>
  </tr></thead>
  <tbody>${findingRows}</tbody>
</table>

<p style="font-size:7.5pt;font-style:italic;color:#888;margin-top:20px;border-top:1px solid #E5E5E5;padding-top:6px;">${esc(DISCLAIMER)}</p>

</body>
</html>`

  return { html, tableGrids }
}

// ── Vercel serverless handler ──────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { report_id, document, plan_id, mode } = req.body ?? {}

    // THE ALLOW-LIST. Explicit, and unknown values are refused rather than
    // defaulted — a default here means generating a site report for a caller
    // that asked for something else.
    const DOCUMENTS = ['site', 'ist'] as const
    const kind: string = document ?? 'site'
    if (!DOCUMENTS.includes(kind as typeof DOCUMENTS[number]))
      return res.status(400).json({ error: `unknown document '${kind}'; expected one of ${DOCUMENTS.join(', ')}` })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    if (kind === 'ist') {
      if (!plan_id) return res.status(400).json({ error: 'plan_id required for document=ist' })
      const istMode: IstMode = mode === 'plan' ? 'plan' : 'report'
      const { userId: istUser } = await requireUser(req, supabase)
      const { data: istPlan, error: ipErr } = await supabase
        .from('ist_plans').select('*').eq('id', plan_id).single()
      if (ipErr || !istPlan) return res.status(404).json({ error: ipErr?.message ?? 'not found' })
      await requireProjectAccess(supabase, istUser, istPlan.project_id)

      const doc = await assembleIstDoc(supabase, istPlan)
      const html = buildIstHtml(doc, istMode)
      // IST joined the D1 treatment (owner-ruled 2026-08-17): grids DERIVED
      // from the same html the PDF renders — its widths are inline per table,
      // and its table count is loop-variable, so a hand list would drift.
      const [pdf, docx] = await Promise.all([toPdf(html, IST_FOOTER), toDocx(html, gridsFromHtmlTables(html))])
      const base = `${istPlan.project_id}/IST-${istPlan.revision_label}-${istMode}`
      const up = await uploadDocPair(supabase.storage.from('site-reports'), base, docx, pdf)
      if ('error' in up) return res.status(500).json(up)
      await supabase.from('ist_plans')
        .update({ storage_url: up.storage_url, pdf_url: up.pdf_url, updated_at: new Date().toISOString() })
        .eq('id', istPlan.id)
      console.log(`[ist] plan=${istPlan.id} mode=${istMode} integrations=${doc.integrations.length} results=${doc.results.length}`)
      return res.status(200).json({ ...up, mode: istMode })
    }

    if (!report_id) return res.status(400).json({ error: 'report_id required' })

    // Identity BEFORE any resource lookup (no id probing), then 404, then authz.
    const { userId } = await requireUser(req, supabase)

    const { data: report, error: rErr } = await supabase
      .from('site_reports').select('*').eq('id', report_id).single()
    if (rErr || !report)
      return res.status(404).json({ error: rErr?.message ?? 'not found' })

    await requireProjectAccess(supabase, userId, report.project_id)

    const { data: project } = await supabase
      .from('projects').select('*, companies(id,name,abbreviation)').eq('id', report.project_id).single()

    const { data: distribution } = await supabase
      .from('project_distribution')
      .select('id, contacts(id,name,trade,email,contact_emails(email,is_primary),companies(name,abbreviation))')
      .eq('project_id', report.project_id)

    let fQ = supabase.from('findings')
      .select('id,number,title,category,status,date_raised,date_closed,building_area,description,corrective_action,contacts(name,trade,companies(name,abbreviation)),finding_diary_entries(id,entry_date,body,created_at),finding_photos(id,storage_url,caption,uploaded_at)')
      .eq('project_id', report.project_id)
      .order('number')
    if (!report.show_closed) fQ = fQ.eq('status', 'open')
    const { data: findings } = await fQ

    // Download photos as Buffers; embed as base64 data URIs so HTML is self-contained.
    // storage_url is a bucket-relative path (storage privacy pass) — service-role
    // download works against private buckets. Legacy full-URL rows (pre-migration)
    // still fetch directly.
    const photoBuffers = new Map<string, Buffer>()
    for (const f of findings ?? []) {
      for (const ph of f.finding_photos ?? []) {
        try {
          if (ph.storage_url?.startsWith('http')) {
            const r = await fetch(ph.storage_url)
            if (r.ok) photoBuffers.set(ph.id, Buffer.from(await r.arrayBuffer()))
          } else if (ph.storage_url) {
            const { data } = await supabase.storage.from('finding-photos').download(ph.storage_url)
            if (data) photoBuffers.set(ph.id, Buffer.from(await data.arrayBuffer()))
          }
        } catch { /* skip unloadable photos */ }
      }
    }

    const pdfHtml = buildHtml(project, report, distribution ?? [], findings ?? [], photoBuffers)
    const { html: docxHtml, tableGrids } = buildDocxHtml(project, report, distribution ?? [], findings ?? [], photoBuffers)

    // Run PDF (Chromium) and docx (html-to-docx) in parallel.
    const [pdfBuffer, docxBuffer] = await Promise.all([
      toPdf(pdfHtml, PDF_FOOTER),
      toDocx(docxHtml, tableGrids),
    ])

    // Upload both to Supabase Storage.
    const uploaded = await uploadDocPair(
      supabase.storage.from('site-reports'),
      `${report.project_id}/${report.report_number}`,
      docxBuffer, pdfBuffer,
    )
    if ('error' in uploaded)
      return res.status(500).json({ error: uploaded.error })
    const { storage_url, pdf_url } = uploaded
    await supabase.from('site_reports').update({ storage_url, pdf_url }).eq('id', report_id)

    return res.status(200).json({ storage_url, pdf_url })

  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('generate-report error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
