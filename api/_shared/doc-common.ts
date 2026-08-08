// Shared document-generation helpers — EXTRACTION ONLY from generate-report.ts.
// Every string constant and function body here is verbatim from the report
// generator; the pw-report-regen byte-clean gate proves the refactor changed
// nothing. Files under api/_shared are not deployed as endpoints.

import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'

// html-to-docx is a UMD module; Vercel's esbuild handles CJS→ESM interop.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import HTMLtoDOCX from 'html-to-docx'

// Chromium pack hosted on GitHub Releases — downloaded to /tmp on cold start,
// cached for the lifetime of the Lambda instance (subsequent calls are fast).
// Update this URL when upgrading @sparticuz/chromium-min.
export const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar'

// ── DOCUMENT IDENTITY PALETTE ─────────────────────────────────────────────────
//
// MONOCHROME as of 2026-08-05 (Tony's ruling — Amendment 1 of
// docs/DOCUMENT-IDENTITY-DECISION.md). The brand layer is RETIRED from generated
// documents until the rebrand lands. Reference standard: the firm's current Site
// Note format (Isotherm_SiteNote_5_Combined) — black ink, gray bands, light-gray
// field fills, white body, plain black-bordered tables.
//
// History: navy #1F3A5F → purple/vermilion 2026-07-26 → monochrome 2026-08-05.
// The convergence that produced this object is what made the amendment cheap:
// 104 hex literals across four files became these eight fields, so the identity
// changed in one place. That was the whole point of it.
//
// Rule 4 consequence, unchanged and now twice-applied: files already ISSUED stay
// exactly as issued. A long project may hold navy, then purple, then monochrome
// documents. That mixed set is intentional — a document records what it looked
// like when it was issued.
//
// The band ramp is DARK, not the reference's ~ADADAD, and that is deliberate:
// BAND/BAND_UNIT/BAND_SUB all carry WHITE text in the generators, so a mid-gray
// fill would put white on ~2:1. The ramp below holds 21:1 / 8.9:1 / 4.6:1 and
// survives the greyscale printing these documents get on site — the same test
// that fenced vermilion out of structural roles below. ADADAD has no role here;
// the reference's field-label gray D9D9D9 landed on BAND_TINT, where the field
// labels actually live.
//
// NOTE FOR ANY FUTURE CHANGE: no automated gate catches colour. pw-report-regen
// strips every tag and compares visible TEXT, so a palette edit is invisible to
// it — which is why it needed no baseline reset, and why it will not protect
// you. Change these values only with a visual pass over one of each document
// type, PDF and DOCX.
export const DOC = {
  /** The identity. Letterhead, section headings and their underline, numeric
   *  cells, field labels, the brand rule. Was navy #1F3A5F, then purple #443C8F. */
  INK: '#000000',
  /** Solid fills that carry WHITE text: table heads, minutes topic bands,
   *  checklist section bands. Same hex as INK by design — one identity, two
   *  roles; kept separate so a future tweak can move one without the other. */
  BAND: '#000000',
  /** Checklist UNIT header band — the second level of its three-deep header.
   *  White text at 8.9:1. */
  BAND_UNIT: '#4D4D4D',
  /** Checklist SUB header band — the third level. White text at 4.6:1; this is
   *  the lightest step that still legally carries white. Do not lighten it. */
  BAND_SUB: '#757575',
  /** Light band fills that carry INK text: checklist category bands, the
   *  minutes action-summary group rows. The Site Note's field-label gray. */
  BAND_TINT: '#D9D9D9',
  /** Structural borders: project header, legend box, checklist header table,
   *  signature rules, band borders. "Plain black-bordered tables." */
  BORDER: '#000000',
  /** Table body cell borders — lighter than BORDER, the hairline weight. Mid
   *  gray rather than near-white: the old #E1DEEB printed as nothing. */
  RULE: '#808080',
  /** Even-row striping and light panel washes (the project-header mid cell). */
  ZEBRA: '#F5F5F5',
} as const

