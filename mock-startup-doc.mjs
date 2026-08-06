// PHASE 0 MOCKUP — the Start-Up checklist document design, for approval.
//
// NOT a generator. Nothing here seeds, nothing here is ratified content. This
// renders ONE document on ONE real equipment type (boiler) so the design can be
// looked at and ruled on before Phase 1 mines a single sheet. The line items are
// ILLUSTRATIVE — they are there to make the layout answerable, and Phase 2 is
// what anchors real content to CSA B149.1 / ASHRAE 202 / the manufacturer's IOM.
//
// Design constraints it is built to:
//   · MONOCHROME FROM BIRTH (DOCUMENT-IDENTITY-DECISION Amendment 1). It imports
//     DOC/DOC_SEMANTIC from doc-common rather than restating hexes, so it cannot
//     drift from the identity it is supposed to demonstrate.
//   · Same document class as IVC/PFC — .firm letterhead, bordered header block,
//     .th-unit/.th-sub band ramp, nameplate snapshot grid, sign-off rules.
//   · Start-Up's own signature: THE CONTRACTOR PERFORMS, THE CxA WITNESSES,
//     AND BOTH SIGN. That is what makes it a fourth type rather than an ivc
//     variant, so it is the part of this design that is not negotiable.
//   · Field-usable on paper and on a phone.
//
// Run: node mock-startup-doc.mjs   →  out/mockup/startup-boiler-{completed,blank}.pdf + .png

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'

const OUT = 'out/mockup'
mkdirSync(OUT, { recursive: true })

// Pull DOC straight from the production module — a mockup that restates the
// palette is a mockup of a palette nobody ships.
await build({
  entryPoints: ['api/_shared/doc-common.ts'], outfile: `${OUT}/doc-common.mjs`,
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  packages: 'external', logLevel: 'error',
  alias: { '@sparticuz/chromium-min': './doc-render-chromium-shim.mjs' },
})
const { DOC, DOC_SEMANTIC } = await import(`${pathToFileURL(`${OUT}/doc-common.mjs`).href}?t=${Date.now()}`)

// ── content ───────────────────────────────────────────────────────────────────
const UNIT = {
  tag: 'B-1', descriptor: 'Gas-Fired Condensing Hot Water Boiler',
  location: 'Boiler Room 101, Level 1', serves: 'Heating hot water loop — Zones 1-4',
}
const NAMEPLATE = [
  ['MANUFACTURER',        'Viessmann',    'Viessmann',    'Viessmann'],
  ['MODEL NUMBER',        'Vitocrossal 300', 'CT3-1000',  'CT3-1000'],
  ['SERIAL NUMBER',       '',             '',             '7419-CT3-00841'],
  ['INPUT (MBH)',         '1000',         '1000',         '1000'],
  ['OUTPUT (MBH)',        '970',          '972',          '972'],
  ['FUEL TYPE',           'Natural gas',  'Natural gas',  'Natural gas'],
  ['GAS PRESSURE (IN. W.C.)', '7.0',      '7.0',          '7.0'],
  ['DESIGN EWT / LWT (°C)', '60 / 80',    '60 / 80',      '—'],
  ['FLOW RATE (L/S)',     '11.6',         '11.6',         '—'],
  ['MAWP (KPA)',          '550',          '550',          '550'],
  ['VOLTAGE (V)',         '120',          '120',          '120'],
  ['PHASE (Ø)',           '1',            '1',            '1'],
  ['FLA (A)',             '',             '9.8',          '9.8'],
]

