// Provider falso (determinístico) p/ testes E2E — sem rede, sem créditos reais.
// createTask devolve um id sequencial; recordInfo devolve "done" com URL fake;
// llm devolve um roteiro com N linhas (o splitBeats quebra em cenas).

import type { GenerationProvider, KieCreateInput, KieRecord } from "./types.js";

export interface MockOptions {
  /** força status na consulta (default: "done") */
  recordStatus?: KieRecord["status"];
  /** texto retornado pelo LLM */
  llmText?: string;
}

export class MockProvider implements GenerationProvider {
  readonly name = "mock";
  private seq = 0;
  readonly created: KieCreateInput[] = [];

  constructor(private readonly opts: MockOptions = {}) {}

  createTask(body: KieCreateInput): Promise<string> {
    this.created.push(body);
    this.seq += 1;
    return Promise.resolve(`mock-task-${this.seq}`);
  }

  recordInfo(taskId: string): Promise<KieRecord> {
    const status = this.opts.recordStatus ?? "done";
    return Promise.resolve({
      status,
      resultUrl: status === "done" ? `https://mock.local/${taskId}.mp4` : null,
      resultText: null,
      error: status === "failed" ? "mock failure" : null,
      raw: { mock: true, taskId },
    });
  }

  llm(_model: string, _prompt: string): Promise<string> {
    return Promise.resolve(
      this.opts.llmText ??
        "Cena um descritiva e visual.\nCena dois descritiva e visual.\nLegenda final do vídeo #fy #viral",
    );
  }
}
