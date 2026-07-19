import { createClient } from '@supabase/supabase-js'
import {
  esc, isoShort, BASE_CSS, FIRM_HEADER_PDF, FIRM_HEADER_DOCX, toPdf, toDocx, uploadDocPair,
} from './_shared/doc-common.js'

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

/** Open items grouped by responsible label for the Action Summary. */
function groupOpenByResponsible(d: MinutesData) {
  const groups = new Map<string, any[]>()
  for (const topic of d.topics) {
    for (const it of d.itemsByTopic.get(topic.id) ?? []) {
      if (it.status !== 'open') continue
      const label = d.respLabel(it)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(it)
    }
  }
  return [...groups.entries()].sort((a, b) =>
    (a[0] === '—' ? 1 : 0) - (b[0] === '—' ? 1 : 0) || a[0].localeCompare(b[0]))
}

// ── PDF HTML ───────────────────────────────────────────────────────────────────

const CSS = `${BASE_CSS}
  .doctitle { text-align: center; color: #1F3A5F; font-size: 13pt; font-weight: 700; margin-top: 12px; letter-spacing: 0.4px; }
  .meta td { text-align: center; font-size: 9pt; }
  .meta .lbl { color: #777; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; display: block; }
  .band td { background: #1F3A5F !important; color: #fff; font-weight: 700; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.3px; padding: 5px 10px; border-color: #1F3A5F; }
  .noitems td { font-style: italic; color: #999; }
  td.inum { text-align: center; font-weight: 700; color: #1F3A5F; white-space: nowrap; }
  td.st { text-align: center; font-weight: 700; }
  .st-open { color: #B7791F; } .st-closed { color: #888; } .st-info { color: #2B6CB0; }
  tr.item-closed td { color: #888; background: #EFEFEF !important; }
  .flink { display: block; font-size: 8pt; color: #B7791F; margin-top: 2px; }
  .carr { color: #B7791F; font-weight: 400; }
  .dist { font-size: 8.5pt; color: #666; margin-top: 4px; }
  .asum-group td { background: #E8EDF4 !important; font-weight: 700; color: #1F3A5F; }
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
            <td class="inum">${esc(it.item_number)}${it.carried_from_item_id ? '<span class="carr"> ↺</span>' : ''}</td>
            <td>${esc(it.discussion)}${fl ? `<span class="flink">${esc(fl)}</span>` : ''}</td>
            <td>${esc(d.respLabel(it))}</td>
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
          const grow = `<tr class="asum-group"><td colspan="3">${esc(label)} — ${its.map((i: any) => i.item_number).join(', ')}</td></tr>`
          const rows = its.map((it: any) => `<tr>
            <td class="inum">${esc(it.item_number)}</td>
            <td>${esc(truncate(it.discussion, 90))}</td>
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

