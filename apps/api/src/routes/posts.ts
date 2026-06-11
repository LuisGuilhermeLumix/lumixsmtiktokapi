import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { POST_STATUSES, PRIVACY_LEVELS } from "@lsm/shared";
import type { ApiDeps } from "../deps.js";
import { assertClientAccess, visibleClientIds } from "../lib/access.js";
import type { AuthContext, AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";
import { createPost, deletePost, publishPostNow, type MediaInput } from "../lib/posts.js";

const postIdParam = z.object({ id: z.string().uuid() });

// campos do multipart (todos chegam como string)
const createPostFields = z.object({
  client_id: z.string().uuid(),
  social_account_ids: z
    .string()
    .transform((s) =>
      s.trim().startsWith("[")
        ? (JSON.parse(s) as unknown)
        : s.split(",").map((x) => x.trim()).filter(Boolean),
    )
    .pipe(z.array(z.string().uuid()).min(1)),
  caption: z.string().max(2200).default(""),
  privacy_level: z.enum(PRIVACY_LEVELS).default("SELF_ONLY"),
  schedule_at: z.string().datetime({ offset: true }).optional(),
  publish_now: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

async function loadPostForActor(deps: ApiDeps, auth: AuthContext, postId: string) {
  const { data: post, error } = await deps.db
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw httpError(500, error.message);
  if (!post || post.org_id !== auth.orgId) throw httpError(404, "Post não encontrado");
  await assertClientAccess(deps, auth, post.client_id);
  return post;
}

export function registerPostRoutes(app: FastifyInstance, deps: ApiDeps, auth: AuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // multipart/form-data: campo de arquivo "video" + campos de texto
  app.post(
    "/posts",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["posts"],
        description:
          "Cria post (multipart/form-data): arquivo `video` + client_id, social_account_ids " +
          "(JSON array ou CSV), caption, privacy_level, schedule_at OU publish_now",
        consumes: ["multipart/form-data"],
      },
    },
    async (req, reply) => {
      if (!req.isMultipart()) throw httpError(415, "Envie multipart/form-data");

      let media: MediaInput | undefined;
      const fields: Record<string, string> = {};
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "video" || media) {
            await part.toBuffer(); // drena para não travar o stream
            continue;
          }
          media = {
            buffer: await part.toBuffer(),
            filename: part.filename || "video.mp4",
            mimeType: part.mimetype || "video/mp4",
          };
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
      if (!media || media.buffer.length === 0) {
        throw httpError(400, "Arquivo de vídeo ausente (campo `video`)");
      }

      const parsed = createPostFields.safeParse(fields);
      if (!parsed.success) {
        throw httpError(400, `Campos inválidos: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      }
      const body = parsed.data;

      await assertClientAccess(deps, req.auth!, body.client_id);
      if (!req.auth!.userId) throw httpError(400, "API key sem usuário associado para created_by");

      const result = await createPost(deps, {
        orgId: req.auth!.orgId,
        clientId: body.client_id,
        createdBy: req.auth!.userId,
        caption: body.caption,
        privacyLevel: body.privacy_level,
        socialAccountIds: body.social_account_ids,
        scheduleAt: body.schedule_at ? new Date(body.schedule_at) : null,
        publishNow: body.publish_now,
        media,
        actorUserId: req.auth!.userId,
      });

      return reply.code(201).send(result);
    },
  );

  r.get(
    "/posts",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["posts"],
        description: "Lista posts com filtros",
        querystring: z.object({
          status: z.enum(POST_STATUSES).optional(),
          client_id: z.string().uuid().optional(),
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => {
      const q = req.query;
      const ids = await visibleClientIds(deps, req.auth!);
      if (ids !== undefined && ids.length === 0) return { posts: [] };
      if (q.client_id) await assertClientAccess(deps, req.auth!, q.client_id);

      let query = deps.db
        .from("posts")
        .select("*")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false })
        .range(q.offset, q.offset + q.limit - 1);
      if (ids !== undefined) query = query.in("client_id", ids);
      if (q.client_id) query = query.eq("client_id", q.client_id);
      if (q.status) query = query.eq("status", q.status);
      if (q.from) query = query.gte("created_at", q.from);
      if (q.to) query = query.lte("created_at", q.to);

      const { data: posts, error } = await query;
      if (error) throw httpError(500, error.message);

      const postIds = (posts ?? []).map((p) => p.id);
      const { data: targets } = postIds.length
        ? await deps.db.from("post_targets").select("*").in("post_id", postIds)
        : { data: [] as never[] };

      return {
        posts: (posts ?? []).map((p) => ({
          ...p,
          targets: (targets ?? []).filter((t) => t.post_id === p.id),
        })),
      };
    },
  );

  r.get(
    "/posts/:id",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["posts"], description: "Detalhe do post + alvos", params: postIdParam },
    },
    async (req) => {
      const post = await loadPostForActor(deps, req.auth!, req.params.id);
      const { data: targets } = await deps.db
        .from("post_targets")
        .select("*")
        .eq("post_id", post.id);
      return { post, targets: targets ?? [] };
    },
  );

  r.post(
    "/posts/:id/publish-now",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["posts"],
        description: "Força publicação imediata dos alvos pendentes",
        params: postIdParam,
      },
    },
    async (req) => {
      const post = await loadPostForActor(deps, req.auth!, req.params.id);
      const targets = await publishPostNow(deps, post, req.auth!.userId);
      return { queued: targets.length };
    },
  );

  r.delete(
    "/posts/:id",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["posts"],
        description: "Cancela post ainda não publicado",
        params: postIdParam,
      },
    },
    async (req, reply) => {
      const post = await loadPostForActor(deps, req.auth!, req.params.id);
      await deletePost(deps, post, req.auth!.userId);
      return reply.code(204).send();
    },
  );
}
