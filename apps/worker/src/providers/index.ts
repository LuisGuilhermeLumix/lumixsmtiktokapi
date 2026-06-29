import { KieProvider } from "./kie.js";
import { MockProvider } from "./mock.js";
import type { GenerationProvider } from "./types.js";

/** escolhe o provider: Mock em testes (ou USE_MOCK_PROVIDER=1), kie caso contrário */
export function createProvider(apiKey: string | undefined): GenerationProvider {
  if (process.env.NODE_ENV === "test" || process.env.USE_MOCK_PROVIDER === "1") {
    return new MockProvider();
  }
  return new KieProvider(apiKey ?? "");
}

export { KieProvider, MockProvider };
export type { GenerationProvider } from "./types.js";
