// Orquestrador por conta conectada: injeta o access token, faz refresh
// automático em token expirado e aplica o fallback direct_post → upload_draft.

import type { PrivacyLevel } from "@lsm/shared";
import { isTikTokError, isUnauditedError, TikTokApiError } from "./errors.js";
import { retryWithBackoff, type BackoffOptions } from "./http.js";
import { getUserInfo, listVideos, queryVideos } from "./display.js";
import {
  fetchPublishStatus,
  initDirectPost,
  initInboxUpload,
  planChunks,
  queryCreatorInfo,
  uploadVideoChunks,
  type DirectPostInfo,
} from "./publish.js";
import type {
  CreatorInfo,
  PublishStatus,
  TikTokUserInfo,
  TikTokVideo,
  VideoListPage,
} from "./types.js";

/**
 * Fornece o access token da conta. `refreshAccessToken` é chamado quando
 * o TikTok responde token expirado — deve renovar via refreshToken(),
 * persistir os tokens criptografados e devolver o novo access token.
 */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  refreshAccessToken?(): Promise<string>;
}

export type PublishMode = "direct_post" | "upload_draft";

export interface PublishVideoOptions extends Partial<Omit<DirectPostInfo, "privacyLevel">> {
  video: Uint8Array;
  /** default SELF_ONLY — único valor seguro p/ app sem audit aprovado */
  privacyLevel?: PrivacyLevel;
  /** "auto" (default) tenta direct post e cai p/ rascunho se unaudited */
  mode?: PublishMode | "auto";
  mimeType?: string;
  chunkSize?: number;
  /** log estruturado (qual modo foi usado, fallback acionado etc.) */
  onLog?: (message: string) => void;
}

export interface PublishVideoResult {
  publishId: string;
  mode: PublishMode;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onStatus?: (status: PublishStatus) => void;
}

export class TikTokAccountApi {
  constructor(
    private readonly tokens: AccessTokenProvider,
    private readonly backoff?: BackoffOptions,
  ) {}

  /** injeta token; em token_expired faz refresh e repete UMA vez */
  private async withAuth<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
    return retryWithBackoff(async () => {
      const token = await this.tokens.getAccessToken();
      try {
        return await fn(token);
      } catch (err) {
        if (
          isTikTokError(err) &&
          err.kind === "token_expired" &&
          this.tokens.refreshAccessToken
        ) {
          const fresh = await this.tokens.refreshAccessToken();
          return await fn(fresh);
        }
        throw err;
      }
    }, this.backoff);
  }

  // ── Display API ────────────────────────────────────────────────

  getUserInfo(): Promise<TikTokUserInfo> {
    return this.withAuth((t) => getUserInfo(t));
  }

  listVideos(opts?: { cursor?: number; maxCount?: number }): Promise<VideoListPage> {
    return this.withAuth((t) => listVideos(t, opts));
  }

  queryVideos(videoIds: string[]): Promise<TikTokVideo[]> {
    return this.withAuth((t) => queryVideos(t, videoIds));
  }

  // ── Content Posting API ────────────────────────────────────────

  queryCreatorInfo(): Promise<CreatorInfo> {
    return this.withAuth((t) => queryCreatorInfo(t));
  }

  /**
   * Fluxo completo push_by_file: init → upload de chunks.
   * Em modo "auto", erro de app não-auditado no Direct Post aciona
   * fallback para upload em rascunho (inbox) — o modo usado retorna
   * em `mode` para gravar em post_targets.published_mode.
   * O polling de status fica a cargo do caller (fetch/pollPublishStatus).
   */
  async publishVideo(opts: PublishVideoOptions): Promise<PublishVideoResult> {
    const {
      video,
      privacyLevel = "SELF_ONLY",
      mode = "auto",
      mimeType = "video/mp4",
      chunkSize,
      onLog = () => {},
    } = opts;

    const plan = planChunks(video.byteLength, chunkSize);
    onLog(
      `upload: ${video.byteLength} bytes em ${plan.totalChunkCount} chunk(s) de ~${plan.chunkSize} bytes`,
    );

    const init = await this.withAuth(async (token) => {
      if (mode === "upload_draft") {
        return {
          result: await initInboxUpload(token, video.byteLength, plan),
          usedMode: "upload_draft" as const,
        };
      }
      try {
        const result = await initDirectPost(token, video.byteLength, plan, {
          caption: opts.caption,
          privacyLevel,
          disableComment: opts.disableComment,
          disableDuet: opts.disableDuet,
          disableStitch: opts.disableStitch,
          videoCoverTimestampMs: opts.videoCoverTimestampMs,
        });
        return { result, usedMode: "direct_post" as const };
      } catch (err) {
        if (mode === "auto" && isUnauditedError(err)) {
          onLog(
            `direct post indisponível (${isTikTokError(err) ? err.code : "?"}) — fallback para rascunho (inbox)`,
          );
          return {
            result: await initInboxUpload(token, video.byteLength, plan),
            usedMode: "upload_draft" as const,
          };
        }
        throw err;
      }
    });

    await uploadVideoChunks(init.result.uploadUrl, video, plan, mimeType, this.backoff);
    onLog(`upload concluído — publish_id=${init.result.publishId} modo=${init.usedMode}`);

    return { publishId: init.result.publishId, mode: init.usedMode };
  }

  fetchPublishStatus(publishId: string): Promise<PublishStatus> {
    return this.withAuth((t) => fetchPublishStatus(t, publishId));
  }

  /** conveniência p/ polling síncrono; o worker pode preferir re-enfileirar */
  async pollPublishStatus(
    publishId: string,
    { intervalMs = 5_000, timeoutMs = 300_000, onStatus }: PollOptions = {},
  ): Promise<PublishStatus> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const status = await this.fetchPublishStatus(publishId);
      onStatus?.(status);
      if (
        status.status === "PUBLISH_COMPLETE" ||
        status.status === "SEND_TO_USER_INBOX" ||
        status.status === "FAILED"
      ) {
        return status;
      }
      if (Date.now() >= deadline) {
        throw new TikTokApiError({
          kind: "publish_failed",
          code: "status_poll_timeout",
          message: `Timeout aguardando status do publish_id=${publishId}`,
        });
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
