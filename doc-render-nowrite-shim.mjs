// LOCAL-ONLY shim that renders a document WITHOUT persisting it.
//
// Ruled 2026-08-08: the Muir and Clairlea site reports are ISSUED client
// documents. Rule 4 stands — they keep their footer bleed as a point-in-time
// artifact of when they were made, exactly like any issued revision. The fix is
// still proven on real data, but the issued record is never touched.
//
// So this replaces uploadDocPair — and only uploadDocPair — with a writer that
// puts both buffers on local disk and returns the same shape the real one does.
// Everything else in doc-common (CSS, geometry, toPdf, toDocx) is the REAL
// module, imported by a path the alias does not rewrite, so the artifact under
// inspection is the artifact the generator actually builds.
//
// NAMED SEAM: the handler still writes the returned paths to the row it was
// given. That is why this is only ever pointed at a report whose row update is
// harmless, or run knowing the row's storage columns will be rewritten with a
// local path. For the Clairlea verification the caller reads the row's original
// values first and restores them, and asserts the restore — see
// verify-clairlea-boundaries.mjs.
export * from './api/_shared/doc-common.ts'

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Read at CALL time, not import time: the caller sets NOWRITE_DIR after this
// module is already loaded by the bundler, and an import-time read silently
// writes the artifact somewhere the caller then fails to find.
const dir = () => process.env.NOWRITE_DIR ?? 'out/pdfdiag/nowrite'

export async function uploadDocPair(_storage, basePath, docxBuffer, pdfBuffer) {
  const base = `${dir()}/${basePath}`
  mkdirSync(dirname(base), { recursive: true })
  writeFileSync(`${base}.docx`, docxBuffer)
  writeFileSync(`${base}.pdf`, pdfBuffer)
  console.log(`  [nowrite] ${base}.pdf  (${(pdfBuffer.length / 1024 | 0)}kb)  — storage NOT written`)
  return { storage_url: `${basePath}.docx`, pdf_url: `${basePath}.pdf` }
}
