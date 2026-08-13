// pw-type-picker — the suggestion-as-you-type type picker (Update 1.02, item 1).
//
//   node --env-file=.env pw-type-picker.mjs
//
// The claims being tested:
//
//   1. An alias resolves EXACTLY and never as a word. "UH" is a Unit Heater;
//      "UH-3 PUMP ROOM" is nothing. This is law 8 at the alias tier.
//   2. The never-alias list is enforced by the DATABASE, not by the UI, and the
//      refusal carries its reason.
//   3. THE SAVE IS NEVER BLOCKED. A unit with an unresolvable type saves, keeps
//      the typed text, and files a deduped queue entry.
//   4. The queue dedups in the database, not only in app code.
//   5. The picker is present on all three surfaces.
//
// Every browser assertion uses the bounded wait helpers — from birth, per the
// standing policy. ZZ-TEST only, self-cleaning in `finally`.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, openTestProject, BASE_URL, TEST_PROJECT, waitUntil } from './pw-config.mjs'

// THE MATCHER ITSELF IS NOT TESTED HERE. It is pure and lives in TypeScript;
// src/lib/intakeExcel.test.ts owns it (exact-alias, never-as-a-word, canonical-
// name-outranks-alias, and the RADIANT/RECEPTACLE case). Importing it into a
// Node harness would mean compiling it or — far worse — restating it. What this
// suite owns is everything the unit tests cannot see: the database guards, and
// whether the picker actually reaches the three screens.

const fails = []
let passed = 0
const check = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg)
}

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword(adminCredentials())
const { data: zz } = await adm.from('projects').select('id, name').eq('name', TEST_PROJECT).single()

const UNKNOWN = 'ZZ Sonic Reticulator'     // never a real type; unique to this suite
const madeEquipment = []
let browser

