import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createServiceClient, type Db } from "@lsm/db";
import {
  QUEUE_PUBLISH,
  QUEUE_STATUS,
  type PublishJobData,
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
    },
  };
}

export async function closeDeps(deps: ApiDeps): Promise<void> {
  await Promise.allSettled([
    deps.queues.publish.close(),
    deps.queues.status.close(),
    deps.redis.quit(),
  ]);
}
