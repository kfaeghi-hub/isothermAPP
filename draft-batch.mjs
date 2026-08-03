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

console.log(`     Tables above are a PROPOSAL. To apply: write them into
     proposals/batch-${BATCH}-ratified.json and run apply-ratified.mjs.
     This script cannot write, deliberately.`)
