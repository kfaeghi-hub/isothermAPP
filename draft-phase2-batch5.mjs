// PHASE 2 BATCH 5 — the first of the UNCOVERED 33.
//
// These types have no start-up checklist at all, so these are FULL checklists:
// A through E, not a D/E gap fill. The universal core is imported from
// phase2-universal-core.mjs and is literally the same rows on every type; what
// is written here is the thin type-common band on top, per the design law.
//
// EIGHT TYPES, and they include four of the seven fresh mints getting their
// first-ever content: water_softener, sump_pump, unit_heater, duct_heater,
// plus the electrical distribution family.
//
// The convergence discipline and the firm-practice anchor rule apply from row
// one — the guard is imported, not re-implemented, so it cannot drift between
// batches.
//
// Run: node draft-phase2-batch5.mjs   ->  out/startup-mining/phase2/*.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { CORE, U, T, S, FIRM, CORE_FIRM_NOTE, assertAnchor } from './phase2-universal-core.mjs'

const OUT = 'out/startup-mining/phase2'
mkdirSync(OUT, { recursive: true })

const BATCH = [
  {
    key: 'unit_heater', subject: 'UNIT HEATER',
    anchors: { 'CSA B149.1': 'gas-fired units', 'TSSA': 'Ontario AHJ', 'CSA B214': 'hydronic units', 'manufacturer IOM': 'per-unit sequence' },
    _variant_note: 'The Heating Medium pattern, per the ruled variant principle: gas, electric and hydronic unit heaters share one template and the medium-specific rows are conditional. A gas row answers NR on a hydronic unit rather than forking the template.',
    A: [['Heating medium confirmed and matched to the specification (gas / electric / hydronic)', T, 'CSA B214 · CSA B149.1']],
    C: [['Discharge air temperature rises and the fan cycles on the correct thermostat call', U, 'manufacturer IOM']],
    D: [
      ['GAS: flame failure proven — main valve closes; closure time recorded', T, 'CSA B149.1'],
      ['GAS: high limit tripped and proven; manual reset verified', T, 'CSA B149.1'],
      ['ELECTRIC: thermal cutout tripped and proven', T, 'manufacturer IOM'],
      ['HYDRONIC: freeze protection proven where the coil sees outdoor air', T, 'CSA B214'],
      ['Fan interlock proven — heat does not energize without airflow', U, 'manufacturer IOM'],
    ],
    E: [
      ['Discharge air temperature (°C)', U, 'manufacturer IOM'],
      ['GAS: manifold pressure (in. w.c.)', T, 'CSA B149.1'],
      ['ELECTRIC: amp draw per phase (A)', T, 'NETA ATS'],
      ['HYDRONIC: entering / leaving water temperature (°C)', T, 'CSA B214'],
    ],
  },
  {
    key: 'duct_heater', subject: 'DUCT HEATER',
    anchors: { 'CSA C22.2 No. 155': 'electric duct heaters', 'NETA ATS': 'electrical', 'manufacturer IOM': 'per-unit sequence' },
    A: [['Minimum airflow and clearance to combustibles confirmed against the listing', U, 'CSA C22.2 No. 155']],
    C: [['Stages energize in sequence and de-energize on loss of the heating call', U, 'manufacturer IOM']],
    D: [
      ['Automatic-reset thermal cutout proven', U, 'CSA C22.2 No. 155'],
      ['Manual-reset backup cutout proven; reset required to restore', U, 'CSA C22.2 No. 155',
        'The second cutout is the one that matters — the automatic one hides a fault, the manual one reports it.'],
      ['Airflow proving switch proven — elements will not energize without airflow', U, 'CSA C22.2 No. 155'],
      ['Fan interlock proven from the air handler', U, 'manufacturer IOM'],
    ],
    E: [
      ['Amp draw per phase per stage (A)', U, 'NETA ATS'],
      ['Airflow at test (L/s)', U, 'CSA C22.2 No. 155'],
      ['Temperature rise across the heater (°C)', U, 'manufacturer IOM'],
    ],
  },
  {
    key: 'water_softener', subject: 'WATER SOFTENER',
    anchors: { 'National Plumbing Code': 'installation and cross-connection', 'CSA B64.10': 'backflow protection', 'firm practice': 'where the codes are silent' },
    _first_content: 'First-ever content for this type.',
    A: [
      ['Backflow protection on the make-up connection verified', U, 'CSA B64.10 · National Plumbing Code'],
      ['Brine tank charged; drain line air-gapped to the receptor', U, 'National Plumbing Code'],
    ],
    C: [['Regeneration cycle run through completely and the unit returns to service', U, 'manufacturer IOM']],
    D: [
      ['Bypass proven — service continues with the softener isolated', S, 'firm practice',
        FIRM + ' A softener that cannot be bypassed takes the building water with it when it fails.'],
      ['Brine overflow / high-level protection proven where fitted', T, 'manufacturer IOM'],
    ],
    E: [
      ['Inlet and outlet hardness (mg/L as CaCO₃)', S, 'firm practice',
        FIRM + ' The whole point of the machine, and the number nobody records.'],
      ['Regeneration duration and salt dose (min / kg)', T, 'manufacturer IOM'],
      ['Pressure drop across the unit at rated flow (kPa)', T, 'manufacturer IOM'],
    ],
  },
  {
    key: 'sump_pump', subject: 'SUMP PUMP',
    anchors: { 'National Plumbing Code': 'drainage', 'NETA ATS': 'electrical', 'manufacturer IOM': 'per-unit sequence', 'firm practice': 'where the codes are silent' },
    _first_content: 'First-ever content for this type.',
    A: [
      ['Discharge check valve and isolation installed; discharge routed to an approved receptor', U, 'National Plumbing Code'],
      ['Float or level control set: on, off and alarm levels confirmed against the pit', U, 'manufacturer IOM'],
    ],
    C: [['Pump starts and stops on level, and the duty/standby alternates where fitted', U, 'manufacturer IOM']],
    D: [
      ['High-level alarm proven by raising the level, not by lifting the switch', S, 'firm practice',
        FIRM + ' Lifting the float proves the float. Raising the water proves the installation.'],
      ['Motor overload / thermal protection proven', U, 'NETA ATS'],
      ['Duty/standby changeover on failure of the lead pump proven where fitted', T, 'manufacturer IOM'],
    ],
    E: [
      ['On / off / alarm levels (mm from pit bottom)', U, 'manufacturer IOM'],
      ['Discharge pressure at rated flow (kPa)', T, 'manufacturer IOM'],
      ['Amp draw (A)', U, 'NETA ATS'],
      ['Pump-down time from alarm level to off (s)', S, 'firm practice', FIRM],
    ],
  },
  {
    key: 'switchgear', subject: 'SWITCHGEAR',
    anchors: { 'NETA ATS': 'acceptance testing specifications', 'CSA C22.1': 'Canadian Electrical Code', 'manufacturer IOM': 'per-unit sequence' },
    _scope_note: 'NETA ATS separates Visual and Mechanical Inspection from Electrical Tests, both before initial energization. The inspection rows are A; the test RESULTS are E. Protective-relay coordination study review is engineering scope, not a start-up tick.',
    A: [
      ['NETA visual and mechanical inspection complete; report attached', U, 'NETA ATS'],
      ['Protective device settings applied per the approved coordination study', U, 'NETA ATS · CSA C22.1'],
      ['Grounding and bonding verified; ground bus connections torqued', U, 'CSA C22.1 · NETA ATS'],
      ['Arc-flash labelling applied and legible', U, 'CSA C22.1'],
    ],
    C: [['Breakers operate — open, close and trip — from local and remote controls', U, 'NETA ATS']],
    D: [
      ['Protective relay functional trip proven by injection or by simulated input', U, 'NETA ATS',
        'Settings applied is an A row; the relay actually tripping the breaker is this one, and they are not the same claim.'],
      ['Undervoltage / shunt trip proven where fitted', T, 'NETA ATS'],
      ['Mechanical and key interlocks proven — no unsafe configuration is reachable', U, 'NETA ATS'],
    ],
    E: [
      ['Insulation resistance per phase (MΩ)', U, 'NETA ATS'],
      ['Contact resistance per pole (µΩ)', U, 'NETA ATS'],
      ['Relay trip times at test currents (s)', U, 'NETA ATS'],
      ['Phase rotation and voltage per phase (V)', U, 'NETA ATS'],
    ],
  },
  {
    key: 'switchboard', subject: 'SWITCHBOARD',
    anchors: { 'NETA ATS': 'acceptance testing specifications', 'CSA C22.1': 'Canadian Electrical Code' },
    A: [
      ['NETA visual and mechanical inspection complete; report attached', U, 'NETA ATS'],
      ['Overcurrent device ratings verified against the single line and the study', U, 'NETA ATS · CSA C22.1'],
      ['Grounding and bonding verified; connections torqued to specification', U, 'CSA C22.1'],
      ['Arc-flash labelling applied and legible', U, 'CSA C22.1'],
    ],
    C: [['Main and feeder devices operate from local control', U, 'NETA ATS']],
    D: [
      ['Ground-fault protection proven where fitted', U, 'NETA ATS · CSA C22.1'],
      ['Main breaker trip proven', U, 'NETA ATS'],
    ],
    E: [
      ['Insulation resistance per phase (MΩ)', U, 'NETA ATS'],
      ['Phase rotation and voltage per phase (V)', U, 'NETA ATS'],
      ['Load current per phase at handover (A)', T, 'NETA ATS'],
    ],
  },
  {
    key: 'mcc', subject: 'MOTOR CONTROL CENTRE',
    anchors: { 'NETA ATS': 'acceptance testing specifications', 'CSA C22.1': 'Canadian Electrical Code', 'manufacturer IOM': 'per-unit sequence' },
    A: [
      ['NETA visual and mechanical inspection complete; report attached', U, 'NETA ATS'],
      ['Each starter bucket identified to its load; overload elements sized to motor nameplate FLA', U, 'CSA C22.1 · NETA ATS'],
      ['Grounding and bonding verified; bus connections torqued', U, 'CSA C22.1'],
    ],
    C: [['Each starter operates its load from local and remote control', U, 'NETA ATS']],
    D: [
      ['Overload trip proven on a representative bucket', U, 'NETA ATS',
        'Sizing is an A row; the overload actually dropping the contactor is this one.'],
      ['Control-power loss drops the starters and requires a deliberate restart', U, 'manufacturer IOM',
        'A motor that self-restarts on control-power restoration is a hazard to whoever is working on it.'],
      ['Interlocks with upstream and downstream devices proven', T, 'NETA ATS'],
    ],
    E: [
      ['Insulation resistance per phase (MΩ)', U, 'NETA ATS'],
      ['Overload setting vs motor nameplate FLA per bucket (A)', U, 'NETA ATS'],
      ['Voltage per phase at the bus (V)', U, 'NETA ATS'],
    ],
  },
  {
    key: 'panel', subject: 'DISTRIBUTION PANEL',
    anchors: { 'NETA ATS': 'acceptance testing specifications', 'CSA C22.1': 'Canadian Electrical Code' },
    _sparse_note: 'A distribution panel has almost nothing to prove by operating it. Its content is inspection, identification and a few readings — three D rows and three E rows is what it has.',
    A: [
      ['Circuit directory complete, legible and matching the installed circuits', U, 'CSA C22.1',
        'The directory is the panel’s entire usability, and it is the first thing to go stale.'],
      ['Breaker ratings verified against the single line; no unlisted substitutions', U, 'CSA C22.1'],
      ['Grounding and bonding verified; neutral and ground separated where required', U, 'CSA C22.1'],
      ['Arc-flash labelling applied where required', T, 'CSA C22.1'],
    ],
    C: [['Each breaker operates and the corresponding circuit de-energizes', S, 'firm practice',
      FIRM + ' Proving the directory rather than reading it.']],
    D: [
      ['GFCI / AFCI devices proven by their own test function', U, 'CSA C22.1'],
      ['Main breaker trip proven where fitted', T, 'NETA ATS'],
    ],
    E: [
      ['Voltage per phase and phase-to-neutral (V)', U, 'NETA ATS'],
      ['Load current per phase at handover (A)', T, 'NETA ATS'],
      ['Insulation resistance where required by specification (MΩ)', T, 'NETA ATS'],
    ],
  },
]

