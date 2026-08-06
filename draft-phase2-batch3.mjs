// PHASE 2 BATCH 3 — D and E for ten more covered types.
//
// THE THINNEST BATCH SO FAR, and it should be. Batch 1 sat on CSA B149.1 and
// TSSA. Batch 2 leaned on AHRI, AMCA and NETA. This one is plumbing fixtures,
// water meters, tanks, mixing valves, backflow preventers and fire-protection
// components — and for several of them the honest answer is that they have
// almost no protective devices and almost nothing to record at start-up.
//
// TWO STANDING INSTRUCTIONS APPLY, and this is the batch that tests them:
//   1. Firm practice is a citable anchor where the codes are silent — and an
//      item citing it is SINGLE-SOURCE, which the drafter enforces.
//   2. DO NOT PAD. Several tables here are three and four items long. That is
//      what these types have.
//
// A REAL SCOPE BOUNDARY, applied repeatedly: fire-protection component TESTING
// is acceptance testing (BACKBURNER 7b) and alarm INTEGRATION is IST. What
// remains for a start-up form is often just "installed, lined up, and operable",
// which is a short list and an honest one.
//
// Run: node draft-phase2-batch3.mjs   ->  out/startup-mining/phase2/*.json

import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'out/startup-mining/phase2'
mkdirSync(OUT, { recursive: true })

const U = 'universal', T = 'type-common', S = 'single-source'
const FIRM = 'FIRM PRACTICE — fifty years of Isotherm field practice, cited as the anchor because the code set is silent here. Not dressed as a standard.'

