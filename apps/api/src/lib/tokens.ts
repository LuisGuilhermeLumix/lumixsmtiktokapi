// Persistência dos tokens TikTok (AES-256-GCM em repouso) e
// AccessTokenProvider com refresh automático para o SDK.

import { decryptSecret, encryptSecret } from "@lsm/shared/crypto";
import {
  refreshToken as oauthRefreshToken,
  TikTokAccountApi,
  TikTokApiError,
  type AccessTokenProvider,
  type TikTokTokens,
} from "@lsm/tiktok";
import type { ApiDeps } from "../deps.js";

/** margem antes do expiry para renovar proativamente */
const EXPIRY_SKEW_MS = 120_000;

export async function saveAccountTokens(
  deps: ApiDeps,
  socialAccountId: string,
  tokens: TikTokTokens,
): Promise<void> {
  const now = Date.now();
  const key = deps.config.ENCRYPTION_KEY;
  const { error } = await deps.db.from("oauth_tokens").upsert(
    {
      social_account_id: socialAccountId,
      access_token_enc: encryptSecret(tokens.accessToken, key),
      refresh_token_enc: encryptSecret(tokens.refreshToken, key),
      access_expires_at: new Date(now + tokens.expiresIn * 1000).toISOString(),
      refresh_expires_at: new Date(now + tokens.refreshExpiresIn * 1000).toISOString(),
      scope: tokens.scope,
    },
    { onConflict: "social_account_id" },
  );
  if (error) throw new Error(`Falha ao salvar tokens: ${error.message}`);
}

export function tokenProviderFor(deps: ApiDeps, socialAccountId: string): AccessTokenProvider {
  async function loadRow() {
    const { data } = await deps.db
      .from("oauth_tokens")
      .select("*")
      .eq("social_account_id", socialAccountId)
      .maybeSingle();
    if (!data) {
      throw new TikTokApiError({
        kind: "auth_revoked",
        code: "tokens_missing",
        message: `Conta ${socialAccountId} sem tokens — reconectar via OAuth`,
      });
    }
    return data;
  }

  async function refresh(): Promise<string> {
    const row = await loadRow();
    const refreshTokenValue = decryptSecret(row.refresh_token_enc, deps.config.ENCRYPTION_KEY);
    try {
      // TikTok pode rotacionar o refresh_token — persistir SEMPRE o retornado
      const fresh = await oauthRefreshToken(deps.tiktok, refreshTokenValue);
      await saveAccountTokens(deps, socialAccountId, fresh);
      return fresh.accessToken;
    } catch (err) {
      if (err instanceof TikTokApiError && err.kind === "auth_revoked") {
        await deps.db
          .from("social_accounts")
          .update({ status: "revoked" })
          .eq("id", socialAccountId);
      }
      throw err;
    }
  }

  return {
    async getAccessToken() {
      const row = await loadRow();
      const expiresAt = new Date(row.access_expires_at).getTime();
      if (expiresAt - Date.now() < EXPIRY_SKEW_MS) return refresh();
      return decryptSecret(row.access_token_enc, deps.config.ENCRYPTION_KEY);
    },
    refreshAccessToken: refresh,
  };
}

export function accountApiFor(deps: ApiDeps, socialAccountId: string): TikTokAccountApi {
  return new TikTokAccountApi(tokenProviderFor(deps, socialAccountId));
}
