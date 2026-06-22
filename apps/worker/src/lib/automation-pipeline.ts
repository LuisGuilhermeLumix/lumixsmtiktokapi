// Esteira de automação: para cada automação devida, roda os agentes LLM da
// kie.ai (cenas + roteiro), gera as imagens das cenas e o vídeo, debita créditos
// e cria um post que entra na fila de publicação do TikTok.
//
// ⚠️ Construído conforme a doc da kie.ai; os campos de input por modelo e o
//    parsing de resposta podem precisar de ajuste fino com a KIE_API_KEY real.

import { POST_MEDIA_BUCKET, postMediaPath, type Json, type Tables } from "@lsm/db";
import { publishJobId } from "@lsm/shared";
import { creditsForModel, kieLLM, kieRunToCompletion } from "@lsm/shared/kie";
import type { WorkerDeps } from "../deps.js";

/** debita créditos da org; retorna false se saldo insuficiente */
async function charge(
  deps: WorkerDeps,
  orgId: string,
  amount: number,
  generationId?: string,
): Promise<boolean> {
  if (amount <= 0) return true;
  const { data: org } = await deps.db
    .from("organizations")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  if (!org || org.credits_balance < amount) return false;
  const balanceAfter = org.credits_balance - amount;
  await deps.db.from("organizations").update({ credits_balance: balanceAfter }).eq("id", orgId);
  await deps.db.from("credit_ledger").insert({
    org_id: orgId,
    delta: -amount,
    reason: "automation",
    generation_id: generationId ?? null,
    balance_after: balanceAfter,
  });
  return true;
}

/** registra uma geração concluída na biblioteca */
async function saveGeneration(
  deps: WorkerDeps,
  row: {
    orgId: string;
    clientId: string | null;
    automationId: string;
    kind: "image" | "video";
    model: string;
    prompt: string;
    resultUrl: string;
    credits: number;
  },
): Promise<string | null> {
  const { data } = await deps.db
    .from("generations")
    .insert({
      org_id: row.orgId,
      client_id: row.clientId,
      automation_id: row.automationId,
      kind: row.kind,
      model: row.model,
      prompt: row.prompt,
      input: {} as Json,
      status: "done",
      result_url: row.resultUrl,
      credits_charged: row.credits,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

/** quebra a resposta do agente de cenas em N prompts (um por linha) */
function parseScenePrompts(text: string, n: number): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)\-]\s*/, "").trim())
    .filter((l) => l.length > 8);
  return (lines.length ? lines : [text.trim()]).slice(0, n);
}

