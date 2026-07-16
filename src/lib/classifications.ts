// Project classification framework — data helpers shared by the New/Edit Project
// modals (and later the admin config screen). All Supabase access stays behind
// src/lib per ARCHITECTURE §9B; the picker component itself is purely presentational.

import { supabase } from './supabase'
import type { ClassificationDimension, ClassificationOption } from '../types/database'

/** dimension_id → selected option_ids (single-mode dims hold 0..1 entries) */
export type ClassificationSelections = Record<string, string[]>

export interface ClassificationConfig {
  dimensions: ClassificationDimension[]
  options: ClassificationOption[]
}

export async function fetchClassificationConfig(): Promise<ClassificationConfig> {
  const [dRes, oRes] = await Promise.all([
    supabase.from('classification_dimensions').select('*')
      .eq('active', true).order('sort_order'),
    supabase.from('classification_options').select('*')
      .eq('active', true).order('sort_order'),
  ])
  return {
    dimensions: (dRes.data ?? []) as ClassificationDimension[],
    options: (oRes.data ?? []) as ClassificationOption[],
  }
}

/** Per-dimension validation errors, driven by the RUNTIME required flags. */
export function validateRequired(
  dimensions: ClassificationDimension[],
  selections: ClassificationSelections,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const d of dimensions) {
    if (d.required && (selections[d.id]?.length ?? 0) === 0) {
      errors[d.id] = `${d.name} is required.`
    }
  }
  return errors
}

/** Deliverable composition: union of every selected option's default templates,
 *  deduped by template_id. Any option in any dimension may contribute. */
export async function composeDeliverableTemplateIds(selectedOptionIds: string[]): Promise<string[]> {
  if (selectedOptionIds.length === 0) return []
  const { data } = await supabase
    .from('option_deliverable_defaults')
    .select('template_id')
    .in('option_id', selectedOptionIds)
  return [...new Set((data ?? []).map(r => r.template_id as string))]
}

export function allSelectedOptionIds(selections: ClassificationSelections): string[] {
  return Object.values(selections).flat()
}

/** Sync the junction to match `selections`. Deletes first, then inserts — the
 *  single-mode trigger would otherwise reject replacing a single-dim selection. */
export async function syncProjectClassifications(
  projectId: string,
  selections: ClassificationSelections,
  options: ClassificationOption[],
): Promise<string | null> {
  const wanted = new Set(allSelectedOptionIds(selections))
  const { data: existing, error: exErr } = await supabase
    .from('project_classifications')
    .select('id, option_id')
    .eq('project_id', projectId)
  if (exErr) return exErr.message

  const have = new Map((existing ?? []).map(r => [r.option_id as string, r.id as string]))
  const toDelete = [...have.entries()].filter(([opt]) => !wanted.has(opt)).map(([, id]) => id)
  const toInsert = [...wanted].filter(opt => !have.has(opt))

  if (toDelete.length > 0) {
    const { error } = await supabase.from('project_classifications').delete().in('id', toDelete)
    if (error) return error.message
  }
  if (toInsert.length > 0) {
    const byId = new Map(options.map(o => [o.id, o]))
    const { error } = await supabase.from('project_classifications').insert(
      toInsert.map(option_id => ({
        project_id: projectId,
        option_id,
        dimension_id: byId.get(option_id)!.dimension_id,
      })),
    )
    if (error) return error.message
  }
  return null
}

/** Selections for one project, as the picker's value shape. */
export async function fetchProjectSelections(projectId: string): Promise<ClassificationSelections> {
  const { data } = await supabase
    .from('project_classifications')
    .select('option_id, dimension_id')
    .eq('project_id', projectId)
  const out: ClassificationSelections = {}
  for (const r of (data ?? [])) {
    (out[r.dimension_id as string] ??= []).push(r.option_id as string)
  }
  return out
}
