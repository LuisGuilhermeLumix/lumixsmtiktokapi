// Cliente da fal.ai (fila assíncrona). Segundo provider do Estúdio de Conteúdo,
// focado em vídeo. Diferente da kie: submit → status_url/response_url próprios.
//   POST https://queue.fal.run/{model-id}     → { request_id, status_url, response_url }
//   GET  {status_url}                          → { status: IN_QUEUE|IN_PROGRESS|COMPLETED }
//   GET  {response_url}                         → { video: { url } } | { images: [{ url }] }
// Doc: https://fal.ai/docs/model-apis/model-endpoints/queue

import type { GenerationStatus } from "./index.js";

const FAL_QUEUE = "https://queue.fal.run";

export interface FalSubmitResult {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
}

export interface FalRecord {
  status: GenerationStatus;
  resultUrl: string | null;
  error: string | null;
  raw: unknown;
}

export class FalError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FalError";
  }
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** envia a request para a fila da fal.ai */
export async function falSubmit(
  key: string,
  modelId: string,
  input: Record<string, unknown>,
  webhookUrl?: string,
): Promise<FalSubmitResult> {
  const url =
    `${FAL_QUEUE}/${modelId}` +
    (webhookUrl ? `?fal_webhook=${encodeURIComponent(webhookUrl)}` : "");
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: unknown;
  };
  if (!res.ok || !json.request_id) {
    const msg =
      typeof json.detail === "string" ? json.detail : `fal submit falhou (HTTP ${res.status})`;
    throw new FalError(res.status, msg);
  }
  return {
    requestId: json.request_id,
    statusUrl: json.status_url ?? `${FAL_QUEUE}/${modelId}/requests/${json.request_id}/status`,
    responseUrl: json.response_url ?? `${FAL_QUEUE}/${modelId}/requests/${json.request_id}`,
  };
}

function pickFalUrl(out: Record<string, unknown>): string | null {
  const video = out.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  const images = out.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && images[0]?.url) return images[0].url;
  const image = out.image as { url?: string } | undefined;
  if (image?.url) return image.url;
  if (typeof out.url === "string") return out.url;
  const videos = out.videos as Array<{ url?: string }> | undefined;
  if (Array.isArray(videos) && videos[0]?.url) return videos[0].url;
  return null;
}

/** consulta status e, se concluído, busca o resultado; normaliza p/ GenerationStatus */
export async function falPoll(
  key: string,
  statusUrl: string,
  responseUrl: string,
): Promise<FalRecord> {
  const sres = await fetch(statusUrl, { headers: authHeaders(key) });
  const sjson = (await sres.json().catch(() => ({}))) as {
    status?: string;
    error?: string;
    error_type?: string;
  };
  if (!sres.ok) throw new FalError(sres.status, `fal status falhou (HTTP ${sres.status})`);

  const st = String(sjson.status ?? "").toUpperCase();
  if (st === "IN_QUEUE") return { status: "queued", resultUrl: null, error: null, raw: sjson };
  if (st === "IN_PROGRESS")
    return { status: "processing", resultUrl: null, error: null, raw: sjson };
  if (st !== "COMPLETED")
    return { status: "processing", resultUrl: null, error: null, raw: sjson };

  // COMPLETED → busca o resultado
  const rres = await fetch(responseUrl, { headers: authHeaders(key) });
  const out = (await rres.json().catch(() => ({}))) as Record<string, unknown>;
  const resultUrl = pickFalUrl(out);
  if (!rres.ok || (!resultUrl && out.error)) {
    return {
      status: "failed",
      resultUrl: null,
      error: String(out.error ?? sjson.error ?? `fal result HTTP ${rres.status}`),
      raw: out,
    };
  }
  if (!resultUrl) {
    return { status: "failed", resultUrl: null, error: "fal: resultado sem URL", raw: out };
  }
  return { status: "done", resultUrl, error: null, raw: out };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** submit + polling até concluir (uso no worker, sem webhook) */
export async function falRunToCompletion(
  key: string,
  modelId: string,
  input: Record<string, unknown>,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<FalRecord> {
  const interval = opts.intervalMs ?? 5000;
  const timeout = opts.timeoutMs ?? 15 * 60_000;
  const sub = await falSubmit(key, modelId, input);
  const deadline = Date.now() + timeout;
  await sleep(Math.min(interval, 3000));
  for (;;) {
    const rec = await falPoll(key, sub.statusUrl, sub.responseUrl);
    if (rec.status === "done" || rec.status === "failed") return rec;
    if (Date.now() > deadline) throw new FalError(408, `timeout fal request ${sub.requestId}`);
    await sleep(interval);
  }
}
