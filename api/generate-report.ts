import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

// html-to-docx is a UMD module; Vercel's esbuild handles CJS→ESM interop.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx'

// Chromium pack hosted on GitHub Releases — downloaded to /tmp on cold start,
// cached for the lifetime of the Lambda instance (subsequent calls are fast).
// Update this URL when upgrading @sparticuz/chromium-min.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const DISCLAIMER =
  'This information is for the sole use of the client and is a best reflection of the discussions that were recorded or added as a result of a site meeting or site review. Please forward any discrepancy or disagreement to Isotherm Engineering Ltd. as soon as possible.'

// ── helpers ────────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isoShort(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '—'
}

function isoLong(iso: string): string {
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function statusHtml(status: string): string {
  const t = (status ?? '').toUpperCase().replace('_', ' ')
  if (status === 'received')    return `<span class="st-rec">${t}</span>`
  if (status === 'outstanding') return `<span class="st-out">${t}</span>`
  return `<span class="st-na">${t || 'N/A'}</span>`
}

function isFilenameCaption(c: string | null | undefined): boolean {
  return !!c && /\.(jpe?g|png|gif|webp|heic|avif|bmp|tiff?)$/i.test(c.trim())
}

function toBase64(data: Buffer): string {
  return data.toString('base64')
}

// ── CSS (matches site_report_mockup.html exactly) ─────────────────────────────

const CSS = `
  @page { size: letter; margin: 0.5in 0 0.5in 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; color: #222; font-size: 10.5pt; line-height: 1.4; }
  .page { padding: 0 46px 12px 46px; }

  /* letterhead */
  .firm { text-align: center; }
  .firm h1 { color: #1F3A5F; font-size: 19pt; letter-spacing: 0.5px; font-weight: 700; }
  .firm .addr { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: #1F3A5F; margin: 9px 0 0 0; border-radius: 2px; }

  /* project header */
  .phead { display: table; width: 100%; margin-top: 14px; border: 1px solid #C9D2DD; border-radius: 4px; overflow: hidden; }
  .phead .cell { display: table-cell; padding: 9px 13px; vertical-align: middle; font-size: 9.5pt; }
  .phead .left  { width: 40%; }
  .phead .mid   { width: 28%; text-align: center; background: #F4F7FB; border-left: 1px solid #C9D2DD; border-right: 1px solid #C9D2DD; }
  .phead .right { width: 32%; }
  .phead .label { color: #777; font-size: 8.5pt; }
  .phead .val   { font-weight: 600; }
  .phead .note  { color: #1F3A5F; font-weight: 700; font-size: 11pt; }

  /* section headings */
  h2.sec { color: #1F3A5F; font-size: 12pt; font-weight: 700; margin: 20px 0 7px 0; padding-bottom: 3px; border-bottom: 2px solid #1F3A5F; page-break-after: avoid; break-after: avoid; }

  /* tables */
  table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  thead th { background: #1F3A5F; color: #fff; font-weight: 600; text-align: left; padding: 6px 10px; font-size: 9pt; border: 1px solid #1F3A5F; }
  tbody td { padding: 6px 10px; border: 1px solid #DDE3EA; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F6F8FB; }
  tr { page-break-inside: avoid; break-inside: avoid; }

  .intro     { margin: 12px 0 2px 0; font-style: italic; color: #333; }
  .narrative { padding: 2px 0; margin: 4px 0; }
  .none      { font-style: italic; color: #888; font-size: 9.5pt; margin-top: 4px; }

  /* status */
  .st-out { color: #C0392B; font-weight: 600; }
  .st-rec { color: #1E8449; font-weight: 600; }
  .st-na  { color: #888; }

  /* issues table */
  table.issues th.num { width: 6%;  text-align: center; }
  table.issues th.act { width: 14%; text-align: center; }
  table.issues td.num { text-align: center; font-weight: 700; color: #1F3A5F; }
  table.issues td.act { text-align: center; font-weight: 600; color: #444; }

  /* finding content */
  .cat    { font-weight: 700; color: #1F3A5F; font-size: 9.5pt; display: block; margin-bottom: 4px; }
  .cattag { font-size: 8pt; color: #999; display: block; margin-top: -2px; margin-bottom: 6px; }
  .dentry { margin-bottom: 7px; }
  .ddate  { font-style: italic; color: #8A93A0; font-size: 8.5pt; }
  .dtext  { margin-top: 1px; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0 8px 0; }
  .photo-grid-item { display: flex; flex-direction: column; align-items: flex-start; }
  .photo-grid-item img { width: 140px; height: 105px; object-fit: cover; border-radius: 3px; display: block; }
  .photo-cap  { font-size: 7.5pt; font-style: italic; color: #777; margin-top: 2px; max-width: 140px; }
  .closeddate { font-style: italic; font-size: 8.5pt; color: #888; margin-top: 6px; }

  /* closed rows */
  tr.closed td         { background: #E3E3E3 !important; color: #777; }
  tr.closed .cat       { color: #777; }
  tr.closed td.num     { color: #777; }
  tr.closed td.act     { color: #777; }
  .closedtag           { display: block; font-size: 8pt; font-weight: 700; color: #888; }

  /* fixed footer on every page */
  .footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 6px 46px 14px 46px; text-align: center;
    background: white; border-top: 1px solid #E5E5E5;
  }
  .footer .disc { font-size: 7.5pt; font-style: italic; color: #888; line-height: 1.3; }
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
    return `<tr><td>${esc(c?.name)}</td><td>${esc(co?.name)}</td><td>${esc(co?.abbreviation)}</td><td>${esc(c?.email)}</td></tr>`
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

    return `<tr${closed ? ' class="closed"' : ''}>
      <td class="num">${esc(f.number)}${closed ? '<span class="closedtag">CLOSED</span>' : ''}</td>
      <td>
        <span class="cat">${esc(headingText)}</span>
        ${hasTitle ? `<span class="cattag">${esc(f.category)}</span>` : ''}
        ${diaryHtml}${photosHtml}${closedDateHtml}
      </td>
      <td class="act">${esc(responsible)}</td>
    </tr>`
  }).join('\n')

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

  <div class="firm">
    <h1>ISOTHERM ENGINEERING LTD.</h1>
    <div class="addr">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2<br>
    Ph 905-822-2430 &nbsp;&bull;&nbsp; e-mail: info@isothermengineering.com</div>
  </div>
  <div class="brandrule"></div>

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

<div class="footer">
  <div class="disc">${esc(DISCLAIMER)}</div>
</div>

</body>
</html>`
}

