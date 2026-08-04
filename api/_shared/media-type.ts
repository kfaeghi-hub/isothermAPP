// media-type.ts — what a file IS, decided by its bytes.
//
// R18: FILENAMES LIE. The firm rule was written about equipment keys and drawing
// files, and our own code broke it: `api/intake.ts` derived the media type from
// `intake_uploads.filename` with `split('.').pop()`. The schedule-page finder
// names its uploads `"…-IFT.pdf — page 7 (M-301)"`, so that expression returned
// `"pdf — page 7 (m-301)"`, matched nothing, and returned 400.
//
// Every page a user confirmed through the finder failed, on every set, from the
// day it shipped. The object in storage was a valid PNG the whole time; nothing
// ever looked at it.
//
// So: the bytes decide. This function is the only thing allowed to answer the
// question, and it never sees a name.

export type MediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'

/**
 * Sniff a media type from a file's leading bytes.
 *
 * Returns null rather than guessing — quarantine, never guess. A caller that
 * gets null must refuse the file and say what it saw, not fall back to a name.
 */
export function sniffMediaType(bytes: Uint8Array): MediaType | null {
  if (bytes.length < 12) return null
  const b = bytes
  // PNG   89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  // JPEG  FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  // PDF   %PDF  (may be preceded by junk on malformed files; check the first 1k)
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
  // WEBP  "RIFF"...."WEBP"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  // A PDF with leading junk is common enough from scanners to be worth finding.
  const head = Buffer.from(b.subarray(0, Math.min(b.length, 1024))).toString('latin1')
  if (head.includes('%PDF-')) return 'application/pdf'
  return null
}

/** A short, honest description of what the bytes looked like, for a refusal
 *  message. "Cannot extract" is useless without it. */
export function describeBytes(bytes: Uint8Array): string {
  const hex = [...bytes.subarray(0, 8)].map(x => x.toString(16).padStart(2, '0')).join(' ')
  const ascii = Buffer.from(bytes.subarray(0, 8)).toString('latin1').replace(/[^\x20-\x7e]/g, '.')
  return `${bytes.length} bytes, starting ${hex} ("${ascii}")`
}