// ── DOCUMENT SEMANTICS — deliberately NOT part of the identity ────────────────
//
// These survived the convergence unchanged, and the 2026-08-05 monochrome
// amendment explicitly did not touch them either. That was a decision both
// times, not an oversight. DO NOT fold them into DOC above.
//   · CONSEQUENCE OF THE AMENDMENT: these are now the ONLY colour in a generated
//     document. That is the point — every remaining colour carries meaning, and
//     none of it is decoration. Adding a colour here is now a semantic claim.
//   · The closed-finding band says CLOSED, not PASSED. Recolouring it to
//     conformance green would smuggle a semantic change in with a palette one.
//   · Outstanding/recorded and the meeting item statuses are conformance
//     meaning. The app keeps semantic colour separate from brand for the same
//     reason.
//   · VERMILION IS STRUCTURAL-NEVER. It may be a small accent; it may never be
//     a band fill or a rule. BT.601 luma 113.8 against navy's 54.1 and purple's
//     71.9 — it does not survive the greyscale printing these documents get on
//     site. The amber below is the accent slot, and it predates the ruling.
export const DOC_SEMANTIC = {
  CLOSED_FILL: '#E3E3E3',
  CLOSED_TEXT: '#777777',
  OUTSTANDING: '#C0392B',
  RECORDED: '#1E8449',
  ITEM_OPEN: '#B7791F',
  ITEM_CLOSED: '#888888',
  ITEM_INFO: '#2B6CB0',
} as const

// ── helpers ────────────────────────────────────────────────────────────────────

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function isoShort(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '—'
}