// ── PDF via Puppeteer + @sparticuz/chromium-min ────────────────────────────────

async function toPdf(html: string): Promise<Buffer> {
  const execPath = await chromium.executablePath(CHROMIUM_PACK_URL)

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: execPath,
    headless: 'shell',
    defaultViewport: null,
  })

  try {
    const page = await browser.newPage()
    // All images are base64 data URIs — no external network requests needed.
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ── DOCX-specific HTML builder ────────────────────────────────────────────────
// Generates a Word-friendly HTML using real <table> elements and inline styles
// instead of CSS classes / display:table divs. buildHtml() is left untouched
// for PDF — this is a separate path so neither output affects the other.

function buildDocxHtml(
  project: any, report: any,
  distribution: any[], findings: any[],
  photoBuffers: Map<string, Buffer>,
): string {
  const TH = 'style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid #1F3A5F;font-size:9pt;"'
  const td  = (i: number, extra = '') =>
    `style="padding:6px 10px;border:1px solid #DDE3EA;vertical-align:top;${i%2===1 ? 'background-color:#F6F8FB;' : ''}${extra}"`

  const distRows = distribution.map((r: any, i: number) => {
    const c  = Array.isArray(r.contacts)  ? r.contacts[0]  : r.contacts
    const co = Array.isArray(c?.companies) ? c?.companies[0] : c?.companies
    return `<tr>
      <td ${td(i)}>${esc(c?.name)}</td>
      <td ${td(i)}>${esc(co?.name)}</td>
      <td ${td(i)}>${esc(co?.abbreviation)}</td>
      <td ${td(i)}>${esc(c?.email)}</td>
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
    const rowBg       = closed ? '#E3E3E3' : (rowIdx % 2 === 1 ? '#F6F8FB' : '#ffffff')
    const rowFg       = closed ? '#777777' : '#222222'

    const tdBase = `style="padding:6px 10px;border:1px solid #DDE3EA;vertical-align:top;background-color:${rowBg};color:${rowFg};"`
    const tdNum  = `style="padding:6px 10px;border:1px solid #DDE3EA;vertical-align:top;text-align:center;font-weight:bold;background-color:${rowBg};color:${closed ? '#777' : '#1F3A5F'};"`
    const tdAct  = `style="padding:6px 10px;border:1px solid #DDE3EA;vertical-align:top;text-align:center;font-weight:bold;background-color:${rowBg};color:${rowFg};"`

    const diaryHtml = entries.map((e: any) =>
      `<p style="margin:4px 0;"><em style="color:#8A93A0;font-size:8.5pt;">${esc(isoShort(e.entry_date))}</em><br>${esc(e.body ?? '')}</p>`
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

    return `<tr>
      <td ${tdNum}>${esc(f.number)}${closedTag}</td>
      <td ${tdBase}>
        <strong style="color:${closed ? '#777' : '#1F3A5F'};font-size:9.5pt;">${esc(headingText)}</strong>
        ${hasTitle ? `<br><span style="font-size:8pt;color:#999;">${esc(f.category)}</span>` : ''}
        ${diaryHtml}${photosHtml}
      </td>
      <td ${tdAct}>${esc(responsible)}</td>
    </tr>`
  }).join('\n')

  const narrativeHtml = (report.progress_narrative ?? '').split('\n').map((line: string) =>
    `<p style="margin:4px 0;">${esc(line) || '&nbsp;'}</p>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #222; }
  h2   { color: #1F3A5F; font-size: 12pt; font-weight: bold; margin: 20px 0 7px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 4px; }
  p { margin: 4px 0; }
</style>
</head>
<body>

<h1 style="color:#1F3A5F;font-size:19pt;font-weight:bold;text-align:center;margin:0;">ISOTHERM ENGINEERING LTD.</h1>
<p style="text-align:center;font-size:8.5pt;color:#555;margin:2px 0;">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2 &nbsp;&bull;&nbsp; Ph 905-822-2430 &nbsp;&bull;&nbsp; info@isothermengineering.com</p>

<table style="width:100%;border:1px solid #C9D2DD;border-collapse:collapse;margin-top:14px;font-size:9.5pt;">
  <tr>
    <td style="padding:9px 13px;border:1px solid #C9D2DD;vertical-align:middle;">
      <div><span style="color:#777;font-size:8.5pt;">Project:</span> <strong>${esc(project.name)}</strong></div>
      <div><span style="color:#777;font-size:8.5pt;">Reference:</span> <strong>${esc(project.com_number ?? '—')}</strong></div>
    </td>
    <td style="padding:9px 13px;border:1px solid #C9D2DD;text-align:center;background-color:#F4F7FB;vertical-align:middle;">
      <strong style="color:#1F3A5F;font-size:11pt;">Cx Site Note #${esc(report.report_number)}</strong>
    </td>
    <td style="padding:9px 13px;border:1px solid #C9D2DD;vertical-align:middle;">
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
}

// ── docx via html-to-docx (pure JS, no native binary) ─────────────────────────

async function toDocx(html: string): Promise<Buffer> {
  // Only strip width: from th/td style attrs — html-to-docx crashes on those.
  // Other inline styles (background-color, color, border, padding) are kept
  // so the DOCX-specific HTML formatting carries through to Word.
  const safeHtml = html.replace(/(<t[hd][^>]*?) style="([^"]*)"/gi, (_: string, tag: string, styles: string) => {
    const filtered = styles.split(';').map((s: string) => s.trim())
      .filter((s: string) => s && !s.toLowerCase().startsWith('width'))
      .join('; ')
    return filtered ? `${tag} style="${filtered}"` : tag
  })
  const result = await HTMLtoDOCX(safeHtml, null, {
    table:    { row: { cantSplit: true } },
    // header/footer/gutter must be explicit integers — html-to-docx writes
    // the string "undefined" for omitted margin fields, which Word rejects.
    margins:  { top: 720, right: 1080, bottom: 900, left: 1080, header: 708, footer: 708, gutter: 0 },
    font:     'Arial',
    fontSize: 20,   // half-points (= 10pt)
    footer:   false,
    header:   false,
  })
  return Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer)
}

