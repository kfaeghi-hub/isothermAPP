// Database types — mirror the Supabase schema exactly

export type ProjectType = 'standard' | 'leed_fundamental' | 'leed_enhanced' | 'leed_enhanced_mbcx'
export type UserRole = 'admin' | 'developer' | 'user' | 'client'
export type FindingStatus = 'open' | 'closed'
export type FindingOrigin = 'site_visit' | 'ivc' | 'pfc' | 'fpt'
export type CxProgress = 'done' | 'in_progress' | 'na' | 'blank'
export type Discipline = 'mechanical' | 'electrical' | 'bas' | 'general'
export type ChecklistType = 'ivc' | 'pfc' | 'fpt'
export type DeliverableType =
  | 'ivc_checklist' | 'pfc_checklist' | 'fpt_script'
  | 'opr' | 'bod' | 'cx_plan' | 'systems_manual' | 'final_report'
  | 'training' | 'ten_month_review' | 'ocx_plan' | 'site_report' | 'other'
export type DeliverableStatus = 'not_started' | 'in_progress' | 'received' | 'complete' | 'na'
export type DocRegisterStatus = 'outstanding' | 'received' | 'reviewed' | 'na'
export type AttachmentType = 'shop_drawing' | 'tab_report' | 'pressure_test' | 'startup' | 'om_manual' | 'factory_test' | 'other'

// ── Orgs ───────────────────────────────────────────────────────────────────
// MASTER-BRIEF rule 17: tenant groundwork. Every new table carries org_id,
// nullable + defaulted to the Isotherm org. RLS still keys on role/project
// membership — org_id is NOT an active security key until Phase 11.

export interface Org {
  id: string
  name: string
  created_at: string
}

// ── Directory ──────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  abbreviation: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CompanyRole {
  id: string
  company_id: string
  role: string
}

export interface Contact {
  id: string
  company_id: string
  name: string
  trade: string | null
  email: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

// ── Projects ───────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  com_number: string | null
  client_company_id: string | null
  address: string | null
  project_type: ProjectType
  status: 'active' | 'completed'
  notes: string | null
  created_at: string
  last_visited_at: string | null
  updated_at: string
}

export interface ProjectPhase {
  id: string
  project_id: string
  name: string
  sort_order: number
  created_at: string
}

// ── Equipment ──────────────────────────────────────────────────────────────

// nameplate_extra stores three-section field values keyed by field_name
export interface NameplateExtra {
  spec:         Record<string, string>
  shop_drawing: Record<string, string>
  installed:    Record<string, string>
}

