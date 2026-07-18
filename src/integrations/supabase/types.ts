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
      coaching_sessions: {
        Row: {
          agent_id: string
          coach_id: string | null
          completed_at: string | null
          created_at: string
          duration_minutes: number
          feedback_id: string | null
          id: string
          notes: string | null
          outcome: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["coaching_status"]
          topic: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          feedback_id?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["coaching_status"]
          topic: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number
          feedback_id?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          scheduled_at?: string
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
        ]
      }
      email_queue: {
        Row: {
          attachments: Json
          attempts: number
          created_at: string
          created_by: string | null
          delivered_at: string | null
          feedback_id: string | null
          html: string
          id: string
          kind: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          priority: number
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
          text_body: string
          to_email: string
          to_name: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          attempts?: number
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          feedback_id?: string | null
          html: string
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          priority?: number
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          text_body: string
          to_email: string
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          attempts?: number
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          feedback_id?: string | null
          html?: string
          id?: string
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          priority?: number
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          text_body?: string
          to_email?: string
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
          enabled: boolean
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
          enabled?: boolean
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
          enabled?: boolean
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
          root_cause: string | null
          score: number | null
          sent_at: string | null
          severity: Database["public"]["Enums"]["feedback_severity"]
          status: Database["public"]["Enums"]["feedback_status"]
          strengths: string | null
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
          root_cause?: string | null
          score?: number | null
          sent_at?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          status?: Database["public"]["Enums"]["feedback_status"]
          strengths?: string | null
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
          root_cause?: string | null
          score?: number | null
          sent_at?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          status?: Database["public"]["Enums"]["feedback_status"]
          strengths?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      action_item_status: "open" | "in_progress" | "done" | "blocked"
      app_role: "super_admin" | "qa_admin" | "team_manager" | "read_only"
      coaching_status: "scheduled" | "completed" | "canceled" | "no_show"
      feedback_severity: "low" | "medium" | "high" | "critical"
      feedback_status:
        | "draft"
        | "review"
        | "approved"
        | "sent"
        | "acknowledged"
        | "completed"
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
      coaching_status: ["scheduled", "completed", "canceled", "no_show"],
      feedback_severity: ["low", "medium", "high", "critical"],
      feedback_status: [
        "draft",
        "review",
        "approved",
        "sent",
        "acknowledged",
        "completed",
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
