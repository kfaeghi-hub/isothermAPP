// pw-report-photos — a seeded finding photo REACHES BOTH DOCUMENTS.
// [RIVET] 2026-08-22, the docx-images pin.
//
// THE DEFECT THIS PINS: html-to-docx SILENTLY DROPS an image inside a nested
// table — no error, successful write, zero word/media. `96b2060` (2026-06-25,
// "photo grid layout") moved the docx photo block from paragraphs into a
// 2-per-row table, and every report docx since shipped WITHOUT ITS PHOTOS.
// Two months latent; invisible only because no production finding had a photo
// yet. Nothing could have caught it: pw-report-regen compares visible TEXT
// with tags stripped (an image is not text), pdf-boundary-gate reads page
// boundaries, and the row-count guard counts rows. No gate had ever asserted
// that a generated docx CONTAINS AN IMAGE. This one does.
//
// Asserted, per the ruling:
//   · PREMISE — the seeded photo's object really is in the bucket (a gate
//     that "proves" an absent image is asserting nothing).
//   · DOCX — word/media/ non-empty AND <w:drawing> >= 1.
//   · PDF — /Subtype /Image present (the PDF was always right; the twin keeps
//     it that way for free).
//
// ZZ-TEST only, seeded and self-cleaning both directions (DB rows and the
// storage object), resting state printed.
import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'
import { adminCredentials, BASE_URL } from './pw-config.mjs'
import { assertHarnessFree } from './harness-lock.mjs'
assertHarnessFree('pw-report-photos')

