export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          department: string
          email: string
          employee_id: string
          full_name: string
          id: string
          joining_date: string | null
          manager_name: string | null
          qa_score: number | null
          status: string
          team: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          department: string
          email: string
          employee_id: string
          full_name: string
          id?: string
          joining_date?: string | null
          manager_name?: string | null
          qa_score?: number | null
          status?: string
          team?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          department?: string
          email?: string
          employee_id?: string
          full_name?: string
          id?: string
          joining_date?: string | null
          manager_name?: string | null
          qa_score?: number | null
          status?: string
          team?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      coaching_action_items: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          session_id: string
          status: Database["public"]["Enums"]["action_item_status"]
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["action_item_status"]
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["action_item_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_action_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_goals: {
        Row: {
          achieved_at: string | null
          created_at: string
          current_value: number
          description: string | null
          id: string
          metric: string | null
          plan_id: string
          status: Database["public"]["Enums"]["coaching_goal_status"]
          target_date: string | null
          target_value: number | null
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          current_value?: number
          description?: string | null
          id?: string
          metric?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["coaching_goal_status"]
          target_date?: string | null
          target_value?: number | null
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          current_value?: number
          description?: string | null
          id?: string
          metric?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["coaching_goal_status"]
          target_date?: string | null
          target_value?: number | null
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "coaching_goals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "coaching_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_plans: {
        Row: {
          agent_id: string
          coach_id: string | null
          created_at: string
          description: string | null
          id: string
          start_date: string
          status: Database["public"]["Enums"]["coaching_plan_status"]
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          coach_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["coaching_plan_status"]
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          coach_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["coaching_plan_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_plans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          agenda: string | null
          agent_id: string
          cancelled_at: string | null
          cancelled_reason: string | null
          coach_id: string | null
          completed_at: string | null
          created_at: string
          duration_minutes: number
          feedback_id: string | null
          follow_up_date: string | null
          id: string
          meeting_link: string | null
          meeting_location: string | null
          notes: string | null
          outcome: string | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["coaching_priority"]
          reminder_minutes: number | null
          rescheduled_from_id: string | null
          scheduled_at: string
          session_type: Database["public"]["Enums"]["coaching_session_type"]
          status: Database["public"]["Enums"]["coaching_status"]
          topic: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          agent_id: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          feedback_id?: string | null
          follow_up_date?: string | null
          id?: string
          meeting_link?: string | null
          meeting_location?: string | null
          notes?: string | null
          outcome?: string | null
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["coaching_priority"]
          reminder_minutes?: number | null
          rescheduled_from_id?: string | null
          scheduled_at: string
          session_type?: Database["public"]["Enums"]["coaching_session_type"]
          status?: Database["public"]["Enums"]["coaching_status"]
          topic: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          agent_id?: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          feedback_id?: string | null
          follow_up_date?: string | null
          id?: string
          meeting_link?: string | null
          meeting_location?: string | null
          notes?: string | null
          outcome?: string | null
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["coaching_priority"]
          reminder_minutes?: number | null
          rescheduled_from_id?: string | null
          scheduled_at?: string
          session_type?: Database["public"]["Enums"]["coaching_session_type"]
          status?: Database["public"]["Enums"]["coaching_status"]
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "coaching_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "coaching_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attachments: Json
          attempts: number
          bounce_reason: string | null
          bounced_at: string | null
          complained_at: string | null
          complaint_reason: string | null
          created_at: string
          created_by: string | null
          defer_reason: string | null
          deferred_until: string | null
          delivered_at: string | null
          feedback_id: string | null
          html: string
          id: string
          kind: string
          last_error: string | null
          last_event_at: string | null
          max_attempts: number
          next_attempt_at: string
          priority: number
          provider: string | null
          provider_message_id: string | null
          provider_status: string | null
          sent_at: string | null
          status: string
          subject: string
          text_body: string
          to_email: string
          to_email_intended: string | null
          to_name: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          attempts?: number
          bounce_reason?: string | null
          bounced_at?: string | null
          complained_at?: string | null
          complaint_reason?: string | null
          created_at?: string
          created_by?: string | null
          defer_reason?: string | null
          deferred_until?: string | null
          delivered_at?: string | null
          feedback_id?: string | null
          html: string
          id?: string
          kind?: string
          last_error?: string | null
          last_event_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          priority?: number
          provider?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          text_body: string
          to_email: string
          to_email_intended?: string | null
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          attempts?: number
          bounce_reason?: string | null
          bounced_at?: string | null
          complained_at?: string | null
          complaint_reason?: string | null
          created_at?: string
          created_by?: string | null
          defer_reason?: string | null
          deferred_until?: string | null
          delivered_at?: string | null
          feedback_id?: string | null
          html?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_event_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          priority?: number
          provider?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          text_body?: string
          to_email?: string
          to_email_intended?: string | null
          to_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          confidentiality_notice: string | null
          created_at: string
          dev_override_enabled: boolean
          dev_override_recipient: string | null
          enabled: boolean
          feedback_template_enabled: boolean
          feedback_template_html: string | null
          feedback_template_subject: string | null
          feedback_template_text: string | null
          id: string
          logo_url: string | null
          provider: string
          reply_to: string | null
          sender_email: string | null
          sender_name: string
          signature_html: string | null
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confidentiality_notice?: string | null
          created_at?: string
          dev_override_enabled?: boolean
          dev_override_recipient?: string | null
          enabled?: boolean
          feedback_template_enabled?: boolean
          feedback_template_html?: string | null
          feedback_template_subject?: string | null
          feedback_template_text?: string | null
          id?: string
          logo_url?: string | null
          provider?: string
          reply_to?: string | null
          sender_email?: string | null
          sender_name?: string
          signature_html?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confidentiality_notice?: string | null
          created_at?: string
          dev_override_enabled?: boolean
          dev_override_recipient?: string | null
          enabled?: boolean
          feedback_template_enabled?: boolean
          feedback_template_html?: string | null
          feedback_template_subject?: string | null
          feedback_template_text?: string | null
          id?: string
          logo_url?: string | null
          provider?: string
          reply_to?: string | null
          sender_email?: string | null
          sender_name?: string
          signature_html?: string | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          matched_feedback_id: string | null
          matched_queue_id: string | null
          payload: Json
          provider: string
          provider_message_id: string | null
          recipient: string | null
          signature_valid: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          matched_feedback_id?: string | null
          matched_queue_id?: string | null
          payload?: Json
          provider: string
          provider_message_id?: string | null
          recipient?: string | null
          signature_valid?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          matched_feedback_id?: string | null
          matched_queue_id?: string | null
          payload?: Json
          provider?: string
          provider_message_id?: string | null
          recipient?: string | null
          signature_valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "email_webhook_events_matched_feedback_id_fkey"
            columns: ["matched_feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_webhook_events_matched_queue_id_fkey"
            columns: ["matched_queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          acknowledged_at: string | null
          acknowledgement_note: string | null
          agent_id: string
          case_id: string | null
          category: string
          click_count: number
          clicked_at: string | null
          created_at: string
          created_by: string
          delivered_at: string | null
          due_date: string | null
          email_error: string | null
          escalated_at: string | null
          feedback_type: Database["public"]["Enums"]["feedback_type"]
          first_opened_at: string | null
          id: string
          improvements: string | null
          last_reminder_at: string | null
          open_count: number
          opened_at: string | null
          recommended_actions: string | null
          reminder_count: number
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          root_cause: string | null
          score: number | null
          sent_at: string | null
          severity: Database["public"]["Enums"]["feedback_severity"]
          status: Database["public"]["Enums"]["feedback_status"]
          strengths: string | null
          submitted_for_review_at: string | null
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledgement_note?: string | null
          agent_id: string
          case_id?: string | null
          category: string
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          created_by: string
          delivered_at?: string | null
          due_date?: string | null
          email_error?: string | null
          escalated_at?: string | null
          feedback_type?: Database["public"]["Enums"]["feedback_type"]
          first_opened_at?: string | null
          id?: string
          improvements?: string | null
          last_reminder_at?: string | null
          open_count?: number
          opened_at?: string | null
          recommended_actions?: string | null
          reminder_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          root_cause?: string | null
          score?: number | null
          sent_at?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          status?: Database["public"]["Enums"]["feedback_status"]
          strengths?: string | null
          submitted_for_review_at?: string | null
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledgement_note?: string | null
          agent_id?: string
          case_id?: string | null
          category?: string
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          created_by?: string
          delivered_at?: string | null
          due_date?: string | null
          email_error?: string | null
          escalated_at?: string | null
          feedback_type?: Database["public"]["Enums"]["feedback_type"]
          first_opened_at?: string | null
          id?: string
          improvements?: string | null
          last_reminder_at?: string | null
          open_count?: number
          opened_at?: string | null
          recommended_actions?: string | null
          reminder_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          root_cause?: string | null
          score?: number | null
          sent_at?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          status?: Database["public"]["Enums"]["feedback_status"]
          strengths?: string | null
          submitted_for_review_at?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_attachments: {
        Row: {
          created_at: string
          feedback_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          feedback_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          feedback_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_attachments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          comment: string | null
          created_at: string
          feedback_id: string
          from_status: Database["public"]["Enums"]["feedback_status"] | null
          id: string
          metadata: Json | null
          to_status: Database["public"]["Enums"]["feedback_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          feedback_id: string
          from_status?: Database["public"]["Enums"]["feedback_status"] | null
          id?: string
          metadata?: Json | null
          to_status?: Database["public"]["Enums"]["feedback_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          comment?: string | null
          created_at?: string
          feedback_id?: string
          from_status?: Database["public"]["Enums"]["feedback_status"] | null
          id?: string
          metadata?: Json | null
          to_status?: Database["public"]["Enums"]["feedback_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_audit_log_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_email_events: {
        Row: {
          created_at: string
          detail: Json
          event_type: string
          feedback_id: string
          id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          event_type: string
          feedback_id: string
          id?: string
        }
        Update: {
          created_at?: string
          detail?: Json
          event_type?: string
          feedback_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_email_events_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_progress: {
        Row: {
          goal_id: string
          id: string
          note: string | null
          recorded_at: string
          recorded_by: string | null
          value: number | null
        }
        Insert: {
          goal_id: string
          id?: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
          value?: number | null
        }
        Update: {
          goal_id?: string
          id?: string
          note?: string | null
          recorded_at?: string
          recorded_by?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "coaching_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string
          designation: string | null
          full_name: string | null
          id: string
          phone: string | null
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          designation?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          designation?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      report_schedules: {
        Row: {
          cadence: Database["public"]["Enums"]["report_cadence"]
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          enabled: boolean
          format: Database["public"]["Enums"]["report_format"]
          hour_utc: number
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string
          recipients: string[]
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at: string
        }
        Insert: {
          cadence: Database["public"]["Enums"]["report_cadence"]
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          format?: Database["public"]["Enums"]["report_format"]
          hour_utc?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string
          recipients?: string[]
          report_type: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Update: {
          cadence?: Database["public"]["Enums"]["report_cadence"]
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean
          format?: Database["public"]["Enums"]["report_format"]
          hour_utc?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string
          recipients?: string[]
          report_type?: Database["public"]["Enums"]["report_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_notification: {
        Args: {
          _body: string
          _entity_id: string
          _entity_type: string
          _link: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalc_agent_qa_score: { Args: { _agent_id: string }; Returns: undefined }
    }
    Enums: {
      action_item_status: "open" | "in_progress" | "done" | "blocked"
      app_role: "super_admin" | "qa_admin" | "team_manager" | "read_only"
      coaching_goal_status: "on_track" | "at_risk" | "achieved" | "missed"
      coaching_plan_status: "active" | "completed" | "archived"
      coaching_priority: "low" | "medium" | "high" | "urgent"
      coaching_session_type:
        | "coaching"
        | "review"
        | "one_on_one"
        | "training"
        | "follow_up"
      coaching_status:
        | "scheduled"
        | "completed"
        | "canceled"
        | "no_show"
        | "pending_approval"
        | "confirmed"
        | "in_progress"
        | "missed"
        | "rescheduled"
      feedback_severity: "low" | "medium" | "high" | "critical"
      feedback_status:
        | "draft"
        | "review"
        | "approved"
        | "queued"
        | "sent"
        | "acknowledged"
        | "completed"
        | "rejected"
        | "revision_required"
        | "ready_to_send"
        | "failed"
      feedback_type:
        | "positive"
        | "constructive"
        | "critical"
        | "compliance"
        | "coaching"
      report_cadence: "weekly" | "monthly"
      report_format: "pdf" | "csv" | "both"
      report_type: "agent_performance" | "feedback_trends" | "email_delivery"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_item_status: ["open", "in_progress", "done", "blocked"],
      app_role: ["super_admin", "qa_admin", "team_manager", "read_only"],
      coaching_goal_status: ["on_track", "at_risk", "achieved", "missed"],
      coaching_plan_status: ["active", "completed", "archived"],
      coaching_priority: ["low", "medium", "high", "urgent"],
      coaching_session_type: [
        "coaching",
        "review",
        "one_on_one",
        "training",
        "follow_up",
      ],
      coaching_status: [
        "scheduled",
        "completed",
        "canceled",
        "no_show",
        "pending_approval",
        "confirmed",
        "in_progress",
        "missed",
        "rescheduled",
      ],
      feedback_severity: ["low", "medium", "high", "critical"],
      feedback_status: [
        "draft",
        "review",
        "approved",
        "queued",
        "sent",
        "acknowledged",
        "completed",
        "rejected",
        "revision_required",
        "ready_to_send",
        "failed",
      ],
      feedback_type: [
        "positive",
        "constructive",
        "critical",
        "compliance",
        "coaching",
      ],
      report_cadence: ["weekly", "monthly"],
      report_format: ["pdf", "csv", "both"],
      report_type: ["agent_performance", "feedback_trends", "email_delivery"],
    },
  },
} as const
