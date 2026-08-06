// PHASE 2 BATCH 4 — the eleven SYSTEM types.
//
// The last of the covered types, and the batch the no-padding rule was written
// for. A system's protective devices usually belong to the EQUIPMENT it
// contains: a chilled-water control system has no trip of its own, the chiller
// does. A fire-and-smoke separation is a building assembly with nothing to trip
// at all.
//
// PRE-RULED 2026-08-06: a system type with genuinely nothing in D RECORDS THAT
// ON ITS FACE — the fcu pattern — rather than inventing trips. An honest empty
// section with its reason stated is a correct table. Four artifacts here carry
// an empty D and say why.
//
// THE BOUNDARIES THAT DO MOST OF THE WORK HERE:
//   · a BAS control system's SEQUENCES are FPT scope, not start-up. What a
//     start-up records is that the panel is powered, addressed and communicating.
//   · sprinkler and standpipe TESTING is NFPA acceptance testing — BACKBURNER 7b.
//   · alarm INTEGRATION is IST.
// Strip those three and what remains for several of these is small and true.
//
// Run: node draft-phase2-batch4.mjs   ->  out/startup-mining/phase2/*.json

import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'out/startup-mining/phase2'
mkdirSync(OUT, { recursive: true })

const U = 'universal', T = 'type-common', S = 'single-source'
const FIRM = 'FIRM PRACTICE — fifty years of Isotherm field practice, cited as the anchor because the code set is silent here. Not dressed as a standard.'
const BAS_ANCHORS = { 'ASHRAE Guideline 1.1': 'commissioning process', 'CSA Z320': 'building commissioning', 'firm practice': 'where the codes are silent' }
const BAS_SCOPE = 'A BAS control system has NO protective devices of its own — the trips belong to the equipment it controls, and the SEQUENCES are FPT scope. What a start-up honestly records is that the panel is powered, addressed, communicating and backed up. D is empty on purpose.'

