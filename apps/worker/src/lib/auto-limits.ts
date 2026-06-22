// Fairness por org: contador de vídeos "in-flight" no Redis. Garante que um
// cliente grande não monopolize as filas (princípio de fairness, Fase 5).
// Rate-limit por provider é feito via `limiter` dos Workers (ver main.ts).

import type { WorkerDeps } from "../deps.js";

const key = (orgId: string) => `inflight:${orgId}`;

export async function getInflight(deps: WorkerDeps, orgId: string): Promise<number> {
  const v = await deps.redis.get(key(orgId));
  return v ? Math.max(0, Number(v)) : 0;
}

export async function incrInflight(deps: WorkerDeps, orgId: string, n = 1): Promise<void> {
  await deps.redis.incrby(key(orgId), n);
  await deps.redis.expire(key(orgId), 6 * 60 * 60); // TTL de segurança (anti-leak)
}

export async function decrInflight(deps: WorkerDeps, orgId: string, n = 1): Promise<void> {
  const v = await deps.redis.decrby(key(orgId), n);
  if (v < 0) await deps.redis.set(key(orgId), "0");
}
