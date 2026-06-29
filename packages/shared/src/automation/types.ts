// Motor de Automações de Conteúdo IA — contratos de AUTORIA (grafo) e
// EXECUÇÃO (compiled_plan). O runtime executa o compiled_plan validado,
// nunca interpreta um grafo arbitrário (princípio #3).

// ───────────────────────── tipos de nó ─────────────────────────
export const NODE_TYPES = [
  // gatilho / fontes
  "Schedule",
  "GetAccounts",
  "GetCharacter",
  "GetNichePack",
  // controle de fluxo
  "LoopAccounts",
  "If",
  "Switch",
  "Wait",
  "Merge",
  // agentes / IA
  "DirectorAgent",
  "HookSelector",
  "CaptionAgent",
  "SafetyFilter",
  // mídia
  "SceneImage",
  "VideoGen",
  "Stitch",
  "AddMusic",
  "AddCaptions",
  "Trim",
  // dados / utilitários
  "SupabaseGet",
  "SupabaseCreate",
  "SupabaseUpdate",
  "SetCode",
  // saída
  "PublishTikTok",
  "SaveLibrary",
  "Notify",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/** categoria de cada nó — usada pela paleta do designer (Fase 6) */
export const NODE_CATEGORY: Record<NodeType, "trigger" | "flow" | "ai" | "media" | "data" | "output"> = {
  Schedule: "trigger",
  GetAccounts: "trigger",
  GetCharacter: "trigger",
  GetNichePack: "trigger",
  LoopAccounts: "flow",
  If: "flow",
  Switch: "flow",
  Wait: "flow",
  Merge: "flow",
  DirectorAgent: "ai",
  HookSelector: "ai",
  CaptionAgent: "ai",
  SafetyFilter: "ai",
  SceneImage: "media",
  VideoGen: "media",
  Stitch: "media",
  AddMusic: "media",
  AddCaptions: "media",
  Trim: "media",
  SupabaseGet: "data",
  SupabaseCreate: "data",
  SupabaseUpdate: "data",
  SetCode: "data",
  PublishTikTok: "output",
  SaveLibrary: "output",
  Notify: "output",
};

// ───────────────────────── grafo (autoria) ─────────────────────────
export interface GraphNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  /** config específica do nó — validada pelo schema zod do NodeType */
  config: Record<string, unknown>;
  label?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** porta de saída (ex.: "true"/"false" no If, "default" caso único) */
  sourceHandle?: string;
  targetHandle?: string;
}

export interface AutomationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta?: Record<string, unknown>;
}

// ───────────────────────── plano compilado (execução) ─────────────────────────
export interface CompiledStep {
  id: string;
  type: NodeType;
  /** config já validada (schema do NodeType) */
  config: Record<string, unknown>;
  /** próximos passos por porta de saída ("default" quando única) */
  next: Record<string, string[]>;
}

export interface CompiledPlan {
  /** versão do formato do plano (para migração futura) */
  version: number;
  workflowId: string;
  /** id do passo de entrada (o gatilho Schedule) */
  entry: string;
  steps: Record<string, CompiledStep>;
  /** config de execução extraída do grafo (lida pelo runtime) */
  config?: AutomationRunConfig;
  /** hash do grafo de origem — invalida cache de execução ao mudar */
  graphHash?: string;
}

// ───────────────────────── config de execução de um workflow ─────────────────────────
// Até o compilador da Fase 6, vive em automation_workflows.compiled_plan.config.
// O compilador (Fase 6) gera isto a partir do grafo.
export interface AutomationRunConfig {
  niche_pack_id?: string;
  character_id?: string;
  /** contas-alvo; vazio = todas as conectadas do client/org */
  account_ids: string[];
  videos_per_account: number;
  num_scenes: number;
  duration_per_scene: number;
  /** o motor usa kie (callback). Magic Hour fica no estúdio avulso. */
  scene_provider: "kie";
  image_model: string;
  video_model: string;
  director_prompt: string;
  caption_prompt: string;
  /** modelo LLM (OpenAI) usado pelos agentes diretor/legenda */
  llm_model: string;
  stitch_mode: "montage" | "monologue";
  best_effort_stitch: boolean;
  privacy_level: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  /** créditos por cena (custo bruto kie × markup, calculado no servidor) */
  credits_per_scene: number;
  /** em caso de erro: parar o vídeo ou seguir (best-effort) */
  on_error: "stop" | "continue";
  /** tentativas por chamada de provider (retry com backoff) */
  max_tries: number;
  /** espera base entre tentativas (s) — backoff exponencial */
  retry_wait_s: number;
}

// ───────────────────────── status de runtime ─────────────────────────
export const WORKFLOW_STATUSES = ["draft", "active", "paused"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const RUN_STATUSES = ["queued", "planning", "running", "partial", "done", "failed", "skipped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const VIDEO_STATUSES = [
  "queued",
  "scripting",
  "rendering_scenes",
  "stitching",
  "publishing",
  "published",
  "failed",
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const SCENE_STATUSES = ["queued", "image", "video", "done", "failed"] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];
