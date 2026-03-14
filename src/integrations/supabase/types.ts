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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          org_id: string
          priority: string
          response: string | null
          sender_id: string
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          org_id: string
          priority?: string
          response?: string | null
          sender_id: string
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          org_id?: string
          priority?: string
          response?: string | null
          sender_id?: string
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_usage_events: {
        Row: {
          agent_id: string
          cost_usd: number | null
          created_at: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          org_id: string
          output_tokens: number | null
          tool_calls: number | null
        }
        Insert: {
          agent_id: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          org_id: string
          output_tokens?: number | null
          tool_calls?: number | null
        }
        Update: {
          agent_id?: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          org_id?: string
          output_tokens?: number | null
          tool_calls?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cap_table_entries: {
        Row: {
          created_at: string
          date: string | null
          id: string
          investment_amount: number | null
          organization_id: string
          ownership_pct: number
          round_name: string | null
          share_price: number | null
          shares: number
          stakeholder_name: string
          stakeholder_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          id?: string
          investment_amount?: number | null
          organization_id: string
          ownership_pct?: number
          round_name?: string | null
          share_price?: number | null
          shares?: number
          stakeholder_name: string
          stakeholder_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string | null
          id?: string
          investment_amount?: number | null
          organization_id?: string
          ownership_pct?: number
          round_name?: string | null
          share_price?: number | null
          shares?: number
          stakeholder_name?: string
          stakeholder_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cap_table_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cma_campaigns: {
        Row: {
          budget: number | null
          channels: string[] | null
          created_at: string | null
          end_date: string | null
          id: string
          metrics: Json | null
          name: string
          org_id: string
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          channels?: string[] | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          metrics?: Json | null
          name: string
          org_id: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          channels?: string[] | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          metrics?: Json | null
          name?: string
          org_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cma_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cma_content_drafts: {
        Row: {
          content: string
          created_at: string | null
          id: string
          org_id: string
          published_url: string | null
          seo_keywords: string[] | null
          status: string
          target_audience: string | null
          title: string
          tone: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          org_id: string
          published_url?: string | null
          seo_keywords?: string[] | null
          status?: string
          target_audience?: string | null
          title: string
          tone?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          org_id?: string
          published_url?: string | null
          seo_keywords?: string[] | null
          status?: string
          target_audience?: string | null
          title?: string
          tone?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cma_content_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coa_communications: {
        Row: {
          body: string
          created_at: string | null
          id: string
          org_id: string
          recipient: string
          status: string
          subject: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          org_id: string
          recipient: string
          status?: string
          subject: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          org_id?: string
          recipient?: string
          status?: string
          subject?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coa_communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coa_processes: {
        Row: {
          created_at: string | null
          id: string
          metrics: Json | null
          name: string
          org_id: string
          owner_agent_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metrics?: Json | null
          name: string
          org_id: string
          owner_agent_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metrics?: Json | null
          name?: string
          org_id?: string
          owner_agent_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coa_processes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coa_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          org_id: string
          priority: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          priority?: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          priority?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coa_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_governance_log: {
        Row: {
          action: string
          affected_agents: string[] | null
          created_at: string | null
          decision: string
          id: string
          org_id: string
          severity: string
        }
        Insert: {
          action: string
          affected_agents?: string[] | null
          created_at?: string | null
          decision: string
          id?: string
          org_id: string
          severity?: string
        }
        Update: {
          action?: string
          affected_agents?: string[] | null
          created_at?: string | null
          decision?: string
          id?: string
          org_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_governance_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_policy_register: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          owner: string
          review_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          owner: string
          review_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          owner?: string
          review_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_policy_register_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_risk_assessments: {
        Row: {
          created_at: string | null
          description: string
          id: string
          impact: string
          likelihood: string
          mitigation: string | null
          org_id: string
          risk_type: string
          status: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          impact: string
          likelihood: string
          mitigation?: string | null
          org_id: string
          risk_type: string
          status?: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          impact?: string
          likelihood?: string
          mitigation?: string | null
          org_id?: string
          risk_type?: string
          status?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_risk_assessments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          organization_id: string
          parent_document_id: string | null
          size_bytes: number | null
          storage_path: string
          tags: string[] | null
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          organization_id: string
          parent_document_id?: string | null
          size_bytes?: number | null
          storage_path: string
          tags?: string[] | null
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          organization_id?: string
          parent_document_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          tags?: string[] | null
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ea_communications_log: {
        Row: {
          body: string
          created_at: string
          id: string
          organization_id: string
          recipients: string[] | null
          sender: string
          status: string
          subject: string
          tags: string[] | null
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          organization_id: string
          recipients?: string[] | null
          sender?: string
          status?: string
          subject: string
          tags?: string[] | null
          type: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
          recipients?: string[] | null
          sender?: string
          status?: string
          subject?: string
          tags?: string[] | null
          type?: string
        }
        Relationships: []
      }
      ea_meeting_notes: {
        Row: {
          action_items: Json
          attendees: string[]
          created_at: string
          date: string
          id: string
          key_decisions: string[] | null
          organization_id: string
          summary: string
          tags: string[] | null
          title: string
        }
        Insert: {
          action_items?: Json
          attendees?: string[]
          created_at?: string
          date: string
          id?: string
          key_decisions?: string[] | null
          organization_id: string
          summary: string
          tags?: string[] | null
          title: string
        }
        Update: {
          action_items?: Json
          attendees?: string[]
          created_at?: string
          date?: string
          id?: string
          key_decisions?: string[] | null
          organization_id?: string
          summary?: string
          tags?: string[] | null
          title?: string
        }
        Relationships: []
      }
      ea_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          priority?: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          priority?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_model: {
        Row: {
          amount: number
          category: string
          created_at: string
          formula: string | null
          id: string
          month: string
          organization_id: string
          scenario: string
          subcategory: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          formula?: string | null
          id?: string
          month: string
          organization_id: string
          scenario?: string
          subcategory: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          formula?: string | null
          id?: string
          month?: string
          organization_id?: string
          scenario?: string
          subcategory?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_model_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token_encrypted: string | null
          api_key_encrypted: string | null
          auth_type: string
          connected_at: string
          connected_by: string
          created_at: string
          id: string
          last_synced_at: string | null
          organization_id: string
          provider: string
          provider_metadata: Json | null
          refresh_token_encrypted: string | null
          status: string
          sync_error: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          api_key_encrypted?: string | null
          auth_type: string
          connected_at?: string
          connected_by: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          organization_id: string
          provider: string
          provider_metadata?: Json | null
          refresh_token_encrypted?: string | null
          status?: string
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          api_key_encrypted?: string | null
          auth_type?: string
          connected_at?: string
          connected_by?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          organization_id?: string
          provider?: string
          provider_metadata?: Json | null
          refresh_token_encrypted?: string | null
          status?: string
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_links: {
        Row: {
          allowed_document_ids: string[] | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          passcode: string | null
          require_email: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          allowed_document_ids?: string[] | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          passcode?: string | null
          require_email?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          allowed_document_ids?: string[] | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          passcode?: string | null
          require_email?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          source: string | null
          source_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          source?: string | null
          source_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          source?: string | null
          source_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_ip_portfolio: {
        Row: {
          created_at: string | null
          expiry_date: string | null
          filing_date: string | null
          id: string
          name: string
          org_id: string
          registration_number: string | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expiry_date?: string | null
          filing_date?: string | null
          id?: string
          name: string
          org_id: string
          registration_number?: string | null
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expiry_date?: string | null
          filing_date?: string | null
          id?: string
          name?: string
          org_id?: string
          registration_number?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_ip_portfolio_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_reviews: {
        Row: {
          created_at: string | null
          id: string
          key_issues: Json | null
          org_id: string
          recommendations: string | null
          risk_level: string
          status: string
          subject: string
          summary: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_issues?: Json | null
          org_id: string
          recommendations?: string | null
          risk_level: string
          status?: string
          subject: string
          summary: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key_issues?: Json | null
          org_id?: string
          recommendations?: string | null
          risk_level?: string
          status?: string
          subject?: string
          summary?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      link_views: {
        Row: {
          created_at: string
          device_info: Json | null
          duration_seconds: number | null
          id: string
          last_page_viewed: number | null
          link_id: string
          organization_id: string
          pages_viewed: number | null
          started_at: string
          total_pages: number | null
          viewer_email: string | null
          viewer_ip: string | null
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          duration_seconds?: number | null
          id?: string
          last_page_viewed?: number | null
          link_id: string
          organization_id: string
          pages_viewed?: number | null
          started_at?: string
          total_pages?: number | null
          viewer_email?: string | null
          viewer_ip?: string | null
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          duration_seconds?: number | null
          id?: string
          last_page_viewed?: number | null
          link_id?: string
          organization_id?: string
          pages_viewed?: number | null
          started_at?: string
          total_pages?: number | null
          viewer_email?: string | null
          viewer_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_views_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "investor_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_sheets: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          sheet_url: string
          spreadsheet_id: string
          template_id: string
          template_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          sheet_url: string
          spreadsheet_id: string
          template_id: string
          template_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          sheet_url?: string
          spreadsheet_id?: string
          template_id?: string
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_sheets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_call_logs: {
        Row: {
          action_items: Json | null
          created_at: string | null
          id: string
          next_steps: string | null
          org_id: string
          pipeline_id: string | null
          sentiment: string | null
          summary: string
          type: string
        }
        Insert: {
          action_items?: Json | null
          created_at?: string | null
          id?: string
          next_steps?: string | null
          org_id: string
          pipeline_id?: string | null
          sentiment?: string | null
          summary: string
          type: string
        }
        Update: {
          action_items?: Json | null
          created_at?: string | null
          id?: string
          next_steps?: string | null
          org_id?: string
          pipeline_id?: string | null
          sentiment?: string | null
          summary?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_call_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_call_logs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "sales_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_pipeline: {
        Row: {
          company: string
          contact: string | null
          created_at: string | null
          expected_close: string | null
          id: string
          notes: string | null
          org_id: string
          probability: number | null
          source: string | null
          stage: string
          tags: string[] | null
          updated_at: string | null
          value: number | null
        }
        Insert: {
          company: string
          contact?: string | null
          created_at?: string | null
          expected_close?: string | null
          id?: string
          notes?: string | null
          org_id: string
          probability?: number | null
          source?: string | null
          stage?: string
          tags?: string[] | null
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          company?: string
          contact?: string | null
          created_at?: string | null
          expected_close?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          probability?: number | null
          source?: string | null
          stage?: string
          tags?: string[] | null
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_pipeline_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_create_org: { Args: { _user_id: string }; Returns: boolean }
      create_organization: { Args: { _name: string }; Returns: string }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _org_id: string
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "cofounder" | "advisor" | "investor"
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
      app_role: ["owner", "cofounder", "advisor", "investor"],
    },
  },
} as const
