// queue:publish — publica um post_target no TikTok.
// Fluxo: baixa mídia do Storage → publishVideo (init → chunks, com
// fallback automático p/ rascunho) → grava publish_id/modo → agenda polling.
// Idempotente: re-execuções verificam o estado atual antes de agir.

import type { Job } from "bullmq";
import { POST_MEDIA_BUCKET } from "@lsm/db";
import type { PublishJobData } from "@lsm/shared";
import { TikTokApiError } from "@lsm/tiktok";
import type { WorkerDeps } from "../deps.js";
import { enqueueStatusCheck, recomputePostStatus } from "../lib/post-status.js";
import { accountApiFor } from "../lib/tokens.js";

const FIRST_STATUS_DELAY_MS = 10_000;

export function createPublishProcessor(deps: WorkerDeps) {
  return async (job: Job<PublishJobData>): Promise<void> => {
    const { postTargetId } = job.data;

    const { data: target } = await deps.db
      .from("post_targets")
      .select("*")
      .eq("id", postTargetId)
      .maybeSingle();
    if (!target) return; // post cancelado — job órfão
    if (target.status === "published") return; // idempotência

    // upload já feito numa execução anterior → só retoma o polling
    if (target.status === "publishing" && target.publish_id) {
      await enqueueStatusCheck(deps, target.id, target.publish_id, 0, FIRST_STATUS_DELAY_MS);
      return;
    }

    const { data: post } = await deps.db
      .from("posts")
      .select("*")
      .eq("id", target.post_id)
      .maybeSingle();
    if (!post || !post.media_path) {
      await deps.db
        .from("post_targets")
        .update({ status: "failed", error: "invalid_param:no_media:post sem mídia" })
        .eq("id", target.id);
      if (post) await recomputePostStatus(deps, post.id);
      return;
    }

    await deps.db
      .from("post_targets")
      .update({ status: "publishing", error: null })
      .eq("id", target.id);
    await deps.db.from("posts").update({ status: "publishing" }).eq("id", post.id);

    try {
      const download = await deps.db.storage.from(POST_MEDIA_BUCKET).download(post.media_path);
      if (download.error || !download.data) {
        throw new Error(`download da mídia falhou: ${download.error?.message}`);
      }
      const video = new Uint8Array(await download.data.arrayBuffer());

      const api = accountApiFor(deps, target.social_account_id);
      const result = await api.publishVideo({
        video,
        caption: post.caption,
        privacyLevel: post.privacy_level,
        mode: "auto", // direct post; fallback p/ rascunho se app sem audit
        onLog: (msg) => void job.log(msg),
      });

      await deps.db
        .from("post_targets")
        .update({ publish_id: result.publishId, published_mode: result.mode })
        .eq("id", target.id);

      await enqueueStatusCheck(deps, target.id, result.publishId, 0, FIRST_STATUS_DELAY_MS);
    } catch (err) {
      // TikTokApiError não-retryable (param inválido, spam, revogado) → falha
      // definitiva; resto (rede, rate limit, storage) → BullMQ re-tenta
      const retryable = err instanceof TikTokApiError ? err.retryable : true;
      const maxAttempts = job.opts.attempts ?? 1;

      if (retryable && job.attemptsMade + 1 < maxAttempts) {
        // devolve o alvo p/ queued para a re-execução não pular o upload
        await deps.db.from("post_targets").update({ status: "queued" }).eq("id", target.id);
        throw err;
      }

      const message =
        err instanceof TikTokApiError ? err.toDbError() : String(err).slice(0, 500);
      await deps.db
        .from("post_targets")
        .update({ status: "failed", error: message })
        .eq("id", target.id);
      await recomputePostStatus(deps, post.id);
    }
  };
}
