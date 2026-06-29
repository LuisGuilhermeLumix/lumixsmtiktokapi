// Roda uma task no provider até concluir (createTask → poll recordInfo). Com o
// MockProvider conclui na 1ª iteração; com a kie real faz polling.

import type { GenerationProvider } from "../providers/index.js";
import type { KieCreateInput } from "@lsm/shared/kie";

export async function providerToCompletion(
  provider: GenerationProvider,
  body: KieCreateInput,
  opts: { tries?: number; intervalMs?: number } = {},
): Promise<string> {
  const tries = opts.tries ?? 60;
  const interval = opts.intervalMs ?? 2000;
  const taskId = await provider.createTask(body);
  for (let i = 0; i < tries; i++) {
    const rec = await provider.recordInfo(taskId);
    if (rec.status === "done") return rec.resultUrl ?? rec.resultText ?? "";
    if (rec.status === "failed") throw new Error(rec.error ?? "geração falhou");
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timeout aguardando task ${taskId}`);
}
