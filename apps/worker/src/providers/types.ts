// Abstração do provider de geração (imagem/vídeo/LLM). Permite trocar a kie por
// outro provider e, principalmente, injetar um MockProvider nos testes E2E.

import type { KieCreateInput, KieRecord } from "@lsm/shared/kie";

export interface GenerationProvider {
  readonly name: string;
  /** cria uma task de geração (imagem/vídeo) → taskId */
  createTask(body: KieCreateInput): Promise<string>;
  /** consulta status/resultado de uma task */
  recordInfo(taskId: string): Promise<KieRecord>;
  /** roda um modelo LLM e devolve o texto */
  llm(model: string, prompt: string): Promise<string>;
}

export type { KieCreateInput, KieRecord };
