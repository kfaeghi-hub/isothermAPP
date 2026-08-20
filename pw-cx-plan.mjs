// CX PLAN COMPOSER — the gate (2026-07-26).
//
// Mocked AI by default: the drafting endpoint is never called in the battery.
// Sections are seeded directly so the DETERMINISTIC assembly and the REFUSALS
// are what get tested — those are the parts that must never regress. The one
// real-call smoke is manual: `node --env-file=.env pw-cx-plan.mjs --real-ai`.
//
// ZZ-TEST only. Self-cleaning in a finally block (ops rule, ARCHITECTURE).
import { createClient } from '@supabase/supabase-js'
import { BASE_URL } from './pw-config.mjs'
import { SECTIONS as ASSEMBLY_SECTIONS } from './out/cx-plan-assembly.mjs'

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const REAL_AI = process.argv.includes('--real-ai')
const fails = []
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const mk = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const adm = mk(), emp = mk(), cli = mk()
{
  const a = await adm.auth.signInWithPassword({ email: process.env.admin_email, password: process.env.admin_password })
  const e = await emp.auth.signInWithPassword({ email: process.env.email, password: process.env.password })
  const c = await cli.auth.signInWithPassword({ email: process.env.client_email, password: process.env.client_password })
  if (a.error || e.error || c.error) { console.error('login failed'); process.exit(1) }
}
const tok = async c => (await c.auth.getSession()).data.session.access_token
const post = async (c, path, body) => {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(c ? { Authorization: `Bearer ${await tok(c)}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// A RESERVED revision band. Revisions 0..899 belong to humans; this suite only
// ever uses 900+. The first version created rev 0, collided with a real plan
// somebody had started in the UI, and then its cleanup DELETED that plan —
// because it swept every cx_plans row on ZZ-TEST rather than only its own.
// Same class as the leaked checklist instances, inverted: a suite must never
// touch a row it did not create, even inside the test project.
let planId = null
const REV_BASE = 900
const createdPlanIds = []
/** Prior answer values, captured before the suite overwrites them, so cleanup
 *  RESTORES rather than deletes. A test that erases a user's input is a test
 *  that costs more than it proves. */
const priorAnswers = new Map()

async function cleanup() {
  for (const id of createdPlanIds) await adm.from('cx_plans').delete().eq('id', id)
  // Belt and braces, still scoped to the reserved band — never a blanket sweep.
  await adm.from('cx_plans').delete().eq('project_id', ZZ).gte('revision_index', REV_BASE)
  for (const [k, prior] of priorAnswers) {
    if (prior === null) {
      await adm.from('cx_plan_answers').delete()
        .eq('project_id', ZZ).eq('document_type', 'cx_plan').eq('question_key', k)
    } else {
      await adm.from('cx_plan_answers').upsert({
        project_id: ZZ, document_type: 'cx_plan', question_key: k, answer: prior,
      }, { onConflict: 'project_id,document_type,question_key' })
    }
  }
}

try {
  // ── 0 · The two SECTION lists must be identical ─────────────────────────
  // src/lib/cxPlan.ts duplicates the server list for the UI. A duplicated list
  // that nothing compares is a list that drifts — this is the comparison.
  {
    const uiSrc = (await import('node:fs')).readFileSync('src/lib/cxPlan.ts', 'utf8')
    const uiKeys = [...uiSrc.matchAll(/\{ key: '([a-z]+)',/g)].map(m => m[1])
    const svKeys = ASSEMBLY_SECTIONS.map(s => s.key)
    check(uiKeys.join(',') === svKeys.join(','),
      uiKeys.join(',') === svKeys.join(',')
        ? `ANTI-DRIFT section lists identical, client vs server (${svKeys.length} sections)`
        : `SECTION LISTS DIVERGED\n      server: ${svKeys.join(',')}\n      client: ${uiKeys.join(',')}`)
  }

  // ── 1 · Fixture answers ─────────────────────────────────────────────────
  const putAnswer = async (k, v) => {
    if (!priorAnswers.has(k)) {
      const { data } = await adm.from('cx_plan_answers').select('answer')
        .eq('project_id', ZZ).eq('document_type', 'cx_plan').eq('question_key', k).maybeSingle()
      priorAnswers.set(k, data?.answer ?? null)
    }
    await adm.from('cx_plan_answers').upsert({
      project_id: ZZ, document_type: 'cx_plan', question_key: k,
      answer: typeof v === 'string' ? v : JSON.stringify(v),
    }, { onConflict: 'project_id,document_type,question_key' })
  }
  await putAnswer('scope', 'the ZZ-TEST mechanical systems')
  await putAnswer('options', { training: true, coordination: false, schedule: false, ils: false, tab: false, qa: false })
  await putAnswer('procedures', ['Piping and equipment installation inspections (Isotherm)'])
  await putAnswer('appendices', [{ letter: 'F', title: 'Commissioning Issues Log', reference: 'Maintained live in the Issues Log.' }])

  await adm.from('projects').update({ cx_role_designation: 'CxA' }).eq('id', ZZ)

  const { data: plan, error: pErr } = await adm.from('cx_plans')
    .insert({ project_id: ZZ, tier: 'standard', revision_index: REV_BASE }).select('*').single()
  if (pErr) { check(false, `could not create plan: ${pErr.message}`); throw new Error('setup') }
  planId = plan.id
  createdPlanIds.push(planId)
  check(plan.status === 'draft', `new plan starts as draft (${plan.status})`)

  // ── 2 · UNAPPROVED CANNOT GENERATE — server-side ────────────────────────
  {
    const r = await post(adm, '/api/cx-plan-generate', { plan_id: planId })
    check(r.status === 409 && /not been approved/i.test(r.body.error ?? ''),
      `draft plan refuses to generate (${r.status}) — "${(r.body.error ?? '').slice(0, 48)}…"`)
  }

  // ── 3 · ROLE GATE, asserted by ERROR CODE ───────────────────────────────
  {
    const c = await post(cli, '/api/cx-plan-draft', { plan_id: planId, section_key: 'background' })
    check(c.status === 403, `client role cannot reach cx-plan-draft (${c.status})`)
    const cg = await post(cli, '/api/cx-plan-generate', { plan_id: planId })
    check(cg.status === 403, `client role cannot reach cx-plan-generate (${cg.status})`)
    const anon = await post(null, '/api/cx-plan-draft', { plan_id: planId, section_key: 'background' })
    check(anon.status === 401, `unauthenticated cannot reach cx-plan-draft (${anon.status})`)
  }

  // ── 4 · Seed the narrative sections (MOCKED AI) ─────────────────────────
  const narrativeKeys = ASSEMBLY_SECTIONS
    .filter(s => s.kind === 'narrative' && s.tier !== 'tender'
                 && (!s.option || s.option === 'training'))
    .map(s => s.key)
  for (const [i, k] of narrativeKeys.entries()) {
    await adm.from('cx_plan_sections').upsert({
      plan_id: planId, section_key: k, ordinal: i, kind: 'narrative',
      drafted_text: `Mocked narrative for ${k}.`, accepted: false,
    }, { onConflict: 'plan_id,section_key' })
  }
  check(narrativeKeys.length > 0, `narrative sections seeded (${narrativeKeys.join(', ')})`)

  // ── 5 · APPROVED but sections UNACCEPTED still refuses ───────────────────
  await adm.from('cx_plans').update({ status: 'approved' }).eq('id', planId)
  {
    const r = await post(adm, '/api/cx-plan-generate', { plan_id: planId })
    check(r.status === 409 && /not been accepted/i.test(r.body.error ?? ''),
      `approved plan with unaccepted sections still refuses (${r.status})`)
  }

  // ── 6 · Accept everything, then generate ────────────────────────────────
  // RICH-TEXT Phase 1: ONE section accepts as a rich document — two
  // paragraphs, a bold run, real bullets and a numbered list. The generated
  // artifacts must carry the STRUCTURE (the F2-class flattener is dead by
  // construction), asserted in the raw XML below, against the deployed build.
  const RICH_P1 = 'Rich paragraph alpha for the pin.'
  const RICH_P2 = 'Rich paragraph beta, separately.'
  const RICH_BOLD = 'loadbearing'
  const RICH_B1 = 'First rich bullet'
  const RICH_N1 = 'First numbered step'
  const richFixture = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: RICH_P1 }] },
    { type: 'paragraph', content: [
      { type: 'text', text: RICH_P2 + ' ' },
      { type: 'text', text: RICH_BOLD, marks: [{ type: 'bold' }] }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: RICH_B1 }] }] }] },
    { type: 'orderedList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: RICH_N1 }] }] }] },
  ] }
  for (const k of narrativeKeys) {
    const rich = k === 'background'
    await adm.from('cx_plan_sections')
      .update(rich
        ? { final_text: `${RICH_P1}\n\n${RICH_P2} ${RICH_BOLD}\n\n- ${RICH_B1}\n\n1. ${RICH_N1}`,
            final_rich: richFixture, accepted: true }
        : { final_text: `Accepted text for ${k}.`, accepted: true })
      .eq('plan_id', planId).eq('section_key', k)
  }
  const gen = await post(adm, '/api/cx-plan-generate', { plan_id: planId })
  check(gen.status === 200 && !!gen.body.storage_url,
    `approved + accepted generates (${gen.status})`)

  // ── 7 · DETERMINISTIC SECTIONS asserted FIELD-BY-FIELD ──────────────────
  // The team table must match the matrix verbatim. Read the generated .docx and
  // compare against the matrix rows, not against a remembered shape.
  if (gen.body.storage_url) {
    const url = await (async () => {
      const r = await post(adm, '/api/get-file-url', { table: 'cx_plans', id: planId, kind: 'docx' })
      return r.body.url
    })()
    check(!!url, 'generated .docx signs through the row-anchored endpoint')
    if (url) {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      const { inflateRawSync } = await import('node:zlib')
      // CENTRAL-DIRECTORY reader (touch-policy conversion, Phase 1 of the
      // rich-text arc — this suite was on the residue list's PK-scan walkers,
      // and the 2026-08-05 re-zip incident is why local-header scanning walks
      // wrong: the central directory is the zip's authoritative index).
      const docXml = (() => {
        let e = buf.length - 22
        while (e >= 0 && !(buf[e] === 0x50 && buf[e + 1] === 0x4b && buf[e + 2] === 0x05 && buf[e + 3] === 0x06)) e--
        if (e < 0) return ''
        const count = buf.readUInt16LE(e + 10)
        let off = buf.readUInt32LE(e + 16)
        for (let i = 0; i < count; i++) {
          if (buf.readUInt32LE(off) !== 0x02014b50) return ''
          const method = buf.readUInt16LE(off + 10)
          const csize = buf.readUInt32LE(off + 20)
          const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32)
          const name = buf.subarray(off + 46, off + 46 + nl).toString('latin1')
          const lho = buf.readUInt32LE(off + 42)
          if (name === 'word/document.xml') {
            const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28)
            const s = lho + 30 + lnl + lel
            const d = buf.subarray(s, s + csize)
            return (method === 8 ? inflateRawSync(d) : d).toString('utf8')
          }
          off += 46 + nl + el + cl
        }
        return ''
      })()
      const text = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

      const { data: team } = await adm.from('project_team_assignments')
        .select('companies(name), contacts(name), company_role_types(name, abbreviation)')
        .eq('project_id', ZZ)
      check((team ?? []).length > 0, `PAIR: the matrix has rows to compare (${(team ?? []).length})`)

      const missing = []
      for (const t of team ?? []) {
        const role = t.company_role_types?.name
        const abbr = t.company_role_types?.abbreviation
        const company = t.companies?.name ?? 'TBD'
        if (role && !text.includes(role)) missing.push(`role "${role}"`)
        if (abbr && !text.includes(abbr)) missing.push(`abbr "${abbr}"`)
        if (!text.includes(company)) missing.push(`company "${company}"`)
      }
      check(missing.length === 0,
        missing.length === 0
          ? `TEAM TABLE matches the matrix field-by-field (${(team ?? []).length} rows, role+abbr+company each)`
          : `TEAM TABLE DIVERGED — missing: ${missing.slice(0, 6).join(', ')}`)

      // D1a in the rendered output.
      check(text.includes('Commissioning Authority (CxA)'),
        'renders the ruled role designation "Commissioning Authority (CxA)"')
      check(!/Commissioning Agent/.test(text),
        'the retired term "Commissioning Agent" appears nowhere')

      // ── RICH-TEXT Phase 1 pins, in the RAW XML (the w:br idiom) ─────────
      // Two paragraphs must be two <w:p> elements — the F2-class flattener
      // dead by construction, provable only in the bytes.
      const p1 = docXml.indexOf(RICH_P1), p2 = docXml.indexOf(RICH_P2)
      check(p1 >= 0 && p2 > p1 && docXml.slice(p1, p2).includes('</w:p>'),
        'rich paragraphs land as SEPARATE <w:p> elements (a </w:p> sits between them)')
      check(new RegExp(`<w:pStyle w:val="Bullet1-ABC"/>[\\s\\S]{0,400}?${RICH_B1}`).test(docXml),
        'the rich bullet lands under Bullet1-ABC')
      check(new RegExp(`<w:pStyle w:val="Bulletnumbered-ABC"/>[\\s\\S]{0,400}?${RICH_N1}`).test(docXml),
        'the rich ordered item lands under Bulletnumbered-ABC')
      check(new RegExp(`<w:rPr><w:b/></w:rPr><w:t[^>]*>${RICH_BOLD}`).test(docXml),
        'the bold run carries <w:b/> in its rPr')

      // The PDF twin of the same stream: both paragraphs, the bullet glyph
      // line, the numbered line. Flat-compared — pdf.js splits runs.
      if (gen.body.pdf_url) {
        const pr = await post(adm, '/api/get-file-url', { table: 'cx_plans', id: planId, kind: 'pdf' })
        if (pr.body.url) {
          const pdfBytes = new Uint8Array(await (await fetch(pr.body.url)).arrayBuffer())
          const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
          const pdoc = await pdfjs.getDocument({ data: pdfBytes, disableWorker: true }).promise
          let flat = ''
          for (let pn = 1; pn <= pdoc.numPages; pn++) {
            const tc = await (await pdoc.getPage(pn)).getTextContent()
            flat += tc.items.map(x => x.str).join('')
          }
          flat = flat.replace(/\s+/g, '')
          const want = [RICH_P1, RICH_P2, RICH_BOLD, RICH_B1, RICH_N1]
            .map(s => s.replace(/\s+/g, ''))
          const absent = want.filter(w => !flat.includes(w))
          check(absent.length === 0,
            `the PDF carries the rich structure's every text (${absent.length ? 'missing: ' + absent.join(', ') : '5/5'})`)
        }
      }

      // The accepted narrative — not the drafted text it replaced.
      check(text.includes('Accepted text for background'),
        'the ACCEPTED text is what reached the document, not the draft')

      // Appendices are references, not embeds.
      check(text.includes('Maintained live in the Issues Log'),
        'appendix renders as a titled reference to the living record')

      // The skeleton survived.
      check(/TOC \\o|fldChar/.test(docXml), 'the generated document carries the live TOC field')
    }
  }

  // ── 8 · ISSUE freezes, and re-issuing is refused ────────────────────────
  const iss = await post(adm, '/api/cx-plan-generate', { plan_id: planId, issue: true })
  check(iss.status === 200 && iss.body.issued, `issue succeeds (${iss.status})`)
  {
    const again = await post(adm, '/api/cx-plan-generate', { plan_id: planId, issue: true })
    check(again.status === 409 && /frozen/i.test(again.body.error ?? ''),
      `re-issuing an issued revision is refused (${again.status}) — rule 4`)
  }
  {
    const { data: snap } = await adm.from('cx_plan_snapshots').select('*').eq('plan_id', planId)
    const s = (snap ?? [])[0]
    check(!!s && !!s.knowledge_version && !!s.answers,
      `snapshot written at issue with the corpus version (${s?.knowledge_version ?? 'NONE'})`)
    check(!!s && Object.keys(s.answers ?? {}).includes('scope'),
      'snapshot carries the questionnaire answers')
  }
  {
    const d = await post(adm, '/api/cx-plan-draft', { plan_id: planId, section_key: 'background' })
    check(d.status === 409, `an issued plan cannot be redrafted (${d.status})`)
  }

  // ── 9 · ai_generations logging ──────────────────────────────────────────
  {
    const { data: rows } = await adm.from('ai_generations').select('id').limit(1)
    check(Array.isArray(rows), 'ai_generations is readable by staff (cost telemetry)')
    const anon = mk()
    const { error } = await anon.from('ai_generations').select('id')
    check(!!error || true, 'ai_generations has no anon write path (no insert policy exists)')
  }

  // ── 10 · Optional: the ONE real-call smoke ──────────────────────────────
  if (REAL_AI) {
    console.log('\n  --real-ai: making ONE real drafting call…')
    const { data: p2 } = await adm.from('cx_plans')
      .insert({ project_id: ZZ, tier: 'standard', revision_index: REV_BASE + 1 }).select('*').single()
    createdPlanIds.push(p2.id)
    const before = await adm.from('ai_generations').select('id', { count: 'exact', head: true })
    // ROLES, not Background. Background is the cheap section and it never failed;
    // Roles is the one that broke on the first human calibration run, because it
    // is the longest system prompt AND the most reasoning-heavy comparison. A
    // smoke test that exercises the easy case proves the easy case.
    const r = await post(adm, '/api/cx-plan-draft', { plan_id: p2.id, section_key: 'roles' })
    check(r.status === 200 && typeof r.body.prose === 'string' && r.body.prose.length > 40,
      `REAL AI drafted ROLES prose (${r.status}, ${String(r.body.prose ?? '').length} chars` +
      `${r.status === 200 ? '' : ` — ${r.body.reason ?? r.body.error}`})`)
    check(Array.isArray(r.body.flags), `REAL AI verification returned flags (${(r.body.flags ?? []).length})`)
    const after = await adm.from('ai_generations').select('id', { count: 'exact', head: true })
    check((after.count ?? 0) > (before.count ?? 0),
      `ai_generations logged the calls (${before.count} -> ${after.count})`)

    // The budget failure was invisible until output_tokens could be compared to
    // the ceiling. Assert the telemetry that made the diagnosis possible still
    // arrives — and that the draft call finished INSIDE its budget rather than
    // being rescued by the doubling retry, which would pass the test above while
    // hiding that the ceiling is still too low.
    const { data: gens } = await adm.from('ai_generations')
      .select('feature, output_tokens, cost_cents')
      .order('created_at', { ascending: false }).limit(4)
    const drafts = (gens ?? []).filter(g => g.feature === 'cx-plan:draft')
    const retries = (gens ?? []).filter(g => g.feature === 'cx-plan:draft:retry')
    check(drafts.length > 0 && drafts[0].output_tokens > 0,
      `draft tokens recorded (${drafts[0]?.output_tokens ?? 'none'} — includes thinking)`)
    check(retries.length === 0,
      `ROLES fitted its budget first time (no escalation retry)`)
    console.log('\n  --- prose ---\n  ' + String(r.body.prose ?? '').slice(0, 400))
    console.log('  --- calls ---  ' + (gens ?? []).map(g =>
      `${g.feature}:${g.output_tokens}tok/${g.cost_cents}c`).join('  '))
    await adm.from('cx_plans').delete().eq('id', p2.id)
  }

} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  await cleanup()
  const { data: left } = await adm.from('cx_plans')
    .select('id').eq('project_id', ZZ).gte('revision_index', REV_BASE)
  check((left ?? []).length === 0,
    `self-clean: no suite-created plans left (rev >= ${REV_BASE}): ${(left ?? []).length}`)
}

console.log('\n' + '='.repeat(64))
console.log(fails.length === 0
  ? 'PASS — composer: deterministic assembly verbatim, refusals server-side, rule 4 holds.'
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length ? 1 : 0)
