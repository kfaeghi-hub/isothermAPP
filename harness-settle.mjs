// harness-settle — a suite is not finished until its writes have landed.
// [KEEL] Proposed 2026-08-12 under ruling 4. NOT a sleep.
//
// THE PROBLEM IT IS FOR. `spawnSync` returns when a suite's PROCESS exits, and a
// process exiting is not the same as its WRITES LANDING. A request already sent
// commits on the server whether or not the client waited for the response, so an
// unawaited cleanup settles during the next suite's run. "Issued the delete" is
// not "deleted" — the same distinction as *assert the departure*, moved from one
// statement to a whole suite's teardown.
//
// WHY IT IS NOT A SLEEP, and this is the whole design. A sleep buys time and
// proves nothing: it passes whether the write landed in 200ms or never. This
// READS THE STATE BACK and returns the moment it is clean, so
//
//   · a fast settle costs one query, not a fixed pause
//   · a write that NEVER lands fails LOUDLY with what is still there
//   · the assertion is about the residue, not about the clock
//
// The deadline exists only so a hung teardown cannot hang the battery. Reaching it
// is a FAILURE, never a shrug.
//
// ADOPTION IS PER-SUITE AND DELIBERATE. This ships as a helper; retrofitting 41
// suites in one pass would be a large blind edit, and the suites that need it are
// the ones that write to shared state and clean up after themselves.

/**
 * Wait until a query returns nothing, then say so. Fails loudly if it never does.
 *
 * @param query   () => Promise<{ data, error }> — re-run each poll, so it reads
 *                the CURRENT state rather than a cached answer.
 * @param label   what is being drained, for the failure message.
 */
export async function assertSettled(query, label, { deadlineMs = 15000, everyMs = 250 } = {}) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < deadlineMs) {
    const { data, error } = await query()
    if (error) throw new Error(`settle check for ${label} could not run: ${error.message}`)
    last = data ?? []
    if (last.length === 0) {
      const took = Date.now() - t0
      // A settle that took real time is worth SEEING. If this line starts
      // appearing at 3000ms, teardowns are drifting toward unawaited.
      if (took > 1000) console.log(`  (settled: ${label} cleared after ${took}ms)`)
      return { settled: true, ms: took }
    }
    await new Promise(r => setTimeout(r, everyMs))
  }
  // NOT A WARNING. A suite that leaves residue is a suite that will break its
  // neighbour, and the neighbour's failure will look like a defect in the
  // neighbour.
  throw new Error(
    `${label} did NOT settle within ${deadlineMs}ms — ${last?.length ?? '?'} row(s)/object(s) still present. ` +
    `This suite would have handed its residue to the next one.`)
}

/**
 * The inter-suite invariant, for the battery to run BETWEEN suites.
 *
 * Cheaper and blunter than per-suite settling, and complementary: it catches a
 * suite that left residue WITHOUT that suite having to opt in. The battery names
 * the offender rather than the victim — which is the point, because today the
 * victim is what turns red.
 */
export async function assertZzTestQuiet(svc, projectId, after) {
  const checks = [
    ['intake_uploads', () => svc.from('intake_uploads').select('id').eq('project_id', projectId)],
    ['intake_rows', () => svc.from('intake_rows').select('id').eq('project_id', projectId)],
    ['meetings', () => svc.from('meetings').select('id').eq('project_id', projectId)],
  ]
  const dirty = []
  for (const [name, q] of checks) {
    const { data } = await q()
    if ((data ?? []).length) dirty.push(`${name}=${data.length}`)
  }
  if (dirty.length) {
    console.log(`  !! ${after} left residue on ZZ-TEST: ${dirty.join(', ')} — the NEXT suite will wear it`)
  }
  return dirty
}
