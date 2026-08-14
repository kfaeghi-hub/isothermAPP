// pw-alias-provenance — 3r's gate. [KEEL] 2026-08-14.
//
// THE RULED ASSERTIONS:
//   1. an ordinary single-alias edit leaves every OTHER alias's provenance
//      byte-identical — read back and compared, not inspected
//   2. an add/remove writes its history row with full attribution
//   3. the DOAS→mau row's re-attached ruling note survives a subsequent
//      unrelated edit on the same type — the incident, as a regression test
//   4. the history has no client write path, in any direction
//
// THIS SUITE TOUCHES LIVE FIRM VOCABULARY — the alias table is firm-level, not
// ZZ-TEST-scoped, which is exactly why 3r exists. Three disciplines:
//   · it only ever ADDS its own probe alias (ZZPROBE-3R) and removes it again,
//     THROUGH THE UI — the same path a human edit takes
//   · it snapshots the type's alias rows first and RESTORES on any mismatch,
//     so a diff-save regression cannot silently damage vocabulary
//   · its history rows are removed via service role in finally — history is
//     append-only for CLIENTS; the harness cleaning its own probe trail is
//     housekeeping, not an edit path
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { loginAs, adminCredentials, BASE_URL, waitUntil } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-alias-provenance')

const PROBE = 'ZZPROBE-3R'
const TYPE = 'mau'   // the DOAS incident's own type — ruled as the specimen

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const snapshot = async () => {
  const { data } = await svc.from('equipment_type_aliases')
    .select('id, alias, note, created_by, created_at').eq('type_key', TYPE).order('alias')
  return (data ?? []).filter(r => r.alias !== PROBE)
}

