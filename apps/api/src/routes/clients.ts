import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { decryptSecret } from "@lsm/shared/crypto";
import { revokeToken } from "@lsm/tiktok";
import type { ApiDeps } from "../deps.js";
import { assertClientAccess, visibleClientIds } from "../lib/access.js";
import { logAudit } from "../lib/audit.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";
import { assertCanAddClient } from "../lib/plan.js";

const clientIdParam = z.object({ id: z.string().uuid() });

export function registerClientRoutes(app: FastifyInstance, deps: ApiDeps, auth: AuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/clients",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["clients"], description: "Lista clientes visíveis ao ator" },
    },
    async (req) => {
      const ids = await visibleClientIds(deps, req.auth!);
      if (ids !== undefined && ids.length === 0) return { clients: [] };

      let query = deps.db
        .from("clients")
        .select("*")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false });
      if (ids !== undefined) query = query.in("id", ids);

      const { data: clients, error } = await query;
      if (error) throw httpError(500, error.message);

      // contas conectadas por cliente (consulta separada — sem depender de FK hints)
      const clientIds = (clients ?? []).map((c) => c.id);
      const { data: accounts } = clientIds.length
        ? await deps.db
            .from("social_accounts")
            .select("id, client_id, platform, display_name, avatar_url, status, connected_at")
            .in("client_id", clientIds)
        : { data: [] as never[] };

      return {
        clients: (clients ?? []).map((c) => ({
          ...c,
          accounts: (accounts ?? []).filter((a) => a.client_id === c.id),
        })),
      };
    },
  );

  r.post(
    "/clients",
    {
      preHandler: [auth.authenticate, auth.requireRole("owner", "admin")],
      schema: {
        tags: ["clients"],
        description: "Cria cliente",
        body: z.object({
          name: z.string().min(1).max(200),
          notes: z.string().max(5000).optional(),
        }),
      },
    },
    async (req, reply) => {
      await assertCanAddClient(deps, req.auth!.orgId); // limite do plano
      const { data, error } = await deps.db
        .from("clients")
        .insert({
          org_id: req.auth!.orgId,
          name: req.body.name,
          notes: req.body.notes ?? null,
        })
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar cliente: ${error?.message}`);

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "client.create",
        entity: `client:${data.id}`,
      });
      return reply.code(201).send({ client: data });
    },
  );

  r.patch(
    "/clients/:id",
    {
      preHandler: [auth.authenticate, auth.requireRole("owner", "admin")],
      schema: {
        tags: ["clients"],
        description: "Atualiza cliente",
        params: clientIdParam,
        body: z.object({
          name: z.string().min(1).max(200).optional(),
          notes: z.string().max(5000).nullable().optional(),
        }),
      },
    },
    async (req) => {
      await assertClientAccess(deps, req.auth!, req.params.id);
      const { data, error } = await deps.db
        .from("clients")
        .update(req.body)
        .eq("id", req.params.id)
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao atualizar: ${error?.message}`);
      return { client: data };
    },
  );

  r.delete(
    "/clients/:id",
    {
      preHandler: [auth.authenticate, auth.requireRole("owner", "admin")],
      schema: { tags: ["clients"], description: "Remove cliente", params: clientIdParam },
    },
    async (req, reply) => {
      await assertClientAccess(deps, req.auth!, req.params.id);
      const { error } = await deps.db.from("clients").delete().eq("id", req.params.id);
      if (error) throw httpError(500, `Falha ao excluir: ${error.message}`);

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "client.delete",
        entity: `client:${req.params.id}`,
      });
      return reply.code(204).send();
    },
  );

  // Desconecta uma conta TikTok: revoga no TikTok (best-effort), apaga os
  // tokens e marca como revoked. A linha NÃO é deletada — apagar cascatearia
  // post_targets/video_metrics e destruiria o histórico de posts.
  r.delete(
    "/clients/:clientId/accounts/:accountId",
    {
      preHandler: [auth.authenticate, auth.requireRole("owner", "admin")],
      schema: {
        tags: ["clients"],
        description:
          "Desconecta a conta TikTok: revoga o token no TikTok, apaga os tokens " +
          "criptografados e marca a conta como revoked",
        params: z.object({
          clientId: z.string().uuid(),
          accountId: z.string().uuid(),
        }),
      },
    },
    async (req, reply) => {
      await assertClientAccess(deps, req.auth!, req.params.clientId);

      const { data: account, error } = await deps.db
        .from("social_accounts")
        .select("id, client_id, status")
        .eq("id", req.params.accountId)
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!account || account.client_id !== req.params.clientId) {
        throw httpError(404, "Conta não encontrada");
      }

      // revoga do lado do TikTok — best-effort: a desconexão local não pode
      // falhar porque o token já expirou ou o TikTok oscilou
      const { data: tokens } = await deps.db
        .from("oauth_tokens")
        .select("access_token_enc")
        .eq("social_account_id", account.id)
        .maybeSingle();
      let revokedAtTikTok = false;
      if (tokens) {
        try {
          const accessToken = decryptSecret(
            tokens.access_token_enc,
            deps.config.ENCRYPTION_KEY,
          );
          await revokeToken(deps.tiktok, accessToken);
          revokedAtTikTok = true;
        } catch (err) {
          req.log.warn({ err }, "revoke no TikTok falhou — seguindo com desconexão local");
        }
      }

      const { error: delErr } = await deps.db
        .from("oauth_tokens")
        .delete()
        .eq("social_account_id", account.id);
      if (delErr) throw httpError(500, `Falha ao apagar tokens: ${delErr.message}`);

      const { error: updErr } = await deps.db
        .from("social_accounts")
        .update({ status: "revoked" })
        .eq("id", account.id);
      if (updErr) throw httpError(500, `Falha ao atualizar conta: ${updErr.message}`);

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "account.disconnect",
        entity: `social_account:${account.id}`,
        meta: { client_id: req.params.clientId, revoked_at_tiktok: revokedAtTikTok },
      });

      return reply.code(204).send();
    },
  );

  r.get(
    "/clients/:id/accounts",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["clients"],
        description: "Contas sociais conectadas do cliente",
        params: clientIdParam,
      },
    },
    async (req) => {
      await assertClientAccess(deps, req.auth!, req.params.id);
      const { data, error } = await deps.db
        .from("social_accounts")
        .select("id, platform, tiktok_open_id, display_name, avatar_url, status, connected_at")
        .eq("client_id", req.params.id)
        .order("connected_at", { ascending: false });
      if (error) throw httpError(500, error.message);
      return { accounts: data ?? [] };
    },
  );
}
