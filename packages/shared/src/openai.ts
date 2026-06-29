// Cliente da API da OpenAI (Chat Completions) — usado pelos AGENTES IA do motor
// (roteiro/legenda). Imagem/vídeo continuam na kie.ai.
//   POST https://api.openai.com/v1/chat/completions

const OPENAI_BASE = "https://api.openai.com/v1";

export class OpenAIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

/** roda um modelo de chat da OpenAI e devolve o texto da resposta */
export async function openaiLLM(
  apiKey: string,
  model: string,
  prompt: string,
  opts: { system?: string } = {},
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new OpenAIError(res.status, json.error?.message || `OpenAI falhou (HTTP ${res.status})`);
  }
  const text = json.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new OpenAIError(502, "OpenAI sem resposta");
  return text.trim();
}
