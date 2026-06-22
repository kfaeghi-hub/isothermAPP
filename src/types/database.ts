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

export interface SiteReport {
  id: string
  project_id: string
  report_number: string
  report_date: string
  observation_date: string | null
  narrative: string | null
  site_progress: string | null
  current_status: string | null
  show_closed: boolean
  created_by: string | null
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
