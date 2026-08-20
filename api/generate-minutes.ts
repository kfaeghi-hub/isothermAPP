import { createClient } from '@supabase/supabase-js'
import {
  esc, isoShort, BASE_CSS, FIRM_HEADER_PDF, FIRM_HEADER_DOCX, toPdf, toDocx, uploadDocPair, footerBand,
  DOC, DOC_SEMANTIC,
} from './_shared/doc-common.js'
import { applyCors, requireUser, requireProjectAccess, AuthError } from './_shared/auth-common.js'
import { deriveItemNumbers } from './_shared/meeting-numbering.js'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const DISCLAIMER =
  'These minutes represent the writer’s understanding of matters discussed and decisions reached. ' +
  'Discrepancies or disagreements shall be reported to Isotherm Engineering Ltd. within seven (7) days of issue.'

// ── data shaping ───────────────────────────────────────────────────────────────

interface MinutesData {
  project: any
  meeting: any
  typeName: string
  attendees: any[]
  topics: any[]
  itemsByTopic: Map<string, any[]>
  respLabel: (item: any) => string
  /** ALL responsible parties, in order (F1, 2026-08-19). Junction rows when
   *  any exist; the legacy single pair otherwise — supersede, never delete. */
  respLabels: (item: any) => string[]
  /** Derived display number — N.k for native items, the frozen ↺-prefixed
   *  origin-qualified number for carried ones. ONE derivation feeds both
   *  document formats and the UI (api/_shared/meeting-numbering). */
  num: (item: any) => string
  findingLabel: (id: string | null) => string | null
  roleSort: Map<string, number>
}

