-- ════════════════════════════════════════════════════════════════════════════
-- Marketing System Tables
-- Hierarchical role-based CRM for Associates and Managers
-- ════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. LEADS TABLE
-- Central repository for all business leads/prospective stores
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Lead identification
  business_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  business_region VARCHAR(100),
  business_type VARCHAR(100),
  
  -- Current tracking status
  status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'converted', 'rejected', 'inactive')),
  status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP,
  
  -- Metadata
  source VARCHAR(100),
  notes TEXT,
  priority SMALLINT DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
  
  -- Contact history
  last_contact_at TIMESTAMP,
  contact_count SMALLINT DEFAULT 0,
  
  -- Conversion (once status = converted)
  converted_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  converted_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX marketing_leads_assigned_to ON marketing_leads(assigned_to);
CREATE INDEX marketing_leads_status ON marketing_leads(status);
CREATE INDEX marketing_leads_created_at ON marketing_leads(created_at DESC);

COMMENT ON TABLE marketing_leads IS 'Lead management for sales and marketing associates';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. LEAD STATUS HISTORY (Audit Trail)
-- Tracks all status changes for compliance and performance monitoring
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_lead_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  
  -- Status transition
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  
  -- Who made the change
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Optional context
  reason TEXT,
  note TEXT
);

-- Indexes
CREATE INDEX marketing_lead_status_history_lead_id ON marketing_lead_status_history(lead_id);
CREATE INDEX marketing_lead_status_history_changed_at ON marketing_lead_status_history(changed_at DESC);

COMMENT ON TABLE marketing_lead_status_history IS 'Audit trail for lead status changes';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. CONTACT ATTEMPTS TRACKING
-- Tracks every contact attempt (call, email, visit) for follow-up and history
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_contact_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
  
  -- Contact details
  contact_type VARCHAR(50) NOT NULL CHECK (contact_type IN ('call', 'email', 'visit', 'whatsapp', 'website_form')),
  contact_method VARCHAR(100),
  
  -- Outcome
  outcome VARCHAR(50) NOT NULL CHECK (outcome IN ('success', 'no_answer', 'rejected', 'interested', 'scheduled', 'not_available')),
  
  -- Associate who contacted
  contacted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contacted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Details
  notes TEXT,
  follow_up_scheduled_at TIMESTAMP,
  follow_up_completed BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX marketing_contact_attempts_lead_id ON marketing_contact_attempts(lead_id);
CREATE INDEX marketing_contact_attempts_contacted_by ON marketing_contact_attempts(contacted_by);
CREATE INDEX marketing_contact_attempts_contacted_at ON marketing_contact_attempts(contacted_at DESC);

COMMENT ON TABLE marketing_contact_attempts IS 'Contact history for each lead';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. WEEKLY TASKS / TARGETS
-- Managers assign weekly targets to Associates
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_weekly_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Task assignment
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Weekly period (ISO week: 2026-W15)
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Targets
  contacts_target SMALLINT NOT NULL DEFAULT 500, -- e.g., "Contact 500 stores this week"
  contacts_completed SMALLINT DEFAULT 0,
  
  conversion_target SMALLINT DEFAULT 0,
  conversions_completed SMALLINT DEFAULT 0,
  
  -- Additional metrics/notes
  focus_region VARCHAR(100),
  notes TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX marketing_weekly_tasks_assigned_to ON marketing_weekly_tasks(assigned_to);
CREATE INDEX marketing_weekly_tasks_week_start ON marketing_weekly_tasks(week_start DESC);

COMMENT ON TABLE marketing_weekly_tasks IS 'Weekly targets assigned by managers to associates';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. ASSOCIATES PROFILE / METADATA
-- Extends profiles table with marketing-specific data
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_associate_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Profile info
  display_name VARCHAR(255),
  team_lead UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Performance tracking
  total_leads_assigned SMALLINT DEFAULT 0,
  total_conversions SMALLINT DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Restrictions / Settings
  assigned_regions TEXT[], -- JSON array of regions (for filtering)
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Contact sharing settings
  can_share_lead_contacts BOOLEAN DEFAULT FALSE, -- Whether manager can view this associate's contact attempts
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX marketing_associate_profile_team_lead ON marketing_associate_profile(team_lead);