/** roda a esteira completa de uma automação */
export async function runAutomation(deps: WorkerDeps, automationId: string): Promise<void> {
  const apiKey = deps.config.KIE_API_KEY;
  if (!apiKey) {
    console.warn("[automation] KIE_API_KEY ausente — esteira ignorada");
    return;
  }

  const { data: auto } = await deps.db
    .from("content_automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();
  if (!auto || auto.status !== "active") return;

  // conta de destino → client_id; ator = um usuário da org (created_by é NOT NULL)
  const { data: account } = await deps.db
    .from("social_accounts")
    .select("id, client_id, status")
    .eq("id", auto.social_account_id)
    .maybeSingle();
  if (!account || account.status !== "connected") {
    console.warn(`[automation ${automationId}] conta indisponível — pulando`);
    return;
  }
  const { data: actor } = await deps.db
    .from("users")
    .select("id")
    .eq("org_id", auto.org_id)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!actor) {
    console.warn(`[automation ${automationId}] org sem usuário p/ created_by`);
    return;
  }

  const markup = deps.config.CREDIT_MARKUP;
  const scenesPerVideo = Math.max(1, Math.round(auto.video_duration / 4));

  // custo total estimado — cobra ANTES de gastar na kie (job sem retry evita dupla cobrança)
  const totalCost =
    creditsForModel(auto.image_model, undefined, markup) * scenesPerVideo +
    creditsForModel(auto.video_model, auto.video_duration, markup);
  const ok = await charge(deps, auto.org_id, totalCost);
  if (!ok) {
    console.warn(`[automation ${automationId}] créditos insuficientes (custo ${totalCost})`);
    return;
  }

  // 1) agente de cenas → prompts das imagens
  const sceneText = await kieLLM(
    apiKey,
    deps.config.KIE_LLM_MODEL,
    `${auto.scene_agent_prompt}\n\nNicho do perfil: ${auto.niche}\n` +
      `Gere exatamente ${scenesPerVideo} prompts de imagem (em inglês), um por linha, sem numeração.`,
  );
  const scenePrompts = parseScenePrompts(sceneText, scenesPerVideo);

  // 2) agente de vídeo → roteiro/legenda
  const caption = (
    await kieLLM(
      apiKey,
      deps.config.KIE_LLM_MODEL,
      `${auto.video_agent_prompt}\n\nNicho do perfil: ${auto.niche}\n` +
        `Escreva a legenda final do vídeo para TikTok (curta, com 2-3 hashtags).`,
    )
  ).slice(0, 2200);

  // 3) imagens das cenas
  const imageUrls: string[] = [];
  for (const p of scenePrompts) {
    const rec = await kieRunToCompletion(apiKey, {
      model: auto.image_model,
      input: { prompt: p, aspect_ratio: "9:16" },
    });
    if (rec.status === "done" && rec.resultUrl) {
      imageUrls.push(rec.resultUrl);
      await saveGeneration(deps, {
        orgId: auto.org_id,
        clientId: account.client_id,
        automationId,
        kind: "image",
        model: auto.image_model,
        prompt: p,
        resultUrl: rec.resultUrl,
        credits: creditsForModel(auto.image_model, undefined, markup),
      });
    }
  }

  // 4) vídeo (usa a 1ª imagem como referência quando o modelo aceita)
  const videoInput: Record<string, unknown> = {
    prompt: scenePrompts.join(". "),
    aspect_ratio: "9:16",
    duration: auto.video_duration,
  };
  if (imageUrls.length) videoInput.imageUrls = [imageUrls[0]];

  const videoRec = await kieRunToCompletion(
    apiKey,
    { model: auto.video_model, input: videoInput },
    { timeoutMs: 15 * 60_000 },
  );
  if (videoRec.status !== "done" || !videoRec.resultUrl) {
    console.error(`[automation ${automationId}] vídeo falhou: ${videoRec.error}`);
    return;
  }
  const videoGenId = await saveGeneration(deps, {
    orgId: auto.org_id,
    clientId: account.client_id,
    automationId,
    kind: "video",
    model: auto.video_model,
    prompt: caption,
    resultUrl: videoRec.resultUrl,
    credits: creditsForModel(auto.video_model, auto.video_duration, markup),
  });

  // 5) baixa o vídeo e cria o post → fila de publicação
  await publishGeneratedVideo(deps, {
    orgId: auto.org_id,
    clientId: account.client_id,
    createdBy: actor.id,
    socialAccountId: auto.social_account_id,
    caption,
    videoUrl: videoRec.resultUrl,
  });

  await deps.db
    .from("content_automations")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", automationId);

  console.log(
    `[automation ${automationId}] post criado (gen ${videoGenId}) e enfileirado p/ publicação`,
  );
}

/** baixa a mídia gerada, sobe no Storage e dispara a publicação no TikTok */
async function publishGeneratedVideo(
  deps: WorkerDeps,
  args: {
    orgId: string;
    clientId: string | null;
    createdBy: string;
    socialAccountId: string;
    caption: string;
    videoUrl: string;
  },
): Promise<void> {
  if (!args.clientId) {
    console.warn("[automation] conta sem client_id — post não criado");
    return;
  }
  const res = await fetch(args.videoUrl);
  if (!res.ok) throw new Error(`download do vídeo falhou (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const { data: post } = await deps.db
    .from("posts")
    .insert({
      org_id: args.orgId,
      client_id: args.clientId,
      created_by: args.createdBy,
      caption: args.caption,
      privacy_level: "PUBLIC_TO_EVERYONE",
      status: "queued",
    })
    .select("*")
    .single();
  if (!post) throw new Error("falha ao criar post");

  const path = postMediaPath(args.orgId, args.clientId, post.id, "video.mp4");
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
      social_account_id: args.socialAccountId,
      platform: "tiktok",
      status: "queued",
    })
    .select("id")
    .single();
  if (!target) throw new Error("falha ao criar post_target");

  await deps.queues.publish.add(
    "publish",
    { postTargetId: target.id },
    { jobId: publishJobId(target.id) },
  );
}

/** varre automações ativas e enfileira as que têm um horário batendo agora */
export async function scanDueAutomations(deps: WorkerDeps): Promise<void> {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: deps.config.AUTOMATION_TZ,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hhmm = `${get("hour")}:${get("minute")}`;
  const ymd = `${get("year")}${get("month")}${get("day")}`;

  const { data: autos } = await deps.db
    .from("content_automations")
    .select("id, post_times")
    .eq("status", "active");

  for (const a of (autos ?? []) as Pick<Tables<"content_automations">, "id" | "post_times">[]) {
    if (!a.post_times?.includes(hhmm)) continue;
    // jobId determinístico por slot → idempotente (não publica 2x no mesmo minuto)
    await deps.queues.automation.add(
      "run",
      { automationId: a.id },
      { jobId: `auto-${a.id}-${ymd}-${get("hour")}${get("minute")}`, attempts: 1 },
    );
  }
}