// A. Pre-start — the gate. B. Sequence — NUMBERED, because the order is the
// content: doing 3 before 2 on a fired appliance is the failure this section
// exists to prevent. C/D — checks. Numbering elsewhere would be decoration.
const PRESTART = [
  ["Manufacturer's IOM start-up steps reviewed, completed & attached", 'Y', ''],
  ['Installation verification checklist (IVC) complete and signed', 'Y', ''],
  ['Gas piping pressure-tested, purged and leak-checked; report attached', 'Y', ''],
  ['Gas train components installed per CSA B149.1 and the approved shop drawing', 'Y', ''],
  ['Hydronic system filled, vented, pressure-tested and flushed; report attached', 'Y', ''],
  ['Water treatment in service; initial sample results attached', 'N', 'F-014'],
  ['Venting / combustion air installed complete per IOM; terminations clear', 'Y', ''],
  ['Condensate drain and neutralizer piped, trapped and flowing to drain', 'Y', ''],
  ['Permanent power available; circuit labelled and breaker sized per nameplate', 'Y', ''],
  ['Controls / BAS points terminated; interlocks landed and identified', 'Y', ''],
  ['Relief valve installed, discharge piped to within 150 mm of floor', 'Y', ''],
  ['Area clear; fire extinguisher present; no hot work in progress', 'Y', ''],
]
const SEQUENCE = [
  ['1', 'Isolate and lock out gas; confirm zero pressure downstream of the manual valve', 'Y', ''],
  ['2', 'Energize control circuit only; verify display, no fault codes, correct firmware', 'Y', ''],
  ['3', 'Verify circulating pump runs and proves flow BEFORE any call for heat', 'Y', ''],
  ['4', 'Restore gas; leak-check every joint disturbed during start-up', 'Y', ''],
  ['5', 'Initiate first firing sequence; observe pre-purge for full manufacturer duration', 'Y', ''],
  ['6', 'Confirm ignition on first trial; record trials-for-ignition count', 'Y', ''],
  ['7', 'Verify flame signal stable at low fire; record microamps / volts', 'Y', ''],
  ['8', 'Modulate low → high → low; confirm smooth turndown with no flame loss', 'Y', ''],
  ['9', 'Combustion analysis at low, mid and high fire — see Readings', 'Y', ''],
  ['10', 'Verify post-purge completes and unit returns to standby cleanly', 'Y', ''],
]
const RUNNING = [
  ['Boiler holds setpoint under load without short-cycling', 'Y', ''],
  ['Pump differential pressure stable; no cavitation or air noise', 'Y', ''],
  ['Vent temperature within IOM limits; no condensation outside the vent', 'Y', ''],
  ['Condensate flows freely; neutralizer discharge pH within limits', 'Y', ''],
  ['No gas odour, no flue-gas spillage at the appliance or terminations', 'Y', ''],
  ['BAS reads boiler status, setpoint, supply and return within tolerance', 'N', 'F-015'],
  ['Outdoor-air reset curve loaded and matches the approved sequence', 'NR', ''],
]
const SAFETY = [
  ['High-limit aquastat (manual reset)', '95 °C', '95 °C', '95 °C', 'Raised setpoint below temp', 'Y'],
  ['Operating limit', '82 °C', '82 °C', '82 °C', 'Observed cut-out', 'Y'],
  ['Low-water cutoff (probe type)', 'On loss of probe', '—', '—', 'Probe removed / simulated', 'Y'],
  ['Flame failure — main valve closes', '≤ 4 s', '—', '2.8 s', 'Flame rod removed, timed', 'Y'],
  ['High gas pressure switch', '10 in. w.c.', '10', '10', 'Manual trip', 'Y'],
  ['Low gas pressure switch', '4 in. w.c.', '4', '4', 'Manual trip', 'Y'],
  ['Blocked vent / air-proving switch', 'Per IOM', '—', '—', 'Inlet blocked, lockout confirmed', 'Y'],
  ['Relief valve — seal intact, rating verified', '550 kPa', '550', '550', 'Visual / nameplate', 'Y'],
  ['Emergency shutoff switch at room exit', 'Kills fuel + power', '—', '—', 'Operated', 'Y'],
]
const READINGS = [
  ['Firing rate', '%', '20', '60', '100'],
  ['Gas pressure — inlet', 'in. w.c.', '7.0', '6.9', '6.8'],
  ['Gas pressure — manifold', 'in. w.c.', '1.4', '2.6', '3.5'],
  ['O₂', '%', '5.1', '4.8', '4.6'],
  ['CO₂', '%', '8.9', '9.1', '9.2'],
  ['CO (air-free)', 'ppm', '18', '24', '31'],
  ['Stack temperature', '°C', '48', '57', '66'],
  ['Combustion efficiency', '%', '96.8', '96.1', '95.4'],
  ['Supply water temperature', '°C', '71', '76', '80'],
  ['Return water temperature', '°C', '63', '64', '62'],
  ['Flame signal', 'µA', '9.4', '9.6', '9.5'],
  ['Amp draw — boiler circuit', 'A', '3.1', '6.4', '9.5'],
]

