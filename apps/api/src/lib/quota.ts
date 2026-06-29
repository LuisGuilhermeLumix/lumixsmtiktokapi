// Quota de uploads por org/cliente (tabela usage_quota, período YYYY-MM).
// Linhas com uploads_limit null = sem limite (apenas contagem de uso).

import type { ApiDeps } from "../deps.js";
import { httpError } from "./errors.js";

const currentPeriod = () => new Date().toISOString().slice(0, 7);

export async function checkAndConsumeUpload(
  deps: ApiDeps,
  orgId: string,
  clientId: string,
): Promise<void> {
  const period = currentPeriod();
  // RPC atômica (lock + check + incr) — sem race de read-modify-write
  const { data, error } = await deps.db.rpc("consume_upload_quota", {
    p_org: orgId,
    p_client: clientId,
    p_period: period,
  });
  if (error) throw httpError(500, `Falha ao consultar quota: ${error.message}`);
  if (data === false) {
    throw httpError(429, `Quota de uploads esgotada no período ${period}`);
  }
}
