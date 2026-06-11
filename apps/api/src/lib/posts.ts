// Criação e enfileiramento de posts — usado pelas rotas REST e pelo webhook n8n.

import { POST_MEDIA_BUCKET, postMediaPath, type Tables } from "@lsm/db";
import { publishJobId, type PostStatus, type PrivacyLevel } from "@lsm/shared";
import type { ApiDeps } from "../deps.js";
import { logAudit } from "./audit.js";
import { httpError } from "./errors.js";
import { checkAndConsumeUpload } from "./quota.js";

export interface MediaInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface CreatePostInput {
  orgId: string;
  clientId: string;
  createdBy: string;
  caption: string;
  privacyLevel: PrivacyLevel;
  socialAccountIds: string[];
  scheduleAt?: Date | null;
  publishNow?: boolean;
  media: MediaInput;
  /** ator p/ audit (null = automação) */
  actorUserId?: string | null;
}

export interface CreatePostResult {
  post: Tables<"posts">;
  targets: Tables<"post_targets">[];
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "_").slice(-80);
  return cleaned || "video.mp4";
}

async function enqueueTarget(deps: ApiDeps, postTargetId: string, delayMs = 0): Promise<void> {
  const jobId = publishJobId(postTargetId);
  // remove job anterior (ex.: reagendamento) antes de enfileirar de novo
  await deps.queues.publish.remove(jobId).catch(() => {});
  await deps.queues.publish.add(
    "publish",
    { postTargetId },
    { jobId, ...(delayMs > 0 ? { delay: delayMs } : {}) },
  );
}

export async function createPost(deps: ApiDeps, input: CreatePostInput): Promise<CreatePostResult> {
  if (input.publishNow && input.scheduleAt) {
    throw httpError(400, "Use publish_now OU schedule_at, não ambos");
  }
  if (input.scheduleAt && input.scheduleAt.getTime() <= Date.now()) {
    throw httpError(400, "schedule_at precisa ser no futuro");
  }

  // todas as contas-alvo devem pertencer ao cliente
  const uniqueIds = [...new Set(input.socialAccountIds)];
  const { data: accounts, error: accErr } = await deps.db
    .from("social_accounts")
    .select("id, status")
    .eq("client_id", input.clientId)
    .in("id", uniqueIds);
  if (accErr) throw httpError(500, `Falha ao validar contas: ${accErr.message}`);
  if ((accounts ?? []).length !== uniqueIds.length) {
    throw httpError(400, "Uma ou mais contas não pertencem a este cliente");
  }

  await checkAndConsumeUpload(deps, input.orgId, input.clientId);

  const { data: post, error: postErr } = await deps.db
    .from("posts")
    .insert({
      org_id: input.orgId,
      client_id: input.clientId,
      created_by: input.createdBy,
      caption: input.caption,
      privacy_level: input.privacyLevel,
      status: "draft",
      schedule_at: input.scheduleAt?.toISOString() ?? null,
    })
    .select("*")
    .single();
  if (postErr || !post) throw httpError(500, `Falha ao criar post: ${postErr?.message}`);

  // mídia no Storage no path exigido pelas policies
  const mediaPath = postMediaPath(
    input.orgId,
    input.clientId,
    post.id,
    sanitizeFilename(input.media.filename),
  );
  const { error: upErr } = await deps.db.storage
    .from(POST_MEDIA_BUCKET)
    .upload(mediaPath, input.media.buffer, {
      contentType: input.media.mimeType,
      upsert: true,
    });
  if (upErr) {
    await deps.db.from("posts").delete().eq("id", post.id);
    throw httpError(500, `Falha no upload da mídia: ${upErr.message}`);
  }

  const status: PostStatus = input.publishNow
    ? "queued"
    : input.scheduleAt
      ? "scheduled"
      : "draft";
  const { data: updated, error: updErr } = await deps.db
    .from("posts")
    .update({ media_path: mediaPath, status })
    .eq("id", post.id)
    .select("*")
    .single();
  if (updErr || !updated) throw httpError(500, `Falha ao atualizar post: ${updErr?.message}`);

  const { data: targets, error: tgtErr } = await deps.db
    .from("post_targets")
    .insert(
      uniqueIds.map((accountId) => ({
        post_id: post.id,
        social_account_id: accountId,
        platform: "tiktok" as const,
        status: input.publishNow ? ("queued" as const) : ("pending" as const),
      })),
    )
    .select("*");
  if (tgtErr || !targets) throw httpError(500, `Falha ao criar alvos: ${tgtErr?.message}`);

  if (input.publishNow) {
    for (const t of targets) await enqueueTarget(deps, t.id);
  } else if (input.scheduleAt) {
    const delay = input.scheduleAt.getTime() - Date.now();
    for (const t of targets) await enqueueTarget(deps, t.id, delay);
  }

  logAudit(deps, {
    orgId: input.orgId,
    userId: input.actorUserId ?? input.createdBy,
    action: input.publishNow ? "post.create_and_publish" : "post.create",
    entity: `post:${post.id}`,
    meta: { client_id: input.clientId, status, targets: targets.length },
  });

  return { post: updated, targets };
}

