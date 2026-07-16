// Shared formatting helpers. (formatDate previously lived in projectTypes.ts,
// which was deleted with the project_type removal pass.)

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA')
}
