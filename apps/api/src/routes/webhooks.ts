// Webhook do n8n — server-to-server, autenticado por assinatura HMAC-SHA256
// do corpo bruto com N8N_WEBHOOK_SECRET (header x-lsm-signature, hex).
//
// Ações:
//   create_post  → baixa media_url, cria post (e publica/agenda)
//   publish_post → força publicação de um post existente

import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { safeEqual } from "@lsm/shared/crypto";
import { PRIVACY_LEVELS } from "@lsm/shared";
import type { ApiDeps } from "../deps.js";
import { httpError } from "../lib/errors.js";
import { createPost, findOrgOwnerId, publishPostNow } from "../lib/posts.js";

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;

const webhookBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_post"),
    client_id: z.string().uuid(),
    social_account_ids: z.array(z.string().uuid()).min(1),
    caption: z.string().max(2200).default(""),
    privacy_level: z.enum(PRIVACY_LEVELS).default("SELF_ONLY"),
    schedule_at: z.string().datetime({ offset: true }).optional(),
    publish_now: z.boolean().default(false),
    media_url: z.string().url(),
  }),
  z.object({
    action: z.literal("publish_post"),
    post_id: z.string().uuid(),
  }),
]);

type RequestWithRawBody = FastifyRequest & { rawBody?: Buffer };

async function downloadMedia(url: string) {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw httpError(422, `Falha ao baixar media_url: ${String(err)}`);
  }
  if (!res.ok) throw httpError(422, `media_url respondeu HTTP ${res.status}`);

  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) throw httpError(413, "Mídia excede 500 MB");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw httpError(422, "media_url retornou corpo vazio");
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw httpError(413, "Mídia excede 500 MB");

  const pathname = new URL(url).pathname;
  const filename = pathname.split("/").pop() || "video.mp4";
  const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "video/mp4";
  return { buffer, filename, mimeType };
}

export function registerWebhookRoutes(app: FastifyInstance, deps: ApiDeps): void {
  // escopo isolado: parser JSON que preserva o corpo bruto p/ verificar HMAC
  app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => {
        (req as RequestWithRawBody).rawBody = body as Buffer;
        try {
          done(null, JSON.parse((body as Buffer).toString("utf8")));
        } catch {
          done(httpError(400, "JSON inválido"), undefined);
        }
      },
    );

    scope.post(
      "/webhooks/n8n",
      {
        schema: {
          tags: ["webhooks"],
          description:
            "Gatilhos do n8n. Assinatura obrigatória: x-lsm-signature = " +
            "HMAC-SHA256(corpo bruto, N8N_WEBHOOK_SECRET) em hex",
        },
      },
      async (req) => {
        const raw = (req as RequestWithRawBody).rawBody;
        const signature = (req.headers["x-lsm-signature"] as string | undefined)
          ?.replace(/^sha256=/, "")
          .trim();
        if (!raw || !signature) throw httpError(401, "Assinatura ausente");

        const expected = createHmac("sha256", deps.config.N8N_WEBHOOK_SECRET)
          .update(raw)
          .digest("hex");
        if (!safeEqual(expected, signature)) throw httpError(401, "Assinatura inválida");

        const parsed = webhookBody.safeParse(req.body);
        if (!parsed.success) {
          throw httpError(
            400,
            `Payload inválido: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
          );
        }
        const body = parsed.data;

        if (body.action === "create_post") {
          const { data: client } = await deps.db
            .from("clients")
            .select("id, org_id")
            .eq("id", body.client_id)
            .maybeSingle();
          if (!client) throw httpError(404, "Cliente não encontrado");

          const ownerId = await findOrgOwnerId(deps, client.org_id);
          const media = await downloadMedia(body.media_url);

          const { post, targets } = await createPost(deps, {
            orgId: client.org_id,
            clientId: client.id,
            createdBy: ownerId,
            caption: body.caption,
            privacyLevel: body.privacy_level,
            socialAccountIds: body.social_account_ids,
            scheduleAt: body.schedule_at ? new Date(body.schedule_at) : null,
            publishNow: body.publish_now,
            media,
            actorUserId: null, // automação
          });
          return { post_id: post.id, status: post.status, targets: targets.length };
        }

        // publish_post
        const { data: post } = await deps.db
          .from("posts")
          .select("*")
          .eq("id", body.post_id)
          .maybeSingle();
        if (!post) throw httpError(404, "Post não encontrado");
        const queued = await publishPostNow(deps, post, null);
        return { post_id: post.id, queued: queued.length };
      },
    );
  });
}
