// Especificação dos campos de cada nó → renderiza um formulário NO-CODE inline
// dentro do nó (sem JSON). Espelha os schemas zod de @lsm/shared/automation.

import type { NodeType } from "@lsm/shared/automation";

export type FieldSpec =
  | { key: string; label: string; type: "text" | "textarea" | "color"; placeholder?: string; default?: string }
  | { key: string; label: string; type: "number"; min?: number; max?: number; default?: number }
  | { key: string; label: string; type: "slider"; min: number; max: number; step?: number; default?: number }
  | { key: string; label: string; type: "boolean"; default?: boolean }
  | { key: string; label: string; type: "select" | "radio"; options: Array<{ value: string; label: string }>; default?: string }
  | { key: string; label: string; type: "timeList"; default?: string[] }
  | { key: string; label: string; type: "stringList"; placeholder?: string; default?: string[] }
  | { key: string; label: string; type: "json"; default?: Record<string, unknown> }
  // selects alimentados por dados do editor (niche packs / personagens)
  | { key: string; label: string; type: "packSelect" | "characterSelect"; default?: string };

const ASPECT = [
  { value: "9:16", label: "9:16 (vertical)" },
  { value: "1:1", label: "1:1 (quadrado)" },
  { value: "16:9", label: "16:9 (horizontal)" },
];
const PROVIDER = [
  { value: "kie", label: "kie.ai" },
  { value: "magichour", label: "Magic Hour" },
];

// Modelos de imagem (kie.ai jobs/createTask) — IDs válidos do market da KIE
const IMAGE_MODELS_OPTS = [
  "nano-banana-pro",
  "qwen/image-to-image",
  "grok-imagine/image-to-image",
].map((m) => ({ value: m, label: m }));

// Modelos de vídeo — veo* usa o endpoint /veo/generate; demais o jobs/createTask
const VIDEO_MODELS_OPTS = [
  "veo3_fast",
  "veo3",
  "kling-2.6/text-to-video",
  "bytedance/seedance-2",
  "grok-imagine/image-to-video",
].map((m) => ({ value: m, label: m }));

// Modelos LLM (OpenAI) disponíveis para os agentes da automação.
const OPENAI_MODELS = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "chatgpt-4o-latest",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-16k",
  "o1",
  "o1-mini",
  "o3",
  "o3-mini",
  "o4-mini",
].map((m) => ({ value: m, label: m }));