const SECTION_TITLES = { A: 'Pre-Start Verification', B: 'Energization & First-Start Sequence', C: 'Running Checks', D: 'Safety Device Verification', E: 'Readings to Record' }

let files = 0, items = 0, firstContent = 0
const counts = { universal: 0, 'type-common': 0, 'single-source': 0 }

for (const b of BATCH) {
  const sections = []
  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    // CORE FIRST, then the type's own rows. The order is the claim: the
    // universal core dominates, and per-type variation sits on top of it.
    const rows = [...(CORE[k] ?? []), ...(b[k] ?? [])]
    if (!rows.length) continue
    sections.push({
      key: k, title: SECTION_TITLES[k],
      items: rows.map(([label, convergence, anchor, reason]) => {
        assertAnchor(label, convergence, anchor)
        counts[convergence]++; items++
        const it = { label, convergence, anchor }
        if (/firm practice—core/.test(anchor)) it.note = CORE_FIRM_NOTE
        else if (convergence === S) it.convergence_reason = reason ?? FIRM
        else if (reason) it.note = reason
        return it
      }),
    })
  }
  if (b._first_content) firstContent++
  writeFileSync(`${OUT}/${b.key}-full.json`, JSON.stringify({
    _kind: 'startup-extraction',
    _phase: 'Phase 2 — standards-anchored gap fill',
    _ratified: false,
    _batch: 'Phase 2 batch 5 — first of the uncovered 33, FULL checklists',
    _note: 'DRAFTED, A through E. The universal core is imported from phase2-universal-core.mjs and is literally the same rows on every type; only the thin type-common band below it is written per type.',
    subject: b.subject, equipment_type: b.key,
    source_master: 'DRAFTED — no master. This type had no start-up checklist at all.',
    type: 'startup', status_type: 'yn_nr_na_hold',
    _anchors: b.anchors,
    ...(b._first_content ? { _first_content: b._first_content } : {}),
    ...(b._variant_note ? { _variant_note: b._variant_note } : {}),
    ...(b._scope_note ? { _scope_note: b._scope_note } : {}),
    ...(b._sparse_note ? { _sparse_note: b._sparse_note } : {}),
    sections,
  }, null, 2))
  files++
  const n = sections.map(s => `${s.key}${s.items.length}`).join(' ')
  console.log(`  ${b.key.padEnd(18)} ${n}${b._first_content ? '   [first-ever content]' : ''}`)
}

console.log(`\n${files} FULL checklists · ${items} items · ${firstContent} types getting their first-ever content`)
console.log(`convergence: universal ${counts.universal} · type-common ${counts['type-common']} · single-source ${counts['single-source']}`)
console.log(`\nThe universal core is 17 rows and appears identically on all ${files}.`)
console.log(`Per-type variation averages ${Math.round((items - 17 * files) / files)} rows — the thin band the design law asks for.`)