COMMENT ON TABLE marketing_associate_profile IS 'Marketing-specific profile for associates';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. ROLE HIERARCHY UPDATE (User_Roles Enhancement)
-- Update existing user_roles table to support marketing roles
-- ──────────────────────────────────────────────────────────────────────────
-- Note: This step requires updating the constraint in the user_roles table
-- ALTER TYPE user_role ADD VALUE 'marketing_associate' BEFORE 'merchant';
-- ALTER TYPE user_role ADD VALUE 'marketing_manager' BEFORE 'merchant';
-- These need to be run separately or the Enum type must be recreated

-- Create a temporary table to track marketing role assignments
CREATE TABLE marketing_role_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  marketing_role VARCHAR(50) NOT NULL CHECK (marketing_role IN ('associate', 'manager', 'director')),
  
  -- Management hierarchy
  reports_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Access control
  can_view_all_leads BOOLEAN DEFAULT FALSE,
  can_assign_leads BOOLEAN DEFAULT FALSE,
  can_create_tasks BOOLEAN DEFAULT FALSE,
  can_send_emails BOOLEAN DEFAULT FALSE,
  can_view_performance BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX marketing_role_mappings_user_id ON marketing_role_mappings(user_id);
CREATE INDEX marketing_role_mappings_reports_to ON marketing_role_mappings(reports_to);

COMMENT ON TABLE marketing_role_mappings IS 'Marketing role hierarchy and permissions';

-- ──────────────────────────────────────────────────────────────────────────
-- 7. EMAIL CAMPAIGN TRACKING
-- Track emails sent via v1-marketing-email function
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Campaign info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Email template
  template_id VARCHAR(100),
  subject VARCHAR(255),
  
  -- Recipients
  recipient_type VARCHAR(50) CHECK (recipient_type IN ('all_leads', 'specific_status', 'assigned_to')),
  target_lead_status VARCHAR(50),
  target_assigned_to UUID REFERENCES auth.users(id),
  
  -- Metrics
  total_recipients SMALLINT DEFAULT 0,
  sent_count SMALLINT DEFAULT 0,
  opened_count SMALLINT DEFAULT 0,
  clicked_count SMALLINT DEFAULT 0,
  
  -- Timestamps
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX marketing_email_campaigns_created_by ON marketing_email_campaigns(created_by);

COMMENT ON TABLE marketing_email_campaigns IS 'Email campaign tracking';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS Policies
-- ──────────────────────────────────────────────────────────────────────────

-- Enable RLS
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_lead_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_contact_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_associate_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_role_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_email_campaigns ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- Associates can only see their own leads and tasks
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY "associates_see_own_leads" ON marketing_leads
  FOR SELECT USING (
    assigned_to = auth.uid() OR
    auth.uid() IN (SELECT user_id FROM marketing_role_mappings WHERE marketing_role = 'manager')
  );

CREATE POLICY "associates_can_update_own_leads" ON marketing_leads
  FOR UPDATE USING (
    assigned_to = auth.uid()
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Managers can see all leads in their team
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY "managers_see_all_leads" ON marketing_leads
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM marketing_role_mappings WHERE marketing_role = 'manager' AND can_view_all_leads = TRUE)
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Contact attempts visibility
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY "associates_see_own_contact_attempts" ON marketing_contact_attempts
  FOR SELECT USING (
    contacted_by = auth.uid() OR
    lead_id IN (SELECT id FROM marketing_leads WHERE assigned_to = auth.uid())
  );

CREATE POLICY "managers_see_team_contact_attempts" ON marketing_contact_attempts
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM marketing_role_mappings WHERE marketing_role = 'manager' AND can_view_all_leads = TRUE)
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Weekly task policies
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY "associates_see_own_tasks" ON marketing_weekly_tasks
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "managers_see_team_tasks" ON marketing_weekly_tasks
  FOR SELECT USING (
    assigned_by = auth.uid() OR
    auth.uid() IN (SELECT user_id FROM marketing_role_mappings WHERE marketing_role = 'manager' AND can_create_tasks = TRUE)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- SUMMARY OF CHANGES
-- ════════════════════════════════════════════════════════════════════════════
-- 1. marketing_leads: Central CRM for all business leads
-- 2. marketing_lead_status_history: Audit trail for status changes
-- 3. marketing_contact_attempts: Track all contact interactions
-- 4. marketing_weekly_tasks: Manager-assigned weekly quotas
-- 5. marketing_associate_profile: Associate metadata
-- 6. marketing_role_mappings: Role hierarchy and permissions
-- 7. marketing_email_campaigns: Email tracking
-- 8. RLS policies for secure role-based access
-- ════════════════════════════════════════════════════════════════════════════
