import { TIKTOK_API_BASE } from "./constants.js";
import { TikTokApiError, isTikTokError } from "./errors.js";

export interface BackoffOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry com backoff exponencial + jitter para erros retryable
 * (rate limit / rede). Retries pesados ficam a cargo do BullMQ;
 * aqui cobrimos só falhas transientes curtas.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 500, maxDelayMs = 10_000 }: BackoffOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = isTikTokError(err) && err.retryable;
      if (!retryable || attempt >= retries) throw err;
      const delay =
        Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + Math.random() * 0.5);
      await sleep(delay);
    }
  }
}

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string; log_id?: string };
}

export interface TikTokRequestInit {
  method?: "GET" | "POST";
  accessToken?: string;
  json?: unknown;
}

/**
 * Chamada aos endpoints /v2 do TikTok (envelope { data, error }).
 * Lança TikTokApiError tipado quando error.code !== "ok".
 */
export async function tiktokRequest<T>(
  path: string,
  { method = "POST", accessToken, json }: TikTokRequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (json !== undefined) headers["Content-Type"] = "application/json; charset=UTF-8";

  let res: Response;
  try {
    res = await fetch(`${TIKTOK_API_BASE}${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch (err) {
    throw new TikTokApiError({
      kind: "network",
      code: "network_error",
      message: `Falha de rede ao chamar ${path}: ${String(err)}`,
    });
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (body?.error && body.error.code !== "ok") {
    throw new TikTokApiError({
      code: body.error.code,
      message: body.error.message,
      httpStatus: res.status,
      logId: body.error.log_id,
    });
  }
  if (!res.ok) {
    throw new TikTokApiError({
      code: `http_${res.status}`,
      message: `HTTP ${res.status} em ${path}`,
      httpStatus: res.status,
    });
  }
  if (!body || body.data === undefined) {
    throw new TikTokApiError({
      kind: "unknown",
      code: "empty_response",
      message: `Resposta sem data em ${path}`,
      httpStatus: res.status,
    });
  }
  return body.data;
}
