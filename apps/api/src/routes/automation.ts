// Motor de Automações — CRUD de Niche Packs e Personagens (Fase 2).
// Auth dual (jwt/apikey). Packs globais (org_id null) são só-leitura aqui;
// cada org cria/edita os seus. Toda escrita gera audit_log.

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { nichePackDataSchema } from "@lsm/shared/niche";
import type { Json, TablesUpdate } from "@lsm/db";
import type { ApiDeps } from "../deps.js";
import { logAudit } from "../lib/audit.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "use slug kebab-case (a-z, 0-9, -)");
const idParam = z.object({ id: z.string().min(1) });
const uuidParam = z.object({ id: z.string().uuid() });

export function registerAutomationRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
  auth: AuthHooks,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ═════════════ niche packs ═════════════
  r.get(
    "/niche-packs",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Lista niche packs (globais + da org)" },
    },
    async (req) => {
      const { data, error } = await deps.db
        .from("niche_packs")
        .select("*")
        .or(`org_id.is.null,org_id.eq.${req.auth!.orgId}`)
        .order("name", { ascending: true });
      if (error) throw httpError(500, error.message);
      return { niche_packs: data ?? [] };
    },
  );

  r.post(
    "/niche-packs",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Cria um niche pack da organização",
        body: z.object({
          id: slug,
          name: z.string().min(1).max(120),
          data: nichePackDataSchema,
        }),
      },
    },
    async (req, reply) => {
      const { data: existing } = await deps.db
        .from("niche_packs")
        .select("id")
        .eq("id", req.body.id)
        .maybeSingle();
      if (existing) throw httpError(409, "Já existe um niche pack com esse id");

      const { data, error } = await deps.db
        .from("niche_packs")
        .insert({
          id: req.body.id,
          org_id: req.auth!.orgId,
          name: req.body.name,
          data: req.body.data as unknown as Json,
          created_by: req.auth!.userId,
        })
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar pack: ${error?.message}`);

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "niche_pack.create",
        entity: `niche_pack:${data.id}`,
      });
      return reply.code(201).send({ niche_pack: data });
    },
  );

  r.get(
    "/niche-packs/:id",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Detalhe de um niche pack", params: idParam },
    },
    async (req) => {
      const { data, error } = await deps.db
        .from("niche_packs")
        .select("*")
        .eq("id", req.params.id)
        .or(`org_id.is.null,org_id.eq.${req.auth!.orgId}`)
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "Niche pack não encontrado");
      return { niche_pack: data };
    },
  );

  r.patch(
    "/niche-packs/:id",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Atualiza um niche pack da org (globais são só-leitura)",
        params: idParam,
        body: z.object({
          name: z.string().min(1).max(120).optional(),
          data: nichePackDataSchema.optional(),
        }),
      },
    },
    async (req) => {
      const patch: TablesUpdate<"niche_packs"> = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.data !== undefined) patch.data = req.body.data as unknown as Json;
      if (Object.keys(patch).length === 0) throw httpError(400, "Nada para atualizar");

      const { data, error } = await deps.db
        .from("niche_packs")
        .update(patch)
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId) // não permite editar pack global
        .select("*")
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "Niche pack da org não encontrado");

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "niche_pack.update",
        entity: `niche_pack:${data.id}`,
      });
      return { niche_pack: data };
    },
  );

  r.delete(
    "/niche-packs/:id",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Remove um niche pack da org", params: idParam },
    },
    async (req, reply) => {
      const { data, error } = await deps.db
        .from("niche_packs")
        .delete()
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .select("id")
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "Niche pack da org não encontrado");

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "niche_pack.delete",
        entity: `niche_pack:${req.params.id}`,
      });
      return reply.code(204).send();
    },
  );

  // ═════════════ personagens ═════════════
  const characterBody = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(4000).default(""),
    reference_image_url: z.string().url().optional(),
    traits: z.record(z.string(), z.unknown()).default({}),
  });

  r.get(
    "/characters",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Lista personagens da org" },
    },
    async (req) => {
      const { data, error } = await deps.db
        .from("characters")
        .select("*")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false });
      if (error) throw httpError(500, error.message);
      return { characters: data ?? [] };
    },
  );

  r.post(
    "/characters",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Cria um personagem", body: characterBody },
    },
    async (req, reply) => {
      const { data, error } = await deps.db
        .from("characters")
        .insert({
          org_id: req.auth!.orgId,
          name: req.body.name,
          description: req.body.description,
          reference_image_url: req.body.reference_image_url ?? null,
          traits: req.body.traits as unknown as Json,
          created_by: req.auth!.userId,
        })
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar personagem: ${error?.message}`);

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "character.create",
        entity: `character:${data.id}`,
      });
      return reply.code(201).send({ character: data });
    },
  );

  r.patch(
    "/characters/:id",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Atualiza um personagem",
        params: uuidParam,
        body: characterBody.partial(),
      },
    },
    async (req) => {
      const patch: TablesUpdate<"characters"> = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.description !== undefined) patch.description = req.body.description;
      if (req.body.reference_image_url !== undefined)
        patch.reference_image_url = req.body.reference_image_url;
      if (req.body.traits !== undefined) patch.traits = req.body.traits as unknown as Json;
      if (Object.keys(patch).length === 0) throw httpError(400, "Nada para atualizar");

      const { data, error } = await deps.db
        .from("characters")
        .update(patch)
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .select("*")
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "Personagem não encontrado");

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "character.update",
        entity: `character:${data.id}`,
      });
      return { character: data };
    },
  );

  r.delete(
    "/characters/:id",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Remove um personagem", params: uuidParam },
    },
    async (req, reply) => {
      const { data, error } = await deps.db
        .from("characters")
        .delete()
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .select("id")
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "Personagem não encontrado");

      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "character.delete",
        entity: `character:${req.params.id}`,
      });
      return reply.code(204).send();
    },
  );
}
