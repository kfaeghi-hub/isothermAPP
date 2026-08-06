// PHASE 2 BATCH 2 — D and E for ten covered types.
//
// Drafted, not mined. Every item carries a convergence class and an anchor;
// single-source items carry a stated reason or they are cut before the sheet.
//
// TWO STANDING INSTRUCTIONS, ruled 2026-08-06 for the thin-anchor batches:
//
//   1. FIRM PRACTICE IS A CITABLE ANCHOR when the codes are silent. Where a
//      widely-expected item fails convergence but field practice knows it
//      matters — "every pump start-up checks rotation before coupling" — it
//      rides as single-source with "firm practice" as the stated reason, and the
//      hint says so honestly rather than dressing it as a standard.
//
//   2. DO NOT PAD. If a type's D/E genuinely holds four items under the bar,
//      four is the number. The `ats` precedent applies to sections too: a short
//      honest section beats a padded one, and a lean form gets filled.
//
// EXPECT SPARSER TABLES THAN BATCH 1, and that is the methodology holding its
// bar. Boiler sat on CSA B149.1 and TSSA, which carry most of a fuel-fired
// start-up between them. Chillers, pumps and fans lean on AHRI and AMCA
// conventions and on manufacturer IOMs, where convergence is genuinely thinner.
// The universal core carries the weight there by design.
//
// SCOPE BOUNDARY WORTH NAMING: NFPA 110's two-hour full-load test on a generator
// is ACCEPTANCE testing, not start-up — it belongs to BACKBURNER 7b. What sits
// here is the safety-indications-and-shutdowns test and the readings NFPA 110
// requires recorded during it.
//
// Run: node draft-phase2-batch2.mjs   ->  out/startup-mining/phase2/*.json

import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'out/startup-mining/phase2'
mkdirSync(OUT, { recursive: true })

const U = 'universal', T = 'type-common', S = 'single-source'
const FIRM = 'FIRM PRACTICE — fifty years of Isotherm field practice, cited as the anchor because the code set is silent here. Not dressed as a standard.'

