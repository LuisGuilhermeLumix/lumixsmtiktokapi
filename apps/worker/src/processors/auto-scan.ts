// queue:auto-scan — tick de 1min. Job sem workflowId varre os workflows ativos
// e, p/ cada slot cujo horário de DISPARO (post_time − lead_time) bate agora,
// cria um run determinístico (idempotente) e enfileira o auto-plan.

import type { Job } from "bullmq";
import {
  automationRunId,
  toBullJobId,
  type AutoPlanJobData,
  type AutoScanJobData,
} from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";

function nowInTz(tz: string): { hhmm: string; date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const h = get("hour");
  const m = get("minute");
  return {
    hhmm: `${h}:${m}`,
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(h) * 60 + Number(m),
  };
}

function slotMinutes(slot: string): number {
  const [h, m] = slot.split(":");
  return Number(h) * 60 + Number(m);
}

export function createAutoScanProcessor(deps: WorkerDeps) {
  return async (job: Job<AutoScanJobData>): Promise<void> => {
    const filter = deps.db
      .from("automation_workflows")
      .select("id, org_id, timezone, post_times, lead_time_min")
      .eq("status", "active");
    if (job.data.workflowId) filter.eq("id", job.data.workflowId);
    const { data: workflows } = await filter;

    for (const wf of workflows ?? []) {
      const tz = wf.timezone || deps.config.AUTOMATION_TZ;
      const { date, minutes: nowMin } = nowInTz(tz);
      for (const slot of wf.post_times ?? []) {
        // minuto de disparo = (slot − lead_time), com wrap no dia
        const trigger = ((slotMinutes(slot) - (wf.lead_time_min ?? 0)) % 1440 + 1440) % 1440;
        if (trigger !== nowMin) continue;

        const runId = automationRunId(wf.id, date, slot);
        // cria o run (idempotente — PK determinístico)
        const { error } = await deps.db.from("automation_runs").insert({
          id: runId,
          org_id: wf.org_id,
          workflow_id: wf.id,
          run_date: date,
          slot,
          status: "queued",
        });
        // 23505 = unique_violation → run já existe, ignora
        if (error && error.code !== "23505") continue;

        const data: AutoPlanJobData = { runId };
        await deps.queues.autoPlan.add("plan", data, { jobId: toBullJobId(runId), attempts: 1 });
      }
    }
  };
}