function buildDocxHtml(d: MinutesData): string {
  const m = d.meeting
  const TH = 'style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid #1F3A5F;font-size:9pt;"'
  const td = (extra = '') => `style="padding:6px 10px;border:1px solid #DDE3EA;vertical-align:top;${extra}"`

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
    const band = `<tr><td colspan="5" style="background-color:#1F3A5F;color:#ffffff;font-weight:bold;font-size:9.5pt;padding:5px 10px;border:1px solid #1F3A5F;">${esc(topic.title).toUpperCase()}</td></tr>`
    const rows = its.length === 0
      ? `<tr><td colspan="5" ${td('font-style:italic;color:#999;')}>No items — reviewed, nothing arising.</td></tr>`
      : its.map(it => {
          const closed = it.status === 'closed'
          const bg = closed ? 'background-color:#EFEFEF;color:#888;' : ''
          const fl = d.findingLabel(it.linked_finding_id)
          return `<tr>
            <td ${td(`text-align:center;font-weight:bold;${bg}${closed ? '' : 'color:#1F3A5F;'}`)}>${esc(it.item_number)}${it.carried_from_item_id ? ' ↺' : ''}</td>
            <td ${td(bg)}>${esc(it.discussion)}${fl ? `<br><span style="font-size:8pt;color:#B7791F;">${esc(fl)}</span>` : ''}</td>
            <td ${td(bg)}>${esc(d.respLabel(it))}</td>
            <td ${td(`text-align:center;${bg}`)}>${esc(isoShort(it.due_date))}</td>
            <td ${td(`text-align:center;font-weight:bold;${bg || (it.status === 'open' ? 'color:#B7791F;' : 'color:#2B6CB0;')}`)}>${statusLabel(it.status)}</td>
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
          const grow = `<tr><td colspan="3" style="background-color:#E8EDF4;font-weight:bold;color:#1F3A5F;padding:5px 10px;border:1px solid #DDE3EA;">${esc(label)} — ${its.map((i: any) => i.item_number).join(', ')}</td></tr>`
          const rows = its.map((it: any) => `<tr>
            <td ${td('text-align:center;font-weight:bold;color:#1F3A5F;')}>${esc(it.item_number)}</td>
            <td ${td()}>${esc(truncate(it.discussion, 90))}</td>
            <td ${td('text-align:center;')}>${esc(isoShort(it.due_date))}</td>
          </tr>`).join('\n')
          return `${grow}\n${rows}`
        }).join('\n')}</tbody>
      </table>`

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

${FIRM_HEADER_DOCX}

<p style="text-align:center;color:#1F3A5F;font-size:13pt;font-weight:bold;margin:12px 0 0 0;">MEETING MINUTES — ${esc(d.typeName)} #${esc(m.meeting_number)}</p>

<table style="width:100%;border:1px solid #C9D2DD;border-collapse:collapse;margin-top:14px;font-size:9.5pt;">
  <tr>
    <td style="padding:9px 13px;border:1px solid #C9D2DD;vertical-align:middle;">
      <div><span style="color:#777;font-size:8.5pt;">Project:</span> <strong>${esc(d.project.name)}</strong></div>
      <div><span style="color:#777;font-size:8.5pt;">Reference:</span> <strong>${esc(d.project.com_number ?? '—')}</strong></div>
    </td>
    <td style="padding:9px 13px;border:1px solid #C9D2DD;text-align:center;background-color:#F4F7FB;vertical-align:middle;">
      <strong style="color:#1F3A5F;font-size:11pt;">${esc(d.typeName)} #${esc(m.meeting_number)}</strong>
    </td>
    <td style="padding:9px 13px;border:1px solid #C9D2DD;vertical-align:middle;">
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
}

// ── Vercel serverless handler ──────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { meeting_id } = req.body ?? {}
    if (!meeting_id) return res.status(400).json({ error: 'meeting_id required' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    const { data: meeting, error: mErr } = await supabase
      .from('meetings').select('*, meeting_types(name)').eq('id', meeting_id).single()
    if (mErr || !meeting) return res.status(404).json({ error: mErr?.message ?? 'not found' })

    const [projRes, topicRes, attRes, itemRes, teamRes, roleRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', meeting.project_id).single(),
      supabase.from('meeting_topics').select('*').eq('meeting_id', meeting_id).order('sort_order'),
      supabase.from('meeting_attendees')
        .select('*, contacts(name, companies(name))').eq('meeting_id', meeting_id).order('sort_order'),
      supabase.from('meeting_items').select('*').eq('meeting_id', meeting_id).order('sort_order'),
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
      findingLabel: (id: string | null) => (id && findingMap.get(id)) || null,
      roleSort,
    }

    // Integrity: every item must land in the rendered HTML.
    const renderedItems = [...itemsByTopic.values()].reduce((n, arr) => n + arr.length, 0)
    if (renderedItems !== items.length) {
      console.error(`[minutes] ITEM ROW MISMATCH: input=${items.length} rendered=${renderedItems}`)
    }
    console.log(`[minutes] meeting=${meeting_id} topics=${topics.length} items=${items.length} attendees=${d.attendees.length}`)

    const PDF_FOOTER = `<div style="width:100%;padding:6px 46px 12px;text-align:center;font-family:Arial,sans-serif;font-size:7.5pt;font-style:italic;color:#888888;border-top:1px solid #e5e5e5;box-sizing:border-box;line-height:1.3;">${DISCLAIMER}&nbsp;&nbsp;·&nbsp;&nbsp;Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`

    const [pdfBuffer, docxBuffer] = await Promise.all([
      toPdf(buildPdfHtml(d), PDF_FOOTER),
      toDocx(buildDocxHtml(d)),
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
    console.error('generate-minutes error:', err)
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}
