// Schemas zod de configuração por NodeType. O compilador (Fase 6) valida cada
// nó com o schema correspondente antes de gerar o compiled_plan; um nó inválido
// derruba a compilação com erro claro (princípio #3).

import { z } from "zod";
import { NODE_TYPES, type NodeType } from "./types.js";

const aspect = z.enum(["9:16", "1:1", "16:9"]).default("9:16");
const provider = z.enum(["magichour", "kie"]);

// ───────────────────────── config por nó ─────────────────────────
export const NODE_CONFIG_SCHEMAS = {
  // ── trigger / fontes ──
  Schedule: z.object({
    timezone: z.string().default("America/Sao_Paulo"),
    post_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
    lead_time_min: z.coerce.number().int().min(0).max(720).default(20),
  }),
  GetAccounts: z.object({
    client_id: z.string().uuid().optional(),
    account_ids: z.array(z.string().uuid()).optional(),
    only_connected: z.boolean().default(true),
    videos_per_account: z.coerce.number().int().min(1).max(20).default(1),
  }),
  GetCharacter: z.object({ character_id: z.string().uuid() }),
  GetNichePack: z.object({ niche_pack_id: z.string() }),

  // ── controle de fluxo ──
  LoopAccounts: z.object({ max_inflight: z.coerce.number().int().min(1).max(50).optional() }),
  If: z.object({ expression: z.string().min(1) }),
  Switch: z.object({ on: z.string().min(1), cases: z.array(z.string()).min(1) }),
  Wait: z.object({ seconds: z.coerce.number().int().min(1).max(86_400) }),
  Merge: z.object({ mode: z.enum(["wait_all", "first"]).default("wait_all") }),

  // ── agentes / IA ──
  DirectorAgent: z.object({
    llm_model: z.string().default("google/gemini-2.5-flash"),
    system_prompt: z.string().min(1).max(8000),
    num_scenes: z.coerce.number().int().min(1).max(12).optional(),
    words_per_beat: z.coerce.number().int().min(8).max(40).default(22),
  }),
  HookSelector: z.object({
    strategy: z.enum(["rotation", "random"]).default("rotation"),
    lang: z.string().optional(),
  }),
  CaptionAgent: z.object({
    llm_model: z.string().default("google/gemini-2.5-flash"),
    system_prompt: z.string().min(1).max(8000),
    max_len: z.coerce.number().int().min(1).max(2200).default(2200),
  }),
  SafetyFilter: z.object({
    banned_terms: z.array(z.string()).default([]),
    replacements: z.record(z.string(), z.string()).default({}),
  }),

  // ── mídia ──
  SceneImage: z.object({
    provider,
    model: z.string().min(1),
    aspect_ratio: aspect,
  }),
  VideoGen: z.object({
    provider,
    model: z.string().min(1),
    duration_per_scene: z.coerce.number().int().min(2).max(60).default(8),
    aspect_ratio: aspect,
    use_first_scene_as_ref: z.boolean().default(true),
  }),
  Stitch: z.object({
    mode: z.enum(["montage", "monologue"]).default("montage"),
    transition: z.enum(["none", "xfade", "acrossfade"]).default("xfade"),
    best_effort: z.boolean().default(true),
  }),
  AddMusic: z.object({
    track_url: z.string().url().optional(),
    volume: z.coerce.number().min(0).max(1).default(0.2),
  }),
  AddCaptions: z.object({ style: z.string().default("default") }),
  Trim: z.object({ duration_sec: z.coerce.number().int().min(1).max(600) }),

  // ── dados / utilitários ──
  SupabaseGet: z.object({ table: z.string().min(1), filters: z.record(z.string(), z.unknown()).default({}) }),
  SupabaseCreate: z.object({ table: z.string().min(1), values: z.record(z.string(), z.unknown()) }),
  SupabaseUpdate: z.object({
    table: z.string().min(1),
    match: z.record(z.string(), z.unknown()),
    values: z.record(z.string(), z.unknown()),
  }),
  SetCode: z.object({ code: z.string().max(20_000) }),

  // ── saída ──
  PublishTikTok: z.object({
    privacy_level: z
      .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"])
      .default("PUBLIC_TO_EVERYONE"),
  }),
  SaveLibrary: z.object({}),
  Notify: z.object({
    channel: z.enum(["email", "webhook", "in_app"]).default("in_app"),
    message: z.string().max(2000).default(""),
  }),
} satisfies Record<NodeType, z.ZodTypeAny>;

export type NodeConfigSchemas = typeof NODE_CONFIG_SCHEMAS;

/** schema da config de execução (AutomationRunConfig) que vive no compiled_plan */
export const runConfigSchema = z.object({
  niche_pack_id: z.string().optional(),
  character_id: z.string().uuid().optional(),
  account_ids: z.array(z.string().uuid()).default([]),
  videos_per_account: z.coerce.number().int().min(1).max(20).default(1),
  num_scenes: z.coerce.number().int().min(1).max(12).default(1),
  duration_per_scene: z.coerce.number().int().min(2).max(60).default(8),
  scene_provider: z.literal("kie").default("kie"),
  image_model: z.string().default("nano-banana-pro"),
  video_model: z.string().default("veo3_fast"),
  director_prompt: z.string().default(""),
  caption_prompt: z.string().default(""),
  llm_model: z.string().default("gpt-4.1"),
  stitch_mode: z.enum(["montage", "monologue"]).default("montage"),
  best_effort_stitch: z.boolean().default(true),
  privacy_level: z
    .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"])
    .default("PUBLIC_TO_EVERYONE"),
  credits_per_scene: z.coerce.number().int().min(0).default(0),
  // ── tratamento de erros (estilo n8n) ──
  on_error: z.enum(["stop", "continue"]).default("stop"),
  max_tries: z.coerce.number().int().min(1).max(5).default(2),
  retry_wait_s: z.coerce.number().int().min(0).max(120).default(5),
});

/** lê a config de run do compiled_plan do workflow (com defaults) */
export function readRunConfig(compiledPlan: unknown): z.infer<typeof runConfigSchema> {
  const cp = (compiledPlan ?? {}) as { config?: unknown };
  return runConfigSchema.parse(cp.config ?? {});
}

/** valida a config de um nó; lança se o NodeType for desconhecido */
export function validateNodeConfig(
  type: NodeType,
  config: unknown,
): z.SafeParseReturnType<unknown, unknown> {
  const schema = NODE_CONFIG_SCHEMAS[type];
  if (!schema) throw new Error(`NodeType desconhecido: ${type}`);
  return schema.safeParse(config);
}

/** garante (em runtime) que existe schema p/ todo NodeType declarado */
export function assertSchemasComplete(): void {
  for (const t of NODE_TYPES) {
    if (!NODE_CONFIG_SCHEMAS[t]) throw new Error(`falta schema para o NodeType ${t}`);
  }
}
