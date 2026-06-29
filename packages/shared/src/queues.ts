// Nomes das filas BullMQ e payloads dos jobs (produzidos pela API,
// consumidos pelo worker). No Redis as chaves ficam como bull:<nome>:*.

export const QUEUE_PUBLISH = "publish";
export const QUEUE_STATUS = "status";
export const QUEUE_ANALYTICS = "analytics";
export const QUEUE_TOKEN_REFRESH = "token-refresh";
export const QUEUE_GENERATION = "generation";
export const QUEUE_AUTOMATION = "automation";

// ───────── Motor de Automações de Conteúdo IA (jobs curtos e idempotentes) ─────────
// nomes com "-" (BullMQ usa ":" como separador de chave no Redis)
export const QUEUE_AUTO_SCAN = "auto-scan"; // cron 1min: varre slots due e faz fan-out
export const QUEUE_AUTO_PLAN = "auto-plan"; // pré-check + reserva de crédito + cria run/video/scene
export const QUEUE_SCRIPT_GEN = "script-generate"; // agente diretor → beats + caption
export const QUEUE_SCENE_VIDEO = "scene-video"; // gera 1 cena (imagem→vídeo) no provider
export const QUEUE_SCENE_POLL = "scene-poll"; // fallback de polling do provider
export const QUEUE_VIDEO_STITCH = "video-stitch"; // FFmpeg: concat/xfade/trim/música → publica
export const QUEUE_GRAPH_EXEC = "graph-exec"; // executor de grafo real (engine.ts, nó a nó)

/** publica um post_target no TikTok (init → upload → dispara status) */
export interface PublishJobData {
  postTargetId: string;
}

/** polling de status de um publish em andamento */
export interface StatusJobData {
  postTargetId: string;
  publishId: string;
  /** nº do poll (limite de segurança contra polling infinito) */
  attempt?: number;
}

/** coleta analytics; sem socialAccountId = varre todas as contas conectadas */
export interface AnalyticsJobData {
  socialAccountId?: string;
}

/** renova tokens próximos do expiry; sem id = varre todos */
export interface TokenRefreshJobData {
  socialAccountId?: string;
}

/** polling do status de uma geração kie.ai em andamento */
export interface GenerationJobData {
  generationId: string;
  attempt?: number;
}

/** dispara uma rodada da esteira de automação; sem id = varre todas ativas no horário */
export interface AutomationJobData {
  automationId?: string;
}

/** jobId determinístico p/ polling de geração (sem ":" — regra do BullMQ) */
export function generationJobId(generationId: string, attempt: number): string {
  return `gen-${generationId}-${attempt}`;
}

/**
 * jobId determinístico p/ dedupe e cancelamento de jobs de publicação.
 * Separador "-" obrigatório: o BullMQ proíbe ":" em jobIds customizados
 * (é o separador de chaves dele no Redis).
 */
export function publishJobId(postTargetId: string): string {
  return `target-${postTargetId}`;
}

// ───────── IDs determinísticos do Motor de Automações (princípio #2) ─────────
// IDs CANÔNICOS das entidades (viram text pk de automation_runs/videos/scenes na
// Fase 1) usam ":" e são legíveis. Para usar como jobId do BullMQ, sanitize com
// toBullJobId() (o BullMQ proíbe ":" em jobId customizado).

/** run = auto:{workflowId}:{YYYY-MM-DD}:{slot} */
export function automationRunId(workflowId: string, date: string, slot: string): string {
  return `auto:${workflowId}:${date}:${slot}`;
}

/** video = {run}:acct:{accountId}:{n} */
export function automationVideoId(runId: string, accountId: string, n: number): string {
  return `${runId}:acct:${accountId}:${n}`;
}

/** scene = {video}:scene:{i} */
export function automationSceneId(videoId: string, i: number): string {
  return `${videoId}:scene:${i}`;
}

/** converte um ID canônico (com ":") em jobId seguro para o BullMQ */
export function toBullJobId(canonicalId: string): string {
  return canonicalId.replace(/:/g, "__");
}

/** dados dos jobs do motor (payload mínimo — o resto vive no banco) */
export interface AutoScanJobData {
  /** sem workflowId = varre todos os workflows ativos no minuto */
  workflowId?: string;
}
export interface AutoPlanJobData {
  runId: string;
}
export interface ScriptGenJobData {
  videoId: string;
}
export interface SceneVideoJobData {
  sceneId: string;
}
export interface ScenePollJobData {
  sceneId: string;
  attempt?: number;
}
export interface VideoStitchJobData {
  videoId: string;
}
