// queue:script-generate — agente diretor (LLM kie) gera o roteiro em N beats e
// a legenda; seleciona o hook do niche pack (rotação) e cria as cenas.

import type { Job } from "bullmq";
import { resolveExpressions } from "@lsm/shared/automation";
import { selectHook, sanitizeText } from "@lsm/shared/niche";
import {
  automationSceneId,
  toBullJobId,
  type ScriptGenJobData,
  type SceneVideoJobData,
} from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { loadRunContext, logStep } from "../lib/auto-runtime.js";
import { withRetry } from "../lib/retry.js";

function hashNum(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** quebra o roteiro em N beats (~uma frase cada) */
function splitBeats(text: string, n: number): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  if (sentences.length >= n) {
    // agrupa em N blocos contíguos
    const out: string[] = [];
    const per = Math.ceil(sentences.length / n);
    for (let i = 0; i < n; i++) out.push(sentences.slice(i * per, (i + 1) * per).join(" "));
    return out.filter(Boolean).slice(0, n);
  }
  // poucas frases → repete/preenche
  return Array.from({ length: n }, (_, i) => sentences[i % Math.max(1, sentences.length)] ?? text);
}

export function createScriptGenProcessor(deps: WorkerDeps) {
  return async (job: Job<ScriptGenJobData>): Promise<void> => {
    const key = deps.config.KIE_API_KEY;
    const { data: video } = await deps.db
      .from("automation_videos")
      .select("*")
      .eq("id", job.data.videoId)
      .maybeSingle();
    if (!video || video.status !== "queued") return;
    const ctx = await loadRunContext(deps, video.run_id);
    if (!ctx) return;
    const { run, config, pack } = ctx;
    const llm = config.llm_model || deps.config.KIE_LLM_MODEL; // modelo escolhido no nó

    if (!key) {
      await deps.db.from("automation_videos").update({ status: "failed", error: "sem KIE_API_KEY" }).eq("id", video.id);
      return;
    }

    await deps.db.from("automation_videos").update({ status: "scripting" }).eq("id", video.id);
    await logStep(deps, run, `script:${video.id}`, "started");

    const hook = pack ? selectHook(pack, hashNum(video.id)) : null;
    const niche = config.niche_pack_id ?? "";
    const charNote = ctx.character ? `Personagem (fictício): ${ctx.character.name} — ${ctx.character.description}.` : "";

    // contexto de expressões {{ }} (estilo n8n) — resolve nos prompts
    let acctName: string | null = null;
    if (video.social_account_id) {
      const { data: acct } = await deps.db
        .from("social_accounts")
        .select("display_name")
        .eq("id", video.social_account_id)
        .maybeSingle();
      acctName = acct?.display_name ?? null;
    }
    const exprCtx = {
      now: new Date().toISOString(),
      niche,
      account: { display_name: acctName, name: acctName },
      character: ctx.character ? { name: ctx.character.name, description: ctx.character.description } : undefined,
      video: { idx: video.idx },
    };
    const directorPrompt = resolveExpressions(config.director_prompt, exprCtx);
    const captionPrompt = resolveExpressions(config.caption_prompt, exprCtx);

    // agente diretor → roteiro
    let script: string;
    try {
      script = await withRetry(
        () =>
          deps.provider.llm(
            llm,
            `${directorPrompt}\n\nNicho: ${niche}\n${charNote}\n` +
              (hook ? `Comece com o gancho: "${hook.text}".\n` : "") +
              `Escreva um roteiro de vídeo curto para TikTok dividido em ${config.num_scenes} cena(s), ` +
              `cada cena uma frase visual descritiva (em inglês), uma por linha.`,
          ),
        { tries: config.max_tries, waitMs: config.retry_wait_s * 1000 },
      );
    } catch (e) {
      await deps.db.from("automation_videos").update({ status: "failed", error: `diretor: ${(e as Error).message}`.slice(0, 500) }).eq("id", video.id);
      await logStep(deps, run, `script:${video.id}`, "failed");
      return;
    }

    // legenda
    let caption = "";
    try {
      caption = await deps.provider.llm(
        llm,
        `${captionPrompt}\n\nNicho: ${niche}\nGere a legenda final para TikTok (curta, 2-3 hashtags).`,
      );
    } catch {
      caption = hook?.text ?? "";
    }
    if (pack) caption = sanitizeText(pack, caption, 1);

    const beats = splitBeats(script, config.num_scenes);
    await deps.db
      .from("automation_videos")
      .update({ caption: caption.slice(0, 2200), status: "rendering_scenes", num_scenes: beats.length })
      .eq("id", video.id);

    for (let i = 0; i < beats.length; i++) {
      const sceneId = automationSceneId(video.id, i);
      const prompt = pack ? sanitizeText(pack, beats[i]!, 1) : beats[i]!;
      const { error } = await deps.db.from("automation_scenes").insert({
        id: sceneId,
        video_id: video.id,
        org_id: run.org_id,
        idx: i,
        status: "queued",
        beat: beats[i]!.slice(0, 2000),
        prompt: prompt.slice(0, 2000),
      });
      if (error && error.code !== "23505") continue;
      const data: SceneVideoJobData = { sceneId };
      await deps.queues.sceneVideo.add("scene", data, { jobId: toBullJobId(`scene:${sceneId}`) });
    }
    await logStep(deps, run, `script:${video.id}`, "done", { scenes: beats.length });
  };
}
