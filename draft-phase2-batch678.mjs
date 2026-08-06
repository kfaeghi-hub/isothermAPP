// PHASE 2 BATCHES 6, 7 and 8 — the remaining 25 uncovered types.
//
// Full checklists, A through E. Universal core imported, per-type band on top.
//
// TWO PRE-RULINGS CARRY FORWARD (2026-08-06):
//
//   1. THE PASSIVE EMITTERS stay thin — convector, radiant_panel, wall_fin. Per
//      their nameplate precedent: a passive emitter has no motor, no control of
//      its own and nothing to trip. Its start-up is that it is installed, piped,
//      vented and warm. Three D rows across all three types combined, and even
//      that is generous.
//
//   2. THE LIFE-SAFETY SET applies the known-good-handoff boundary throughout —
//      fire_pump, jockey_pump, fire_smoke_damper, smoke_control_fan,
//      smoke_control_panel. Start-up proves the DEVICE individually. Trip
//      INTEGRATION is IST's. Flow and churn testing is ACCEPTANCE (7b). What
//      remains is real and it is not the whole story, and each artifact says so.
//
// Run: node draft-phase2-batch678.mjs

import { writeFileSync, mkdirSync } from 'node:fs'
import { CORE, U, T, S, FIRM, CORE_FIRM_NOTE, assertAnchor } from './phase2-universal-core.mjs'

const OUT = 'out/startup-mining/phase2'
mkdirSync(OUT, { recursive: true })

const IOM = 'manufacturer IOM'
const NETA = 'NETA ATS'
const HANDOFF = 'Proven individually here. The integrated response is IST scope, per the known-good-handoff boundary — a start-up hands the integrated test a known-good starting position, it does not duplicate it.'

