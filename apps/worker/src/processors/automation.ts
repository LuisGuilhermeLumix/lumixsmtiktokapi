// queue:automation — esteira de conteúdo IA.
//   job sem automationId  → varre automações e enfileira as devidas (tick 1min)
//   job com automationId  → roda a esteira daquela automação (sem retry)

import type { Job } from "bullmq";
import type { AutomationJobData } from "@lsm/shared";
import type { WorkerDeps } from "../deps.js";
import { runAutomation, scanDueAutomations } from "../lib/automation-pipeline.js";

export function createAutomationProcessor(deps: WorkerDeps) {
  return async (job: Job<AutomationJobData>): Promise<void> => {
    if (job.data.automationId) {
      await runAutomation(deps, job.data.automationId);
    } else {
      await scanDueAutomations(deps);
    }
  };
}