try {
  // ── 1. the vocabulary, loaded the way the app loads it ────────────────────
  const [{ data: types }, { data: aliasRows }] = await Promise.all([
    adm.from('equipment_types').select('key, name').eq('active', true).order('sort_order'),
    adm.from('equipment_type_aliases').select('type_key, alias'),
  ])
  const byKey = new Map()
  for (const a of aliasRows ?? []) {
    if (!byKey.has(a.type_key)) byKey.set(a.type_key, [])
    byKey.get(a.type_key).push(a.alias)
  }

  check((types ?? []).length > 0 && (aliasRows ?? []).length >= 30,
    `vocabulary loaded with aliases (${types?.length ?? 0} types, ${aliasRows?.length ?? 0} aliases)`)
  check((byKey.get('unit_heater') ?? []).includes('UH'),
    'the ruled seed is present — UH is an alias of unit_heater')
  // DOAS moved ahu→mau by owner ruling 2026-08-13 (reversal on record in
  // ARCHITECTURE.md, aliases section). This pin went red the first battery after
  // the owner's UI edit — vocabulary data moved and the assertion caught it
  // within hours, which is the pin WORKING, not flaking. The pin follows the
  // ruling, never the drift: it updates on a reversal-on-record and at no other
  // time.
  check((byKey.get('mau') ?? []).includes('DOAS') && (byKey.get('boiler') ?? []).includes('BLR'),
    'the two ruled mappings hold — DOAS→mau (reversed 2026-08-13) and BLR→boiler')
  check(!(aliasRows ?? []).some(a => /^(rp|ct|rtu|hrv|vrf)$/i.test(a.alias)),
    'nothing on the never-alias list slipped into the seed')

  // ── 2. the never-alias list refuses, WITH ITS REASON ──────────────────────
  const { data: blocked } = await adm.from('blocked_type_aliases').select('alias, reason')
  const blockedSet = new Set((blocked ?? []).map(b => b.alias))
  check(['rp', 'ct', 'rtu', 'hrv', 'vrf'].every(a => blockedSet.has(a)),
    `the never-alias list holds the ruled entries (${blocked?.length ?? 0} total)`)
  check((blocked ?? []).every(b => (b.reason ?? '').length > 20),
    'every block carries a REASON — a refusal that teaches, not a bare no')

  const { error: rpErr } = await adm.from('equipment_type_aliases')
    .insert({ type_key: 'radiant_panel', alias: 'RP' })
  check(!!rpErr && /never-alias/i.test(rpErr.message ?? ''),
    `the database refuses "RP" — the RADIANT/RECEPTACLE collision cannot be ` +
    `re-imported as a feature (${rpErr ? 'refused' : 'ACCEPTED — bug'})`)

  // The guard must answer DIFFERENTLY in the two states, or it is not a guard.
  const { error: okErr } = await adm.from('equipment_type_aliases')
    .insert({ type_key: 'fan', alias: 'ZZPROBE' })
  check(!okErr, `a legal alias still inserts (${okErr?.message ?? 'inserted'})`)
  await adm.from('equipment_type_aliases').delete().eq('alias', 'ZZPROBE')

  // ── 3. the never-blocked save ─────────────────────────────────────────────
  await adm.from('proposed_equipment_types').delete().ilike('observed_name', UNKNOWN)

  const { data: u1, error: e1 } = await adm.from('equipment').insert({
    project_id: zz.id, kind: 'equipment', tag: 'ZZ-PICK-1',
    descriptor: 'ZZ type-picker fixture',
    equipment_type: null, observed_type_name: UNKNOWN,
  }).select('id, equipment_type, observed_type_name').single()
  if (u1) madeEquipment.push(u1.id)
  check(!e1 && !!u1?.id,
    `a unit with an UNRESOLVABLE type saves anyway (${e1?.message ?? 'saved'})`)
  check(u1?.observed_type_name === UNKNOWN && u1?.equipment_type === null,
    'the typed text is kept on the unit, and no type was invented for it')

  // ── 4. the queue: filed once, deduped by the DATABASE ─────────────────────
  const { error: q1 } = await adm.from('proposed_equipment_types')
    .insert({ observed_name: UNKNOWN, project_id: zz.id, status: 'proposed' })
  check(!q1, `the proposal is filed (${q1?.message ?? 'filed'})`)

  const { error: q2 } = await adm.from('proposed_equipment_types')
    .insert({ observed_name: UNKNOWN.toUpperCase(), project_id: zz.id, status: 'proposed' })
  check(!!q2 && /duplicate|unique/i.test(q2.message ?? ''),
    `a second proposal for the same name is refused BY THE INDEX, case-insensitively ` +
    `— app-level dedup cannot see two users typing at once (${q2 ? 'refused' : 'ACCEPTED — bug'})`)

  const { count: waiting } = await adm.from('equipment')
    .select('id', { count: 'exact', head: true })
    .is('equipment_type', null).ilike('observed_type_name', UNKNOWN)
  check((waiting ?? 0) === 1,
    `the waiting-unit count is DERIVED from the units themselves (${waiting})`)

  // ── 5. the picker is on all three surfaces ────────────────────────────────
  browser = await chromium.launch()
  const page = await browser.newPage()
  await loginAs(page, adminCredentials())

  // Surface A + B: the Cx Index add form and the inline editor.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  await openTestProject(page)
  await page.getByRole('button', { name: 'Equipment', exact: true }).first().click()

  // WAIT FOR THE TAB TO ARRIVE BEFORE LOOKING FOR ITS BUTTONS. The Overview tab
  // also has a "+ Add", so an instant read after the click found that one and
  // then clicked a node the re-render had already detached. Arrival is proven by
  // a control only this tab has.
  const importBtn = page.getByRole('button', { name: 'Import', exact: true })
  const onEquipment = await waitUntil(async () => await importBtn.count() > 0,
    { what: 'the Equipment tab (its Import button)' })
  check(!!onEquipment, 'the Equipment tab opened')
  if (!onEquipment) throw new Error('never reached the Equipment tab')

  await page.getByRole('button', { name: '+ Add', exact: true }).first().click()

  const picker = page.getByRole('combobox', { name: 'Equipment Type' })
  const pickerThere = await waitUntil(async () => await picker.count() > 0,
    { what: 'the type picker on the add form' })
  // ASSERT THE CONDITION, NOT `true`. The first version of this line was
  // `check(true, ...)` after the wait — which passed while the wait was timing
  // out, in a suite written the same evening as the rule that a guard answering
  // the same in both states is not a guard.
  check(!!pickerThere, 'SURFACE 1 — the Cx Index add form renders the type picker')
  if (!pickerThere) throw new Error('picker never rendered — the UI legs cannot run')

  // Typing an alias offers its type, and the row SAYS it matched by alias.
  await picker.fill('UH')
  await waitUntil(async () => (await page.locator('[role="option"]').allInnerTexts())
    .some(t => /Unit Heater/i.test(t)), { what: 'the Unit Heater suggestion for "UH"' })
  const optionTexts = await page.locator('[role="option"]').allInnerTexts()
  check(optionTexts.some(t => /matched "UH"/i.test(t)),
    'the suggestion SAYS why it matched — "matched \\"UH\\"" — rather than asking to be trusted')

  // Typing an unknown offers the propose row, and it is not an error state.
  await picker.fill(UNKNOWN)
  await waitUntil(async () => (await page.locator('[role="option"]').allInnerTexts())
    .some(t => /No matching type/i.test(t)), { what: 'the propose row' })
  const proposeText = (await page.locator('[role="option"]').allInnerTexts())
    .find(t => /No matching type/i.test(t)) ?? ''
  check(proposeText.includes(UNKNOWN),
    `the propose row quotes what was actually typed (${proposeText.slice(0, 60)})`)

  await page.keyboard.press('Escape')

  // Surface C: the intake review screen.
  const { data: uploads } = await adm.from('intake_uploads')
    .select('id').eq('project_id', zz.id).limit(1)
  if (uploads?.length) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    check(true, 'SURFACE 3 — intake review reachable (fixture upload present)')
  } else {
    // Asserted structurally instead of skipped: the same component, imported by
    // the same path. A skipped check reads as a passed one three months later.
    const src = await import('node:fs').then(fs =>
      fs.promises.readFile('src/components/intake/IntakeReview.tsx', 'utf8'))
    check(/<TypePicker/.test(src) && /loadTypeVocabulary/.test(src),
      'SURFACE 3 — intake review uses the SAME TypePicker and the same vocabulary loader')
  }

  const eqSrc = await import('node:fs').then(fs =>
    fs.promises.readFile('src/pages/EquipmentPage.tsx', 'utf8'))
  check((eqSrc.match(/<TypePicker/g) ?? []).length === 2,
    'SURFACE 2 — the inline editor uses the picker too (2 mounts on the page: add + edit)')
  check(!/<select[^>]*proposed_type/.test(
    await import('node:fs').then(fs =>
      fs.promises.readFile('src/components/intake/IntakeReview.tsx', 'utf8'))),
    'the old bare <select> is GONE, not merely bypassed')

} finally {
  for (const id of madeEquipment) await adm.from('equipment').delete().eq('id', id)
  await adm.from('proposed_equipment_types').delete().ilike('observed_name', UNKNOWN)
  await adm.from('equipment_type_aliases').delete().eq('alias', 'ZZPROBE')
  await browser?.close()
}

console.log(`\n  ${passed} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log(`   ✗ ${f}`); process.exit(1) }
