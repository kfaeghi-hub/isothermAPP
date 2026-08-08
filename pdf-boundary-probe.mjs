// PAGE-BOUNDARY PROBE — renders the site report's real table CSS with enough
// rows to force several breaks, once per candidate fix, so the variants can be
// compared as pictures instead of argued as theories.
//
// The bug: on the real (Lambda-rendered) PDF, the LAST table row on every page
// loses its bottom border and sits flush against the footer disclaimer. Rows do
// NOT split — `break-inside: avoid` works, and `thead` does repeat — so the two
// usual suspects are already correct in this codebase and the cause is narrower.
//
// NAMED SEAM: this renders in Playwright's Chromium, not Lambda's. Per the shim
// header's own warning, that makes it unfit to answer a question about exact
// pagination. It is used here only to COMPARE variants against a baseline that
// was first reproduced on the real Lambda artifact, and the chosen fix is
// verified again on a real production-generated PDF. A variant that fixes the
// baseline here and not there would be caught by that second gate.
//
// Run: node pdf-boundary-probe.mjs

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const INK = '#000000', BORDER = '#000000', RULE = '#808080', ZEBRA = '#F5F5F5', BAND = '#000000'

// the shared BASE_CSS table rules, verbatim in substance
const TABLE_CSS = `
  table { width: 100%; border-collapse: collapse; margin-top: 2px; font-size: 9.5pt; }
  thead { display: table-header-group; }
  thead th { background: ${BAND}; color: #fff; font-weight: 600; text-align: left; padding: 6px 10px; font-size: 9pt; border: 1px solid ${INK}; }
  tbody td { padding: 6px 10px; border: 1px solid ${RULE}; vertical-align: top; }
  tbody tr:nth-child(even) td { background: ${ZEBRA}; }
  tr { page-break-inside: avoid; break-inside: avoid; }
`

const VARIANTS = {
  // what ships today
  A_baseline: { css: '', margin: '0.55in' },

  // (1) more reserved margin — does clearance alone restore the border?
  B_bigger_margin: { css: '', margin: '0.85in' },

  // (2) the collapsed-border hypothesis: in `border-collapse: collapse` the
  //     bottom border belongs to the TABLE's collapsed grid, not the row box, so
  //     at a fragment break it is painted outside the fragmentainer and clipped.
  //     Separate borders put each edge inside the cell box, which travels with
  //     the row that break-inside already keeps whole.
  C_separate_borders: {
    css: `
      table { border-collapse: separate; border-spacing: 0; }
      thead th { border: 1px solid ${INK}; border-left-width: 0; }
      thead th:first-child { border-left-width: 1px; }
      tbody td { border: 1px solid ${RULE}; border-top-width: 0; border-left-width: 0; }
      tbody td:first-child { border-left-width: 1px; }
    `, margin: '0.55in',
  },

  // (4) tfoot spacer: `display: table-footer-group` repeats at the bottom of
  //     EVERY page fragment of the table, the mirror of thead repeating at the
  //     top. A borderless spacer row absorbs the few px the last real row's
  //     padding+border overflow by, so that border lands inside the content box.
  E_tfoot_spacer: { css: `tfoot { display: table-footer-group; } tfoot td { border: 0 !important; padding: 0 !important; height: 10px; background: none !important; }`, margin: '0.55in', tfoot: true },

  // (5) the same, plus a little clearance from the footer rule
  F_tfoot_plus_gutter: { css: `tfoot { display: table-footer-group; } tfoot td { border: 0 !important; padding: 0 !important; height: 10px; background: none !important; }`, margin: '0.7in', tfoot: true },

  // (6) THE PROPOSED FIX: the reserve is sized to the footer's own height PLUS
  //     an overflow allowance, and the footer's INK is pushed to the bottom of
  //     the band. Chromium places a row whose CONTENT fits and lets its padding
  //     and border overflow the content box (~10px, measured on the real PDF).
  //     Reserving more space alone just moves the collision; the allowance has
  //     to sit ABOVE the ink, which is what the footer padding-top buys.
  G_reserve_plus_sunk_footer: { css: '', margin: '0.72in', footerPadTop: 20 },

  // (3) both — separate borders AND a clearance gutter
  D_separate_plus_gutter: {
    css: `
      table { border-collapse: separate; border-spacing: 0; }
      thead th { border: 1px solid ${INK}; border-left-width: 0; }
      thead th:first-child { border-left-width: 1px; }
      tbody td { border: 1px solid ${RULE}; border-top-width: 0; border-left-width: 0; }
      tbody td:first-child { border-left-width: 1px; }
    `, margin: '0.7in',
  },
}

const ROWS = 60
const body = Array.from({ length: ROWS }, (_, i) => `
  <tr><td class="num">${i + 1}</td>
      <td><span class="cat">Casing free of damage</span><span class="cattag">Mechanical</span>
          <div class="dtext">Casing free of damage — TEST-ATS-1</div></td>
      <td class="act">—</td></tr>`).join('')

const TFOOT = `<tfoot><tr><td colspan="3"></td></tr></tfoot>`
const html = (extra, tfoot) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page { size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 10.5pt; line-height: 1.4; }
  .page { padding: 0 46px; }
  h2.sec { color: ${INK}; font-size: 12pt; font-weight: 700; margin: 20px 0 7px 0; padding-bottom: 3px; border-bottom: 2px solid ${INK}; break-after: avoid; }
  ${TABLE_CSS}
  table.issues th.num { width: 6%; text-align: center; }
  table.issues th.act { width: 14%; text-align: center; }
  table.issues td.num { text-align: center; font-weight: 700; color: ${INK}; }
  table.issues td.act { text-align: center; font-weight: 600; color: #444; }
  .cat { font-weight: 700; color: ${INK}; font-size: 9.5pt; display: block; margin-bottom: 4px; }
  .cattag { font-size: 8pt; color: #999; display: block; margin-top: -2px; margin-bottom: 6px; }
  .dtext { margin-top: 1px; }
  ${extra}
</style></head><body><div class="page">
  <h2 class="sec">Observed Issues &amp; Progress</h2>
  <table class="issues">
    <thead><tr><th class="num">#</th><th>Issue Details</th><th class="act">Action</th></tr></thead>
    ${tfoot ? TFOOT : ''}
    <tbody>${body}</tbody>
  </table>
</div></body></html>`

const footerFor = padTop => `<div style="width:100%;padding:${6 + (padTop ?? 0)}px 46px 12px;text-align:center;font-family:Arial,sans-serif;font-size:7.5pt;font-style:italic;color:#888888;border-top:1px solid #e5e5e5;box-sizing:border-box;line-height:1.3;">This information is for the sole use of the client and is a best reflection of the discussions that were recorded or added as a result of a site meeting or site review. Please forward any discrepancy or disagreement to Isotherm Engineering Ltd. as soon as possible.</div>`

mkdirSync('out/pdfdiag/probe', { recursive: true })
const browser = await chromium.launch()
for (const [name, v] of Object.entries(VARIANTS)) {
  const page = await browser.newPage()
  await page.setContent(html(v.css, v.tfoot), { waitUntil: 'domcontentloaded' })
  const pdf = await page.pdf({
    format: 'letter', printBackground: true,
    margin: { top: '0.5in', right: '0', bottom: v.margin, left: '0' },
    displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footerFor(v.footerPadTop),
  })
  writeFileSync(`out/pdfdiag/probe/${name}.pdf`, pdf)
  console.log(`${name.padEnd(24)} margin ${v.margin}`)
  await page.close()
}
await browser.close()
console.log('\nprobe PDFs → out/pdfdiag/probe/')