export const NODE_FIELDS: Record<NodeType, FieldSpec[]> = {
  Schedule: [
    { key: "post_times", label: "Horários de publicação", type: "timeList", default: ["09:00", "18:00"] },
    { key: "lead_time_min", label: "Gerar quantos min antes", type: "number", min: 0, max: 720, default: 20 },
    { key: "timezone", label: "Fuso horário", type: "text", default: "America/Sao_Paulo" },
  ],
  GetAccounts: [
    { key: "videos_per_account", label: "Vídeos por conta/dia", type: "slider", min: 1, max: 20, default: 1 },
    { key: "only_connected", label: "Só contas conectadas", type: "boolean", default: true },
  ],
  GetCharacter: [{ key: "character_id", label: "Personagem", type: "characterSelect" }],
  GetNichePack: [{ key: "niche_pack_id", label: "Niche pack", type: "packSelect", default: "fazenda-ugc" }],
  LoopAccounts: [{ key: "max_inflight", label: "Máx. simultâneo", type: "number", min: 1, max: 50 }],
  If: [{ key: "expression", label: "Condição", type: "text", placeholder: "ex.: status == 'ok'" }],
  Switch: [
    { key: "on", label: "Avaliar campo", type: "text" },
    { key: "cases", label: "Casos", type: "stringList", placeholder: "a, b, c" },
  ],
  Wait: [{ key: "seconds", label: "Esperar (s)", type: "number", min: 1, max: 86400, default: 30 }],
  Merge: [
    { key: "mode", label: "Modo", type: "radio", options: [
      { value: "wait_all", label: "Esperar todos" },
      { value: "first", label: "Primeiro" },
    ], default: "wait_all" },
  ],
  DirectorAgent: [
    { key: "system_prompt", label: "Prompt do agente (roteiro)", type: "textarea", placeholder: "Você é um roteirista… Variáveis: {{ $niche }} {{ $account.display_name }} {{ $character.name }} {{ $today }}", default: "" },
    { key: "num_scenes", label: "Número de cenas", type: "slider", min: 1, max: 12, default: 1 },
    { key: "llm_model", label: "Modelo LLM (OpenAI)", type: "select", options: OPENAI_MODELS, default: "gpt-4.1" },
    // tratamento de erros (estilo n8n) — vale para todo o pipeline do run
    { key: "on_error", label: "Em caso de erro", type: "radio", options: [
      { value: "stop", label: "Parar" },
      { value: "continue", label: "Continuar (best-effort)" },
    ], default: "stop" },
    { key: "max_tries", label: "Tentativas (retry)", type: "slider", min: 1, max: 5, default: 2 },
    { key: "retry_wait_s", label: "Espera entre tentativas (s)", type: "slider", min: 0, max: 60, default: 5 },
  ],
  HookSelector: [
    { key: "strategy", label: "Estratégia", type: "radio", options: [
      { value: "rotation", label: "Rotação" },
      { value: "random", label: "Aleatório" },
    ], default: "rotation" },
    { key: "lang", label: "Idioma (opcional)", type: "text", placeholder: "pt-BR" },
  ],
  CaptionAgent: [
    { key: "system_prompt", label: "Prompt da legenda", type: "textarea", placeholder: "Variáveis: {{ $niche }} {{ $account.display_name }} {{ $today }}", default: "" },
    { key: "llm_model", label: "Modelo LLM (OpenAI)", type: "select", options: OPENAI_MODELS, default: "gpt-4.1" },
    { key: "max_len", label: "Tamanho máx.", type: "number", min: 1, max: 2200, default: 2200 },
  ],
  SafetyFilter: [{ key: "banned_terms", label: "Termos banidos", type: "stringList", placeholder: "celebrity, real person" }],
  SceneImage: [
    { key: "provider", label: "Provider", type: "select", options: PROVIDER, default: "kie" },
    { key: "model", label: "Modelo", type: "select", options: IMAGE_MODELS_OPTS, default: "nano-banana-pro" },
    { key: "aspect_ratio", label: "Proporção", type: "select", options: ASPECT, default: "9:16" },
  ],
  VideoGen: [
    { key: "provider", label: "Provider", type: "select", options: PROVIDER, default: "kie" },
    { key: "model", label: "Modelo", type: "select", options: VIDEO_MODELS_OPTS, default: "veo3_fast" },
    { key: "duration_per_scene", label: "Duração por cena (s)", type: "slider", min: 2, max: 60, default: 8 },
    { key: "aspect_ratio", label: "Proporção", type: "select", options: ASPECT, default: "9:16" },
  ],
  Stitch: [
    { key: "mode", label: "Modo", type: "radio", options: [
      { value: "montage", label: "Montagem (xfade)" },
      { value: "monologue", label: "Contínuo" },
    ], default: "montage" },
    { key: "best_effort", label: "Best-effort (segue se faltar cena)", type: "boolean", default: true },
  ],
  AddMusic: [
    { key: "track_url", label: "URL da música", type: "text", placeholder: "https://…" },
    { key: "volume", label: "Volume", type: "slider", min: 0, max: 1, step: 0.05, default: 0.2 },
  ],
  AddCaptions: [{ key: "style", label: "Estilo", type: "text", default: "default" }],
  Trim: [{ key: "duration_sec", label: "Cortar em (s)", type: "number", min: 1, max: 600, default: 30 }],
  SupabaseGet: [
    { key: "table", label: "Tabela", type: "text" },
    { key: "filters", label: "Filtros", type: "json", default: {} },
  ],
  SupabaseCreate: [
    { key: "table", label: "Tabela", type: "text" },
    { key: "values", label: "Valores", type: "json", default: {} },
  ],
  SupabaseUpdate: [
    { key: "table", label: "Tabela", type: "text" },
    { key: "match", label: "Match", type: "json", default: {} },
    { key: "values", label: "Valores", type: "json", default: {} },
  ],
  SetCode: [{ key: "code", label: "Código", type: "textarea", placeholder: "return {...}" }],
  PublishTikTok: [
    { key: "privacy_level", label: "Privacidade", type: "select", options: [
      { value: "PUBLIC_TO_EVERYONE", label: "Público" },
      { value: "MUTUAL_FOLLOW_FRIENDS", label: "Amigos" },
      { value: "FOLLOWER_OF_CREATOR", label: "Seguidores" },
      { value: "SELF_ONLY", label: "Só eu" },
    ], default: "PUBLIC_TO_EVERYONE" },
  ],
  SaveLibrary: [],
  Notify: [
    { key: "channel", label: "Canal", type: "select", options: [
      { value: "in_app", label: "No app" },
      { value: "email", label: "E-mail" },
      { value: "webhook", label: "Webhook" },
    ], default: "in_app" },
    { key: "message", label: "Mensagem", type: "textarea" },
  ],
};

/** ícone e cor por categoria (visual do designer) */
export const NODE_ICON: Record<string, string> = {
  trigger: "⏰",
  flow: "🔀",
  ai: "✨",
  media: "🎬",
  data: "🗄️",
  output: "📤",
};

/** nós que existem na autoria mas ainda NÃO afetam a execução (pipeline fixo) */
export const COMING_SOON_NODES: NodeType[] = ["If", "Switch", "Merge"];

export const CAT_COLOR: Record<string, string> = {
  trigger: "#3b82f6",
  flow: "#6b7280",
  ai: "#8b5cf6",
  media: "#d946ef",
  data: "#10b981",
  output: "#f59e0b",
};

/** config default de um nó a partir dos specs (no-code já preenchido) */
export function defaultConfig(type: NodeType): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of NODE_FIELDS[type] ?? []) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}