export function isoLong(iso: string): string {
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function isFilenameCaption(c: string | null | undefined): boolean {
  return !!c && /\.(jpe?g|png|gif|webp|heic|avif|bmp|tiff?)$/i.test(c.trim())
}

export function toBase64(data: Buffer): string {
  return data.toString('base64')
}

// Contact email resolution: PRIMARY row from contact_emails, falling back to the
// legacy contacts.email column during the dual-read transition. The backfill made
// these identical, so regenerating an existing report must not change its content.
export function primaryEmail(c: any): string {
  const rows = Array.isArray(c?.contact_emails) ? c.contact_emails
             : c?.contact_emails ? [c.contact_emails] : []
  const primary = rows.find((e: any) => e?.is_primary)
  return primary?.email ?? c?.email ?? ''
}

// ── shared CSS base (PDF path) — letterhead, project header, section/table rules ──

export const BASE_CSS = `
  @page { size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; color: #222; font-size: 10.5pt; line-height: 1.4; }
  .page { padding: 0 46px 0 46px; }

  /* letterhead */
  .firm { text-align: center; }
  .firm h1 { color: ${DOC.INK}; font-size: 19pt; letter-spacing: 0.5px; font-weight: 700; }
  .firm .addr { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: ${DOC.BAND}; margin: 9px 0 0 0; border-radius: 2px; }

  /* project header */
  .phead { display: table; width: 100%; margin-top: 14px; border: 1px solid ${DOC.BORDER}; border-radius: 4px; overflow: hidden; }
  .phead .cell { display: table-cell; padding: 9px 13px; vertical-align: middle; font-size: 9.5pt; }
  .phead .left  { width: 40%; }
  .phead .mid   { width: 28%; text-align: center; background: ${DOC.ZEBRA}; border-left: 1px solid ${DOC.BORDER}; border-right: 1px solid ${DOC.BORDER}; }
  .phead .right { width: 32%; }
  .phead .label { color: #777; font-size: 8.5pt; }
  .phead .val   { font-weight: 600; }
  .phead .note  { color: ${DOC.INK}; font-weight: 700; font-size: 11pt; }

  /* section headings */
  h2.sec { color: ${DOC.INK}; font-size: 12pt; font-weight: 700; margin: 20px 0 7px 0; padding-bottom: 3px; border-bottom: 2px solid ${DOC.INK}; page-break-after: avoid; break-after: avoid; }

  /* tables */
  table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  thead th { background: ${DOC.BAND}; color: #fff; font-weight: 600; text-align: left; padding: 6px 10px; font-size: 9pt; border: 1px solid ${DOC.INK}; }
  tbody td { padding: 6px 10px; border: 1px solid ${DOC.RULE}; vertical-align: top; }
  tbody tr:nth-child(even) td { background: ${DOC.ZEBRA}; }
  tr { page-break-inside: avoid; break-inside: avoid; }
`

// ── letterhead markup (verbatim in both paths) ────────────────────────────────

export const FIRM_HEADER_PDF = `<div class="firm">
    <h1>ISOTHERM ENGINEERING LTD.</h1>
    <div class="addr">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2<br>
    Ph 905-822-2430 &nbsp;&bull;&nbsp; e-mail: info@isothermengineering.com</div>
  </div>
  <div class="brandrule"></div>`

export const FIRM_HEADER_DOCX = `<h1 style="color:${DOC.INK};font-size:19pt;font-weight:bold;text-align:center;margin:0;">ISOTHERM ENGINEERING LTD.</h1>
<p style="text-align:center;font-size:8.5pt;color:#555;margin:2px 0;">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2 &nbsp;&bull;&nbsp; Ph 905-822-2430 &nbsp;&bull;&nbsp; info@isothermengineering.com</p>`

// ── PDF via Puppeteer + @sparticuz/chromium-min ────────────────────────────────

// ── the footer band: reserve, and why it is this size ─────────────────────────
//
// THE RESERVE IS SIZED TO THE FOOTER'S HEIGHT PLUS AN OVERFLOW ALLOWANCE.
//
// Chromium places a table row whose CONTENT fits the remaining space and then
// lets that row's bottom padding and border overflow the content box. Measured
// on a real nine-page site report: the last row's rule was painted at y≈749 on
// a page whose content box ends at 739.2 — **10px inside the reserved band**,
// straight through the disclaimer.
//
// The old reserve was 0.55in (52.8px) against a footer that is ~45px tall, so
// the footer's top rule sat about 2px below the content box and any overflow
// landed on it. Three structural fixes were tried and measured, and all three
// FAILED to stop the overflow: a bigger margin alone, `border-collapse:
// separate` so each border lives in its own cell box, and a repeating `tfoot`
// spacer. `break-inside: avoid` was already working (rows never split) and
// `thead` already repeated — the two usual suspects were not the cause.
//
// So the fix is geometric rather than structural, and it has two halves that
// only work together:
//   1. reserve MORE than the footer needs, and
//   2. push the footer's INK to the bottom of what is reserved.
// Reserving more space on its own just moves the collision, because the footer
// still starts at the top of the band. The allowance has to sit ABOVE the ink.
export const PDF_BOTTOM_RESERVE = '0.72in'   // 69px: ~45px footer + ~24px allowance
const FOOTER_SINK_PX = 20                    // pushes the footer rule down the band

/** Wrap a footer's inner HTML so its rule sits at the BOTTOM of the reserved
 *  band. Every family's footer goes through this, so the allowance cannot be
 *  reserved in one document and silently skipped in another. */
export function footerBand(inner: string): string {
  return `<div style="width:100%;box-sizing:border-box;padding:${6 + FOOTER_SINK_PX}px 46px 12px;text-align:center;font-family:Arial,sans-serif;font-size:7.5pt;color:#888888;border-top:1px solid #e5e5e5;line-height:1.3;">${inner}</div>`
}

export async function toPdf(html: string, footerTemplate: string): Promise<Buffer> {
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
      // top/bottom margins managed here so Puppeteer owns the footer zone;
      // position:fixed footer removed from HTML to prevent overlay clipping rows.
      // bottom = PDF_BOTTOM_RESERVE — see the note above it for why it is 0.72in
      // and not the footer's own height.
      margin: { top: '0.5in', right: '0', bottom: PDF_BOTTOM_RESERVE, left: '0' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ── docx via html-to-docx (pure JS, no native binary) ─────────────────────────

export async function toDocx(html: string): Promise<Buffer> {
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

// ── Storage upload — returns bucket-relative PATHS (storage privacy pass) ─────
// The DB persists paths, never URLs: signed URLs expire, so storing them is
// wrong by construction. Consumers mint short-lived signed URLs on demand via
// api/get-file-url. Signing works on public buckets too, so this code deploys
// ahead of the private flip. Cache-busting is obsolete: every signed URL is
// unique per mint, and `upsert: true` overwrites in place.

export async function uploadDocPair(
  storage: any, basePath: string, docxBuffer: Buffer, pdfBuffer: Buffer,
): Promise<{ storage_url: string; pdf_url: string } | { error: string }> {
  const [docxUp, pdfUp] = await Promise.all([
    storage.upload(`${basePath}.docx`, docxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    }),
    storage.upload(`${basePath}.pdf`, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    }),
  ])
  if (docxUp.error ?? pdfUp.error)
    return { error: (docxUp.error ?? pdfUp.error).message }

  // Same keys as before, but the values are now bucket-relative paths.
  return { storage_url: `${basePath}.docx`, pdf_url: `${basePath}.pdf` }
}
