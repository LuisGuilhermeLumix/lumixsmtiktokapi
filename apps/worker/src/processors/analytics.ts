// queue:analytics — coleta periódica (cron 6h).
// Job sem socialAccountId = fan-out: enfileira um job por conta conectada.
// Job com id: snapshot do perfil + métricas dos vídeos publicados.

import type { Job } from "bullmq";
import type { Json } from "@lsm/db";
import type { AnalyticsJobData } from "@lsm/shared";
import { TikTokApiError } from "@lsm/tiktok";
import type { WorkerDeps } from "../deps.js";
import { accountApiFor } from "../lib/tokens.js";

export function createAnalyticsProcessor(deps: WorkerDeps) {
  return async (job: Job<AnalyticsJobData>): Promise<void> => {
    const { socialAccountId } = job.data;

    // ── fan-out ──────────────────────────────────────────────────
    if (!socialAccountId) {
      const { data: accounts } = await deps.db
        .from("social_accounts")
        .select("id")
        .eq("status", "connected");
      for (const account of accounts ?? []) {
        await deps.queues.analytics.add(
          "collect-account",
          { socialAccountId: account.id },
          // separador "-": BullMQ proíbe ":" em jobIds customizados
          { jobId: `analytics-${account.id}-${Date.now()}` },
        );
      }
      await job.log(`fan-out: ${accounts?.length ?? 0} conta(s)`);
      return;
    }

    // ── coleta de uma conta ──────────────────────────────────────
    const { data: account } = await deps.db
      .from("social_accounts")
      .select("*")
      .eq("id", socialAccountId)
      .maybeSingle();
    if (!account || account.status !== "connected") return;

    const api = accountApiFor(deps, socialAccountId);

    try {
      const info = await api.getUserInfo();
      await deps.db.from("analytics_snapshots").insert({
        social_account_id: socialAccountId,
        followers: info.followerCount,
        following: info.followingCount,
        likes: info.likesCount,
        video_count: info.videoCount,
        raw: info as unknown as Json,
      });
      // mantém o perfil exibido no painel atualizado
      await deps.db
        .from("social_accounts")
        .update({
          display_name: info.displayName ?? account.display_name,
          avatar_url: info.avatarUrl ?? account.avatar_url,
        })
        .eq("id", socialAccountId);
    } catch (err) {
      if (err instanceof TikTokApiError && err.kind === "auth_revoked") {
        return; // conta já marcada como revoked pelo token provider
      }
      throw err;
    }

    // métricas por vídeo (apenas alvos publicados com id conhecido)
    const { data: targets } = await deps.db
      .from("post_targets")
      .select("id, tiktok_video_id")
      .eq("social_account_id", socialAccountId)
      .eq("status", "published")
      .not("tiktok_video_id", "is", null);
    if (!targets || targets.length === 0) return;

    const targetByVideoId = new Map(targets.map((t) => [t.tiktok_video_id as string, t.id]));
    const videoIds = [...targetByVideoId.keys()];

    // /v2/video/query/ aceita até 20 ids por chamada
    for (let i = 0; i < videoIds.length; i += 20) {
      const batch = videoIds.slice(i, i + 20);
      const videos = await api.queryVideos(batch);
      for (const video of videos) {
        const targetId = targetByVideoId.get(video.id);
        if (!targetId) continue;
        await deps.db.from("video_metrics").insert({
          post_target_id: targetId,
          views: video.viewCount,
          likes: video.likeCount,
          comments: video.commentCount,
          shares: video.shareCount,
        });
        // troca a URL provisória pela share_url oficial
        if (video.shareUrl) {
          await deps.db
            .from("post_targets")
            .update({ post_url: video.shareUrl })
            .eq("id", targetId);
        }
      }
    }
  };
}
