import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_REVOKE_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_SCOPES,
  type TikTokScope,
} from "./constants.js";
import { TikTokApiError } from "./errors.js";
import type { TikTokTokens } from "./types.js";

export interface TikTokOAuthConfig {
  clientKey: string;
  clientSecret: string;
  /** DEVE bater EXATAMENTE com o redirect URI cadastrado no portal TikTok */
  redirectUri: string;
}

export function oauthConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): TikTokOAuthConfig {
  const clientKey = env.TIKTOK_CLIENT_KEY;
  const clientSecret = env.TIKTOK_CLIENT_SECRET;
  const redirectUri = env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error(
      "Env TikTok incompleta: defina TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e TIKTOK_REDIRECT_URI",
    );
  }
  return { clientKey, clientSecret, redirectUri };
}

// ── state CSRF ───────────────────────────────────────────────────
// O chamador persiste o state (Redis/cookie) e valida no callback.

export function generateState(): string {
  return randomBytes(24).toString("hex");
}

export function verifyState(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── authorize ────────────────────────────────────────────────────

export function buildAuthorizeUrl(
  config: TikTokOAuthConfig,
  state: string,
  scopes: readonly TikTokScope[] = TIKTOK_SCOPES,
): string {
  const params = new URLSearchParams({
    client_key: config.clientKey,
    response_type: "code",
    scope: scopes.join(","),
    redirect_uri: config.redirectUri,
    state,
  });
  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

// ── token endpoint (form-urlencoded, resposta SEM envelope) ─────

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
}

async function tokenRequest(
  config: TikTokOAuthConfig,
  params: Record<string, string>,
): Promise<TikTokTokens> {
  let res: Response;
  try {
    res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        ...params,
      }),
    });
  } catch (err) {
    throw new TikTokApiError({
      kind: "network",
      code: "network_error",
      message: `Falha de rede no token endpoint: ${String(err)}`,
    });
  }

  const json = (await res.json().catch(() => null)) as RawTokenResponse | null;

  if (!res.ok || !json || json.error || !json.access_token) {
    throw new TikTokApiError({
      code: json?.error ?? `http_${res.status}`,
      message: json?.error_description ?? `Token endpoint falhou (HTTP ${res.status})`,
      httpStatus: res.status,
      logId: json?.log_id,
    });
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresIn: json.expires_in ?? 86_400,
    refreshExpiresIn: json.refresh_expires_in ?? 0,
    openId: json.open_id ?? "",
    scope: json.scope ?? "",
    tokenType: json.token_type ?? "Bearer",
  };
}

/** troca o authorization code por access + refresh token */
export function exchangeCode(config: TikTokOAuthConfig, code: string): Promise<TikTokTokens> {
  return tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
}

/**
 * Renova o access token (24h) usando o refresh token (365d).
 * Atenção: o TikTok pode rotacionar o refresh_token — persistir SEMPRE
 * o retornado. Falha com kind "auth_revoked" → conta precisa reconectar.
 */
export function refreshToken(
  config: TikTokOAuthConfig,
  refreshTokenValue: string,
): Promise<TikTokTokens> {
  return tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
  });
}

/**
 * Revoga o access token no TikTok (/v2/oauth/revoke/) — invalida o
 * acesso do lado deles. Usado ao desconectar uma conta no painel.
 */
export async function revokeToken(
  config: TikTokOAuthConfig,
  accessToken: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(TIKTOK_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        token: accessToken,
      }),
    });
  } catch (err) {
    throw new TikTokApiError({
      kind: "network",
      code: "network_error",
      message: `Falha de rede no revoke: ${String(err)}`,
    });
  }
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as RawTokenResponse | null;
    throw new TikTokApiError({
      code: json?.error ?? `http_${res.status}`,
      message: json?.error_description ?? `Revoke falhou (HTTP ${res.status})`,
      httpStatus: res.status,
      logId: json?.log_id,
    });
  }
}
