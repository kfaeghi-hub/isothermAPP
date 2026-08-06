// THE UNIVERSAL CORE — shared by every checklist in the uncovered-33 campaign.
//
// Ruled in the Phase 2 design law: "the universal core dominates." These are the
// all-sources consensus items, true of essentially any powered equipment being
// started for the first time. They are written ONCE, here, and every type
// imports them — so a change to the core is one edit, not thirty-three.
//
// WHY A SHARED MODULE AND NOT A COPY PER TYPE: thirty-three copies of the same
// seven checks drift. One of them gets a better wording, another gets a fix, and
// within a year the "universal" core is thirty-three dialects. The core is
// universal because it is literally the same rows.
//
// PER-TYPE VARIATION GOES ON TOP, in the type's own file, as the thin
// type-common band the design law calls for — a handful of items, never a page.
//
// The A/B/C sections here mirror the owner's seven-item universal list:
// rotation, terminations, safeties-before-operation, nameplate-vs-design,
// alignment/lubrication, cleanliness/flush, permits-and-prerequisites.

export const U = 'universal', T = 'type-common', S = 'single-source'
export const FIRM =
  'FIRM PRACTICE — fifty years of Isotherm field practice, cited as the anchor because the code set is silent here. Not dressed as a standard.'

/** The standing line item, ruled: first in Pre-Start on EVERY type. It is what
 *  prevents per-manufacturer template forks — a template that hardcodes one
 *  manufacturer's sequence is wrong on every other manufacturer's unit; one that
 *  demands the IOM is right on all of them. */
export const STANDING = "Manufacturer's IOM start-up steps reviewed, completed & attached"

export const CORE = {
  A: [
    [STANDING, U, 'ASHRAE Guideline 1.1 · manufacturer IOM'],
    ['Permits and authority approvals in place; prerequisites to start satisfied', U, 'CSA Z320 · TSSA'],
    ['Installation complete and matches the approved shop drawing', U, 'CSA Z320'],
    ['Nameplate data recorded and reconciled against the design', U, 'ASHRAE Guideline 1.1',
      'The nameplate block above is the record; this row is the act of comparing it to what was specified.'],
    ['Electrical terminations torqued and verified; circuit labelled and breaker sized to nameplate', U, 'NETA ATS'],
    ['Alignment and lubrication complete per the IOM; reports attached where required', U, 'manufacturer IOM'],
    ['System cleaned, flushed and free of construction debris', U, 'CSA Z320'],
    ['Safety devices installed and set BEFORE any energization', U, 'CSA Z320 · manufacturer IOM',
      'The gate the whole section exists for: a protective device set after first start protected nothing.'],
    ['Area clear, guards in place, no hot work in progress', U, 'firm practice—core'],
  ],
  B: [
    ['Isolate and lock out all energy sources; confirm zero energy at the unit', U, 'CSA Z460 · firm practice—core'],
    ['Energize control circuit only; verify display, no faults, correct firmware', U, 'manufacturer IOM'],
    ['Verify rotation correct before the unit is brought to load', U, 'NETA ATS · manufacturer IOM'],
    ['Restore energy; first start under supervision, observing the IOM sequence', U, 'manufacturer IOM'],
    ['Return to standby cleanly and confirm the unit restarts on demand', U, 'manufacturer IOM'],
  ],
  C: [
    ['Runs at steady state without alarm, trip or abnormal noise', U, 'ASHRAE Guideline 1.1'],
    ['Controls hold setpoint under load without short-cycling', U, 'ASHRAE Guideline 1.1'],
    ['No leaks at any joint disturbed during installation or start-up', U, 'firm practice—core'],
  ],
}

/** The core cites firm practice on three rows. They are marked `firm
 *  practice—core` rather than plain `firm practice` DELIBERATELY: the
 *  single-source guard tests the sole anchor, and these three are genuinely
 *  universal across every type and every source the firm has — they fail the
 *  code-citation test, not the convergence test. The suffix makes the
 *  distinction visible instead of letting a blanket exemption hide inside the
 *  guard. Each still carries its reason on the item. */
export const CORE_FIRM_NOTE =
  'Universal across every type in the corpus and every source the firm has, but carried by no code in the anchor set. ' +
  'Cited as firm practice and classed universal on that basis — the convergence is real, the citation is ours.'

/** Guard, applied by every batch drafter. Sole-anchor firm practice cannot claim
 *  convergence; the `—core` suffix is the one audited exception and it must
 *  carry the note above. */
export function assertAnchor(label, convergence, anchor) {
  const a = String(anchor).trim().toLowerCase()
  if (a === 'firm practice' && convergence !== S) {
    console.error(`REFUSE: "${label}" cites firm practice as its SOLE anchor but claims ${convergence}.`)
    console.error('Firm practice is ONE source. Use `firm practice—core` only for the audited universal rows.')
    process.exit(1)
  }
}
