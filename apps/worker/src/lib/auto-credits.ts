// Créditos do motor: RESERVA no plan, SETTLE/REFUND no fim (princípio #6).
// Idempotência pelos campos credits_reserved/credits_settled do run.

import type { Tables } from "@lsm/db";
import type { WorkerDeps } from "../deps.js";

async function adjustBalance(deps: WorkerDeps, orgId: string, delta: number, reason: string) {
  const { data: org } = await deps.db
    .from("organizations")
    .select("credits_balance")
    .eq("id", orgId)
    .single();
  if (!org) return;
  const balanceAfter = org.credits_balance + delta;
  await deps.db.from("organizations").update({ credits_balance: balanceAfter }).eq("id", orgId);
  await deps.db
    .from("credit_ledger")
    .insert({ org_id: orgId, delta, reason, balance_after: balanceAfter });
}

/** reserva créditos do run (idempotente). Retorna false se saldo insuficiente. */
export async function reserveRunCredits(
  deps: WorkerDeps,
  run: Tables<"automation_runs">,
  amount: number,
): Promise<boolean> {
  if (run.credits_reserved > 0) return true; // já reservado
  if (amount <= 0) return true;
  const { data: org } = await deps.db
    .from("organizations")
    .select("credits_balance")
    .eq("id", run.org_id)
    .single();
  if (!org || org.credits_balance < amount) return false;
  await adjustBalance(deps, run.org_id, -amount, `automation_reserve:${run.id}`);
  await deps.db.from("automation_runs").update({ credits_reserved: amount }).eq("id", run.id);
  return true;
}

/** liquida o run: cobra o que foi efetivamente usado e estorna o restante. */
export async function settleRun(deps: WorkerDeps, runId: string): Promise<void> {
  const { data: run } = await deps.db
    .from("automation_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run || run.credits_settled > 0) return; // já liquidado

  const { data: vids } = await deps.db
    .from("automation_videos")
    .select("id")
    .eq("run_id", runId);
  const videoIds = (vids ?? []).map((v) => v.id);
  let used = 0;
  if (videoIds.length) {
    const { data: scenes } = await deps.db
      .from("automation_scenes")
      .select("credits_charged")
      .in("video_id", videoIds);
    used = (scenes ?? []).reduce((s, sc) => s + (sc.credits_charged ?? 0), 0);
  }

  const refund = run.credits_reserved - used;
  if (refund > 0) await adjustBalance(deps, run.org_id, refund, `automation_refund:${runId}`);
  await deps.db.from("automation_runs").update({ credits_settled: used }).eq("id", runId);
}
