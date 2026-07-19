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
`

// ── letterhead markup (verbatim in both paths) ────────────────────────────────

export const FIRM_HEADER_PDF = `<div class="firm">
    <h1>ISOTHERM ENGINEERING LTD.</h1>
    <div class="addr">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2<br>
    Ph 905-822-2430 &nbsp;&bull;&nbsp; e-mail: info@isothermengineering.com</div>
  </div>
  <div class="brandrule"></div>`

export const FIRM_HEADER_DOCX = `<h1 style="color:#1F3A5F;font-size:19pt;font-weight:bold;text-align:center;margin:0;">ISOTHERM ENGINEERING LTD.</h1>
<p style="text-align:center;font-size:8.5pt;color:#555;margin:2px 0;">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2 &nbsp;&bull;&nbsp; Ph 905-822-2430 &nbsp;&bull;&nbsp; info@isothermengineering.com</p>`

// ── PDF via Puppeteer + @sparticuz/chromium-min ────────────────────────────────

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
      margin: { top: '0.5in', right: '0', bottom: '0.55in', left: '0' },
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

// ── Storage upload + cache-busted public URLs ─────────────────────────────────

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

  // Cache-bust so browsers always serve the freshly generated file.
  const ts = Date.now()
  const { data: { publicUrl: rawDocxUrl } } = storage.getPublicUrl(`${basePath}.docx`)
  const { data: { publicUrl: rawPdfUrl  } } = storage.getPublicUrl(`${basePath}.pdf`)
  return { storage_url: `${rawDocxUrl}?t=${ts}`, pdf_url: `${rawPdfUrl}?t=${ts}` }
}
