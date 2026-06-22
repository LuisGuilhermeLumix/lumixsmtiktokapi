// Estúdio de Conteúdo IA — gerações (Magic Hour / kie.ai), automações e créditos.
// Cobrança = créditos LSM (custo do provider + markup). Geração avulsa usa
// polling lazy no GET; webhook /webhooks/kie finaliza as gerações kie.

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { GENERATION_KINDS, toBullJobId } from "@lsm/shared";
import { creditsForModel, kieCreateTask, kieRecordInfo, KieError } from "@lsm/shared/kie";
import { mhCreateVideo, mhGetVideo, MagicHourError } from "@lsm/shared/magichour";
import type { Json, Tables } from "@lsm/db";
import type { ApiDeps } from "../deps.js";
import { assertClientAccess } from "../lib/access.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";

type Provider = "kie" | "magichour";

/** lê o provider salvo no input jsonb da geração */
function readProvider(input: Json | null): Provider {
  const o = (input ?? {}) as Record<string, unknown>;
  return o.provider === "magichour" ? "magichour" : "kie";
}

function mapGeneration(g: Tables<"generations">) {
  return {
    id: g.id,
    kind: g.kind,
    model: g.model,
    prompt: g.prompt,
    status: g.status,
    result_url: g.result_url,
    credits_charged: g.credits_charged,
    error: g.error,
    created_at: g.created_at,
  };
}

/** debita créditos da org (lança 402 se insuficiente) e registra na razão */
async function chargeCredits(
  deps: ApiDeps,
  orgId: string,
  amount: number,
  reason: string,
  generationId?: string,
): Promise<void> {
  if (amount <= 0) return;
  const { data: org, error } = await deps.db
    .from("organizations")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  if (error || !org) throw httpError(500, "Falha ao ler saldo de créditos");
  if (org.credits_balance < amount) {
    throw httpError(402, `Créditos insuficientes (saldo ${org.credits_balance}, custo ${amount})`);
  }
  const balanceAfter = org.credits_balance - amount;
  await deps.db.from("organizations").update({ credits_balance: balanceAfter }).eq("id", orgId);
  await deps.db.from("credit_ledger").insert({
    org_id: orgId,
    delta: -amount,
    reason,
    generation_id: generationId ?? null,
    balance_after: balanceAfter,
  });
}

/** estorna créditos (ex.: geração falhou) */
async function refundCredits(
  deps: ApiDeps,
  orgId: string,
  amount: number,
  generationId?: string,
): Promise<void> {
  if (amount <= 0) return;
  const { data: org } = await deps.db
    .from("organizations")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  if (!org) return;
  const balanceAfter = org.credits_balance + amount;
  await deps.db.from("organizations").update({ credits_balance: balanceAfter }).eq("id", orgId);
  await deps.db.from("credit_ledger").insert({
    org_id: orgId,
    delta: amount,
    reason: "refund",
    generation_id: generationId ?? null,
    balance_after: balanceAfter,
  });
}

