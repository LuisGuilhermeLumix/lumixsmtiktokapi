// Cliente da API unificada da kie.ai (geração assíncrona de imagem/vídeo + LLM).
// Compartilhado entre API (apps/api) e worker (apps/worker).
//   POST /jobs/createTask  → { taskId }
//   GET  /jobs/recordInfo  → estado + resultado
// Doc: https://docs.kie.ai

import type { GenerationStatus } from "./index.js";

const KIE_BASE = "https://api.kie.ai/api/v1";

export interface KieCreateInput {
  model: string;
  input: Record<string, unknown>;
  callBackUrl?: string;
}

export interface KieRecord {
  status: GenerationStatus;
  resultUrl: string | null;
  /** texto do resultado (modelos LLM) */
  resultText: string | null;
  error: string | null;
  raw: unknown;
}

export class KieError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KieError";
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

/** modelos Veo usam o endpoint DEDICADO /veo/generate (não o jobs/createTask) */
const VEO_MODEL = /^veo3/i;

/** cria a task de geração; retorna o taskId (prefixado "veo:" quando for Veo) */
export async function kieCreateTask(apiKey: string, body: KieCreateInput): Promise<string> {
  // ── Veo: endpoint próprio ──
  if (VEO_MODEL.test(body.model)) {
    const input = body.input as { prompt?: string; aspect_ratio?: string; imageUrls?: string[] };
    const hasRef = Array.isArray(input.imageUrls) && input.imageUrls.length > 0;
    const veoBody: Record<string, unknown> = {
      model: body.model,
      prompt: input.prompt ?? "",
      aspect_ratio: input.aspect_ratio ?? "9:16",
      ...(hasRef ? { imageUrls: input.imageUrls, generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO" } : {}),
      ...(body.callBackUrl ? { callBackUrl: body.callBackUrl } : {}),
    };
    const res = await fetch(`${KIE_BASE}/veo/generate`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(veoBody),
    });
    const json = (await res.json().catch(() => ({}))) as { msg?: string; message?: string; data?: { taskId?: string } };
    const taskId = json.data?.taskId;
    if (!res.ok || !taskId) {
      throw new KieError(res.status, json.msg || json.message || `veo generate falhou (HTTP ${res.status})`);
    }
    return `veo:${taskId}`;
  }

  // ── demais modelos: jobs/createTask ──
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  };
  if (!res.ok || json.code !== 200 || !json.data?.taskId) {
    throw new KieError(res.status, json.msg || `kie createTask falhou (HTTP ${res.status})`);
  }
  return json.data.taskId;
}

function pickResultUrl(data: Record<string, unknown>): string | null {
  const info = (data.info ?? data.response ?? {}) as Record<string, unknown>;
  const candidates = [info.resultUrls, data.resultUrls, info.resultUrl, data.resultUrl];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return String(c[0]);
    if (typeof c === "string" && c) {
      const s = c.trim();
      if (s.startsWith("[")) {
        try {
          const arr = JSON.parse(s) as unknown[];
          if (arr.length) return String(arr[0]);
        } catch {
          /* ignora */
        }
      } else {
        return s;
      }
    }
  }
  if (typeof data.resultJson === "string") {
    try {
      const parsed = JSON.parse(data.resultJson) as { resultUrls?: unknown };
      if (Array.isArray(parsed.resultUrls) && parsed.resultUrls.length) {
        return String(parsed.resultUrls[0]);
      }
    } catch {
      /* ignora */
    }
  }
  return null;
}

function pickResultText(data: Record<string, unknown>): string | null {
  const info = (data.info ?? data.response ?? {}) as Record<string, unknown>;
  const candidates = [info.text, info.content, info.result, data.text, data.content, data.result];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  if (typeof data.resultJson === "string") {
    try {
      const parsed = JSON.parse(data.resultJson) as Record<string, unknown>;
      for (const k of ["text", "content", "result", "output"]) {
        if (typeof parsed[k] === "string" && (parsed[k] as string).trim()) {
          return (parsed[k] as string).trim();
        }
      }
    } catch {
      /* ignora */
    }
  }
  return null;
}