let pass = 0
const fails = []
const check = (ok, what) => { ok ? pass++ : fails.push(what); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`) }

const ZZ = 'e0c427d8-2029-4382-b054-6a84248ad8fe'
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const user = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { data: auth, error: aErr } = await user.auth.signInWithPassword(adminCredentials())
if (aErr) { console.error(`REFUSING: admin login failed — ${aErr.message}`); process.exit(1) }
const token = auth.session.access_token

const api = async (path, body) => {
  const res = await fetch(`${BASE_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// A 1x1 JPEG built here — never a client photo copied into the harness.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')

const CLEAN = { findingId: null, photoId: null, objectPath: null }
try {
  const { data: reports } = await svc.from('site_reports')
    .select('id, report_number, show_closed').eq('project_id', ZZ).order('report_number')
  const rep = reports?.at(-1)
  check(!!rep, `a standing ZZ-TEST site report exists (#${rep?.report_number ?? 'none'})`)
  if (!rep) throw new Error('no ZZ report to regenerate')

  // ── seed: a finding this report will carry, plus one photo ────────────────
  const { data: f, error: fErr } = await svc.from('findings').insert({
    project_id: ZZ, title: 'ZZ-PHOTO-GATE finding', category: 'INFO',
    origin: 'site_visit', date_raised: '2026-08-22', status: 'open',
    description: 'Seeded by pw-report-photos; removed in finally.',
  }).select('id').single()
  check(!fErr && !!f, `the fixture finding seeds (${fErr?.message ?? 'ok'})`)
  if (!f) throw new Error('finding seed failed')
  CLEAN.findingId = f.id

  const objectPath = `findings/${f.id}/${Date.now()}-gate.jpg`
  const { error: upErr } = await svc.storage.from('finding-photos')
    .upload(objectPath, JPEG, { contentType: 'image/jpeg', upsert: true })
  check(!upErr, `the fixture photo object uploads (${upErr?.message ?? 'ok'})`)
  CLEAN.objectPath = objectPath

  const { data: ph, error: phErr } = await svc.from('finding_photos').insert({
    finding_id: f.id, storage_url: objectPath, caption: 'gate fixture photo',
  }).select('id').single()
  check(!phErr && !!ph, `the finding_photos row seeds (${phErr?.message ?? 'ok'})`)
  CLEAN.photoId = ph?.id ?? null

  // ── PREMISE: the object is really there, by the generator's own call ──────
  const { data: dl, error: dlErr } = await svc.storage.from('finding-photos').download(objectPath)
  const bytes = dl ? (await dl.arrayBuffer()).byteLength : 0
  check(!dlErr && bytes > 0,
    `premise: the seeded object downloads (${bytes} bytes) — an absent image would make every later leg vacuous`)

  // ── regenerate through the DEPLOYED endpoint ──────────────────────────────
  const gen = await api('/api/generate-report', { report_id: rep.id })
  check(gen.status === 200, `generate-report returns 200 (got ${gen.status}${gen.body?.error ? ` — ${gen.body.error}` : ''})`)

  const grab = async (kind) => {
    const sig = await api('/api/get-file-url', { table: 'site_reports', id: rep.id, kind })
    if (sig.status !== 200 || !sig.body?.url) return null
    return Buffer.from(await (await fetch(sig.body.url)).arrayBuffer())
  }

  // ── DOCX: the pin ─────────────────────────────────────────────────────────
  const docx = await grab('docx')
  check(!!docx, 'the report docx signs and downloads')
  if (docx) {
    const zip = await JSZip.loadAsync(docx)
    const media = Object.keys(zip.files).filter(n => n.startsWith('word/media/'))
    const xml = await zip.file('word/document.xml').async('string')
    const drawings = (xml.match(/<w:drawing>/g) ?? []).length
    check(media.length > 0, `the docx carries image parts (word/media entries: ${media.length}) — zero is the 96b2060 defect`)
    check(drawings >= 1, `the docx renders at least the seeded photo (<w:drawing>: ${drawings})`)

    // THE FILE MUST ALSO OPEN. Counting parts is not the claim — the first
    // version of this gate passed on a docx WORD REFUSED TO OPEN, because
    // html-to-docx sizes a drawing from an explicit `width` and emits
    // `<wp:extent/>` with NO cx/cy for a `max-width`. An empty extent is
    // schema-invalid and Word rejects the whole document. Word itself cannot
    // run in the battery, so the assertion lands on the exact invalidity it
    // rejects: every extent carries non-zero dimensions.
    const extents = [...xml.matchAll(/<wp:extent([^>]*)\/>/g)].map(m => m[1])
    const sized = extents.filter(a => /cx="[1-9]\d*"/.test(a) && /cy="[1-9]\d*"/.test(a))
    check(extents.length > 0 && sized.length === extents.length,
      `every image extent carries non-zero cx/cy (${sized.length}/${extents.length}) — an empty <wp:extent/> is what makes Word refuse the file`)
    check(!/\[photo unavailable:/.test(xml),
      'no "photo unavailable" placeholder — the seeded photo loaded, so the document shows it rather than naming it')
  }

  // ── PDF: the twin (always worked; kept honest for free) ───────────────────
  const pdf = await grab('pdf')
  check(!!pdf, 'the report pdf signs and downloads')
  if (pdf) {
    const s = pdf.toString('latin1')
    const images = (s.match(/\/Subtype\s*\/Image/g) ?? []).length
    check(images >= 1, `the pdf carries image XObjects (${images})`)
  }
} catch (err) {
  check(false, `unexpected: ${err.message}`)
} finally {
  if (CLEAN.photoId) await svc.from('finding_photos').delete().eq('id', CLEAN.photoId)
  if (CLEAN.objectPath) await svc.storage.from('finding-photos').remove([CLEAN.objectPath]).catch(() => {})
  if (CLEAN.findingId) {
    await svc.from('findings').delete().eq('id', CLEAN.findingId)
    const { count: fLeft } = await svc.from('findings').select('id', { count: 'exact', head: true }).eq('id', CLEAN.findingId)
    const { count: pLeft } = CLEAN.photoId
      ? await svc.from('finding_photos').select('id', { count: 'exact', head: true }).eq('id', CLEAN.photoId)
      : { count: 0 }
    console.log(`\ncleanup: fixture finding rows ${fLeft} (must be 0) · photo rows ${pLeft} (must be 0) · storage object removed best-effort`)
    if (fLeft !== 0 || pLeft !== 0) fails.push('cleanup left fixture rows on ZZ-TEST')
  }
  await user.auth.signOut().catch(() => {})
}

console.log('\n' + '='.repeat(60))
console.log(fails.length === 0
  ? `PASS — ${pass} checks. A seeded photo reaches both documents.`
  : `FAIL — ${fails.length}: ${fails.join(' | ')}`)
process.exit(fails.length === 0 ? 0 : 1)
