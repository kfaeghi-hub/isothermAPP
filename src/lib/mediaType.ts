// mediaType.ts — the client half of "the bytes decide" (R18).
//
// Mirrors api/_shared/media-type.ts deliberately: the client records what it is
// about to upload, and the SERVER re-sniffs the stored object and treats its own
// answer as authoritative. Two readings of the same evidence, one of which wins
// — so drift between these files cannot produce a wrong decision, only a logged
// mismatch.
//
// It exists because our own code broke R18: `api/intake.ts` read the media type
// out of a FILENAME, and the schedule-page finder's human-readable names
// ("…-IFT.pdf — page 7 (M-301)") made that expression return nonsense. Every
// confirmed page 400'd for as long as the feature had shipped.

export type MediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'

/** Sniff a Blob/File by its leading bytes. Returns null rather than guessing. */
export async function sniffBlobMediaType(blob: Blob): Promise<MediaType | null> {
  const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer())
  if (head.length < 12) return null
  const b = head
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  let ascii = ''
  for (let i = 0; i < b.length; i++) ascii += String.fromCharCode(b[i])
  if (ascii.includes('%PDF-')) return 'application/pdf'
  return null
}
