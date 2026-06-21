import type { ProjectType } from '../types/database'

export const PROJECT_TYPES: Record<ProjectType, {
  label: string
  badge: string
  description: string
}> = {
  standard: {
    label: 'Standard',
    badge: 'bg-slate-100 text-slate-600',
    description: 'Cx Plan · IVC/PFC checklists · site reports · FPT · issues log · final Cx report',
  },
  leed_fundamental: {
    label: 'LEED Fundamental',
    badge: 'bg-green-50 text-green-700',
    description: '+ OPR & BOD review · issues-and-benefits log · CFR plan · verify test execution',
  },
  leed_enhanced: {
    label: 'LEED Enhanced',
    badge: 'bg-emerald-50 text-emerald-700',
    description: '+ Systems Manual · operator training · seasonal testing · 10-month review · OCx plan',
  },
  leed_enhanced_mbcx: {
    label: 'LEED Enhanced + MBCx',
    badge: 'bg-teal-50 text-teal-700',
    description: '+ Monitoring-based Cx plan · tracked points · acceptable-value limits · ongoing monitoring',
  },
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-CA')
}