const BATCH = [
  {
    key: 'plumbing_fixture', subject: 'PLUMBING FIXTURES',
    anchors: { 'CSA B125': 'plumbing fittings', 'National Plumbing Code': 'installation', 'firm practice': 'where the codes are silent' },
    _sparse_note: 'A fixture has no protective device and no start-up readings in the usual sense. What it has is a temperature that can scald and a trap that can siphon. Three and three, and padding it would invent checks nobody performs.',
    D: [
      ['Anti-scald / thermostatic limit verified at the outlet', U, 'CSA B125'],
      ['Trap seal present and primed; no siphonage on adjacent discharge', T, 'National Plumbing Code'],
      ['Emergency fixture (eyewash / shower) flow and activation proven where fitted', S, 'firm practice', FIRM +
        ' An emergency fixture is a life-safety device that no start-up form in the corpus treats as one.'],
    ],
    E: [
      ['Hot water temperature at the outlet (°C)', U, 'CSA B125'],
      ['Static and flowing pressure at the fixture (kPa)', T, 'National Plumbing Code'],
      ['Flow rate at the outlet (L/min)', S, 'firm practice', FIRM + ' Recorded so a low-flow complaint later has a starting number.'],
    ],
  },
  {
    key: 'water_meter', subject: 'WATER METERS',
    anchors: { 'AWWA convention': 'metering practice', 'firm practice': 'where the codes are silent' },
    _sparse_note: 'A meter is an instrument, not a machine. It has nothing to trip. Its start-up is a reading and a zero.',
    D: [
      ['Bypass arrangement proven — meter can be isolated without loss of service', S, 'firm practice', FIRM +
        ' The bypass is the only thing on a meter installation that behaves like a protective device.'],
    ],
    E: [
      ['Initial register reading at handover', U, 'AWWA convention'],
      ['Flow rate at test (L/s)', T, 'AWWA convention'],
      ['Pressure drop across the meter (kPa)', T, 'AWWA convention'],
    ],
  },
  {
    key: 'water_tank', subject: 'WATER TANKS',
    anchors: { 'CSA B51': 'pressure vessels where applicable', 'TSSA': 'Ontario registration', 'National Plumbing Code': 'storage', 'firm practice': 'where the codes are silent' },
    D: [
      ['Relief device rating verified against MAWP; discharge routed safely', U, 'CSA B51 · TSSA',
        'Applies to pressure-rated tanks. An atmospheric tank answers NR here rather than needing its own template.'],
      ['High-level / overflow alarm proven where fitted', S, 'firm practice', FIRM],
      ['Low-level cutout proven where a pump draws from the tank', S, 'firm practice', FIRM +
        ' Running a pump dry is the failure this protects against, and it is the failure the corpus never checks for.'],
    ],
    E: [
      ['Operating level range (mm or %)', S, 'firm practice', FIRM],
      ['Working pressure (kPa)', T, 'CSA B51'],
      ['CRN / registration number recorded where the tank is a registered vessel', T, 'CSA B51 · TSSA'],
    ],
  },
  {
    key: 'mixing_valve', subject: 'MIXING VALVES',
    anchors: { 'CSA B125.3': 'thermostatic mixing valves', 'National Plumbing Code': 'installation', 'firm practice': 'where the codes are silent' },
    D: [
      ['Cold-water failure test — outlet temperature falls, does not spike', U, 'CSA B125.3',
        'The defining safety behaviour of a mixing valve: on loss of cold, it must not deliver full hot.'],
      ['Hot-water failure test — outlet does not deliver full cold where the application forbids it', T, 'CSA B125.3'],
      ['Checkstops / integral checks proven — no cross-flow between hot and cold', U, 'CSA B125.3'],
    ],
    E: [
      ['Setpoint and achieved outlet temperature (°C)', U, 'CSA B125.3'],
      ['Outlet temperature at the furthest fixture served (°C)', S, 'firm practice', FIRM +
        ' The valve is commissioned at the valve and judged at the tap.'],
      ['Inlet hot / cold temperatures at test (°C)', U, 'CSA B125.3'],
    ],
  },
  {
    key: 'glycol_tank', subject: 'GLYCOL MIXING & FILL TANK',
    anchors: { 'CSA B214': 'hydronic heating systems', 'manufacturer IOM': 'per-unit sequence', 'firm practice': 'where the codes are silent' },
    D: [
      ['Fill pump low-level cutout proven — pump will not run dry', T, 'manufacturer IOM'],
      ['System pressure cutout / relief on the fill line proven', U, 'CSA B214'],
      ['Backflow prevention between glycol and potable water proven', U, 'National Plumbing Code',
        'A glycol fill connected to potable water without proven backflow protection is a cross-connection.'],
    ],
    E: [
      ['Glycol concentration at fill (%)', U, 'CSA B214'],
      ['Freeze point of the mixed solution (°C)', U, 'CSA B214',
        'The concentration is the input; the freeze point is the answer, and it is the number that matters in February.'],
      ['System fill pressure (kPa)', U, 'CSA B214'],
      ['Tank level at handover (mm or %)', S, 'firm practice', FIRM],
    ],
  },
  {
    key: 'backflow_preventer', subject: 'BACKFLOW PREVENTERS',
    anchors: { 'CSA B64.10': 'selection, installation, maintenance and field testing of backflow preventers', 'National Plumbing Code': 'installation' },
    D: [
      ['Field test performed by a certified tester; certificate attached', U, 'CSA B64.10',
        'CSA B64.10 requires field testing by a certified tester at installation. The start-up records that it happened and attaches the certificate; it does not re-perform the test.'],
      ['Relief port discharge routed to drain with an air gap', U, 'CSA B64.10 · National Plumbing Code'],
      ['Isolation valves and test cocks present and operable', U, 'CSA B64.10'],
    ],
    E: [
      ['Differential pressure across the first check (kPa)', U, 'CSA B64.10'],
      ['Relief valve opening differential (kPa)', T, 'CSA B64.10'],
      ['Certificate number and tester registration recorded', U, 'CSA B64.10'],
    ],
  },
  {
    key: 'hrv', subject: 'HEAT RECOVERY VENTILATOR',
    anchors: { 'AHRI 1060': 'air-to-air exchanger performance', 'AMCA convention': 'fan testing', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['Frost control / defrost cycle proven', U, 'manufacturer IOM',
        'The one protective sequence an HRV genuinely has, and the one whose failure ices the core.'],
      ['Motor overloads set to nameplate FLA and proven', U, 'NETA ATS'],
      ['Access door / rotor guard interlock proven where fitted', T, 'manufacturer IOM'],
    ],
    E: [
      ['Supply / exhaust airflow (L/s)', U, 'AMCA convention'],
      ['Entering / leaving air temperature, both streams (°C)', U, 'AHRI 1060'],
      ['Sensible recovery effectiveness at test conditions (%)', U, 'AHRI 1060'],
      ['Cross-leakage / EATR check result (%)', T, 'AHRI 1060',
        'The measured half of the mined "Tested for Cross Contamination" row — the proof is C, the number is E.'],
      ['Amp draw per phase (A)', U, 'NETA ATS'],
    ],
  },
  {
    key: 'split_system', subject: 'SPLIT SYSTEM AIR CONDITIONER',
    anchors: { 'AHRI 210/240': 'unitary performance', 'CSA B52': 'mechanical refrigeration', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['High / low refrigerant pressure cutouts proven', U, 'CSA B52 · manufacturer IOM'],
      ['Compressor anti-recycle timer proven', T, 'manufacturer IOM'],
      ['Line-set leak test and evacuation record verified before charging', U, 'CSA B52',
        'The seam that defines a split system: two pieces joined on site, and the joint is the failure point.'],
      ['Motor overloads set to nameplate FLA and proven', U, 'NETA ATS'],
    ],
    E: [
      ['Suction / discharge pressure (kPa)', U, 'manufacturer IOM'],
      ['Superheat / subcooling (°C)', U, 'manufacturer IOM'],
      ['Line-set length and charge adjustment applied (m / g)', U, 'manufacturer IOM',
        'A split system is charged for its actual line length; the adjustment is the number that makes the charge defensible.'],
      ['Supply / return air temperature (°C)', U, 'AHRI 210/240'],
      ['Amp draw per phase (A)', U, 'NETA ATS'],
    ],
  },
  {
    key: 'fire_alarm_panel', subject: 'FIRE ALARM PANEL',
    anchors: { 'CAN/ULC-S524': 'installation of fire alarm systems', 'CAN/ULC-S537': 'verification of fire alarm systems', 'CSA C282': 'emergency power' },
    _scope_note: 'CAN/ULC-S537 VERIFICATION is its own discipline and its own document — it is not a start-up checklist and it is not folded into one. What belongs here is that the panel is installed, powered, on standby supply, and free of trouble before verification begins.',
    D: [
      ['Panel on normal supply with no trouble or supervisory conditions present', U, 'CAN/ULC-S524'],
      ['Standby battery capacity verified; panel operates on batteries alone', U, 'CAN/ULC-S524 · CSA C282'],
      ['AC failure and battery trouble signals proven at the panel', U, 'CAN/ULC-S524'],
      ['Ground fault detection proven', T, 'CAN/ULC-S524'],
    ],
    E: [
      ['Standby battery voltage, charging and under load (V)', U, 'CAN/ULC-S524'],
      ['Calculated vs measured standby duration (h)', T, 'CAN/ULC-S524'],
      ['Circuit count by type — initiating, notification, supervisory', U, 'CAN/ULC-S524'],
    ],
  },
  {
    key: 'fire_extinguisher', subject: 'FIRE EXTINGUISHER SYSTEM',
    anchors: { 'NFPA 10': 'portable fire extinguishers', 'NFPA 17 / 17A': 'dry and wet chemical extinguishing systems', 'firm practice': 'where the codes are silent' },
    _sparse_note: 'For portable extinguishers there is genuinely nothing to start up — placement, charge and tag are the whole check. The engineered systems (kitchen suppression) carry the real content, and their discharge testing is acceptance scope.',
    D: [
      ['Engineered system: fuel and power shutdown on discharge proven where fitted', U, 'NFPA 17 / 17A',
        'Installed-and-proven for the SHUTDOWN interlock only. Discharge testing of the agent is acceptance scope — see BACKBURNER 7b.'],
      ['Manual pull station accessible and operable', U, 'NFPA 17 / 17A'],
      ['Alarm initiation to the fire alarm panel installed and operable', T, 'NFPA 17 / 17A',
        'Installed and operable. Proof of the alarm response is IST scope, per the placement law.'],
    ],
    E: [
      ['Extinguisher count, type and rating by location', U, 'NFPA 10'],
      ['Charge pressure / tag date on each unit', U, 'NFPA 10'],
      ['Engineered system: nozzle count and coverage vs the approved drawing', T, 'NFPA 17 / 17A'],
    ],
  },
]

