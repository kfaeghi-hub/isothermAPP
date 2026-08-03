// draft-batch.mjs — run the drafter over a ruled batch, standards-anchored.
//
//   node --env-file=.env draft-batch.mjs 1            (draft + print)
//
// THIS SCRIPT CANNOT WRITE. It had an --apply flag once, and that flag RE-RAN
// THE DRAFTER before writing — so what landed was not what the owner had read
// and approved (185 def rows, reversed). Applying is now a separate act on a
// stored artifact: `proposals/batch-N-ratified.json` + `apply-ratified.mjs`,
// which makes no model call at all.
//
// Ratification names an ARTIFACT. "Apply what I approved" cannot be expressed
// as "ask again".
//
// The anchor per type is passed in, not recalled by the model. "What the
// standard expects a record to hold" is defensible; "what the model felt like"
// is not, and the source note under each table is the difference.
import { createClient } from '@supabase/supabase-js'
import { writeFile, mkdir } from 'node:fs/promises'
import { adminCredentials, BASE_URL } from './pw-config.mjs'

const BATCH = process.argv[2] ?? '1'

// Batch order is by LIVE-UNIT WEIGHT, not novelty — ruled 2026-08-03.
const BATCHES = {
  // 7 thin earlier mints (179 live units) + the 3 biggest register gaps
  1: [
    { key: 'convector', enrich: true, anchor:
      'AHRI Testing and Rating Standard for Baseboard Radiation (the I=B=R lineage): hydronic terminal output is rated in Btu/hr per linear foot AT A STATED AVERAGE WATER TEMPERATURE, with a 15% heating-effect allowance included in published ratings. A record that omits average water temperature cannot be checked against a rating.' },
    { key: 'wall_fin', enrich: true, anchor:
      'AHRI Testing and Rating Standard for Baseboard Radiation (I=B=R): output in Btu/hr per linear foot at a stated average water temperature; element size, fin size and fins-per-foot are what determine that output. Typical 3/4" element at 180F AWT is roughly 550 Btu/hr/ft.' },
    { key: 'radiant_panel', enrich: true, anchor:
      'AHRI radiation rating conventions: output per unit area or length at a stated average water temperature, plus panel construction and circuit configuration. Where the anchor does not reach a field, say so.' },
    { key: 'expansion_tank', enrich: true, anchor:
      'ASME BPVC Section VIII pressure-vessel marking (the U or UM stamp, MAWP, and volume), plus the hydronic acceptance record: acceptance volume, precharge pressure, and the system fill/relief pressures the tank was sized against.' },
    { key: 'panel', enrich: true, anchor:
      'ANSI/NETA ATS panelboard assemblies: nameplate data compared with drawings and specifications; bus and main ratings; interrupting rating; insulation-resistance and bolted-connection verification; branch circuit schedule.' },
    { key: 'humidifier', enrich: true, anchor:
      'Manufacturer rating conventions for commercial steam and evaporative humidifiers: capacity in lb/hr, energy source and input, water quality/treatment requirement, and dispersion arrangement. NOTE: this anchor is WEAKER than the electrical and hydronic ones - flag any field that is firm convention rather than standard.' },
    { key: 'unit_heater', enrich: true, anchor:
      'For gas-fired units, ANSI Z83.8 / CSA 2.6 (gas unit heaters and duct furnaces): input and output ratings, gas type and pressures, venting category. For hydronic and electric units, the AHRI rating conventions: capacity at a stated entering fluid or supply air condition, airflow, and throw.' },
    { key: 'transformer', enrich: false, anchor:
      'ANSI/NETA ATS transformers (dry-type, air-cooled): nameplate data compared with drawings and specifications; kVA, primary and secondary voltage, connection/vector group, impedance; TAP POSITIONS with turns-ratio verified at every tap (within 0.5% of nameplate); winding resistance (within 2%); insulation resistance compared with manufacturer data; temperature rise and insulation class.' },
    { key: 'heat_exchanger', enrich: false, anchor:
      'ANSI/AHRI Standard 400 (I-P) / 401 (SI), Performance Rating of Liquid to Liquid Heat Exchangers: published ratings state heat transfer rate with both-side flow rates, entering and leaving temperatures, and pressure drops; nameplate and marking data requirements. Add the pressure-vessel data (design pressure/temperature) that a commissioning record needs.' },
    { key: 'lighting_panel', enrich: false, anchor:
      'ANSI/NETA ATS panelboard assemblies, as for distribution panelboards, plus the lighting-control content a commissioning record needs: control method (relay, contactor, breaker-controlled), zones/channels, time-clock or photocell inputs, and the override arrangement.' },
  ],
  // 5 NETA electrical remainder + the plumbing set
  2: [
    { key: 'switchgear', enrich: false, anchor:
      'ANSI/NETA ATS switchgear and switchboard assemblies: nameplate data compared with drawings and specifications; bus continuity and rating; interrupting rating; insulation resistance phase-to-phase and phase-to-ground; contact/pole resistance; ground and bonding verification; interlock operation and sequencing confirmed correct; protective device settings as-left. Medium-voltage assemblies add power-frequency withstand.' },
    { key: 'switchboard', enrich: false, anchor:
      'ANSI/NETA ATS switchboard assemblies, as switchgear but distribution-scale: nameplate vs drawings; main and bus ratings; interrupting rating; insulation resistance; bolted-connection torque; ground bus bonding; metering and instrument transformer complement.' },
    { key: 'mcc', enrich: false, anchor:
      'ANSI/NETA ATS motor control centres: nameplate vs drawings; bus rating; each starter/unit size and type; overload element rating and setting; control voltage; insulation resistance; interlock and control-circuit function. The record is per ASSEMBLY, with the unit complement counted rather than enumerated - individual starters are not their own type (variant rule).' },
    { key: 'vfd', enrich: false, anchor:
      'ANSI/NETA ATS adjustable-speed drives, with the drive as a commissioned unit in its own right: nameplate vs drawings; input and output voltage/current; horsepower or kW rating; bypass arrangement; line reactor or filter; programmed acceleration/deceleration and min/max speed as-left; control signal type. NOTE the boundary: the `pump` VFD yes/no field answers "does this pump have one", which is a different question.' },
    { key: 'ups', enrich: false, anchor:
      'ANSI/NETA ATS uninterruptible power systems: nameplate vs drawings; kVA/kW rating; input and output voltage and configuration; battery type, string voltage and cell/block count; rated autonomy at load; bypass arrangement (static and maintenance); alarm and monitoring complement. Autonomy VERIFIED is a timed test result - keep the field to the RATING and let the test record hold the reading.' },
    { key: 'dhw_heater', enrich: false, anchor:
      'ASME BPVC Section IV/VIII marking for the vessel where applicable, plus CSA/AHRI water-heater rating conventions: storage volume, input rating and energy source, recovery rate at a stated temperature rise, thermostat and high-limit settings, T&P relief valve rating. For indirect/semi-instantaneous units the heating-medium side matters as much as the domestic side.' },
    { key: 'water_softener', enrich: false, anchor:
      'Manufacturer and CSA B483-family conventions for potable water treatment: service flow rate and pressure drop, resin volume and exchange capacity, regeneration type and control (time/meter), brine tank capacity and salt setting, hardness in and out. NOTE: the anchor here is weaker than the NETA and ASME ones - flag any field that is firm convention rather than standard.' },
    { key: 'backflow_preventer', enrich: false, anchor:
      'CSA B64 series (backflow preventers and vacuum breakers) with CSA B64.10 field testing: device TYPE designation (RP/RPDA, DCVA/DCDA, PVB/SVB), size, hazard classification (severe/moderate) and the cross-connection it protects, installation orientation and clearance, relief port discharge arrangement. The annual test READINGS are test-record data; the nameplate carries the device identity and its ratings.' },
    { key: 'air_compressor', enrich: false, anchor:
      'ASME BPVC Section VIII for the receiver (stamp, MAWP, volume) plus compressor rating conventions: type (reciprocating/rotary screw/scroll), free air delivery at a stated discharge pressure, motor rating, duty/control mode (load-unload, modulating, VSD), and the air-treatment train (dryer type, dewpoint, filtration). For medical or laboratory air the purity and alarm requirements govern - flag if unknown for this project.' },
    { key: 'sump_pump', enrich: false, anchor:
      'Hydronic/plumbing pump rating conventions as for `pump`, plus the sump-specific content a commissioning record needs: simplex or duplex arrangement, alternator, float/level control type and set points (start, stop, high-level alarm), basin size, discharge size and check/isolation arrangement, and whether the pump is on emergency power. Capacity is stated at a duty point (flow at head).' },
  ],
  // fire + air-side, plus the two smoke-control mints
  3: [
    { key: 'fire_pump', enrich: false, anchor:
      'NFPA 20 (stationary pumps for fire protection) and NFPA 25 (inspection, testing and maintenance): the pump is rated at a DUTY POINT - rated flow at rated pressure - and its acceptance is a three-point curve (churn/shutoff, 100% rated, 150% rated). The nameplate carries the ratings and the driver; the CURVE READINGS are test-record data and must NOT be drafted as fields. Driver data matters: electric (motor hp, voltage, controller type, transfer arrangement) or diesel (engine make, rated bhp, fuel tank capacity, battery arrangement). Include the controller and the jockey-pump relationship.' },
    { key: 'jockey_pump', enrich: false, anchor:
      'NFPA 20: the pressure-maintenance pump holds system pressure so the fire pump does not start on minor leakage. Small flow, high head, its own controller with start/stop pressure settings. The record needs the duty, the controller settings as-left, and the relationship to the fire pump it serves.' },
    { key: 'fire_alarm_panel', enrich: false, anchor:
      'CAN/ULC-S524 (installation) and S537 (verification) for the fire alarm system, with CAN/ULC-S1001 for the interconnections it commands. The panel record needs: type (conventional/addressable), circuit and device capacity, the actual device count by circuit type, annunciator complement, secondary power (battery amp-hour and calculated standby/alarm duration), auxiliary relay/interface complement for the systems it commands, and the network arrangement where panels are linked.' },
    { key: 'fire_smoke_damper', enrich: false, anchor:
      'ULC-S112 / S112.1 (fire and combination fire-smoke dampers) with the OBC installation requirements: the record needs the damper classification (fire, smoke, combination), the fire-resistance rating in hours, the leakage class and elevated-temperature rating for smoke dampers, the actuator arrangement (spring-return, electric/pneumatic), the release device and its temperature rating, and the fail position. Cycling and position-proof are IST/annual TEST results, not nameplate fields.' },
    { key: 'smoke_control_fan', enrich: false, anchor:
      'NFPA 92 (smoke control systems) with CAN/ULC-S1001 for the integrated test. The performance criteria are NOT ordinary fan criteria: pressure differential across the barrier, door-opening force, and exhaust rate against a design fire. The record needs the SMOKE CONTROL DUTY as a discriminator field (stair pressurization / smoke exhaust / makeup air / zone exhaust), the design airflow and static, the emergency power source and transfer arrangement, the control interface that converts it, and the fail/command position. AMCA/ULC high-temperature rating where the fan is in a smoke exhaust path.' },
    { key: 'smoke_control_panel', enrich: false, anchor:
      'NFPA 92 and CAN/ULC-S1001: the firefighters smoke control station is where smoke control is commanded and observed. The record needs the graphics/annunciation complement, the number of controlled zones and controlled devices, the control mode complement (auto/manual override per device), the status feedback arrangement, its location and access, and the interface to the fire alarm panel.' },
    { key: 'rtu', enrich: false, anchor:
      'AHRI 340/360 (commercial and industrial unitary air-conditioning and heat pump equipment) rating conventions plus ANSI Z21.47/CSA 2.3 where gas-fired: the RTU is a PACKAGED unit, so the record carries both the air side (supply and outside airflow, ESP, filter arrangement, economizer) and the packaged sections an AHU does not have (cooling capacity and refrigerant, compressor arrangement and stages, gas or electric heating input and stages, condenser fan complement).' },
    { key: 'mau', enrich: false, anchor:
      'AHRI air-handling rating conventions with ANSI Z83.4/CSA 3.7 where direct gas-fired: a make-up air unit conditions 100% OUTSIDE air, so the record needs the design outdoor and discharge conditions rather than mixed-air ones, the heating (and cooling where present) capacity at those conditions, the airflow and ESP, the discharge control mode (constant discharge temperature, space override), and the interlock to the exhaust it makes up.' },
    { key: 'hrv', enrich: false, anchor:
      'AHRI 1060 (performance rating of air-to-air exchangers for energy recovery ventilation): an HRV recovers SENSIBLE heat only, where an ERV recovers total (sensible + latent). The record needs the recovery effectiveness at stated winter and summer conditions, supply and exhaust airflows, the core type, the frost-control arrangement (a real Ontario concern), the bypass arrangement, and the fan/filter complement on both airstreams.' },
    { key: 'vrf', enrich: false, anchor:
      'AHRI 1230 (performance rating of variable refrigerant flow multi-split air-conditioning and heat pump equipment): this row is the OUTDOOR UNIT - the indoor units are `fcu` and must not be drafted here. The record needs nominal cooling and heating capacity, refrigerant type and total charge, the number of connected indoor units and connected capacity ratio, heat-pump vs heat-recovery configuration, branch controller arrangement where present, piping limits (total and maximum length, maximum elevation difference), and the electrical rating.' },
    { key: 'dehumidifier', enrich: false, anchor:
      'AHRI 910 (indoor pool dehumidifiers) where the unit serves a natatorium, otherwise general dehumidifier rating conventions: moisture removal capacity at a stated condition, airflow, the reactivation or refrigeration arrangement (desiccant vs mechanical), pool-water or air heat-recovery capacity where present, and the space condition setpoints the unit is controlled to. Corrosion protection matters in a pool hall and belongs on the record.' },
    { key: 'duct_heater', enrich: false, anchor:
      'CSA C22.2 No. 46 (electric air heaters) for electric duct heaters, and the AHRI coil conventions for hydronic: the record needs the capacity, the stage/step arrangement and control, the electrical rating, the minimum airflow and airflow-proving arrangement (the safety interlock that matters), the high-limit cutout arrangement (auto and manual reset), the duct size served, and the entering/leaving air temperatures at design.' },
  ],
  // the remainder — with this batch's ratification the coverage campaign closes
  4: [
    { key: 'air_separator', enrich: false, anchor:
      'ASME BPVC Section VIII marking where the vessel is code-stamped, plus hydronic air-control conventions: the record needs the separation method (centrifugal/tangential, coalescing-medium, or in-line), the design flow and connection size, the working pressure and temperature, the vent/air-elimination arrangement, the blowdown or strainer provision, and whether a dirt separator function is combined. NOTE: this anchor is WEAKER than the NETA and NFPA ones - manufacturer convention governs much of it. Flag any field that is firm convention rather than standard.' },
    { key: 'elevator', enrich: false, anchor:
      'ASME A17.1 / CSA B44, Safety Code for Elevators and Escalators - the harmonized North American code, adopted in Ontario by the TSSA (B44:19 or :22). The commissioning record needs the machine arrangement (traction/MRL/hydraulic), rated capacity, rated speed, travel/rise, number of stops and openings, controller and door-operator type, and - the part that matters to an integrated test - FIREFIGHTERS EMERGENCY OPERATION: Phase I recall (designated and alternate landing, initiating device) and Phase II in-car operation, plus emergency/standby power operation and the fire-alarm interface. Phase I/II TEST RESULTS are test-record data, not nameplate fields.' },
    { key: 'louver', enrich: false, anchor:
      'AMCA 500-L (laboratory methods of testing louvers) with AMCA 511 certified ratings, and AMCA 550 for wind-driven rain where it applies: a louver is rated on FREE AREA, on the beginning point of water penetration at a stated free-area velocity, and on pressure drop at a stated velocity. The record also needs the nominal size, blade/frame type and material, finish, screen arrangement, and - where the louver serves a smoke or fire application - its ULC listing and damper interface.' },
  ],
}

