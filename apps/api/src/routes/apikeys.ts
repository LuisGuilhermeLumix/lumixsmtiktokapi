// API keys p/ uso estilo upload-post (curl/n8n): Authorization: Apikey <key>.
// O plaintext só aparece UMA vez, na criação; persistimos apenas o sha-256.

import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";
import { logAudit } from "../lib/audit.js";
import { hashApiKey, type AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";

export function registerApiKeyRoutes(app: FastifyInstance, deps: ApiDeps, auth: AuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // gerência de API key exige sessão de usuário (uma key não cria/revoga keys)
  const adminOnly = [auth.authenticate, auth.requireUserSession, auth.requireRole("owner", "admin")];

  r.get(
    "/api-keys",
    {
      preHandler: adminOnly,
      schema: { tags: ["settings"], description: "Lista API keys (metadados, nunca a key)" },
    },
    async (req) => {
      const { data, error } = await deps.db
        .from("api_keys")
        .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false });
      if (error) throw httpError(500, error.message);
      return { api_keys: data ?? [] };
    },
  );

  r.post(
    "/api-keys",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["settings"],
        description: "Cria API key — o plaintext é retornado SOMENTE nesta resposta",
        body: z.object({ name: z.string().min(1).max(100) }),
      },
    },
    async (req, reply) => {
      const plaintext = `lsm_${randomBytes(24).toString("hex")}`;
      const { data, error } = await deps.db
        .from("api_keys")
        .insert({
          org_id: req.auth!.orgId,
          name: req.body.name,
          key_prefix: plaintext.slice(0, 12),
          key_hash: hashApiKey(plaintext),
          created_by: req.auth!.userId,
        })
        .select("id, name, key_prefix, created_at")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar API key: ${error?.message}`);

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "api_key.create",
        entity: `api_key:${data.id}`,
      });

      return reply.code(201).send({ api_key: data, key: plaintext });
    },
  );

  r.delete(
    "/api-keys/:id",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["settings"],
        description: "Revoga API key (soft — mantém histórico)",
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (req, reply) => {
      const { data, error } = await deps.db
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .select("id")
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "API key não encontrada");

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "api_key.revoke",
        entity: `api_key:${req.params.id}`,
      });
      return reply.code(204).send();
    },
  );
}
