// queue:video-stitch — junta as cenas no vídeo final e publica. Na Fase 3 (1
// cena) é passthrough; multi-cena usa FFmpeg (auto-ffmpeg, Fase 4). Best-effort:
// se faltam cenas mas `best_effort_stitch`, segue com as que deram certo.

import type { Job } from "bullmq";
import type { VideoStitchJobData } from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { finalizeRunIfDone, loadRunContext, logStep } from "../lib/auto-runtime.js";
import { publishFinalVideo } from "../lib/auto-publish.js";
import { stitchScenes } from "../lib/auto-ffmpeg.js";

export function createVideoStitchProcessor(deps: WorkerDeps) {
  return async (job: Job<VideoStitchJobData>): Promise<void> => {
    const { data: video } = await deps.db
      .from("automation_videos")
      .select("*")
      .eq("id", job.data.videoId)
      .maybeSingle();
    if (!video || video.status === "published" || video.status === "failed") return;
    const ctx = await loadRunContext(deps, video.run_id);
    if (!ctx) return;
    const { run, config } = ctx;

    const { data: scenes } = await deps.db
      .from("automation_scenes")
      .select("*")
      .eq("video_id", video.id)
      .order("idx", { ascending: true });
    const done = (scenes ?? []).filter((s) => s.status === "done" && s.video_url);

    if (done.length === 0) {
      await deps.db.from("automation_videos").update({ status: "failed", error: "nenhuma cena gerada" }).eq("id", video.id);
      await logStep(deps, run, `stitch:${video.id}`, "failed", { reason: "no_scenes" });
      await finalizeRunIfDone(deps, run.id);
      return;
    }
    // se faltou cena e não é best-effort → falha
    if (done.length < (video.num_scenes ?? done.length) && !config.best_effort_stitch) {
      await deps.db.from("automation_videos").update({ status: "failed", error: "cenas faltando (sem best-effort)" }).eq("id", video.id);
      await finalizeRunIfDone(deps, run.id);
      return;
    }

    await logStep(deps, run, `stitch:${video.id}`, "started", { scenes: done.length });
    try {
      const urls = done.map((s) => s.video_url!);
      const source =
        urls.length === 1
          ? { url: urls[0]! } // passthrough de 1 cena
          : {
              buffer: await stitchScenes({
                tmpKey: video.id,
                sceneUrls: urls,
                mode: config.stitch_mode,
                targetDurationSec: config.num_scenes * config.duration_per_scene,
              }),
            };

      const res = await publishFinalVideo(deps, {
        video,
        caption: video.caption ?? "",
        privacy: config.privacy_level,
        source,
      });
      await deps.db
        .from("automation_videos")
        .update({ status: "published", final_url: res?.mediaPath ?? urls[0], post_id: res?.postId ?? null })
        .eq("id", video.id);
      await logStep(deps, run, `stitch:${video.id}`, "done", { postId: res?.postId });
    } catch (e) {
      await deps.db
        .from("automation_videos")
        .update({ status: "failed", error: `stitch: ${(e as Error).message}`.slice(0, 500) })
        .eq("id", video.id);
      await logStep(deps, run, `stitch:${video.id}`, "failed");
    }
    await finalizeRunIfDone(deps, run.id);
  };
}
