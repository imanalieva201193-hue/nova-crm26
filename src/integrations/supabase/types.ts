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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      altegio_categories: {
        Row: {
          category_id: number
          kind: string | null
          title: string | null
        }
        Insert: {
          category_id: number
          kind?: string | null
          title?: string | null
        }
        Update: {
          category_id?: number
          kind?: string | null
          title?: string | null
        }
        Relationships: []
      }
      altegio_events: {
        Row: {
          error: string | null
          hook_id: string | null
          id: string
          location_id: number | null
          received_at: string
          resource: string | null
          resource_id: number | null
          result: string | null
          status: string | null
        }
        Insert: {
          error?: string | null
          hook_id?: string | null
          id?: string
          location_id?: number | null
          received_at?: string
          resource?: string | null
          resource_id?: number | null
          result?: string | null
          status?: string | null
        }
        Update: {
          error?: string | null
          hook_id?: string | null
          id?: string
          location_id?: number | null
          received_at?: string
          resource?: string | null
          resource_id?: number | null
          result?: string | null
          status?: string | null
        }
        Relationships: []
      }
      altegio_jobs: {
        Row: {
          api_calls: number
          created_at: string
          error: string | null
          from_date: string
          id: string
          imported: number
          kind: string
          lease_until: string | null
          loc_index: number
          location_ids: number[]
          page: number
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_calls?: number
          created_at?: string
          error?: string | null
          from_date: string
          id?: string
          imported?: number
          kind?: string
          lease_until?: string | null
          loc_index?: number
          location_ids?: number[]
          page?: number
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_calls?: number
          created_at?: string
          error?: string | null
          from_date?: string
          id?: string
          imported?: number
          kind?: string
          lease_until?: string | null
          loc_index?: number
          location_ids?: number[]
          page?: number
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      altegio_locations: {
        Row: {
          branch_code: string | null
          location_id: number
          title: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          location_id: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          location_id?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "altegio_locations_branch_code_fkey"
            columns: ["branch_code"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
        ]
      }
      altegio_records: {
        Row: {
          amount: number
          attendance: number
          branch_code: string | null
          changed_at_altegio: string | null
          client_id: number | null
          client_name: string | null
          confirmed: boolean
          created_at_altegio: string | null
          created_user_id: number | null
          deleted: boolean
          direction: string | null
          kind: string | null
          lead_id: string | null
          location_id: number
          matched_existing: boolean | null
          payload: Json
          phone: string | null
          phone_key: string | null
          record_id: number
          services: Json
          staff_id: number | null
          staff_name: string | null
          synced_at: string
          visit_at: string | null
        }
        Insert: {
          amount?: number
          attendance?: number
          branch_code?: string | null
          changed_at_altegio?: string | null
          client_id?: number | null
          client_name?: string | null
          confirmed?: boolean
          created_at_altegio?: string | null
          created_user_id?: number | null
          deleted?: boolean
          direction?: string | null
          kind?: string | null
          lead_id?: string | null
          location_id: number
          matched_existing?: boolean | null
          payload?: Json
          phone?: string | null
          phone_key?: string | null
          record_id: number
          services?: Json
          staff_id?: number | null
          staff_name?: string | null
          synced_at?: string
          visit_at?: string | null
        }
        Update: {
          amount?: number
          attendance?: number
          branch_code?: string | null
          changed_at_altegio?: string | null
          client_id?: number | null
          client_name?: string | null
          confirmed?: boolean
          created_at_altegio?: string | null
          created_user_id?: number | null
          deleted?: boolean
          direction?: string | null
          kind?: string | null
          lead_id?: string | null
          location_id?: number
          matched_existing?: boolean | null
          payload?: Json
          phone?: string | null
          phone_key?: string | null
          record_id?: number
          services?: Json
          staff_id?: number | null
          staff_name?: string | null
          synced_at?: string
          visit_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "altegio_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      altegio_services: {
        Row: {
          category_id: number | null
          service_id: number
          title: string | null
        }
        Insert: {
          category_id?: number | null
          service_id: number
          title?: string | null
        }
        Update: {
          category_id?: number | null
          service_id?: number
          title?: string | null
        }
        Relationships: []
      }
      altegio_staff: {
        Row: {
          doctor_id: string | null
          location_id: number
          manual: boolean
          name: string | null
          staff_id: number
        }
        Insert: {
          doctor_id?: string | null
          location_id: number
          manual?: boolean
          name?: string | null
          staff_id: number
        }
        Update: {
          doctor_id?: string | null
          location_id?: number
          manual?: boolean
          name?: string | null
          staff_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "altegio_staff_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      altegio_users: {
        Row: {
          employee_email: string | null
          manual: boolean
          name: string | null
          user_id: number
        }
        Insert: {
          employee_email?: string | null
          manual?: boolean
          name?: string | null
          user_id: number
        }
        Update: {
          employee_email?: string | null
          manual?: boolean
          name?: string | null
          user_id?: number
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          code: string
          funnels: string[]
          name: string
          profile: string | null
          sort: number | null
        }
        Insert: {
          address?: string | null
          code: string
          funnels?: string[]
          name: string
          profile?: string | null
          sort?: number | null
        }
        Update: {
          address?: string | null
          code?: string
          funnels?: string[]
          name?: string
          profile?: string | null
          sort?: number | null
        }
        Relationships: []
      }
      chat2desk_backfill_jobs: {
        Row: {
          api_calls: number
          api_host: string | null
          clients_imported: number
          clients_offset: number
          created_at: string
          cursor_start_id: number | null
          error: string | null
          from_date: string
          id: string
          lease_token: string | null
          lease_until: string | null
          phase: string
          requests_imported: number
          started_by: string
          status: string
          to_date: string
          updated_at: string
        }
        Insert: {
          api_calls?: number
          api_host?: string | null
          clients_imported?: number
          clients_offset?: number
          created_at?: string
          cursor_start_id?: number | null
          error?: string | null
          from_date: string
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          phase?: string
          requests_imported?: number
          started_by: string
          status?: string
          to_date: string
          updated_at?: string
        }
        Update: {
          api_calls?: number
          api_host?: string | null
          clients_imported?: number
          clients_offset?: number
          created_at?: string
          cursor_start_id?: number | null
          error?: string | null
          from_date?: string
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          phase?: string
          requests_imported?: number
          started_by?: string
          status?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat2desk_clients: {
        Row: {
          client_id: number
          first_channel_id: number | null
          first_seen_at: string | null
          first_transport: string | null
          last_seen_at: string | null
          messenger_id: string | null
          name: string | null
          patient_id: string | null
          phone: string | null
          requests_count: number
        }
        Insert: {
          client_id: number
          first_channel_id?: number | null
          first_seen_at?: string | null
          first_transport?: string | null
          last_seen_at?: string | null
          messenger_id?: string | null
          name?: string | null
          patient_id?: string | null
          phone?: string | null
          requests_count?: number
        }
        Update: {
          client_id?: number
          first_channel_id?: number | null
          first_seen_at?: string | null
          first_transport?: string | null
          last_seen_at?: string | null
          messenger_id?: string | null
          name?: string | null
          patient_id?: string | null
          phone?: string | null
          requests_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat2desk_clients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat2desk_events: {
        Row: {
          channel_id: number | null
          client_id: number | null
          event_key: string
          event_time: string | null
          hook_type: string | null
          id: string
          is_new_client: boolean | null
          payload: Json | null
          received_at: string
          request_id: number | null
          signature_valid: boolean
          transport: string | null
        }
        Insert: {
          channel_id?: number | null
          client_id?: number | null
          event_key: string
          event_time?: string | null
          hook_type?: string | null
          id?: string
          is_new_client?: boolean | null
          payload?: Json | null
          received_at?: string
          request_id?: number | null
          signature_valid?: boolean
          transport?: string | null
        }
        Update: {
          channel_id?: number | null
          client_id?: number | null
          event_key?: string
          event_time?: string | null
          hook_type?: string | null
          id?: string
          is_new_client?: boolean | null
          payload?: Json | null
          received_at?: string
          request_id?: number | null
          signature_valid?: boolean
          transport?: string | null
        }
        Relationships: []
      }
      crm_labels: {
        Row: {
          key: string
          title: string
        }
        Insert: {
          key: string
          title: string
        }
        Update: {
          key?: string
          title?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          branch_code: string | null
          duration: string | null
          experience: string | null
          extra: string | null
          full_name: string
          id: string
          indications: string | null
          patient_age: string | null
          schedule: string | null
          specialty: string | null
          status: string | null
        }
        Insert: {
          branch_code?: string | null
          duration?: string | null
          experience?: string | null
          extra?: string | null
          full_name: string
          id?: string
          indications?: string | null
          patient_age?: string | null
          schedule?: string | null
          specialty?: string | null
          status?: string | null
        }
        Update: {
          branch_code?: string | null
          duration?: string | null
          experience?: string | null
          extra?: string | null
          full_name?: string
          id?: string
          indications?: string | null
          patient_age?: string | null
          schedule?: string | null
          specialty?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_branch_code_fkey"
            columns: ["branch_code"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
        ]
      }
      drips: {
        Row: {
          course: string | null
          effect: string | null
          id: string
          indications: string | null
          manufacturer: string | null
          name: string
          price_text: string | null
        }
        Insert: {
          course?: string | null
          effect?: string | null
          id?: string
          indications?: string | null
          manufacturer?: string | null
          name: string
          price_text?: string | null
        }
        Update: {
          course?: string | null
          effect?: string | null
          id?: string
          indications?: string | null
          manufacturer?: string | null
          name?: string
          price_text?: string | null
        }
        Relationships: []
      }
      employee_errors: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          id: string
          lead_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          lead_id: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          lead_id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_errors_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          branch_codes: string[]
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          branch_codes?: string[]
          created_at?: string
          email: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          branch_codes?: string[]
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      kb_articles: {
        Row: {
          body: string
          branch_code: string | null
          id: string
          section: string
          sort: number | null
          title: string
        }
        Insert: {
          body?: string
          branch_code?: string | null
          id?: string
          section: string
          sort?: number | null
          title: string
        }
        Update: {
          body?: string
          branch_code?: string | null
          id?: string
          section?: string
          sort?: number | null
          title?: string
        }
        Relationships: []
      }
      lead_history: {
        Row: {
          author_email: string | null
          changed_at: string
          changes: Json
          id: string
          lead_id: string
        }
        Insert: {
          author_email?: string | null
          changed_at?: string
          changes: Json
          id?: string
          lead_id: string
        }
        Update: {
          author_email?: string | null
          changed_at?: string
          changes?: Json
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_services: {
        Row: {
          created_at: string
          currency: string
          discount: number
          id: string
          is_package: boolean
          lead_id: string
          name: string
          package_id: string | null
          price: number
          price_from: boolean
          qty: number
          service_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          discount?: number
          id?: string
          is_package?: boolean
          lead_id: string
          name: string
          package_id?: string | null
          price?: number
          price_from?: boolean
          qty?: number
          service_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          discount?: number
          id?: string
          is_package?: boolean
          lead_id?: string
          name?: string
          package_id?: string | null
          price?: number
          price_from?: boolean
          qty?: number
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_services_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agent_region: string | null
          booked_by_email: string | null
          branch_code: string
          brought_by_email: string | null
          business_segment: string | null
          came: boolean
          campaign: string | null
          channel: string | null
          clinical_direction: string | null
          comment: string | null
          confirmed: boolean
          confirmed_by_email: string | null
          created_at: string
          doctor_id: string | null
          foreigner: boolean
          funnel: string
          id: string
          installment: boolean
          insurance: string | null
          interest: boolean
          lead_date: string
          line: string
          next_touch: string | null
          operation_by_email: string | null
          operation_cost: number | null
          operation_date: string | null
          outcome: string | null
          outcome_reason: string | null
          parent_lead_id: string | null
          partner_id: string | null
          patient_id: string
          patient_name: string | null
          phone: string
          prepayment: number | null
          prepayment_date: string | null
          responsible_email: string | null
          source: string
          stage: number
          visit_date: string | null
          visited_at: string | null
          work_area: string | null
        }
        Insert: {
          agent_region?: string | null
          booked_by_email?: string | null
          branch_code: string
          brought_by_email?: string | null
          business_segment?: string | null
          came?: boolean
          campaign?: string | null
          channel?: string | null
          clinical_direction?: string | null
          comment?: string | null
          confirmed?: boolean
          confirmed_by_email?: string | null
          created_at?: string
          doctor_id?: string | null
          foreigner?: boolean
          funnel: string
          id?: string
          installment?: boolean
          insurance?: string | null
          interest?: boolean
          lead_date?: string
          line: string
          next_touch?: string | null
          operation_by_email?: string | null
          operation_cost?: number | null
          operation_date?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          parent_lead_id?: string | null
          partner_id?: string | null
          patient_id?: string
          patient_name?: string | null
          phone: string
          prepayment?: number | null
          prepayment_date?: string | null
          responsible_email?: string | null
          source: string
          stage?: number
          visit_date?: string | null
          visited_at?: string | null
          work_area?: string | null
        }
        Update: {
          agent_region?: string | null
          booked_by_email?: string | null
          branch_code?: string
          brought_by_email?: string | null
          business_segment?: string | null
          came?: boolean
          campaign?: string | null
          channel?: string | null
          clinical_direction?: string | null
          comment?: string | null
          confirmed?: boolean
          confirmed_by_email?: string | null
          created_at?: string
          doctor_id?: string | null
          foreigner?: boolean
          funnel?: string
          id?: string
          installment?: boolean
          insurance?: string | null
          interest?: boolean
          lead_date?: string
          line?: string
          next_touch?: string | null
          operation_by_email?: string | null
          operation_cost?: number | null
          operation_date?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          parent_lead_id?: string | null
          partner_id?: string | null
          patient_id?: string
          patient_name?: string | null
          phone?: string
          prepayment?: number | null
          prepayment_date?: string | null
          responsible_email?: string | null
          source?: string
          stage?: number
          visit_date?: string | null
          visited_at?: string | null
          work_area?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_branch_code_fkey"
            columns: ["branch_code"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "leads_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_parent_lead_id_fkey"
            columns: ["parent_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lookups: {
        Row: {
          id: string
          kind: string
          value: string
        }
        Insert: {
          id?: string
          kind: string
          value: string
        }
        Update: {
          id?: string
          kind?: string
          value?: string
        }
        Relationships: []
      }
      operations: {
        Row: {
          anesthesia: string | null
          contraindications: string | null
          description: string | null
          duration: string | null
          id: string
          indications: string | null
          name: string
          primary_rehab: string | null
          recovery: string | null
        }
        Insert: {
          anesthesia?: string | null
          contraindications?: string | null
          description?: string | null
          duration?: string | null
          id?: string
          indications?: string | null
          name: string
          primary_rehab?: string | null
          recovery?: string | null
        }
        Update: {
          anesthesia?: string | null
          contraindications?: string | null
          description?: string | null
          duration?: string | null
          id?: string
          indications?: string | null
          name?: string
          primary_rehab?: string | null
          recovery?: string | null
        }
        Relationships: []
      }
      packages: {
        Row: {
          benefit: string | null
          branch_code: string | null
          id: string
          includes: string | null
          name: string
          package_price: number | null
          price_separately: number | null
        }
        Insert: {
          benefit?: string | null
          branch_code?: string | null
          id?: string
          includes?: string | null
          name: string
          package_price?: number | null
          price_separately?: number | null
        }
        Update: {
          benefit?: string | null
          branch_code?: string | null
          id?: string
          includes?: string | null
          name?: string
          package_price?: number | null
          price_separately?: number | null
        }
        Relationships: []
      }
      partners: {
        Row: {
          address: string | null
          bonus_per_operation: number | null
          city: string | null
          clinic: string | null
          created_at: string
          curator_email: string | null
          email: string | null
          id: string
          import_key: string | null
          name: string
          notes: string | null
          phone: string | null
          region: string | null
          specialty: string | null
          status: string | null
          type: string | null
        }
        Insert: {
          address?: string | null
          bonus_per_operation?: number | null
          city?: string | null
          clinic?: string | null
          created_at?: string
          curator_email?: string | null
          email?: string | null
          id?: string
          import_key?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          specialty?: string | null
          status?: string | null
          type?: string | null
        }
        Update: {
          address?: string | null
          bonus_per_operation?: number | null
          city?: string | null
          clinic?: string | null
          created_at?: string
          curator_email?: string | null
          email?: string | null
          id?: string
          import_key?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          specialty?: string | null
          status?: string | null
          type?: string | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          created_at: string
          id: string
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          branch_codes: string[]
          currency: string
          direction: string | null
          doctor_text: string | null
          id: string
          is_new: boolean
          name: string
          note: string | null
          price: number | null
          price_from: boolean
          price_text: string | null
          subsection: string | null
        }
        Insert: {
          branch_codes?: string[]
          currency?: string
          direction?: string | null
          doctor_text?: string | null
          id?: string
          is_new?: boolean
          name: string
          note?: string | null
          price?: number | null
          price_from?: boolean
          price_text?: string | null
          subsection?: string | null
        }
        Update: {
          branch_codes?: string[]
          currency?: string
          direction?: string | null
          doctor_text?: string | null
          id?: string
          is_new?: boolean
          name?: string
          note?: string | null
          price?: number | null
          price_from?: boolean
          price_text?: string | null
          subsection?: string | null
        }
        Relationships: []
      }
      touches: {
        Row: {
          author_email: string | null
          channel: string | null
          id: string
          lead_id: string
          no_answer: boolean
          result: string | null
          touched_at: string
        }
        Insert: {
          author_email?: string | null
          channel?: string | null
          id?: string
          lead_id: string
          no_answer?: boolean
          result?: string | null
          touched_at?: string
        }
        Update: {
          author_email?: string | null
          channel?: string | null
          id?: string
          lead_id?: string
          no_answer?: boolean
          result?: string | null
          touched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "touches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      altegio_name_key: { Args: { raw: string }; Returns: string }
      apply_altegio_records: { Args: { _rows: Json }; Returns: Json }
      apply_chat2desk_backfill_page: {
        Args: {
          _clients: Json
          _cursor: number
          _events: Json
          _host: string
          _id: string
          _lease: string
          _offset: number
          _phase: string
        }
        Returns: Json
      }
      can_see_branch: { Args: { _code: string }; Returns: boolean }
      claim_altegio_job: { Args: { _id: string }; Returns: Json }
      claim_chat2desk_backfill: {
        Args: { _id: string; _lease: string }
        Returns: Json
      }
      claim_first_admin: { Args: never; Returns: boolean }
      finish_chat2desk_backfill: {
        Args: { _id: string; _lease: string }
        Returns: Json
      }
      ingest_chat2desk_event: { Args: { _event: Json }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_director: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      my_email: { Args: never; Returns: string }
      patient_phone_key: { Args: { raw: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "commercial_director"
        | "rop"
        | "senior_cc"
        | "operator"
        | "sales_manager"
        | "agent_manager"
        | "checkup_manager"
        | "branch_admin"
        | "reanimator"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "commercial_director",
        "rop",
        "senior_cc",
        "operator",
        "sales_manager",
        "agent_manager",
        "checkup_manager",
        "branch_admin",
        "reanimator",
      ],
    },
  },
} as const
