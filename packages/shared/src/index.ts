// @lsm/shared — tipos, validações (zod), constantes e utilitários
// (cripto AES-256-GCM é server-only: importar via "@lsm/shared/crypto")

export * from "./queues.js";

export const LSM_PLATFORMS = ["tiktok"] as const;
export type Platform = (typeof LSM_PLATFORMS)[number];

export const USER_ROLES = ["owner", "admin", "operator"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "publishing",
  "published",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const SOCIAL_ACCOUNT_STATUSES = ["connected", "expired", "revoked"] as const;
export type SocialAccountStatus = (typeof SOCIAL_ACCOUNT_STATUSES)[number];

export const POST_TARGET_STATUSES = [
  "pending",
  "queued",
  "publishing",
  "published",
  "failed",
] as const;
export type PostTargetStatus = (typeof POST_TARGET_STATUSES)[number];

// Valores aceitos pela Content Posting API do TikTok.
// Apps sem audit aprovado só podem publicar como SELF_ONLY.
export const PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];
