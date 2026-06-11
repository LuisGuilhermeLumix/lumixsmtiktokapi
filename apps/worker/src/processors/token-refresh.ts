// queue:token-refresh — cron horário: renova access tokens (24h de vida)
// que expiram nas próximas 2h. Falha de refresh com auth_revoked marca a
// conta para reconexão (feito pelo token provider).

import type { Job } from "bullmq";
import type { TokenRefreshJobData } from "@lsm/shared";
import { TikTokApiError } from "@lsm/tiktok";
import type { WorkerDeps } from "../deps.js";
import { tokenProviderFor } from "../lib/tokens.js";

const REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

export function createTokenRefreshProcessor(deps: WorkerDeps) {
  return async (job: Job<TokenRefreshJobData>): Promise<void> => {
    const { socialAccountId } = job.data;

    // ── fan-out: contas com token expirando em < 2h ──────────────
    if (!socialAccountId) {
      const cutoff = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();
      const { data: rows } = await deps.db
        .from("oauth_tokens")
        .select("social_account_id")
        .lt("access_expires_at", cutoff);
      if (!rows || rows.length === 0) return;

      // só contas ainda conectadas (revogadas exigem reconexão manual)
      const { data: connected } = await deps.db
        .from("social_accounts")
        .select("id")
        .eq("status", "connected")
        .in(
          "id",
          rows.map((r) => r.social_account_id),
        );

      for (const account of connected ?? []) {
        await deps.queues.tokenRefresh.add(
          "refresh-account",
          { socialAccountId: account.id },
          { jobId: `token-refresh:${account.id}:${Date.now()}` },
        );
      }
      await job.log(`fan-out: ${connected?.length ?? 0} conta(s) p/ renovar`);
      return;
    }

    // ── renova uma conta ─────────────────────────────────────────
    try {
      await tokenProviderFor(deps, socialAccountId).refreshAccessToken!();
    } catch (err) {
      if (err instanceof TikTokApiError && err.kind === "auth_revoked") {
        return; // marcada como revoked — sem retry
      }
      throw err; // transiente → BullMQ re-tenta
    }
  };
}
