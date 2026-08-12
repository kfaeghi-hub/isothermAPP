// The ruling-2 conversion, DRY RUN BY DEFAULT. Writes nothing without --apply.
//
//   node out/convert-sleeps.mjs            # diff to stdout, touches nothing
//   node out/convert-sleeps.mjs --apply    # writes the suites
//
// THE TRANSFORM. For a guard site whose predicate is already written as the next
// check's own condition:
//
//     await page.waitForTimeout(600)
//     check(await modal.getByText('is required.').count() >= 3, 'validation: ...')
//
// becomes
//
//     await waitUntil(async () => await modal.getByText('is required.').count() >= 3,
//       { timeout: 15000, what: 'validation: ...' })
//     check(await modal.getByText('is required.').count() >= 3, 'validation: ...')
//
// The check is UNTOUCHED, so a condition that never becomes true still goes red
// with the same verdict. The fixed sleep is removed — that is the point.
//
// ── WHAT THIS REFUSES TO TOUCH, and why each refusal is load-bearing ───────────
//
// 1. NEGATIVE predicates. Polling until "count() === 0" returns on tick 1: the
//    wait is deleted and the check can no longer fail.
// 2. Sites with no check in the window — no predicate to derive.
// 3. Sites where the check's first argument does not contain `await`. Without a
//    read there is nothing to re-poll; the value is already in hand.
import { readFileSync, writeFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const NL = String.fromCharCode(10)
const plan = JSON.parse(readFileSync('out/sleep-plan.json', 'utf8'))
const targets = [...plan.inlineDerivable, ...plan.assignedDerivable]

/** first argument of a call, by paren balance — regex cannot do this. */
function firstArg(line, callIdx) {
  const open = line.indexOf('(', callIdx)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < line.length; i++) {
    const c = line[i]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return line.slice(open + 1, i) }
    else if (c === ',' && depth === 1) return line.slice(open + 1, i)
  }
  return null
}

/** the check's message, for the `what:` field — second arg, best effort */
function message(line, next) {
  // A check's message often sits on the FOLLOWING line:
  //     check(await x.count() === 1,
  //       '#2 a LEAD sees the panel')
  // Looking only at the check's own line labelled those "the condition", and the
  // label is the failure message — a bad one costs a diagnosis later.
  for (const src of [line, (line + ' ' + (next || ''))]) {
    const m = src.match(/,\s*[`'"](.{0,70}?)[`'"]/)
    if (m) return m[1]
  }
  return null
}

const byFile = {}
for (const t of targets) (byFile[t.file] ??= []).push(t)

let converted = 0, skipped = 0
const diffs = []
const skips = []

for (const [file, sites] of Object.entries(byFile)) {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, NL).split(NL)
  // descending, so earlier line numbers stay valid as we edit
  const ordered = [...sites].sort((a, b) => b.line - a.line)
  let touched = false

  for (const s of ordered) {
    const sleepIdx = s.line - 1
    if (!/waitForTimeout/.test(lines[sleepIdx] ?? '')) { skips.push(`${file}:${s.line} anchor moved`); skipped++; continue }

    // ── REFUSE COMPOUND LINES ───────────────────────────────────────────────
    // Caught by dry-running rather than applying. Three target lines are not a
    // bare sleep, e.g.
    //     if (t) { await page.getByText(t).first().click(); await page.waitForTimeout(2000) }
    // Deleting that line removes a CLICK. The tempting fix — surgically strip the
    // sleep call out of the line — is how a codemod breaks a suite quietly, so
    // these are refused to the hand list instead. Note the object is not always
    // `page`: pw-deliverable-access waits on `lp`.
    if (!/^\s*await\s+[\w$.]+\.waitForTimeout\s*\(\s*[\d_]+\s*\)\s*;?\s*$/.test(lines[sleepIdx])) {
      skips.push(`${file}:${s.line} COMPOUND line — refused, goes to the hand list`)
      skipped++; continue
    }

    // find the check within the next 7 lines
    let chkIdx = -1
    for (let i = sleepIdx + 1; i < Math.min(sleepIdx + 8, lines.length); i++) {
      if (lines[i].includes('check(')) { chkIdx = i; break }
    }
    if (chkIdx < 0) { skips.push(`${file}:${s.line} no check`); skipped++; continue }

    const chkLine = lines[chkIdx]
    const pred = firstArg(chkLine, chkLine.indexOf('check('))
    if (!pred || !/\bawait\b/.test(pred)) { skips.push(`${file}:${s.line} predicate has no read`); skipped++; continue }

    const what = (message(chkLine, lines[chkIdx + 1]) || 'the condition').replace(/'/g, '')
    const indent = (chkLine.match(/^\s*/) || [''])[0]
    const poll = `${indent}await waitUntil(async () => ${pred.trim()},${NL}` +
                 `${indent}  { timeout: 15000, what: '${what}' })`

    diffs.push({ file, line: s.line, ms: s.ms, removed: lines[sleepIdx].trim(), added: poll.trim() })
    lines.splice(chkIdx, 0, ...poll.split(NL))
    lines.splice(sleepIdx, 1)
    touched = true
    converted++
  }

  if (touched) {
    // ensure waitUntil is imported from pw-config
    const impIdx = lines.findIndex(l => /from '\.\/pw-config\.mjs'/.test(l))
    if (impIdx >= 0 && !/\bwaitUntil\b/.test(lines[impIdx])) {
      lines[impIdx] = lines[impIdx].replace(/\{\s*/, '{ waitUntil, ')
    } else if (impIdx < 0) {
      skips.push(`${file}: NO pw-config import — waitUntil would be undefined`)
    }
    if (APPLY) writeFileSync(file, lines.join(NL))
  }
}

for (const d of diffs) {
  console.log(`\n${d.file}:${d.line}  (${d.ms}ms)`)
  console.log(`  - ${d.removed}`)
  for (const l of d.added.split(NL)) console.log(`  + ${l}`)
}
console.log(`\n${'='.repeat(64)}`)
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'} — ${converted} converted, ${skipped} skipped`)
if (skips.length) { console.log('\nskipped:'); for (const s of skips) console.log(`  ${s}`) }
console.log(`\nNOT touched by design: ${plan.negative.length} negative predicates, ${plan.hand.length} with no derivable predicate.`)
if (!APPLY) console.log('Nothing was written. Re-run with --apply.')
