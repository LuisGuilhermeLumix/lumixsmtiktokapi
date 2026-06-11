// Nomes das filas BullMQ e payloads dos jobs (produzidos pela API,
// consumidos pelo worker). No Redis as chaves ficam como bull:<nome>:*.

export const QUEUE_PUBLISH = "publish";
export const QUEUE_STATUS = "status";
export const QUEUE_ANALYTICS = "analytics";
export const QUEUE_TOKEN_REFRESH = "token-refresh";

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

/** jobId determinístico p/ dedupe e cancelamento de jobs de publicação */
export function publishJobId(postTargetId: string): string {
  return `target:${postTargetId}`;
}
