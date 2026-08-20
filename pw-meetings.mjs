// Meeting Minutes — full-flow verification (ZZ-TEST only, self-cleaning):
//   topic seeding from the type skeleton · matrix-attributed attendee + items ·
//   document content (title, bands, action summary grouping, disclaimer, No-items row) ·
//   carry-forward with ORIGINAL number retention · close-carried-item isolation.
//
// Run: PW_BASE_URL=https://isotherm-app.vercel.app node --env-file=.env pw-meetings.mjs
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { inflateRawSync } from 'node:zlib'
import { waitUntil, login, openTestProject, credentials, signedFileUrl } from './pw-config.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'

const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

function docxXml(buf) {
  let i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const m = buf.readUInt16LE(i + 8), cs = buf.readUInt32LE(i + 18)
    const nl = buf.readUInt16LE(i + 26), el = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nl).toString('latin1')
    const s = i + 30 + nl + el
    if (name === 'word/document.xml' && cs > 0) {
      const d = buf.subarray(s, s + cs)
      return (m === 8 ? inflateRawSync(d) : d).toString('utf8')
    }
    i = s + (cs || 1)
  }
  return ''
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
// Admin client for privileged cleanup only (issued meetings are frozen for employees).
const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })

// Pre-clean any leftovers from a failed prior run (admin — may include issued meetings)
{
  const { data } = await adm.from('meetings').delete().eq('project_id', ZZ).select('id')
  if (data?.length) console.log(`pre-clean: removed ${data.length} leftover meeting(s)`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 1000 })
const modal = page.locator('div.fixed.inset-0')