/** consulta o status de uma task e normaliza para o nosso GenerationStatus */
export async function kieRecordInfo(apiKey: string, taskId: string): Promise<KieRecord> {
  // ── Veo: endpoint próprio + successFlag (0 gerando, 1 ok, 2/3 falhou) ──
  if (taskId.startsWith("veo:")) {
    const realId = taskId.slice(4);
    const res = await fetch(`${KIE_BASE}/veo/record-info?taskId=${encodeURIComponent(realId)}`, {
      headers: authHeaders(apiKey),
    });
    const json = (await res.json().catch(() => ({}))) as {
      msg?: string;
      data?: { successFlag?: number; errorMessage?: string; response?: { resultUrls?: unknown }; resultUrls?: unknown };
    };
    const data = json.data ?? {};
    const flag = Number(data.successFlag ?? 0);
    const status: GenerationStatus = flag === 1 ? "done" : flag === 2 || flag === 3 ? "failed" : "processing";
    const urls = (data.response?.resultUrls ?? data.resultUrls) as unknown;
    const resultUrl = Array.isArray(urls) && urls.length ? String(urls[0]) : null;
    return {
      status: resultUrl && status !== "failed" ? "done" : status,
      resultUrl,
      resultText: null,
      error: status === "failed" ? String(data.errorMessage ?? json.msg ?? "veo falhou") : null,
      raw: json,
    };
  }

  const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: authHeaders(apiKey),
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    data?: Record<string, unknown>;
  };
  if (!res.ok || !json.data) {
    throw new KieError(res.status, json.msg || `kie recordInfo falhou (HTTP ${res.status})`);
  }
  const data = json.data;
  const rawState = String(data.state ?? data.status ?? data.successFlag ?? "").toLowerCase();

  let status: GenerationStatus;
  if (["success", "succeeded", "completed", "done", "1", "true"].includes(rawState)) {
    status = "done";
  } else if (["fail", "failed", "error", "2"].includes(rawState)) {
    status = "failed";
  } else if (["generating", "processing", "running"].includes(rawState)) {
    status = "processing";
  } else {
    status = "queued";
  }

  const resultUrl = pickResultUrl(data);
  const resultText = pickResultText(data);
  const finalStatus: GenerationStatus =
    (resultUrl || resultText) && status !== "failed" ? "done" : status;

  return {
    status: finalStatus,
    resultUrl,
    resultText,
    error:
      finalStatus === "failed"
        ? String(data.failMsg ?? data.errorMessage ?? json.msg ?? "geração falhou")
        : null,
    raw: json,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** cria uma task e faz polling até concluir (uso no worker, sem webhook) */
export async function kieRunToCompletion(
  apiKey: string,
  body: KieCreateInput,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<KieRecord> {
  const interval = opts.intervalMs ?? 5000;
  const timeout = opts.timeoutMs ?? 10 * 60_000;
  const taskId = await kieCreateTask(apiKey, body);
  const deadline = Date.now() + timeout;
  // primeiro poll após um pequeno atraso
  await sleep(Math.min(interval, 3000));
  for (;;) {
    const rec = await kieRecordInfo(apiKey, taskId);
    if (rec.status === "done" || rec.status === "failed") return rec;
    if (Date.now() > deadline) {
      throw new KieError(408, `timeout aguardando task ${taskId}`);
    }
    await sleep(interval);
  }
}

/** roda um modelo LLM da kie.ai e devolve o texto */
export async function kieLLM(apiKey: string, model: string, prompt: string): Promise<string> {
  const rec = await kieRunToCompletion(apiKey, { model, input: { prompt } });
  if (rec.status === "failed" || !rec.resultText) {
    throw new KieError(502, rec.error || "LLM kie sem resposta");
  }
  return rec.resultText;
}

// ───────────── tabela de custo (créditos) ─────────────
// MODEL_CREDITS = custo BRUTO aproximado em créditos kie por modelo (PLACEHOLDER —
// ajustar com a planilha real). O preço cobrado do usuário = ceil(bruto × markup).
// O markup (taxa oculta) vem por env CREDIT_MARKUP (default 1.3).
const MODEL_CREDITS: Record<string, number> = {
  // ── kie.ai ──
  "google/nano-banana": 3,
  "flux-2": 5,
  "google/imagen-4": 6,
  "ideogram/v3": 5,
  "qwen/image": 4,
  "recraft/v3": 5,
  veo3_fast: 70,
  veo3: 120,
  sora2: 108,
  "kling/v2": 54,
  "bytedance/seedance-v1-pro": 46,
  "minimax/hailuo-02": 50,
  // ── Magic Hour (vídeo) ──
  default: 50,
  "ltx-2": 35,
  "kling-2.5": 40,
  "kling-3.0": 50,
  "veo3.1": 120,
  "sora-2": 140,
};
const PER_EXTRA_SECOND: Record<string, number> = { veo3_fast: 8, veo3: 14 };
const BASE_DURATION = 4;

/** créditos cobrados do usuário para um modelo (custo kie × markup; vídeo usa duração) */
export function creditsForModel(model: string, durationSec?: number, markup = 1.3): number {
  const base = MODEL_CREDITS[model] ?? 8;
  const perSec = PER_EXTRA_SECOND[model];
  const raw = !durationSec || !perSec ? base : base + Math.max(0, durationSec - BASE_DURATION) * perSec;
  return Math.ceil(raw * markup);
}
