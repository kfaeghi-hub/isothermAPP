// Photo capture + upload. Shared by the Issues Log and checklist fill-out.
// Lives in src/lib per ARCHITECTURE 9B: once two pages need it, it stops being page-local.

import { supabase } from './supabase'

export const PHOTO_BUCKET = 'finding-photos'
const MAX_DIM = 1400
const JPEG_QUALITY = 0.82

/** Downscale + re-encode to JPEG. Falls back to the original file on any failure. */
export async function compressImage(file: File): Promise<Blob | File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => resolve(b ?? file), 'image/jpeg', JPEG_QUALITY)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/**
 * Compress -> upload to storage -> insert the finding_photos row.
 * Safe to call with a client-generated finding id: the storage path only needs the id,
 * not a server round-trip.
 */
export async function uploadFindingPhoto(findingId: string, file: File): Promise<UploadResult> {
  try {
    const blob = await compressImage(file)
    // Random suffix: a multi-select can otherwise collide within the same millisecond.
    const path = `findings/${findingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`

    const { data: uploaded, error: uploadErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg' })
    if (uploadErr || !uploaded) return { ok: false, error: uploadErr?.message ?? 'Upload failed' }

    const { data: { publicUrl } } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(uploaded.path)

    const { error: rowErr } = await supabase.from('finding_photos').insert({
      finding_id: findingId,
      storage_url: publicUrl,
      caption: file.name,
    })
    if (rowErr) return { ok: false, error: rowErr.message }

    return { ok: true, url: publicUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' }
  }
}