/** dispara publicação imediata dos alvos ainda não publicados */
export async function publishPostNow(
  deps: ApiDeps,
  post: Tables<"posts">,
  actorUserId: string | null,
): Promise<Tables<"post_targets">[]> {
  if (!post.media_path) throw httpError(400, "Post sem mídia — não é possível publicar");

  const { data: targets, error } = await deps.db
    .from("post_targets")
    .select("*")
    .eq("post_id", post.id);
  if (error) throw httpError(500, `Falha ao carregar alvos: ${error.message}`);

  const pending = (targets ?? []).filter(
    (t) => t.status !== "published" && t.status !== "publishing",
  );
  if (pending.length === 0) {
    throw httpError(400, "Nenhum alvo pendente para publicar");
  }

  await deps.db.from("posts").update({ status: "queued" }).eq("id", post.id);
  await deps.db
    .from("post_targets")
    .update({ status: "queued", error: null })
    .in(
      "id",
      pending.map((t) => t.id),
    );

  for (const t of pending) await enqueueTarget(deps, t.id);

  logAudit(deps, {
    orgId: post.org_id,
    userId: actorUserId,
    action: "post.publish_now",
    entity: `post:${post.id}`,
    meta: { targets: pending.length },
  });

  return pending;
}

/** cancela post não publicado: remove jobs, mídia e registro */
export async function deletePost(
  deps: ApiDeps,
  post: Tables<"posts">,
  actorUserId: string | null,
): Promise<void> {
  if (post.status === "publishing" || post.status === "published") {
    throw httpError(409, "Post em publicação ou já publicado não pode ser cancelado");
  }

  const { data: targets } = await deps.db
    .from("post_targets")
    .select("id")
    .eq("post_id", post.id);
  for (const t of targets ?? []) {
    await deps.queues.publish.remove(publishJobId(t.id)).catch(() => {});
  }

  if (post.media_path) {
    await deps.db.storage.from(POST_MEDIA_BUCKET).remove([post.media_path]);
  }
  const { error } = await deps.db.from("posts").delete().eq("id", post.id);
  if (error) throw httpError(500, `Falha ao excluir post: ${error.message}`);

  logAudit(deps, {
    orgId: post.org_id,
    userId: actorUserId,
    action: "post.delete",
    entity: `post:${post.id}`,
    meta: { previous_status: post.status },
  });
}

/** usuário "ator" padrão p/ automações (webhook n8n): owner da org */
export async function findOrgOwnerId(deps: ApiDeps, orgId: string): Promise<string> {
  const { data } = await deps.db
    .from("users")
    .select("id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!data) throw httpError(500, "Organização sem usuário owner para atribuir o post");
  return data.id;
}