// ── html ──────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const st = (v, mode) => {
  if (mode === 'blank') return '<td class="st-cell"></td>'
  const cls = v === 'Y' ? 'st-y' : v === 'N' ? 'st-n' : 'st-nr'
  return `<td class="st-cell ${cls}">${esc(v)}</td>`
}
const fnd = (f, mode) => mode === 'blank' ? '<td></td>' : `<td class="st-cell">${f ? `<span class="fnd">${esc(f)}</span>` : ''}</td>`
const cell = (v, mode) => `<td class="np-val">${mode === 'blank' ? '' : esc(v)}</td>`

function html(mode) {
  const blank = mode === 'blank'
  const line = '<span class="hdr-line">&nbsp;</span>'
  return `<style>${CSS}</style>
<body class="${blank ? 'mode-blank' : ''}"><div class="page">

  <div class="firm">
    <h1>ISOTHERM ENGINEERING LTD.</h1>
    <div class="addr">95 Mural Street, Suite 600, Richmond Hill, ON, L4B 3G2 &nbsp;&bull;&nbsp; Ph 905-822-2430 &nbsp;&bull;&nbsp; info@isothermengineering.com</div>
  </div>
  <div class="brandrule"></div>

  <!-- MASTHEAD. The one element that is new to this family: a solid band naming
       the document type. Start-Up is the only checklist that is a PROCEDURE with
       a live appliance at the end of it, and the document should say so before
       anyone reads a line item. -->
  <div class="masthead">
    <div class="mh-type">EQUIPMENT START-UP CHECKLIST</div>
    <div class="mh-eq">${esc(UNIT.descriptor)} &nbsp;·&nbsp; ${esc(UNIT.tag)}</div>
  </div>

  ${blank ? `<div class="blank-notice">BLANK FORM — CONTRACTOR PERFORMS THE START-UP. Complete on site, sign, and return to Isotherm Engineering Ltd. for witness sign-off.</div>` : ''}

  <div class="title-legend">
    <div class="tl-title">
      <div class="cl-name">Boiler Start-Up Checklist</div>
      <div class="cl-sub">START-UP &nbsp;·&nbsp; ${blank ? 'BLANK FORM — FOR CONTRACTOR USE' : 'COMPLETED'} &nbsp;·&nbsp; Rev 0</div>
    </div>
    <div class="tl-legend">
      <div class="lg-hdr">LEGEND</div>
      Y &mdash; Complete / satisfactory<br>
      N &mdash; Not satisfactory &mdash; raise finding<br>
      NR &mdash; Not required for this unit<br>
      <b>HOLD</b> &mdash; Cannot proceed &mdash; state why
    </div>
  </div>

  <!-- HOLD is the state IVC does not have and start-up cannot do without: a
       sequence can be BLOCKED (no permanent power, no water treatment, no gas)
       and that is different from "not satisfactory". A blocked start-up that
       gets recorded as a failure reads, later, as work that was done badly
       rather than work that could not be done. -->

  <table class="hdr-tbl"><tbody><tr>
    <td width="50%">
      <div class="kv"><span class="hdr-lbl">CUSTOMER:</span> <span class="hdr-val">Toronto District School Board</span></div>
      <div class="kv"><span class="hdr-lbl">PROJECT:</span> <span class="hdr-val">J G Workman PS &mdash; Steam Boiler Replacement</span></div>
      <div class="kv"><span class="hdr-lbl">PROJECT #:</span> <span class="hdr-val">257970</span></div>
      <div class="kv"><span class="hdr-lbl">LOCATION:</span> <span class="hdr-val">${esc(UNIT.location)}</span></div>
      <div class="kv"><span class="hdr-lbl">SERVES:</span> <span class="hdr-val">${esc(UNIT.serves)}</span></div>
    </td>
    <td width="50%">
      <div class="kv"><span class="hdr-lbl">START-UP PERFORMED BY:</span> ${blank ? line : '<span class="hdr-val">M. Reyes</span>'}</div>
      <div class="kv"><span class="hdr-lbl">COMPANY:</span> ${blank ? line : '<span class="hdr-val">Vanguard Mechanical Inc.</span>'}</div>
      <div class="kv"><span class="hdr-lbl">MANUFACTURER REP PRESENT:</span> ${blank ? line : '<span class="hdr-val">Yes &mdash; D. Kowalczyk, Viessmann</span>'}</div>
      <div class="kv"><span class="hdr-lbl">WITNESSED BY (CxA):</span> ${blank ? line : '<span class="hdr-val">T. Faeghi, Isotherm Engineering Ltd.</span>'}</div>
      <div class="kv"><span class="hdr-lbl">DATE:</span> ${blank ? line : '<span class="hdr-val">2026-08-05</span>'}</div>
    </td>
  </tr></tbody></table>

  <h2 class="sec">Equipment Nameplate Data</h2>
  <table>
    <thead>
      <tr><th class="lh" width="30%"></th><th class="th-unit" colspan="3">${esc(UNIT.tag)}</th></tr>
      <tr><th class="lh"></th><th class="th-sub">Specified</th><th class="th-sub">Shop Drawing</th><th class="th-sub">Installed</th></tr>
    </thead>
    <tbody>
      ${NAMEPLATE.map(([l, a, b, c]) => `<tr><td class="np-label">${esc(l)}</td>${cell(a, 'completed')}${cell(b, 'completed')}${cell(c, mode)}</tr>`).join('')}
    </tbody>
  </table>

  <h2 class="sec">A &nbsp;&middot;&nbsp; Pre-Start Verification</h2>
  <div class="gate">Every line below must read Y or NR before the appliance is energized. An N or HOLD stops the start-up.</div>
  <table>
    <thead><tr><th class="lh">Item</th><th width="9%">Status</th><th width="12%">Finding</th><th width="26%">Comments</th></tr></thead>
    <tbody>${PRESTART.map(([t, v, f]) => `<tr><td>${esc(t)}</td>${st(v, mode)}${fnd(f, mode)}<td>${!blank && f ? 'Sample pending &mdash; treatment contractor on site 2026-08-06' : ''}</td></tr>`).join('')}</tbody>
  </table>

  <h2 class="sec">B &nbsp;&middot;&nbsp; Energization &amp; First-Start Sequence</h2>
  <div class="gate">Perform in order. The order is the procedure &mdash; do not sign a step that was taken out of sequence.</div>
  <table>
    <thead><tr><th width="5%">#</th><th class="lh">Step</th><th width="9%">Status</th><th width="12%">Finding</th><th width="24%">Comments</th></tr></thead>
    <tbody>${SEQUENCE.map(([n, t, v, f]) => `<tr><td class="st-cell">${n}</td><td>${esc(t)}</td>${st(v, mode)}${fnd(f, mode)}<td>${!blank && n === '6' ? 'Ignition on first trial' : ''}</td></tr>`).join('')}</tbody>
  </table>

  <h2 class="sec">C &nbsp;&middot;&nbsp; Running Checks</h2>
  <table>
    <thead><tr><th class="lh">Item</th><th width="9%">Status</th><th width="12%">Finding</th><th width="26%">Comments</th></tr></thead>
    <tbody>${RUNNING.map(([t, v, f]) => `<tr><td>${esc(t)}</td>${st(v, mode)}${fnd(f, mode)}<td>${!blank && f ? 'Supply/return swapped at the BAS graphic' : ''}</td></tr>`).join('')}</tbody>
  </table>

  <h2 class="sec">D &nbsp;&middot;&nbsp; Safety Device Verification</h2>
  <div class="gate">Each device is <b>tested</b>, not observed. Record how it was tripped.</div>
  <table>
    <thead><tr><th class="lh" width="26%">Device</th><th width="13%">Required</th><th width="10%">As found</th><th width="10%">As left</th><th class="lh">Test method</th><th width="9%">Status</th></tr></thead>
    <tbody>${SAFETY.map(([d, r, af, al, m, v]) => `<tr><td>${esc(d)}</td><td class="np-val">${esc(r)}</td>${cell(af, mode)}${cell(al, mode)}<td>${esc(m)}</td>${st(v, mode)}</tr>`).join('')}</tbody>
  </table>

  <h2 class="sec">E &nbsp;&middot;&nbsp; Readings to Record</h2>
  <table>
    <thead>
      <tr><th class="lh" width="30%" rowspan="2">Reading</th><th width="12%" rowspan="2">Unit</th><th class="th-unit" colspan="3">Firing rate</th></tr>
      <tr><th class="th-sub">Low</th><th class="th-sub">Mid</th><th class="th-sub">High</th></tr>
    </thead>
    <tbody>${READINGS.map(([r, u, a, b, c]) => `<tr><td class="np-label">${esc(r)}</td><td class="np-val">${esc(u)}</td>${cell(a, mode)}${cell(b, mode)}${cell(c, mode)}</tr>`).join('')}</tbody>
  </table>

  <h2 class="sec">F &nbsp;&middot;&nbsp; Sign-Off</h2>
  <!-- THE SIGNATURE OF THE TYPE. Two parties, two different claims, side by side
       so neither can be mistaken for the other: the contractor asserts the work
       was performed; the CxA asserts only that it was witnessed. An ivc sheet
       has one column here, and that is precisely why start-up is not an ivc. -->
  <table class="so-tbl">
    <thead><tr><th>START-UP PERFORMED BY &mdash; CONTRACTOR</th><th>WITNESSED BY &mdash; COMMISSIONING AUTHORITY</th></tr></thead>
    <tbody><tr>
      <td>
        <div class="so-claim">I certify the start-up was performed in accordance with the manufacturer's instructions and the sections above.</div>
        <div class="so-role">Name</div><div class="so-rule">${blank ? '' : 'M. Reyes'}</div>
        <div class="so-role">Company</div><div class="so-rule">${blank ? '' : 'Vanguard Mechanical Inc.'}</div>
        <div class="so-role">Signature</div><div class="so-rule"></div>
        <div class="so-role">Date</div><div class="so-rule">${blank ? '' : '2026-08-05'}</div>
      </td>
      <td>
        <div class="so-claim">I witnessed the start-up recorded above. This signature attests to observation only and does not transfer responsibility for the work.</div>
        <div class="so-role">Name</div><div class="so-rule">${blank ? '' : 'T. Faeghi, P.Eng.'}</div>
        <div class="so-role">Company</div><div class="so-rule">${blank ? '' : 'Isotherm Engineering Ltd.'}</div>
        <div class="so-role">Signature</div><div class="so-rule"></div>
        <div class="so-role">Date</div><div class="so-rule">${blank ? '' : '2026-08-05'}</div>
      </td>
    </tr></tbody>
  </table>

  <div class="mockup-note">MOCKUP — Phase 0 design approval. Line items are illustrative; Phase 2 anchors real content to CSA B149.1, ASHRAE Guideline 1.1 / Standard 202 and the manufacturer's IOM.</div>
</div></body>`
}

