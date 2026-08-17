// pw-checklist-docx-tables — the generated docx HOLDS its columns, asserted at
// the mechanism. [RIVET] 2026-08-16, D1/D2/D4 of the cycle-2 document triage.
//
// THE DEFECT THIS PINS (measured, both families): html-to-docx declared NO
// w:tblLayout on any table, emitted an EMPTY grid for the colspan-headed
// nameplate matrix plus a SECOND mid-table grid with fractional widths, and
// equal-width grids elsewhere — so Word autofit re-flowed every table and
// squeezed the label column ("MANUFACT URER"). The render itself cannot be
// Playwright-asserted; the MECHANISM can: this suite reads the document.xml
// the deployed endpoint actually serves and asserts the layout facts that make
// Word obey. Before/after renders live beside the fix (RELEASES 1.13).
//
// Also pinned: the D2 ruled header abbreviations (Spec / Shop Dwg / Installed
// — the full words wrapped mid-word at 3-4 units) and the D4 ruled legend
// ("Shaded = not applicable to this column", rendered whenever shaded cells
// exist). Fixture: the ZZ-TEST two-unit AHU PFC instance — real defs, real
// blocked cells, generated through the REAL endpoint as the admin.
//
// Read-only side effects: the checklist endpoint persists no DB rows (it
// upserts the same storage objects every app Generate writes). ZZ-TEST only.
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, BASE_URL, TEST_PROJECT } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-checklist-docx-tables')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── the fixture instance, resolved by content, never hardcoded ──────────────
const { data: proj } = await svc.from('projects').select('id').eq('name', TEST_PROJECT).single()
if (!proj) { console.error('REFUSING: no ZZ-TEST'); process.exit(1) }
const { data: inst } = await svc.from('checklist_instances')
  .select('id, source_template_name_snapshot')
  .eq('project_id', proj.id).eq('source_template_name_snapshot', 'AHU Prefunctional Checklist')
  .limit(1).maybeSingle()
if (!inst) { console.error('REFUSING: the ZZ-TEST "AHU Prefunctional Checklist" fixture instance is missing.'); process.exit(1) }

try {
  const user = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data: auth, error: aErr } = await user.auth.signInWithPassword(adminCredentials())
  if (aErr) throw new Error(`login: ${aErr.message}`)

  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/generate-checklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}` },
    body: JSON.stringify({ instance_id: inst.id, mode: 'blank', audience: 'field' }),
  })
  const body = await res.json().catch(() => null)
  check(res.ok, `generate returns 200 (got ${res.status}${body?.error ? ` — ${body.error}` : ''})`)
  check(!!body?.storage_url, 'the response carries the docx signed URL (standard mode requires docx)')

  const docx = Buffer.from(await (await fetch(body.storage_url)).arrayBuffer())
  const zip = await JSZip.loadAsync(docx)
  const xml = await zip.file('word/document.xml').async('string')

  // ── the layout mechanism ──────────────────────────────────────────────────
  const tables  = (xml.match(/<w:tbl>/g) ?? []).length
  const layouts = (xml.match(/<w:tblLayout w:type="fixed"\/>/g) ?? []).length
  const grids   = (xml.match(/<w:tblGrid>/g) ?? []).length
  check(tables > 0, `the docx contains tables (${tables})`)
  check(layouts === tables, `every table declares fixed layout (${layouts}/${tables}) — without it Word autofits and re-flows`)
  check(grids === tables, `exactly one grid per table (${grids}/${tables}) — html-to-docx used to emit empty + mid-table duplicates`)
  check(!/w:gridCol w:w="\d+\./.test(xml), 'no fractional grid widths (the mid-table grids carried "775.38…")')

  // every grid sums to its table's declared width
  const tblBlocks = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []
  const sumsOk = tblBlocks.every(t => {
    const w = Number(/<w:tblW[^>]*w:w="(\d+)"/.exec(t)?.[1] ?? 0)
    const cols = [...t.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1]))
    return w > 0 && cols.length > 0 && cols.reduce((a, b) => a + b, 0) === w
  })
  check(sumsOk, 'every grid sums exactly to its table width (integer twips, remainder on the last column)')

  // ── the D2 ruled headers ──────────────────────────────────────────────────
  check(xml.includes('>Spec<') && xml.includes('>Shop Dwg<'),
    'the provenance headers carry the ruled abbreviations (Spec / Shop Dwg)')
  check(!xml.includes('>Specified<') && !xml.includes('>Shop Drawing<'),
    'the full header words are gone (they wrapped mid-word at 3-4 units)')

  // ── the D5 ruled stamp: a real per-page Word footer, every copy ────────────
  const footerParts = Object.keys(zip.files).filter(n => /^word\/footer\d*\.xml$/.test(n))
  let stampInFooter = false
  for (const p of footerParts) {
    if (/reflects register at generation/.test(await zip.file(p).async('string'))) { stampInFooter = true; break }
  }
  check(footerParts.length > 0, `the docx carries footer part(s) (${footerParts.length}) — the stamp rides a real footer, not a trailing paragraph`)
  check(stampInFooter, 'the generation stamp is in the docx footer ("reflects register at generation")')

  // ── the D3 ruled captions, exact wording, both surfaces ───────────────────
  check(xml.includes('Register record — Specified and Shop Drawing values shown from the project register; record Installed on site.'),
    'the provenance matrix carries its ruled caption')
  check(xml.includes('Site record — complete during test.'),
    'the CSA-derived Recorded grids carry their ruled caption')

  // ── the D4 ruled legend, premise proven first ─────────────────────────────
  // Blocked cells must EXIST for the legend claim to mean anything: the AHU
  // defs carry identity fields absent from spec, so shaded cells are present.
  const blockedCells = (xml.match(/w:fill="E5E5E5"/g) ?? []).length
  check(blockedCells > 0, `shaded not-applicable cells exist (${blockedCells}) — the premise the legend leg leans on`)
  check(xml.includes('Shaded = not applicable to this column'),
    'the ruled legend line rides the nameplate table')

  await user.auth.signOut().catch(() => {})
} catch (err) {
  check(false, `unexpected: ${err.message}`)
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. The docx holds its columns; Word has nothing to re-flow.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
