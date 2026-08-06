// THE SECTION-PLACEMENT LAW, ruled by the owner 2026-08-05, and its application
// to the 34-item residue plus everything else the law reaches.
//
// ── THE LAW ──────────────────────────────────────────────────────────────────
// On a start-up form the deciding test is WHAT STATE THE UNIT MUST BE IN FOR THE
// CHECK TO MEAN ANYTHING:
//
//   presence / installation / setting          -> A
//   requires the unit RUNNING                  -> C
//   protective-device TRIP PROOF               -> D
//   a numeric blank                            -> E
//   alarm / interlock INTEGRATION proof        -> NOT start-up. The item goes A
//                                                 (installed / operable) and
//                                                 carries a note saying the proof
//                                                 lives in the fire-integration
//                                                 (IST) or FPT column.
//
// The last clause is the one with reach. It says a start-up form records that a
// device is there and works on its own; proving that it makes something ELSE
// happen is a different document. Applied consistently it moves a whole cluster
// of fire-alarm and BAS-alarm rows out of D — see APPLIED_CONSEQUENCE below.

/** Owner's eight, verbatim. */
export const OWNER_RULED = {
  'thermostat set at c specified temperature': ['A', 'the blank records the setpoint entered, not a temperature achieved'],
  'chemical feeder':                            ['A', 'installed and lined up; dosing proof is water-treatment scope, not start-up'],
  'coil protected from freezing':               ['A', 'provisions installed; the freezestat TRIP is the missing half — Phase 2 adds it as D'],
  'no leakage':                                 ['C', 'on start-up the check is under operating pressure'],
  'controls verified':                          ['C', 'scope-less "verified" reads operational; Phase 2 adds explicit point-to-point in A'],
  'closers':                                    ['A', 'installed and operable; close-on-alarm is IST proof', 'IST'],
  'dampers':                                    ['A', 'installed and operable; close-on-alarm is IST proof', 'IST'],
  'shutters':                                   ['A', 'installed and operable; close-on-alarm is IST proof', 'IST'],
  'width':                                      ['E', 'numeric blanks are readings'],
  'height':                                     ['E', 'numeric blanks are readings'],
  'duration':                                   ['E', 'numeric blanks are readings'],
  'lighting levels':                            ['E', 'numeric blanks are readings'],
  'lock on facility':                           ['A', 'a provision; its alarm function is IST proof', 'IST'],
  'engine start control':                       ['D', 'exercised as a protective function during the witnessed start'],
}

/** The remaining 20 of the residue, by the same law. */
export const BY_LAW = {
  // bare noun-phrase = presence = A
  'type':                                  ['A', 'equipment type recorded against the specification — presence/identity'],
  'finish':                                ['A', 'installed finish — presence'],
  'test results verified':                 ['A', 'a results review; the unit can be in any state, so it is not a start-up reading'],
  'variable speed drive volume controls':  ['A', 'a bare noun-phrase naming components, not an action — presence'],
  'refrigerant oil sight glasses':         ['A', 'sight-glass presence and condition'],
  'speaker':                               ['A', 'installed; audibility is IST proof', 'IST'],
  'auxiliary relays and bypass switches':  ['A', 'devices present and operable; the transfer PROOF is its own D row'],
  'door security system':                  ['A', 'installed; release-on-alarm is IST proof', 'IST'],
  'pressure pump':                         ['A', 'air-maintenance pump installed — presence'],
  'engine start power':                    ['A', 'the supply exists; the start proof is Engine Start Control (D)'],
  'electric operator':                     ['A', 'operator installed — presence'],
  'manual control':                        ['A', 'manual means present — presence'],
  'pump arrangement':                      ['A', 'installed configuration — presence'],
  'cooling fans pumps':                    ['A', 'auxiliary cooling present — presence'],
  // requires the unit running = C
  'noise level':                           ['C', 'a STATUS tick on the generator form, not a numeric blank — judged with the set running'],
  'remote panel verified':                 ['C', '"verified" reads operational, per the Controls Verified precedent'],
  'after cooler verified':                 ['C', '"verified" reads operational, per the same precedent'],
  'no short circulation of air from outlet to inlet': ['C', 'short-circuiting is only observable with air moving'],
  'check for leaks':                       ['C', 'under operating pressure, per the No Leakage precedent'],
  'check field joints for leaks':          ['C', 'under operating pressure, per the No Leakage precedent'],
}

/** The law's reach beyond the residue: alarm/interlock INTEGRATION proof is not
 *  start-up scope. These were placed D on the first pass and move to A with a
 *  note. Listed explicitly rather than pattern-matched, so the scale of the
 *  consequence is visible and arguable. */