const BATCHES = {
  6: [
    { key: 'unit_ventilator', subject: 'UNIT VENTILATOR',
      anchors: { 'ASHRAE Standard 62.1': 'ventilation', 'CSA B214': 'hydronic coils', [IOM]: 'per-unit sequence' },
      A: [['Outdoor air intake clear, damper linkage free through full stroke', U, 'ASHRAE Standard 62.1']],
      C: [['Face-and-bypass or valve modulates to hold discharge setpoint', U, IOM]],
      D: [['Freezestat trip proven — outdoor air damper closes and fan stops', U, IOM,
            'A unit ventilator draws outdoor air across a wet coil by design; the freezestat is the device that keeps that from bursting it.'],
           ['Fan interlock proven — heat does not energize without airflow', U, IOM]],
      E: [['Outdoor air fraction at minimum position (%)', U, 'ASHRAE Standard 62.1'],
          ['Discharge air temperature at full heat and full cool (°C)', U, IOM],
          ['Supply airflow (L/s)', U, IOM]] },

    { key: 'vav', subject: 'VAV BOX',
      anchors: { 'AHRI 880': 'air terminal performance', 'ASHRAE Standard 62.1': 'minimum ventilation', [IOM]: 'per-unit sequence' },
      _sparse_note: 'A VAV box is a damper, a sensor and sometimes a reheat coil. Its safeties are the reheat coil’s; everything else is flow and control.',
      A: [['Box tagged to its zone and the airflow schedule; inlet size verified', U, 'AHRI 880']],
      C: [['Damper strokes full range and the box holds minimum and maximum airflow', U, 'AHRI 880']],
      D: [['REHEAT: thermal cutout proven where an electric coil is fitted', T, 'CSA C22.2 No. 155'],
          ['REHEAT: reheat interlocked to airflow — no heat without flow', T, IOM,
            'Conditional on the reheat medium, per the ruled variant principle.']],
      E: [['Minimum and maximum airflow, scheduled vs measured (L/s)', U, 'AHRI 880'],
          ['Inlet static pressure at test (Pa)', T, 'AHRI 880'],
          ['Discharge temperature at full reheat (°C)', T, IOM]] },

    { key: 'vfd', subject: 'VARIABLE FREQUENCY DRIVE',
      anchors: { [NETA]: 'electrical acceptance', 'CSA C22.1': 'Canadian Electrical Code', [IOM]: 'per-unit sequence' },
      A: [['Drive parameters set per the approved schedule; motor nameplate entered', U, IOM],
          ['Bypass arrangement verified where fitted; line and drive contactors interlocked', T, 'CSA C22.1']],
      C: [['Speed follows command across the full range; no trip on ramp up or down', U, IOM]],
      D: [['Overload and overcurrent protection proven', U, NETA],
          ['Safety chain / external interlock proven — drive stops on the interlock opening', U, IOM],
          ['Loss-of-signal behaviour proven — drive goes to its ruled fail position', U, IOM,
            'A drive that holds last speed on signal loss and a drive that stops are different machines to the system around them.']],
      E: [['Minimum and maximum speed set (Hz)', U, IOM],
          ['Amp draw per phase at minimum and maximum speed (A)', U, NETA],
          ['Acceleration and deceleration times (s)', T, IOM],
          ['Bypass transfer verified (pass/fail)', T, 'CSA C22.1']] },

    { key: 'vrf', subject: 'VRF SYSTEM',
      anchors: { 'CSA B52': 'mechanical refrigeration', 'AHRI 1230': 'VRF performance', [IOM]: 'per-unit sequence' },
      A: [['Refrigerant piping length, branch controllers and indoor units addressed per the approved layout', U, IOM],
          ['Refrigerant charge calculated for the actual pipe run and recorded', U, 'CSA B52',
            'A VRF system is charged for its installed geometry; the calculation is what makes the charge defensible.'],
          ['Refrigerant leak detection and machine-room provisions verified where required', T, 'CSA B52']],
      C: [['Each indoor unit responds to its own call in both heating and cooling', U, 'AHRI 1230']],
      D: [['High / low pressure protection proven at the outdoor unit', U, 'CSA B52'],
          ['Refrigerant leak detection alarm proven where fitted', T, 'CSA B52', HANDOFF],
          ['Compressor protection — discharge temperature and oil return proven', T, IOM]],
      E: [['Total refrigerant charge, factory plus field (kg)', U, 'CSA B52'],
          ['Suction and discharge pressure at the outdoor unit (kPa)', U, IOM],
          ['Indoor unit count online vs the design layout', U, 'AHRI 1230'],
          ['Amp draw per phase at the outdoor unit (A)', U, NETA]] },

    { key: 'heat_pump', subject: 'HEAT PUMP',
      anchors: { 'AHRI 210/240': 'unitary performance', 'CSA B52': 'mechanical refrigeration', [IOM]: 'per-unit sequence' },
      A: [['Heat source confirmed and matched to the specification (air / water / ground)', T, 'AHRI 210/240']],
      C: [['Reversing valve changes over cleanly in both directions', U, IOM],
          ['Defrost cycle initiates and terminates correctly where air source', T, IOM]],
      D: [['High / low refrigerant pressure cutouts proven', U, 'CSA B52'],
          ['Low ambient or low water temperature lockout proven', T, IOM],
          ['Auxiliary heat interlock proven — does not run with the compressor unless staged to', T, IOM]],
      E: [['Suction / discharge pressure, heating and cooling (kPa)', U, IOM],
          ['Superheat / subcooling (°C)', U, IOM],
          ['Source and load temperatures in and out (°C)', U, 'AHRI 210/240'],
          ['Amp draw per phase (A)', U, NETA]] },

    { key: 'erv', subject: 'ENERGY RECOVERY VENTILATOR',
      anchors: { 'AHRI 1060': 'air-to-air exchanger performance', 'AMCA convention': 'fan testing', [IOM]: 'per-unit sequence' },
      A: [['Recovery media and bypass arrangement verified against the schedule', U, 'AHRI 1060']],
      C: [['Economizer bypass opens and closes on the ruled condition', T, IOM]],
      D: [['Frost control / defrost proven', U, IOM],
          ['Motor overloads set to nameplate FLA and proven', U, NETA]],
      E: [['Supply / exhaust airflow (L/s)', U, 'AMCA convention'],
          ['Entering / leaving conditions both streams — dry bulb and wet bulb (°C)', U, 'AHRI 1060'],
          ['Total and sensible effectiveness at test conditions (%)', U, 'AHRI 1060'],
          ['Cross-leakage / EATR (%)', T, 'AHRI 1060']] },

    { key: 'dehumidifier', subject: 'DEHUMIDIFIER',
      anchors: { 'AHRI 910': 'indoor pool dehumidifiers', 'CSA B52': 'mechanical refrigeration', [IOM]: 'per-unit sequence' },
      A: [['Condensate drain trapped, piped and flowing to an approved receptor', U, IOM]],
      C: [['Unit holds humidity setpoint without short-cycling', U, 'AHRI 910']],
      D: [['High / low refrigerant pressure cutouts proven', U, 'CSA B52'],
          ['Condensate overflow protection proven', U, IOM,
            'The failure that damages the building rather than the machine.'],
          ['Defrost or coil freeze protection proven', T, IOM]],
      E: [['Entering / leaving air dry bulb and relative humidity (°C / %)', U, 'AHRI 910'],
          ['Moisture removal at test conditions (L/h)', U, 'AHRI 910'],
          ['Amp draw per phase (A)', U, NETA]] },

    { key: 'humidifier', subject: 'HUMIDIFIER',
      anchors: { 'ASHRAE Standard 62.1': 'ventilation and humidity', 'CSA B51': 'steam generators where applicable', [IOM]: 'per-unit sequence' },
      A: [['Absorption distance verified downstream of the dispersion tube', U, 'ASHRAE Standard 62.1',
            'Too little absorption distance wets the duct, and wet duct is the reason humidifiers get blamed for IAQ complaints.'],
          ['Water quality and treatment matched to the humidifier type', T, IOM]],
      C: [['Output modulates to hold setpoint without overshoot into the duct', U, IOM]],
      D: [['High-limit humidistat in the duct proven — humidifier shuts down', U, 'ASHRAE Standard 62.1'],
          ['Airflow proving interlock proven — no steam without airflow', U, IOM],
          ['STEAM: pressure relief and low-water protection proven', T, 'CSA B51']],
      E: [['Duct relative humidity at high-limit setpoint (%)', U, 'ASHRAE Standard 62.1'],
          ['Steam or moisture output at full demand (kg/h)', U, IOM],
          ['Amp draw per phase where electric (A)', T, NETA]] },

    { key: 'louver', subject: 'LOUVER',
      anchors: { 'AMCA 500-L': 'louver testing', 'National Building Code': 'intake and exhaust separation' },
      _sparse_note: 'A louver is a hole with blades. It has no motor unless it is a damper, and a damper is its own type. Its start-up is that it is installed, screened, drained and clear — one D row, and only because a motorised louver has a stroke to prove.',
      A: [['Free area, screening and drainage verified against the schedule', U, 'AMCA 500-L'],
          ['Intake-to-exhaust separation verified against the code minimum', U, 'National Building Code']],
      C: [['MOTORISED: strokes fully open and closed and holds position', T, IOM]],
      D: [['MOTORISED: fail position on loss of power or signal proven', T, IOM,
            'Conditional on the louver being motorised; a fixed louver answers NR.']],
      E: [['Free area (m²) and design face velocity (m/s)', U, 'AMCA 500-L'],
          ['Water penetration observed at test where the location warrants (pass/fail)', T, 'AMCA 500-L']] },
  ],

  7: [
    { key: 'ats', subject: 'AUTOMATIC TRANSFER SWITCH',
      anchors: { 'CSA C282': 'emergency electrical power', 'NFPA 110': 'emergency power systems', [NETA]: 'electrical acceptance' },
      A: [['Normal and emergency sources landed and phase-verified; neutral treatment per the design', U, 'CSA C282 · CSA C22.1'],
          ['Time delays set per the approved schedule', U, 'NFPA 110']],
      C: [['Transfer and retransfer exercised from the test function', U, 'NFPA 110']],
      D: [['Transfer on simulated loss of normal source proven, end to end', U, 'NFPA 110 · CSA C282'],
          ['Retransfer on restoration proven, including the timed delay', U, 'NFPA 110'],
          ['Engine start contact proven to call the generator', U, 'CSA C282']],
      E: [['Time from loss of normal to load energized (s)', U, 'NFPA 110'],
          ['Time delays as set — engine start, transfer, retransfer, cooldown (s)', U, 'NFPA 110'],
          ['Voltage per phase, both sources (V)', U, NETA]] },

    { key: 'ups', subject: 'UPS',
      anchors: { 'CSA C22.2 No. 107.3': 'uninterruptible power systems', [NETA]: 'electrical acceptance', [IOM]: 'per-unit sequence' },
      A: [['Battery string installed, torqued and ventilated per the IOM', U, IOM],
          ['Bypass arrangement verified — maintenance bypass operable without dropping load', U, 'CSA C22.2 No. 107.3']],
      C: [['On-line operation confirmed; load transfers to battery and back without interruption', U, 'CSA C22.2 No. 107.3']],
      D: [['Loss of input proven — load rides through on battery', U, 'CSA C22.2 No. 107.3'],
          ['Low-battery and battery-fault alarms proven', U, IOM],
          ['Overload and short-circuit protection behaviour verified per the IOM', T, NETA]],
      E: [['Runtime at connected load, measured (min)', U, 'CSA C22.2 No. 107.3',
            'The number the whole machine exists to deliver, and the one that quietly shortens as the batteries age.'],
          ['Battery string voltage, float and on load (V)', U, IOM],
          ['Input and output voltage per phase (V)', U, NETA]] },

    { key: 'transformer', subject: 'TRANSFORMER',
      anchors: { [NETA]: 'acceptance testing specifications', 'CSA C22.1': 'Canadian Electrical Code', 'CSA C802': 'energy efficiency' },
      _scope_note: 'NETA ATS separates Visual and Mechanical Inspection from Electrical Tests, both before initial energization. Inspection rows are A; test results are E.',
      A: [['NETA visual and mechanical inspection complete; report attached', U, NETA],
          ['Tap setting verified against the design and recorded', U, NETA],
          ['Grounding and bonding verified; connections torqued', U, 'CSA C22.1'],
          ['Clearances and ventilation verified per the listing', U, 'CSA C22.1']],
      C: [['Energized and observed at no load, then at load, without abnormal noise or heating', U, NETA]],
      D: [['Primary protection proven to clear a downstream fault per the coordination study', U, NETA],
          ['Temperature monitoring or alarm proven where fitted', T, IOM]],
      E: [['Insulation resistance, winding to winding and winding to ground (MΩ)', U, NETA],
          ['Turns ratio at the set tap (ratio)', U, NETA],
          ['Winding resistance per phase (Ω)', T, NETA],
          ['Secondary voltage per phase, no load and at load (V)', U, NETA]] },

    { key: 'lighting_panel', subject: 'LIGHTING PANEL',
      anchors: { 'CSA C22.1': 'Canadian Electrical Code', 'ASHRAE Standard 90.1': 'lighting control', [NETA]: 'electrical' },
      A: [['Circuit directory complete and matching the installed circuits', U, 'CSA C22.1'],
          ['Lighting control schedule and zones loaded per the design', U, 'ASHRAE Standard 90.1']],
      C: [['Each zone switches, dims and responds to occupancy and daylight where fitted', U, 'ASHRAE Standard 90.1']],
      D: [['Emergency lighting circuits proven to remain energized on loss of normal power', U, 'CSA C22.1',
            'The one life-safety behaviour a lighting panel owns.'],
          ['GFCI / AFCI devices proven by their own test function where fitted', T, 'CSA C22.1']],
      E: [['Voltage per phase and load current per phase (V / A)', U, NETA],
          ['Zone count and controlled circuit count vs the design', U, 'ASHRAE Standard 90.1'],
          ['Illuminance at a representative point per zone (lux)', T, 'ASHRAE Standard 90.1']] },

    { key: 'elevator', subject: 'ELEVATOR',
      anchors: { 'CSA B44': 'safety code for elevating devices', 'TSSA': 'Ontario AHJ — licensing and acceptance', 'CAN/ULC-S524': 'fire alarm interface' },
      _scope_note: 'TSSA/CSA B44 ACCEPTANCE is a licensed inspection performed by the elevator contractor and the AHJ — it is not a Cx start-up and this checklist does not attempt it. What the CxA records is the BUILDING side: that the interfaces, power and environment the elevator depends on are correct and that the acceptance happened.',
      A: [['TSSA licence issued and acceptance inspection report attached', U, 'TSSA · CSA B44'],
          ['Machine room environment verified — temperature, ventilation, lighting, no foreign piping', U, 'CSA B44'],
          ['Dedicated power and disconnect verified; shunt trip arrangement confirmed', U, 'CSA B44 · CSA C22.1']],
      C: [['Normal operation observed — calls, levelling and door timing across the served floors', U, 'CSA B44']],
      D: [['Firefighters emergency operation Phase I recall proven', U, 'CSA B44', HANDOFF],
          ['Phase II in-car operation proven', U, 'CSA B44', HANDOFF],
          ['Shunt trip proven where sprinklers are in the hoistway or machine room', U, 'CSA B44',
            'Power must drop before water arrives; this is the interlock that makes that true.'],
          ['Emergency communication proven to reach a monitored point', U, 'CSA B44']],
      E: [['Levelling accuracy at a representative floor (mm)', T, 'CSA B44'],
          ['Door open, dwell and close times (s)', T, 'CSA B44'],
          ['Machine room ambient temperature at test (°C)', T, 'CSA B44']] },

    { key: 'heat_exchanger', subject: 'HEAT EXCHANGER',
      anchors: { 'CSA B51': 'pressure vessels', 'TSSA': 'Ontario registration', 'AHRI 400': 'liquid-to-liquid performance' },
      A: [['CRN / registration verified and recorded where the exchanger is a registered vessel', U, 'CSA B51 · TSSA'],
          ['Both circuits vented and filled; isolation and bypass arrangement verified', U, IOM]],
      C: [['Both circuits at flow and the approach holds without excessive pressure drop', U, 'AHRI 400']],
      D: [['Relief device on each isolatable circuit verified against MAWP; discharge routed safely', U, 'CSA B51',
            'An isolatable liquid circuit with no relief is a bomb with a thermostat.']],
      E: [['Primary and secondary in / out temperatures (°C)', U, 'AHRI 400'],
          ['Flow on both circuits (L/s)', U, 'AHRI 400'],
          ['Pressure drop on both circuits (kPa)', T, 'AHRI 400'],
          ['CRN and MAWP recorded', T, 'CSA B51 · TSSA']] },

    { key: 'expansion_tank', subject: 'EXPANSION TANK',
      anchors: { 'CSA B214': 'hydronic systems', 'CSA B51': 'pressure vessels', 'TSSA': 'Ontario registration' },
      _sparse_note: 'A tank has one job and one number. Its D is the relief that protects it and the pressure that proves it is doing anything at all.',
      A: [['Pre-charge set with the system side empty and recorded', U, 'CSA B214',
            'Pre-charging against a filled system measures the system, not the tank — the order is the check.'],
          ['CRN / registration verified where the tank is a registered vessel', T, 'CSA B51 · TSSA']],
      C: [['System pressure rises and falls with temperature within the ruled band', U, 'CSA B214']],
      D: [['System relief valve rating verified against the tank and system MAWP', U, 'CSA B51 · CSA B214']],
      E: [['Pre-charge pressure (kPa)', U, 'CSA B214'],
          ['System fill pressure cold, and pressure at operating temperature (kPa)', U, 'CSA B214'],
          ['Tank acceptance volume vs system water volume (L)', T, 'CSA B214']] },

    { key: 'air_separator', subject: 'AIR SEPARATOR',
      anchors: { 'CSA B214': 'hydronic systems', 'CSA B51': 'pressure vessels where registered' },
      _sparse_note: 'A separator removes air. Its start-up is that it is piped the right way round, vented, and actually venting.',
      A: [['Installed in the correct location and orientation relative to the pump suction', U, 'CSA B214'],
          ['Automatic vent piped to a safe discharge and proven to pass air', U, 'CSA B214']],
      C: [['System vents down and holds pressure without repeated air noise', U, 'CSA B214']],
      D: [['Isolation and relief arrangement verified where the separator can be isolated', T, 'CSA B51']],
      E: [['System pressure before and after air elimination (kPa)', U, 'CSA B214'],
          ['Time to a stable, air-free system (h)', T, 'CSA B214']] },
  ],

  8: [
    // ── passive emitters — thin by ruling ─────────────────────────────────────
    { key: 'convector', subject: 'CONVECTOR',
      anchors: { 'CSA B214': 'hydronic heating', 'firm practice': 'where the codes are silent' },
      _sparse_note: 'PASSIVE EMITTER, thin by ruling. No motor, no control of its own, nothing to trip. Its start-up is that it is installed, piped, vented and warm.',
      A: [['Piped, vented and isolation valves accessible', U, 'CSA B214']],
      C: [['Emitter warms evenly end to end with the system at temperature', U, 'CSA B214',
            'An emitter cold at one end is an air pocket or a short circuit, and it shows only under flow.']],
      D: [['Surface temperature within the limit where the location requires a guard', S, 'firm practice',
            FIRM + ' Burn risk in occupied and institutional spaces is a real check no hydronic code states as a start-up step.']],
      E: [['Entering / leaving water temperature (°C)', U, 'CSA B214'],
          ['Surface temperature at a representative point (°C)', T, 'CSA B214']] },

    { key: 'radiant_panel', subject: 'RADIANT PANEL',
      anchors: { 'CSA B214': 'hydronic heating', 'firm practice': 'where the codes are silent' },
      _sparse_note: 'PASSIVE EMITTER, thin by ruling.',
      A: [['Panel piped, vented and supported; insulation behind the panel verified where required', U, 'CSA B214']],
      C: [['Panel reaches temperature evenly across its face', U, 'CSA B214']],
      D: [['Surface temperature within the limit for the mounting height and occupancy', S, 'firm practice', FIRM]],
      E: [['Entering / leaving water temperature (°C)', U, 'CSA B214'],
          ['Panel surface temperature at a representative point (°C)', U, 'CSA B214']] },

    { key: 'wall_fin', subject: 'WALL FIN',
      anchors: { 'CSA B214': 'hydronic heating', 'firm practice': 'where the codes are silent' },
      _sparse_note: 'PASSIVE EMITTER, thin by ruling. Fin tube in an enclosure — the thinnest table in the family, and correctly.',
      A: [['Element piped, vented, pitched and free to expand within the enclosure', U, 'CSA B214',
            'Fin tube that cannot move ticks and bangs for the life of the building.']],
      C: [['Element warms along its full length with the system at temperature', U, 'CSA B214']],
      D: [['Enclosure secure and damper, where fitted, free through its stroke', S, 'firm practice', FIRM]],
      E: [['Entering / leaving water temperature (°C)', U, 'CSA B214'],
          ['Enclosure discharge air temperature (°C)', T, 'CSA B214']] },

    // ── life-safety set — known-good handoff throughout ───────────────────────
    { key: 'fire_pump', subject: 'FIRE PUMP',
      anchors: { 'NFPA 20': 'stationary fire pumps', 'NFPA 25': 'inspection, testing and maintenance', 'CSA C282': 'emergency power' },
      _scope_note: 'THE NFPA 20 ACCEPTANCE FLOW TEST — churn, rated and peak flow with the AHJ present — is ACCEPTANCE testing and belongs to BACKBURNER 7b. What a start-up proves is that the pump, its controller and its power are individually correct and that the acceptance test can safely proceed.',
      A: [['Controller settings, timers and pressure settings applied per the approved schedule', U, 'NFPA 20'],
          ['Suction supply verified available and unobstructed; no suction-side control valve that can close', U, 'NFPA 20',
            'A closed suction valve is the single failure NFPA 20 designs the whole arrangement to prevent.'],
          ['Alternate power arrangement verified where required', T, 'NFPA 20 · CSA C282']],
      C: [['Pump starts automatically on pressure drop and runs at churn without overheating', U, 'NFPA 20']],
      D: [['Automatic start on pressure drop proven', U, 'NFPA 20'],
          ['Manual start and manual stop proven at the controller', U, 'NFPA 20'],
          ['Loss-of-power transfer to the alternate source proven where fitted', T, 'NFPA 20 · CSA C282'],
          ['Controller alarms — running, phase reversal, power loss — proven at the controller', U, 'NFPA 20', HANDOFF]],
      E: [['Churn pressure and suction pressure at churn (kPa)', U, 'NFPA 20'],
          ['Start and stop pressure settings as applied (kPa)', U, 'NFPA 20'],
          ['Time from pressure drop to pump at speed (s)', U, 'NFPA 20'],
          ['Amp draw per phase at churn (A)', T, NETA]] },

    { key: 'jockey_pump', subject: 'JOCKEY PUMP',
      anchors: { 'NFPA 20': 'stationary fire pumps' },
      _sparse_note: 'A jockey pump maintains pressure so the fire pump does not start. Its whole start-up is its settings and that it stops before the fire pump begins.',
      A: [['Start and stop pressures set BELOW the fire pump start pressure, per NFPA 20', U, 'NFPA 20',
            'Set wrong, the jockey pump either never runs or masks a leak the fire pump should have answered.']],
      C: [['Maintains system pressure without short-cycling', U, 'NFPA 20']],
      D: [['Proven to stop before the fire pump start pressure is reached', U, 'NFPA 20']],
      E: [['Start and stop pressure settings (kPa)', U, 'NFPA 20'],
          ['Fire pump start pressure for comparison (kPa)', U, 'NFPA 20'],
          ['Cycle count over an observed period (n/h)', T, 'NFPA 20',
            'Frequent cycling is how a leak announces itself.']] },

    { key: 'fire_smoke_damper', subject: 'FIRE / SMOKE DAMPER',
      anchors: { 'CAN/ULC-S112': 'fire damper testing', 'CAN/ULC-S112.1': 'leakage-rated damper testing', 'NFPA 92': 'smoke control' },
      _scope_note: 'The damper is proven INDIVIDUALLY here — it strokes, it closes, it reports position. Its response to the fire alarm matrix is IST, per the known-good-handoff boundary.',
      A: [['Damper installed in a listed assembly with the required sleeve, angles and access', U, 'CAN/ULC-S112'],
          ['Access door present, labelled and large enough to reach the actuator and link', U, 'CAN/ULC-S112',
            'A damper nobody can reach is a damper nobody will ever test again.']],
      C: [['Strokes fully closed and fully open from its own control and reports position', U, 'CAN/ULC-S112']],
      D: [['Closes on loss of power or signal to its ruled fail position', U, 'CAN/ULC-S112', HANDOFF],
          ['Fusible link or heat-response element verified present and correctly rated', U, 'CAN/ULC-S112'],
          ['Position feedback proven at the panel where fitted', T, 'NFPA 92', HANDOFF]],
      E: [['Damper count by type, rating and location vs the approved drawing', U, 'CAN/ULC-S112'],
          ['Stroke time, open to closed (s)', T, 'NFPA 92'],
          ['Leakage class recorded where leakage-rated', T, 'CAN/ULC-S112.1']] },

    { key: 'smoke_control_fan', subject: 'SMOKE CONTROL FAN',
      anchors: { 'NFPA 92': 'smoke control systems', 'CAN/ULC-S1001': 'integrated systems testing', 'AMCA convention': 'fan testing' },
      _scope_note: 'Proven INDIVIDUALLY from its own control, independent of the matrix. The matrix is S1001 integrated testing — this checklist establishes the known-good starting position that testing assumes.',
      A: [['Fan and its electrical supply verified as the dedicated smoke control arrangement', U, 'NFPA 92'],
          ['Standby power supply verified where required', U, 'NFPA 92 · CSA C282']],
      C: [['Starts and stops from its own control and reaches rated speed', U, 'NFPA 92']],
      D: [['Starts on the firefighters smoke control station command, independent of the matrix', U, 'NFPA 92', HANDOFF],
          ['Motor overload proven and coordinated so it will not trip in smoke mode nuisance conditions', U, 'NFPA 92',
            'A smoke control fan that trips on overload during a fire has failed at the only moment it exists for.']],
      E: [['Airflow in smoke mode (L/s)', U, 'NFPA 92'],
          ['Amp draw per phase in smoke mode (A)', U, NETA],
          ['Time from command to rated speed (s)', T, 'NFPA 92']] },

    { key: 'smoke_control_panel', subject: 'SMOKE CONTROL PANEL',
      anchors: { 'NFPA 92': 'smoke control systems', 'CAN/ULC-S1001': 'integrated systems testing', 'CAN/ULC-S524': 'fire alarm interface' },
      _scope_note: 'The panel is proven as a PANEL — powered, on standby, lamps and switches working, each output commanding its device. The MATRIX is S1001. This is the handoff, stated as clearly as the campaign can state it.',
      A: [['Panel installed at the ruled firefighter access location and labelled', U, 'NFPA 92'],
          ['Graphic or zone display matches the as-built smoke control zones', U, 'NFPA 92'],
          ['Standby power supply verified', U, 'NFPA 92 · CSA C282']],
      C: [['Every switch commands its device and every lamp reports the resulting state', U, 'NFPA 92']],
      D: [['Manual override proven to take precedence over the automatic command', U, 'NFPA 92',
            'The firefighter must be able to win an argument with the building.'],
          ['Panel operates fully on standby power alone', U, 'NFPA 92 · CSA C282'],
          ['Fire alarm interface installed and operable', U, 'CAN/ULC-S524', HANDOFF]],
      E: [['Zone count, fan count and damper count vs the approved matrix', U, 'CAN/ULC-S1001'],
          ['Standby battery voltage, charging and under load (V)', T, 'CSA C282'],
          ['Lamp test result (pass/fail)', T, 'NFPA 92']] },
  ],
}

