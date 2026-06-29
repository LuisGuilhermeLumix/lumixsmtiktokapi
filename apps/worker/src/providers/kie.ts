// Provider de produção (híbrido): IMAGEM/VÍDEO na kie.ai; AGENTES IA (llm:
// roteiro/legenda) na OpenAI (chave própria do usuário). Se não houver chave
// OpenAI, o llm cai de volta na kie (não quebra).

import { kieCreateTask, kieLLM, kieRecordInfo } from "@lsm/shared/kie";
import { openaiLLM } from "@lsm/shared/openai";
import type { GenerationProvider, KieCreateInput, KieRecord } from "./types.js";

export class KieProvider implements GenerationProvider {
  readonly name = "kie";
  constructor(
    private readonly apiKey: string,
    private readonly openaiKey?: string,
  ) {}

  createTask(body: KieCreateInput): Promise<string> {
    return kieCreateTask(this.apiKey, body);
  }
  recordInfo(taskId: string): Promise<KieRecord> {
    return kieRecordInfo(this.apiKey, taskId);
  }
  llm(model: string, prompt: string): Promise<string> {
    // agentes IA → OpenAI (chave própria); fallback p/ kie se não configurada
    if (this.openaiKey) return openaiLLM(this.openaiKey, model, prompt);
    return kieLLM(this.apiKey, model, prompt);
  }
}
