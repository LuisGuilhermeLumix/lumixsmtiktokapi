// Helpers compartilhados pelos processors do motor de automações.

import type { Json, Tables } from "@lsm/db";
import { readRunConfig, type AutomationRunConfig } from "@lsm/shared/automation";
import { parseNichePack, selectHook, sanitizeText, type NichePackData } from "@lsm/shared/niche";
import {
  automationSceneId,
  automationVideoId,
  toBullJobId,
  type VideoStitchJobData,
} from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { settleRun } from "./auto-credits.js";
import { decrInflight } from "./auto-limits.js";

/** registra uma etapa na observabilidade (automation_run_steps) */
export async function logStep(
  deps: WorkerDeps,
  run: Pick<Tables<"automation_runs">, "id" | "org_id">,
  step: string,
  status: "started" | "done" | "failed",
  meta: Record<string, unknown> = {},
): Promise<void> {
  await deps.db.from("automation_run_steps").insert({
    run_id: run.id,
    org_id: run.org_id,
    step,
    status,
    meta: meta as unknown as Json,
  });
}

export interface RunContext {
  run: Tables<"automation_runs">;
  workflow: Tables<"automation_workflows">;
  config: AutomationRunConfig;
  pack: NichePackData | null;
  character: Tables<"characters"> | null;
}

/** carrega run + workflow + config + niche pack + personagem */
export async function loadRunContext(
  deps: WorkerDeps,
  runId: string,
): Promise<RunContext | null> {
  const { data: run } = await deps.db
    .from("automation_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;
  const { data: workflow } = await deps.db
    .from("automation_workflows")
    .select("*")
    .eq("id", run.workflow_id)
    .maybeSingle();
  if (!workflow) return null;

  const config = readRunConfig(workflow.compiled_plan);

  let pack: NichePackData | null = null;
  if (config.niche_pack_id) {
    const { data: p } = await deps.db
      .from("niche_packs")
      .select("data")
      .eq("id", config.niche_pack_id)
      .maybeSingle();
    if (p) pack = parseNichePack(p.data);
  }
  let character: Tables<"characters"> | null = null;
  if (config.character_id) {
    const { data: c } = await deps.db
      .from("characters")
      .select("*")
      .eq("id", config.character_id)
      .maybeSingle();
    character = c ?? null;
  }
  return { run, workflow, config, pack, character };
}

export { automationVideoId, automationSceneId, selectHook, sanitizeText };

/** se todas as cenas do vídeo terminaram (done/failed), enfileira o stitch */
export async function maybeEnqueueStitch(deps: WorkerDeps, videoId: string): Promise<void> {
  const { data: scenes } = await deps.db
    .from("automation_scenes")
    .select("status")
    .eq("video_id", videoId);
  const list = scenes ?? [];
  if (list.length === 0) return;
  const pending = list.some((s) => s.status !== "done" && s.status !== "failed");
  if (pending) return;
  // todas terminaram → stitch (idempotente pelo jobId)
  await deps.db.from("automation_videos").update({ status: "stitching" }).eq("id", videoId);
  const data: VideoStitchJobData = { videoId };
  await deps.queues.videoStitch.add("stitch", data, {
    jobId: toBullJobId(`stitch:${videoId}`),
  });
}

/** finaliza o run se todos os vídeos terminaram (published/failed) → settle.
 *  Idempotente: sai cedo se o run já estiver em estado terminal. */
export async function finalizeRunIfDone(deps: WorkerDeps, runId: string): Promise<void> {
  const { data: run } = await deps.db
    .from("automation_runs")
    .select("status, org_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return;
  if (run.status === "done" || run.status === "failed" || run.status === "partial") return;

  const { data: vids } = await deps.db
    .from("automation_videos")
    .select("status")
    .eq("run_id", runId);
  const list = vids ?? [];
  if (list.length === 0) return;
  const pending = list.some((v) => v.status !== "published" && v.status !== "failed");
  if (pending) return;

  const anyOk = list.some((v) => v.status === "published");
  await settleRun(deps, runId);
  await decrInflight(deps, run.org_id, list.length); // libera a capacidade da org
  await deps.db
    .from("automation_runs")
    .update({ status: anyOk ? (list.every((v) => v.status === "published") ? "done" : "partial") : "failed" })
    .eq("id", runId);
}
