export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_API_BASE = "https://open.tiktokapis.com";
export const TIKTOK_TOKEN_URL = `${TIKTOK_API_BASE}/v2/oauth/token/`;
export const TIKTOK_REVOKE_URL = `${TIKTOK_API_BASE}/v2/oauth/revoke/`;

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "user.info.stats",
  "video.list",
  "video.publish",
  "video.upload",
] as const;
export type TikTokScope = (typeof TIKTOK_SCOPES)[number];

export const MB = 1024 * 1024;
// Regras de chunk da Content Posting API:
// chunk entre 5 MB e 64 MB; arquivo <= 64 MB pode subir inteiro em 1 chunk;
// total_chunk_count = floor(video_size / chunk_size) e o último chunk
// absorve o resto (máx. 128 MB).
export const MIN_CHUNK_SIZE = 5 * MB;
export const DEFAULT_CHUNK_SIZE = 32 * MB;
export const SINGLE_CHUNK_MAX = 64 * MB;