export interface Equipment {
  id: string
  project_id: string
  kind: 'equipment' | 'system'
  equipment_type: string | null      // maps to field template (e.g. 'heat_pump', 'pump')
  category: string | null
  tag: string | null
  descriptor: string | null
  location: string | null
  area_served: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  voltage: string | null
  phase: string | null
  hz: string | null
  amperage: string | null
  flow: string | null
  capacity: string | null
  nameplate_extra: NameplateExtra | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface EquipmentTagGlossary {
  id: string
  tag: string
  descriptor: string
  discipline: string
  equipment_type: string | null
  category_label: string | null
  sort_order: number
  created_at: string
}

export interface EquipmentTypeFieldDef {
  id: string
  equipment_type: string
  section: 'spec' | 'shop_drawing' | 'installed'
  field_name: string
  unit: string | null
  sort_order: number
  created_at: string
}

export interface ProjectEquipmentFieldDef {
  id: string
  project_id: string
  equipment_type: string
  section: 'spec' | 'shop_drawing' | 'installed'
  field_name: string
  unit: string | null
  sort_order: number
  created_at: string
}

export interface EquipmentAttachment {
  id: string
  project_id: string
  equipment_id: string
  filename: string
  file_type: 'shop_drawing' | 'cut_sheet' | 'submittal' | 'startup_report' | 'om_manual' | 'other'
  storage_url: string
  uploaded_at: string
}

// ── Trades ─────────────────────────────────────────────────────────────────

export interface TradeType {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface ProjectTrade {
  id: string
  project_id: string
  trade_type_id: string
}

// ── Findings ───────────────────────────────────────────────────────────────

export interface Finding {
  id: string
  project_id: string
  number: string
  phase_id: string | null
  category: string
  title: string | null
  responsible_party_id: string | null
  status: FindingStatus
  origin: FindingOrigin
  date_raised: string
  date_closed: string | null
  linked_equipment_id: string | null
  created_at: string
  updated_at: string
}

export interface FindingDiaryEntry {
  id: string
  finding_id: string
  entry_date: string
  body: string
  created_at: string
}

export interface FindingPhoto {
  id: string
  finding_id: string
  storage_url: string
  caption: string | null
  uploaded_at: string
}

// ── Site reports ───────────────────────────────────────────────────────────

export interface DocRegisterItem {
  id: string
  label: string
  status: 'outstanding' | 'received' | 'na'
  finding_number: string | null
}

export interface SiteReport {
  id: string
  project_id: string
  report_number: string
  site_visit_date: string
  report_date: string
  authored_by: string
  progress_narrative: string | null
  show_closed: boolean
  doc_register: DocRegisterItem[] | null
  storage_url: string | null
  pdf_url: string | null
  created_at: string
  updated_at: string
}

// ── Cx Index ───────────────────────────────────────────────────────────────

export interface CxDefaultStageGroup {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export interface CxDefaultColumn {
  id: string
  stage_group_id: string
  label: string
  sort_order: number
  created_at: string
}

export interface ProjectCxStageGroup {
  id: string
  project_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface ProjectCxColumn {
  id: string
  stage_group_id: string
  label: string
  sort_order: number
  created_at: string
}

export interface CxCellValue {
  id: string
  project_id: string
  equipment_id: string
  column_id: string
  status: 'done' | 'in_progress' | 'na'
  notes: string | null
  updated_at: string
}

// Composite used in the UI — stage group with its columns pre-joined and sorted
export interface CxStageGroupWithColumns extends ProjectCxStageGroup {
  columns: ProjectCxColumn[]
}

// ── Joined types (used in UI queries) ─────────────────────────────────────

export interface CompanyWithRoles extends Company {
  company_roles: CompanyRole[]
}

export interface ContactWithCompany extends Contact {
  companies: Pick<Company, 'id' | 'name' | 'abbreviation'> | null
}

export interface ProjectWithClient extends Project {
  companies: Pick<Company, 'id' | 'name' | 'abbreviation'> | null
}

export interface FindingWithParty extends Finding {
  contacts: Pick<Contact, 'id' | 'name' | 'trade'> | null
  equipment: Pick<Equipment, 'id' | 'tag' | 'descriptor'> | null
}

// ── Checklist Engine (Phase 2) ─────────────────────────────────────────────

// Template pool — firm-level, admin/developer managed

export interface ChecklistTemplate {
  id: string
  org_id: string | null
  name: string
  type: ChecklistType
  equipment_type: string | null
  description: string | null
  revision_label: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ChecklistTemplateSection {
  id: string
  org_id: string | null
  template_id: string
  title: string
  sort_order: number
  created_at: string
}

export interface ChecklistTemplateItem {
  id: string
  org_id: string | null
  section_id: string
  label: string
  hint: string | null
  status_type: 'yn_nr_na' | 'pass_yn'
  creates_finding: boolean
  expected_response: string | null
  suggested_category: string | null
  sort_order: number
  created_at: string
}

export interface GridColumn { key: string; label: string; unit: string | null }
export interface GridRow    { key: string; label: string }
export interface GridDefinition { columns: GridColumn[]; rows: GridRow[] }

export interface ChecklistTemplateGrid {
  id: string
  org_id: string | null
  section_id: string
  title: string
  definition: GridDefinition
  sort_order: number
  created_at: string
}

export interface ChecklistTemplateSignoff {
  id: string
  org_id: string | null
  template_id: string
  role_label: string
  sort_order: number
  created_at: string
}

// Checklist instances — per-project, fully snapshotted at creation

export type ChecklistStatus = 'not_started' | 'in_progress' | 'complete'
export type TargetRole = 'primary' | 'tested_unit' | 'related'

export interface ChecklistInstance {
  id: string
  org_id: string | null
  project_id: string
  source_template_id: string | null
  source_template_name_snapshot: string
  source_template_type_snapshot: ChecklistType
  source_template_revision_label_snapshot: string | null
  created_from_template_at: string
  type: ChecklistType
  status: ChecklistStatus
  date_performed: string | null
  authored_by: string | null
  notes: string | null
  completed_at: string | null
  completed_by: string | null
  reopened_by: string | null
  reopened_at: string | null
  nameplate_snapshot: Record<string, EquipmentNameplateSnapshot> | null
  created_at: string
  updated_at: string
}

export interface EquipmentNameplateSnapshot {
  tag: string | null
  descriptor: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  voltage: string | null
  phase: string | null
  hz: string | null
  amperage: string | null
  flow: string | null
  capacity: string | null
  nameplate_extra: NameplateExtra | null
}

export interface ChecklistInstanceTarget {
  id: string
  org_id: string | null
  instance_id: string
  equipment_id: string
  role: TargetRole
  sort_order: number
  created_at: string
}

export interface ChecklistInstanceSection {
  id: string
  org_id: string | null
  instance_id: string
  source_section_id: string | null
  title: string
  sort_order: number
  created_at: string
}

export interface ChecklistInstanceItem {
  id: string
  org_id: string | null
  instance_id: string
  section_id: string
  source_item_id: string | null
  label: string
  hint: string | null
  status_type: 'yn_nr_na' | 'pass_yn'
  creates_finding: boolean
  expected_response: string | null
  suggested_category: string | null
  sort_order: number
  created_at: string
}

export interface ChecklistInstanceGrid {
  id: string
  org_id: string | null
  instance_id: string
  section_id: string
  source_grid_id: string | null
  title: string
  definition: GridDefinition
  sort_order: number
  created_at: string
}

export interface ChecklistInstanceSignoff {
  id: string
  org_id: string | null
  instance_id: string
  source_signoff_id: string | null
  // Snapshotted from the template. Signature blocks MUST render deterministically:
  // all signoffs for an instance are bulk-inserted and share an identical created_at,
  // so created_at alone is not a stable sort key. Always order by sort_order, then id.
  sort_order: number
  role_label_snapshot: string
  signer_name: string | null
  signer_company: string | null
  signed_at: string | null
  created_at: string
}

// Response tables

export type YnNrNaStatus = 'y' | 'n' | 'nr' | 'na'
export type PassFailStatus = 'pass' | 'fail'
export type ResponseStatus = YnNrNaStatus | PassFailStatus

export interface ChecklistResponse {
  id: string
  org_id: string | null
  instance_id: string
  item_id: string
  target_id: string
  status_type: 'yn_nr_na' | 'pass_yn'
  status: ResponseStatus | null
  comment: string | null
  actual_response: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistGridResponse {
  id: string
  org_id: string | null
  instance_id: string
  grid_id: string
  target_id: string
  row_key: string
  data: Record<string, string>
  created_at: string
  updated_at: string
}

export interface ChecklistFindingLink {
  id: string
  org_id: string | null
  instance_id: string
  item_id: string
  target_id: string
  finding_id: string
  created_at: string
}

// Joined types used in checklist UI

export interface ChecklistTemplateSectionWithItems extends ChecklistTemplateSection {
  items: ChecklistTemplateItem[]
  grids: ChecklistTemplateGrid[]
}

export interface ChecklistTemplateWithSections extends ChecklistTemplate {
  sections: ChecklistTemplateSectionWithItems[]
  signoffs: ChecklistTemplateSignoff[]
}

export interface ChecklistInstanceSectionWithItems extends ChecklistInstanceSection {
  items: ChecklistInstanceItem[]
  grids: ChecklistInstanceGrid[]
}

export interface ChecklistInstanceWithDetail extends ChecklistInstance {
  targets: (ChecklistInstanceTarget & { equipment: Pick<Equipment, 'id' | 'tag' | 'descriptor' | 'kind'> })[]
  sections: ChecklistInstanceSectionWithItems[]
  signoffs: ChecklistInstanceSignoff[]
  responses: ChecklistResponse[]
  grid_responses: ChecklistGridResponse[]
  finding_links: ChecklistFindingLink[]
}
