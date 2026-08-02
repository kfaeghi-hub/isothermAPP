// pw-contact-channels — BUG 1's regression gate.
//
//   node --env-file=.env pw-contact-channels.mjs
//
// RUNS AS THE EMPLOYEE, NOT THE ADMIN, and that is the whole point. This bug was
// invisible to an admin: the DELETE policy on contact_phones/contact_emails was
// narrower than the INSERT policy, so only non-admin staff hit it. A regression
// test signed in as an admin would pass on the broken code.
//
// The ruled scenario: a contact with 2 phones + 2 emails, add one of each, save
// TWICE. Saving twice matters — the first save is what silently failed to delete,
// and the second is where the duplicate primary surfaced.
//
// Directory holds real firm data, so everything here is a ZZ-marked throwaway
// contact removed in `finally`.
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, credentials } from './pw-config.mjs'

const fails = []
let passed = 0
const check = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (ok) passed++; else fails.push(msg)
}

const U = process.env.VITE_SUPABASE_URL, K = process.env.VITE_SUPABASE_ANON_KEY
const admin = createClient(U, K); await admin.auth.signInWithPassword(adminCredentials())
const emp   = createClient(U, K); await emp.auth.signInWithPassword(credentials())

const { data: me } = await emp.from('user_profiles').select('role').single()
console.log(`acting as: ${me?.role} (NOT admin — the role the bug was visible to)\n`)
if (me?.role === 'admin' || me?.role === 'developer' || me?.role === 'owner') {
  console.error('REFUSING: this gate is meaningless as an admin.'); process.exit(1)
}

