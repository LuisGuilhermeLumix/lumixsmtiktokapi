// queue:status — polling de /v2/post/publish/status/fetch até estado final.
// PROCESSING_* re-agenda a si mesmo (com teto de tentativas).

import type { Job } from "bullmq";
import type { StatusJobData } from "@lsm/shared";
import { TikTokApiError } from "@lsm/tiktok";
import type { WorkerDeps } from "../deps.js";
import { enqueueStatusCheck, recomputePostStatus } from "../lib/post-status.js";
import { accountApiFor } from "../lib/tokens.js";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 60; // ~15 min

export function createStatusProcessor(deps: WorkerDeps) {
  return async (job: Job<StatusJobData>): Promise<void> => {
    const { postTargetId, publishId, attempt = 0 } = job.data;

    const { data: target } = await deps.db
      .from("post_targets")
      .select("*")
      .eq("id", postTargetId)
      .maybeSingle();
    if (!target) return; // post cancelado
    if (target.status === "published" || target.status === "failed") return; // já finalizado

    const api = accountApiFor(deps, target.social_account_id);

    let result;
    try {
      result = await api.fetchPublishStatus(publishId);
    } catch (err) {
      if (err instanceof TikTokApiError && !err.retryable) {
        await deps.db
          .from("post_targets")
          .update({ status: "failed", error: err.toDbError() })
          .eq("id", target.id);
        await recomputePostStatus(deps, target.post_id);
        return;
      }
      throw err; // rede/rate limit → BullMQ re-tenta com backoff
    }

    switch (result.status) {
      case "PUBLISH_COMPLETE": {
        const videoId = result.publiclyAvailablePostId?.[0];
        await deps.db
          .from("post_targets")
          .update({
            status: "published",
            tiktok_video_id: videoId !== undefined ? String(videoId) : null,
            // URL provisória; o job de analytics troca pela share_url oficial
            post_url:
              videoId !== undefined ? `https://www.tiktok.com/video/${videoId}` : null,
            error: null,
          })
          .eq("id", target.id);
        await recomputePostStatus(deps, target.post_id);
        return;
      }
      case "SEND_TO_USER_INBOX": {
        // rascunho entregue — usuário finaliza no app (published_mode=upload_draft)
        await deps.db
          .from("post_targets")
          .update({ status: "published", error: null })
          .eq("id", target.id);
        await recomputePostStatus(deps, target.post_id);
        return;
      }
      case "FAILED": {
        await deps.db
          .from("post_targets")
          .update({
            status: "failed",
            error: `publish_failed:${result.failReason ?? "unknown"}`.slice(0, 500),
          })
          .eq("id", target.id);
        await recomputePostStatus(deps, target.post_id);
        return;
      }
      default: {
        // PROCESSING_UPLOAD / PROCESSING_DOWNLOAD
        if (attempt >= MAX_POLLS) {
          await deps.db
            .from("post_targets")
            .update({
              status: "failed",
              error: `publish_failed:status_poll_timeout:sem estado final após ${MAX_POLLS} polls`,
            })
            .eq("id", target.id);
          await recomputePostStatus(deps, target.post_id);
          return;
        }
        await enqueueStatusCheck(deps, target.id, publishId, attempt + 1, POLL_INTERVAL_MS);
      }
    }
  };
}
