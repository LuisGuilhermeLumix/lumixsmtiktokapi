// Motor de Automações — CRUD de workflows + validação (compilador) + teste
// (run manual) + histórico de runs. Auth dual, RLS por org.

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AUTOMATION_TEMPLATES,
  compileWorkflow,
  getTemplate,
  type AutomationGraph,
} from "@lsm/shared/automation";
import { automationRunId, toBullJobId } from "@lsm/shared";
import type { Json, TablesUpdate } from "@lsm/db";
import type { ApiDeps } from "../deps.js";
import { assertClientAccess } from "../lib/access.js";
import { logAudit } from "../lib/audit.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";
import { createHash } from "node:crypto";

// ── idempotência (header Idempotency-Key) p/ mutations que criam runs ──
function idemCacheKey(orgId: string, key: string): string {
  return `idemp:${orgId}:${createHash("sha256").update(key).digest("hex")}`;
}
async function idemGet(deps: ApiDeps, orgId: string, key: string): Promise<unknown | null> {
  const v = await deps.redis.get(idemCacheKey(orgId, key));
  return v ? (JSON.parse(v) as unknown) : null;
}
async function idemSet(deps: ApiDeps, orgId: string, key: string, value: unknown): Promise<void> {
  await deps.redis.set(idemCacheKey(orgId, key), JSON.stringify(value), "EX", 86_400); // 24h
}

