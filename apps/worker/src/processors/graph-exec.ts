// queue:graph-exec — executor de grafo "de verdade": percorre o compiled_plan
// nó a nó (engine.ts), passando os items, e loga CADA nó em automation_run_steps
// (o inspetor e a animação leem isso). Materializa os vídeos/cenas no fim.

import type { Job } from "bullmq";
import { executeGraph, type CompiledPlan, type ExecuteResult, type NodeRunContext } from "@lsm/shared/automation";
import type { AutoPlanJobData } from "@lsm/shared";
import type { Json } from "@lsm/db";
import type { WorkerDeps } from "../deps.js";
import { loadRunContext } from "../lib/auto-runtime.js";
import { buildRegistry, type EngineServices } from "../engine/executors.js";

async function persistResults(deps: WorkerDeps, run: { id: string; org_id: string }, result: ExecuteResult): Promise<void> {
  // pega o item mais COMPLETO por conta (nós posteriores sobrescrevem)
  const byKey = new Map<string, Record<string, unknown>>();
  for (const items of Object.values(result.itemsByNode)) {
    for (const it of items) {
      const acc = it.json.account_id;
      if (!acc) continue;
      byKey.set(`${acc}:${it.json.vindex ?? 0}`, it.json);
    }
  }
  let idx = 0;
  for (const json of byKey.values()) {
    const videoId = `${run.id}:gx:${idx}`;
    const beats = (json.beats as string[]) ?? [];
    const vids = (json.scene_videos as string[]) ?? [];
    const imgs = (json.scene_images as string[]) ?? [];
    await deps.db.from("automation_videos").insert({
      id: videoId,
      run_id: run.id,
      org_id: run.org_id,
      social_account_id: (json.account_id as string) ?? null,
      idx,
      status: json.published ? "published" : json.final_url ? "stitching" : "failed",
      caption: (json.caption as string) ?? null,
      final_url: (json.final_url as string) ?? null,
      num_scenes: beats.length || null,
    });
    for (let i = 0; i < Math.max(vids.length, imgs.length, beats.length); i++) {
      await deps.db.from("automation_scenes").insert({
        id: `${videoId}:scene:${i}`,
        video_id: videoId,
        org_id: run.org_id,
        idx: i,
        status: vids[i] ? "done" : "failed",
        beat: beats[i] ?? null,
        prompt: beats[i] ?? null,
        image_url: imgs[i] ?? null,
        video_url: vids[i] ?? null,
        provider: deps.provider.name,
      });
    }
    idx++;
  }
}

export function createGraphExecProcessor(deps: WorkerDeps) {
  return async (job: Job<AutoPlanJobData>): Promise<void> => {
    const ctx = await loadRunContext(deps, job.data.runId);
    if (!ctx || ctx.run.status !== "queued") return;
    const { run, workflow, config } = ctx;
    const plan = workflow.compiled_plan as unknown as CompiledPlan | null;
    if (!plan?.entry) {
      await deps.db.from("automation_runs").update({ status: "failed", error: "sem plano compilado" }).eq("id", run.id);
      return;
    }
    await deps.db.from("automation_runs").update({ status: "running" }).eq("id", run.id);

    const services: EngineServices = { deps, config, orgId: run.org_id, clientId: workflow.client_id };
    const runCtx: NodeRunContext = {
      config,
      services: services as unknown as Record<string, unknown>,
      log: async (nodeId, status, meta) => {
        await deps.db.from("automation_run_steps").insert({
          run_id: run.id,
          org_id: run.org_id,
          step: nodeId,
          status,
          meta: (meta ?? {}) as Json,
        });
      },
    };

    try {
      const result = await executeGraph(plan, buildRegistry(), runCtx);
      await persistResults(deps, run, result);
      await deps.db.from("automation_runs").update({ status: "done" }).eq("id", run.id);
    } catch (e) {
      await deps.db.from("automation_runs").update({ status: "failed", error: (e as Error).message.slice(0, 500) }).eq("id", run.id);
    }
  };
}