export const APPLIED_CONSEQUENCE = {
  // fire-system devices and interfaces -> IST
  'smoke detectors':        ['A', 'device installed and operable; alarm response is IST proof', 'IST'],
  'duct detectors':         ['A', 'device installed and operable; alarm response is IST proof', 'IST'],
  'heat detectors':         ['A', 'device installed and operable; alarm response is IST proof', 'IST'],
  'manual pull stations':   ['A', 'device installed and operable; alarm response is IST proof', 'IST'],
  'fire alarm bells':       ['A', 'appliance installed; notification proof is IST', 'IST'],
  'fire alarm speakers':    ['A', 'appliance installed; notification proof is IST', 'IST'],
  'magnetic door holder':   ['A', 'installed and operable; release-on-alarm is IST proof', 'IST'],
  'elevator recall':        ['A', 'interface wired; recall proof is IST', 'IST'],
  'fan shutdown':           ['A', 'interface wired; shutdown proof is IST', 'IST'],
  'central station':        ['A', 'transmission path in place; signal proof is IST', 'IST'],
  'flow switches':          ['A', 'switch installed; annunciation proof is IST', 'IST'],
  'flow switch':            ['A', 'switch installed; annunciation proof is IST', 'IST'],
  'supervised valves':      ['A', 'supervision wired; annunciation proof is IST', 'IST'],
  'low pressure switches':  ['A', 'switch installed; annunciation proof is IST', 'IST'],
  'low pressure alarm':     ['A', 'installed; annunciation proof is IST', 'IST'],
  'electric alarm':         ['A', 'installed; annunciation proof is IST', 'IST'],
  'carbon monoxide control system interfaces verified': ['A', 'interfaces wired; response proof is IST', 'IST'],
  // BAS alarm confirmations -> FPT
  'confirm chilled water pump no cos alarm':   ['A', 'point installed; alarm annunciation is proven in FPT', 'FPT'],
  'confirm condenser water pump no cos alarm': ['A', 'point installed; alarm annunciation is proven in FPT', 'FPT'],
  'confirm chiller no cos alarm':              ['A', 'point installed; alarm annunciation is proven in FPT', 'FPT'],
  'confirm low supply temperature alarm':      ['A', 'point installed; alarm annunciation is proven in FPT', 'FPT'],
  'confirm high supply temperature alarm':     ['A', 'point installed; alarm annunciation is proven in FPT', 'FPT'],
}

/** RULED 2026-08-06. Kept as the record of what was held out and how it was
 *  resolved — a hold-out that vanishes from the file teaches nothing.
 *
 *  Accelerator, Flooding Valve: OUT OF START-UP SCOPE. NFPA 13 trip tests are
 *  acceptance testing; nothing on a start-up sheet exercises them, and a form
 *  that pretends otherwise records theater. Deferred WITH A DESTINATION —
 *  BACKBURNER 7b, the Acceptance Testing family, alongside standpipe's 11.
 *
 *  Supervisory Air: A, reworded to 'Air maintenance device installed and
 *  operational', with annunciation-on-loss noted to IST. The ambiguity resolved
 *  by SPLITTING THE CLAIM rather than picking a side.
 *
 *  Original note follows.
 *  GENUINELY RESISTS THE LAW — held out and named, per the instruction.
 *  Each is a protective function that is neither a device on the equipment being
 *  started nor a fire-alarm integration: it is a sprinkler-system-internal
 *  function whose proof is an NFPA acceptance test. The law's five branches do
 *  not have a slot for it. Left at D pending a ruling, and flagged. */
export const HELD_OUT = {
  'accelerator':      'dry-pipe accelerator. Not a device on the equipment being started, and not a fire-alarm integration — its proof is an NFPA 13 trip test on the sprinkler system itself. D or out-of-scope entirely?',
  'flooding valve':   'deluge valve. Same shape as the accelerator: a sprinkler-system trip test, not an equipment start-up check.',
  'supervisory air':  'supervisory air pressure. Maintained by the system and annunciated on loss — half installation (A), half annunciation proof (IST), and neither cleanly.',
}

/** The transformer banner, approved as proposed. */
export const NOTE_PLACEMENT = {
  section: 'banner-above-A',
  style: 'bold, boxed, full-width, above the section A heading',
  approved: '2026-08-05',
  rationale: 'A warning that is ticked is a warning that was read after the fact. ' +
             'A lockout instruction is a precondition of touching the equipment at all, ' +
             'so it is read before the first line is answered, not confirmed after the ' +
             'work is done. It is also the only element on the form whose failure mode ' +
             'is electrocution.',
}

/** Seeds for Phase 2, named by the owner while ruling the residue. */
export const PHASE2_SEEDS = [
  { section: 'D', item: 'Freezestat trip proven', why: 'the missing half of "Coil Protected From Freezing", which records the provisions but never proves the trip' },
  { section: 'A', item: 'Point-to-point control verification complete', why: 'the explicit static half that scope-less "Controls Verified" (now C) leaves unstated' },
]
