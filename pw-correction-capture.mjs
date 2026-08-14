// pw-correction-capture — Phase 6's gate. One of EACH disposition class on the
// ZZ-TEST fixture; every signal read back with its full context. [KEEL] 2026-08-13.
//
// THE CLASSES (ruled):
//   1. accept-clean                       ZZ5B-AHU-1
//   2. accept-unverified                  ZZ5B-UH-9   (verification_ran=false)
//   3. accept-with-question-unanswered    ZZ5B-B-1    (question_state)
//   4. question-answered-via-edit         ZZ5B-F-3    (question_state)
//   5. conflict-resolved, RULES leg       ZZ5B-HP-2   (chosen_leg='rules')
//   6. conflict-resolved, MODEL leg       ZZ5B-CU-2   (chosen_leg='model')
//   7. plain edit                         ZZ5B-P-1
//   8. reject                             ZZ5B-EF-7
//
// Plus the guards that make capture a CONTRACT, not a hope:
//   · a NULL-provenance disposition (ZZ5B-LEG-0) produces NO signal
//   · a direct INSERT into correction_signals is REFUSED — the trigger is the
//     only author; a forgeable signal would poison what harvest mines
//   · cleanup takes the signals with the upload — no residue for the neighbours
//
// Dispositions are written THE WAY THE UI WRITES THEM: an authed (non-service)
// client updating intake_rows, so RLS, the trigger, and resolved_by are all the
// production path. The browser leg of the same surface is pw-intake-review's job.
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { adminCredentials } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-correction-capture')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const seed = (...args) => spawnSync(process.execPath, ['seed-5b-review-fixture.mjs', ...args],
  { env: process.env, encoding: 'utf8' })

const seeded = seed()
if (seeded.status !== 0) { console.error(`REFUSING: seed failed — ${seeded.stderr || seeded.stdout}`); process.exit(1) }
const uploadId = (seeded.stdout.match(/upload ([0-9a-f-]{36})/) ?? [])[1]
if (!uploadId) { console.error('REFUSING: could not read the upload id from the seed'); process.exit(1) }

// The authed client — the same path the review UI writes through.
const user = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const creds = adminCredentials()
const { data: auth, error: authErr } = await user.auth.signInWithPassword({ email: creds.email, password: creds.password })
if (authErr) { console.error(`REFUSING: login failed — ${authErr.message}`); seed('--clean'); process.exit(1) }
const uid = auth.user.id