const BATCH = [
  {
    key: 'pump', subject: 'PUMP',
    anchors: { 'Hydraulic Institute': 'pump installation and start-up convention', 'NETA ATS': 'motor energization', 'manufacturer IOM': 'per-unit sequence', 'firm practice': 'where the codes are silent' },
    D: [
      ['Motor overload protection set to nameplate FLA and proven', U, 'NETA ATS · manufacturer IOM'],
      ['Low-suction / loss-of-prime protection proven where fitted', T, 'Hydraulic Institute · manufacturer IOM'],
      ['High-discharge-pressure switch tripped and proven where fitted', T, 'manufacturer IOM'],
      ['Rotation confirmed correct BEFORE the coupling is made up', S, 'firm practice', FIRM +
        ' Bumping a pump coupled backwards is the single most common start-up failure this firm sees, and no code says to check it first.'],
      ['Emergency stop operated; pump comes to rest', T, 'NETA ATS'],
    ],
    E: [
      ['Suction pressure (kPa)', U, 'Hydraulic Institute'],
      ['Discharge pressure (kPa)', U, 'Hydraulic Institute'],
      ['Differential head (kPa)', U, 'Hydraulic Institute'],
      ['Flow rate (L/s)', U, 'Hydraulic Institute'],
      ['Amp draw per phase (A)', U, 'NETA ATS'],
      ['Seal chamber / flush pressure (kPa)', T, 'manufacturer IOM'],
      ['Vibration at bearing housings (mm/s)', S, 'firm practice', FIRM + ' Recorded at start-up so the baseline exists when the bearing is questioned later.'],
    ],
  },
  {
    key: 'chiller', subject: 'CHILLER',
    anchors: { 'AHRI 550/590': 'performance rating convention', 'CSA B52': 'mechanical refrigeration code', 'NETA ATS': 'electrical energization', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['High-pressure cutout tripped and proven; manual reset verified', U, 'CSA B52 · manufacturer IOM'],
      ['Low-pressure cutout proven', U, 'CSA B52 · manufacturer IOM'],
      ['Low chilled-water flow / flow switch proven — compressor locks out', U, 'manufacturer IOM'],
      ['Freeze protection (low leaving-water temperature) proven', U, 'manufacturer IOM'],
      ['Oil pressure / oil temperature protection proven', T, 'manufacturer IOM'],
      ['Refrigerant leak detection and machine-room ventilation interlock proven', T, 'CSA B52'],
      ['Relief device rating verified; discharge routed per code', U, 'CSA B52'],
    ],
    E: [
      ['Chilled water in / out temperature (°C)', U, 'AHRI 550/590'],
      ['Condenser water in / out temperature (°C)', T, 'AHRI 550/590'],
      ['Evaporator / condenser refrigerant pressure (kPa)', U, 'manufacturer IOM'],
      ['Suction / discharge superheat (°C)', T, 'manufacturer IOM'],
      ['Oil pressure (kPa)', T, 'manufacturer IOM'],
      ['Amp draw per phase and %RLA (A / %)', U, 'NETA ATS · AHRI'],
      ['Chilled water flow (L/s)', U, 'AHRI 550/590'],
    ],
  },
  {
    key: 'cooling_tower', subject: 'COOLING TOWER',
    anchors: { 'CTI convention': 'cooling tower acceptance convention', 'NETA ATS': 'motor energization', 'manufacturer IOM': 'per-unit sequence', 'firm practice': 'where the codes are silent' },
    D: [
      ['Vibration cutout switch tripped and proven', U, 'CTI convention · manufacturer IOM'],
      ['Basin low-level cutout proven — pump locks out', U, 'manufacturer IOM'],
      ['Fan motor overload set to nameplate FLA and proven', U, 'NETA ATS'],
      ['Access-door / fan-guard interlock proven where fitted', T, 'manufacturer IOM'],
    ],
    E: [
      ['Entering / leaving water temperature (°C)', U, 'CTI convention'],
      ['Wet-bulb temperature at test (°C)', U, 'CTI convention'],
      ['Water flow (L/s)', U, 'CTI convention'],
      ['Fan amp draw per phase (A)', U, 'NETA ATS'],
      ['Basin water level (mm below overflow)', S, 'firm practice', FIRM + ' The level at start-up is the reference for every make-up complaint afterwards.'],
    ],
  },
  {
    key: 'fan', subject: 'FAN',
    anchors: { 'AMCA convention': 'fan installation and testing convention', 'NETA ATS': 'motor energization', 'manufacturer IOM': 'per-unit sequence', 'firm practice': 'where the codes are silent' },
    D: [
      ['Motor overload set to nameplate FLA and proven', U, 'NETA ATS'],
      ['Access-door / belt-guard interlock proven where fitted', T, 'manufacturer IOM'],
      ['Emergency stop operated; fan coasts to rest', T, 'NETA ATS'],
    ],
    E: [
      ['Amp draw per phase (A)', U, 'NETA ATS'],
      ['Fan speed (RPM)', U, 'AMCA convention'],
      ['Static pressure — inlet / outlet (Pa)', U, 'AMCA convention'],
      ['Airflow (L/s)', U, 'AMCA convention'],
      ['Vibration at bearing housings (mm/s)', S, 'firm practice', FIRM + ' Baseline for the life of the bearing.'],
    ],
  },
  {
    key: 'generator', subject: 'GENERATOR',
    anchors: { 'NFPA 110': 'emergency and standby power systems', 'NETA ATS': 'electrical acceptance', 'CSA C282': 'emergency electrical power supply for buildings', 'manufacturer IOM': 'per-unit sequence' },
    _scope_note: 'NFPA 110 two-hour full-load testing is ACCEPTANCE testing, not start-up — see BACKBURNER 7b. What belongs here is the safety-indications-and-shutdowns test and the parameters NFPA 110 requires recorded during it.',
    D: [
      ['Low oil pressure shutdown proven', U, 'NFPA 110 · manufacturer IOM'],
      ['High coolant temperature shutdown proven', U, 'NFPA 110 · manufacturer IOM'],
      ['Overspeed shutdown proven', U, 'NFPA 110 · manufacturer IOM'],
      ['Overcrank / cycle-crank shutdown proven', U, 'NFPA 110'],
      ['Emergency stop operated; engine shuts down and cannot restart until reset', U, 'NFPA 110 · CSA C282'],
      ['Battery charger failure and low-battery alarms proven', T, 'NFPA 110'],
      ['Fuel level / low fuel alarm proven', T, 'NFPA 110 · CSA C282'],
    ],
    E: [
      ['Time from signal to available power (s)', U, 'NFPA 110'],
      ['Oil pressure at rated speed (kPa)', U, 'NFPA 110'],
      ['Coolant temperature at rated speed (°C)', U, 'NFPA 110'],
      ['Output voltage per phase (V)', U, 'NFPA 110 · NETA ATS'],
      ['Frequency (Hz)', U, 'NFPA 110'],
      ['Output current per phase (A)', U, 'NFPA 110 · NETA ATS'],
      ['Battery voltage, charging and at rest (V)', T, 'NFPA 110'],
    ],
  },
  {
    key: 'air_compressor', subject: 'AIR COMPRESSOR',
    anchors: { 'CSA B51': 'boiler, pressure vessel and pressure piping code', 'TSSA': 'Ontario pressure vessel registration', 'NETA ATS': 'motor energization', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['Receiver relief valve rating verified against MAWP; seal intact', U, 'CSA B51 · TSSA'],
      ['High discharge pressure cutout tripped and proven', U, 'manufacturer IOM'],
      ['High discharge temperature shutdown proven', T, 'manufacturer IOM'],
      ['Motor overload set to nameplate FLA and proven', U, 'NETA ATS'],
      ['Low oil pressure / oil level shutdown proven where fitted', T, 'manufacturer IOM'],
    ],
    E: [
      ['Cut-in / cut-out pressure (kPa)', U, 'manufacturer IOM'],
      ['Discharge pressure at rated flow (kPa)', U, 'manufacturer IOM'],
      ['Discharge air temperature (°C)', T, 'manufacturer IOM'],
      ['Amp draw per phase (A)', U, 'NETA ATS'],
      ['Receiver CRN / registration number recorded', T, 'CSA B51 · TSSA',
        'Ontario registers pressure vessels; the CRN on the start-up record is what makes the vessel traceable later.'],
    ],
  },
  {
    key: 'dhw_heater', subject: 'DOMESTIC WATER HEATER',
    anchors: { 'CSA B149.1': 'gas installation code', 'TSSA': 'Ontario AHJ', 'CSA B51': 'pressure vessel code', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['Temperature and pressure relief valve rating verified; discharge piped to within 150 mm of floor', U, 'CSA B51 · CSA B149.1'],
      ['High-limit / energy cutout tripped and proven; manual reset verified', U, 'CSA B149.1 · manufacturer IOM'],
      ['Flame failure proven — main gas valve closes; closure time recorded', T, 'CSA B149.1'],
      ['Blocked vent / spillage switch proven where fitted', T, 'CSA B149.1'],
      ['Anti-scald mixing valve setpoint verified at the fixture', S, 'firm practice', FIRM +
        ' The valve is commissioned at the tank and complained about at the tap; the check belongs where the water arrives.'],
    ],
    E: [
      ['Storage temperature setpoint and achieved (°C)', U, 'manufacturer IOM'],
      ['Delivered temperature at the furthest fixture (°C)', S, 'firm practice', FIRM],
      ['Gas pressure — inlet / manifold (in. w.c.)', T, 'CSA B149.1'],
      ['Recovery time to setpoint (min)', T, 'manufacturer IOM'],
    ],
  },
  {
    key: 'rtu', subject: 'PACKAGED ROOFTOP UNIT',
    anchors: { 'AHRI 210/240 · 340/360': 'unitary performance rating', 'CSA B52': 'mechanical refrigeration', 'CSA B149.1': 'gas heat section', 'NETA ATS': 'electrical', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['High / low refrigerant pressure cutouts proven', U, 'CSA B52 · manufacturer IOM'],
      ['Compressor short-cycle / anti-recycle timer proven', T, 'manufacturer IOM'],
      ['Freeze / low-suction protection proven', T, 'manufacturer IOM'],
      ['Gas heat section: flame failure and high limit proven; closure time recorded', T, 'CSA B149.1',
        'Conditional on the heating medium, per the ruled variant principle — an electric-heat unit skips this section rather than forking the template.'],
      ['Smoke detector / fan shutdown interface installed and operable', T, 'CSA B52',
        'Installed and operable only. Proof of the shutdown response is IST scope, per the placement law.'],
      ['Motor overloads set to nameplate FLA and proven', U, 'NETA ATS'],
    ],
    E: [
      ['Supply / return air temperature (°C)', U, 'AHRI 210/240 · 340/360'],
      ['Outdoor air fraction at minimum position (%)', T, 'AHRI'],
      ['Suction / discharge pressure per circuit (kPa)', U, 'manufacturer IOM'],
      ['Superheat / subcooling (°C)', U, 'manufacturer IOM'],
      ['Supply airflow (L/s)', U, 'AHRI'],
      ['Amp draw per phase — compressor and fans (A)', U, 'NETA ATS'],
    ],
  },
  {
    key: 'mau', subject: 'MAKE-UP AIR UNIT',
    anchors: { 'CSA B149.1': 'direct-fired and indirect-fired gas', 'TSSA': 'Ontario AHJ', 'AMCA convention': 'fan testing', 'manufacturer IOM': 'per-unit sequence' },
    D: [
      ['Flame failure proven — main gas valve closes; closure time recorded', U, 'CSA B149.1'],
      ['High limit / discharge air high-temperature cutout proven', U, 'CSA B149.1 · manufacturer IOM'],
      ['Airflow proving switch proven — burner will not fire without airflow', U, 'CSA B149.1',
        'On a direct-fired unit this is the interlock that prevents firing into a dead duct; it is not optional and it is not a running check.'],
      ['High / low gas pressure switches proven', T, 'CSA B149.1'],
      ['Freezestat trip proven where a coil is exposed to outdoor air', T, 'manufacturer IOM'],
    ],
    E: [
      ['Discharge air temperature at low / high fire (°C)', U, 'manufacturer IOM'],
      ['Gas pressure — inlet / manifold (in. w.c.)', U, 'CSA B149.1'],
      ['CO in the discharge air stream (ppm)', U, 'CSA B149.1',
        'Direct-fired units put combustion products into the supply air; the CO reading is the whole safety case for that design.'],
      ['Supply airflow (L/s)', U, 'AMCA convention'],
      ['Amp draw per phase (A)', U, 'manufacturer IOM'],
    ],
  },
  {
    key: 'fcu', subject: 'FAN COIL UNIT',
    anchors: { 'AHRI 440': 'room fan-coil performance', 'manufacturer IOM': 'per-unit sequence', 'firm practice': 'where the codes are silent' },
    _sparse_note: 'FOUR AND THREE, AND THAT IS THE NUMBER. A fan coil has almost no protective devices of its own — its safeties live in the plant that feeds it. Padding this to look like the boiler table would be inventing checks a technician would rightly ignore.',
    D: [
      ['Motor thermal protection proven where fitted', T, 'manufacturer IOM'],
      ['Condensate overflow switch proven — unit shuts down on high level', U, 'manufacturer IOM',
        'The one protective device a fan coil reliably has, and the one whose failure floods a ceiling.'],
      ['Freeze protection proven where the coil sees outdoor air', T, 'manufacturer IOM'],
      ['Access panel / fan guard secure with the unit energized', S, 'firm practice', FIRM],
    ],
    E: [
      ['Entering / leaving air temperature (°C)', U, 'AHRI 440'],
      ['Airflow at each speed tap (L/s)', U, 'AHRI 440'],
      ['Amp draw (A)', U, 'manufacturer IOM'],
    ],
  },
]