const BATCH = [
  {
    key: 'bas_ahu_control', subject: 'AHU CONTROL SYSTEM', anchors: BAS_ANCHORS, _empty_D: BAS_SCOPE,
    D: [],
    E: [
      ['Controller count online vs the approved points list', U, 'ASHRAE Guideline 1.1'],
      ['Network communication verified end to end (pass/fail per trunk)', U, 'ASHRAE Guideline 1.1'],
      ['Point count — commanded / monitored, against the points list', U, 'CSA Z320'],
      ['Controller firmware version recorded', S, 'firm practice', FIRM + ' Recorded at start-up because a firmware change later is the first thing anyone asks about.'],
    ],
  },
  {
    key: 'bas_chw_control', subject: 'CHILLED WATER CONTROL SYSTEM', anchors: BAS_ANCHORS, _empty_D: BAS_SCOPE,
    D: [],
    E: [
      ['Controller count online vs the approved points list', U, 'ASHRAE Guideline 1.1'],
      ['Network communication verified end to end (pass/fail per trunk)', U, 'ASHRAE Guideline 1.1'],
      ['Point count — commanded / monitored, against the points list', U, 'CSA Z320'],
      ['Controller firmware version recorded', S, 'firm practice', FIRM],
    ],
  },
  {
    key: 'bas_hw_control', subject: 'HOT WATER HEATING CONTROL SYSTEM', anchors: BAS_ANCHORS, _empty_D: BAS_SCOPE,
    D: [],
    E: [
      ['Controller count online vs the approved points list', U, 'ASHRAE Guideline 1.1'],
      ['Network communication verified end to end (pass/fail per trunk)', U, 'ASHRAE Guideline 1.1'],
      ['Point count — commanded / monitored, against the points list', U, 'CSA Z320'],
      ['Outdoor air sensor reading vs a reference thermometer (°C)', S, 'firm practice', FIRM +
        ' A reset schedule is only as good as the sensor driving it, and that sensor is on a wall nobody revisits.'],
    ],
  },
  {
    key: 'communication_system', subject: 'COMMUNICATION SYSTEM',
    anchors: { 'CAN/ULC-S524': 'where the system interfaces fire alarm', 'firm practice': 'where the codes are silent' },
    _scope_note: 'Audibility and intelligibility testing belongs to the fire-alarm verification (S537) where the system is a voice-notification path, and to IST where it interfaces. A start-up records that it is installed, powered and sounds.',
    D: [
      ['Backup power / battery supply proven — system operates on standby alone', U, 'CAN/ULC-S524'],
      ['Fire alarm interface installed and operable', T, 'CAN/ULC-S524',
        'Installed and operable only. Proof of the notification response is IST scope, per the placement law.'],
    ],
    E: [
      ['Zone count and speaker count per zone vs the approved drawing', S, 'firm practice', FIRM],
      ['Standby battery voltage, charging and under load (V)', T, 'CAN/ULC-S524'],
      ['Sound pressure level at a representative point per zone (dBA)', S, 'firm practice', FIRM +
        ' A number at start-up, not the intelligibility survey — that is S537 work.'],
    ],
  },
  {
    key: 'fire_separations', subject: 'FIRE AND SMOKE SEPARATIONS',
    anchors: { 'National Building Code': 'rated assemblies', 'CAN/ULC-S115': 'firestop systems', 'firm practice': 'where the codes are silent' },
    _empty_D: 'A rated separation is a BUILDING ASSEMBLY. It has no protective device, nothing to trip and nothing to prove by operating it — the damper inside it does, and the damper is its own type. D is empty on purpose; inventing a trip here would be inventing a device.',
    D: [],
    E: [
      ['Rated assembly count by rating and location vs the approved drawing', U, 'National Building Code'],
      ['Firestop system numbers recorded per penetration type', U, 'CAN/ULC-S115',
        'The listed system number is what makes a penetration defensible; without it the seal is just caulk.'],
      ['Door and closer count by rating', T, 'National Building Code'],
    ],
  },
  {
    key: 'gas_fluid_distribution', subject: 'GAS & FLUID DISTRIBUTION',
    anchors: { 'CSA B149.1': 'gas piping', 'TSSA': 'Ontario AHJ', 'National Plumbing Code': 'fluid distribution' },
    D: [
      ['Emergency shutoff valve located, labelled and proven to isolate', U, 'CSA B149.1 · TSSA'],
      ['Excess-flow or seismic shutoff proven where fitted', T, 'CSA B149.1'],
      ['Over-pressure protection on regulated legs proven', U, 'CSA B149.1'],
    ],
    E: [
      ['Pressure test — medium, pressure and duration held (kPa / h)', U, 'CSA B149.1 · National Plumbing Code'],
      ['Regulator inlet / outlet pressure at each station (kPa)', U, 'CSA B149.1'],
      ['Purge completion and gas quality confirmation at the appliance', T, 'CSA B149.1'],
    ],
  },
  {
    key: 'hydronic_heating_system', subject: 'HYDRONIC HEATING SYSTEM',
    anchors: { 'CSA B214': 'hydronic heating systems', 'ASHRAE Guideline 1.1': 'commissioning process', 'firm practice': 'where the codes are silent' },
    _scope_note: 'The plant equipment carries its own D — boilers, pumps and tanks each have their own template. What is left for the SYSTEM is the protection that belongs to no single unit.',
    D: [
      ['System relief / pressure-reducing arrangement proven at the fill point', U, 'CSA B214'],
      ['Low-pressure or make-up failure alarm proven where fitted', T, 'CSA B214'],
      ['Air separation and expansion arrangement proven to hold pressure through a heat-up', U, 'CSA B214',
        'A system-level check by definition: no single unit owns whether the loop keeps its pressure as it warms.'],
    ],
    E: [
      ['Fill pressure cold, and pressure at operating temperature (kPa)', U, 'CSA B214',
        'Two numbers, one check — the pair is what proves the expansion arrangement is sized.'],
      ['System water volume (L)', T, 'CSA B214'],
      ['Glycol concentration and freeze point where applicable (% / °C)', T, 'CSA B214'],
      ['Supply / return temperature at design load (°C)', U, 'ASHRAE Guideline 1.1'],
      ['Water treatment initial sample result attached', S, 'firm practice', FIRM],
    ],
  },
  {
    key: 'preaction_station', subject: 'PREACTION VALVE STATION',
    anchors: { 'NFPA 13': 'sprinkler systems', 'CAN/ULC-S524': 'detection interface' },
    _scope_note: 'THE TRIP TEST IS ACCEPTANCE TESTING — NFPA 13, BACKBURNER 7b. The detection-to-release INTEGRATION is IST. A start-up records that the station is installed, charged, supervised and lined up, which is a short list and an honest one.',
    D: [
      ['Supervisory air / nitrogen pressure maintained and its loss annunciated at the panel', U, 'NFPA 13',
        'The maintained pressure is the start-up check; the annunciation PROOF is IST, per the placement law.'],
      ['Release solenoid and manual release installed and operable', U, 'NFPA 13'],
      ['Valve supervision wired; control valve secured open', U, 'NFPA 13'],
    ],
    E: [
      ['Supervisory air pressure and system water pressure (kPa)', U, 'NFPA 13'],
      ['Detection zone count vs the approved drawing', T, 'CAN/ULC-S524'],
    ],
  },
  {
    key: 'smoke_management', subject: 'SMOKE MANAGEMENT SYSTEM',
    anchors: { 'CAN/ULC-S1001': 'integrated systems testing', 'NFPA 92': 'smoke control systems', 'National Building Code': 'smoke control provisions' },
    _scope_note: 'S1001 INTEGRATED TESTING is the proof for this system and it is a separate engagement the firm performs in its own right. A start-up records that the fans, dampers and panel are installed, powered and individually operable BEFORE integrated testing begins — which is exactly the precondition S1001 assumes.',
    D: [
      ['Each smoke control fan starts and stops from its own control, independent of the matrix', U, 'NFPA 92'],
      ['Each smoke damper strokes fully open and closed from its own control', U, 'NFPA 92'],
      ['Smoke control panel on standby power; supply proven', U, 'CAN/ULC-S1001 · NFPA 92'],
      ['Firefighter smoke control station installed, labelled and lamps proven', T, 'NFPA 92'],
    ],
    E: [
      ['Fan count, damper count and zone count vs the approved matrix', U, 'CAN/ULC-S1001'],
      ['Airflow per smoke control fan (L/s)', U, 'NFPA 92'],
      ['Pressure differential across a representative barrier (Pa)', T, 'NFPA 92',
        'Recorded at start-up as a baseline; the acceptance value is proven under S1001.'],
    ],
  },
  {
    key: 'sprinkler_piping', subject: 'SPRINKLER PIPING SYSTEM',
    anchors: { 'NFPA 13': 'sprinkler systems' },
    _empty_D: 'PIPING HAS NO PROTECTIVE DEVICE. Its valves, switches and stations are their own types, and its hydrostatic and trip testing is NFPA 13 ACCEPTANCE testing — BACKBURNER 7b. What a start-up honestly records about piping is that it is filled, pressurised and lined up, which is a reading, not a trip. D is empty on purpose.',
    D: [],
    E: [
      ['System static and residual pressure at the riser (kPa)', U, 'NFPA 13'],
      ['Hydrostatic test result — pressure and duration held (kPa / h)', U, 'NFPA 13',
        'The test is acceptance scope; the RESULT is recorded here because a start-up may not proceed without it.'],
      ['Sprinkler head count by type and temperature rating vs the approved drawing', U, 'NFPA 13'],
      ['Control valve count, all secured open', T, 'NFPA 13'],
    ],
  },
  {
    key: 'standpipe_system', subject: 'STANDPIPE SYSTEM',
    anchors: { 'NFPA 14': 'standpipe and hose systems', 'NFPA 13': 'where combined with sprinkler' },
    _scope_note: 'The FLOW TEST is NFPA 14 acceptance testing — BACKBURNER 7b, and it is the founding content of that family alongside the held-out sprinkler trio. A start-up records installation, lineup and the pressures available.',
    D: [
      ['Pressure-regulating device set and its setting verified at each outlet where fitted', U, 'NFPA 14',
        'An over-pressured hose connection is a hazard to the firefighter using it; the setting is the protection.'],
      ['Control valves secured open and supervised', U, 'NFPA 14'],
      ['Fire department connection accessible, capped and identified', U, 'NFPA 14'],
    ],
    E: [
      ['Static pressure at the topmost outlet (kPa)', U, 'NFPA 14'],
      ['Residual pressure at the topmost outlet during flow (kPa)', U, 'NFPA 14'],
      ['Outlet count by floor and size vs the approved drawing', T, 'NFPA 14'],
    ],
  },
]

