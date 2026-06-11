// Content Posting API v2 — push_by_file (FILE_UPLOAD) como método padrão.
// Primitivas usadas pelo orquestrador em api.ts.

import type { PrivacyLevel } from "@lsm/shared";
import { DEFAULT_CHUNK_SIZE, MIN_CHUNK_SIZE, SINGLE_CHUNK_MAX } from "./constants.js";
import { TikTokApiError } from "./errors.js";
import { retryWithBackoff, tiktokRequest, type BackoffOptions } from "./http.js";
import type { CreatorInfo, InitUploadResult, PublishStatus, PublishStatusName } from "./types.js";

// ── plano de chunks ──────────────────────────────────────────────

export interface ChunkPlan {
  chunkSize: number;
  totalChunkCount: number;
  chunks: Array<{ start: number; end: number }>;
}

/**
 * Regras do TikTok: arquivo <= 64 MB sobe inteiro em 1 chunk;
 * acima disso, chunk_size entre 5–64 MB, total_chunk_count =
 * floor(size / chunk_size) e o ÚLTIMO chunk absorve o resto.
 */
export function planChunks(videoSize: number, chunkSize = DEFAULT_CHUNK_SIZE): ChunkPlan {
  if (!Number.isInteger(videoSize) || videoSize <= 0) {
    throw new TikTokApiError({
      kind: "invalid_param",
      code: "invalid_video_size",
      message: `Tamanho de vídeo inválido: ${videoSize}`,
    });
  }
  if (videoSize <= SINGLE_CHUNK_MAX) {
    return {
      chunkSize: videoSize,
      totalChunkCount: 1,
      chunks: [{ start: 0, end: videoSize - 1 }],
    };
  }
  const size = Math.min(Math.max(chunkSize, MIN_CHUNK_SIZE), SINGLE_CHUNK_MAX);
  const count = Math.floor(videoSize / size);
  const chunks = Array.from({ length: count }, (_, i) => ({
    start: i * size,
    end: i === count - 1 ? videoSize - 1 : (i + 1) * size - 1,
  }));
  return { chunkSize: size, totalChunkCount: count, chunks };
}

// ── init ─────────────────────────────────────────────────────────

export interface DirectPostInfo {
  caption?: string;
  privacyLevel: PrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
}

interface RawInitResponse {
  publish_id: string;
  upload_url: string;
}

function sourceInfo(videoSize: number, plan: ChunkPlan) {
  return {
    source: "FILE_UPLOAD",
    video_size: videoSize,
    chunk_size: plan.chunkSize,
    total_chunk_count: plan.totalChunkCount,
  };
}

/** Direct Post — publica direto no perfil (requer audit aprovado p/ contas públicas) */
export async function initDirectPost(
  accessToken: string,
  videoSize: number,
  plan: ChunkPlan,
  post: DirectPostInfo,
): Promise<InitUploadResult> {
  const data = await tiktokRequest<RawInitResponse>("/v2/post/publish/video/init/", {
    accessToken,
    json: {
      post_info: {
        title: post.caption ?? "",
        privacy_level: post.privacyLevel,
        disable_comment: post.disableComment ?? false,
        disable_duet: post.disableDuet ?? false,
        disable_stitch: post.disableStitch ?? false,
        ...(post.videoCoverTimestampMs !== undefined && {
          video_cover_timestamp_ms: post.videoCoverTimestampMs,
        }),
      },
      source_info: sourceInfo(videoSize, plan),
    },
  });
  return { publishId: data.publish_id, uploadUrl: data.upload_url };
}

/** Upload p/ inbox — vídeo vai como rascunho; usuário finaliza no app (fallback unaudited) */
export async function initInboxUpload(
  accessToken: string,
  videoSize: number,
  plan: ChunkPlan,
): Promise<InitUploadResult> {
  const data = await tiktokRequest<RawInitResponse>("/v2/post/publish/inbox/video/init/", {
    accessToken,
    json: { source_info: sourceInfo(videoSize, plan) },
  });
  return { publishId: data.publish_id, uploadUrl: data.upload_url };
}

// ── upload dos chunks ────────────────────────────────────────────

export async function uploadVideoChunks(
  uploadUrl: string,
  video: Uint8Array,
  plan: ChunkPlan,
  mimeType = "video/mp4",
  backoff?: BackoffOptions,
): Promise<void> {
  for (const chunk of plan.chunks) {
    await retryWithBackoff(async () => {
      let res: Response;
      try {
        res = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
            "Content-Range": `bytes ${chunk.start}-${chunk.end}/${video.byteLength}`,
          },
          body: video.subarray(chunk.start, chunk.end + 1),
        });
      } catch (err) {
        throw new TikTokApiError({
          kind: "network",
          code: "upload_network_error",
          message: `Falha de rede no upload do chunk ${chunk.start}-${chunk.end}: ${String(err)}`,
        });
      }
      if (!res.ok) {
        throw new TikTokApiError({
          code: `upload_http_${res.status}`,
          message: `Upload do chunk ${chunk.start}-${chunk.end} falhou (HTTP ${res.status})`,
          httpStatus: res.status,
        });
      }
    }, backoff);
  }
}

// ── status ───────────────────────────────────────────────────────

interface RawStatusResponse {
  status: PublishStatusName;
  fail_reason?: string;
  publicaly_available_post_id?: Array<string | number>; // typo é da API
  uploaded_bytes?: number;
}

export async function fetchPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<PublishStatus> {
  const data = await tiktokRequest<RawStatusResponse>("/v2/post/publish/status/fetch/", {
    accessToken,
    json: { publish_id: publishId },
  });
  return {
    status: data.status,
    failReason: data.fail_reason,
    publiclyAvailablePostId: data.publicaly_available_post_id,
    uploadedBytes: data.uploaded_bytes,
  };
}

// ── creator info (privacy levels permitidos para a conta) ────────

interface RawCreatorInfo {
  creator_username?: string;
  creator_nickname?: string;
  creator_avatar_url?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

export async function queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  const data = await tiktokRequest<RawCreatorInfo>("/v2/post/publish/creator_info/query/", {
    accessToken,
    json: {},
  });
  return {
    creatorUsername: data.creator_username,
    creatorNickname: data.creator_nickname,
    creatorAvatarUrl: data.creator_avatar_url,
    privacyLevelOptions: data.privacy_level_options ?? [],
    commentDisabled: data.comment_disabled,
    duetDisabled: data.duet_disabled,
    stitchDisabled: data.stitch_disabled,
    maxVideoPostDurationSec: data.max_video_post_duration_sec,
  };
}
