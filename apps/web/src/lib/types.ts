// Formas das respostas da API (espelham apps/api — mantidas locais
// para o web não depender dos packages server-side).

import type { PostStatus, PostTargetStatus, PrivacyLevel, UserRole } from "@lsm/shared";

export interface SocialAccount {
  id: string;
  client_id?: string;
  platform: string;
  tiktok_open_id?: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "connected" | "expired" | "revoked";
  connected_at: string;
}

export interface Client {
  id: string;
  org_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  accounts?: SocialAccount[];
}

export interface PostTarget {
  id: string;
  post_id: string;
  social_account_id: string;
  platform: string;
  status: PostTargetStatus;
  publish_id: string | null;
  tiktok_video_id: string | null;
  post_url: string | null;
  error: string | null;
  published_mode: string | null;
}

export interface Post {
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
  targets?: PostTarget[];
}

export interface Snapshot {
  captured_at: string;
  followers: number;
  following: number;
  likes: number;
  video_count: number;
}

export interface OverviewTotals {
  followers: number;
  likes: number;
  videos: number;
  accounts: number;
  posts_published_month: number;
  posts_scheduled: number;
}

export interface Overview {
  totals: OverviewTotals;
  accounts: Array<
    SocialAccount & { latest: { followers: number; likes: number; video_count: number } | null }
  >;
  top_videos: Array<{
    post_target_id: string;
    post_id: string;
    social_account_id: string;
    post_url: string | null;
    views: number;
    likes: number;
    comments: number;
    shares: number;
  }>;
}

export interface ApiKeyMeta {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Member {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}
