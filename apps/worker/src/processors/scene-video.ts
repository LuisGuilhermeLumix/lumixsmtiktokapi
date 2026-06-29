// queue:scene-video — gera 1 cena: cria a task de vídeo na kie com callBackUrl
// (callback = principal, princípio #8) e agenda o scene-poll como fallback.

import type { Job } from "bullmq";
import { KieError } from "@lsm/shared/kie";
import { toBullJobId, type SceneVideoJobData, type ScenePollJobData } from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { loadRunContext, logStep } from "../lib/auto-runtime.js";
import { withRetry } from "../lib/retry.js";

const POLL_DELAY_MS = 20_000;

export function createSceneVideoProcessor(deps: WorkerDeps) {
  return async (job: Job<SceneVideoJobData>): Promise<void> => {
    const key = deps.config.KIE_API_KEY;
    const { data: scene } = await deps.db
      .from("automation_scenes")
      .select("*")
      .eq("id", job.data.sceneId)
      .maybeSingle();
    if (!scene || scene.status !== "queued") return;
    const { data: video } = await deps.db
      .from("automation_videos")
      .select("run_id")
      .eq("id", scene.video_id)
      .maybeSingle();
    if (!video) return;
    const ctx = await loadRunContext(deps, video.run_id);
    if (!ctx || !key) {
      await deps.db.from("automation_scenes").update({ status: "failed", error: "sem contexto/KIE_API_KEY" }).eq("id", scene.id);
      return;
    }
    const { config, run } = ctx;

    const callBackUrl = deps.config.API_PUBLIC_URL
      ? `${deps.config.API_PUBLIC_URL}/webhooks/kie` +
        (deps.config.KIE_CALLBACK_SECRET ? `?secret=${deps.config.KIE_CALLBACK_SECRET}` : "")
      : undefined;

    try {
      const taskId = await withRetry(
        () =>
          deps.provider.createTask({
            model: config.video_model,
            input: {
              prompt: scene.prompt ?? scene.beat ?? "",
              aspect_ratio: "9:16",
              duration: config.duration_per_scene,
              ...(scene.image_url ? { imageUrls: [scene.image_url] } : {}),
            },
            callBackUrl,
          }),
        {
          tries: config.max_tries,
          waitMs: config.retry_wait_s * 1000,
          onAttempt: (attempt, err) => logStep(deps, run, `scene:${scene.id}`, "started", { retry: attempt, error: err.message.slice(0, 200) }),
        },
      );
      await deps.db
        .from("automation_scenes")
        .update({ status: "video", provider: deps.provider.name, provider_task_id: taskId, error: null })
        .eq("id", scene.id);
      // fallback: poll mesmo que o callback não chegue
      const data: ScenePollJobData = { sceneId: scene.id, attempt: 0 };
      await deps.queues.scenePoll.add("poll", data, {
        jobId: toBullJobId(`poll:${scene.id}:0`),
        delay: POLL_DELAY_MS,
      });
      await logStep(deps, run, `scene:${scene.id}`, "started", { taskId });
    } catch (e) {
      const status = e instanceof KieError ? e.status : 0;
      await deps.db
        .from("automation_scenes")
        .update({ status: "failed", error: `kie create [${status}]: ${(e as Error).message}`.slice(0, 500) })
        .eq("id", scene.id);
      await logStep(deps, run, `scene:${scene.id}`, "failed", { status });
      if (config.on_error === "stop") {
        // política "parar": derruba o vídeo inteiro
        await deps.db
          .from("automation_videos")
          .update({ status: "failed", error: `cena ${scene.idx} falhou: ${(e as Error).message}`.slice(0, 500) })
          .eq("id", scene.video_id)
          .neq("status", "published");
      } else {
        // política "continuar": segue best-effort (junta as cenas que deram certo)
        const { maybeEnqueueStitch } = await import("../lib/auto-runtime.js");
        await maybeEnqueueStitch(deps, scene.video_id);
      }
    }
  };
}
