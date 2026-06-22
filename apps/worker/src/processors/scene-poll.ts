// queue:scene-poll — fallback de polling do status da cena na kie. Em done,
// grava a URL, cobra a cena e dispara o stitch; em failed, marca e segue
// (best-effort). É idempotente: se a cena já terminou, sai.

import type { Job } from "bullmq";
import { kieRecordInfo, creditsForModel } from "@lsm/shared/kie";
import { toBullJobId, type ScenePollJobData } from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { loadRunContext, logStep, maybeEnqueueStitch } from "../lib/auto-runtime.js";

const POLL_INTERVAL_MS = 20_000;
const MAX_POLLS = 60; // ~20 min

export function createScenePollProcessor(deps: WorkerDeps) {
  return async (job: Job<ScenePollJobData>): Promise<void> => {
    const key = deps.config.KIE_API_KEY;
    const attempt = job.data.attempt ?? 0;
    const { data: scene } = await deps.db
      .from("automation_scenes")
      .select("*")
      .eq("id", job.data.sceneId)
      .maybeSingle();
    if (!scene) return;
    if (scene.status === "done" || scene.status === "failed") return; // já finalizada
    if (!key || !scene.provider_task_id) return;

    const { data: video } = await deps.db
      .from("automation_videos")
      .select("run_id")
      .eq("id", scene.video_id)
      .maybeSingle();
    const ctx = video ? await loadRunContext(deps, video.run_id) : null;

    let rec;
    try {
      rec = await kieRecordInfo(key, scene.provider_task_id);
    } catch {
      // rede → re-tenta
      if (attempt < MAX_POLLS) {
        await deps.queues.scenePoll.add(
          "poll",
          { sceneId: scene.id, attempt: attempt + 1 },
          { jobId: toBullJobId(`poll:${scene.id}:${attempt + 1}`), delay: POLL_INTERVAL_MS },
        );
      }
      return;
    }

    if (rec.status === "done" && rec.resultUrl) {
      const perScene = ctx
        ? ctx.config.credits_per_scene > 0
          ? ctx.config.credits_per_scene
          : creditsForModel(ctx.config.video_model, ctx.config.duration_per_scene, deps.config.CREDIT_MARKUP)
        : 0;
      await deps.db
        .from("automation_scenes")
        .update({ status: "done", video_url: rec.resultUrl, credits_charged: perScene, error: null })
        .eq("id", scene.id);
      if (ctx) await logStep(deps, ctx.run, `scene:${scene.id}`, "done");
      await maybeEnqueueStitch(deps, scene.video_id);
      return;
    }

    if (rec.status === "failed") {
      await deps.db
        .from("automation_scenes")
        .update({ status: "failed", error: (rec.error ?? "geração falhou").slice(0, 500) })
        .eq("id", scene.id);
      if (ctx) await logStep(deps, ctx.run, `scene:${scene.id}`, "failed");
      await maybeEnqueueStitch(deps, scene.video_id);
      return;
    }

    // ainda processando → re-agenda (com teto)
    if (attempt >= MAX_POLLS) {
      await deps.db
        .from("automation_scenes")
        .update({ status: "failed", error: "timeout de polling da cena" })
        .eq("id", scene.id);
      await maybeEnqueueStitch(deps, scene.video_id);
      return;
    }
    await deps.queues.scenePoll.add(
      "poll",
      { sceneId: scene.id, attempt: attempt + 1 },
      { jobId: toBullJobId(`poll:${scene.id}:${attempt + 1}`), delay: POLL_INTERVAL_MS },
    );
  };
}