let contactId = null
try {
  const { data: co } = await admin.from('companies').select('id').limit(1).single()
  const { data: c, error: cErr } = await emp.from('contacts')
    .insert({ name: 'ZZ-CHANNELS Do Not Use', company_id: co.id }).select('id').single()
  if (cErr) throw new Error(`create contact: ${cErr.message}`)
  contactId = c.id

  const save = (phones, emails) => emp.rpc('replace_contact_channels', {
    p_contact_id: contactId, p_phones: phones, p_emails: emails,
  })
  const read = async () => {
    const [{ data: p }, { data: e }] = await Promise.all([
      admin.from('contact_phones').select('*').eq('contact_id', contactId),
      admin.from('contact_emails').select('*').eq('contact_id', contactId),
    ])
    return { p: p ?? [], e: e ?? [] }
  }

  // ── the starting state: 2 phones, 2 emails ────────────────────────────────
  const P2 = [
    { phone_type: 'office', number: '(647) 789-2628', is_primary: true },
    { phone_type: 'mobile', number: '(416) 434-5910', is_primary: false },
  ]
  const E2 = [
    { email: 'first@example.com', is_primary: true },
    { email: 'second@example.com', is_primary: false },
  ]
  const s1 = await save(P2, E2)
  check(!s1.error, `a NON-ADMIN can save channels at all${s1.error ? `: ${s1.error.message}` : ''}`)

  let st = await read()
  check(st.p.length === 2 && st.e.length === 2, `2 phones + 2 emails stored (${st.p.length}/${st.e.length})`)

  // ── add one of each, save ─────────────────────────────────────────────────
  const P3 = [...P2, { phone_type: 'site', number: '(905) 000-0000', is_primary: false }]
  const E3 = [...E2, { email: 'third@example.com', is_primary: false }]
  const s2 = await save(P3, E3)
  check(!s2.error, `adding one of each SAVES${s2.error ? `: ${s2.error.message}` : ''}`)

  st = await read()
  check(st.p.length === 3 && st.e.length === 3,
    `THE DELETE ACTUALLY DELETED — 3 and 3, not 5 and 5 (${st.p.length}/${st.e.length})`)

  // ── SAVE TWICE, the ruled scenario ────────────────────────────────────────
  const s3 = await save(P3, E3)
  check(!s3.error, `saving a SECOND time succeeds${s3.error ? `: ${s3.error.message}` : ''}`)
  st = await read()
  check(st.p.length === 3 && st.e.length === 3,
    `and does not accumulate (${st.p.length}/${st.e.length})`)

  // ── exactly one primary, whatever the client sends ────────────────────────
  check(st.p.filter(x => x.is_primary).length === 1, 'exactly one primary phone')
  check(st.e.filter(x => x.is_primary).length === 1, 'exactly one primary email')

  const twoPrimary = await save(
    [{ phone_type: 'office', number: '1', is_primary: true },
     { phone_type: 'mobile', number: '2', is_primary: true }],
    [{ email: 'a@example.com', is_primary: true },
     { email: 'b@example.com', is_primary: true }])
  check(!twoPrimary.error,
    `a client sending TWO primaries cannot break the save${twoPrimary.error ? `: ${twoPrimary.error.message}` : ''}`)
  st = await read()
  check(st.p.filter(x => x.is_primary).length === 1 && st.e.filter(x => x.is_primary).length === 1,
    'the server normalised it to one primary each rather than trusting the client')

  const noPrimary = await save(
    [{ phone_type: 'office', number: '9', is_primary: false }],
    [{ email: 'z@example.com', is_primary: false }])
  check(!noPrimary.error, 'a client sending NO primary saves too')
  st = await read()
  check(st.p.filter(x => x.is_primary).length === 1 && st.e.filter(x => x.is_primary).length === 1,
    'and the first row became primary — a channel list with no primary renders as "none" downstream')

  // ── the legacy mirror moved in the same transaction ───────────────────────
  const { data: cRow } = await admin.from('contacts')
    .select('email, phone').eq('id', contactId).single()
  check(cRow.email === 'z@example.com' && cRow.phone === '9',
    `the legacy columns mirror the primaries (${cRow.phone} / ${cRow.email})`)

  // ── emptying the lists is a real edit, not a no-op ────────────────────────
  const cleared = await save([], [])
  check(!cleared.error, 'clearing every channel saves')
  st = await read()
  check(st.p.length === 0 && st.e.length === 0, `and actually clears (${st.p.length}/${st.e.length})`)

  // ── the sibling tables that carried the same asymmetry ────────────────────
  const { data: comp } = await emp.from('companies')
    .insert({ name: 'ZZ-CHANNELS Co Do Not Use' }).select('id').single()
  if (comp) {
    const { data: rt } = await admin.from('company_role_types').select('id').limit(1).single()
    await emp.from('company_roles').insert({ company_id: comp.id, role_type_id: rt.id })
    const del = await emp.from('company_roles').delete().eq('company_id', comp.id)
    const { count } = await admin.from('company_roles')
      .select('id', { count: 'exact', head: true }).eq('company_id', comp.id)
    check(!del.error && count === 0,
      `company_roles: a staff DELETE now actually deletes (${count} left) — ` +
      `this one had no unique index to trip, so it failed silently forever`)
    await admin.from('companies').delete().eq('id', comp.id)
  }

} catch (e) {
  check(false, `run: ${e.message}`)
} finally {
  if (contactId) await admin.from('contacts').delete().eq('id', contactId)
  const { count } = await admin.from('contacts')
    .select('id', { count: 'exact', head: true }).like('name', 'ZZ-CHANNELS%')
  const { count: cc } = await admin.from('companies')
    .select('id', { count: 'exact', head: true }).like('name', 'ZZ-CHANNELS%')
  check((count ?? 0) === 0 && (cc ?? 0) === 0, `self-clean: 0 fixtures left (${count}/${cc})`)
}

console.log(`\n${'='.repeat(64)}`)
if (fails.length) { console.log(`FAIL — ${fails.length}:`); fails.forEach(f => console.log(`  - ${f}`)); process.exit(1) }
console.log(`PASS — contact channels: atomic, non-admin safe, one primary always. ${passed} checks.`)
