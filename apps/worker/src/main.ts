// @lsm/worker — consumers BullMQ:
//   publish        → publica vídeos no TikTok (init → chunks → polling)
//   status         → polling de status até estado final
//   analytics      → cron 6h: snapshots + métricas por vídeo
//   token-refresh  → cron 1h: renova access tokens perto do expiry

import { Worker } from "bullmq";
import {
  QUEUE_ANALYTICS,
  QUEUE_PUBLISH,
  QUEUE_STATUS,
  QUEUE_TOKEN_REFRESH,
} from "@lsm/shared";
import { loadConfig } from "./config.js";
import { closeDeps, createDeps } from "./deps.js";
import { startHealthServer } from "./health.js";
import { createAnalyticsProcessor } from "./processors/analytics.js";
import { createPublishProcessor } from "./processors/publish.js";
import { createStatusProcessor } from "./processors/status.js";
import { createTokenRefreshProcessor } from "./processors/token-refresh.js";

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

  const health = startHealthServer(config.HEALTH_PORT, async () => {
    const counts = await deps.queues.publish.getJobCounts("waiting", "active", "failed", "delayed");
    return { status: "ok", service: "lsm-worker", publish_queue: counts };
  });

  console.log(
    `[lsm-worker] rodando — filas: publish, status, analytics (6h), token-refresh (1h); health na porta ${config.HEALTH_PORT}`,
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