const list = BATCHES[BATCH]
if (!list) { console.log(`No such batch: ${BATCH}`); process.exit(1) }

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const { data: sess } = await adm.auth.signInWithPassword(adminCredentials())
const token = sess?.session?.access_token

let spentIn = 0, spentOut = 0
const results = []

for (const item of list) {
  const res = await fetch(`${BASE_URL}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: 'draft-field-set', type_key: item.key,
      ...(item.enrich ? { mode: 'enrich' } : {}),
      standards_anchor: item.anchor,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.log(`\n### ${item.key} — FAILED ${res.status}: ${body.error ?? ''}`)
    results.push({ ...item, failed: body.error ?? res.status })
    continue
  }
  spentIn += body.usage?.inputTokens ?? 0
  spentOut += body.usage?.outputTokens ?? 0
  results.push({ ...item, ...body })

  const f = body.fields ?? []
  console.log(`\n### ${body.type_name}  [${body.mode}${body.existing_field_count ? `, ${body.existing_field_count} existing` : ''}]  +${f.length} field${f.length === 1 ? '' : 's'}`)
  if (body.note) console.log(`_${body.note}_`)
  if (body.dropped_base_collisions) console.log(`(${body.dropped_base_collisions} collision(s) dropped before display)`)
  for (const x of f) {
    const cols = (x.sections ?? []).map(s => s === 'shop_drawing' ? 'shop' : s).join('/')
    const u = x.unit ? x.unit : '—'
    const ui = x.unit_imperial ? ` / ${x.unit_imperial}` : ''
    console.log(`  - ${x.field_name}  [${u}${ui}]  (${cols})`)
  }
}

