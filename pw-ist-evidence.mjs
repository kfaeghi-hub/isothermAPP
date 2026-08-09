// pw-ist-evidence — marking a pre-IST prerequisite received, in one motion.
//
// SIGHTED: a real browser through a real login, so RLS is in the path and the
// thing being asserted is what a person actually sees.
//
// THE RULE BEING PROVEN. Documents live in ShareSync; the app is the record of
// testing. So a prerequisite marked YES must NAME its evidence — a register row
// or a free-text pointer — but the app never demands custody of it. The database
// constraint is the last line; the UI's job is to make it unreachable, and these
// legs check both halves of that:
//
//   1. YES + a note saves in ONE round trip. Two steps (set YES, get refused,
//      find the field, type, save again) is a flow that gets abandoned standing
//      in a mechanical room, which means the control gets satisfied dishonestly.
//   2. YES + a register document still works — the future/portal case.
//   3. YES with NEITHER writes nothing and explains itself. Asserted on the ROW,
//      not on the absence of an error: "nothing happened" and "it silently saved"
//      look the same from the outside.
//
// ZZ-TEST only, self-cleaning.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { login, openTestProject, waitUntil, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-ist-evidence')

let pass = 0, fail = 0
const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: proj } = await svc.from('projects').select('id').eq('name', 'ZZ-TEST — Do Not Use').single()
const LABEL = 'PW-EVID'
const REF = 'S537 Verification Cert — ShareSync /2.Bldg_Docs/5.Certs/'

async function cleanup() {
  const { data } = await svc.from('ist_plans').select('id').eq('project_id', proj.id).like('revision_label', `${LABEL}%`)
  for (const p of data ?? []) await svc.from('ist_plans').delete().eq('id', p.id)
  await svc.from('documentation_register').delete().eq('project_id', proj.id).like('document_name', `${LABEL}%`)
}
await cleanup()

const { data: plan } = await svc.from('ist_plans')
  .insert({ project_id: proj.id, revision_label: `${LABEL}-0`, description: 'evidence legs' }).select('id').single()
await svc.rpc('ist_seed_prerequisites', { p_plan_id: plan.id })
const { data: doc } = await svc.from('documentation_register')
  .insert({ project_id: proj.id, document_name: `${LABEL} Register Copy`, doc_type: 'report' }).select('id').single()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })

const rowOf = itemNo => page.locator('[data-testid="ist-prereq-row"]').nth(itemNo - 1)
async function openIst() {
  await page.goto(`${BASE_URL}/projects`)
  await openTestProject(page)
  await page.getByRole('button', { name: 'IST', exact: true }).click()
  await page.waitForTimeout(2500)
  // select this suite's plan revision
  const radio = page.locator('[data-testid="ist-plan-row"]').filter({ hasText: `${LABEL}-0` }).locator('input')
  if (await radio.count()) { await radio.first().check(); await page.waitForTimeout(2000) }
}
const stateOf = async itemNo => (await svc.from('ist_prerequisites')
  // received_on IS SELECTED. The first version of this helper omitted it and the
  // leg below asserted `received_on !== undefined` — which failed against a
  // column that was simply never fetched. Asserting on a field you did not
  // measure is the same error as measuring through the wrong client.
  .select('state, evidence_reference, document_id, received_on').eq('plan_id', plan.id).eq('item_no', itemNo).single()).data

try {
  await login(page)
  await openIst()
  check(await page.locator('[data-testid="ist-prereq-row"]').count() === 22, 'the 22 prerequisites render')

  // ── 1. YES with a note — one motion ───────────────────────────────────────
  const r17 = rowOf(17)
  await r17.locator('[data-testid="ist-prereq-state"]').selectOption('yes')
  const asked = await waitUntil(async () => (await r17.locator('[data-testid="ist-prereq-ask"]').count()) > 0,
    { timeout: 6000, what: 'the where-is-the-document field' })
  check(asked, 'choosing YES asks where the document is, before writing anything')

  const beforeAsk = await stateOf(17)
  check(beforeAsk.state !== 'yes', 'nothing is written while the question is still open')

  await r17.locator('[data-testid="ist-prereq-ref"]').fill(REF)
  await r17.locator('[data-testid="ist-prereq-save"]').click()
  const saved = await waitUntil(async () => {
    const s = await stateOf(17)
    return s.state === 'yes' && s.evidence_reference === REF ? s : null
  }, { timeout: 10000, what: 'YES + reference saved together' })
  check(!!saved, 'YES and the reference save together, in one round trip')
  check(!!saved?.received_on && /^\d{4}-\d{2}-\d{2}$/.test(saved.received_on),
    `the received date is stamped by the same write (${saved?.received_on ?? 'none'})`)

  // ── 2. YES with a register document ───────────────────────────────────────
  const r18 = rowOf(18)
  await r18.locator('[data-testid="ist-prereq-state"]').selectOption('yes')
  await waitUntil(async () => (await r18.locator('[data-testid="ist-prereq-doc"]').count()) > 0,
    { timeout: 6000, what: 'the register dropdown' })
  await r18.locator('[data-testid="ist-prereq-doc"]').selectOption(doc.id)
  const viaDoc = await waitUntil(async () => {
    const s = await stateOf(18)
    return s.state === 'yes' && s.document_id === doc.id
  }, { timeout: 10000, what: 'YES via a register document' })
  check(viaDoc, 'YES still works by pointing at a document already in the register')

  // ── 3. YES with neither — writes nothing, and says why ────────────────────
  const r19 = rowOf(19)
  await r19.locator('[data-testid="ist-prereq-state"]').selectOption('yes')
  await waitUntil(async () => (await r19.locator('[data-testid="ist-prereq-ask"]').count()) > 0,
    { timeout: 6000, what: 'the question' })
  const saveBtn = r19.locator('[data-testid="ist-prereq-save"]')
  check(await saveBtn.isDisabled(), 'Save is disabled until a reference is typed')
  await r19.locator('[data-testid="ist-prereq-cancel"]').click()
  await page.waitForTimeout(1200)
  const s19 = await stateOf(19)
  check(s19.state !== 'yes' && !s19.evidence_reference,
    `abandoning the question writes NOTHING (state stayed '${s19.state}')`)

  // ── 4. no raw constraint text on screen ───────────────────────────────────
  // The MAPPING itself is unit-tested in src/lib/plainError.test.ts against real
  // PostgREST messages. This leg asserts only what a browser can: that a normal
  // flow leaves nothing raw on screen. The first draft had a `check(true, …)`
  // here — a check that cannot fail, which is exactly what this codebase treats
  // as a defect rather than a placeholder.
  const errText = await page.locator('[data-testid="ist-error"]').count()
  check(errText === 0, 'no raw constraint string is on screen after a normal flow')

} finally {
  await browser.close()
  await cleanup()
  console.log(`\ncleanup: ${LABEL} removed from ZZ-TEST`)
}

console.log('\n' + '='.repeat(60))
console.log(fail ? `FAIL — ${fail} of ${pass + fail}` : `PASS — ${pass} checks, evidence-as-reference verified through a real login.`)
process.exit(fail ? 1 : 0)
