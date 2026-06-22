// Catálogo de modelos de IA da kie.ai expostos no Estúdio de Conteúdo.
// `kieModel` = identificador enviado em POST /jobs/createTask (model).
// `credits`  = custo JÁ EM CRÉDITOS LSM (custo kie + markup oculto).
//   ⚠️ Os números abaixo são PLACEHOLDERS — ajuste depois de fechar a planilha
//   de custo da kie.ai. A taxa fica em CREDIT_MARKUP no backend (não no cliente).

export type AiKind = "image" | "video";
/** backend de geração: kie.ai ou fal.ai */
export type AiProvider = "kie" | "fal";

export interface AiModel {
  id: string;
  /** id do modelo no provider (enviado no POST /generations como `model`) */
  kieModel: string;
  /** provider que processa a geração (default kie) */
  backend?: AiProvider;
  label: string;
  provider: string;
  kind: AiKind;
  /** custo base em créditos LSM por geração (vídeo: já considerando a duração base) */
  credits: number;
  /** vídeo: créditos por segundo adicional acima da duração base */
  creditsPerExtraSecond?: number;
  durations?: number[];
  aspectRatios?: string[];
  supportsImageInput?: boolean;
  note?: string;
}

const ASPECTS = ["9:16", "1:1", "16:9"];

export const AI_MODELS: AiModel[] = [
  // ───────── imagem ─────────
  {
    id: "nano-banana",
    kieModel: "google/nano-banana",
    label: "Nano Banana (Google)",
    provider: "Google",
    kind: "image",
    credits: 4,
    aspectRatios: ASPECTS,
    supportsImageInput: true,
    note: "Rápido e barato — bom para cenas em lote.",
  },
  {
    id: "flux-2",
    kieModel: "flux-2",
    label: "Flux 2",
    provider: "Black Forest Labs",
    kind: "image",
    credits: 6,
    aspectRatios: ASPECTS,
  },
  {
    id: "imagen-4",
    kieModel: "google/imagen-4",
    label: "Imagen 4 (Google)",
    provider: "Google",
    kind: "image",
    credits: 8,
    aspectRatios: ASPECTS,
  },
  {
    id: "ideogram-v3",
    kieModel: "ideogram/v3",
    label: "Ideogram v3",
    provider: "Ideogram",
    kind: "image",
    credits: 7,
    aspectRatios: ASPECTS,
    note: "Forte com texto dentro da imagem.",
  },
  {
    id: "qwen-image",
    kieModel: "qwen/image",
    label: "Qwen Image",
    provider: "Alibaba",
    kind: "image",
    credits: 5,
    aspectRatios: ASPECTS,
  },
  {
    id: "recraft-v3",
    kieModel: "recraft/v3",
    label: "Recraft v3",
    provider: "Recraft",
    kind: "image",
    credits: 7,
    aspectRatios: ASPECTS,
  },

  // ───────── vídeo ─────────
  {
    id: "veo3-fast",
    kieModel: "veo3_fast",
    label: "Veo 3 Fast (Google)",
    provider: "Google",
    kind: "video",
    credits: 90,
    creditsPerExtraSecond: 10,
    durations: [4, 6, 8],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
    note: "Melhor custo-benefício com áudio.",
  },
  {
    id: "veo3",
    kieModel: "veo3",
    label: "Veo 3 (Google)",
    provider: "Google",
    kind: "video",
    credits: 160,
    creditsPerExtraSecond: 18,
    durations: [4, 6, 8],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
    note: "Qualidade máxima.",
  },
  {
    id: "sora2",
    kieModel: "sora2",
    label: "Sora 2 (OpenAI)",
    provider: "OpenAI",
    kind: "video",
    credits: 140,
    durations: [4, 8, 12],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "kling-v2",
    kieModel: "kling/v2",
    label: "Kling 2",
    provider: "Kuaishou",
    kind: "video",
    credits: 70,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "seedance",
    kieModel: "bytedance/seedance-v1-pro",
    label: "Seedance v1 Pro",
    provider: "ByteDance",
    kind: "video",
    credits: 60,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "hailuo",
    kieModel: "minimax/hailuo-02",
    label: "Hailuo 02 (MiniMax)",
    provider: "MiniMax",
    kind: "video",
    credits: 65,
    durations: [6, 10],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },

  // ───────── vídeo · fal.ai ─────────
  {
    id: "fal-kling-21",
    kieModel: "fal-ai/kling-video/v2.1/standard/text-to-video",
    backend: "fal",
    label: "Kling 2.1 Std (fal)",
    provider: "fal.ai · Kuaishou",
    kind: "video",
    credits: 52,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
    note: "Provider fal.ai — bom custo p/ teste.",
  },
  {
    id: "fal-kling-21-pro",
    kieModel: "fal-ai/kling-video/v2.1/pro/text-to-video",
    backend: "fal",
    label: "Kling 2.1 Pro (fal)",
    provider: "fal.ai · Kuaishou",
    kind: "video",
    credits: 104,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "fal-veo3-fast",
    kieModel: "fal-ai/veo3/fast",
    backend: "fal",
    label: "Veo 3 Fast (fal)",
    provider: "fal.ai · Google",
    kind: "video",
    credits: 91,
    durations: [4, 6, 8],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "fal-hailuo",
    kieModel: "fal-ai/minimax/hailuo-02/standard/text-to-video",
    backend: "fal",
    label: "Hailuo 02 (fal)",
    provider: "fal.ai · MiniMax",
    kind: "video",
    credits: 59,
    durations: [6, 10],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
];

export const IMAGE_MODELS = AI_MODELS.filter((m) => m.kind === "image");
export const VIDEO_MODELS = AI_MODELS.filter((m) => m.kind === "video");

export function getModel(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/** estimativa de créditos para uma geração (considera duração no vídeo) */
export function estimateCredits(model: AiModel, durationSec?: number): number {
  if (model.kind === "image" || !durationSec || !model.creditsPerExtraSecond) {
    return model.credits;
  }
  const base = model.durations?.[0] ?? durationSec;
  const extra = Math.max(0, durationSec - base);
  return model.credits + extra * model.creditsPerExtraSecond;
}
