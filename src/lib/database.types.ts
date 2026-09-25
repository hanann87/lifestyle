
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_logs": {
                  Row: {
                    "button_id": number,"id": number,"period": unknown,"schedule_id": number | null,"user_id": string
                  }
                  Insert: {
                    "button_id": number,"id"?: never,"period": unknown,"schedule_id"?: number | null,"user_id": string
                  }
                  Update: {
                    "button_id"?: number,"id"?: never,"period"?: unknown,"schedule_id"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_logs_button_same_user"
      columns: ["button_id","user_id"]
isOneToOne: false
      referencedRelation: "buttons"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "activity_logs_schedule_same_user"
      columns: ["schedule_id","user_id"]
isOneToOne: false
      referencedRelation: "schedules"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"auto_switches": {
                  Row: {
                    "day_start_pending": boolean,"on_date": string,"schedule_id": number,"user_id": string
                  }
                  Insert: {
                    "day_start_pending"?: boolean,"on_date": string,"schedule_id": number,"user_id": string
                  }
                  Update: {
                    "day_start_pending"?: boolean,"on_date"?: string,"schedule_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "auto_switches_schedule_same_user"
      columns: ["schedule_id","user_id"]
isOneToOne: false
      referencedRelation: "schedules"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"buttons": {
                  Row: {
                    "archived_at": string | null,"color": string,"created_at": string,"display_order": number,"id": number,"is_sleep": boolean,"name": string,"user_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"color": string,"created_at"?: string,"display_order": number,"id"?: never,"is_sleep"?: boolean,"name": string,"user_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string,"created_at"?: string,"display_order"?: number,"id"?: never,"is_sleep"?: boolean,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"day_starts": {
                  Row: {
                    "id": number,"started_at": string,"user_id": string
                  }
                  Insert: {
                    "id"?: never,"started_at": string,"user_id": string
                  }
                  Update: {
                    "id"?: never,"started_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"goals": {
                  Row: {
                    "button_id": number,"created_at": string,"goal_type": string,"id": number,"target": string,"user_id": string,"valid_from": string,"valid_until": string | null
                  }
                  Insert: {
                    "button_id": number,"created_at"?: string,"goal_type": string,"id"?: never,"target": string,"user_id": string,"valid_from": string,"valid_until"?: string | null
                  }
                  Update: {
                    "button_id"?: number,"created_at"?: string,"goal_type"?: string,"id"?: never,"target"?: string,"user_id"?: string,"valid_from"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_button_same_user"
      columns: ["button_id","user_id"]
isOneToOne: false
      referencedRelation: "buttons"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"schedules": {
                  Row: {
                    "auto_switch": boolean,"button_id": number | null,"created_at": string,"days_of_week": (number)[] | null,"end_time": string,"id": number,"skip_dates": (string)[],"start_time": string,"title": string,"user_id": string,"valid_from": string,"valid_until": string
                  }
                  Insert: {
                    "auto_switch"?: boolean,"button_id"?: number | null,"created_at"?: string,"days_of_week"?: (number)[] | null,"end_time": string,"id"?: never,"skip_dates"?: (string)[],"start_time": string,"title": string,"user_id": string,"valid_from": string,"valid_until": string
                  }
                  Update: {
                    "auto_switch"?: boolean,"button_id"?: number | null,"created_at"?: string,"days_of_week"?: (number)[] | null,"end_time"?: string,"id"?: never,"skip_dates"?: (string)[],"start_time"?: string,"title"?: string,"user_id"?: string,"valid_from"?: string,"valid_until"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedules_button_same_user"
      columns: ["button_id","user_id"]
isOneToOne: false
      referencedRelation: "buttons"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

