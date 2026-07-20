import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ProjectDetailPage } from '../pages/ProjectDetailPage'
import type { Company } from '../types/database'

// Route wrapper for /projects/:projectId — supplies the companies list the
// detail page's Edit modal needs (previously passed down from the Projects list).
export function ProjectDetailRoute() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<Company[] | null>(null)

  useEffect(() => {
    let alive = true
    supabase.from('companies').select('id, name, abbreviation').order('name')
      .then(({ data }) => { if (alive) setCompanies((data ?? []) as Company[]) })
    return () => { alive = false }
  }, [])

  if (!projectId) { navigate('/projects'); return null }
  if (companies === null) return <div className="p-8 text-sm text-gray-400">Loading…</div>

  return (
    <ProjectDetailPage
      projectId={projectId}
      companies={companies}
      onBack={() => navigate('/projects')}
    />
  )
}
