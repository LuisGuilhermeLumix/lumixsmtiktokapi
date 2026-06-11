import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";
import { assertClientAccess, visibleClientIds } from "../lib/access.js";
import { logAudit } from "../lib/audit.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";

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