let files = 0, items = 0, counts = { universal: 0, 'type-common': 0, 'single-source': 0 }
for (const b of BATCH) {
  const mk = (rows, key, title) => ({
    key, title,
    items: rows.map(([label, convergence, anchor, reason]) => {
      // AN ITEM WHOSE ONLY ANCHOR IS US IS SINGLE-SOURCE, BY DEFINITION.
      // Six rows in the first draft of this batch claimed universal or
      // type-common convergence while citing firm practice as their anchor —
      // a claim of multi-source agreement backed by one source. The convergence
      // system exists to stop exactly that, so the drafter refuses it rather
      // than trusting the author to notice.
      if (/firm practice/i.test(anchor) && convergence !== S) {
        console.error(`REFUSE: "${label}" cites firm practice as its anchor but claims ${convergence}.`)
        console.error('Firm practice is ONE source. An item cannot claim multi-source convergence')
        console.error('when the only source is us — that is the dishonesty the class exists to prevent.')
        process.exit(1)
      }
      counts[convergence]++
      items++
      const it = { label, convergence, anchor }
      if (convergence === 'single-source') it.convergence_reason = reason ?? FIRM
      else if (reason) it.note = reason
      return it
    }),
  })
  const artifact = {
    _kind: 'startup-extraction',
    _phase: 'Phase 2 — standards-anchored gap fill',
    _ratified: false,
    _batch: 'Phase 2 batch 2 — D/E across ten covered types',
    _note: 'DRAFTED. Sparser than batch 1 by design: where the anchor set thins, the universal core carries the weight and the type-common band is short. Not padded.',
    subject: b.subject,
    equipment_type: b.key,
    source_master: 'DRAFTED — no master. Phase 1 carried no safety-device tests and no readings for this type.',
    type: 'startup',
    status_type: 'yn_nr_na_hold',
    _anchors: b.anchors,
    ...(b._scope_note ? { _scope_note: b._scope_note } : {}),
    ...(b._sparse_note ? { _sparse_note: b._sparse_note } : {}),
    sections: [mk(b.D, 'D', 'Safety Device Verification'), mk(b.E, 'E', 'Readings to Record')],
  }
  writeFileSync(`${OUT}/${b.key}-D-E.json`, JSON.stringify(artifact, null, 2))
  files++
  console.log(`  ${b.key.padEnd(16)} D ${String(b.D.length).padStart(2)}  E ${String(b.E.length).padStart(2)}`)
}
console.log(`\n${files} artifacts · ${items} items`)
console.log(`convergence: universal ${counts.universal} · type-common ${counts['type-common']} · single-source ${counts['single-source']}`)
console.log(`\nSparser than batch 1 by design. fcu carries 4 D and 3 E because that is what a fan coil has.`)