const SECTION_TITLES = { A: 'Pre-Start Verification', B: 'Energization & First-Start Sequence', C: 'Running Checks', D: 'Safety Device Verification', E: 'Readings to Record' }
let files = 0, items = 0
const counts = { universal: 0, 'type-common': 0, 'single-source': 0 }

for (const [batchNo, types] of Object.entries(BATCHES)) {
  console.log(`\n── BATCH ${batchNo} — ${types.length} types`)
  for (const b of types) {
    const sections = []
    for (const k of ['A', 'B', 'C', 'D', 'E']) {
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
    writeFileSync(`${OUT}/${b.key}-full.json`, JSON.stringify({
      _kind: 'startup-extraction', _phase: 'Phase 2 — standards-anchored gap fill', _ratified: false,
      _batch: `Phase 2 batch ${batchNo} — uncovered types, FULL checklists`,
      _note: 'DRAFTED, A through E. Universal core imported identically; only the type-common band is written here.',
      subject: b.subject, equipment_type: b.key,
      source_master: 'DRAFTED — no master. This type had no start-up checklist at all.',
      type: 'startup', status_type: 'yn_nr_na_hold', _anchors: b.anchors,
      ...(b._scope_note ? { _scope_note: b._scope_note } : {}),
      ...(b._sparse_note ? { _sparse_note: b._sparse_note } : {}),
      sections,
    }, null, 2))
    files++
    console.log(`  ${b.key.padEnd(20)} ${sections.map(s => `${s.key}${s.items.length}`).join(' ')}`)
  }
}
console.log(`\n${files} FULL checklists · ${items} items`)
console.log(`convergence: universal ${counts.universal} · type-common ${counts['type-common']} · single-source ${counts['single-source']}`)
