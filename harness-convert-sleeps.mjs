// harness-convert-sleeps — turn fixed sleeps that GUARD an assertion into bounded
// waits. [KEEL] Ruling 2, 2026-08-12. DRY RUN BY DEFAULT; writes nothing without
// --apply.
//
//   node harness-convert-sleeps.mjs            # diff to stdout, touches nothing
//   node harness-convert-sleeps.mjs --apply    # writes the suites
//   node harness-convert-sleeps.mjs --census   # classification only, no diff
//
// ── WHY THIS IS A TOOL AND NOT A ONE-OFF SCRIPT ───────────────────────────────
//
// GUARD REPLACES MEMORY. The first version read a precomputed classification out
// of out/sleep-plan.json, which meant its safety depended on that file being
// regenerated, and on someone remembering what docs/HARNESS-SLEEP-INVENTORY.md
// says. A sleep added next year would be classified by whoever happened to run
// what. This version classifies from source every time it runs, so the refusals
// below are a MECHANISM rather than a note. The doc is the ledger; this is the
// guard.
//
// ── THE TRANSFORM ─────────────────────────────────────────────────────────────
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
// with the same verdict. The fixed sleep is removed — that is the point. The wait
// stops being a bet on the machine's speed, and green runs stop paying for it.
//
// ── THE FOUR STRUCTURAL REFUSALS, each earned ─────────────────────────────────
//
// 1. NEGATIVE PREDICATES. `check(await x.count() === 0, 'NOT created')` polled
//    until true returns ON THE FIRST TICK, because it is already true before the
//    thing has had any chance to appear. The wait is not shortened, it is DELETED,
//    and the check becomes one that cannot fail. A repair that manufactures the
//    original disease. These need a POSITIVE anchor proving the operation
//    completed, chosen by a human, before the absence is asserted.
//
// 2. COMPOUND LINES. Three targets are not bare sleeps:
//       if (t) { await page.getByText(t).first().click(); await page.waitForTimeout(2000) }
//    Deleting that line removes a CLICK. Stripping the call out surgically is how
//    a codemod breaks a suite quietly. A transform that edits BY LINE must prove
//    the line is only what it thinks it is.
//
// 3. NO READ IN THE PREDICATE. Without an `await`, there is nothing to re-poll —
//    the value is already in hand and polling it spins on a constant.
//
// 4. NO `check()` IN THE WINDOW. Nothing to derive a predicate from.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const CENSUS = process.argv.includes('--census')
const NL = String.fromCharCode(10)

