import { KieProvider } from "./kie.js";
import { MockProvider } from "./mock.js";
import type { GenerationProvider } from "./types.js";

/** Mock em testes (ou USE_MOCK_PROVIDER=1); senão kie (mídia) + OpenAI (agentes IA) */
export function createProvider(apiKey: string | undefined, openaiKey?: string): GenerationProvider {
  if (process.env.NODE_ENV === "test" || process.env.USE_MOCK_PROVIDER === "1") {
    return new MockProvider();
  }
  return new KieProvider(apiKey ?? "", openaiKey);
}

export { KieProvider, MockProvider };
export type { GenerationProvider } from "./types.js";
