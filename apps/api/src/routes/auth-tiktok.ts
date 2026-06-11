// Fluxo OAuth TikTok.
//
// 1) Dashboard chama GET /auth/tiktok/start?client_id=X (autenticado, XHR)
//    → recebe { url } e redireciona o browser para o TikTok.
// 2) TikTok redireciona o browser para GET /auth/tiktok/callback?code&state
//    (rota pública) → troca tokens, salva criptografado e devolve o usuário
//    ao dashboard (APP_URL/clients/:id?tiktok=connected|erro).

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { buildAuthorizeUrl, exchangeCode, generateState, getUserInfo } from "@lsm/tiktok";
import type { ApiDeps } from "../deps.js";
import { assertClientAccess } from "../lib/access.js";
import { logAudit } from "../lib/audit.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";
import { saveAccountTokens } from "../lib/tokens.js";

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `tiktok:oauth:state:${state}`;

interface StatePayload {
  clientId: string;
  orgId: string;
  userId: string | null;
}

export function registerAuthTikTokRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
  auth: AuthHooks,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/auth/tiktok/start",
    {
      preHandler: [auth.authenticate, auth.requireRole("owner", "admin")],
      schema: {
        tags: ["auth"],
        description: "Gera URL de autorização TikTok (state CSRF em Redis, TTL 10min)",
        querystring: z.object({ client_id: z.string().uuid() }),
      },
    },
    async (req) => {
      const { client_id } = req.query;
      await assertClientAccess(deps, req.auth!, client_id);

      const state = generateState();
      const payload: StatePayload = {
        clientId: client_id,
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
      };
      await deps.redis.setex(stateKey(state), STATE_TTL_SECONDS, JSON.stringify(payload));

      return { url: buildAuthorizeUrl(deps.tiktok, state) };
    },
  );

  r.get(
    "/auth/tiktok/callback",
    {
      schema: {
        tags: ["auth"],
        description: "Callback do TikTok (rota pública — redireciona ao dashboard)",
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
          error_description: z.string().optional(),
        }),
      },
    },
    async (req, reply) => {
      const { code, state, error } = req.query;
      const appUrl = deps.config.APP_URL;

      if (!state) return reply.redirect(`${appUrl}/clients?tiktok=error&reason=missing_state`);

      // GETDEL: state é de uso único (CSRF)
      const raw = await deps.redis.getdel(stateKey(state));
      if (!raw) return reply.redirect(`${appUrl}/clients?tiktok=error&reason=invalid_state`);
      const payload = JSON.parse(raw) as StatePayload;
      const backToClient = `${appUrl}/clients/${payload.clientId}`;

      if (error || !code) {
        return reply.redirect(`${backToClient}?tiktok=denied`);
      }

      try {
        const tokens = await exchangeCode(deps.tiktok, code);
        if (!tokens.openId) throw httpError(502, "TikTok não retornou open_id");

        // perfil é best-effort — conexão não falha se a Display API oscilar
        let displayName: string | null = null;
        let avatarUrl: string | null = null;
        try {
          const info = await getUserInfo(tokens.accessToken);
          displayName = info.displayName ?? null;
          avatarUrl = info.avatarUrl ?? null;
        } catch (e) {
          req.log.warn({ err: e }, "user.info falhou após conexão — seguindo sem perfil");
        }

        const { data: account, error: upsertErr } = await deps.db
          .from("social_accounts")
          .upsert(
            {
              client_id: payload.clientId,
              platform: "tiktok",
              tiktok_open_id: tokens.openId,
              display_name: displayName,
              avatar_url: avatarUrl,
              status: "connected",
              connected_at: new Date().toISOString(),
            },
            { onConflict: "client_id,platform,tiktok_open_id" },
          )
          .select("id")
          .single();
        if (upsertErr || !account) {
          throw httpError(500, `Falha ao salvar conta: ${upsertErr?.message}`);
        }

        await saveAccountTokens(deps, account.id, tokens);

        logAudit(deps, {
          orgId: payload.orgId,
          userId: payload.userId,
          action: "account.connect",
          entity: `social_account:${account.id}`,
          meta: { client_id: payload.clientId, platform: "tiktok" },
        });

        return reply.redirect(`${backToClient}?tiktok=connected`);
      } catch (err) {
        req.log.error({ err }, "callback TikTok falhou");
        return reply.redirect(`${backToClient}?tiktok=error&reason=exchange_failed`);
      }
    },
  );
}
