// Local document renderer — runs the REAL api handlers in-process against the
// working tree, with no deployment involved.
//
// Why in-process rather than a dev server: the palette question is about THIS
// working tree. A deployed preview answers it for a commit, which is a different
// question and costs a deployment. `vercel dev` hands the port to the framework
// dev command and never mounts /api, so it cannot answer it at all.
//
// The handlers are Vercel-shaped: (req, res) with req.body already parsed and
// res.status().json(). Both are stubbed below. Everything else — Supabase with
// the service role, Puppeteer, html-to-docx, storage upload — is the production
// path, unmodified. Nothing here is a sibling reimplementation of a generator.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the local gitignored .env, same as the
// deployed functions.
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// SUPABASE_URL is a Vercel-project variable; the local .env carries the same
// value under the Vite name. Mapped here, not in .env, so the gitignored file
// keeps exactly one name per secret.
process.env.SUPABASE_URL ??= process.env.VITE_SUPABASE_URL
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('doc-render-local: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — run with --env-file=.env')

const CACHE = 'out/handlers'

/** Bundle one api handler to ESM, deps external, and import it. */
export async function loadHandler(name) {
  mkdirSync(CACHE, { recursive: true })
  const outfile = `${CACHE}/${name}.mjs`
  await build({
    entryPoints: [`api/${name}.ts`],
    outfile, bundle: true, format: 'esm', platform: 'node', target: 'node20',
    packages: 'external', logLevel: 'error',
    // @sparticuz/chromium-min ships a Linux Lambda pack and cannot resolve on
    // Windows. Aliased to a local shim; the seam is named in its header.
    alias: { '@sparticuz/chromium-min': './doc-render-chromium-shim.mjs' },
  })
  const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
  return mod.default
}

/** Invoke a handler exactly as Vercel would, and return { status, body }. */
export async function invoke(handler, body, token) {
  let status = 200, payload = null, sent = false
  const res = {
    status(c) { status = c; return res },
    json(o) { payload = o; sent = true; return res },
    send(o) { payload = o; sent = true; return res },
    end() { sent = true; return res },
    setHeader() { return res },
  }
  const req = {
    method: 'POST',
    body,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    query: {},
  }
  await handler(req, res)
  if (!sent) throw new Error('handler returned without sending a response')
  return { status, body: payload }
}
