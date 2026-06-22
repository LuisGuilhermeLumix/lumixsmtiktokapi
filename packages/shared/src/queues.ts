// Nomes das filas BullMQ e payloads dos jobs (produzidos pela API,
// consumidos pelo worker). No Redis as chaves ficam como bull:<nome>:*.

export const QUEUE_PUBLISH = "publish";
export const QUEUE_STATUS = "status";
export const QUEUE_ANALYTICS = "analytics";
export const QUEUE_TOKEN_REFRESH = "token-refresh";
export const QUEUE_GENERATION = "generation";
export const QUEUE_AUTOMATION = "automation";

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
