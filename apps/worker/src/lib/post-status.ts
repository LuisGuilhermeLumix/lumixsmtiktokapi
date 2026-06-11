// Recalcula o status agregado do post a partir dos alvos.
// Regra: ativo (queued/publishing) > publicado (qualquer alvo publicado
// conta como sucesso, mesmo parcial) > falhou (todos falharam).

import type { WorkerDeps } from "../deps.js";

export async function recomputePostStatus(deps: WorkerDeps, postId: string): Promise<void> {
  const { data: targets } = await deps.db
    .from("post_targets")
    .select("status")
    .eq("post_id", postId);
  if (!targets || targets.length === 0) return;

  const statuses = targets.map((t) => t.status);
  let next: "publishing" | "published" | "failed" | undefined;

  if (statuses.some((s) => s === "queued" || s === "publishing")) {
    next = "publishing";
  } else if (statuses.some((s) => s === "published")) {
    next = "published"; // sucesso parcial conta como publicado (detalhe fica nos alvos)
  } else if (statuses.every((s) => s === "failed")) {
    next = "failed";
  }
  // só pending → post continua draft/scheduled, não mexe

  if (next) {
    await deps.db.from("posts").update({ status: next }).eq("id", postId);
  }
}

/** enfileira (re)checagem de status com jobId único por tentativa */
export async function enqueueStatusCheck(
  deps: WorkerDeps,
  postTargetId: string,
  publishId: string,
  attempt: number,
  delayMs: number,
): Promise<void> {
  await deps.queues.status.add(
    "check",
    { postTargetId, publishId, attempt },
    { delay: delayMs, jobId: `status:${postTargetId}:${attempt}` },
  );
}