const uuidParam = z.object({ id: z.string().uuid() });
const graphSchema = z.object({
  nodes: z.array(z.record(z.string(), z.unknown())),
  edges: z.array(z.record(z.string(), z.unknown())),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export function registerWorkflowRoutes(app: FastifyInstance, deps: ApiDeps, auth: AuthHooks): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  async function load(orgId: string, id: string) {
    const { data } = await deps.db
      .from("automation_workflows")
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    return data;
  }

  r.get(
    "/workflow-templates",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Templates prontos de automação" },
    },
    async () => ({
      templates: AUTOMATION_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    }),
  );

  r.post(
    "/workflows/from-template",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Cria um workflow a partir de um template",
        body: z.object({
          template: z.string().min(1),
          name: z.string().min(1).max(120),
          niche_pack_id: z.string().default("fazenda-ugc"),
          client_id: z.string().uuid().optional(),
        }),
      },
    },
    async (req, reply) => {
      const tpl = getTemplate(req.body.template);
      if (!tpl) throw httpError(404, "Template não encontrado");
      if (req.body.client_id) await assertClientAccess(deps, req.auth!, req.body.client_id);
      const graph = tpl.build(req.body.niche_pack_id);
      const compiled = compileWorkflow("pending", graph);

      const { data, error } = await deps.db
        .from("automation_workflows")
        .insert({
          org_id: req.auth!.orgId,
          client_id: req.body.client_id ?? null,
          name: req.body.name,
          status: "draft",
          graph: graph as unknown as Json,
          compiled_plan: compiled.ok ? (compiled.plan as unknown as Json) : null,
          timezone: compiled.ok ? compiled.schedule.timezone : "America/Sao_Paulo",
          post_times: compiled.ok ? compiled.schedule.post_times : [],
          lead_time_min: compiled.ok ? compiled.schedule.lead_time_min : 20,
          created_by: req.auth!.userId,
        })
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar workflow: ${error?.message}`);
      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "workflow.from_template",
        entity: `workflow:${data.id}`,
        meta: { template: req.body.template },
      });
      return reply.code(201).send({ workflow: data });
    },
  );

  r.get(
    "/workflows",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Lista workflows da org" },
    },
    async (req) => {
      const { data, error } = await deps.db
        .from("automation_workflows")
        .select("id, name, status, client_id, post_times, timezone, last_run_at, created_at")
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw httpError(500, error.message);
      return { workflows: data ?? [] };
    },
  );

  r.post(
    "/workflows",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Cria um workflow (rascunho)",
        body: z.object({
          name: z.string().min(1).max(120),
          client_id: z.string().uuid().optional(),
          graph: graphSchema.optional(),
        }),
      },
    },
    async (req, reply) => {
      if (req.body.client_id) await assertClientAccess(deps, req.auth!, req.body.client_id);
      const { data, error } = await deps.db
        .from("automation_workflows")
        .insert({
          org_id: req.auth!.orgId,
          client_id: req.body.client_id ?? null,
          name: req.body.name,
          status: "draft",
          graph: (req.body.graph ?? { nodes: [], edges: [] }) as unknown as Json,
          created_by: req.auth!.userId,
        })
        .select("*")
        .single();
      if (error || !data) throw httpError(500, `Falha ao criar workflow: ${error?.message}`);
      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "workflow.create",
        entity: `workflow:${data.id}`,
      });
      return reply.code(201).send({ workflow: data });
    },
  );

  r.get(
    "/workflows/:id",
    { preHandler: [auth.authenticate], schema: { tags: ["automation"], params: uuidParam } },
    async (req) => {
      const wf = await load(req.auth!.orgId, req.params.id);
      if (!wf) throw httpError(404, "Workflow não encontrado");
      return { workflow: wf };
    },
  );

  r.patch(
    "/workflows/:id",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Atualiza nome/grafo/status do workflow",
        params: uuidParam,
        body: z.object({
          name: z.string().min(1).max(120).optional(),
          graph: graphSchema.optional(),
          status: z.enum(["draft", "active", "paused"]).optional(),
        }),
      },
    },
    async (req) => {
      const wf = await load(req.auth!.orgId, req.params.id);
      if (!wf) throw httpError(404, "Workflow não encontrado");

      const patch: TablesUpdate<"automation_workflows"> = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.graph !== undefined) patch.graph = req.body.graph as unknown as Json;
      if (req.body.status !== undefined) {
        // só ativa se o grafo compilar
        if (req.body.status === "active") {
          const c = compileWorkflow(wf.id, (req.body.graph ?? wf.graph) as unknown as AutomationGraph);
          if (!c.ok) throw httpError(400, `Não dá para ativar: ${c.errors.join(" | ")}`);
          patch.compiled_plan = c.plan as unknown as Json;
          patch.timezone = c.schedule.timezone;
          patch.post_times = c.schedule.post_times;
          patch.lead_time_min = c.schedule.lead_time_min;
        }
        patch.status = req.body.status;
      }
      if (Object.keys(patch).length === 0) throw httpError(400, "Nada para atualizar");

      const { data, error } = await deps.db
        .from("automation_workflows")
        .update(patch)
        .eq("id", wf.id)
        .eq("org_id", req.auth!.orgId)
        .select("*")
        .single();
      if (error || !data) throw httpError(500, error?.message ?? "Falha ao atualizar");
      return { workflow: data };
    },
  );

  r.delete(
    "/workflows/:id",
    { preHandler: [auth.authenticate], schema: { tags: ["automation"], params: uuidParam } },
    async (req, reply) => {
      const { data, error } = await deps.db
        .from("automation_workflows")
        .delete()
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .select("id")
        .maybeSingle();
      if (error) throw httpError(500, error.message);
      if (!data) throw httpError(404, "Workflow não encontrado");
      logAudit(deps, {
        orgId: req.auth!.orgId,
        userId: req.auth!.userId,
        action: "workflow.delete",
        entity: `workflow:${req.params.id}`,
      });
      return reply.code(204).send();
    },
  );

  // valida (compila) o grafo e persiste o compiled_plan + schedule denormalizado
  r.post(
    "/workflows/:id/validate",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["automation"],
        description: "Valida/compila o grafo do workflow",
        params: uuidParam,
        body: z.object({ graph: graphSchema.optional() }).optional(),
      },
    },
    async (req) => {
      const wf = await load(req.auth!.orgId, req.params.id);
      if (!wf) throw httpError(404, "Workflow não encontrado");
      const graph = (req.body?.graph ?? wf.graph) as unknown as AutomationGraph;
      const c = compileWorkflow(wf.id, graph);
      if (!c.ok) return { ok: false, errors: c.errors };

      await deps.db
        .from("automation_workflows")
        .update({
          graph: graph as unknown as Json,
          compiled_plan: c.plan as unknown as Json,
          timezone: c.schedule.timezone,
          post_times: c.schedule.post_times,
          lead_time_min: c.schedule.lead_time_min,
        })
        .eq("id", wf.id);
      return { ok: true, schedule: c.schedule, config: c.plan.config };
    },
  );

  // testa: dispara um run manual (1 conta — usa a config compilada)
  r.post(
    "/workflows/:id/test",
    { preHandler: [auth.authenticate], schema: { tags: ["automation"], params: uuidParam } },
    async (req) => {
      const idemKey = req.headers["idempotency-key"] as string | undefined;
      if (idemKey) {
        const cached = await idemGet(deps, req.auth!.orgId, idemKey);
        if (cached) return cached;
      }
      const wf = await load(req.auth!.orgId, req.params.id);
      if (!wf) throw httpError(404, "Workflow não encontrado");
      const c = compileWorkflow(wf.id, wf.graph as unknown as AutomationGraph);
      if (!c.ok) throw httpError(400, `Grafo inválido: ${c.errors.join(" | ")}`);
      await deps.db.from("automation_workflows").update({ compiled_plan: c.plan as unknown as Json }).eq("id", wf.id);

      const today = new Date().toISOString().slice(0, 10);
      const slot = `test-${Date.now()}`;
      const runId = automationRunId(wf.id, today, slot);
      await deps.db.from("automation_runs").insert({
        id: runId,
        org_id: req.auth!.orgId,
        workflow_id: wf.id,
        run_date: today,
        slot,
        status: "queued",
      });
      await deps.queues.autoPlan.add("plan", { runId }, { jobId: toBullJobId(runId), attempts: 1 });
      const result = { run_id: runId };
      if (idemKey) await idemSet(deps, req.auth!.orgId, idemKey, result);
      return result;
    },
  );

  // histórico de runs
  r.get(
    "/workflows/:id/runs",
    { preHandler: [auth.authenticate], schema: { tags: ["automation"], params: uuidParam } },
    async (req) => {
      const { data, error } = await deps.db
        .from("automation_runs")
        .select("*")
        .eq("workflow_id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw httpError(500, error.message);
      return { runs: data ?? [] };
    },
  );

  // cancela um run em andamento: estorna o reservado-não-usado e marca terminal
  r.post(
    "/runs/:id/cancel",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Cancela um run de automação", params: z.object({ id: z.string().min(1) }) },
    },
    async (req) => {
      const { data: run } = await deps.db
        .from("automation_runs")
        .select("id, org_id, status, credits_reserved, credits_settled")
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .maybeSingle();
      if (!run) throw httpError(404, "Run não encontrado");
      if (["done", "failed", "partial", "skipped"].includes(run.status)) {
        return { run_id: run.id, status: run.status }; // já terminou
      }

      // estorna créditos reservados ainda não usados (idempotente via credits_settled)
      if (run.credits_settled === 0) {
        const { data: vids } = await deps.db.from("automation_videos").select("id").eq("run_id", run.id);
        const ids = (vids ?? []).map((v) => v.id);
        let used = 0;
        if (ids.length) {
          const { data: scenes } = await deps.db.from("automation_scenes").select("credits_charged").in("video_id", ids);
          used = (scenes ?? []).reduce((s, sc) => s + (sc.credits_charged ?? 0), 0);
        }
        const refund = run.credits_reserved - used;
        if (refund > 0) {
          await deps.db.rpc("refund_credits", { p_org: run.org_id, p_amount: refund, p_reason: `automation_cancel:${run.id}` });
        }
        await deps.db.from("automation_runs").update({ credits_settled: used }).eq("id", run.id);
      }

      // marca terminal: run + vídeos/cenas não-terminais
      await deps.db.from("automation_runs").update({ status: "failed", error: "Cancelado pelo usuário" }).eq("id", run.id);
      const { data: vids2 } = await deps.db.from("automation_videos").select("id").eq("run_id", run.id);
      const ids2 = (vids2 ?? []).map((v) => v.id);
      if (ids2.length) {
        await deps.db.from("automation_videos").update({ status: "failed", error: "cancelado" }).eq("run_id", run.id).neq("status", "published");
        await deps.db.from("automation_scenes").update({ status: "failed", error: "cancelado" }).in("video_id", ids2).not("status", "in", "(done,failed)");
      }
      logAudit(deps, { orgId: req.auth!.orgId, userId: req.auth!.userId, action: "automation.run_cancel", entity: `run:${run.id}` });
      return { run_id: run.id, status: "failed" };
    },
  );

  // detalhe de um run (videos + steps)
  r.get(
    "/runs/:id",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], params: z.object({ id: z.string().min(1) }) },
    },
    async (req) => {
      const { data: run } = await deps.db
        .from("automation_runs")
        .select("*")
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .maybeSingle();
      if (!run) throw httpError(404, "Run não encontrado");
      const { data: videos } = await deps.db
        .from("automation_videos")
        .select("*")
        .eq("run_id", run.id)
        .order("idx", { ascending: true });
      const videoIds = (videos ?? []).map((v) => v.id);
      let scenes: unknown[] = [];
      if (videoIds.length) {
        const { data: sc } = await deps.db
          .from("automation_scenes")
          .select("*")
          .in("video_id", videoIds)
          .order("idx", { ascending: true });
        scenes = sc ?? [];
      }
      const { data: steps } = await deps.db
        .from("automation_run_steps")
        .select("*")
        .eq("run_id", run.id)
        .order("created_at", { ascending: true });
      return { run, videos: videos ?? [], scenes, steps: steps ?? [] };
    },
  );

  // re-executa um run (cria um novo run a partir do mesmo workflow) — "retry"
  r.post(
    "/runs/:id/retry",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["automation"], description: "Re-executa (retry) um run", params: z.object({ id: z.string().min(1) }) },
    },
    async (req) => {
      const idemKey = req.headers["idempotency-key"] as string | undefined;
      if (idemKey) {
        const cached = await idemGet(deps, req.auth!.orgId, idemKey);
        if (cached) return cached;
      }
      const { data: run } = await deps.db
        .from("automation_runs")
        .select("id, workflow_id")
        .eq("id", req.params.id)
        .eq("org_id", req.auth!.orgId)
        .maybeSingle();
      if (!run) throw httpError(404, "Run não encontrado");
      const wf = await load(req.auth!.orgId, run.workflow_id);
      if (!wf) throw httpError(404, "Workflow não encontrado");
      const c = compileWorkflow(wf.id, wf.graph as unknown as AutomationGraph);
      if (!c.ok) throw httpError(400, `Grafo inválido: ${c.errors.join(" | ")}`);
      await deps.db.from("automation_workflows").update({ compiled_plan: c.plan as unknown as Json }).eq("id", wf.id);

      const today = new Date().toISOString().slice(0, 10);
      const slot = `retry-${Date.now()}`;
      const runId = automationRunId(wf.id, today, slot);
      await deps.db.from("automation_runs").insert({
        id: runId,
        org_id: req.auth!.orgId,
        workflow_id: wf.id,
        run_date: today,
        slot,
        status: "queued",
      });
      await deps.queues.autoPlan.add("plan", { runId }, { jobId: toBullJobId(runId), attempts: 1 });
      logAudit(deps, { orgId: req.auth!.orgId, userId: req.auth!.userId, action: "automation.run_retry", entity: `run:${runId}`, meta: { retry_of: run.id } });
      const result = { run_id: runId };
      if (idemKey) await idemSet(deps, req.auth!.orgId, idemKey, result);
      return result;
    },
  );
}
