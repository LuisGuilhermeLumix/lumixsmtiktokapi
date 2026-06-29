// Provider real: delega para o cliente kie.ai (@lsm/shared/kie). Mantém o KieError
// (os processors fazem catch nele) intacto — só centraliza a apiKey.

import { kieCreateTask, kieLLM, kieRecordInfo } from "@lsm/shared/kie";
import type { GenerationProvider, KieCreateInput, KieRecord } from "./types.js";

export class KieProvider implements GenerationProvider {
  readonly name = "kie";
  constructor(private readonly apiKey: string) {}

  createTask(body: KieCreateInput): Promise<string> {
    return kieCreateTask(this.apiKey, body);
  }
  recordInfo(taskId: string): Promise<KieRecord> {
    return kieRecordInfo(this.apiKey, taskId);
  }
  llm(model: string, prompt: string): Promise<string> {
    return kieLLM(this.apiKey, model, prompt);
  }
}