let files = 0, items = 0
const counts = { universal: 0, 'type-common': 0, 'single-source': 0 }
for (const b of BATCH) {
  const mk = (rows, key, title) => ({
    key, title,
    items: rows.map(([label, convergence, anchor, reason]) => {
      // A NEW PERMISSION IS AUDITED IN THE BATCH THAT INTRODUCES IT — and in
      // every batch after it. One source cannot be multi-source agreement.
      // SOLE anchor, not merely mentioned. An item anchored to both a standard
      // and firm practice has a real second source and the standard carries the
      // class; an item anchored ONLY to us is single-source however it is worded.
      // The rule tightened here after the guard caught a row whose firm-practice
      // mention was doing no work — the IOM already covered it, so the mention
      // came out rather than the class going down.
      if (anchor.trim().toLowerCase() === 'firm practice' && convergence !== S) {
        console.error(`REFUSE: "${label}" cites firm practice as its anchor but claims ${convergence}.`)
        console.error('Firm practice is ONE source.')
        process.exit(1)
      }
      counts[convergence]++; items++
      const it = { label, convergence, anchor }
      if (convergence === S) it.convergence_reason = reason ?? FIRM
      else if (reason) it.note = reason
      return it
    }),
  })
  writeFileSync(`${OUT}/${b.key}-D-E.json`, JSON.stringify({
    _kind: 'startup-extraction',
    _phase: 'Phase 2 — standards-anchored gap fill',
    _ratified: false,
    _batch: 'Phase 2 batch 3 — D/E across ten more covered types',
    _note: 'DRAFTED. The thinnest batch so far, and correctly: several of these types have almost no protective devices and little to record. Not padded.',
    subject: b.subject, equipment_type: b.key,
    source_master: 'DRAFTED — no master.',
    type: 'startup', status_type: 'yn_nr_na_hold',
    _anchors: b.anchors,
    ...(b._scope_note ? { _scope_note: b._scope_note } : {}),
    ...(b._sparse_note ? { _sparse_note: b._sparse_note } : {}),
    sections: [mk(b.D, 'D', 'Safety Device Verification'), mk(b.E, 'E', 'Readings to Record')],
  }, null, 2))
  files++
  console.log(`  ${b.key.padEnd(20)} D ${String(b.D.length).padStart(2)}  E ${String(b.E.length).padStart(2)}`)
}
console.log(`\n${files} artifacts · ${items} items`)
console.log(`convergence: universal ${counts.universal} · type-common ${counts['type-common']} · single-source ${counts['single-source']}`)
console.log(`\nwater_meter carries 1 D and 3 E. A meter is an instrument, not a machine — it has nothing to trip.`)
