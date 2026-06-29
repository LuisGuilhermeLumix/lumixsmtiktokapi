import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createServiceClient, type Db } from "@lsm/db";
import {
  QUEUE_AUTO_PLAN,
  QUEUE_AUTO_SCAN,
  QUEUE_GRAPH_EXEC,
  QUEUE_PUBLISH,
  QUEUE_SCENE_POLL,
  QUEUE_STATUS,
  type AutoPlanJobData,
  type AutoScanJobData,
  type PublishJobData,
  type ScenePollJobData,
  type StatusJobData,
} from "@lsm/shared";
import type { TikTokOAuthConfig } from "@lsm/tiktok";
import type { ApiConfig } from "./config.js";

export interface ApiDeps {
  config: ApiConfig;
  tiktok: TikTokOAuthConfig;
  db: Db;
  redis: Redis;
  queues: {
    publish: Queue<PublishJobData>;
    status: Queue<StatusJobData>;
    autoScan: Queue<AutoScanJobData>;
    autoPlan: Queue<AutoPlanJobData>;
    scenePoll: Queue<ScenePollJobData>;
    graphExec: Queue<AutoPlanJobData>;
  };
}

export function createDeps(config: ApiConfig): ApiDeps {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // exigido pelo BullMQ
    lazyConnect: true,
  });

  const db = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

  const defaultJobOptions = {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 30_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };

  return {
    config,
    tiktok: {
      clientKey: config.TIKTOK_CLIENT_KEY,
      clientSecret: config.TIKTOK_CLIENT_SECRET,
      redirectUri: config.TIKTOK_REDIRECT_URI,
    },
    db,
    redis,
    queues: {
      publish: new Queue<PublishJobData>(QUEUE_PUBLISH, {
        connection: redis,
        defaultJobOptions,
      }),
      status: new Queue<StatusJobData>(QUEUE_STATUS, {
        connection: redis,
        defaultJobOptions,
      }),
      autoScan: new Queue<AutoScanJobData>(QUEUE_AUTO_SCAN, { connection: redis, defaultJobOptions }),
      autoPlan: new Queue<AutoPlanJobData>(QUEUE_AUTO_PLAN, { connection: redis, defaultJobOptions }),
      scenePoll: new Queue<ScenePollJobData>(QUEUE_SCENE_POLL, { connection: redis, defaultJobOptions }),
      graphExec: new Queue<AutoPlanJobData>(QUEUE_GRAPH_EXEC, { connection: redis, defaultJobOptions }),
    },
  };
}

export async function closeDeps(deps: ApiDeps): Promise<void> {
  await Promise.allSettled([
    deps.queues.publish.close(),
    deps.queues.status.close(),
    deps.queues.autoScan.close(),
    deps.queues.autoPlan.close(),
    deps.queues.scenePoll.close(),
    deps.queues.graphExec.close(),
    deps.redis.quit(),
  ]);
}
