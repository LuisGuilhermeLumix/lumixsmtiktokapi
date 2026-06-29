// Executor de grafo "de verdade" (estilo n8n): percorre o grafo seguindo as
// arestas, executa cada nó e PASSA o resultado (items) adiante. Suporta
// ramificação (If→true/false, Switch→portas) e junção (Merge, indegree>1).
//
// Modelo de dados: tudo é um array de items `[{ json: {...} }]` (princípio #1).
// O núcleo é PURO: os executores reais (provider, db) são injetados via registry.

import type { CompiledPlan, CompiledStep, NodeType } from "./types.js";

export interface DataItem {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}
export type Items = DataItem[];

/** saída de um nó: ou uma única porta, ou várias (ramificação) */
export type NodeOutput = Items | { ports: Items[] };

export interface NodeRunContext {
  /** config de execução do run (AutomationRunConfig) */
  config: unknown;
  /** serviços injetados pelo worker (provider, db, deps…) */
  services: Record<string, unknown>;
  /** log de etapa (alimenta o inspetor e a animação) */
  log: (nodeId: string, status: "started" | "done" | "failed", meta?: Record<string, unknown>) => Promise<void>;
}

export type NodeExecutor = (node: CompiledStep, input: Items, ctx: NodeRunContext) => Promise<NodeOutput>;
export type ExecutorRegistry = Partial<Record<NodeType, NodeExecutor>>;

export interface ExecuteResult {
  /** items de saída de cada nó executado */
  itemsByNode: Record<string, Items>;
  /** ordem real em que os nós rodaram */
  order: string[];
}

/** mapeia a porta de saída (sourceHandle) para um índice de output */
export function handleToPort(handle: string): number {
  if (handle === "false") return 1;
  if (/^\d+$/.test(handle)) return Number(handle);
  return 0; // "default" | "main" | "true"
}

const passthrough: NodeExecutor = async (_n, input) => input;

/** percorre o grafo a partir de `plan.entry`, passando items de nó em nó */
export async function executeGraph(
  plan: CompiledPlan,
  registry: ExecutorRegistry,
  ctx: NodeRunContext,
  triggerItems: Items = [{ json: {} }],
): Promise<ExecuteResult> {
  const steps = plan.steps;

  // indegree (nº de arestas que chegam em cada nó) — p/ junção (Merge)
  const indeg = new Map<string, number>();
  for (const id of Object.keys(steps)) indeg.set(id, 0);
  for (const s of Object.values(steps)) {
    for (const targets of Object.values(s.next)) {
      for (const t of targets) indeg.set(t, (indeg.get(t) ?? 0) + 1);
    }
  }

  const arrived = new Map<string, Items[]>(); // batches de entrada que chegaram
  const resolvedEdges = new Map<string, number>(); // arestas resolvidas (entregues OU podadas)
  const itemsByNode: Record<string, Items> = {};
  const ran = new Set<string>();
  const order: string[] = [];

  function bumpResolved(nodeId: string): boolean {
    const r = (resolvedEdges.get(nodeId) ?? 0) + 1;
    resolvedEdges.set(nodeId, r);
    return r >= (indeg.get(nodeId) ?? 0);
  }

  async function deliver(target: string, items: Items): Promise<void> {
    const list = arrived.get(target) ?? [];
    list.push(items);
    arrived.set(target, list);
    if (bumpResolved(target)) await runNode(target);
  }

  async function pruneEdge(target: string): Promise<void> {
    if (bumpResolved(target)) {
      if ((arrived.get(target)?.length ?? 0) > 0) await runNode(target);
      else await pruneDown(target); // ninguém entregou → o nó não roda; poda a jusante
    }
  }

  async function pruneDown(nodeId: string): Promise<void> {
    const step = steps[nodeId];
    if (!step) return;
    for (const targets of Object.values(step.next)) {
      for (const t of targets) await pruneEdge(t);
    }
  }

  async function runNode(nodeId: string): Promise<void> {
    if (ran.has(nodeId)) return; // cada nó roda no máximo 1x (corta ciclos)
    const step = steps[nodeId];
    if (!step) return;
    ran.add(nodeId);
    order.push(nodeId);

    const input = (arrived.get(nodeId) ?? [[]]).flat();
    const exec = registry[step.type] ?? passthrough;
    await ctx.log(nodeId, "started", { in: input.length });

    let out: NodeOutput;
    try {
      out = await exec(step, input, ctx);
    } catch (e) {
      await ctx.log(nodeId, "failed", { error: (e as Error).message.slice(0, 300) });
      throw e;
    }

    const ports: Items[] = Array.isArray(out) ? [out] : out.ports;
    itemsByNode[nodeId] = ports[0] ?? [];
    await ctx.log(nodeId, "done", { out: (ports[0] ?? []).length });

    // roteia por handle → porta; entrega quando há items, poda quando vazio
    for (const [handle, targets] of Object.entries(step.next)) {
      const portItems = ports[handleToPort(handle)] ?? [];
      for (const t of targets) {
        if (portItems.length > 0) await deliver(t, portItems);
        else await pruneEdge(t);
      }
    }
  }

  arrived.set(plan.entry, [triggerItems]);
  await runNode(plan.entry);
  return { itemsByNode, order };
}
