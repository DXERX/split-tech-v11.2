export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          phone: string | null
          company_name: string | null
          avatar_url: string | null
          is_banned: boolean
          banned_at: string | null
          banned_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: 'super_owner' | 'it_support' | 'customer_support' | 'marketing_manager' | 'marketing_associate' | 'merchant'
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_roles']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['user_roles']['Insert']>
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          tier: 'basic' | 'pro' | 'enterprise'
          status: 'pending' | 'active' | 'cancelled' | 'expired' | 'suspended'
          start_date: string | null
          end_date: string | null
          monthly_amount: number | null
          auto_renew: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['subscriptions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['subscriptions']['Insert']>
      }
      stores: {
        Row: {
          id: string
          user_id: string
          subscription_id: string | null
          name: string
          store_status: 'pending' | 'active' | 'inactive' | 'suspended'
          custom_questions: string[]
          working_hours: { start: number; end: number }
          rtsp_url: string | null
          rtsp_password_encrypted: string | null
          camera_ip: string | null
          camera_username: string | null
          verification_status: 'pending' | 'under_review' | 'verified' | 'rejected'
          verification_requested_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          verification_notes: string | null
          network_mode: 'single_network'
          hardware_choice: 'raspberry_pi' | 'software'
          interval_minutes: number
          whatsapp_enabled: boolean
          whatsapp_number: string | null
          debug_mode: boolean
          remote_command: 'run' | 'stop' | 'restart'
          admin_override_signal: 'START' | 'STOP' | 'RESTART' | null
          last_heartbeat: string | null
          approved_by: string | null
          approved_at: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['stores']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['stores']['Insert']>
      }
      store_api_keys: {
        Row: {
          id: string
          store_id: string
          license_key: string
          api_key: string
          key_preview: string
          is_active: boolean
          machine_fingerprint: string | null
          activated_at: string | null
          expires_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['store_api_keys']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['store_api_keys']['Insert']>
      }
      analytics_logs: {
        Row: {
          id: string
          store_id: string
          score: number | null
          status: 'pass' | 'warning' | 'fail' | null
          summary: string | null
          result: Record<string, unknown>
          observations: Array<{ question: string; answer: string }>
          ai_reasoning: string | null
          confidence_score: number | null
          client_environment: Record<string, unknown>
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['analytics_logs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['analytics_logs']['Insert']>
      }
      engine_heartbeats: {
        Row: {
          id: string
          store_id: string
          status: 'active' | 'idle' | 'error' | null
          cpu_usage: number | null
          memory_usage: number | null
          engine_version: string | null
          os_info: string | null
          last_audit_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['engine_heartbeats']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['engine_heartbeats']['Insert']>
      }
      security_alerts: {
        Row: {
          id: string
          store_id: string
          alert_type: string
          severity: 'low' | 'medium' | 'high' | 'critical' | null
          message: string | null
          metadata: Record<string, unknown> | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['security_alerts']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['security_alerts']['Insert']>
      }
      support_tickets: {
        Row: {
          id: string
          store_id: string | null
          user_id: string
          title: string
          description: string | null
          category: 'technical' | 'billing' | 'general' | 'hardware' | 'activation' | null
          priority: 'low' | 'medium' | 'high' | 'urgent'
          status: 'open' | 'in_progress' | 'resolved' | 'closed'
          assigned_to: string | null
          closed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['support_tickets']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['support_tickets']['Insert']>
      }
      ticket_messages: {
        Row: {
          id: string
          ticket_id: string
          user_id: string
          message: string
          is_internal: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ticket_messages']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['ticket_messages']['Insert']>
      }
      broadcasts: {
        Row: {
          id: string
          title: string
          message: string
          type: 'info' | 'warning' | 'maintenance' | 'feature' | 'urgent'
          target: 'all' | 'merchants' | 'it'
          is_active: boolean
          expires_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['broadcasts']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['broadcasts']['Insert']>
      }
      marketing_leads: {
        Row: {
          id: string
          business_name: string
          contact_name: string | null
          contact_phone: string | null
          contact_email: string | null
          business_region: string | null
          business_type: string | null
          status: 'new' | 'contacted' | 'interested' | 'trial_active' | 'converted' | 'rejected' | 'inactive'
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
        Insert: Omit<Database['public']['Tables']['marketing_leads']['Row'], 'id' | 'created_at' | 'updated_at' | 'status_updated_at' | 'contact_count' | 'last_activity_at' | 'claim_count'>
        Update: Partial<Database['public']['Tables']['marketing_leads']['Insert']>
      }
      marketing_lead_status_history: {
        Row: {
          id: string
          lead_id: string
          old_status: string | null
          new_status: string
          changed_by: string | null
          changed_at: string
          reason: string | null
          note: string | null
        }
        Insert: Omit<Database['public']['Tables']['marketing_lead_status_history']['Row'], 'id' | 'changed_at'>
        Update: Partial<Database['public']['Tables']['marketing_lead_status_history']['Insert']>
      }
      marketing_contact_attempts: {
        Row: {
          id: string
          lead_id: string
          contact_type: 'call' | 'email' | 'visit' | 'whatsapp' | 'website_form'
          contact_method: string | null
          outcome: 'success' | 'no_answer' | 'rejected' | 'interested' | 'scheduled' | 'not_available'
          contacted_by: string | null
          contacted_at: string
          notes: string | null
          follow_up_scheduled_at: string | null
          follow_up_completed: boolean
        }
        Insert: Omit<Database['public']['Tables']['marketing_contact_attempts']['Row'], 'id' | 'contacted_at' | 'follow_up_completed'>
        Update: Partial<Database['public']['Tables']['marketing_contact_attempts']['Insert']>
      }
      marketing_weekly_tasks: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['marketing_weekly_tasks']['Row'], 'id' | 'created_at' | 'updated_at' | 'assigned_at' | 'contacts_completed' | 'conversions_completed'>
        Update: Partial<Database['public']['Tables']['marketing_weekly_tasks']['Insert']>
      }
      marketing_associate_profile: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['marketing_associate_profile']['Row'], 'created_at' | 'updated_at' | 'total_leads_assigned' | 'total_conversions' | 'conversion_rate'>
        Update: Partial<Database['public']['Tables']['marketing_associate_profile']['Insert']>
      }
      marketing_role_mappings: {
        Row: {
          id: string
          user_id: string
          marketing_role: 'associate' | 'manager' | 'director'
          reports_to: string | null
          can_view_all_leads: boolean
          can_assign_leads: boolean
          can_create_tasks: boolean
          can_send_emails: boolean
          can_view_performance: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['marketing_role_mappings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['marketing_role_mappings']['Insert']>
      }
      marketing_email_campaigns: {
        Row: {
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
        Insert: Omit<Database['public']['Tables']['marketing_email_campaigns']['Row'], 'id' | 'created_at' | 'total_recipients' | 'sent_count' | 'opened_count' | 'clicked_count'>
        Update: Partial<Database['public']['Tables']['marketing_email_campaigns']['Insert']>
      }
    }
    Functions: {
      get_user_role: { Args: { uid?: string }; Returns: string }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      is_super_owner: { Args: { uid?: string }; Returns: boolean }
      approve_store: { Args: { p_store_id: string; p_admin_id: string }; Returns: { success: boolean; error?: string } }
      renew_subscription: { Args: { p_subscription_id: string; p_months?: number }; Returns: { success: boolean; new_end_date?: string } }
    }
  }
}
