// Cliente da Magic Hour (api.magichour.ai). Provider PRINCIPAL de vídeo.
//   POST /v1/text-to-video    → { id, credits_charged }
//   POST /v1/image-to-video   → { id, credits_charged }
//   GET  /v1/video-projects/{id} → { status, error, downloads:[{url}] }
// Status: draft|queued|rendering|complete|error|canceled. Doc: https://docs.magichour.ai

import type { GenerationStatus } from "./index.js";

const MH_BASE = "https://api.magichour.ai";

export interface MhRecord {
  status: GenerationStatus;
  resultUrl: string | null;
  error: string | null;
  raw: unknown;
}

export class MagicHourError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MagicHourError";
  }
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export interface MhVideoParams {
  /** modelo (ex.: kling-3.0); opcional — Magic Hour usa o default se ausente */
  model?: string;
  prompt: string;
  endSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  audio?: boolean;
  name?: string;
  /** se presente, usa image-to-video */
  imageUrl?: string;
}

/** cria um projeto de vídeo; retorna o id e os créditos cobrados pela Magic Hour */
export async function mhCreateVideo(
  key: string,
  params: MhVideoParams,
): Promise<{ id: string; creditsCharged: number }> {
  const isImg2Vid = !!params.imageUrl;
  const url = `${MH_BASE}/v1/${isImg2Vid ? "image-to-video" : "text-to-video"}`;
  const body: Record<string, unknown> = {
    end_seconds: params.endSeconds ?? 5,
    style: { prompt: params.prompt },
  };
  if (params.model) body.model = params.model;
  if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  if (params.resolution) body.resolution = params.resolution;
  if (params.audio !== undefined) body.audio = params.audio;
  if (params.name) body.name = params.name;
  if (params.imageUrl) body.image_url = params.imageUrl;

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    credits_charged?: number;
    message?: string;
    error?: string;
  };
  if (!res.ok || !json.id) {
    throw new MagicHourError(
      res.status,
      json.message || json.error || `magichour create falhou (HTTP ${res.status})`,
    );
  }
  return { id: json.id, creditsCharged: json.credits_charged ?? 0 };
}

/** consulta o status de um projeto de vídeo e normaliza p/ GenerationStatus */
export async function mhGetVideo(key: string, id: string): Promise<MhRecord> {
  const res = await fetch(`${MH_BASE}/v1/video-projects/${encodeURIComponent(id)}`, {
    headers: authHeaders(key),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    error?: { message?: string; code?: string } | string | null;
    downloads?: Array<{ url?: string }>;
  };
  if (!res.ok) throw new MagicHourError(res.status, `magichour get falhou (HTTP ${res.status})`);

  const st = String(json.status ?? "").toLowerCase();
  let status: GenerationStatus;
  if (st === "complete") status = "done";
  else if (st === "error" || st === "canceled") status = "failed";
  else if (st === "rendering") status = "processing";
  else status = "queued"; // draft | queued

  const resultUrl = status === "done" ? (json.downloads?.[0]?.url ?? null) : null;
  const error =
    status === "failed"
      ? typeof json.error === "string"
        ? json.error
        : (json.error?.message ?? "render falhou")
      : null;
  return { status, resultUrl, error, raw: json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** cria + polling até concluir (uso no worker, sem webhook) */
export async function mhRunToCompletion(
  key: string,
  params: MhVideoParams,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<MhRecord> {
  const interval = opts.intervalMs ?? 6000;
  const timeout = opts.timeoutMs ?? 15 * 60_000;
  const { id } = await mhCreateVideo(key, params);
  const deadline = Date.now() + timeout;
  await sleep(Math.min(interval, 4000));
  for (;;) {
    const rec = await mhGetVideo(key, id);
    if (rec.status === "done" || rec.status === "failed") return rec;
    if (Date.now() > deadline) throw new MagicHourError(408, `timeout magichour video ${id}`);
    await sleep(interval);
  }
}
