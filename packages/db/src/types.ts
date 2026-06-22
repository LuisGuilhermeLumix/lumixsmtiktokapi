// Tipos do banco — espelham packages/db/migrations/*.sql.
// Mantidos à mão por enquanto; podem ser regenerados com
// `supabase gen types typescript` quando o projeto estiver linkado.

import type {
  AutomationStatus,
  GenerationKind,
  GenerationStatus,
  Platform,
  PostStatus,
  PostTargetStatus,
  PrivacyLevel,
  RunStatus,
  SceneStatus,
  SocialAccountStatus,
  UserRole,
  VideoStatus,
  WorkflowStatus,
} from "@lsm/shared";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// IMPORTANTE: precisa ser `type` (não `interface`) — interfaces não têm
// index signature implícita e quebram a inferência do supabase-js (tudo vira never)
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          credits_balance: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          credits_balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          credits_balance?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          id: string;
          org_id: string;
          email: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      client_assignments: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      social_accounts: {
        Row: {
          id: string;
          client_id: string;
          platform: Platform;
          tiktok_open_id: string;
          display_name: string | null;
          avatar_url: string | null;
          status: SocialAccountStatus;
          connected_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          platform?: Platform;
          tiktok_open_id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          status?: SocialAccountStatus;
          connected_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          platform?: Platform;
          tiktok_open_id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          status?: SocialAccountStatus;
          connected_at?: string;
        };
        Relationships: [];
      };
      oauth_tokens: {
        Row: {
          id: string;
          social_account_id: string;
          access_token_enc: string;
          refresh_token_enc: string;
          access_expires_at: string;
          refresh_expires_at: string;
          scope: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          social_account_id: string;
          access_token_enc: string;
          refresh_token_enc: string;
          access_expires_at: string;
          refresh_expires_at: string;
          scope: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          social_account_id?: string;
          access_token_enc?: string;
          refresh_token_enc?: string;
          access_expires_at?: string;
          refresh_expires_at?: string;
          scope?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          org_id: string;
          client_id: string;
          created_by: string;
          caption: string;
          privacy_level: PrivacyLevel;
          status: PostStatus;
          media_path: string | null;
          schedule_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id: string;
          created_by: string;
          caption?: string;
          privacy_level?: PrivacyLevel;
          status?: PostStatus;
          media_path?: string | null;
          schedule_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string;
          created_by?: string;
          caption?: string;
          privacy_level?: PrivacyLevel;
          status?: PostStatus;
          media_path?: string | null;
          schedule_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      post_targets: {
        Row: {
          id: string;
          post_id: string;
          social_account_id: string;
          platform: Platform;
          status: PostTargetStatus;
          publish_id: string | null;
          tiktok_video_id: string | null;
          post_url: string | null;
          error: string | null;
          published_mode: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          social_account_id: string;
          platform?: Platform;
          status?: PostTargetStatus;
          publish_id?: string | null;
          tiktok_video_id?: string | null;
          post_url?: string | null;
          error?: string | null;
          published_mode?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          social_account_id?: string;
          platform?: Platform;
          status?: PostTargetStatus;
          publish_id?: string | null;
          tiktok_video_id?: string | null;
          post_url?: string | null;
          error?: string | null;
          published_mode?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      analytics_snapshots: {
        Row: {
          id: string;
          social_account_id: string;
          captured_at: string;
          followers: number;
          following: number;
          likes: number;
          video_count: number;
          raw: Json;
        };
        Insert: {
          id?: string;
          social_account_id: string;
          captured_at?: string;
          followers?: number;
          following?: number;
          likes?: number;
          video_count?: number;
          raw?: Json;
        };
        Update: {
          id?: string;
          social_account_id?: string;
          captured_at?: string;
          followers?: number;
          following?: number;
          likes?: number;
          video_count?: number;
          raw?: Json;
        };
        Relationships: [];
      };
      video_metrics: {
        Row: {
          id: string;
          post_target_id: string;
          captured_at: string;
          views: number;
          likes: number;
          comments: number;
          shares: number;
        };
        Insert: {
          id?: string;
          post_target_id: string;
          captured_at?: string;
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
        };
        Update: {
          id?: string;
          post_target_id?: string;
          captured_at?: string;
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
        };
        Relationships: [];
      };
      usage_quota: {
        Row: {
          id: string;
          org_id: string;
          client_id: string | null;
          period: string;
          uploads_used: number;
          uploads_limit: number | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id?: string | null;
          period: string;
          uploads_used?: number;
          uploads_limit?: number | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string | null;
          period?: string;
          uploads_used?: number;
          uploads_limit?: number | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          action: string;
          entity: string;
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          action: string;
          entity: string;
          meta?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string | null;
          action?: string;
          entity?: string;
          meta?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          created_by: string | null;
          created_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          created_by?: string | null;
          created_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          key_prefix?: string;
          key_hash?: string;
          created_by?: string | null;
          created_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          org_id: string;
          client_id: string | null;
          created_by: string | null;
          automation_id: string | null;
          kind: GenerationKind;
          model: string;
          prompt: string;
          input: Json;
          status: GenerationStatus;
          kie_task_id: string | null;
          result_url: string | null;
          storage_path: string | null;
          credits_charged: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id?: string | null;
          created_by?: string | null;
          automation_id?: string | null;
          kind: GenerationKind;
          model: string;
          prompt?: string;
          input?: Json;
          status?: GenerationStatus;
          kie_task_id?: string | null;
          result_url?: string | null;
          storage_path?: string | null;
          credits_charged?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string | null;
          created_by?: string | null;
          automation_id?: string | null;
          kind?: GenerationKind;
          model?: string;
          prompt?: string;
          input?: Json;
          status?: GenerationStatus;
          kie_task_id?: string | null;
          result_url?: string | null;
          storage_path?: string | null;
          credits_charged?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      content_automations: {
        Row: {
          id: string;
          org_id: string;
          client_id: string | null;
          social_account_id: string;
          created_by: string | null;
          niche: string;
          videos_per_day: number;
          video_duration: number;
          image_model: string;
          video_model: string;
          scene_agent_prompt: string;
          video_agent_prompt: string;
          post_times: string[];
          status: AutomationStatus;
          last_run_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id?: string | null;
          social_account_id: string;
          created_by?: string | null;
          niche: string;
          videos_per_day?: number;
          video_duration?: number;
          image_model: string;
          video_model: string;
          scene_agent_prompt?: string;
          video_agent_prompt?: string;
          post_times?: string[];
          status?: AutomationStatus;
          last_run_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string | null;
          social_account_id?: string;
          created_by?: string | null;
          niche?: string;
          videos_per_day?: number;
          video_duration?: number;
          image_model?: string;
          video_model?: string;
          scene_agent_prompt?: string;
          video_agent_prompt?: string;
          post_times?: string[];
          status?: AutomationStatus;
          last_run_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          org_id: string;
          delta: number;
          reason: string;
          generation_id: string | null;
          balance_after: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          delta: number;
          reason: string;
          generation_id?: string | null;
          balance_after: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          delta?: number;
          reason?: string;
          generation_id?: string | null;
          balance_after?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      niche_packs: {
        Row: {
          id: string;
          org_id: string | null;
          name: string;
          data: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          org_id?: string | null;
          name: string;
          data?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string | null;
          name?: string;
          data?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string;
          reference_image_url: string | null;
          traits: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          description?: string;
          reference_image_url?: string | null;
          traits?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          description?: string;
          reference_image_url?: string | null;
          traits?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_workflows: {
        Row: {
          id: string;
          org_id: string;
          client_id: string | null;
          name: string;
          status: WorkflowStatus;
          graph: Json;
          compiled_plan: Json | null;
          graph_hash: string | null;
          timezone: string;
          post_times: string[];
          lead_time_min: number;
          created_by: string | null;
          last_run_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          client_id?: string | null;
          name: string;
          status?: WorkflowStatus;
          graph?: Json;
          compiled_plan?: Json | null;
          graph_hash?: string | null;
          timezone?: string;
          post_times?: string[];
          lead_time_min?: number;
          created_by?: string | null;
          last_run_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          client_id?: string | null;
          name?: string;
          status?: WorkflowStatus;
          graph?: Json;
          compiled_plan?: Json | null;
          graph_hash?: string | null;
          timezone?: string;
          post_times?: string[];
          lead_time_min?: number;
          created_by?: string | null;
          last_run_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_runs: {
        Row: {
          id: string;
          org_id: string;
          workflow_id: string;
          run_date: string;
          slot: string;
          status: RunStatus;
          credits_reserved: number;
          credits_settled: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          org_id: string;
          workflow_id: string;
          run_date: string;
          slot: string;
          status?: RunStatus;
          credits_reserved?: number;
          credits_settled?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          workflow_id?: string;
          run_date?: string;
          slot?: string;
          status?: RunStatus;
          credits_reserved?: number;
          credits_settled?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_videos: {
        Row: {
          id: string;
          run_id: string;
          org_id: string;
          social_account_id: string | null;
          idx: number;
          status: VideoStatus;
          caption: string | null;
          num_scenes: number | null;
          final_url: string | null;
          storage_path: string | null;
          post_id: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          run_id: string;
          org_id: string;
          social_account_id?: string | null;
          idx?: number;
          status?: VideoStatus;
          caption?: string | null;
          num_scenes?: number | null;
          final_url?: string | null;
          storage_path?: string | null;
          post_id?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          org_id?: string;
          social_account_id?: string | null;
          idx?: number;
          status?: VideoStatus;
          caption?: string | null;
          num_scenes?: number | null;
          final_url?: string | null;
          storage_path?: string | null;
          post_id?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_scenes: {
        Row: {
          id: string;
          video_id: string;
          org_id: string;
          idx: number;
          status: SceneStatus;
          beat: string | null;
          prompt: string | null;
          image_url: string | null;
          video_url: string | null;
          provider: string | null;
          provider_task_id: string | null;
          credits_charged: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          video_id: string;
          org_id: string;
          idx?: number;
          status?: SceneStatus;
          beat?: string | null;
          prompt?: string | null;
          image_url?: string | null;
          video_url?: string | null;
          provider?: string | null;
          provider_task_id?: string | null;
          credits_charged?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          org_id?: string;
          idx?: number;
          status?: SceneStatus;
          beat?: string | null;
          prompt?: string | null;
          image_url?: string | null;
          video_url?: string | null;
          provider?: string | null;
          provider_task_id?: string | null;
          credits_charged?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_run_steps: {
        Row: {
          id: string;
          run_id: string;
          org_id: string;
          step: string;
          status: "started" | "done" | "failed";
          meta: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          org_id: string;
          step: string;
          status: "started" | "done" | "failed";
          meta?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          org_id?: string;
          step?: string;
          status?: "started" | "done" | "failed";
          meta?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_org_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      current_user_role: {
        Args: Record<string, never>;
        Returns: UserRole | null;
      };
      has_client_access: {
        Args: { p_client_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      platform: Platform;
      social_account_status: SocialAccountStatus;
      post_status: PostStatus;
      post_target_status: PostTargetStatus;
      privacy_level: PrivacyLevel;
    };
    CompositeTypes: Record<string, never>;
  };
};

// atalhos de tipo: Tables<"posts"> = Row da tabela posts
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