export function registerContentRoutes(app: FastifyInstance, deps: ApiDeps, auth: AuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ───────────── créditos ─────────────
  r.get(
    "/credits",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["studio"], description: "Saldo de créditos da organização" },
    },
    async (req) => {
      const { data } = await deps.db
        .from("organizations")
        .select("credits_balance")
        .eq("id", req.auth!.orgId)
        .single();
      return { balance: data?.credits_balance ?? 0 };
    },
  );

  // ───────────── gerações ─────────────
  r.post(
    "/generations",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["studio"],
        description: "Cria uma geração de imagem/vídeo via Magic Hour ou kie.ai (debita créditos)",
        body: z.object({
          kind: z.enum(GENERATION_KINDS),
          provider: z.enum(["kie", "magichour"]).default("magichour"),
          model: z.string().min(1),
          model_id: z.string().optional(),
          prompt: z.string().min(1).max(5000),
          aspect_ratio: z.string().optional(),
          duration: z.coerce.number().int().positive().optional(),
          image_url: z.string().url().optional(),
          client_id: z.string().uuid().optional(),
        }),
      },
    },
    async (req, reply) => {
      const b = req.body;
      const provider: Provider = b.provider;
      if (provider === "magichour" && b.kind === "image") {
        throw httpError(400, "Magic Hour gera vídeo; para imagem use o provider kie.");
      }
      const hasKey =
        provider === "magichour" ? !!deps.config.MAGICHOUR_API_KEY : !!deps.config.KIE_API_KEY;
      if (!hasKey) {
        const envName = provider === "magichour" ? "MAGICHOUR_API_KEY" : "KIE_API_KEY";
        throw httpError(503, `Estúdio IA indisponível: configure ${envName} na API.`);
      }
      if (b.client_id) await assertClientAccess(deps, req.auth!, b.client_id);

      const cost = creditsForModel(
        b.model,
        b.kind === "video" ? b.duration : undefined,
        deps.config.CREDIT_MARKUP,
      );
      await chargeCredits(deps, req.auth!.orgId, cost, "generation");

      const input: Record<string, unknown> = { prompt: b.prompt };
      if (b.aspect_ratio) input.aspect_ratio = b.aspect_ratio;
      if (b.kind === "video" && b.duration) input.duration = b.duration;
      if (b.image_url) input.image_url = b.image_url;

      let taskId: string;
      try {
        if (provider === "magichour") {
          const sub = await mhCreateVideo(deps.config.MAGICHOUR_API_KEY!, {
            model: b.model,
            prompt: b.prompt,
            endSeconds: b.duration ?? 5,
            aspectRatio: b.aspect_ratio ?? "9:16",
            // resolução opcional via env (tiers baixos não liberam 720p+);
            // sem valor, a Magic Hour usa o default do modelo/plano
            resolution: deps.config.MAGICHOUR_RESOLUTION,
            imageUrl: b.image_url,
          });
          taskId = sub.id;
        } else {
          const callBackUrl = deps.config.API_PUBLIC_URL
            ? `${deps.config.API_PUBLIC_URL}/webhooks/kie` +
              (deps.config.KIE_CALLBACK_SECRET ? `?secret=${deps.config.KIE_CALLBACK_SECRET}` : "")
            : undefined;
          taskId = await kieCreateTask(deps.config.KIE_API_KEY!, {
            model: b.model,
            input,
            callBackUrl,
          });
        }
      } catch (err) {
        await refundCredits(deps, req.auth!.orgId, cost);
        const status =
          err instanceof KieError || err instanceof MagicHourError ? err.status || 502 : 502;
        throw httpError(status, `${provider}: ${(err as Error).message}`);
      }
      input.provider = provider;

      const { data: gen, error } = await deps.db
        .from("generations")
        .insert({
          org_id: req.auth!.orgId,
          client_id: b.client_id ?? null,
          created_by: req.auth!.userId,
          kind: b.kind,
          model: b.model,
          prompt: b.prompt,
          input: input as unknown as Json,
          status: "processing",
          kie_task_id: taskId,
          credits_charged: cost,
        })
        .select("*")
        .single();
      if (error || !gen) {
        await refundCredits(deps, req.auth!.orgId, cost);
        throw httpError(500, `Falha ao registrar geração: ${error?.message}`);
      }

      return reply.code(201).send(mapGeneration(gen));
    },
  );

  r.get(
    "/generations",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["studio"],
        description: "Biblioteca de gerações da organização",
        querystring: z.object({
          kind: z.enum(GENERATION_KINDS).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(60),
        }),
      },
    },
    async (req) => {
      let q = deps.db
        .from("generations")
        .select("*")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false })
        .limit(req.query.limit);
      if (req.query.kind) q = q.eq("kind", req.query.kind);
      const { data, error } = await q;
      if (error) throw httpError(500, error.message);
      return { generations: (data ?? []).map(mapGeneration) };
    },
  );

  r.get(
    "/generations/:id",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["studio"],
        description: "Status de uma geração (faz polling no provider se ainda pendente)",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req) => {
      const { data: gen, error } = await deps.db
        .from("generations")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!gen || gen.org_id !== req.auth!.orgId) throw httpError(404, "Geração não encontrada");

      const pending = gen.status === "queued" || gen.status === "processing";
      const provider = readProvider(gen.input);
      const canPoll =
        provider === "magichour" ? !!deps.config.MAGICHOUR_API_KEY : !!deps.config.KIE_API_KEY;
      if (pending && gen.kie_task_id && canPoll) {
        try {
          const rec =
            provider === "magichour"
              ? await mhGetVideo(deps.config.MAGICHOUR_API_KEY!, gen.kie_task_id)
              : await kieRecordInfo(deps.config.KIE_API_KEY!, gen.kie_task_id);
          if (rec.status === "done" && rec.resultUrl) {
            const { data: upd } = await deps.db
              .from("generations")
              .update({ status: "done", result_url: rec.resultUrl, error: null })
              .eq("id", gen.id)
              .select("*")
              .single();
            return mapGeneration(upd ?? { ...gen, status: "done", result_url: rec.resultUrl });
          }
          if (rec.status === "failed") {
            await refundCredits(deps, gen.org_id, gen.credits_charged, gen.id);
            const { data: upd } = await deps.db
              .from("generations")
              .update({ status: "failed", error: rec.error })
              .eq("id", gen.id)
              .select("*")
              .single();
            return mapGeneration(upd ?? { ...gen, status: "failed", error: rec.error });
          }
        } catch {
          /* mantém pendente — próxima consulta tenta de novo */
        }
      }
      return mapGeneration(gen);
    },
  );

  // ───────────── automações (esteira) ─────────────
  r.post(
    "/automations",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["studio"],
        description: "Cria/ativa uma automação de conteúdo (esteira diária)",
        body: z.object({
          client_id: z.string().uuid().optional(),
          social_account_id: z.string().uuid(),
          niche: z.string().min(1).max(200),
          videos_per_day: z.coerce.number().int().min(1).max(12),
          video_duration: z.coerce.number().int().min(4).max(60),
          image_model: z.string().min(1),
          video_model: z.string().min(1),
          scene_agent_prompt: z.string().max(5000).default(""),
          video_agent_prompt: z.string().max(5000).default(""),
          post_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
        }),
      },
    },
    async (req, reply) => {
      const b = req.body;
      if (b.client_id) await assertClientAccess(deps, req.auth!, b.client_id);
      const { data, error } = await deps.db
        .from("content_automations")
        .insert({
          org_id: req.auth!.orgId,
          client_id: b.client_id ?? null,
          social_account_id: b.social_account_id,
          created_by: req.auth!.userId,
          niche: b.niche,
          videos_per_day: b.videos_per_day,
          video_duration: b.video_duration,
          image_model: b.image_model,
          video_model: b.video_model,
          scene_agent_prompt: b.scene_agent_prompt,
          video_agent_prompt: b.video_agent_prompt,
          post_times: b.post_times,
          status: "active",
        })
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar automação: ${error?.message}`);
      return reply.code(201).send({ automation: data });
    },
  );

  r.get(
    "/automations",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["studio"], description: "Lista automações da organização" },
    },
    async (req) => {
      const { data, error } = await deps.db
        .from("content_automations")
        .select("*")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false });
      if (error) throw httpError(500, error.message);
      return { automations: data ?? [] };
    },
  );

  // ───────────── webhook kie.ai (público) ─────────────
  app.post<{ Querystring: { secret?: string } }>(
    "/webhooks/kie",
    { schema: { tags: ["webhooks"], description: "Callback de conclusão da kie.ai" } },
    async (req, reply) => {
      if (
        deps.config.KIE_CALLBACK_SECRET &&
        req.query.secret !== deps.config.KIE_CALLBACK_SECRET
      ) {
        throw httpError(401, "secret inválido");
      }
      const body = req.body as { data?: { taskId?: string } } | undefined;
      const taskId = body?.data?.taskId;
      if (!taskId) return reply.code(200).send({ ok: true });

      const { data: gen } = await deps.db
        .from("generations")
        .select("*")
        .eq("kie_task_id", taskId)
        .maybeSingle();
      if (!gen || (gen.status !== "queued" && gen.status !== "processing")) {
        // pode ser uma CENA do motor de automações → avança via scene-poll
        const { data: scene } = await deps.db
          .from("automation_scenes")
          .select("id, status")
          .eq("provider_task_id", taskId)
          .maybeSingle();
        if (scene && (scene.status === "video" || scene.status === "queued")) {
          await deps.queues.scenePoll.add(
            "poll",
            { sceneId: scene.id, attempt: 0 },
            { jobId: toBullJobId(`poll:${scene.id}:cb`) },
          );
        }
        return reply.code(200).send({ ok: true });
      }

      if (!deps.config.KIE_API_KEY) return reply.code(200).send({ ok: true });
      try {
        const rec = await kieRecordInfo(deps.config.KIE_API_KEY, taskId);
        if (rec.status === "done" && rec.resultUrl) {
          await deps.db
            .from("generations")
            .update({ status: "done", result_url: rec.resultUrl, error: null })
            .eq("id", gen.id);
        } else if (rec.status === "failed") {
          await refundCredits(deps, gen.org_id, gen.credits_charged, gen.id);
          await deps.db
            .from("generations")
            .update({ status: "failed", error: rec.error })
            .eq("id", gen.id);
        }
      } catch {
        /* o polling lazy do GET resolve depois */
      }
      return reply.code(200).send({ ok: true });
    },
  );
}
