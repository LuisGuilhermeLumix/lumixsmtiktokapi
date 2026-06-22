// queue:auto-plan — pré-check + RESERVA de crédito + cria os videos do run e
// faz fan-out p/ script-generate. Job sem retry (attempts:1) → sem reserva dupla.

import type { Job } from "bullmq";
import { creditsForModel } from "@lsm/shared/kie";
import {
  automationVideoId,
  toBullJobId,
  type AutoPlanJobData,
  type ScriptGenJobData,
} from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { reserveRunCredits } from "../lib/auto-credits.js";
import { getInflight, incrInflight } from "../lib/auto-limits.js";
import { loadRunContext, logStep } from "../lib/auto-runtime.js";

async function resolveAccounts(deps: WorkerDeps, ctx: Awaited<ReturnType<typeof loadRunContext>>) {
  const config = ctx!.config;
  if (config.account_ids.length) return config.account_ids;
  const wf = ctx!.workflow;
  let clientIds: string[] = [];
  if (wf.client_id) clientIds = [wf.client_id];
  else {
    const { data: clients } = await deps.db.from("clients").select("id").eq("org_id", wf.org_id);
    clientIds = (clients ?? []).map((c) => c.id);
  }
  if (!clientIds.length) return [];
  const { data: accts } = await deps.db
    .from("social_accounts")
    .select("id")
    .in("client_id", clientIds)
    .eq("status", "connected");
  return (accts ?? []).map((a) => a.id);
}

export function createAutoPlanProcessor(deps: WorkerDeps) {
  return async (job: Job<AutoPlanJobData>): Promise<void> => {
    const ctx = await loadRunContext(deps, job.data.runId);
    if (!ctx || ctx.run.status !== "queued") return;
    const { run, config } = ctx;
    await deps.db.from("automation_runs").update({ status: "planning" }).eq("id", run.id);
    await logStep(deps, run, "plan", "started");

    const accounts = await resolveAccounts(deps, ctx);
    if (accounts.length === 0) {
      await deps.db.from("automation_runs").update({ status: "skipped", error: "sem contas" }).eq("id", run.id);
      await logStep(deps, run, "plan", "failed", { reason: "no_accounts" });
      return;
    }

    // fairness: limita os vídeos deste run à capacidade da org (sem cap silencioso)
    const desired = accounts.length * config.videos_per_account;
    const inflight = await getInflight(deps, run.org_id);
    const capacity = Math.max(0, deps.config.MAX_INFLIGHT_PER_ORG - inflight);
    const toCreate = Math.min(desired, capacity);
    if (toCreate === 0) {
      await deps.db.from("automation_runs").update({ status: "skipped", error: "org no limite de fairness" }).eq("id", run.id);
      await logStep(deps, run, "plan", "failed", { reason: "fairness_full", inflight });
      return;
    }

    // custo por cena (compilado ou calculado no servidor)
    const perScene =
      config.credits_per_scene > 0
        ? config.credits_per_scene
        : creditsForModel(config.video_model, config.duration_per_scene, deps.config.CREDIT_MARKUP);
    const total = toCreate * config.num_scenes * perScene;

    const ok = await reserveRunCredits(deps, run, total);
    if (!ok) {
      await deps.db.from("automation_runs").update({ status: "skipped", error: "créditos insuficientes" }).eq("id", run.id);
      await logStep(deps, run, "plan", "failed", { reason: "insufficient_credits", total });
      return;
    }

    // cria até `toCreate` vídeos e dispara o roteiro
    let created = 0;
    outer: for (const accountId of accounts) {
      for (let k = 0; k < config.videos_per_account; k++) {
        if (created >= toCreate) break outer;
        const videoId = automationVideoId(run.id, accountId, k);
        const { error } = await deps.db.from("automation_videos").insert({
          id: videoId,
          run_id: run.id,
          org_id: run.org_id,
          social_account_id: accountId,
          idx: k,
          status: "queued",
          num_scenes: config.num_scenes,
        });
        if (error && error.code !== "23505") continue;
        if (!error) await incrInflight(deps, run.org_id); // só conta inserts novos
        created++;
        const data: ScriptGenJobData = { videoId };
        await deps.queues.scriptGen.add("script", data, { jobId: toBullJobId(`script:${videoId}`) });
      }
    }

    await deps.db.from("automation_runs").update({ status: "running" }).eq("id", run.id);
    await logStep(deps, run, "plan", "done", {
      videos: created,
      reserved: total,
      capped: desired - toCreate, // 0 = nada cortado
    });
  };
}