// ── Vercel serverless handler ──────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // CORS — same origin in production but needed for local Vite dev proxy
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { report_id } = req.body ?? {}
    if (!report_id) return res.status(400).json({ error: 'report_id required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    const { data: report, error: rErr } = await supabase
      .from('site_reports').select('*').eq('id', report_id).single()
    if (rErr || !report)
      return res.status(404).json({ error: rErr?.message ?? 'not found' })

    const { data: project } = await supabase
      .from('projects').select('*, companies(id,name,abbreviation)').eq('id', report.project_id).single()

    const { data: distribution } = await supabase
      .from('project_distribution')
      .select('id, contacts(id,name,trade,email,companies(name,abbreviation))')
      .eq('project_id', report.project_id)

    let fQ = supabase.from('findings')
      .select('id,number,title,category,status,date_raised,date_closed,contacts(name,trade,companies(name,abbreviation)),finding_diary_entries(id,entry_date,body,created_at),finding_photos(id,storage_url,caption,uploaded_at)')
      .eq('project_id', report.project_id)
      .order('number')
    if (!report.show_closed) fQ = fQ.eq('status', 'open')
    const { data: findings } = await fQ

    // Download photos as Buffers; embed as base64 data URIs so HTML is self-contained.
    const photoBuffers = new Map<string, Buffer>()
    for (const f of findings ?? []) {
      for (const ph of f.finding_photos ?? []) {
        try {
          const r = await fetch(ph.storage_url)
          if (r.ok) photoBuffers.set(ph.id, Buffer.from(await r.arrayBuffer()))
        } catch { /* skip unloadable photos */ }
      }
    }

    const pdfHtml  = buildHtml(project, report, distribution ?? [], findings ?? [], photoBuffers)
    const docxHtml = buildDocxHtml(project, report, distribution ?? [], findings ?? [], photoBuffers)

    // Run PDF (Chromium) and docx (html-to-docx) in parallel.
    const [pdfBuffer, docxBuffer] = await Promise.all([
      toPdf(pdfHtml),
      toDocx(docxHtml),
    ])

    // Upload both to Supabase Storage.
    const store = supabase.storage.from('site-reports')
    const base  = `${report.project_id}/${report.report_number}`
    const [docxUp, pdfUp] = await Promise.all([
      store.upload(`${base}.docx`, docxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      }),
      store.upload(`${base}.pdf`, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      }),
    ])
    if (docxUp.error ?? pdfUp.error)
      return res.status(500).json({ error: (docxUp.error ?? pdfUp.error)?.message })

    // Cache-bust so browsers always serve the freshly generated file.
    const ts = Date.now()
    const { data: { publicUrl: rawDocxUrl } } = store.getPublicUrl(`${base}.docx`)
    const { data: { publicUrl: rawPdfUrl  } } = store.getPublicUrl(`${base}.pdf`)
    const storage_url = `${rawDocxUrl}?t=${ts}`
    const pdf_url     = `${rawPdfUrl}?t=${ts}`
    await supabase.from('site_reports').update({ storage_url, pdf_url }).eq('id', report_id)

    return res.status(200).json({ storage_url, pdf_url })

  } catch (err: any) {
    console.error('generate-report error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