console.log(`\n──── batch ${BATCH}: ${results.filter(r => !r.failed).length}/${list.length} drafted`)
console.log(`     tokens ${spentIn.toLocaleString()} in / ${spentOut.toLocaleString()} out`)

// THE DRAFT IS PERSISTED, NOT JUST PRINTED. A proposal that exists only in a
// terminal buffer cannot be bound to — a scroll, a pipe through `head`, or a
// closed window and the artifact the human reviewed is gone. The ratification
// law says approval binds to an artifact; an artifact has to be a file.
await mkdir('proposals', { recursive: true })
const draftPath = `proposals/batch-${BATCH}-draft.json`
await writeFile(draftPath, JSON.stringify({
  batch: Number(BATCH), drafted_at_tokens: { input: spentIn, output: spentOut },
  types: results.filter(r => !r.failed).map(r => ({
    type_key: r.type_key, type_name: r.type_name,
    existing_field_count: r.existing_field_count ?? 0,
    standards_anchor: r.anchor, note: r.note ?? null, fields: r.fields ?? [],
  })),
}, null, 2), 'utf8')

console.log(`     Draft written to ${draftPath}.`)
console.log(`     To apply: copy it to proposals/batch-${BATCH}-ratified.json with any`)
console.log(`     edits you ruled, then run apply-ratified.mjs. This script cannot write.`)
