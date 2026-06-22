// @lsm/worker — consumers BullMQ:
//   publish        → publica vídeos no TikTok (init → chunks → polling)
//   status         → polling de status até estado final
//   analytics      → cron 6h: snapshots + métricas por vídeo
//   token-refresh  → cron 1h: renova access tokens perto do expiry

import { Worker } from "bullmq";
import {
  QUEUE_ANALYTICS,
  QUEUE_AUTO_PLAN,
  QUEUE_AUTO_SCAN,
  QUEUE_AUTOMATION,
  QUEUE_PUBLISH,
  QUEUE_SCENE_POLL,
  QUEUE_SCENE_VIDEO,
  QUEUE_SCRIPT_GEN,
  QUEUE_STATUS,
  QUEUE_TOKEN_REFRESH,
  QUEUE_VIDEO_STITCH,
} from "@lsm/shared";
import { loadConfig } from "./config.js";
import { closeDeps, createDeps } from "./deps.js";
import { startHealthServer } from "./health.js";
import { createAnalyticsProcessor } from "./processors/analytics.js";
import { createAutomationProcessor } from "./processors/automation.js";
import { createAutoPlanProcessor } from "./processors/auto-plan.js";
import { createAutoScanProcessor } from "./processors/auto-scan.js";
import { createPublishProcessor } from "./processors/publish.js";
import { createScenePollProcessor } from "./processors/scene-poll.js";
import { createSceneVideoProcessor } from "./processors/scene-video.js";
import { createScriptGenProcessor } from "./processors/script-generate.js";
import { createStatusProcessor } from "./processors/status.js";
import { createTokenRefreshProcessor } from "./processors/token-refresh.js";
import { createVideoStitchProcessor } from "./processors/video-stitch.js";

async function main() {
  const config = loadConfig();
  const deps = createDeps(config);
  const connection = deps.redis;

  const workers = [
    // concurrency baixa: cada job carrega o vídeo inteiro em memória
    new Worker(QUEUE_PUBLISH, createPublishProcessor(deps), { connection, concurrency: 2 }),
    new Worker(QUEUE_STATUS, createStatusProcessor(deps), { connection, concurrency: 5 }),
    new Worker(QUEUE_ANALYTICS, createAnalyticsProcessor(deps), { connection, concurrency: 3 }),
    new Worker(QUEUE_TOKEN_REFRESH, createTokenRefreshProcessor(deps), {
      connection,
      concurrency: 3,
    }),
    // esteira de conteúdo IA (legado simples): tick + pipeline
    new Worker(QUEUE_AUTOMATION, createAutomationProcessor(deps), { connection, concurrency: 2 }),
    // motor de automações (jobs curtos e idempotentes)
    new Worker(QUEUE_AUTO_SCAN, createAutoScanProcessor(deps), { connection, concurrency: 1 }),
    new Worker(QUEUE_AUTO_PLAN, createAutoPlanProcessor(deps), { connection, concurrency: 3 }),
    // rate-limit global por provider (Redis): LLM e criação de tasks na kie
    new Worker(QUEUE_SCRIPT_GEN, createScriptGenProcessor(deps), {
      connection,
      concurrency: 4,
      limiter: { max: 10, duration: 10_000 },
    }),
    new Worker(QUEUE_SCENE_VIDEO, createSceneVideoProcessor(deps), {
      connection,
      concurrency: 6,
      limiter: { max: 18, duration: 10_000 },
    }),
    new Worker(QUEUE_SCENE_POLL, createScenePollProcessor(deps), { connection, concurrency: 8 }),
    // FFmpeg: worker dedicado, concorrência baixa (CPU + memória)
    new Worker(QUEUE_VIDEO_STITCH, createVideoStitchProcessor(deps), { connection, concurrency: 2 }),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(
        `[${worker.name}] job ${job?.id} falhou (tentativa ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`,
      );
    });
    worker.on("error", (err) => {
      console.error(`[${worker.name}] erro do worker: ${err.message}`);
    });
  }

  // jobs repetidos (idempotentes — upsert mantém um scheduler por id)
  await deps.queues.analytics.upsertJobScheduler(
    "analytics-cron",
    { pattern: "0 */6 * * *" }, // a cada 6h
    { name: "collect", data: {} },
  );
  await deps.queues.tokenRefresh.upsertJobScheduler(
    "token-refresh-cron",
    { pattern: "15 * * * *" }, // a cada hora (min 15, fora do pico do analytics)
    { name: "refresh", data: {} },
  );
  await deps.queues.automation.upsertJobScheduler(
    "automation-tick",
    { pattern: "* * * * *" }, // a cada minuto: varre automações e enfileira as devidas
    { name: "scan", data: {} },
  );
  await deps.queues.autoScan.upsertJobScheduler(
    "auto-scan-tick",
    { pattern: "* * * * *" }, // motor: varre workflows e dispara runs (lead-time)
    { name: "scan", data: {} },
  );

  const health = startHealthServer(config.HEALTH_PORT, async () => {
    const counts = await deps.queues.publish.getJobCounts("waiting", "active", "failed", "delayed");
    return { status: "ok", service: "lsm-worker", publish_queue: counts };
  });

  console.log(
    `[lsm-worker] rodando — filas: publish, status, analytics (6h), token-refresh (1h), automation (tick 1min); health na porta ${config.HEALTH_PORT}`,
  );

  let shuttingDown = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[lsm-worker] ${signal} — encerrando...`);
      void Promise.allSettled(workers.map((w) => w.close()))
        .then(() => closeDeps(deps))
        .then(() => {
          health.close();
          process.exit(0);
        });
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