const CSS = `
  @page { size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; color: #222; font-size: 9.5pt; line-height: 1.4; }
  .page { padding: 0 46px; }

  .firm { text-align: center; }
  .firm h1 { color: ${DOC.INK}; font-size: 18pt; font-weight: 700; letter-spacing: 0.5px; }
  .firm .addr { font-size: 8pt; color: #555; margin-top: 2px; }
  .brandrule { height: 3px; background: ${DOC.BAND}; margin: 8px 0 0; border-radius: 2px; }

  /* the one new element in this family */
  .masthead { background: ${DOC.BAND}; color: #fff; padding: 7px 12px; margin-top: 9px; border-radius: 3px; }
  .mh-type { font-size: 11pt; font-weight: 700; letter-spacing: 1.2px; }
  .mh-eq { font-size: 8.5pt; margin-top: 1px; color: #E8E8E8; }

  .blank-notice { background: #FFF9C4; border: 1px solid #F59E0B; padding: 5px 10px; margin: 8px 0; font-size: 8pt; font-weight: 700; color: #92400E; border-radius: 4px; }

  .title-legend { display: table; width: 100%; margin-top: 10px; }
  .tl-title { display: table-cell; vertical-align: middle; }
  .tl-legend { display: table-cell; vertical-align: top; border: 1px solid ${DOC.BORDER}; border-radius: 4px; padding: 6px 10px; background: ${DOC.ZEBRA}; font-size: 7.5pt; color: #333; white-space: nowrap; }
  .cl-name { font-size: 11pt; font-weight: 700; color: ${DOC.INK}; }
  .cl-sub { font-size: 8pt; color: #666; margin-top: 1px; }
  .lg-hdr { font-weight: 700; color: ${DOC.INK}; margin-bottom: 3px; }

  h2.sec { color: ${DOC.INK}; font-size: 10.5pt; font-weight: 700; margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 2px solid ${DOC.INK}; page-break-after: avoid; break-after: avoid; }
  .gate { font-size: 7.5pt; font-style: italic; color: #555; margin: 0 0 3px; page-break-after: avoid; break-after: avoid; }

  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 4px; font-size: 8.5pt; }
  thead { display: table-header-group; }
  thead th { background: ${DOC.BAND}; color: #fff; font-weight: 600; text-align: center; padding: 5px 6px; font-size: 8pt; border: 1px solid ${DOC.INK}; word-wrap: break-word; }
  thead th.lh { text-align: left; }
  tbody td { padding: 5px 6px; border: 1px solid ${DOC.RULE}; vertical-align: top; word-wrap: break-word; }
  tbody tr:nth-child(even) td { background: ${DOC.ZEBRA}; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  body.mode-blank tbody tr:nth-child(even) td { background: #fff; }

  .hdr-tbl { margin-top: 9px; }
  .hdr-tbl td { padding: 7px 10px; border: 1px solid ${DOC.BORDER}; vertical-align: top; font-size: 8.5pt; background: #fff !important; }
  /* Label and value hang together: a value that wraps under its own label reads
     as a second field. Two cells, not two inline spans — and the label column is
     a FIXED width, because one auto-sized table per row is a ragged left edge. */
  .hdr-tbl .kv { display: table; width: 100%; table-layout: fixed; }
  .hdr-lbl { display: table-cell; width: 34%; vertical-align: top; padding-right: 6px; color: #6E6E6E; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  .hdr-val { display: table-cell; vertical-align: top; font-weight: 600; color: ${DOC.INK}; }
  /* The write-on line is the VALUE cell, not a span inside it. As an inline-block
     child of a display:table it landed in an anonymous cell of zero width and
     rendered as nothing — a blank form with no lines to write on. */
  .hdr-line { display: table-cell; vertical-align: bottom; border-bottom: 1px solid ${DOC.INK}; height: 13px; }
  .hdr-line { border-bottom: 1px solid ${DOC.BORDER}; display: inline-block; min-width: 55%; height: 11px; }

  .th-unit { background: ${DOC.BAND_UNIT} !important; font-size: 8pt; }
  .th-sub  { background: ${DOC.BAND_SUB} !important; font-size: 7pt; }
  .np-label { text-align: left !important; font-size: 7.5pt; }
  .np-val  { text-align: center; font-size: 8pt; }

  .st-cell { text-align: center; font-weight: 600; }
  .st-y  { color: ${DOC_SEMANTIC.RECORDED}; }
  .st-n  { color: ${DOC_SEMANTIC.OUTSTANDING}; }
  .st-nr { color: #888; }
  .fnd   { display: block; font-size: 7pt; color: ${DOC_SEMANTIC.OUTSTANDING}; font-weight: 700; }

  .so-tbl { margin-top: 4px; }
  .so-tbl td { padding: 9px 11px; vertical-align: top; background: #fff !important; border: 1px solid ${DOC.BORDER}; }
  .so-claim { font-size: 7.5pt; font-style: italic; color: #555; margin-bottom: 7px; }
  .so-role { font-size: 7pt; color: #6E6E6E; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 6px; }
  .so-rule { border-bottom: 1px solid ${DOC.INK}; min-height: 15px; font-weight: 600; font-size: 9pt; padding-top: 1px; }

  .mockup-note { margin-top: 16px; padding: 5px 9px; border: 1px dashed ${DOC.RULE}; font-size: 7pt; font-style: italic; color: #666; }
`

