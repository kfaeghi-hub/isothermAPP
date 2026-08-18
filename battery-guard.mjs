// BATTERY TREE-STATE GUARD — a battery whose suites changed under it VOIDS
// ITSELF, by name. [ATLAS] W2, ruled at the Cx Index arc's close.
//
// WHY THIS IS STRUCTURE AND NOT A LESSON. The battery loads every suite from
// the working tree, so editing a suite mid-run IS landing code in a running
// battery — discovered by this guard's own author, who edited pw-portal and
// pw-cx-export while the 2c gate ran and produced a 51/53 whose two failures
// were the edits, not the product. That run had to be voided BY A HUMAN
// noticing. The fourth guard born as written-down-and-violated-by-its-author:
// a rule that depends on being remembered mid-session is not a rule yet.
//
// HOW: content-hash every file the run executes (the suite allow-list, this
// file, the runner, the shared harness modules) at start; re-hash at end. Any
// difference → the run announces the changed files and voids itself with a
// distinct exit code, whatever the suites reported. A green summary over a
// mutated tree is the silence class wearing a checkmark.

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'

export const VOID_EXIT = 3

/** Hash the content of every path that exists; absent files hash as ABSENT —
 *  a suite deleted mid-run is a change, not a skip. */
export function treeStamp(paths) {
  const stamp = new Map()
  for (const p of paths) {
    if (!existsSync(p)) { stamp.set(p, 'ABSENT'); continue }
    stamp.set(p, createHash('sha256').update(readFileSync(p)).digest('hex'))
  }
  return stamp
}

/** The files whose mid-run mutation voids a battery: every listed suite plus
 *  the harness itself. */
export function guardPaths(suites) {
  return [
    ...suites.map(s => `${s}.mjs`),
    'run-battery.mjs', 'battery-guard.mjs', 'harness-lock.mjs', 'pw-config.mjs',
  ]
}

/** Compare two stamps; returns the changed paths (empty = clean). */
export function stampDiff(before, after) {
  const changed = []
  for (const [p, h] of before) if (after.get(p) !== h) changed.push(p)
  for (const p of after.keys()) if (!before.has(p)) changed.push(p)
  return changed
}

/** Print the void banner. The cause is named per file — the next reader
 *  should not have to diff anything to know what moved. */
export function announceVoid(changed) {
  console.log('!'.repeat(70))
  console.log('THE WORKING TREE CHANGED WHILE THIS BATTERY RAN — THE RUN IS VOID.')
  console.log('Suites load from the tree, so an edit mid-run IS code landing in a')
  console.log('running battery. Whatever the suites reported above, do not trust it.')
  for (const p of changed) console.log(`  changed mid-run: ${p}`)
  console.log(`Re-run after the tree settles. (exit ${VOID_EXIT})`)
  console.log('!'.repeat(70))
}

// ── Self-test: `node battery-guard.mjs --selftest` ───────────────────────────
// Proves the guard answers DIFFERENTLY in its two states (the sibling rule):
// an untouched file stamps identical; a modified one is named; a deleted one
// is named. Uses a temp file only — never a real suite.
if (process.argv[1]?.endsWith('battery-guard.mjs') && process.argv.includes('--selftest')) {
  const { writeFileSync, unlinkSync } = await import('node:fs')
  const tmp = `.battery-guard-selftest-${process.pid}.tmp`
  let pass = 0, fail = 0
  const check = (ok, what) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }
  try {
    writeFileSync(tmp, 'state A')
    const before = treeStamp([tmp])
    check(stampDiff(before, treeStamp([tmp])).length === 0, 'an untouched file stamps identical')
    writeFileSync(tmp, 'state B')
    const changed = stampDiff(before, treeStamp([tmp]))
    check(changed.length === 1 && changed[0] === tmp, `a modified file is named (${changed.join(',')})`)
    unlinkSync(tmp)
    const gone = stampDiff(before, treeStamp([tmp]))
    check(gone.length === 1, 'a deleted file is a change, not a skip')
  } finally {
    try { unlinkSync(tmp) } catch { /* already gone */ }
  }
  console.log(fail === 0 ? `SELFTEST PASS (${pass})` : `SELFTEST FAIL (${fail})`)
  process.exit(fail === 0 ? 0 : 1)
}
