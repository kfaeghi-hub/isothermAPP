// The intake surface: upload a schedule, or review one already staged.
//
// The panel opens on WHATEVER IS OUTSTANDING. If uploads are waiting on a
// decision it lists them; there is no state where the app holds staged rows and
// shows you a file picker instead.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { IntakeUpload } from './IntakeUpload'
import { IntakeReview } from './IntakeReview'

interface UploadRow {
  id: string; filename: string; kind: string; row_count: number | null
  status: string; uploaded_at: string; pending: number
}

export function IntakePanel({ projectId, onChanged }: {
  projectId: string
  onChanged: () => void
}) {
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [open, setOpen] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const { data } = await supabase.from('intake_uploads')
      .select('id, filename, kind, row_count, status, uploaded_at')
      .eq('project_id', projectId).neq('status', 'approved')
      .order('uploaded_at', { ascending: false })
    const list = data ?? []
    const withCounts: UploadRow[] = []
    for (const u of list) {
      const { count } = await supabase.from('intake_rows')
        .select('id', { count: 'exact', head: true })
        .eq('upload_id', u.id).eq('disposition', 'pending')
      withCounts.push({ ...u, pending: count ?? 0 } as UploadRow)
    }
    setUploads(withCounts)
  }, [projectId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  if (open) {
    return (
      <IntakeReview uploadId={open} projectId={projectId}
        onClose={() => { setOpen(null); void fetchAll(); onChanged() }} />
    )
  }

  return (
    <div>
      <IntakeUpload projectId={projectId}
        onStaged={id => { void fetchAll(); onChanged(); setOpen(id) }} />

      {uploads.length > 0 && (
        <div className="px-4 pb-3">
          <h4 className="text-[11px] font-semibold text-gray-600 mb-1">Staged uploads</h4>
          {uploads.map(u => (
            <button key={u.id} onClick={() => setOpen(u.id)}
              className="flex items-center gap-2 w-full text-left border-b border-gray-100 py-1.5 hover:bg-gray-50">
              <span className="text-xs text-gray-800 font-mono truncate flex-1">{u.filename}</span>
              <span className="text-[10px] text-gray-400">
                {new Date(u.uploaded_at).toLocaleDateString()}
              </span>
              {u.pending > 0 ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5">
                  {u.pending} pending
                </span>
              ) : (
                <span className="text-[10px] text-teal-800 bg-teal-50 rounded px-1.5 py-0.5">all ruled</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