// ── render ────────────────────────────────────────────────────────────────────
const FOOTER = `<div style="width:100%;padding:4px 46px 10px;font-family:Arial,sans-serif;font-size:7pt;color:#666;border-top:1px solid ${DOC.RULE};box-sizing:border-box;display:flex;justify-content:space-between;">
  <span>ISOTHERM ENGINEERING LTD. &nbsp;|&nbsp; Boiler Start-Up Checklist &nbsp;|&nbsp; B-1 &nbsp;|&nbsp; Rev 0</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`

const browser = await chromium.launch()
const modes = ['completed', 'blank']
try {
  for (const mode of modes) {
    const page = await browser.newPage()
    await page.setContent(html(mode), { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format: 'letter', printBackground: true,
      margin: { top: '0.45in', right: '0', bottom: '0.55in', left: '0' },
      displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: FOOTER,
    })
    writeFileSync(`${OUT}/startup-boiler-${mode}.pdf`, pdf)
    await page.close()
    console.log(`  · ${OUT}/startup-boiler-${mode}.pdf (${(pdf.length / 1024).toFixed(0)} kB)`)
  }
} finally { await browser.close() }

// page images, via the same pdf.js route doc-palette-shots uses
const FILES = {
  '/pdf.mjs': ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'text/javascript'],
  '/pdf.worker.mjs': ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'text/javascript'],
}
const server = createServer((req, res) => {
  const u = req.url.split('?')[0]
  if (FILES[u]) { const [p, t] = FILES[u]; res.writeHead(200, { 'Content-Type': t }); res.end(readFileSync(p)) }
  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<canvas id="c"></canvas>') }
}).listen(0)
const port = server.address().port
const b2 = await chromium.launch()
const pg = await b2.newPage({ viewport: { width: 1400, height: 1900 } })
await pg.goto(`http://127.0.0.1:${port}/`)
try {
  for (const mode of modes) {
    const b64 = readFileSync(`${OUT}/startup-boiler-${mode}.pdf`).toString('base64')
    const pages = await pg.evaluate(async ({ b64 }) => {
      const pdfjs = await import('/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'
      const bin = atob(b64), bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const doc = await pdfjs.getDocument({ data: bytes }).promise
      const outs = []
      for (let n = 1; n <= doc.numPages; n++) {
        const p = await doc.getPage(n), vp = p.getViewport({ scale: 2.0 })
        const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height
        await p.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#FFFFFF' }).promise
        outs.push(c.toDataURL('image/png'))
      }
      return outs
    }, { b64 })
    pages.forEach((d, i) => writeFileSync(`${OUT}/startup-boiler-${mode}-p${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64')))
    console.log(`  · ${mode}: ${pages.length} page image(s)`)
  }
} finally { await b2.close(); server.close() }
console.log(`\nmockup in ${OUT}/ — for approval, not for seeding.`)
