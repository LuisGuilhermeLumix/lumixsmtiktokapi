// Cria um post a partir do vídeo final do motor e o entrega à fila publish
// existente (reaproveita todo o fluxo de publicação no TikTok).

import { POST_MEDIA_BUCKET, postMediaPath, type Tables } from "@lsm/db";
import { publishJobId, type PrivacyLevel } from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";

/** usuário "ator" da org p/ created_by (NOT NULL em posts) */
async function findOrgActor(deps: WorkerDeps, orgId: string): Promise<string | null> {
  const { data } = await deps.db
    .from("users")
    .select("id, role")
    .eq("org_id", orgId)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** baixa/usa o vídeo final, sobe no Storage, cria post+target e enfileira publish */
export async function publishFinalVideo(
  deps: WorkerDeps,
  args: {
    video: Tables<"automation_videos">;
    caption: string;
    privacy: PrivacyLevel;
    /** fonte do vídeo final: URL (passthrough de 1 cena) ou bytes (FFmpeg) */
    source: { url: string } | { buffer: Buffer };
  },
): Promise<{ postId: string; targetId: string; mediaPath: string } | null> {
  const { video } = args;
  if (!video.social_account_id) return null;

  const { data: account } = await deps.db
    .from("social_accounts")
    .select("client_id")
    .eq("id", video.social_account_id)
    .maybeSingle();
  if (!account?.client_id) return null;

  const actor = await findOrgActor(deps, video.org_id);
  if (!actor) return null;

  let buffer: Buffer;
  if ("buffer" in args.source) {
    buffer = args.source.buffer;
  } else {
    const res = await fetch(args.source.url);
    if (!res.ok) throw new Error(`download do vídeo final falhou (HTTP ${res.status})`);
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const { data: post } = await deps.db
    .from("posts")
    .insert({
      org_id: video.org_id,
      client_id: account.client_id,
      created_by: actor,
      caption: args.caption,
      privacy_level: args.privacy,
      status: "queued",
    })
    .select("id")
    .single();
  if (!post) throw new Error("falha ao criar post");

  const path = postMediaPath(video.org_id, account.client_id, post.id, "video.mp4");
  const { error: upErr } = await deps.db.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: "video/mp4", upsert: true });
  if (upErr) {
    await deps.db.from("posts").delete().eq("id", post.id);
    throw new Error(`upload da mídia falhou: ${upErr.message}`);
  }
  await deps.db.from("posts").update({ media_path: path }).eq("id", post.id);

  const { data: target } = await deps.db
    .from("post_targets")
    .insert({
      post_id: post.id,
      social_account_id: video.social_account_id,
      platform: "tiktok",
      status: "queued",
    })
    .select("id")
    .single();
  if (!target) throw new Error("falha ao criar post_target");

  await deps.queues.publish.add("publish", { postTargetId: target.id }, { jobId: publishJobId(target.id) });
  return { postId: post.id, targetId: target.id, mediaPath: path };
}
