// Créditos do motor: RESERVA no plan, SETTLE/REFUND no fim (princípio #6).
// Operações ATÔMICAS via RPC (charge_credits/refund_credits) — sem race de
// read-modify-write. Idempotência pelos campos credits_reserved/credits_settled.

import type { WorkerDeps } from "../deps.js";

/** reserva créditos do run (idempotente). Retorna false se saldo insuficiente. */
export async function reserveRunCredits(
  deps: WorkerDeps,
  run: { id: string; org_id: string; credits_reserved: number },
  amount: number,
): Promise<boolean> {
  if (run.credits_reserved > 0) return true; // já reservado
  if (amount <= 0) return true;
  const { data, error } = await deps.db.rpc("charge_credits", {
    p_org: run.org_id,
    p_amount: amount,
    p_reason: `automation_reserve:${run.id}`,
  });
  if (error || (typeof data === "number" && data < 0)) return false; // saldo insuficiente
  await deps.db.from("automation_runs").update({ credits_reserved: amount }).eq("id", run.id);
  return true;
}

/** liquida o run: cobra o que foi usado e estorna o restante (atômico). */
export async function settleRun(deps: WorkerDeps, runId: string): Promise<void> {
  const { data: run } = await deps.db
    .from("automation_runs")
    .select("org_id, credits_reserved, credits_settled")
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
  if (refund > 0) {
    await deps.db.rpc("refund_credits", {
      p_org: run.org_id,
      p_amount: refund,
      p_reason: `automation_refund:${runId}`,
    });
  }
  await deps.db.from("automation_runs").update({ credits_settled: used }).eq("id", runId);
}