try {
  const dispose = async (tag, disposition, edited = null) => {
    const { data, error } = await user.from('intake_rows')
      .update({ disposition, edited, resolved_by: uid, resolved_at: new Date().toISOString() })
      .eq('upload_id', uploadId).eq('tag', tag).select('id')
    if (error) throw new Error(`${tag} ${disposition} refused: ${error.message}`)
    if ((data ?? []).length !== 1) throw new Error(`${tag} ${disposition} touched ${data?.length ?? 0} rows`)
  }

  // ── one of each class ─────────────────────────────────────────────────────
  await dispose('ZZ5B-AHU-1', 'accepted')                                          // 1
  await dispose('ZZ5B-UH-9', 'accepted')                                           // 2
  await dispose('ZZ5B-B-1', 'accepted')                                            // 3
  await dispose('ZZ5B-F-3', 'edited', { descriptor: 'Supply fan, interior — VFD belongs to F-3 only' }) // 4
  await dispose('ZZ5B-HP-2', 'edited', { proposed_type: 'heat_pump' })             // 5 rules
  await dispose('ZZ5B-CU-2', 'edited', { proposed_type: 'fcu' })                   // 6 model
  await dispose('ZZ5B-P-1', 'edited', { descriptor: 'HW circulating pump — CHW loop 2' }) // 7
  await dispose('ZZ5B-EF-7', 'rejected')                                           // 8
  await dispose('ZZ5B-LEG-0', 'accepted')                                          // null-provenance — no signal

  // ── read back, service-role: the whole record, keyed by tag ───────────────
  const { data: sigs } = await svc.from('correction_signals')
    .select('*').eq('upload_id', uploadId)
  const byTag = new Map((sigs ?? []).map(s => [s.tag, s]))

  check((sigs ?? []).length === 8,
    `eight dispositions on provenance rows -> exactly eight signals (got ${sigs?.length ?? 0})`)
  check(!byTag.has('ZZ5B-LEG-0'),
    'the null-provenance disposition produced NO signal — capture is for provenance rows')

  const s1 = byTag.get('ZZ5B-AHU-1')
  check(s1?.disposition === 'accepted' && s1?.read_via === 'both' && Number(s1?.confidence) === 0.95
        && s1?.had_conflict === false && s1?.proposed_type === 'ahu',
    'accept-clean: machine proposal frozen with the outcome (type, confidence, leg)')
  check(s1?.resolved_by === uid && s1?.source_surface === 'intake-review' && s1?.source_sheet === 'SCHED-1',
    'and the context: who, which surface, which sheet')

  const s2 = byTag.get('ZZ5B-UH-9')
  check(s2?.verification_ran === false && s2?.disposition === 'accepted',
    'accept-unverified: verification_ran=false rides the signal')

  const s3 = byTag.get('ZZ5B-B-1')
  check(s3?.question_state === 'accepted-unanswered' && s3?.questions_attributed === 1,
    'accept-with-question: question_state=accepted-unanswered, count carried')

  const s4 = byTag.get('ZZ5B-F-3')
  check(s4?.question_state === 'answered-via-edit' && s4?.disposition === 'edited',
    'question-answered-via-edit: the edit that answers is distinguishable from silence')

  const s5 = byTag.get('ZZ5B-HP-2')
  check(s5?.had_conflict === true && s5?.chosen_leg === 'rules'
        && s5?.conflict_rules === 'heat_pump' && s5?.conflict_model === 'fcu',
    'conflict resolved to the RULES reading: chosen_leg names it, both candidates frozen')

  const s6 = byTag.get('ZZ5B-CU-2')
  check(s6?.had_conflict === true && s6?.chosen_leg === 'model',
    'conflict resolved to the MODEL reading: chosen_leg names it')

  const s7 = byTag.get('ZZ5B-P-1')
  check(s7?.disposition === 'edited' && s7?.chosen_leg === null && s7?.had_conflict === false
        && s7?.edited?.descriptor?.includes('CHW loop 2'),
    'plain edit: what changed is in the signal, no conflict fields invented')

  const s8 = byTag.get('ZZ5B-EF-7')
  check(s8?.disposition === 'rejected' && s8?.read_via === 'both',
    'reject: captured with the machine context it declined')

  // ── the no-second-door guard: answers DIFFERENTLY in the two states ───────
  const { error: forgeErr } = await user.from('correction_signals').insert({
    upload_id: uploadId, project_id: s1.project_id, disposition: 'accepted',
    tag: 'ZZ5B-FORGED', source_surface: 'intake-review',
  })
  check(!!forgeErr,
    `a direct INSERT is REFUSED — the trigger is the only author (${(forgeErr?.message ?? '').slice(0, 60)})`)
  const { data: forged } = await svc.from('correction_signals')
    .select('id').eq('upload_id', uploadId).eq('tag', 'ZZ5B-FORGED')
  check((forged ?? []).length === 0, 'and nothing landed')

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  const cleaned = seed('--clean')
  console.log(`\n${(cleaned.stdout || '').trim()}`)
  // DEPARTURE ASSERTED: the signals must leave with the upload, or this suite
  // hands residue to its neighbours and pollutes the NEXT run's read-back.
  const { data: left } = await svc.from('correction_signals').select('id').eq('upload_id', uploadId)
  check((left ?? []).length === 0, 'self-clean: signals cascaded away with the fixture upload')
  await user.auth.signOut().catch(() => {})
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. Every disposition class lands as a signal harvest can mine.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
