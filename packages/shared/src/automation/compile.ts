// Compilador: grafo (autoria) → compiled_plan (execução) validado. Um grafo
// inválido é REJEITADO com erros claros — o runtime nunca interpreta grafo cru
// (princípio #3). Também extrai a AutomationRunConfig usada pelo motor.

import type { AutomationGraph, CompiledPlan, CompiledStep, NodeType } from "./types.js";
import { NODE_CONFIG_SCHEMAS, runConfigSchema } from "./schemas.js";

export interface CompileScheduleInfo {
  timezone: string;
  post_times: string[];
  lead_time_min: number;
}

export type CompileResult =
  | { ok: true; plan: CompiledPlan; schedule: CompileScheduleInfo }
  | { ok: false; errors: string[] };

function configOf(graph: AutomationGraph, type: NodeType): Record<string, unknown> | null {
  const node = graph.nodes.find((n) => n.type === type);
  return node ? node.config : null;
}

/** compila o grafo de um workflow para um plano executável validado */
export function compileWorkflow(workflowId: string, graph: AutomationGraph): CompileResult {
  const errors: string[] = [];
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const ids = new Set(nodes.map((n) => n.id));

  if (nodes.length === 0) errors.push("Grafo vazio.");

  // gatilho obrigatório
  const schedules = nodes.filter((n) => n.type === "Schedule");
  if (schedules.length === 0) errors.push("Falta o nó gatilho 'Schedule'.");
  if (schedules.length > 1) errors.push("Mais de um nó 'Schedule' (use apenas um gatilho).");

  // valida config de cada nó
  for (const n of nodes) {
    const schema = NODE_CONFIG_SCHEMAS[n.type];
    if (!schema) {
      errors.push(`Nó '${n.id}': tipo desconhecido '${n.type}'.`);
      continue;
    }
    const r = schema.safeParse(n.config);
    if (!r.success) {
      const msg = r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ");
      errors.push(`Nó '${n.label ?? n.id}' (${n.type}) inválido: ${msg}`);
    }
  }

  // arestas referenciam nós existentes
  for (const e of edges) {
    if (!ids.has(e.source)) errors.push(`Aresta '${e.id}': origem '${e.source}' não existe.`);
    if (!ids.has(e.target)) errors.push(`Aresta '${e.id}': destino '${e.target}' não existe.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  // ── monta os passos (next por porta de saída) ──
  const steps: Record<string, CompiledStep> = {};
  for (const n of nodes) steps[n.id] = { id: n.id, type: n.type, config: n.config, next: {} };
  for (const e of edges) {
    const handle = e.sourceHandle ?? "default";
    (steps[e.source]!.next[handle] ??= []).push(e.target);
  }

  // ── extrai a config de execução do grafo ──
  const sched = configOf(graph, "Schedule") ?? {};
  const accounts = configOf(graph, "GetAccounts") ?? {};
  const director = configOf(graph, "DirectorAgent") ?? {};
  const caption = configOf(graph, "CaptionAgent") ?? {};
  const sceneImage = configOf(graph, "SceneImage") ?? {};
  const videoGen = configOf(graph, "VideoGen") ?? {};
  const stitch = configOf(graph, "Stitch") ?? {};
  const publish = configOf(graph, "PublishTikTok") ?? {};
  const character = configOf(graph, "GetCharacter") ?? {};
  const nichePack = configOf(graph, "GetNichePack") ?? {};

  const runConfig = runConfigSchema.parse({
    niche_pack_id: (nichePack as { niche_pack_id?: string }).niche_pack_id,
    character_id: (character as { character_id?: string }).character_id,
    account_ids: (accounts as { account_ids?: string[] }).account_ids ?? [],
    videos_per_account: (accounts as { videos_per_account?: number }).videos_per_account ?? 1,
    num_scenes: (director as { num_scenes?: number }).num_scenes ?? 1,
    duration_per_scene: (videoGen as { duration_per_scene?: number }).duration_per_scene ?? 8,
    image_model: (sceneImage as { model?: string }).model ?? "google/nano-banana",
    video_model: (videoGen as { model?: string }).model ?? "veo3_fast",
    director_prompt: (director as { system_prompt?: string }).system_prompt ?? "",
    caption_prompt: (caption as { system_prompt?: string }).system_prompt ?? "",
    llm_model:
      (director as { llm_model?: string }).llm_model ??
      (caption as { llm_model?: string }).llm_model ??
      "gpt-4.1",
    stitch_mode: (stitch as { mode?: "montage" | "monologue" }).mode ?? "montage",
    best_effort_stitch: (stitch as { best_effort?: boolean }).best_effort ?? true,
    privacy_level: (publish as { privacy_level?: string }).privacy_level ?? "PUBLIC_TO_EVERYONE",
    on_error: (director as { on_error?: "stop" | "continue" }).on_error ?? "stop",
    max_tries: (director as { max_tries?: number }).max_tries ?? 2,
    retry_wait_s: (director as { retry_wait_s?: number }).retry_wait_s ?? 5,
  });

  const scheduleParsed = NODE_CONFIG_SCHEMAS.Schedule.parse(sched);
  const plan: CompiledPlan = {
    version: 1,
    workflowId,
    entry: schedules[0]!.id,
    steps,
    config: runConfig,
  };
  return {
    ok: true,
    plan,
    schedule: {
      timezone: scheduleParsed.timezone,
      post_times: scheduleParsed.post_times,
      lead_time_min: scheduleParsed.lead_time_min,
    },
  };
}
