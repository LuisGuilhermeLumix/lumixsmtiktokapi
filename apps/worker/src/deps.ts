import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createServiceClient, type Db } from "@lsm/db";
import {
  QUEUE_ANALYTICS,
  QUEUE_AUTO_PLAN,
  QUEUE_AUTO_SCAN,
  QUEUE_AUTOMATION,
  QUEUE_GRAPH_EXEC,
  QUEUE_PUBLISH,
  QUEUE_SCENE_POLL,
  QUEUE_SCENE_VIDEO,
  QUEUE_SCRIPT_GEN,
  QUEUE_STATUS,
  QUEUE_TOKEN_REFRESH,
  QUEUE_VIDEO_STITCH,
  type AnalyticsJobData,
  type AutomationJobData,
  type AutoPlanJobData,
  type AutoScanJobData,
  type PublishJobData,
  type ScenePollJobData,
  type SceneVideoJobData,
  type ScriptGenJobData,
  type StatusJobData,
  type TokenRefreshJobData,
  type VideoStitchJobData,
} from "@lsm/shared";
import type { TikTokOAuthConfig } from "@lsm/tiktok";
import type { WorkerConfig } from "./config.js";
import { createProvider, type GenerationProvider } from "./providers/index.js";

export interface WorkerDeps {
  config: WorkerConfig;
  tiktok: TikTokOAuthConfig;
  db: Db;
  redis: Redis;
  provider: GenerationProvider;
  queues: {
    publish: Queue<PublishJobData>;
    status: Queue<StatusJobData>;
    analytics: Queue<AnalyticsJobData>;
    tokenRefresh: Queue<TokenRefreshJobData>;
    automation: Queue<AutomationJobData>;
    // motor de automações
    autoScan: Queue<AutoScanJobData>;
    autoPlan: Queue<AutoPlanJobData>;
    scriptGen: Queue<ScriptGenJobData>;
    sceneVideo: Queue<SceneVideoJobData>;
    scenePoll: Queue<ScenePollJobData>;
    videoStitch: Queue<VideoStitchJobData>;
    graphExec: Queue<AutoPlanJobData>;
  };
}

export function createDeps(config: WorkerConfig): WorkerDeps {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // exigido pelo BullMQ
  });

  const defaultJobOptions = {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 30_000 },
    // cleanup: por contagem E por idade (o que vier primeiro) — evita crescer Redis
    removeOnComplete: { count: 1000, age: 24 * 3600 },
    removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
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
    provider: createProvider(config.KIE_API_KEY),
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
      autoScan: new Queue<AutoScanJobData>(QUEUE_AUTO_SCAN, { connection: redis, defaultJobOptions }),
      autoPlan: new Queue<AutoPlanJobData>(QUEUE_AUTO_PLAN, { connection: redis, defaultJobOptions }),
      scriptGen: new Queue<ScriptGenJobData>(QUEUE_SCRIPT_GEN, { connection: redis, defaultJobOptions }),
      sceneVideo: new Queue<SceneVideoJobData>(QUEUE_SCENE_VIDEO, { connection: redis, defaultJobOptions }),
      scenePoll: new Queue<ScenePollJobData>(QUEUE_SCENE_POLL, { connection: redis, defaultJobOptions }),
      videoStitch: new Queue<VideoStitchJobData>(QUEUE_VIDEO_STITCH, {
        connection: redis,
        defaultJobOptions,
      }),
      graphExec: new Queue<AutoPlanJobData>(QUEUE_GRAPH_EXEC, { connection: redis, defaultJobOptions }),
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
    deps.queues.autoScan.close(),
    deps.queues.autoPlan.close(),
    deps.queues.scriptGen.close(),
    deps.queues.sceneVideo.close(),
    deps.queues.scenePoll.close(),
    deps.queues.videoStitch.close(),
    deps.queues.graphExec.close(),
    deps.redis.quit(),
  ]);
}
