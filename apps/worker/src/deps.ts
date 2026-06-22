import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createServiceClient, type Db } from "@lsm/db";
import {
  QUEUE_ANALYTICS,
  QUEUE_AUTOMATION,
  QUEUE_PUBLISH,
  QUEUE_STATUS,
  QUEUE_TOKEN_REFRESH,
  type AnalyticsJobData,
  type AutomationJobData,
  type PublishJobData,
  type StatusJobData,
  type TokenRefreshJobData,
} from "@lsm/shared";
import type { TikTokOAuthConfig } from "@lsm/tiktok";
import type { WorkerConfig } from "./config.js";

export interface WorkerDeps {
  config: WorkerConfig;
  tiktok: TikTokOAuthConfig;
  db: Db;
  redis: Redis;
  queues: {
    publish: Queue<PublishJobData>;
    status: Queue<StatusJobData>;
    analytics: Queue<AnalyticsJobData>;
    tokenRefresh: Queue<TokenRefreshJobData>;
    automation: Queue<AutomationJobData>;
  };
}

export function createDeps(config: WorkerConfig): WorkerDeps {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // exigido pelo BullMQ
  });

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
    db: createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    redis,
    queues: {
      publish: new Queue<PublishJobData>(QUEUE_PUBLISH, { connection: redis, defaultJobOptions }),
      status: new Queue<StatusJobData>(QUEUE_STATUS, { connection: redis, defaultJobOptions }),
      analytics: new Queue<AnalyticsJobData>(QUEUE_ANALYTICS, {
        connection: redis,
        defaultJobOptions,
      }),
      tokenRefresh: new Queue<TokenRefreshJobData>(QUEUE_TOKEN_REFRESH, {
        connection: redis,
        defaultJobOptions,
      }),
      automation: new Queue<AutomationJobData>(QUEUE_AUTOMATION, {
        connection: redis,
        defaultJobOptions,
      }),
    },
  };
}

export async function closeDeps(deps: WorkerDeps): Promise<void> {
  await Promise.allSettled([
    deps.queues.publish.close(),
    deps.queues.status.close(),
    deps.queues.analytics.close(),
    deps.queues.tokenRefresh.close(),
    deps.queues.automation.close(),
    deps.redis.quit(),
  ]);
}
