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

  const { data: rows, error } = await deps.db
    .from("usage_quota")
    .select("*")
    .eq("org_id", orgId)
    .eq("period", period)
    .or(`client_id.eq.${clientId},client_id.is.null`);
  if (error) throw httpError(500, `Falha ao consultar quota: ${error.message}`);

  for (const row of rows ?? []) {
    if (row.uploads_limit !== null && row.uploads_used >= row.uploads_limit) {
      const scope = row.client_id ? "do cliente" : "da organização";
      throw httpError(429, `Quota de uploads ${scope} esgotada no período ${period}`);
    }
  }

  const clientRow = (rows ?? []).find((r) => r.client_id === clientId);
  if (clientRow) {
    await deps.db
      .from("usage_quota")
      .update({ uploads_used: clientRow.uploads_used + 1 })
      .eq("id", clientRow.id);
  } else {
    await deps.db.from("usage_quota").insert({
      org_id: orgId,
      client_id: clientId,
      period,
      uploads_used: 1,
    });
  }

  const orgRow = (rows ?? []).find((r) => r.client_id === null);
  if (orgRow) {
    await deps.db
      .from("usage_quota")
      .update({ uploads_used: orgRow.uploads_used + 1 })
      .eq("id", orgRow.id);
  }
}
