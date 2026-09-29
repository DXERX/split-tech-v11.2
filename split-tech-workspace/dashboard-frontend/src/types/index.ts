export type UserRole = 'super_owner' | 'it_support' | 'customer_support' | 'marketing_manager' | 'marketing_associate' | 'merchant'

export type SubscriptionTier = 'basic' | 'pro' | 'enterprise'
export type VoiceTier = 'voice_basic' | 'voice_pro' | 'voice_enterprise'
export type AnyTier = SubscriptionTier | VoiceTier
export type SubscriptionStatus = 'pending' | 'active' | 'cancelled' | 'expired' | 'suspended'
export type SubscriptionService = 'vision' | 'voice'

export type VoiceAgentStatus = 'pending' | 'active' | 'paused'
export type CallStatus = 'completed' | 'missed' | 'transferred' | 'failed'
export type CallSentiment = 'positive' | 'neutral' | 'negative'

export type StoreStatus = 'pending' | 'active' | 'inactive' | 'suspended'
export type VerificationStatus = 'draft' | 'pending' | 'under_review' | 'verified' | 'rejected'

export type AuditStatus = 'pass' | 'warning' | 'fail'

export interface Profile {
  id: string
  full_name: string | null
  phone: string | null
  company_name: string | null
  avatar_url: string | null
}

export interface UserRoleRecord {
  id: string
  user_id: string
  role: UserRole
}

export interface Subscription {
  id: string
  user_id: string
  tier: AnyTier
  status: SubscriptionStatus
  start_date: string | null
  end_date: string | null
  monthly_amount: number | null
  auto_renew: boolean
  notes: string | null
  service?: SubscriptionService
}

export interface VoiceAgent {
  id: string
  user_id: string
  subscription_id: string | null
  persona_name: string
  persona_description: string | null
  greeting: string
  business_phone: string | null
  business_hours_start: number
  business_hours_end: number
  status: VoiceAgentStatus
  created_at: string
  updated_at: string
}

export interface CallLog {
  id: string
  caller_phone: string | null
  duration_seconds: number
  status: CallStatus
  sentiment: CallSentiment | null
  started_at: string
  ended_at: string | null
  created_at: string
}

export interface Store {
  id: string
  user_id: string
  subscription_id: string | null
  name: string
  store_status: StoreStatus
  verification_status: VerificationStatus
  custom_questions: string[]
  working_hours: { start: number; end: number }
  rtsp_url: string | null
  rtsp_password_encrypted: string | null
  camera_ip: string | null
  camera_username: string | null
  network_mode: 'single_network'
  hardware_choice: 'raspberry_pi' | 'software'
  interval_minutes: number
  whatsapp_enabled: boolean
  whatsapp_number: string | null
  debug_mode: boolean
  remote_command: 'run' | 'stop' | 'restart'
  last_heartbeat: string | null
  approved_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  verification_requested_at: string | null
  verification_notes: string | null
  rejection_reason: string | null
  created_at: string
}

export interface StoreApiKey {
  id: string
  store_id: string
  license_key: string
  api_key: string
  key_preview: string
  is_active: boolean
  machine_fingerprint: string | null
  activated_at: string | null
  expires_at: string | null
}

export interface YoloDetection {
  class: string
  class_ar: string
  conf: number
  bbox: [number, number, number, number]  // [x, y, w, h] pixels
  severity: 'violation' | 'info' | 'neutral' | null
  timestamp?: string
}

// Shape stored by the engine: { frames: [{frame_idx, time, objects:[...]}], summary:{...}, yolo_available:bool }
export interface DetectionsJson {
  frames: Array<{ frame_idx: number; time: string; objects: YoloDetection[] }>
  yolo_available: boolean
  summary: {
    total_frames: number
    class_totals: Record<string, number>
    violation_count: number
    person_count: number
    phone_detected: boolean
  }
}

export interface AnalyticsLog {
  id: string
  store_id: string
  score: number | null
  status: AuditStatus | null
  summary: string | null
  result: Record<string, unknown>
  observations: Array<{ question: string; answer: string }>
  ai_reasoning: string | null
  confidence_score: number | null
  annotated_image_url: string | null
  detections_json: DetectionsJson | YoloDetection[] | null   // supports both shapes
  created_at: string
}

export interface EngineHeartbeat {
  id: string
  store_id: string
  status: 'active' | 'idle' | 'error' | null
  cpu_usage: number | null
  memory_usage: number | null
  created_at: string
}

export interface SupportTicket {
  id: string
  store_id: string | null
  user_id: string
  title: string
  description: string | null
  category: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export interface Broadcast {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'maintenance' | 'feature' | 'urgent'
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export interface AuthUser {
  id: string
  email: string | null
  role: UserRole
  profile: Profile | null
}

// ──────────────────────────────────────────────────────────────────────────
// Marketing System Types
// ──────────────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'interested' | 'trial_active' | 'converted' | 'rejected' | 'inactive'
export type ContactType = 'call' | 'email' | 'visit' | 'whatsapp' | 'website_form'
export type ContactOutcome = 'success' | 'no_answer' | 'rejected' | 'interested' | 'scheduled' | 'not_available'
export type MarketingRole = 'associate' | 'manager' | 'director'

export interface MarketingLead {
  id: string
  business_name: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  business_region: string | null
  business_type: string | null
  status: LeadStatus
  status_updated_at: string
  assigned_to: string | null
  assigned_at: string | null
  lock_expires_at: string | null
  source: string | null
  notes: string | null
  priority: number
  last_contact_at: string | null
  last_activity_at: string
  released_to_pool_at: string | null
  claim_count: number
  contact_count: number
  converted_store_id: string | null
  converted_at: string | null
  phone_normalized: string | null
  location_fingerprint: string | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

export interface MarketingLeadStatusHistory {
  id: string
  lead_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  changed_at: string
  reason: string | null
  note: string | null
}

export interface MarketingContactAttempt {
  id: string
  lead_id: string
  contact_type: ContactType
  contact_method: string | null
  outcome: ContactOutcome
  contacted_by: string | null
  contacted_at: string
  notes: string | null
  follow_up_scheduled_at: string | null
  follow_up_completed: boolean
}

export interface MarketingWeeklyTask {
  id: string
  assigned_to: string
  assigned_by: string
  assigned_at: string
  week_start: string
  week_end: string
  contacts_target: number
  contacts_completed: number
  conversion_target: number
  conversions_completed: number
  focus_region: string | null
  notes: string | null
  status: 'active' | 'completed' | 'paused' | 'cancelled'
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface MarketingAssociateProfile {
  id: string
  display_name: string | null
  team_lead: string | null
  total_leads_assigned: number
  total_conversions: number
  conversion_rate: number
  assigned_regions: string[] | null
  is_active: boolean
  can_share_lead_contacts: boolean
  created_at: string
  updated_at: string
}

export interface MarketingRoleMapping {
  id: string
  user_id: string
  marketing_role: MarketingRole
  reports_to: string | null
  can_view_all_leads: boolean
  can_assign_leads: boolean
  can_create_tasks: boolean
  can_send_emails: boolean
  can_view_performance: boolean
  created_at: string
  updated_at: string
}

export interface MarketingEmailCampaign {
  id: string
  name: string
  description: string | null
  created_by: string | null
  template_id: string | null
  subject: string | null
  recipient_type: 'all_leads' | 'specific_status' | 'assigned_to' | null
  target_lead_status: string | null
  target_assigned_to: string | null
  total_recipients: number
  sent_count: number
  opened_count: number
  clicked_count: number
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
}
