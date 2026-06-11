// Erros mapeados da API do TikTok — prontos para gravar em post_targets.error
// e para decidir retry (BullMQ) / refresh / fallback de publicação.

export type TikTokErrorKind =
  | "rate_limit" // retry com backoff
  | "token_expired" // refresh automático e retry
  | "auth_revoked" // refresh token inválido/expirado → reconectar conta
  | "unaudited_client" // app sem audit → fallback para rascunho
  | "scope_not_authorized"
  | "privacy_mismatch"
  | "spam_risk"
  | "invalid_param"
  | "publish_failed"
  | "network" // falha de rede/5xx — retryable
  | "unknown";

const CODE_TO_KIND: Record<string, TikTokErrorKind> = {
  rate_limit_exceeded: "rate_limit",
  access_token_invalid: "token_expired",
  token_expired: "token_expired",
  invalid_grant: "auth_revoked",
  unaudited_client_can_only_post_to_private_accounts: "unaudited_client",
  scope_not_authorized: "scope_not_authorized",
  scope_permission_missed: "scope_not_authorized",
  privacy_level_option_mismatch: "privacy_mismatch",
  spam_risk_too_many_posts: "spam_risk",
  spam_risk_user_banned_from_posting: "spam_risk",
  invalid_param: "invalid_param",
};

function kindFromHttpStatus(status?: number): TikTokErrorKind {
  if (status === 429) return "rate_limit";
  if (status === 401) return "token_expired";
  if (status !== undefined && status >= 500) return "network";
  return "unknown";
}

export interface TikTokApiErrorInit {
  kind?: TikTokErrorKind;
  code: string;
  message: string;
  httpStatus?: number;
  logId?: string;
}

export class TikTokApiError extends Error {
  readonly kind: TikTokErrorKind;
  readonly code: string;
  readonly httpStatus?: number;
  readonly logId?: string;

  constructor(init: TikTokApiErrorInit) {
    super(init.message);
    this.name = "TikTokApiError";
    this.code = init.code;
    this.kind = init.kind ?? CODE_TO_KIND[init.code] ?? kindFromHttpStatus(init.httpStatus);
    this.httpStatus = init.httpStatus;
    this.logId = init.logId;
  }

  /** erros que valem retry imediato com backoff (sem intervenção) */
  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "network";
  }

  /** string curta e estável para post_targets.error */
  toDbError(): string {
    return `${this.kind}:${this.code}:${this.message}`.slice(0, 500);
  }
}

export function isTikTokError(err: unknown): err is TikTokApiError {
  return err instanceof TikTokApiError;
}

/** erro que justifica fallback direct_post → upload_draft (app sem audit) */
export function isUnauditedError(err: unknown): boolean {
  return (
    isTikTokError(err) &&
    (err.kind === "unaudited_client" || err.kind === "scope_not_authorized")
  );
}