function truncate(s: string, n: number): string {
  const t = (s ?? '').trim()
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

function statusLabel(s: string): string {
  return s === 'open' ? 'OPEN' : s === 'closed' ? 'CLOSED' : 'INFO'
}

/** Attendees grouped by role, roles in firm-matrix order, unknown roles after, blank last. */
function groupAttendees(d: MinutesData) {
  const groups = new Map<string, any[]>()
  for (const a of d.attendees.filter((x: any) => x.attendance !== 'distribution')) {
    const role = (a.role_label ?? '').trim() || '—'
    if (!groups.has(role)) groups.set(role, [])
    groups.get(role)!.push(a)
  }
  return [...groups.entries()].sort((a, b) => {
    const sa = d.roleSort.get(a[0].toLowerCase()) ?? (a[0] === '—' ? 9999 : 999)
    const sb = d.roleSort.get(b[0].toLowerCase()) ?? (b[0] === '—' ? 9999 : 999)
    return sa - sb || a[0].localeCompare(b[0])
  })
}

const attendeeName    = (a: any) => a.contacts?.name ?? a.name_snapshot ?? '—'
const attendeeCompany = (a: any) => {
  const c = Array.isArray(a.contacts) ? a.contacts[0] : a.contacts
  const co = Array.isArray(c?.companies) ? c?.companies[0] : c?.companies
  return co?.name ?? a.company_snapshot ?? ''
}

/** Open items grouped by responsible label for the Action Summary.
 *
 *  A SHARED item appears under EACH of its parties (F1): "Isotherm to update,
 *  Dialogue to provide feedback" belongs in both parties' action lists — that
 *  is what shared responsibility means in a summary a party reads for its own
 *  actions. The per-group item numbers still join on the band line. */
function groupOpenByResponsible(d: MinutesData) {
  const groups = new Map<string, any[]>()
  for (const topic of d.topics) {
    for (const it of d.itemsByTopic.get(topic.id) ?? []) {
      if (it.status !== 'open') continue
      for (const label of d.respLabels(it)) {
        if (!groups.has(label)) groups.set(label, [])
        groups.get(label)!.push(it)
      }
    }
  }
  return [...groups.entries()].sort((a, b) =>
    (a[0] === '—' ? 1 : 0) - (b[0] === '—' ? 1 : 0) || a[0].localeCompare(b[0]))
}

/** Discussion text for a cell: escaped, then 
 honored as <br>.
 *
 *  10 of 32 production discussions already carried newlines that BOTH formats
 *  silently flattened (PDF: default white-space collapses; html-to-docx: 

 *  becomes a literal space — measured against the installed 1.8.0, which DOES
 *  emit <w:br w:type="textWrapping"/> for <br>). One renderer for both formats,
 *  applied after esc() so typed markup stays literal text. */
function discussionHtml(text: string): string {
  return esc(text).replace(/\n/g, '<br>')
}

// ── PDF HTML ───────────────────────────────────────────────────────────────────

const CSS = `${BASE_CSS}
  .doctitle { text-align: center; color: ${DOC.INK}; font-size: 13pt; font-weight: 700; margin-top: 12px; letter-spacing: 0.4px; }
  .meta td { text-align: center; font-size: 9pt; }
  .meta .lbl { color: #777; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; display: block; }
  .band td { background: ${DOC.BAND} !important; color: #fff; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.3px; padding: 5px 10px; border-color: ${DOC.INK}; }
  .noitems td { font-style: italic; color: #999; }
  td.inum { text-align: center; font-weight: 700; color: ${DOC.INK}; white-space: nowrap; }
  td.st { text-align: center; font-weight: 700; }
  .st-open { color: ${DOC_SEMANTIC.ITEM_OPEN}; } .st-closed { color: ${DOC_SEMANTIC.ITEM_CLOSED}; } .st-info { color: ${DOC_SEMANTIC.ITEM_INFO}; }
  tr.item-closed td { color: #888; background: #EFEFEF !important; }
  .flink { display: block; font-size: 8pt; color: ${DOC_SEMANTIC.ITEM_OPEN}; margin-top: 2px; }
  .carr { color: ${DOC_SEMANTIC.ITEM_OPEN}; font-weight: 400; }
  .dist { font-size: 8.5pt; color: #666; margin-top: 4px; }
  .asum-group td { background: ${DOC.BAND_TINT} !important; font-weight: 700; color: ${DOC.INK}; }
  tbody.keep { page-break-inside: avoid; break-inside: avoid; }
`

function buildPdfHtml(d: MinutesData): string {
  const m = d.meeting

  const attendeeRows = groupAttendees(d).map(([role, rows]) =>
    rows.map((a: any, i: number) => `<tr>
      ${i === 0 ? `<td rowspan="${rows.length}" style="vertical-align:middle;font-weight:600;">${esc(role)}</td>` : ''}
      <td>${esc(attendeeName(a))}</td>
      <td>${esc(attendeeCompany(a))}</td>
      <td style="text-align:center;">${a.attendance === 'regrets' ? 'Regrets' : 'Present'}</td>
    </tr>`).join('\n')
  ).join('\n')
  const distribution = d.attendees.filter((a: any) => a.attendance === 'distribution')
  const distLine = distribution.length
    ? `<p class="dist"><strong>Distribution only:</strong> ${distribution.map((a: any) =>
        `${esc(attendeeName(a))}${attendeeCompany(a) ? ` (${esc(attendeeCompany(a))})` : ''}`).join(', ')}</p>`
    : ''

  const topicsHtml = d.topics.map(topic => {
    const its = d.itemsByTopic.get(topic.id) ?? []
    const band = `<tr class="band"><td colspan="5">${esc(topic.title)}</td></tr>`
    const rows = its.length === 0
      ? [`<tr class="noitems"><td colspan="5">No items — reviewed, nothing arising.</td></tr>`]
      : its.map(it => {
          const fl = d.findingLabel(it.linked_finding_id)
          return `<tr${it.status === 'closed' ? ' class="item-closed"' : ''}>
            <td class="inum">${esc(d.num(it))}</td>
            <td class="disc">${discussionHtml(it.discussion)}${fl ? `<span class="flink">${esc(fl)}</span>` : ''}</td>
            <td>${d.respLabels(it).map(esc).join('<br>')}</td>
            <td style="text-align:center;">${esc(isoShort(it.due_date))}</td>
            <td class="st"><span class="st-${it.status}">${statusLabel(it.status)}</span></td>
          </tr>`
        })
    // Band + first row share an unbreakable tbody — a band never strands at a page bottom.
    const keep = `<tbody class="keep">${band}\n${rows[0]}</tbody>`
    const rest = rows.length > 1 ? `<tbody>${rows.slice(1).join('\n')}</tbody>` : ''
    return `${keep}${rest}`
  }).join('\n')

  const asumGroups = groupOpenByResponsible(d)
  const asumHtml = asumGroups.length === 0
    ? '<p class="none" style="font-style:italic;color:#888;font-size:9.5pt;margin-top:4px;">No open action items.</p>'
    : `<table>
        <colgroup><col style="width:12%"><col style="width:63%"><col style="width:25%"></colgroup>
        <thead><tr><th style="text-align:center;">Item #</th><th>Action</th><th style="text-align:center;">Due</th></tr></thead>
        ${asumGroups.map(([label, its]) => {
          const grow = `<tr class="asum-group"><td colspan="3">${esc(label)} — ${its.map((i: any) => d.num(i)).join(', ')}</td></tr>`
          const rows = its.map((it: any) => `<tr>
            <td class="inum">${esc(d.num(it))}</td>
            <td>${esc(truncate(String(it.discussion ?? '').replace(/\s+/g, ' '), 90))}</td>
            <td style="text-align:center;">${esc(isoShort(it.due_date))}</td>
          </tr>`)
          return `<tbody class="keep">${grow}\n${rows[0]}</tbody>${rows.length > 1 ? `<tbody>${rows.slice(1).join('\n')}</tbody>` : ''}`
        }).join('\n')}
      </table>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${CSS}</style>
</head>
<body>
<div class="page">

  ${FIRM_HEADER_PDF}

  <div class="doctitle">MEETING MINUTES — ${esc(d.typeName)} #${esc(m.meeting_number)}</div>

  <div class="phead">
    <div class="cell left">
      <div><span class="label">Project:</span> <span class="val">${esc(d.project.name)}</span></div>
      <div><span class="label">Reference:</span> <span class="val">${esc(d.project.com_number ?? '—')}</span></div>
    </div>
    <div class="cell mid"><span class="note">${esc(d.typeName)} #${esc(m.meeting_number)}</span></div>
    <div class="cell right">
      <div><span class="label">Date:</span> <span class="val">${esc(isoShort(m.meeting_date))}</span></div>
      <div><span class="label">Prepared by:</span> <span class="val">${esc(m.prepared_by ?? '—')}</span></div>
    </div>
  </div>

  <table class="meta" style="margin-top:8px;">
    <tbody><tr>
      <td><span class="lbl">Date</span>${esc(isoShort(m.meeting_date))}</td>
      <td><span class="lbl">Time</span>${esc(m.start_time ? String(m.start_time).slice(0, 5) : '—')}</td>
      <td><span class="lbl">Location</span>${esc(m.location ?? '—')}</td>
      <td><span class="lbl">Prepared By</span>${esc(m.prepared_by ?? '—')}</td>
      <td><span class="lbl">Next Meeting</span>${esc(isoShort(m.next_meeting_date))}</td>
    </tr></tbody>
  </table>

  <h2 class="sec">Attendees</h2>
  ${d.attendees.length === 0
    ? '<p style="font-style:italic;color:#888;font-size:9.5pt;margin-top:4px;">No attendees recorded.</p>'
    : `<table>
        <colgroup><col style="width:20%"><col style="width:32%"><col style="width:33%"><col style="width:15%"></colgroup>
        <thead><tr><th>Role</th><th>Name</th><th>Company</th><th style="text-align:center;">Attendance</th></tr></thead>
        <tbody>${attendeeRows}</tbody>
      </table>${distLine}`}

  <h2 class="sec">Minutes</h2>
  <table>
    <colgroup><col style="width:9%"><col style="width:45%"><col style="width:20%"><col style="width:12%"><col style="width:14%"></colgroup>
    <thead><tr><th style="text-align:center;">Item #</th><th>Discussion</th><th>Responsible</th><th style="text-align:center;">Due</th><th style="text-align:center;">Status</th></tr></thead>
    ${topicsHtml}
  </table>

  <h2 class="sec">Action Summary by Responsible Party</h2>
  ${asumHtml}

</div>
</body>
</html>`
}

// ── DOCX HTML (inline styles only; no width on th/td — html-to-docx rules) ─────

// Returns the HTML plus each table's column proportions in emission order
// (the D1 treatment, owner-ruled onto this family 2026-08-16). No nesting here.
function buildDocxHtml(d: MinutesData): { html: string; tableGrids: number[][] } {
  const m = d.meeting
  const TH = `style="background-color:${DOC.BAND};color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid ${DOC.INK};font-size:9pt;"`
  const td = (extra = '') => `style="padding:6px 10px;border:1px solid ${DOC.RULE};vertical-align:top;${extra}"`

  const attendeeRows = groupAttendees(d).map(([role, rows]) =>
    rows.map((a: any, i: number) => `<tr>
      <td ${td()}>${i === 0 ? `<strong>${esc(role)}</strong>` : ''}</td>
      <td ${td()}>${esc(attendeeName(a))}</td>
      <td ${td()}>${esc(attendeeCompany(a))}</td>
      <td ${td('text-align:center;')}>${a.attendance === 'regrets' ? 'Regrets' : 'Present'}</td>
    </tr>`).join('\n')
  ).join('\n')
  const distribution = d.attendees.filter((a: any) => a.attendance === 'distribution')
  const distLine = distribution.length
    ? `<p style="font-size:8.5pt;color:#666;margin:4px 0;"><strong>Distribution only:</strong> ${distribution.map((a: any) =>
        `${esc(attendeeName(a))}${attendeeCompany(a) ? ` (${esc(attendeeCompany(a))})` : ''}`).join(', ')}</p>`
    : ''

  const topicsHtml = d.topics.map(topic => {
    const its = d.itemsByTopic.get(topic.id) ?? []
    const band = `<tr><td colspan="5" style="background-color:${DOC.BAND};color:#ffffff;font-weight:bold;font-size:9.5pt;padding:5px 10px;border:1px solid ${DOC.INK};">${esc(topic.title).toUpperCase()}</td></tr>`
    const rows = its.length === 0
      ? `<tr><td colspan="5" ${td('font-style:italic;color:#999;')}>No items — reviewed, nothing arising.</td></tr>`
      : its.map(it => {
          const closed = it.status === 'closed'
          const bg = closed ? 'background-color:#EFEFEF;color:#888;' : ''
          const fl = d.findingLabel(it.linked_finding_id)
          return `<tr>
            <td ${td(`text-align:center;font-weight:bold;${bg}${closed ? '' : `color:${DOC.INK};`}`)}>${esc(d.num(it))}</td>
            <td ${td(bg)}>${discussionHtml(it.discussion)}${fl ? `<br><span style="font-size:8pt;color:${DOC_SEMANTIC.ITEM_OPEN};">${esc(fl)}</span>` : ''}</td>
            <td ${td(bg)}>${d.respLabels(it).map(esc).join('<br>')}</td>
            <td ${td(`text-align:center;${bg}`)}>${esc(isoShort(it.due_date))}</td>
            <td ${td(`text-align:center;font-weight:bold;${bg || (it.status === 'open' ? `color:${DOC_SEMANTIC.ITEM_OPEN};` : `color:${DOC_SEMANTIC.ITEM_INFO};`)}`)}>${statusLabel(it.status)}</td>
          </tr>`
        }).join('\n')
    return `${band}\n${rows}`
  }).join('\n')

  const asumGroups = groupOpenByResponsible(d)
  const asumHtml = asumGroups.length === 0
    ? '<p style="font-style:italic;color:#888;">No open action items.</p>'
    : `<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
        <thead><tr><th ${TH} style="text-align:center;">Item #</th><th ${TH}>Action</th><th ${TH} style="text-align:center;">Due</th></tr></thead>
        <tbody>${asumGroups.map(([label, its]) => {
          const grow = `<tr><td colspan="3" style="background-color:${DOC.BAND_TINT};font-weight:bold;color:${DOC.INK};padding:5px 10px;border:1px solid ${DOC.RULE};">${esc(label)} — ${its.map((i: any) => d.num(i)).join(', ')}</td></tr>`
          const rows = its.map((it: any) => `<tr>
            <td ${td(`text-align:center;font-weight:bold;color:${DOC.INK};`)}>${esc(d.num(it))}</td>
            <td ${td()}>${esc(truncate(String(it.discussion ?? '').replace(/\s+/g, ' '), 90))}</td>
            <td ${td('text-align:center;')}>${esc(isoShort(it.due_date))}</td>
          </tr>`).join('\n')
          return `${grow}\n${rows}`
        }).join('\n')}</tbody>
      </table>`

  // FINAL DOM ORDER, conditionals mirrored exactly — the patcher refuses on a
  // count mismatch, so a table added to the template MUST add its row here.
  const tableGrids: number[][] = [
    [34, 32, 34],                                          // project / type # / date header
    [20, 20, 20, 20, 20],                                  // date/time/location/prepared/next strip
    ...(d.attendees.length > 0 ? [[22, 30, 34, 14]] : []), // attendees
    [8, 42, 26, 12, 12],                                   // minutes items
    ...(asumGroups.length > 0 ? [[10, 74, 16]] : []),      // action summary
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

<p style="text-align:center;color:${DOC.INK};font-size:13pt;font-weight:bold;margin:12px 0 0 0;">MEETING MINUTES — ${esc(d.typeName)} #${esc(m.meeting_number)}</p>

<table style="width:100%;border:1px solid ${DOC.BORDER};border-collapse:collapse;margin-top:14px;font-size:9.5pt;">
  <tr>
    <td style="padding:9px 13px;border:1px solid ${DOC.BORDER};vertical-align:middle;">
      <div><span style="color:#777;font-size:8.5pt;">Project:</span> <strong>${esc(d.project.name)}</strong></div>
      <div><span style="color:#777;font-size:8.5pt;">Reference:</span> <strong>${esc(d.project.com_number ?? '—')}</strong></div>
    </td>
    <td style="padding:9px 13px;border:1px solid ${DOC.BORDER};text-align:center;background-color:${DOC.ZEBRA};vertical-align:middle;">
      <strong style="color:${DOC.INK};font-size:11pt;">${esc(d.typeName)} #${esc(m.meeting_number)}</strong>
    </td>
    <td style="padding:9px 13px;border:1px solid ${DOC.BORDER};vertical-align:middle;">
      <div><span style="color:#777;font-size:8.5pt;">Date:</span> <strong>${esc(isoShort(m.meeting_date))}</strong></div>
      <div><span style="color:#777;font-size:8.5pt;">Prepared by:</span> <strong>${esc(m.prepared_by ?? '—')}</strong></div>
    </td>
  </tr>
</table>

<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:9pt;">
  <tr>
    <td ${td('text-align:center;')}><span style="color:#777;font-size:7.5pt;">DATE</span><br>${esc(isoShort(m.meeting_date))}</td>
    <td ${td('text-align:center;')}><span style="color:#777;font-size:7.5pt;">TIME</span><br>${esc(m.start_time ? String(m.start_time).slice(0, 5) : '—')}</td>
    <td ${td('text-align:center;')}><span style="color:#777;font-size:7.5pt;">LOCATION</span><br>${esc(m.location ?? '—')}</td>
    <td ${td('text-align:center;')}><span style="color:#777;font-size:7.5pt;">PREPARED BY</span><br>${esc(m.prepared_by ?? '—')}</td>
    <td ${td('text-align:center;')}><span style="color:#777;font-size:7.5pt;">NEXT MEETING</span><br>${esc(isoShort(m.next_meeting_date))}</td>
  </tr>
</table>

<h2>Attendees</h2>
${d.attendees.length === 0
  ? '<p style="font-style:italic;color:#888;">No attendees recorded.</p>'
  : `<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
      <thead><tr><th ${TH}>Role</th><th ${TH}>Name</th><th ${TH}>Company</th><th ${TH} style="text-align:center;">Attendance</th></tr></thead>
      <tbody>${attendeeRows}</tbody>
    </table>${distLine}`}

<h2>Minutes</h2>
<table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
  <thead><tr>
    <th ${TH} style="text-align:center;">Item #</th><th ${TH}>Discussion</th><th ${TH}>Responsible</th>
    <th ${TH} style="text-align:center;">Due</th><th ${TH} style="text-align:center;">Status</th>
  </tr></thead>
  <tbody>${topicsHtml}</tbody>
</table>

<h2>Action Summary by Responsible Party</h2>
${asumHtml}

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
    const { meeting_id } = req.body ?? {}
    if (!meeting_id) return res.status(400).json({ error: 'meeting_id required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Identity BEFORE any resource lookup (no id probing), then 404, then authz.
    const { userId } = await requireUser(req, supabase)

    const { data: meeting, error: mErr } = await supabase
      .from('meetings').select('*, meeting_types(name)').eq('id', meeting_id).single()
    if (mErr || !meeting) return res.status(404).json({ error: mErr?.message ?? 'not found' })

    await requireProjectAccess(supabase, userId, meeting.project_id)

    const [projRes, topicRes, attRes, itemRes, respRes, teamRes, roleRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', meeting.project_id).single(),
      supabase.from('meeting_topics').select('*').eq('meeting_id', meeting_id).order('sort_order'),
      supabase.from('meeting_attendees')
        .select('*, contacts(name, companies(name))').eq('meeting_id', meeting_id).order('sort_order'),
      supabase.from('meeting_items').select('*').eq('meeting_id', meeting_id).order('sort_order'),
      supabase.from('meeting_item_responsibles').select('id, item_id, assignment_id, text_label, sort_order, label_snapshot')
        .order('sort_order'),
      supabase.from('project_team_assignments')
        .select('id, companies(name, abbreviation), company_role_types(name, abbreviation)')
        .eq('project_id', meeting.project_id),
      supabase.from('company_role_types').select('name, sort_order'),
    ])

    const items = itemRes.data ?? []
    const findingIds = [...new Set(items.map((i: any) => i.linked_finding_id).filter(Boolean))]
    const { data: linkedFindings } = findingIds.length
      ? await supabase.from('findings').select('id, number, title').in('id', findingIds)
      : { data: [] as any[] }

    const teamMap = new Map<string, string>()
    for (const a of teamRes.data ?? []) {
      const co = Array.isArray((a as any).companies) ? (a as any).companies[0] : (a as any).companies
      const ro = Array.isArray((a as any).company_role_types) ? (a as any).company_role_types[0] : (a as any).company_role_types
      teamMap.set((a as any).id, `${ro?.abbreviation ?? ro?.name ?? '?'} — ${co?.name ?? '?'}`)
    }
    const findingMap = new Map((linkedFindings ?? []).map((f: any) =>
      [f.id, `Finding #${f.number ?? '—'}${f.title ? ` — ${f.title}` : ''}`]))
    const roleSort = new Map((roleRes.data ?? []).map((r: any) => [String(r.name).toLowerCase(), r.sort_order]))

    const topics = topicRes.data ?? []
    const itemsByTopic = new Map<string, any[]>()
    for (const t of topics) itemsByTopic.set(t.id, [])
    for (const it of items) if (itemsByTopic.has(it.topic_id)) itemsByTopic.get(it.topic_id)!.push(it)
    const displayNum = deriveItemNumbers(topics, items)
    // junction rows grouped per item (already ordered by sort_order). The query
    // is unfiltered by meeting — item ids scope it here; RLS scopes it too.
    const itemIds = new Set(items.map((i: any) => i.id))
    const respByItem = new Map<string, any[]>()
    for (const r of (respRes.data ?? []) as any[]) {
      if (!itemIds.has(r.item_id)) continue
      if (!respByItem.has(r.item_id)) respByItem.set(r.item_id, [])
      respByItem.get(r.item_id)!.push(r)
    }

    // ── FREEZE THE RESPONSIBLE COLUMN AT ISSUE (the attendee precedent's
    //    sibling, ruled 2026-08-19). Every junction row without a snapshot gets
    //    its party resolved NOW and frozen — never overwritten, so a deleted
    //    seat can no longer blank an issued document, and a party added after
    //    issue freezes at its first regenerate. Legacy-pair items (no junction
    //    rows) are materialized INTO the junction with their snapshot, so the
    //    frozen record is one shape.
    {
      const stamps: { id: string; label: string }[] = []
      for (const rows of respByItem.values()) {
        for (const r of rows as any[]) {
          if ((r.label_snapshot ?? '').trim()) continue
          const label = (r.assignment_id && teamMap.get(r.assignment_id)) ||
            (r.text_label ?? '').trim() || '—'
          stamps.push({ id: r.id, label })
          r.label_snapshot = label   // render THIS request from the frozen value
        }
      }
      for (const st of stamps) {
        await supabase.from('meeting_item_responsibles')
          .update({ label_snapshot: st.label }).eq('id', st.id).is('label_snapshot', null)
      }
      const legacyStamps: { item: any; assignment_id: string | null; label: string }[] = []
      for (const it of items as any[]) {
        if (respByItem.has(it.id)) continue
        const label = (it.responsible_assignment_id && teamMap.get(it.responsible_assignment_id)) ||
          (it.responsible_text ?? '').trim() || ''
        if (!label) continue
        legacyStamps.push({ item: it, assignment_id: it.responsible_assignment_id ?? null, label })
      }
      for (const ls of legacyStamps) {
        const { data: made } = await supabase.from('meeting_item_responsibles')
          .insert({ item_id: ls.item.id, assignment_id: ls.assignment_id,
            text_label: ls.assignment_id ? null : ls.label,
            sort_order: 0, label_snapshot: ls.label })
          .select('id, item_id, assignment_id, text_label, sort_order, label_snapshot').single()
        if (made) respByItem.set(ls.item.id, [made])
      }
    }

    const d: MinutesData = {
      project: projRes.data,
      meeting,
      typeName: (Array.isArray(meeting.meeting_types) ? meeting.meeting_types[0] : meeting.meeting_types)?.name ?? 'Meeting',
      attendees: attRes.data ?? [],
      topics,
      itemsByTopic,
      respLabel: (it: any) =>
        (it.responsible_assignment_id && teamMap.get(it.responsible_assignment_id)) ||
        (it.responsible_text ?? '').trim() || '—',
      respLabels: (it: any) => {
        const rows = respByItem.get(it.id) ?? []
        if (rows.length) {
          // SNAPSHOT-FIRST (ruled 2026-08-19): an issued document's responsible
          // column can never change retroactively. Live resolution is only for
          // rows not yet frozen (pre-issue).
          return rows.map((r: any) =>
            (r.label_snapshot ?? '').trim() ||
            (r.assignment_id && teamMap.get(r.assignment_id)) ||
            (r.text_label ?? '').trim() || '—')
        }
        // legacy pair — an item untouched since the F1 migration renders
        // exactly as it always did
        const single =
          (it.responsible_assignment_id && teamMap.get(it.responsible_assignment_id)) ||
          (it.responsible_text ?? '').trim() || '—'
        return [single]
      },
      num: (it: any) => displayNum.get(it.id) ?? it.item_number,
      findingLabel: (id: string | null) => (id && findingMap.get(id)) || null,
      roleSort,
    }

    // Integrity: every item must land in the rendered HTML.
    const renderedItems = [...itemsByTopic.values()].reduce((n, arr) => n + arr.length, 0)
    if (renderedItems !== items.length) {
      console.error(`[minutes] ITEM ROW MISMATCH: input=${items.length} rendered=${renderedItems}`)
    }
    console.log(`[minutes] meeting=${meeting_id} topics=${topics.length} items=${items.length} attendees=${d.attendees.length}`)

    const PDF_FOOTER = footerBand(`<em>${DISCLAIMER}</em>&nbsp;&nbsp;·&nbsp;&nbsp;Page <span class="pageNumber"></span> of <span class="totalPages"></span>`)

    const docxBuilt = buildDocxHtml(d)
    const [pdfBuffer, docxBuffer] = await Promise.all([
      toPdf(buildPdfHtml(d), PDF_FOOTER),
      toDocx(docxBuilt.html, docxBuilt.tableGrids),
    ])

    const typeSlug = d.typeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const uploaded = await uploadDocPair(
      supabase.storage.from('meeting-minutes'),
      `${meeting.project_id}/${typeSlug}-${meeting.meeting_number}`,
      docxBuffer, pdfBuffer,
    )
    if ('error' in uploaded) return res.status(500).json({ error: uploaded.error })
    const { storage_url, pdf_url } = uploaded

    // Issue: stamp issued_at on FIRST issue only — the disclaimer's 7-day clock.
    await supabase.from('meetings').update({
      storage_url, pdf_url, status: 'issued',
      ...(meeting.issued_at ? {} : { issued_at: new Date().toISOString() }),
    }).eq('id', meeting_id)

    return res.status(200).json({ storage_url, pdf_url })
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
    console.error('generate-minutes error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