// ── classification, from source, every run ────────────────────────────────────
const ASSERTS = /\bcheck\s*\(|throw new Error|process\.exit\s*\(\s*1|\bexpect\s*\(/
const READS = /\.count\s*\(|\.innerText\s*\(|\.textContent\s*\(|\.inputValue\s*\(|isVisible\s*\(|\.allInnerTexts\s*\(|\.allTextContents\s*\(|svc\s*\.from\s*\(|\.evaluate\s*\(/
const SOLO_SLEEP = /^\s*await\s+[\w$.]+\.waitForTimeout\s*\(\s*[\d_]+\s*\)\s*;?\s*$/

// A predicate is NEGATIVE when becoming-true is the ABSENCE of something.
// Applied to the PREDICATE ONLY — never the message — because an earlier
// message-text heuristic flagged `check(/Add Contact/.test(body), '... not an
// inline field')`, whose predicate is plainly positive.
const NEGATIVE_PRED = [
  /[=!]==?\s*0\b/,          // === 0 / !== 0
  /<=?\s*\d/,               // <= 1 / < 3
  /!==/,                    // asserting a value is NOT something
  /(^|[^!=<>])!\s*[\w([/]/, // logical not: !x, !(x), !/re/
  /\.length\s*===?\s*0/,
]

const battery = new Set(
  (readFileSync('run-battery.mjs', 'utf8').match(/const SUITES\s*=\s*\[([\s\S]*?)\n\]/)?.[1] ?? '')
    .split(NL).map(l => l.match(/'([\w.-]+)'/)?.[1]).filter(Boolean)
    .map(n => (n.endsWith('.mjs') ? n : n + '.mjs')))

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

/** the check's message, for `what:` — often on the CONTINUATION line. */
function message(line, next) {
  for (const src of [line, line + ' ' + (next || '')]) {
    const m = src.match(/,\s*[`'"](.{0,70}?)[`'"]/)
    if (m) return m[1]
  }
  return null
}

const stats = { guard: 0, convenience: 0, converted: 0 }
const refused = { negative: [], compound: [], noRead: [], noCheck: [] }
const diffs = []

for (const file of readdirSync('.').filter(n => n.endsWith('.mjs')).sort()) {
  if (!battery.has(file)) continue
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, NL).split(NL)

  const sites = []
  lines.forEach((l, i) => { if (/waitForTimeout\s*\(/.test(l) && !/^\s*\/\//.test(l)) sites.push(i) })

  const work = []
  sites.forEach((idx, k) => {
    const stop = Math.min(sites[k + 1] ?? lines.length, idx + 14, lines.length)
    const win = lines.slice(idx + 1, stop).join(NL)
    if (!(ASSERTS.test(win) && READS.test(win))) { stats.convenience++; return }
    stats.guard++
    work.push(idx)
  })

  // descending, so earlier indices stay valid as we edit
  let touched = false
  for (const sleepIdx of [...work].sort((a, b) => b - a)) {
    const where = `${file}:${sleepIdx + 1}`
    const ms = Number((lines[sleepIdx].match(/waitForTimeout\s*\(\s*([\d_]+)/)?.[1] ?? '0').replace(/_/g, ''))

    if (!SOLO_SLEEP.test(lines[sleepIdx])) { refused.compound.push(where); continue }

    let chkIdx = -1
    for (let i = sleepIdx + 1; i < Math.min(sleepIdx + 8, lines.length); i++) {
      if (lines[i].includes('check(')) { chkIdx = i; break }
    }
    if (chkIdx < 0) { refused.noCheck.push(where); continue }

    const chkLine = lines[chkIdx]
    const pred = firstArg(chkLine, chkLine.indexOf('check('))
    if (!pred) { refused.noCheck.push(where); continue }
    if (NEGATIVE_PRED.some(re => re.test(pred))) { refused.negative.push(`${where}  ${pred.trim().slice(0, 78)}`); continue }
    if (!/\bawait\b/.test(pred)) { refused.noRead.push(where); continue }

    const what = (message(chkLine, lines[chkIdx + 1]) || 'the condition').replace(/'/g, '')
    const indent = (chkLine.match(/^\s*/) || [''])[0]
    const poll = `${indent}await waitUntil(async () => ${pred.trim()},${NL}` +
                 `${indent}  { timeout: 15000, what: '${what}' })`

    diffs.push({ file, line: sleepIdx + 1, ms, removed: lines[sleepIdx].trim(), added: poll })
    lines.splice(chkIdx, 0, ...poll.split(NL))
    lines.splice(sleepIdx, 1)
    touched = true
    stats.converted++
  }

  if (touched) {
    const impIdx = lines.findIndex(l => /from '\.\/pw-config\.mjs'/.test(l))
    if (impIdx < 0) { console.log(`!! ${file}: NO pw-config import — waitUntil would be undefined; SKIPPING FILE`); continue }
    if (!/\bwaitUntil\b/.test(lines[impIdx])) lines[impIdx] = lines[impIdx].replace(/\{\s*/, '{ waitUntil, ')
    if (APPLY) writeFileSync(file, lines.join(NL))
  }
}

if (!CENSUS) {
  for (const d of diffs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.log(`${NL}${d.file}:${d.line}  (${d.ms}ms)`)
    console.log(`  - ${d.removed}`)
    for (const l of d.added.split(NL)) console.log(`  + ${l.trim()}`)
  }
}

console.log(`${NL}${'='.repeat(66)}`)
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'} — battery suites only`)
console.log(`  guard sites found : ${stats.guard}   (convenience skipped: ${stats.convenience})`)
console.log(`  converted         : ${stats.converted}`)
console.log(`  REFUSED           : ${refused.negative.length} negative · ${refused.compound.length} compound · ` +
            `${refused.noRead.length} no-read · ${refused.noCheck.length} no-check`)
console.log(`${NL}REFUSED — negative predicates (a poll here returns on tick 1):`)
for (const r of refused.negative) console.log(`  ${r}`)
console.log(`${NL}REFUSED — compound lines (deleting would remove real code):`)
for (const r of refused.compound) console.log(`  ${r}`)
if (!APPLY) console.log(`${NL}Nothing was written. Re-run with --apply.`)