let files = 0, items = 0, emptyD = 0
const counts = { universal: 0, 'type-common': 0, 'single-source': 0 }
for (const b of BATCH) {
  const mk = (rows, key, title) => ({
    key, title,
    items: rows.map(([label, convergence, anchor, reason]) => {
      // Sole anchor, per the sharpened rule. A standard plus firm practice has a
      // real second source; only-us is single-source however it is worded.
      if (anchor.trim().toLowerCase() === 'firm practice' && convergence !== S) {
        console.error(`REFUSE: "${label}" cites firm practice as its SOLE anchor but claims ${convergence}.`)
        process.exit(1)
      }
      counts[convergence]++; items++
      const it = { label, convergence, anchor }
      if (convergence === S) it.convergence_reason = reason ?? FIRM
      else if (reason) it.note = reason
      return it
    }),
  })
  // AN EMPTY SECTION MUST CARRY ITS REASON. A section that is empty and silent
  // reads as an oversight; a section that is empty and says why is a finding.
  if (!b.D.length && !b._empty_D) {
    console.error(`REFUSE: ${b.key} has an empty D section and no stated reason.`)
    process.exit(1)
  }
  if (!b.D.length) emptyD++
  writeFileSync(`${OUT}/${b.key}-D-E.json`, JSON.stringify({
    _kind: 'startup-extraction',
    _phase: 'Phase 2 — standards-anchored gap fill',
    _ratified: false,
    _batch: 'Phase 2 batch 4 — the eleven system types',
    _note: 'DRAFTED. System types. Four carry an EMPTY D section with its reason stated on the artifact — pre-ruled 2026-08-06: an honest empty section beats an invented trip.',
    subject: b.subject, equipment_type: b.key,
    source_master: 'DRAFTED — no master.',
    type: 'startup', status_type: 'yn_nr_na_hold',
    _anchors: b.anchors,
    ...(b._scope_note ? { _scope_note: b._scope_note } : {}),
    ...(b._empty_D ? { _empty_section_reason: { D: b._empty_D } } : {}),
    sections: [mk(b.D, 'D', 'Safety Device Verification'), mk(b.E, 'E', 'Readings to Record')].filter(s => s.items.length),
  }, null, 2))
  files++
  console.log(`  ${b.key.padEnd(24)} D ${String(b.D.length).padStart(2)}${b.D.length ? ' ' : '*'} E ${String(b.E.length).padStart(2)}`)
}
console.log(`\n${files} artifacts · ${items} items · ${emptyD} with an EMPTY D and a stated reason (*)`)
console.log(`convergence: universal ${counts.universal} · type-common ${counts['type-common']} · single-source ${counts['single-source']}`)
console.log(`\nbas_ahu_control, bas_chw_control, bas_hw_control, fire_separations and`)
console.log(`sprinkler_piping have no D. A control system's trips belong to the`)
console.log(`equipment it controls; a rated assembly has nothing to trip; piping has no device.`)