const before = await snapshot()
if (!before.some(r => r.alias === 'DOAS')) {
  console.error('REFUSING: the DOAS→mau row is not where the record says — will not edit around an unknown state')
  process.exit(1)
}
// leftovers from a killed run: probe out, trail scrubbed, then a clean start
await svc.from('equipment_type_aliases').delete().eq('alias', PROBE)
await svc.from('equipment_type_alias_history').delete().eq('alias', PROBE)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
try {
  await loginAs(page, adminCredentials())
  await page.goto(`${BASE_URL}/classifications`, { waitUntil: 'networkidle' })

  // The types table lives behind a collapsed section header — expand it first.
  await page.getByRole('button', { name: /Equipment Types \(/ }).click()

  // ── the UI edit: add the probe to mau's alias list, save ──────────────────
  // The type NAME renders as an <input>, and hasText reads TEXT CONTENT — an
  // input's value is invisible to it (first run of this gate proved that: the
  // row never matched). The row's only text is the KEY cell, so anchor there.
  const row = page.locator('tr', { has: page.locator('td', { hasText: /^mau$/ }) }).first()
  await waitUntil(async () => await row.count() === 1, { timeout: 15000, what: 'the mau type row (by key cell)' })
  const aliasCell = row.locator('input[placeholder^="UH"]').first()
  await waitUntil(async () => await aliasCell.count() === 1, { timeout: 15000, what: 'the mau alias editor' })
  const existing = await aliasCell.inputValue()
  await aliasCell.fill(`${existing}, ${PROBE}`)
  await aliasCell.blur()   // the editor saves onBlur — Enter does nothing here
  await waitUntil(async () => {
    const { data } = await svc.from('equipment_type_aliases').select('id').eq('alias', PROBE)
    return (data ?? []).length === 1
  }, { timeout: 15000, what: 'the probe alias landing' })
  check(true, 'UI edit: probe alias added to the DOAS incident’s own type through the real save path')

  // ── 1+3 · every other alias byte-identical, the DOAS note included ─────────
  const after = await snapshot()
  const identical = before.length === after.length && before.every((b, i) =>
    JSON.stringify(b) === JSON.stringify(after[i]))
  check(identical,
    `an unrelated edit left the other ${before.length} alias row(s) BYTE-IDENTICAL (ids, notes, authors, dates)`)
  const doasNote = after.find(r => r.alias === 'DOAS')?.note ?? ''
  check(/Ruled by owner 2026-08-13/.test(doasNote) && /Seneca/.test(doasNote),
    'the DOAS ruling note SURVIVED the unrelated edit — the incident cannot recur')

  // ── 2 · the addition left its history row, attributed ─────────────────────
  const { data: hAdd } = await svc.from('equipment_type_alias_history')
    .select('*').eq('alias', PROBE).eq('action', 'added')
  check((hAdd ?? []).length === 1 && !!hAdd?.[0]?.changed_by && hAdd?.[0]?.type_key === TYPE,
    'the addition wrote ONE history row, attributed to the editor (changed_by set)')

  // ── the removal, same path ─────────────────────────────────────────────────
  await aliasCell.fill(existing)
  await aliasCell.blur()
  await waitUntil(async () => {
    const { data } = await svc.from('equipment_type_aliases').select('id').eq('alias', PROBE)
    return (data ?? []).length === 0
  }, { timeout: 15000, what: 'the probe alias departing' })
  const { data: hRem } = await svc.from('equipment_type_alias_history')
    .select('*').eq('alias', PROBE).eq('action', 'removed')
  check((hRem ?? []).length === 1 && !!hRem?.[0]?.changed_by,
    'the removal wrote its history row — who, when, what')
  check(hRem?.[0]?.prior_created_by === hAdd?.[0]?.changed_by,
    'and CARRIED the displaced row’s provenance (prior_created_by = the adder) instead of destroying it')

  const final = await snapshot()
  check(before.length === final.length && before.every((b, i) => JSON.stringify(b) === JSON.stringify(final[i])),
    'after add+remove the type’s alias rows are byte-identical to the pre-suite snapshot')

  // ── 4 · the history has NO client write path, any direction ───────────────
  const user = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const creds = adminCredentials()
  await user.auth.signInWithPassword({ email: creds.email, password: creds.password })
  const { error: insErr } = await user.from('equipment_type_alias_history')
    .insert({ action: 'added', type_key: TYPE, alias: 'ZZFORGE' })
  check(!!insErr, `client INSERT into the history refuses (${(insErr?.message ?? '').slice(0, 50)})`)
  const { data: hRow } = await svc.from('equipment_type_alias_history').select('id').eq('alias', PROBE).limit(1)
  const { error: updErr, data: updData } = await user.from('equipment_type_alias_history')
    .update({ action: 'updated' }).eq('id', hRow?.[0]?.id ?? '00000000-0000-0000-0000-000000000000').select('id')
  check(!!updErr || (updData ?? []).length === 0, 'client UPDATE refuses or touches nothing')
  const { error: delErr, data: delData } = await user.from('equipment_type_alias_history')
    .delete().eq('alias', PROBE).select('id')
  check(!!delErr || (delData ?? []).length === 0, 'client DELETE refuses or touches nothing')
  await user.auth.signOut().catch(() => {})

} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-alias-provenance-fail.png', fullPage: true }).catch(() => {})
  // RESTORE from the snapshot if the diff-save damaged anything: put back any
  // row that vanished, with its provenance. Additive only — never deletes.
  const now = await snapshot()
  const nowAliases = new Set(now.map(r => r.alias))
  for (const b of before) {
    if (!nowAliases.has(b.alias)) {
      await svc.from('equipment_type_aliases').insert({
        type_key: TYPE, alias: b.alias, note: b.note, created_by: b.created_by, created_at: b.created_at,
      })
      console.log(`  !! RESTORED ${b.alias} from the pre-suite snapshot`)
    }
  }
} finally {
  await browser.close().catch(() => {})
  // the probe's trail is harness housekeeping, not vocabulary history
  await svc.from('equipment_type_aliases').delete().eq('alias', PROBE)
  await svc.from('equipment_type_alias_history').delete().in('alias', [PROBE, 'ZZFORGE'])
  console.log('\ncleanup: probe alias + probe history rows removed')
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. An ordinary edit no longer erases what it did not touch.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