const itemRow = (num) =>
  page.locator('tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${num.replace('.', '\\.')}$`) }) })
// A carried item renders its FROZEN origin-qualified number, one form
// everywhere: "↺ #1 · 1.1" (ruled 2026-08-17).
const carriedRow = (origin, num) =>
  page.locator('tr').filter({ has: page.locator('td', { hasText: new RegExp(`^↺ #${origin} · ${num.replace('.', '\\.')}$`) }) })

try {
  await login(page)
  await openTestProject(page)
  await page.getByRole('button', { name: 'Meetings', exact: true }).click()
  await page.waitForTimeout(1500)

  // ── Meeting #1: Recurring Cx Meeting, topics seeded from skeleton ────────
  await page.getByRole('button', { name: '+ New Meeting' }).first().click()
  await page.waitForTimeout(600)
  await modal.locator('select').first().selectOption({ label: 'Recurring Cx Meeting' })
  await waitUntil(async () => await modal.locator('input[type="number"]').inputValue() === '1',
    { timeout: 15000, what: 'meeting number auto-suggested as 1' })
  check(await modal.locator('input[type="number"]').inputValue() === '1', 'meeting number auto-suggested as 1')
  await modal.getByRole('button', { name: 'Create Meeting' }).click()

  for (const t of ['Review of Previous Minutes', 'Checklist (PFC) Status', 'Issues Log Review', 'Next Meeting']) {
    await waitUntil(async () => await page.locator(`input[value="${t}"]`).count() === 1,
      { timeout: 15000, what: 'topic seeded: ${t}' })
    check(await page.locator(`input[value="${t}"]`).count() === 1, `topic seeded: ${t}`)
  }
  const { data: t1 } = await sb.from('meeting_topics').select('id', { count: 'exact' })
    .eq('meeting_id', (await sb.from('meetings').select('id').eq('project_id', ZZ).single()).data.id)
  check((t1 ?? []).length === 11, `all 11 Recurring topics copied (got ${(t1 ?? []).length})`)

  // ── Attendee from directory: matrix member surfaces first, role auto ─────
  await page.locator('[data-testid="add-attendee"]').click()
  await waitUntil(async () => await modal.getByText('Project team').count() === 1,
    { timeout: 15000, what: 'attendee picker: Project team group first' })
  check(await modal.getByText('Project team').count() === 1, 'attendee picker: Project team group first')
  const rayRow = modal.getByRole('button').filter({ hasText: 'Ray Scheepstra' }).first()
  // The group HEADER arriving is not every ROW's role chip arriving — the chips
  // come from the matrix join. Own anchor, per the law.
  await waitUntil(async () => await rayRow.getByText('BAS', { exact: true }).count() === 1,
    { timeout: 15000, what: 'the matrix role chip on the picker row' })
  check(await rayRow.getByText('BAS', { exact: true }).count() === 1, 'matrix member shows auto role chip (BAS)')
  await rayRow.click()
  await waitUntil(async () => await page.locator('input[value="BAS"]').count() >= 1,
    { timeout: 15000, what: 'attendee role auto-attributed from the matrix' })
  check(await page.locator('input[value="BAS"]').count() >= 1, 'attendee role auto-attributed from the matrix')

  // ── Items: one matrix-attributed, one free-text, numbers 1.1 / 1.2 ───────
  await page.locator('[data-testid="add-item-0"]').click({ force: true })
  await waitUntil(async () => await itemRow('1.1').count() === 1,
    { timeout: 15000, what: 'first item numbered 1.1' })
  check(await itemRow('1.1').count() === 1, 'first item numbered 1.1')
  await itemRow('1.1').locator('textarea').fill('BAS graphics review outstanding for AHU floors')
  await itemRow('1.1').locator('textarea').press('Tab')
  await page.waitForTimeout(600)
  await itemRow('1.1').locator('select').first().selectOption({ label: 'BAS — Automated Logic Controls' })
  await page.waitForTimeout(600)

  // REVERSED 2026-08-17 (old text: 'second item numbered 1.2' — the global
  // counter's second stamp). add-item-1 targets SECTION 2, so it derives 2.1.
  await page.locator('[data-testid="add-item-1"]').click({ force: true })
  await waitUntil(async () => await itemRow('2.1').count() === 1,
    { timeout: 15000, what: 'item under section 2 deriving 2.1' })
  check(await itemRow('2.1').count() === 1, 'second item derives 2.1 — its section, not the global counter')
  await itemRow('2.1').locator('textarea').fill('Revised construction schedule to be circulated')
  await itemRow('2.1').locator('textarea').press('Tab')
  await page.waitForTimeout(600)
  await itemRow('2.1').locator('select').first().selectOption('__text')
  await page.waitForTimeout(300)
  await itemRow('2.1').locator('input[placeholder="responsible"]').fill('GC — site office')
  await itemRow('2.1').locator('input[placeholder="responsible"]').press('Tab')
  await page.waitForTimeout(600)

  // ── Generate + document content ──────────────────────────────────────────
  await page.locator('[data-testid="generate-minutes"]').click()

  // ── INSTRUMENTED, because a fixed sleep cannot tell slow from broken ───────
  //
  // This was `waitForTimeout(25000)` and then three assertions. Under a full
  // battery it failed three times with `issued_at` unset and the file 404 — and
  // passed every time the suite ran alone. A blind sleep reports the same failure
  // whether generation took 26 seconds or never happened, which is the difference
  // that matters: LATE is a load story, NEVER is a production defect where a user
  // gets a meeting row with no minutes.
  //
  // So: poll, and NAME THE OUTCOME. Reaching the deadline is a failure, not a
  // shrug — the same contract as assertSettled.
  const genT0 = Date.now()
  const GEN_DEADLINE = 90_000
  let mtg1 = null
  while (Date.now() - genT0 < GEN_DEADLINE) {
    const { data } = await sb.from('meetings').select('id, storage_url, issued_at').eq('project_id', ZZ).single()
    if (data?.storage_url && data?.issued_at) { mtg1 = data; break }
    mtg1 = data
    await new Promise(r => setTimeout(r, 500))
  }
  const genMs = Date.now() - genT0
  if (mtg1?.storage_url && mtg1?.issued_at) {
    console.log(`  [GENERATION] appeared-after-${genMs}ms`)
  } else {
    console.log(`  [GENERATION] never-appeared-within-${GEN_DEADLINE}ms ` +
      `(issued_at=${mtg1?.issued_at ?? 'null'}, storage_url=${mtg1?.storage_url ?? 'null'}) ` +
      `— the endpoint did not finish; this is NOT a slow write`)
  }
  // THE DATABASE ROW UPDATING IS NOT THE BADGE RE-RENDERING. The poll above
  // proves the WRITE (issued_at + storage_url in the row); the ISSUED badge is
  // the UI's own refetch, arriving on its own schedule. N7 failed exactly here —
  // generation DONE in 4975ms, badge not yet painted — the reversed sweep's
  // mechanism, in the suite that taught it: this check was riding on the old
  // 25s sleep's surplus, not on the thing the sleep claimed to wait for.
  await waitUntil(async () => await page.getByText('ISSUED').count() >= 1,
    { timeout: 15000, what: 'the ISSUED badge rendering after the write' })
  check(await page.getByText('ISSUED').count() >= 1, `meeting flips to ISSUED (generation ${genMs}ms)`)
  check(!!mtg1?.issued_at, 'issued_at stamped')
  // storage_url is a bucket-relative path (storage privacy pass) — sign to fetch.
  const docxUrl = await signedFileUrl(credentials(), { table: 'meetings', id: mtg1.id, kind: 'docx' })
  const docx = Buffer.from(await (await fetch(docxUrl)).arrayBuffer())
  const txt = docxXml(docx).replace(/<[^>]+>/g, ' ')
  check(txt.includes('MEETING MINUTES — Recurring Cx Meeting #1'), 'doc: title line')
  check(txt.includes('REVIEW OF PREVIOUS MINUTES'), 'doc: navy topic band (uppercase)')
  check(txt.includes('1.1') && txt.includes('BAS graphics review outstanding'), 'doc: item 1.1 with discussion')
  check(txt.includes('BAS — Automated Logic Controls'), 'doc: matrix-attributed responsible renders')
  check(txt.includes('GC — site office'), 'doc: free-text responsible renders')
  check(txt.includes('Action Summary by Responsible Party'), 'doc: action summary section')
  check(/BAS — Automated Logic Controls — 1\.1/.test(txt), 'doc: action summary grouped by responsible with item numbers')
  check(txt.includes('No items — reviewed, nothing arising.'), 'doc: empty topics render the muted No-items row')
  check(txt.includes('within seven (7) days of issue'), 'doc: 7-day disclaimer')

  // ── Meeting #2: carry-forward, number retention ──────────────────────────
  await page.getByRole('button', { name: '+ New Meeting' }).first().click()
  await page.waitForTimeout(600)
  await modal.locator('select').first().selectOption({ label: 'Recurring Cx Meeting' })
  await waitUntil(async () => await modal.locator('input[type="number"]').inputValue() === '2',
    { timeout: 15000, what: 'meeting number auto-suggested as 2' })
  check(await modal.locator('input[type="number"]').inputValue() === '2', 'meeting number auto-suggested as 2')
  // The number arriving is not the carry-forward computation arriving — own anchor.
  await waitUntil(async () => await modal.locator('label', { hasText: 'Carry forward' }).count() === 1,
    { timeout: 15000, what: 'the carry-forward offer in the create modal' })
  const carryText = await modal.locator('label', { hasText: 'Carry forward' }).innerText().catch(() => '')
  check(/Carry forward\s+2\s+open items/.test(carryText), `carry-forward offered with count (got: ${carryText.split('\n')[0]})`)
  await modal.getByRole('button', { name: 'Create Meeting' }).click()

  // ── REVERSED 2026-08-17 (old text quoted per the house protocol). This leg
  // asserted: "RETENTION: item 1.1 keeps its number in meeting #2" — the
  // construction convention that a carried item's number NEVER CHANGES, stamped
  // verbatim on carry. The convention reversed with section-scoped derived
  // numbering: a carried item's number is now FROZEN AND ORIGIN-QUALIFIED
  // ("#1 · 1.1"), because derived numbers are only unique within their meeting
  // — "1.1" exists in every meeting with a first section, so a frozen number
  // must name the meeting it came from to keep the cross-meeting traceability
  // the convention existed for. A NATIVE item's number derives and may shift
  // when structure shifts; a carried item's frozen number never changes.
  await waitUntil(async () => await carriedRow(1, '1.1').count() === 1,
    { timeout: 15000, what: 'carried item renders frozen origin-qualified: ↺ #1 · 1.1' })
  check(await carriedRow(1, '1.1').count() === 1, 'carried item renders ↺ #1 · 1.1 — frozen, origin named')
  await waitUntil(async () => await carriedRow(1, '2.1').count() === 1,
    { timeout: 15000, what: 'second carried item: ↺ #1 · 2.1' })
  check(await carriedRow(1, '2.1').count() === 1, 'second carried item renders ↺ #1 · 2.1 (its origin-derived number)')
  // THE ROWS PAINTING IS NOT THE CARRY BEING CONFIRMED. The rows render
  // optimistically; the ↺ marker arrives with the server's response, and acting
  // on the view before then hands clicks to mid-reconciliation UI (the 2.1
  // add-item went nowhere in the first anchored run — force:true clicked
  // through a view that was still settling; the old 3000ms had been paying for
  // the round-trip). The marker IS the settled signal, so it anchors both its
  // own check and every action after it.
  await waitUntil(async () => await carriedRow(1, '1.1').count() === 1,
    { timeout: 15000, what: 'the carried render settling (server-confirmed)' })

  // ── REVERSED 2026-08-17 (old text quoted): this leg asserted "new item in
  // meeting #2 numbered 2.1" — the meeting-number-prefixed global counter.
  // Now sections scope numbering: a native item under section N derives N.k,
  // counting NATIVE items only — carried items do not consume native positions.
  await page.locator('[data-testid="add-item-0"]').click({ force: true })
  await waitUntil(async () => await itemRow('1.1').count() === 1,
    { timeout: 15000, what: 'native item under section 1 deriving 1.1' })
  check(await itemRow('1.1').count() === 1, 'native item in #2 section 1 derives 1.1 — carried items excluded from the count')

  // ── the ruled derivation legs (failing-first against the old scheme) ──────
  // three sections → 3.1 / 4.1 / 5.1
  for (const [ti, num] of [[2, '3.1'], [3, '4.1'], [4, '5.1']]) {
    await page.locator(`[data-testid="add-item-${ti}"]`).click({ force: true })
    await waitUntil(async () => await itemRow(num).count() === 1,
      { timeout: 15000, what: `item under section ${ti + 1} deriving ${num}` })
    check(await itemRow(num).count() === 1, `item under section ${ti + 1} derives ${num}`)
  }
  await itemRow('3.1').locator('textarea').first().fill('First item under PFC status')
  await itemRow('3.1').locator('textarea').first().press('Tab')

  // delete → the successor closes the gap
  await page.locator('[data-testid="add-item-2"]').click({ force: true })
  await waitUntil(async () => await itemRow('3.2').count() === 1,
    { timeout: 15000, what: 'second item under section 3 deriving 3.2' })
  await itemRow('3.2').locator('textarea').first().fill('Successor item - should become 3.1')
  await itemRow('3.2').locator('textarea').first().press('Tab')
  // ANCHOR THE BLUR-SAVE BEFORE CLICKING ANYTHING: the Tab fires updateItem →
  // fetchDetail → re-render, and a click resolved before that settles lands on
  // coordinates that may belong to a DIFFERENT row after the shift — the first
  // run of this leg deleted the SUCCESSOR that way (the suite's own
  // optimistic-paint lesson, ignored by its author until it bit).
  await waitUntil(async () => {
    const { data } = await sb.from('meeting_items')
      .select('id').ilike('discussion', 'Successor item%')
    return (data ?? []).length === 1
  }, { timeout: 15000, what: 'the successor text landing (blur-save settled)' })
  // The delete × is the row's LAST cell — a bare hasText '×' can resolve to
  // another × in the row. Anchor the ARRIVAL of the delete in the database
  // (one item left under the section), then read the re-derived UI.
  await itemRow('3.1').hover()
  await itemRow('3.1').locator('td:last-child button', { hasText: '×' }).click({ force: true })
  {
    const { data: mtg2x } = await sb.from('meetings')
      .select('id').eq('project_id', ZZ).order('meeting_number', { ascending: false }).limit(1).single()
    const { data: sec3topic } = await sb.from('meeting_topics')
      .select('id').eq('meeting_id', mtg2x.id).eq('sort_order', 2).single()
    await waitUntil(async () => {
      const { count } = await sb.from('meeting_items')
        .select('*', { count: 'exact', head: true }).eq('topic_id', sec3topic.id)
      return count === 1
    }, { timeout: 15000, what: 'the delete landing (one item left under section 3)' })
  }
  // The discussion lives in a TEXTAREA — its value is a DOM property, invisible
  // to innerText, so a text-grep on the row can never see it (this wait was
  // instrument-blind at birth; the probe showed the right DB state under a
  // "failing" UI read). Read the value property.
  await waitUntil(async () => {
    const v = await itemRow('3.1').locator('textarea').first().inputValue().catch(() => '')
    return v.includes('Successor item')
  }, { timeout: 15000, what: 'the successor closing the gap to 3.1' })
  check((await itemRow('3.1').locator('textarea').first().inputValue()).includes('Successor item'),
    'delete: the successor closes the gap — the surviving item now derives 3.1')

  // cross-section move → BOTH sections re-derive. The UI has no move control;
  // a move is a structural write (topic_id), and derivation must follow
  // structure regardless of which surface moved it.
  {
    const { data: mtg2 } = await sb.from('meetings')
      .select('id').eq('project_id', ZZ).order('meeting_number', { ascending: false }).limit(1).single()
    const { data: t2topics } = await sb.from('meeting_topics')
      .select('id, sort_order').eq('meeting_id', mtg2.id).order('sort_order')
    const { data: t2items } = await sb.from('meeting_items')
      .select('id, topic_id').eq('meeting_id', mtg2.id).order('sort_order')
    const sec4 = t2topics.find(t => t.sort_order === 3)   // displays as section 4
    const sec6 = t2topics.find(t => t.sort_order === 5)   // displays as section 6
    const item41 = t2items.find(i => i.topic_id === sec4?.id)
    await sb.from('meeting_items').update({ topic_id: sec6.id }).eq('id', item41.id)
    // reload drops selectedId — re-open meeting #2 from the list before reading
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Meetings', exact: true }).click()
    await page.locator('button', { hasText: '#2' }).first().click()
    await waitUntil(async () => await itemRow('6.1').count() === 1,
      { timeout: 15000, what: 'the moved item re-deriving as 6.1' })
    check(await itemRow('6.1').count() === 1, 'cross-section move: the item re-derives in its new section (6.1)')
    check(await itemRow('4.1').count() === 0, 'and the old section re-derives too — 4.1 is gone, not orphaned')
  }

  // ── Close-carried-item isolation ─────────────────────────────────────────
  //
  // AN ISOLATION CHECK IS A NEGATIVE IN DISGUISE: "meeting #1 unchanged" is
  // already true before the close lands, so a fixed sleep here was betting the
  // write had arrived — and polling #1 directly would pass on tick 1. (This
  // site also slipped the converter's census: its DB client is named `sb`, and
  // the READS pattern only knew `svc.from` — instrument-blindness in the
  // classifier itself; pattern generalized the same day.) The sound shape is
  // the house one: anchor the ARRIVAL of the close on MEETING #2's copy, then
  // assert meeting #1's copy did not move.
  // (native items store item_number '' now — the carried copy is found by its
  //  FROZEN stored number; the #1 original by its discussion)
  await carriedRow(1, '1.1').locator('select').nth(1).selectOption('closed')
  const { data: mtg2row } = await sb.from('meetings')
    .select('id').eq('project_id', ZZ).neq('id', mtg1.id).single()
  await waitUntil(async () => {
    const { data } = await sb.from('meeting_items')
      .select('status').eq('meeting_id', mtg2row.id).eq('item_number', '#1 · 1.1').single()
    return data?.status === 'closed'
  }, { timeout: 15000, what: 'the close landing on meeting #2’s carried copy' })
  const { data: m1items } = await sb.from('meeting_items')
    .select('discussion, status').eq('meeting_id', mtg1.id)
  const orig11 = (m1items ?? []).find(i => (i.discussion ?? '').includes('BAS graphics review'))
  check(orig11?.status === 'open', 'ISOLATION: closing the carried copy in #2 leaves #1 frozen (still open)')

  // ── Meeting #2 document: both formats derive from the same source, so the
  //    docx text is the assertion surface — derived native numbers AND the
  //    frozen origin-qualified carried form must both appear.
  await page.locator('[data-testid="generate-minutes"]').click()
  const gen2T0 = Date.now()
  let mtg2gen = null
  while (Date.now() - gen2T0 < 90_000) {
    const { data } = await sb.from('meetings').select('id, storage_url, issued_at')
      .eq('id', mtg2row.id).single()
    if (data?.storage_url && data?.issued_at) { mtg2gen = data; break }
    await new Promise(r => setTimeout(r, 500))
  }
  check(!!mtg2gen, 'meeting #2 generated')
  if (mtg2gen) {
    const url2 = await signedFileUrl(credentials(), { table: 'meetings', id: mtg2row.id, kind: 'docx' })
    const txt2 = docxXml(Buffer.from(await (await fetch(url2)).arrayBuffer())).replace(/<[^>]+>/g, ' ')
    check(txt2.includes('#1 · 1.1'), 'doc: carried item renders its frozen origin-qualified number (#1 · 1.1)')
    check(txt2.includes('Successor item'), 'doc: the gap-closing item is present')
    check(/3\.1/.test(txt2), 'doc: derived section numbers render (3.1)')
  }

  // ── F1/F2 (2026-08-19): shared responsibility + the honored newline ──────
  {
    // the native item in #2 section 1, created above with no parties yet
    const { data: nat } = await sb.from('meeting_items')
      .select('id').eq('meeting_id', mtg2row.id).is('carried_from_item_id', null)
      .order('created_at').limit(1).single()

    // two parties: a matrix seat + a free-text name, via the SAME add control
    await itemRow('1.1').locator('select').first().selectOption({ label: 'BAS — Automated Logic Controls' })
    await waitUntil(async () => {
      const { count } = await sb.from('meeting_item_responsibles')
        .select('*', { count: 'exact', head: true }).eq('item_id', nat.id)
      return count === 1
    }, { timeout: 15000, what: 'the first party landing in the junction' })
    await itemRow('1.1').locator('select').first().selectOption('__text')
    await itemRow('1.1').locator('input[placeholder="responsible"]').fill('Dialogue Architects')
    await itemRow('1.1').locator('input[placeholder="responsible"]').press('Tab')
    await waitUntil(async () => {
      const { count } = await sb.from('meeting_item_responsibles')
        .select('*', { count: 'exact', head: true }).eq('item_id', nat.id)
      return count === 2
    }, { timeout: 15000, what: 'the second party landing' })
    check(true, 'F1: two parties added through one control (seat + free text)')
    await waitUntil(async () => (await itemRow('1.1').innerText().catch(() => '')).includes('Dialogue Architects'),
      { timeout: 15000, what: 'both party chips rendering' })
    const rowTxt = await itemRow('1.1').innerText()
    check(rowTxt.includes('BAS — Automated Logic Controls') && rowTxt.includes('Dialogue Architects'),
      'F1: both chips render on the row')

    // F2 shell: the expanded editor edits the same draft; newlines persist
    await itemRow('1.1').hover()
    await page.locator(`[data-testid="expand-item-${nat.id}"]`).click({ force: true })
    await waitUntil(async () => await page.locator('[data-testid="expanded-editor"]').count() === 1,
      { timeout: 15000, what: 'the full-size editor opening' })
    await page.locator('[data-testid="expanded-editor"]').fill('Coordinate envelope review\nDialogue to provide comments')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await waitUntil(async () => {
      const { data } = await sb.from('meeting_items').select('discussion').eq('id', nat.id).single()
      return (data?.discussion ?? '').includes(String.fromCharCode(10))
    }, { timeout: 15000, what: 'the newline persisting through the modal commit' })
    check(true, 'F2: the expanded editor commits multi-line text through the same draft path')

    // regenerate #2: both parties stack in the docx; the newline is a real <w:br>
    await page.locator('[data-testid="generate-minutes"]').click()
    const g3 = Date.now()
    let m2b = null
    while (Date.now() - g3 < 90_000) {
      const { data } = await sb.from('meetings').select('storage_url, issued_at, id').eq('id', mtg2row.id).single()
      if (data?.storage_url && data?.issued_at) { m2b = data; break }
      await new Promise(r => setTimeout(r, 500))
    }
    check(!!m2b, 'meeting #2 regenerated with parties + newline')
    const url3 = await signedFileUrl(credentials(), { table: 'meetings', id: mtg2row.id, kind: 'docx' })
    const xml3 = docxXml(Buffer.from(await (await fetch(url3)).arrayBuffer()))
    const txt3 = xml3.replace(/<[^>]+>/g, ' ')
    check(txt3.includes('BAS — Automated Logic Controls') && txt3.includes('Dialogue Architects'),
      'doc: BOTH parties render in the responsible column (stacked, never squeezed)')
    check(xml3.includes('<w:br'),
      'doc: the typed newline is a REAL line break in the docx (w:br), not a flattened space')
    check(txt3.includes('Coordinate envelope review') && txt3.includes('Dialogue to provide comments'),
      'doc: both lines of the multi-line discussion render')

    // carry-forward preserves ALL parties: meeting #3
    await page.getByRole('button', { name: '+ New Meeting' }).first().click()
    await page.waitForTimeout(600)
    await modal.locator('select').first().selectOption({ label: 'Recurring Cx Meeting' })
    await waitUntil(async () => await modal.locator('input[type="number"]').inputValue() === '3',
      { timeout: 15000, what: 'meeting number auto-suggested as 3' })
    await modal.getByRole('button', { name: 'Create Meeting' }).click()
    await waitUntil(async () => {
      const { data: m3 } = await sb.from('meetings').select('id').eq('project_id', ZZ)
        .eq('meeting_number', 3).maybeSingle()
      if (!m3) return false
      const { data: c } = await sb.from('meeting_items').select('id')
        .eq('meeting_id', m3.id).eq('carried_from_item_id', nat.id).maybeSingle()
      if (!c) return false
      const { count } = await sb.from('meeting_item_responsibles')
        .select('*', { count: 'exact', head: true }).eq('item_id', c.id)
      return count === 2
    }, { timeout: 30000, what: 'the carried copy arriving with BOTH parties' })
    check(true, 'F1: carry-forward preserves all responsible parties (junction copied whole)')
  }

  // ── Self-clean via ADMIN (issued meeting #1 is a frozen record for employees —
  // its delete correctly requires owner rights under access control) ─────────
  await adm.from('meetings').delete().eq('project_id', ZZ)
  const { data: left } = await adm.from('meetings').select('id').eq('project_id', ZZ)
  check((left ?? []).length === 0, 'self-clean: no meetings left on ZZ-TEST')
} catch (err) {
  check(false, `unexpected: ${err.message}`)
  await page.screenshot({ path: 'out/pw-meetings-fail.png', fullPage: true }).catch(() => {})
  // best-effort DB clean
  await adm.from('meetings').delete().eq('project_id', ZZ)
}

await browser.close()
console.log('\n' + '='.repeat(60))
console.log(fails.length === 0 ? 'PASS — meeting minutes verified end-to-end.' : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
